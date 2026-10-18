/* ============================================================
   BEYOND CRM — js/infra/SupabaseSync.js   v1.7
   Sincroniza dados do Supabase → Store (arrays locais).
   Todos os módulos existentes continuam funcionando sem mudança.
   Beyond Bits Tecnologia © 2026

   Histórico:
   - v1.0: versão original.
   - v1.1 (Pacote 1 v1.3.0): campos de arquivamento em leads.
   - v1.2 (Pacote 2 v1.4.0): _createdAt em leads (feature 4.10).
   - v1.3 (Pacote 2 v1.4.0): ordem_manual em leads (feature 4.6).
   - v1.4 (v1.5.0): notifications sync + audit_log + carteira_interacoes.
   - v1.5 (Sprint 6 / Patch 1 — 6.2/6.4):
     • carregarUsuarios: adiciona _filial_id (UUID) além do nome, pra
       permitir filtros por filial na Agenda/Histórico comparando com
       agendamentos._filial_id.
     • carregarAtividades: preserva _data_hora ISO original, pra habilitar
       filtro por período no HistoricoModule (antes só existiam strings
       formatadas pt-BR incomparáveis como Date).
   - v1.6 (Onda 1 pós-testes — Ticket #22 + classe stale):
     carregarLeads passa a atualizar in-place (Object.assign no
     objeto existente) em vez de recriar store.leads. Preserva
     referências (store.currentLead continua estável) e respeita
     `_pendingWrite` flag pra não sobrescrever campos que estão
     com UPDATE otimista in-flight. Ver comentário do método.
   - v1.7 (Onda 2 pós-testes — Ticket #8):
     carregarCurriculos adicionado. Antes o boot não puxava a tabela
     `curriculos`, deixando store.curriculos sempre vazio (dando
     ilusão de que os cadastros não persistiam). Mapeia colunas
     do banco para o shape que o CurriculoModule já espera
     (`exp` em vez de `experiencia`, id numérico + _uuid).
   ============================================================ */
'use strict';

class SupabaseSync {

  /* ── Inicialização principal ── */
  static async carregarTudo() {
    if (!supa) {
      SLog.warn('Supabase não disponível — app rodará sem dados do banco.');
      return false;
    }

    SLog.load('Iniciando sincronização com Supabase...');
    const inicio = Date.now();

    try {
      await SupabaseSync.carregarFiliais();
      await SupabaseSync.carregarUsuarios();
      await SupabaseSync.carregarTags();
      await SupabaseSync.carregarLeads();
      await SupabaseSync.carregarLigacoes();
      await SupabaseSync.carregarAgendamentos();
      await SupabaseSync.carregarVisitas();
      await SupabaseSync.carregarVendas();
      await SupabaseSync.carregarCarteiraInteracoes();
      await SupabaseSync.carregarCurriculos();
      await SupabaseSync.carregarAtividades();
      await SupabaseSync.carregarAuditLog();
      await SupabaseSync.carregarNotificacoes();
      await SupabaseSync.carregarMetaVersoes();   /* Chamado #34 */
      await SupabaseSync.carregarMetasConversao();/* Chamado #44 */

      const ms = Date.now() - inicio;
      SLog.info(`Sincronização concluída em ${ms}ms`);
      return true;
    } catch (err) {
      SLog.error('Erro na sincronização: ' + err.message);
      return false;
    }
  }

  /* ── Filiais ── */
  static async carregarFiliais() {
    const { data, error } = await supa.from('filiais').select('*');
    if (error) { SLog.error('filiais: ' + error.message); return; }
    if (data.length) {
      store.filiais = data.map(f => ({ id: f.id, nome: f.nome, local: f.local }));
      SLog.info(`filiais: ${data.length} carregadas`);
    } else {
      SLog.warn('filiais: tabela vazia (execute o seed)');
    }
  }

  /* ── Usuários (profiles) ── */
  static async carregarUsuarios() {
    const { data, error } = await supa.from('profiles').select('*, filiais(nome)');
    if (error) { SLog.error('profiles: ' + error.message); return; }
    if (data.length) {
      store.usuarios = data.map(u => ({
        nome: u.nome,
        sigla: u.sigla,
        filial: u.filiais?.nome || '—',
        /* Chamado #130 — quando a pessoa entrou na equipe. Necessário pra
           somar a meta de um ciclo passado apenas de quem JÁ EXISTIA
           naquele ciclo. Sem isso, especialista admitido depois entrava
           na soma histórica com a meta atual dele (Agosto aparecia com 87
           em vez de 66, os 21 a mais eram três admissões posteriores). */
        _created_at: u.created_at || null,
        /* v1.5 (Sprint 6 / Patch 1) — UUID da filial para filtros que
           precisam comparar por id (Agenda, Histórico). Antes só tínhamos
           o nome (u.filiais?.nome), suficiente pra display mas não pra
           relacionar com agendamentos._filial_id. */
        _filial_id: u.filial_id || null,
        perfil: u.perfil,
        status: u.status,
        meta_mensalidade: parseFloat(u.meta_mensalidade) || 0,
        meta_vendas: u.meta_vendas || 0,
        meta_super_vendas: u.meta_super_vendas || 0,   /* RN-17 */
        meta_power_vendas: u.meta_power_vendas || 0,   /* RN-17 */
        meta_king_vendas:  u.meta_king_vendas  || 0,   /* RN-17 */
        /* Chamado #51 — valor de mensalidade por degrau */
        meta_super_mensalidade: parseFloat(u.meta_super_mensalidade) || 0,
        meta_power_mensalidade: parseFloat(u.meta_power_mensalidade) || 0,
        meta_king_mensalidade:  parseFloat(u.meta_king_mensalidade)  || 0,
        email: u.email,
        avatar_url: '',
        _id: u.id,
        comissoes: { mes_atual: 0, meta_atingida: false, historico: [] },
      }));
      
      /* Carregar avatars do Storage */
      try {
        const avatarList = await supa.storage.from('avatars').list('');
        if (avatarList.data) {
          const avatarFiles = avatarList.data.map(f => f.name);
          store.usuarios.forEach(u => {
            if (avatarFiles.includes(u._id + '.png')) {
              u.avatar_url = supa.storage.from('avatars').getPublicUrl(u._id + '.png').data.publicUrl + '?t=' + Date.now();
            }
          });
        }
      } catch (e) { /* sem avatars, ignora */ }
      
      SLog.info(`profiles: ${data.length} usuários carregados`);
    } else {
      SLog.warn('profiles: nenhum usuário encontrado (crie via Auth + INSERT)');
    }
  }

  /* ── Tags ── */
  static async carregarTags() {
    const { data, error } = await supa.from('tags').select('*');
    if (error) { SLog.error('tags: ' + error.message); return; }
    if (data.length) {
      /* Atualiza TAG_CONFIG global para os módulos que usam */
      data.forEach(t => {
        TAG_CONFIG[t.slug] = { cls: t.cls, label: t.label };
      });
      store.tags = data.map(t => t.slug);
      SLog.info(`tags: ${data.length} carregadas`);
    } else {
      SLog.warn('tags: tabela vazia (execute o seed)');
    }
  }

  /* ── Leads (com tags) ──
     v1.6 (Onda 1 pós-testes — Ticket #22 e classe de bugs de
     Realtime stale): antes, `store.leads = data.map(...)` recriava
     TODA a coleção a cada reload. Consequências:
       • store.currentLead ficava apontando pro objeto ANTIGO,
         órfão do novo array — badges no modal aberto (tentativas,
         tags) não atualizavam mais.
       • Se um UPDATE otimista (ex.: tentativas++) ainda estivesse
         in-flight quando o Realtime disparasse o reload, o
         snapshot vinha stale e SOBRESCREVIA o valor local mais
         novo — o card do Kanban parecia "voltar no tempo".

     Agora: atualização in-place. Objetos existentes são
     atualizados com Object.assign; novos entram no array; leads
     removidos remotamente saem do array. As referências (incluindo
     store.currentLead) permanecem estáveis.

     A ordem original (por created_at DESC) é preservada usando o
     array `data` do banco como fonte da verdade da ordem.
     ── */
  /* Chamado #110 (reaberto) — só as ETAPAS de TODOS os leads (não
     excluídos), paginado. Usado pelos relatórios que replicam as
     regras do card "Visão do Funil": eles só precisam de `l.etapa`
     pra montar os cumulativos, e assim ficam corretos mesmo se
     store.leads bater no teto de 1000 do PostgREST (o cache de boot
     `carregarLeads` ainda não pagina — ver nota no README/chamado). */
  static async buscarLeadsEtapasCompleto() {
    const { data, error } = await SupabaseSync._paginarTudo((de, ate) =>
      supa.from('leads').select('etapa').is('deleted_at', null).order('created_at', { ascending: false }).range(de, ate)
    );
    if (error) { SLog.error('leads (etapas): ' + error.message); return null; }
    return (data || []).map(l => ({ etapa: l.etapa }));
  }

  static async carregarLeads() {
    const { data, error } = await supa
      .from('leads')
      .select('*, lead_tags(tag:tags(slug))')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) { SLog.error('leads: ' + error.message); return; }

    /* Índice do estado atual por UUID pra lookup O(1) */
    var idxLocal = {};
    store.leads.forEach(function(l) { if (l._uuid) idxLocal[l._uuid] = l; });

    var novoArray = [];
    data.forEach(function(l) {
      /* Monta o shape do que o banco entrega (sem o captador_nome/
         responsavel_nome, resolvidos depois). */
      var snapshot = {
        id: l.codigo,
        _uuid: l.id,
        nome: l.nome,
        tel: l.tel,
        fonte: l.fonte || '',
        captador_id: l.captador_id,
        /* v1.4 (Pacote 8 / T1) — responsável ATUAL do lead (pode diferir
           do captador se o lead foi transferido). */
        responsavel_id:   l.responsavel_id || l.captador_id || null,
        tags: (l.lead_tags || []).map(function(lt) { return lt.tag && lt.tag.slug; }).filter(Boolean),
        etapa: l.etapa,
        tentativas: l.tentativas || 0,
        obs: l.obs || '',
        placa: l.placa || '',
        fipe: l.fipe || '',
        mensalidadeEst: l.mensalidade_est || '',
        /* Chamado #84 — "Quem Indicou" é dado da etapa de entrada do
           lead. Precisa ser lido de volta do banco pra ser exibido
           (somente leitura) na aba Lead do modal de detalhe. Sem este
           mapeamento o campo vinha sempre vazio ao reabrir. */
        quemIndicou:    l.quem_indicou || '',
        dataVenda: l.data_venda || '',
        aniversario: l.aniversario || '',
        /* v1.1 — Arquivamento (Pacote 1 v1.3.0) */
        arquivado:     l.arquivado === true,
        arquivadoEm:   l.arquivado_em  || null,
        arquivadoPor:  l.arquivado_por || null,
        /* Chamado #83 — timestamp de entrada em carteira (preenchido
           pelo trigger trg_marcar_carteira_em). Usado pra recortar
           ligações feitas APÓS o lead virar associado (não contam no
           total de ligações). null = lead nunca entrou em carteira. */
        carteira_em:   l.carteira_em || null,
        /* v1.2 — Data de criação (Pacote 2 v1.4.0 / feature 4.10) */
        _createdAt:    l.created_at || null,
        /* v1.3 — Ordem manual (Pacote 2 v1.4.0 / feature 4.6) */
        ordem_manual:  l.ordem_manual != null ? Number(l.ordem_manual) : null,
        /* Onda 1 — timestamp do banco pra proteção anti-stale (ver abaixo) */
        _updatedAt:    l.updated_at || null,
        /* Chamado #33 — lead_pai_id: se preenchido, é clone de veículo
           adicional; usado pra excluir da base de "leads captados". */
        lead_pai_id:   l.lead_pai_id || null,
      };

      var existente = idxLocal[l.id];
      if (existente) {
        /* v1.6 — atualização in-place preserva referência de
           existente (store.currentLead pode estar apontando pra ele).

           Anti-stale defensivo: se o objeto local tem `_pendingWrite`
           flag setada pelo store (operação otimista in-flight), NÃO
           sobrescreve o campo afetado. A flag é limpa quando o
           UPDATE respectivo confirma no banco. Isso fecha a janela
           de race entre "adicionarLigacao dispara update de tentativas"
           e "Realtime dispara carregarLeads antes do UPDATE completar".

           Atribuições explícitas (não usa Object.keys/forEach) pra
           máxima compatibilidade com parsers de browser antigos e
           pra ler mais fácil quais campos estão sob proteção. */
        var pw = existente._pendingWrite || {};

        if (!pw.id)              existente.id = snapshot.id;
        if (!pw._uuid)           existente._uuid = snapshot._uuid;
        if (!pw.nome)            existente.nome = snapshot.nome;
        if (!pw.tel)             existente.tel = snapshot.tel;
        if (!pw.fonte)           existente.fonte = snapshot.fonte;
        if (!pw.captador_id)     existente.captador_id = snapshot.captador_id;
        if (!pw.responsavel_id)  existente.responsavel_id = snapshot.responsavel_id;
        if (!pw.tags)            existente.tags = snapshot.tags;
        if (!pw.etapa)           existente.etapa = snapshot.etapa;
        if (!pw.tentativas)      existente.tentativas = snapshot.tentativas;
        if (!pw.obs)             existente.obs = snapshot.obs;
        if (!pw.placa)           existente.placa = snapshot.placa;
        if (!pw.fipe)            existente.fipe = snapshot.fipe;
        if (!pw.mensalidadeEst)  existente.mensalidadeEst = snapshot.mensalidadeEst;
        if (!pw.dataVenda)       existente.dataVenda = snapshot.dataVenda;
        if (!pw.aniversario)     existente.aniversario = snapshot.aniversario;
        if (!pw.arquivado)       existente.arquivado = snapshot.arquivado;
        if (!pw.arquivadoEm)     existente.arquivadoEm = snapshot.arquivadoEm;
        if (!pw.arquivadoPor)    existente.arquivadoPor = snapshot.arquivadoPor;
        if (!pw._createdAt)      existente._createdAt = snapshot._createdAt;
        if (!pw.ordem_manual)    existente.ordem_manual = snapshot.ordem_manual;
        if (!pw._updatedAt)      existente._updatedAt = snapshot._updatedAt;
        if (!pw.lead_pai_id)     existente.lead_pai_id = snapshot.lead_pai_id;

        novoArray.push(existente);
      } else {
        /* Lead novo (veio do banco pela primeira vez) — insere shape completo */
        snapshot.captador = '';         /* preenchido no lookup abaixo */
        snapshot.responsavel_nome = '';
        novoArray.push(snapshot);
      }
    });

    /* Substitui o array preservando ordem do banco */
    store.leads.length = 0;
    for (var i = 0; i < novoArray.length; i++) store.leads.push(novoArray[i]);

    /* Resolver nomes dos captadores E responsáveis (v1.4 T1)
       Mantém sempre atualizado — se o usuário mudou de nome ou
       o captador foi trocado, o display reflete. */
    store.leads.forEach(function(l) {
      var cap = store.usuarios.find(function(u) { return u._id === l.captador_id; });
      l.captador = cap ? cap.nome : '—';
      var resp = store.usuarios.find(function(u) { return u._id === l.responsavel_id; });
      l.responsavel_nome = resp ? resp.nome : (l.captador || '—');
    });

    /* Se currentLead foi removido do banco, limpa a referência
       pra evitar operações num zumbi (raro, mas defesa em profundidade). */
    if (store.currentLead && store.currentLead._uuid) {
      var aindaExiste = store.leads.some(function(l) { return l._uuid === store.currentLead._uuid; });
      if (!aindaExiste) {
        SLog.warn('carregarLeads: currentLead ' + store.currentLead._uuid + ' sumiu do banco — desreferenciando');
        store.currentLead = null;
      }
    }

    /* Atualizar leadCounter */
    const { data: counter } = await supa.from('lead_counter').select('counter').eq('id', 1).single();
    if (counter) store.leadCounter = counter.counter;

    SLog.info('leads: ' + data.length + ' carregados in-place (counter: ' + store.leadCounter + ')');
  }

  /* ── Paginador ─────────────────────────────────────────────
     Chamados #111/#117 (reabertos) — o PostgREST/Supabase corta toda
     query em 1000 linhas por padrão, MESMO sem .limit() explícito.
     Então "buscar sem limite" na verdade trazia só as 1000 mais
     recentes. Este helper varre a tabela inteira em páginas de 1000
     via .range(), até vir um lote menor que 1000 (fim dos dados).
     `fazerQuery(de, ate)` deve devolver a Promise de uma query já
     com .range(de, ate) aplicado. */
  static async _paginarTudo(fazerQuery) {
    const TAM = 1000;
    let todas = [];
    let de = 0;
    for (;;) {
      const { data, error } = await fazerQuery(de, de + TAM - 1);
      if (error) return { data: null, error };
      const lote = data || [];
      todas = todas.concat(lote);
      if (lote.length < TAM) break;
      de += TAM;
    }
    return { data: todas, error: null };
  }

  /* ── Ligações ──────────────────────────────────────────────
     Chamado #112 — a query e o mapeamento viraram um helper único
     (`_buscarLigacoes`) parametrizado por limite, pra não duplicar a
     lógica entre o cache de boot (capado, rápido) e os relatórios
     (histórico completo). Ver `buscarLigacoesCompleto` abaixo.
     Chamados #111/#117 (reabertos) — sem limite agora significa
     PAGINAR a tabela inteira (o "sem limite" antigo parava em 1000). */
  static async _buscarLigacoes(limite) {
    const sel =
      '*, ' +
      'lead:leads!lead_id(id, codigo, nome, tel, etapa, deleted_at), ' +
      'especialista:profiles!especialista_id(id, nome, sigla)';
    const base = () => supa.from('ligacoes').select(sel).order('created_at', { ascending: false });

    let data, error;
    if (limite != null) {
      ({ data, error } = await base().limit(limite));
    } else {
      ({ data, error } = await SupabaseSync._paginarTudo((de, ate) => base().range(de, ate)));
    }
    if (error) { SLog.error('ligacoes: ' + error.message); return null; }

    /* Chamado #92 — mesmo padrão já usado em carregarVendas: descarta
       ligações cujo lead foi soft-deletado (deleted_at preenchido).
       ligacoes.lead_id tem ON DELETE CASCADE, mas o soft delete não
       apaga a linha — sem este filtro, ligações de um lead "excluído"
       continuavam contando em KPIs/relatórios locais (Contatos do
       Número Mágico quando há filtro de fonte, Taxa de Conversão
       etc.), mesmo o lead já não aparecendo em lugar nenhum da UI. */
    return (data || [])
      .filter(l => !(l.lead && l.lead.deleted_at))
      .map(l => {
      /* Prioriza data_hora (escolhida pelo especialista) sobre created_at (timestamp do banco) */
      const dt = new Date(l.data_hora || l.created_at);
      return {
        /* Campos no formato consumido por Modules.js / RelatoriosModule */
        lead:       l.lead?.nome || '—',
        tel:        l.lead?.tel  || '',
        resultado:  l.resultado  || '',
        tentativa:  l.tentativa_num || 0,
        esp:        l.especialista?.nome || '—',
        hora:       dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        data:       dt.toLocaleDateString('pt-BR').replace('/20', '/'),
        obs:        l.obs || '',
        /* Metadados úteis para futuros filtros / detalhes */
        _uuid:        l.id,
        _lead_uuid:   l.lead_id,
        _esp_id:      l.especialista_id,
        _lead_codigo: l.lead?.codigo || '',
        _lead_etapa:  l.lead?.etapa || '',
        _data_hora:   l.data_hora || null,
        _created_at:  l.created_at,
        tipo_contato: l.tipo_contato || '',
      };
    });
  }

  static async carregarLigacoes() {
    const mapeadas = await SupabaseSync._buscarLigacoes(200);
    if (mapeadas == null) return; /* erro já logado em _buscarLigacoes */
    store.ligacoes = mapeadas;
    SLog.info(`ligacoes: ${store.ligacoes.length} carregadas`);
  }

  /* Chamado #112 — relatórios (Excel) precisam do HISTÓRICO COMPLETO de
     ligações, não só as 200 mais recentes da empresa inteira que o
     cache de boot guarda (store.ligacoes). Busca direto do banco, sem
     limite, sem sobrescrever store.ligacoes (mantém o cache de boot
     leve pro resto do app — mesmo racional do chamado #104). Cai no
     cache local só se a query falhar (ex.: offline). */
  static async buscarLigacoesCompleto() {
    const todas = await SupabaseSync._buscarLigacoes(null);
    return todas != null ? todas : (store.ligacoes || []);
  }

  /* ── Agendamentos ──────────────────────────────────────
     Sincroniza os agendamentos do banco para store.agendamentos
     no formato consumido por AgendaModule._getEventosStore.
     Sem este sync, os agendamentos sumiam após F5 (mesmo
     problema que existia com ligações antes da Tarefa 1).
     Chamado #110 (reaberto) — virou helper parametrizado por limite,
     igual ligações/vendas/visitas: os relatórios que usam as regras
     do card "Visão do Funil" (Conversão p/ Próxima) precisam do
     histórico completo de agendamentos. Ver `buscarAgendamentosCompleto`. */
  static async _buscarAgendamentos(limite) {
    const sel =
      '*, ' +
      'lead:leads!lead_id(id, codigo, nome, tel, etapa, deleted_at), ' +
      'especialista:profiles!especialista_id(id, nome, sigla)';
    /* ════════════════════════════════════════════════════════════
       Chamado #125 — o cache de boot precisa trazer os agendamentos
       MAIS RECENTES, não os mais antigos.
       ════════════════════════════════════════════════════════════
       Com `ascending: true` + `limit`, o Postgres devolve os N
       agendamentos de data_hora mais ANTIGA da base. Enquanto a
       operação tinha menos de 500 linhas isso passava despercebido;
       passando desse volume, o cache do boot vira um retrato de 2025 e
       tudo que lê `store.agendamentos` fica cego pro presente:
         • FunilModule._agendamentoVigente não acha o agendamento do
           lead → o auto-avanço Agendamento→Visita nunca dispara (o
           sintoma que o cliente reportou);
         • KanbanCard não mostra o badge de data no card;
         • a Agenda (semana atual) aparece vazia.

       Com `limite`, ordenamos DESC (mais recentes primeiro) e depois
       reordenamos ASC no retorno, preservando o contrato de ordem
       crescente que os consumidores herdaram. A busca completa
       (`limite == null`) segue paginando em ASC — lá não há corte,
       então a ordem do fetch é indiferente. */
    const base = (asc) => supa.from('agendamentos').select(sel).order('data_hora', { ascending: asc });

    let data, error;
    if (limite != null) {
      ({ data, error } = await base(false).limit(limite));
    } else {
      ({ data, error } = await SupabaseSync._paginarTudo((de, ate) => base(true).range(de, ate)));
    }
    if (error) { SLog.error('agendamentos: ' + error.message); return null; }

    /* Reordena em ASC quando o fetch veio DESC (caminho com limite). */
    if (limite != null && Array.isArray(data)) {
      data = data.slice().sort(function(a, b) {
        return new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime();
      });
    }

    /* Chamado #92 — mesmo padrão de carregarVendas: descarta
       agendamentos cujo lead foi soft-deletado. Sem isso, um lead
       excluído continuava aparecendo como compromisso "fantasma" na
       Agenda e inflando contagens locais. */
    return (data || [])
      .filter(a => !(a.lead && a.lead.deleted_at))
      .map(a => {
      const espNome = a.especialista ? a.especialista.nome : '—';
      return {
        /* Campos consumidos por AgendaModule._getEventosStore */
        lead: a.lead ? {
          _uuid:    a.lead.id,
          id:       a.lead.codigo,
          nome:     a.lead.nome,
          tel:      a.lead.tel,
          captador: espNome,
        } : { nome: '—', tel: '', captador: espNome },
        nome:      a.lead ? a.lead.nome : '—',
        data:      a.data_hora,
        categoria: a.categoria_veiculo || '',
        local:     a.local_descricao || a.local_tipo || '',
        /* Metadados úteis */
        _uuid:       a.id,
        _lead_uuid:  a.lead_id,
        _esp_id:     a.especialista_id,
        _esp_nome:   espNome,
        _filial_id:  a.filial_id,
        _status:     a.status,
        _local_tipo: a.local_tipo,
        _obs:        a.obs || '',
        _created_at: a.created_at,
      };
    });
  }

  static async carregarAgendamentos() {
    const mapeados = await SupabaseSync._buscarAgendamentos(500);
    if (mapeados == null) return;
    store.agendamentos = mapeados;
    SLog.info(`agendamentos: ${store.agendamentos.length} carregados`);
  }

  /* Chamado #110 (reaberto) — histórico completo de agendamentos pros
     relatórios que replicam as regras do card "Visão do Funil". */
  static async buscarAgendamentosCompleto() {
    const todos = await SupabaseSync._buscarAgendamentos(null);
    return todos != null ? todos : (store.agendamentos || []);
  }

  /* ── Visitas ──────────────────────────────────────────────
     Tarefa 7: sincroniza registros de visita (delay, c2,
     nao_fechou, venda) que antes ficavam só em memória.
     Chamado #115 — mesmo padrão de ligações/vendas/carteira: helper
     único parametrizado por limite. Ver `buscarVisitasCompleto`. */
  static async _buscarVisitas(limite) {
    const sel =
      '*, ' +
      'lead:leads!lead_id(id, codigo, nome, deleted_at), ' +
      'especialista:profiles!especialista_id(id, nome, sigla)';
    const base = () => supa.from('visitas').select(sel).order('created_at', { ascending: false });

    let data, error;
    if (limite != null) {
      ({ data, error } = await base().limit(limite));
    } else {
      ({ data, error } = await SupabaseSync._paginarTudo((de, ate) => base().range(de, ate)));
    }
    if (error) { SLog.error('visitas: ' + error.message); return null; }

    /* Chamado #92 — mesmo padrão de carregarVendas: descarta visitas
       cujo lead foi soft-deletado (elas alimentam os cards Visitas/
       Vendas do Número Mágico local e a coluna Visita do funil). */
    return (data || [])
      .filter(v => !(v.lead && v.lead.deleted_at))
      .map(v => ({
      _uuid:              v.id,
      _lead_uuid:         v.lead_id,
      _agendamento_uuid:  v.agendamento_id,
      _esp_id:            v.especialista_id,
      _filial_id:         v.filial_id,
      tipoResultado:      v.tipo_resultado,
      tentativaDataHora:  v.tentativa_data_hora,
      tentativaResultado: v.tentativa_resultado,
      localTipo:          v.local_tipo || null,
      obs:                v.obs || '',
      created_at:         v.created_at,
      leadNome:           v.lead ? v.lead.nome : '—',
      espNome:            v.especialista ? v.especialista.nome : '—',
    }));
  }

  static async carregarVisitas() {
    const mapeadas = await SupabaseSync._buscarVisitas(500);
    if (mapeadas == null) return;
    store.visitas = mapeadas;
    SLog.info(`visitas: ${store.visitas.length} carregadas`);
  }

  /* Chamado #115 — relatório "Desempenho por Especialista" precisa do
     histórico completo de visitas (pra contar Visitas/Vendas pela mesma
     regra do Número Mágico: tipo_resultado 'nao_fechou'/'venda'), não só
     as 500 mais recentes da empresa. */
  static async buscarVisitasCompleto() {
    const todas = await SupabaseSync._buscarVisitas(null);
    return todas != null ? todas : (store.visitas || []);
  }

  /* ── Vendas ─────────────────────────────────────────────────
     Chamado #112 — mesmo padrão da ligações: query/mapeamento em
     helper único parametrizado por limite (cache de boot capado x
     relatório com histórico completo). Ver `buscarVendasCompleto`. */
  static async _buscarVendas(limite) {
    const sel =
      '*, ' +
      'lead:leads!lead_id(id, codigo, nome, tel, deleted_at), ' +
      'especialista:profiles!especialista_id(id, nome, sigla)';
    const base = () => supa.from('vendas').select(sel).order('data_venda', { ascending: false });

    let data, error;
    if (limite != null) {
      ({ data, error } = await base().limit(limite));
    } else {
      ({ data, error } = await SupabaseSync._paginarTudo((de, ate) => base().range(de, ate)));
    }
    if (error) { SLog.error('vendas: ' + error.message); return null; }

    /* Chamado "Exclusão de Card" (carteira) — descarta vendas cujo lead
       foi soft-deletado. Decisão do cliente: ao excluir o card da
       carteira, a VENDA é preservada no banco (histórico financeiro),
       mas o card some. Se mantivéssemos essas vendas em store.vendas,
       elas continuariam contando nos KPIs (Atingimento, ticket médio,
       relatório de vendas) de um card que não existe mais — o antigo
       BUG-H. Filtrando aqui, o número de vendas volta a bater com os
       cards visíveis na carteira. A linha continua no banco e pode ser
       recuperada se o lead for restaurado (deleted_at = null). */
    return (data || [])
      .filter(v => !(v.lead && v.lead.deleted_at))
      .map(v => ({
      _uuid:           v.id,
      _lead_uuid:      v.lead_id,
      _esp_id:         v.especialista_id,
      _filial_id:      v.filial_id,
      valorAdesao:     v.valor_adesao      != null ? Number(v.valor_adesao)      : 0,
      valorMensalidade:v.valor_mensalidade != null ? Number(v.valor_mensalidade) : null,
      valorRastreador: v.valor_rastreador  != null ? Number(v.valor_rastreador)  : null,
      dataVenda:       v.data_venda,
      aniversario:     v.aniversario,
      obs:             v.obs || '',
      created_at:      v.created_at,
      leadNome:        v.lead ? v.lead.nome : '—',
      espNome:         v.especialista ? v.especialista.nome : '—',
    }));
  }

  static async carregarVendas() {
    const mapeadas = await SupabaseSync._buscarVendas(500);
    if (mapeadas == null) return;
    store.vendas = mapeadas;
    SLog.info(`vendas: ${store.vendas.length} carregadas`);
  }

  /* Chamado #112 — relatórios precisam do histórico completo de vendas
     (valores de adesão/mensalidade/rastreador), não só as 500 mais
     recentes da empresa. Não sobrescreve store.vendas. */
  static async buscarVendasCompleto() {
    const todas = await SupabaseSync._buscarVendas(null);
    return todas != null ? todas : (store.vendas || []);
  }

  /* ── Carteira ─────────────────────────────────────────────
     Sincroniza interações da etapa Carteira: pedidos de
     recomendação e ações de cuidar da base.
     Chamado #112 — mesmo padrão de ligações/vendas: helper único
     parametrizado por limite. Ver `buscarCarteiraInteracoesCompleto`. */
  static async _buscarCarteiraInteracoes(limite) {
    const sel =
      '*, ' +
      'lead:leads!lead_id(id, codigo, nome, deleted_at), ' +
      'especialista:profiles!especialista_id(id, nome, sigla)';
    const base = () => supa.from('carteira_interacoes').select(sel).order('data_hora', { ascending: false });

    let data, error;
    if (limite != null) {
      ({ data, error } = await base().limit(limite));
    } else {
      ({ data, error } = await SupabaseSync._paginarTudo((de, ate) => base().range(de, ate)));
    }
    if (error) { SLog.error('carteira_interacoes: ' + error.message); return null; }

    /* Chamado #92 — mesmo padrão de carregarVendas: descarta interações
       de carteira (recomendações, cuidar da base) cujo lead foi
       soft-deletado. */
    return (data || [])
      .filter(c => !(c.lead && c.lead.deleted_at))
      .map(c => ({
      _uuid:      c.id,
      _lead_uuid: c.lead_id,
      _esp_id:    c.especialista_id,
      _filial_id: c.filial_id,
      tipo:       c.tipo,
      motivo:     c.motivo || '',
      resultado:  c.resultado || '',
      dataHora:   c.data_hora,
      obs:        c.obs || '',
      leadNome:   c.lead ? c.lead.nome : '—',
      espNome:    c.especialista ? c.especialista.nome : '—',
    }));
  }

  static async carregarCarteiraInteracoes() {
    const mapeadas = await SupabaseSync._buscarCarteiraInteracoes(500);
    if (mapeadas == null) return;
    store.carteiraInteracoes = mapeadas;
    SLog.info(`carteira_interacoes: ${store.carteiraInteracoes.length} carregadas`);
  }

  /* Chamado #112 — relatório "Ligações da Carteira" precisa do
     histórico completo (recomendações + cuidar da base), não só as
     500 mais recentes da empresa. */
  static async buscarCarteiraInteracoesCompleto() {
    const todas = await SupabaseSync._buscarCarteiraInteracoes(null);
    return todas != null ? todas : (store.carteiraInteracoes || []);
  }

  /* ── Currículos ──
     v1.7 (Onda 2 pós-testes — Ticket #8): antes NÃO EXISTIA. O
     store.adicionarCurriculo já persistia via INSERT, mas no boot
     store.curriculos ficava vazio — dando ilusão de que os cadastros
     "não persistiam". Também não havia canal Realtime pra curriculos
     (adicionado em RealtimeService v1.3).

     Mapeamento das colunas do banco para o shape usado pelo
     CurriculoModule (que espera `exp`, não `experiencia`, entre
     outros). O store.adicionarCurriculo grava `experiencia` no DB
     mas os módulos consumidores continuam esperando `exp`.

     v1.7.1 (Onda 3 fix — bug 3): removido .order('created_at')
     porque a coluna pode não existir na tabela (a coluna que o
     store.adicionarCurriculo NÃO inclui no INSERT é created_at,
     e se o schema não tem default TIMESTAMP com auto-fill, a
     ordenação FALHA silenciosamente — o error handler dava return
     sem popular store.curriculos, deixando o badge sempre em 0).
     Agora usa order por `id` (existe garantidamente por ser PK),
     e adiciona log detalhado do erro se houver. */
  static async carregarCurriculos() {
    const { data, error } = await supa
      .from('curriculos')
      .select('*')
      .order('id', { ascending: false });

    if (error) {
      SLog.error('curriculos FALHOU: ' + error.message + ' (code=' + (error.code||'?') + ')');
      /* NÃO retorna sem popular — deixa store.curriculos como estava
         (potencialmente com dados locais) pra não zerar o badge */
      return;
    }

    /* Gera id numérico local (sequência) para compatibilidade com o
       módulo atual, que usa id numérico e não UUID. Mantém o UUID
       autoritativo em `_uuid` para os UPDATEs/DELETEs. */
    let seq = 0;
    store.curriculos = (data || []).map(c => ({
      id:         ++seq,
      _uuid:      c.id,
      nome:       c.nome || '',
      cargo:      c.cargo || '',
      email:      c.email || '',
      tel:        c.tel || '',
      nascimento: c.nascimento || '',
      endereco:   c.endereco || '',
      sexo:       c.sexo || '',
      cnh:        c.cnh === true,
      exp:        c.experiencia || 0,
      status:     c.status || 'em_analise',
      nota:       c.nota != null ? Number(c.nota) : null,
      obs:        c.obs || '',
      perfil:     c.perfil || '', /* Chamado #73 */
      /* Chamado #71 — data de cadastro; fallback pro created_at em registros antigos. */
      dataCadastro: (c.data_cadastro || (c.created_at ? String(c.created_at).slice(0,10) : '')) || '',
      /* Chamado #118 — anexo do currículo (PDF). anexoPath é o caminho
         no bucket privado "curriculos" (não é URL — bucket privado,
         a URL de acesso é gerada sob demanda via signed URL). */
      anexoPath:         c.anexo_path || null,
      anexoNomeOriginal: c.anexo_nome_original || '',
      anexoTamanho:      c.anexo_tamanho || 0,
    }));

    SLog.info(`curriculos: ${store.curriculos.length} carregados`);

    /* Onda 3 fix — atualiza a badge da sidebar imediatamente, mesmo que
       CurriculoModule.render() ainda não tenha sido chamado no boot.
       Defensivo — se o app.js render() estiver rodando em ordem
       diferente ou não estiver rodando pra este perfil. */
    var $badge = (typeof $ !== 'undefined') ? $('#badge-curriculos') : null;
    if ($badge && $badge.length) $badge.text(store.curriculos.length);
  }

  /* ── Atividades ── */
  static async carregarAtividades() {
    const { data, error } = await supa
      .from('atividades')
      .select('*')
      .order('data_hora', { ascending: false })
      .limit(50);

    if (error) { SLog.error('atividades: ' + error.message); return; }

    store.atividades = data.map(a => ({
      icon: a.icon || '',
      bg: a.bg || '',
      color: a.color || '',
      nome: a.lead_nome || '',
      det: a.detalhes || '',
      hora: new Date(a.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      data: new Date(a.data_hora).toLocaleDateString('pt-BR').replace('/20', '/'),
      esp: '', /* resolver abaixo */
      tipo: a.tipo,
      _esp_id: a.especialista_id,
      /* v1.5 (Sprint 6 / Patch 1) — data_hora ISO preservada pra permitir
         filtro por período no HistoricoModule. Antes só tínhamos strings
         formatadas pt-BR (hora/data), que não dá pra comparar como Date. */
      _data_hora: a.data_hora || null,
    }));

    store.atividades.forEach(a => {
      const u = store.usuarios.find(u => u._id === a._esp_id);
      a.esp = u ? u.nome : '—';
    });

    SLog.info(`atividades: ${data.length} carregadas`);
  }

  /* ── Audit Log ──
     v1.6 (Sprint 7 · 7.5): limite ampliado 50 → 200 pra permitir
     que os filtros e a paginação da tela de auditoria funcionem
     sobre um volume maior de registros. */
  static async carregarAuditLog() {
    const { data, error } = await supa
      .from('audit_log')
      .select('*')
      .order('datahora', { ascending: false })
      .limit(200);

    if (error) { SLog.error('audit_log: ' + error.message); return; }

    store.auditLog = data.map(a => ({
      usuario: a.usuario,
      /* Chamado #55 — preservamos usuario_id (UUID) e a datahora ISO
         original. Isso permite ao AuditModule recortar, para perfis
         não-gerente, apenas as alterações do próprio usuário e apenas
         dos últimos 3 meses — de forma robusta (comparação por UUID e
         por Date), sem depender de casar a string do nome nem de
         re-parsear a data formatada pt-BR. */
      _usuario_id: a.usuario_id || null,
      _datahora_iso: a.datahora || null,
      campo: a.campo,
      anterior: a.anterior || '—',
      novo: a.novo || '',
      datahora: new Date(a.datahora).toLocaleString('pt-BR'),
    }));

    SLog.info(`audit_log: ${data.length} registros carregados`);
  }

  /* ── Notificações ──────────────────────────────────────
     Busca as notificações destinadas ao usuário logado.
     A RLS já filtra automaticamente por destinatario_id =
     auth.uid(), então não precisamos passar where aqui.
     Conecta o badge do header com as notificações reais
     persistidas no Supabase (RN-04 do DRS v1.2). */
  static async carregarNotificacoes() {
    const { data, error } = await supa
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) { SLog.error('notifications: ' + error.message); return; }

    store.notifications = (data || []).map(n => {
      const dt = new Date(n.created_at);
      return {
        msg:   n.msg,
        read:  n.read || false,
        time:  dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        _uuid: n.id,
        _created_at: n.created_at,
        _leadCodigo: n.lead_codigo || null,   /* Chamado #26: link pro card do lead */
      };
    });

    const naoLidas = store.notifications.filter(n => !n.read).length;
    SLog.info(`notifications: ${store.notifications.length} carregadas (${naoLidas} não lidas)`);
  }

  /* ================================================================
     Chamado #34 — Versões históricas de metas de comissão.
     ================================================================
     Uma linha por (especialista, mês). Ao editar as metas, o Modules
     grava uma nova linha (upsert) carimbada com o ano_mes atual.
     A Minha Performance/relatórios buscam a versão vigente do mês
     alvo (a mais recente com ano_mes <= mes_alvo).
     ================================================================ */
  static async carregarMetaVersoes() {
    if (!supa) { store.metaVersoes = []; return; }
    const { data, error } = await supa
      .from('meta_versoes')
      .select('*')
      .order('ano_mes', { ascending: false });

    if (error) {
      SLog.error('meta_versoes: ' + error.message);
      store.metaVersoes = [];
      return;
    }
    store.metaVersoes = (data || []).map(v => ({
      _uuid: v.id,
      profile_id: v.profile_id,
      ano_mes: v.ano_mes,   /* string "YYYY-MM-DD" */
      meta_vendas:       Number(v.meta_vendas || 0),
      meta_mensalidade:  Number(v.meta_mensalidade || 0),
      meta_super_vendas: Number(v.meta_super_vendas || 0),
      meta_power_vendas: Number(v.meta_power_vendas || 0),
      meta_king_vendas:  Number(v.meta_king_vendas  || 0),
      /* Chamado #51 — valor de mensalidade por degrau versionado */
      meta_super_mensalidade: Number(v.meta_super_mensalidade || 0),
      meta_power_mensalidade: Number(v.meta_power_mensalidade || 0),
      meta_king_mensalidade:  Number(v.meta_king_mensalidade  || 0),
    }));
    SLog.info('meta_versoes: ' + store.metaVersoes.length + ' versões carregadas');
  }

  /* ================================================================
     Chamado #44 — Metas de conversão do funil (config global).
     ================================================================
     Linha única. Se não existir/erro, store.metasConversao fica null
     e o TaxaConversaoModule usa os valores hardcoded como fallback. */
  static async carregarMetasConversao() {
    store.metasConversao = null;
    if (!supa) return;
    const { data, error } = await supa
      .from('config_metas_conversao')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      SLog.error('config_metas_conversao: ' + error.message);
      return;
    }
    if (data) {
      store.metasConversao = {
        lead_ligacao:    Number(data.lead_ligacao),
        ligacao_agendam: Number(data.ligacao_agendam),
        agendam_visita:  Number(data.agendam_visita),
        visita_venda:    Number(data.visita_venda),
        venda_carteira:  Number(data.venda_carteira),
      };
      SLog.info('config_metas_conversao: carregada ✓');
    }
  }
}
