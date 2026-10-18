/* ============================================================
   BEYOND CRM — js/store.js   v5.5  (Onda 1 pós-testes — persistência)
   Beyond Bits Tecnologia © 2026

   Cada operação usa o usuário autenticado (AuthService)
   em vez de dados hardcoded. O captador_id, especialista_id
   e nome do usuário vêm da sessão real.

   Histórico:
   - v5.0: auth-aware CRUD.
   - v5.1 (Pacote 1 v1.3.0): métodos arquivarLead,
     desarquivarLead e autoArquivarPorRemarketing. Parâmetro
     opcional incluirArquivados em leadsPorEtapa (default
     false — leads arquivados somem de todos os consumidores,
     como no WhatsApp; só o toggle no Funil passa true).
   - v5.2 (VIS-DATE-1 / Pacote 1.1 pós-homologação):
     corrige adicionarAgendamento — o objeto empurrado no
     store.agendamentos ficava SEM os metadados que o
     SupabaseSync.carregarAgendamentos popula no boot
     (_lead_uuid, _esp_id, _esp_nome, _filial_id, _created_at,
     _local_tipo, _obs). Consequência: agendamentos criados
     na sessão atual não apareciam no badge do card do Kanban
     nem eram encontrados pelo FunilModule._ordenarVisitaPor-
     Agendamento (que filtra por _lead_uuid). Fix alinha o
     objeto local ao mesmo shape que o SupabaseSync entrega,
     seguindo o padrão já usado em adicionarVisita/adicionar-
     Venda/adicionarCarteiraInteracao.
   - v5.3 (Pacote 4 pós-homologação — T20):
     corrige adicionarLead — o lead recém-criado na sessão
     ficava com _createdAt=undefined porque o SupabaseSync
     só popula esse campo no boot. Consequência: o filtro
     avançado "Data de criação" via FiltroAvancadoComponent
     descartava esses leads (cai em `if (!iso) return false`)
     e os cards sumiam quando filtrados pela data em que
     acabaram de ser criados. Fix: seta lead._createdAt =
     ISO now() antes do push, e sobrescreve com o valor
     autoritativo do banco (result.data.created_at) quando
     o INSERT retorna.
   - v5.4 (Sprint 6 / Patch 2 — ticket 6.5 / RN-04):
     adicionarAgendamento agora chama adicionarNotificacaoGestores
     após o INSERT bem-sucedido, notificando todos os gerentes da
     filial do agendamento. Antes essa chamada não existia — a
     RPC notificar_gerentes_da_filial estava implementada mas
     nunca era disparada pelo fluxo de criação (RN-04 no papel,
     não em código). Combinado com o canal 'notifications' do
     RealtimeService v1.2, isso faz o sino do gerente subir
     sem F5 quando um especialista agenda uma visita.
   - v5.5 (Onda 1 pós-testes — Tickets #15, #10, #13, #22 / PERS-1):
     atualizarLead expande a whitelist de campos persistidos
     incluindo captador_id (UUID) e quem_indicou. Antes, mudança
     no captador do modal só atualizava a memória local — em F5
     voltava ao valor antigo. Também prepara o terreno para a
     refatoração in-place do SupabaseSync.carregarLeads (que
     preserva referências e evita corridas de Realtime que
     invalidavam store.currentLead durante operações críticas
     como registrarLigacao e adicionarTag).
   ============================================================ */
'use strict';

class Store {
  constructor() {
    this.currentPage        = 'dashboard';
    this.sidebarCollapsed   = false;
    this.mobileSidebarOpen  = false;
    this.confirmCallback    = null;
    this.currentLead        = null;
    this.leadCounter        = 0;
    this.leads              = [];
    this.agendamentos       = [];
    this.ligacoes           = [];
    this.visitas            = [];
    this.vendas             = [];
    this.carteiraInteracoes = [];
    this.metaVersoes        = [];   /* Chamado #34: versões históricas de metas */
    this.metasConversao     = null; /* Chamado #44: config global de metas de conversão */
    this.curriculos         = [];
    this.usuarios           = [];
    this.atividades         = [];
    this.notifications      = [];
    this.auditLog           = [];
    this.filiais            = [];
    this.tags               = [];
  }

  inicializar() {
    SLog.info('Store inicializado (arrays vazios, aguardando Supabase)');
  }

  /* ──────────────────────────────────────────────
     HELPERS
     ────────────────────────────────────────────── */

  /* Retorna o UUID do usuário autenticado */
  _authUid() {
    return (AuthService.currentUser && AuthService.currentUser.id) ? AuthService.currentUser.id : null;
  }

  /* Retorna o nome do usuário autenticado */
  _authNome() {
    return (AuthService.currentProfile && AuthService.currentProfile.nome) ? AuthService.currentProfile.nome : 'Sistema';
  }

  /* Retorna o filial_id do usuário autenticado */
  _authFilialId() {
    return (AuthService.currentProfile && AuthService.currentProfile.filial_id) ? AuthService.currentProfile.filial_id : null;
  }

  /* Persiste no Supabase em background */
  _persist(operacao, promise) {
    if (!supa) { SLog.warn('DB ' + operacao + ': Supabase offline, só local'); return; }
    promise.then(function(res) {
      if (res.error) {
        SLog.error('DB ' + operacao + ': ' + res.error.message);
      } else {
        SLog.info('DB ' + operacao + ': salvo no banco ✓');
      }
    }).catch(function(err) {
      SLog.error('DB ' + operacao + ': exceção — ' + err.message);
    });
  }

  /* ================================================================
     LEADS
     ================================================================ */
  async adicionarLead(lead) {
    /* v5.3 (Pacote 4 / T20) — Seta _createdAt local antes do push
       para o filtro "Data de criação" do FiltroAvancadoComponent
       enxergar o lead recém-criado. O valor será sobrescrito depois
       com o timestamp autoritativo do banco, se o INSERT retornar. */
    if (!lead._createdAt) {
      lead._createdAt = new Date().toISOString();
    }

    this.leads.unshift(lead);
    SLog.info('CREATE lead: ' + lead.id + ' — ' + lead.nome);
    this._logAudit('Novo Lead (' + lead.id + ')', '—', lead.nome + ' • ' + lead.tel);

    if (!supa) { SLog.warn('DB INSERT leads: Supabase offline'); return; }

    try {
      var codigoRes = await supa.rpc('proximo_lead_id');
      var codigo = (codigoRes.data) ? codigoRes.data : lead.id;

      var insertData = {
        codigo:          codigo,
        nome:            lead.nome,
        tel:             lead.tel,
        fonte:           lead.fonte || '',
        captador_id:     this._authUid(),
        responsavel_id:  this._authUid(),
        filial_id:       this._authFilialId(),
        etapa:           lead.etapa || 'lead',
        tentativas:      lead.tentativas || 0,
        obs:             lead.obs || '',
        placa:           lead.placa || '',
        fipe:            lead.fipe || '',
        mensalidade_est: lead.mensalidadeEst || '',
        quem_indicou:    lead.quemIndicou || '',
      };

      var result = await supa.from('leads').insert(insertData).select().single();

      if (result.error) {
        SLog.error('DB INSERT leads: ' + result.error.message);
      } else if (result.data) {
        lead._uuid = result.data.id;
        lead.id = result.data.codigo;
        /* v5.3 (T20) — sobrescreve com o valor autoritativo do banco.
           Isso mantém coerência com o SupabaseSync do próximo boot. */
        if (result.data.created_at) {
          lead._createdAt = result.data.created_at;
        }
        /* v2.6 — PATCH BUG-LEAD-LOCAL:
           O insertData grava responsavel_id/captador_id/filial_id no banco,
           mas o objeto `lead` local (que ficou em store.leads via unshift)
           nunca recebia esses valores de volta. Resultado: até o próximo F5,
           o lead recém-criado aparecia com responsavel_id=undefined em
           TODAS as consultas locais — quebrava o card LEADS do NM, o KPI
           Associados, os filtros por usuário, o Kanban do gerente, etc.

           Agora copia os campos que o banco populou (ou que já mandamos
           no insertData) de volta pro objeto local, deixando o front
           imediatamente consistente com o banco. */
        lead.responsavel_id = result.data.responsavel_id || insertData.responsavel_id;
        lead.captador_id    = result.data.captador_id    || insertData.captador_id;
        lead.filial_id      = result.data.filial_id      || insertData.filial_id;
        SLog.info('DB INSERT leads: salvo ✓ UUID: ' + lead._uuid);
      }
    } catch (err) {
      SLog.error('DB INSERT leads exceção: ' + err.message);
    }
    /* Chamado #45 — retorna o objeto lead (com _uuid populado se o
       INSERT foi bem-sucedido) pra callers que precisam encadear.
       Zero risco pra callers antigos, que simplesmente ignoram
       o retorno como faziam antes. */
    return lead;
  }

  buscarLead(id) {
    return this.leads.find(function(l) { return l.id === id; }) || null;
  }

  /* ================================================================
     DUPLICAR LEAD PARA VENDA  (Chamado #33)
     ================================================================
     Cria uma CÓPIA do lead direto na coluna Venda (etapa='venda'),
     herdando os dados da PESSOA e deixando os campos de VEÍCULO em
     branco — pra cadastrar um veículo adicional sem recadastrar tudo.

     Pontos importantes:
       • lead_pai_id aponta pro lead original → o clone NÃO conta como
         lead captado nas conversões (TaxaConversaoModule) nem no card
         LEADS do Número Mágico.
       • NÃO passa pelo FunilModule.novoLead(), então o alerta de
         telefone duplicado (LeadDuplicadoService) é naturalmente
         pulado — a duplicação aqui é intencional.
       • captador_id/responsavel_id = usuário logado (RLS-safe, igual
         adicionarLead). A captação ORIGINAL continua rastreável pelo
         lead_pai_id → lead pai. (Se a policy de INSERT de `leads`
         permitir gravar captador_id de terceiro, dá pra trocar por
         leadPai.captador_id numa linha só — mas o padrão seguro é
         este.)

     Retorna: Promise<object|null> — o lead clone local, ou null em erro.
     ================================================================ */
  async duplicarLeadParaVenda(leadPai) {
    if (!leadPai) { SLog.warn('duplicarLeadParaVenda: leadPai ausente'); return null; }
    if (!leadPai._uuid) {
      SLog.warn('duplicarLeadParaVenda: leadPai sem _uuid — não dá pra vincular no banco');
      return null;
    }

    var obsClone = 'Veículo adicional — duplicado do lead ' + (leadPai.id || '—') +
                   ' (' + (leadPai.nome || '') + ')';

    var clone = {
      id:             this.proximoLeadId(),   /* placeholder; banco devolve o codigo real */
      nome:           leadPai.nome,
      tel:            leadPai.tel,
      fonte:          leadPai.fonte || '',
      etapa:          'venda',
      tentativas:     0,
      obs:            obsClone,
      placa:          '',                      /* em branco: o novo veículo */
      fipe:           '',
      mensalidadeEst: '',
      aniversario:    leadPai.aniversario || '',
      quemIndicou:    leadPai.quemIndicou || '',
      tags:           [],
      lead_pai_id:    leadPai._uuid,
      _createdAt:     new Date().toISOString(),
    };

    /* Push local imediato pra o card aparecer na hora na coluna Venda */
    this.leads.unshift(clone);
    SLog.info('DUPLICAR lead p/ venda: pai=' + leadPai.id + ' → clone (local)');
    this._logAudit('Duplicar Lead p/ veículo adicional', leadPai.id, clone.nome);

    if (!supa) { SLog.warn('DB INSERT (dup): Supabase offline, só local'); return clone; }

    try {
      var codigoRes = await supa.rpc('proximo_lead_id');
      var codigo = (codigoRes.data) ? codigoRes.data : clone.id;

      var insertData = {
        codigo:          codigo,
        nome:            clone.nome,
        tel:             clone.tel,
        fonte:           clone.fonte,
        captador_id:     this._authUid(),
        responsavel_id:  this._authUid(),
        filial_id:       this._authFilialId(),
        etapa:           'venda',
        tentativas:      0,
        obs:             clone.obs,
        placa:           '',
        fipe:            '',
        mensalidade_est: '',
        quem_indicou:    clone.quemIndicou || '',
        lead_pai_id:     leadPai._uuid,
      };

      var result = await supa.from('leads').insert(insertData).select().single();

      if (result.error) {
        SLog.error('DB INSERT (dup): ' + result.error.message);
        /* desfaz o push local pra não deixar clone fantasma sem banco */
        var idxErr = this.leads.indexOf(clone);
        if (idxErr >= 0) this.leads.splice(idxErr, 1);
        return null;
      }

      if (result.data) {
        clone._uuid          = result.data.id;
        clone.id             = result.data.codigo;
        clone.captador_id    = result.data.captador_id    || insertData.captador_id;
        clone.responsavel_id = result.data.responsavel_id || insertData.responsavel_id;
        clone.filial_id      = result.data.filial_id      || insertData.filial_id;
        clone.lead_pai_id    = result.data.lead_pai_id    || insertData.lead_pai_id;
        if (result.data.created_at) clone._createdAt = result.data.created_at;
        SLog.info('DB INSERT (dup): salvo ✓ UUID: ' + clone._uuid + ' codigo: ' + clone.id);
      }
      return clone;

    } catch (err) {
      SLog.error('DB INSERT (dup) exceção: ' + err.message);
      var idxEx = this.leads.indexOf(clone);
      if (idxEx >= 0) this.leads.splice(idxEx, 1);
      return null;
    }
  }


  atualizarLead(id, campos) {
    var lead = this.buscarLead(id);
    if (!lead) { SLog.warn('UPDATE lead falhou: ' + id + ' não existe'); return null; }
    var camposStr = Object.keys(campos).join(', ');
    Object.assign(lead, campos);
    SLog.info('UPDATE lead: ' + id + ' → campos: ' + camposStr);
    /* Chamado #42 — antes gravávamos 'Dados do lead ' + id no tipo de
       operação, o que fazia o filtro da Auditoria criar uma categoria
       por lead. Agora gravamos só 'Dados do Lead'; o código do lead
       fica no payload (novo, JSON) e continua rastreável via busca. */
    this._logAudit('Dados do Lead', '—', JSON.stringify({ codigo: id, campos: campos }));

    if (lead._uuid) {
      var dbCampos = {};
      if (campos.obs !== undefined) dbCampos.obs = campos.obs;
      if (campos.placa !== undefined) dbCampos.placa = campos.placa;
      if (campos.fipe !== undefined) dbCampos.fipe = campos.fipe;
      if (campos.mensalidadeEst !== undefined) dbCampos.mensalidade_est = campos.mensalidadeEst;
      if (campos.fonte !== undefined) dbCampos.fonte = campos.fonte;
      if (campos.tentativas !== undefined) dbCampos.tentativas = campos.tentativas;
      if (campos.tel !== undefined) dbCampos.tel = campos.tel;
      if (campos.nome !== undefined) dbCampos.nome = campos.nome;
      /* Onda 1 (Ticket #15 / PERS-1) — captador_id e quem_indicou
         estavam FORA da whitelist. Consequência: mudança do captador
         no modal atualizava só o local; em F5 voltava ao valor
         original do banco. Agora persistidos. captador_id é UUID
         (FK profiles); a coluna `captador` visual do lead é derivada
         desse UUID no SupabaseSync (lookup em store.usuarios). */
      if (campos.captador_id !== undefined) dbCampos.captador_id = campos.captador_id;
      if (campos.quemIndicou !== undefined) dbCampos.quem_indicou = campos.quemIndicou;

      if (Object.keys(dbCampos).length > 0) {
        this._persist('UPDATE leads', supa.from('leads').update(dbCampos).eq('id', lead._uuid));
      }
    }

    return lead;
  }

  avancarEtapa(lead, novaEtapa) {
    var anterior = lead.etapa;
    lead.etapa = novaEtapa;
    SLog.info('UPDATE etapa: ' + lead.id + ' → ' + (STAGE_CONFIG[anterior]||{}).label + ' ➜ ' + (STAGE_CONFIG[novaEtapa]||{}).label);
    this._logAudit('Etapa (' + lead.id + ')', (STAGE_CONFIG[anterior]||{}).label, (STAGE_CONFIG[novaEtapa]||{}).label);

    if (lead._uuid) {
      this._persist('UPDATE leads.etapa', supa.from('leads').update({ etapa: novaEtapa }).eq('id', lead._uuid));
    }
  }

  proximoLeadId() {
    this.leadCounter++;
    var novoId = Utils.gerarLeadId(this.leadCounter);
    SLog.load('GERAR ID: ' + novoId + ' (counter: ' + this.leadCounter + ')');
    return novoId;
  }

  /* ────────────────────────────────────────────────────
     leadsPorEtapa(etapa, incluirArquivados = false)

     v5.1: passa a filtrar leads arquivados por padrão.
     - default (incluirArquivados=false): esconde arquivados
       de todos os consumidores (KPIs, funil-preview, kanban
       padrão, contadores etc.) — comportamento tipo WhatsApp.
     - com incluirArquivados=true: retorna também arquivados
       (usado pelo toggle "ver arquivados" no Funil).

     Chamadores atuais não passam o parâmetro, então herdam
     o novo comportamento automaticamente. Isso é intencional:
     um lead arquivado não deve inflar o Número Mágico nem
     aparecer em relatórios de acompanhamento diário.
     ──────────────────────────────────────────────────── */
  leadsPorEtapa(etapa, incluirArquivados) {
    var incluir = incluirArquivados === true;
    return this.leads.filter(function(l) {
      if (l.etapa !== etapa) return false;
      if (!incluir && l.arquivado === true) return false;
      return true;
    });
  }

  /* ────────────────────────────────────────────────────
     ARQUIVAMENTO (RN-21 e RN-22)

     Padrão: atualiza local imediatamente (UI responsiva) e
     persiste via ArquivamentoService. Se o service falhar,
     o Toast é disparado pelo próprio service — aqui só
     revertemos o estado local para manter consistência.
     ──────────────────────────────────────────────────── */

  /* RN-21 — Arquivamento manual (qualquer perfil).
     leadIdOuUuid pode ser o código (string tipo "00042") ou o UUID. */
  async arquivarLead(leadIdOuUuid) {
    var lead = this._resolverLead(leadIdOuUuid);
    if (!lead) { SLog.warn('ARQUIV local: lead não encontrado — ' + leadIdOuUuid); return false; }
    if (!lead._uuid) { SLog.warn('ARQUIV local: lead sem _uuid — ' + lead.id); return false; }
    if (lead.arquivado === true) return true; /* já arquivado */

    /* Update local imediato */
    lead.arquivado    = true;
    lead.arquivadoEm  = new Date().toISOString();
    lead.arquivadoPor = this._authUid();
    SLog.info('ARQUIV local: ' + lead.id + ' — ' + lead.nome);
    this._logAudit('Arquivar Lead (' + lead.id + ')', 'ativo', 'arquivado');

    /* Persiste no banco */
    var ok = await ArquivamentoService.arquivar(lead._uuid);
    if (!ok) {
      /* Rollback local em caso de falha */
      lead.arquivado    = false;
      lead.arquivadoEm  = null;
      lead.arquivadoPor = null;
      SLog.warn('ARQUIV rollback: ' + lead.id);
      return false;
    }
    return true;
  }

  /* Desarquivar (qualquer perfil). Ao desarquivar, o card
     reaparece na coluna da etapa atual do lead — se ele
     estava em Ligação (caso remarketing), volta pra Ligação. */
  async desarquivarLead(leadIdOuUuid) {
    var lead = this._resolverLead(leadIdOuUuid);
    if (!lead) { SLog.warn('DESARQUIV local: lead não encontrado — ' + leadIdOuUuid); return false; }
    if (!lead._uuid) { SLog.warn('DESARQUIV local: lead sem _uuid — ' + lead.id); return false; }
    if (lead.arquivado !== true) return true; /* já ativo */

    /* Snapshot para rollback */
    var snapshot = {
      arquivadoEm:  lead.arquivadoEm,
      arquivadoPor: lead.arquivadoPor,
    };

    /* Update local imediato */
    lead.arquivado    = false;
    lead.arquivadoEm  = null;
    lead.arquivadoPor = null;
    SLog.info('DESARQUIV local: ' + lead.id + ' — ' + lead.nome);
    this._logAudit('Desarquivar Lead (' + lead.id + ')', 'arquivado', 'ativo');

    var ok = await ArquivamentoService.desarquivar(lead._uuid);
    if (!ok) {
      lead.arquivado    = true;
      lead.arquivadoEm  = snapshot.arquivadoEm;
      lead.arquivadoPor = snapshot.arquivadoPor;
      SLog.warn('DESARQUIV rollback: ' + lead.id);
      return false;
    }
    return true;
  }

  /* RN-22 — Auto-arquivamento em Remarketing.
     Chamado pelo FunilModule quando o gerente clica
     "Enviar para Remarketing" no popup pós-ligação.
     Registra arquivado_por = NULL para diferenciar de
     ação manual na auditoria. */
  async autoArquivarPorRemarketing(leadIdOuUuid) {
    var lead = this._resolverLead(leadIdOuUuid);
    if (!lead) { SLog.warn('AUTO-ARQUIV local: lead não encontrado'); return false; }
    if (!lead._uuid) { SLog.warn('AUTO-ARQUIV local: lead sem _uuid'); return false; }
    if (lead.arquivado === true) return true;

    lead.arquivado    = true;
    lead.arquivadoEm  = new Date().toISOString();
    lead.arquivadoPor = null;  /* sinaliza automação */
    SLog.info('AUTO-ARQUIV local (remarketing): ' + lead.id);
    this._logAudit('Auto-arquivar Lead (' + lead.id + ')', 'ativo', 'arquivado — remarketing 30+');

    var ok = await ArquivamentoService.autoArquivar(lead._uuid);
    if (!ok) {
      lead.arquivado    = false;
      lead.arquivadoEm  = null;
      lead.arquivadoPor = null;
      SLog.warn('AUTO-ARQUIV rollback: ' + lead.id);
      return false;
    }
    return true;
  }

  /* Helper: resolve lead por código (id) OU por UUID (_uuid). */
  _resolverLead(leadIdOuUuid) {
    if (!leadIdOuUuid) return null;
    return this.leads.find(function(l) {
      return l.id === leadIdOuUuid || l._uuid === leadIdOuUuid;
    }) || null;
  }

  /* ================================================================
     ATIVIDADES
     ================================================================ */
  adicionarAtividade(icon, nome, det, extra, bg, color, tipo) {
    var espNome = this._authNome();
    var atividade = { icon: icon, bg: bg, color: color, nome: nome, det: det+(extra?' • '+extra:''), hora: Utils.getHoraAtual(), data: Utils.getDataAtual(), esp: espNome, tipo: tipo };
    this.atividades.unshift(atividade);
    SLog.info('CREATE atividade: ' + tipo + ' — ' + nome);

    var espId = this._authUid();
    if (espId) {
      this._persist('INSERT atividades', supa.from('atividades').insert({
        tipo:            tipo,
        icon:            icon,
        bg:              bg,
        color:           color,
        lead_nome:       nome,
        detalhes:        det + (extra ? ' • ' + extra : ''),
        especialista_id: espId,
      }));
    }
  }

  /* ═════════════════════════════════════════════════════════════
     Chamado #131 — janela anti-duplicidade de ligação
     ═════════════════════════════════════════════════════════════
     A auditoria do #131 encontrou registros em duplicata na tabela
     `ligacoes`: mesmo lead, mesmo especialista, mesmo resultado,
     gravados com **0,051 a 4 segundos** de diferença — e em quatro
     casos com três a cinco registros seguidos. Em sete dias, 29 de 40
     pares analisados estavam abaixo de 5 segundos.

     Não são ligações: discar, chamar e desistir não acontece em 51
     milissegundos. Isso inflava o KPI "Ligações" — justamente o número
     que o cliente está auditando — e as tentativas do lead.

     O caminho do botão é `onclick` inline e o ConfirmDialog anula o
     callback após executá-lo, então a origem do disparo repetido não
     ficou provada (mouse com repique, evento de toque duplicado, algum
     caminho de reentrância). Por isso a proteção foi colocada aqui, no
     ponto de gravação: vale para qualquer origem, presente ou futura.

     O limiar é conservador de propósito. Uma tentativa real leva
     dezenas de segundos; 5 segundos bloqueia só o inequivocamente
     acidental e não descarta nenhum registro legítimo. */
  static _JANELA_DUPLICIDADE_MS = 5000;

  adicionarLigacao(lead, resultado, opcoes) {
    opcoes = opcoes || {};
    var espNome = this._authNome();

    /* Chamado #131 — descarta a repetição acidental antes de gravar. */
    var agoraMs = Date.now();
    var ultima  = this.ligacoes && this.ligacoes[0];
    if (ultima
        && ultima._lead_uuid === lead._uuid
        && ultima.resultado === resultado
        && ultima._registrado_em != null
        && (agoraMs - ultima._registrado_em) < Store._JANELA_DUPLICIDADE_MS) {
      SLog.warn('LIG-DUP (#131): registro idêntico há ' +
                ((agoraMs - ultima._registrado_em) / 1000).toFixed(3) + 's — ignorado (' +
                lead.nome + ' → ' + resultado + ')');
      /* Desfaz o incremento de tentativa que o chamador já aplicou, pra
         o contador do lead não subir por uma ligação que não existiu. */
      if (lead.tentativas > 0) lead.tentativas--;
      return;
    }

    /* Determinar hora/data exibida no histórico:
       - Se o usuário escolheu uma data/hora no formulário, usa essa
       - Senão, usa a hora atual (comportamento original) */
    var horaDisplay = Utils.getHoraAtual();
    var dataDisplay = Utils.getDataAtual();
    if (opcoes.dataHora) {
      try {
        var d = new Date(opcoes.dataHora);
        horaDisplay = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
        dataDisplay = d.toLocaleDateString('pt-BR').replace('/20', '/');
      } catch (e) { /* mantém defaults */ }
    }

    this.ligacoes.unshift({
      lead: lead.nome,
      tel: lead.tel,
      resultado: resultado,
      tentativa: lead.tentativas,
      esp: espNome,
      hora: horaDisplay,
      data: dataDisplay,
      obs: opcoes.obs || '',
      /* Metadados úteis para reconciliar com o registro do banco */
      _lead_uuid: lead._uuid,
      _esp_id:    this._authUid(),
      /* Chamado #131 — carimbo em ms pra detectar repetição acidental.
         Não vai pro banco; serve só à guarda desta sessão. */
      _registrado_em: agoraMs,
    });
    SLog.info('CREATE ligação: ' + lead.nome + ' → ' + resultado + ' (tentativa #' + lead.tentativas + ')');
    this._logAudit('Ligação (' + lead.id + ')', '—', resultado + ' • Tentativa #' + lead.tentativas);

    /* Persistir via LigacaoService (centraliza CRUD da tabela 'ligacoes').
       Defesa em profundidade: typeof guard caso o script ainda não esteja carregado. */
    if (typeof LigacaoService !== 'undefined') {
      var self = this;
      LigacaoService.registrar(lead, {
        resultado: resultado,
        dataHora:  opcoes.dataHora,
        obs:       opcoes.obs,
      })
        .then(function(registro) {
          /* Anexa o UUID do banco ao item local mais recente para reconciliação */
          if (registro && registro.id && self.ligacoes[0] && !self.ligacoes[0]._uuid) {
            self.ligacoes[0]._uuid = registro.id;
          }

          /* Patch PERS-2 — persistir contador de tentativas em leads (ponto 2.c).
             O FunilModule já fez lead.tentativas++ na memória; aqui sincronizamos
             com o banco para que ao recarregar (F5) o contador não zere.

             Roda APÓS o INSERT da ligação dar OK — assim evita inconsistência
             do contador subir mas a ligação não ter sido registrada.

             Decisão lockada #1 do plano: UPDATE explícito em vez de trigger,
             pra manter a regra controlada pelo JS.

             Onda 1 (Ticket #22) — marca `_pendingWrite.tentativas = true`
             pra impedir que um reload do Realtime (disparado pelo INSERT
             da ligação, que compartilha o timing) sobrescreva o valor
             local com o stale do banco. A flag é limpa no `.then`
             quando o UPDATE respectivo confirma no banco. */
          if (registro && registro.id && lead._uuid && supa) {
            lead._pendingWrite = lead._pendingWrite || {};
            lead._pendingWrite.tentativas = true;

            supa.from('leads')
              .update({ tentativas: lead.tentativas })
              .eq('id', lead._uuid)
              .then(function(updRes) {
                /* Limpa a flag SEMPRE (sucesso ou erro) pra não deixar
                   o lead travado sem reconciliação. */
                if (lead._pendingWrite) delete lead._pendingWrite.tentativas;
                if (updRes.error) {
                  SLog.error('UPDATE leads.tentativas: ' + updRes.error.message);
                } else {
                  SLog.info('UPDATE leads.tentativas: ' + lead.tentativas + ' ✓');
                }
              });
          }
        })
        .catch(function(err) {
          SLog.error('store.adicionarLigacao: ' + err.message);
        });
    } else {
      SLog.warn('LigacaoService indisponível — ligação salva apenas em memória local.');
    }
  }

  /* ================================================================
     AGENDAMENTOS
     ================================================================ */
  adicionarAgendamento(ag) {
    /* v5.2 (VIS-DATE-1) — enriquece o objeto ANTES do push para
       manter paridade com o shape produzido por
       SupabaseSync.carregarAgendamentos (mesmos metadados que
       o boot popula). Sem isso, agendamentos criados na sessão
       ficavam com _lead_uuid=undefined, quebrando o filtro do
       KanbanCard e do FunilModule._ordenarVisitaPorAgendamento. */
    var espId    = this._authUid();
    var espNome  = this._authNome();
    var filialId = this._authFilialId();
    var leadUuid = ag.lead ? ag.lead._uuid : null;

    /* local_tipo precisa casar com o CHECK do banco:
       'interno' | 'externo' | 'online'. Extraído aqui pra reuso
       tanto na hidratação local quanto no INSERT do banco. */
    var localTipo = (ag.local || 'interno').toLowerCase().replace(/[🏢📍💻\s]/g, '') || 'interno';

    /* Metadados esperados por consumidores (KanbanCard, FunilModule,
       AgendaModule etc.). Mesmo shape do SupabaseSync — se algo estiver
       ausente na sessão, deixa null (nunca undefined) para o filter
       de igualdade estrita funcionar consistentemente. */
    ag._lead_uuid  = leadUuid || null;
    ag._esp_id     = espId    || null;
    ag._esp_nome   = espNome  || '—';
    ag._filial_id  = filialId || null;
    ag._local_tipo = localTipo;
    ag._obs        = ag.obs || '';
    ag._status     = ag._status || 'agendado';
    ag._created_at = ag._created_at || new Date().toISOString();

    /* ── Chamado #61 (reincidência) — estado de persistência ──
       Rastreia se o INSERT no banco já retornou o _uuid. Enquanto
       não retornar, o agendamento existe em memória mas NÃO tem
       linha confirmada no banco. Sem esse controle, uma remarcação
       feita ANTES do INSERT resolver (ou após ele FALHAR) caía no
       INSERT de novo — gerando a linha duplicada que o cliente
       reportou. Valores: 'pending' | 'ok' | 'failed'. */
    ag._persistState = 'pending';
    /* _pendingPatch: se o usuário remarcar enquanto o INSERT está em
       voo, guardamos aqui os campos novos. Quando o _uuid chegar,
       aplicamos via UPDATE — sem criar segunda linha. */
    ag._pendingPatch = ag._pendingPatch || null;

    this.agendamentos.push(ag);
    SLog.info('CREATE agendamento: ' + (ag.lead?.nome || ag.nome || '—'));
    this._logAudit('Novo Agendamento', '—', (ag.lead?.nome || ag.nome || '—'));

    if (!leadUuid || !espId) {
      SLog.warn('adicionarAgendamento: lead_uuid ou especialista_id ausente, só local');
      ag._persistState = 'failed';   /* nunca foi ao banco */
      return;
    }

    /* Persistir via AgendaService (centraliza CRUD da tabela 'agendamentos').
       Defesa em profundidade: typeof guard caso o script ainda não esteja carregado. */
    if (typeof AgendaService !== 'undefined') {
      var self = this;
      AgendaService.criar({
        lead_id:           leadUuid,
        especialista_id:   espId,
        filial_id:         filialId,
        data_hora:         ag.data || new Date().toISOString(),
        local_tipo:        localTipo,
        local_descricao:   ag.local || '',
        categoria_veiculo: ag.categoria || '',
        obs:               ag.obs || '',
        /* Patch PERS-1 — data em que o agendamento foi feito (ponto 3.c) */
        data_realizacao:   ag.dataRealizacao || null,
      })
        .then(function(registro) {
          /* Anexa o UUID do banco ao item local para reconciliação.
             Também atualiza _created_at com o valor autoritativo do banco. */
          if (registro && registro.id) {
            ag._uuid = registro.id;
            ag._persistState = 'ok';
            if (registro.created_at) ag._created_at = registro.created_at;
            /* O trigger trg_criar_checklist_agendamento já criou os itens
               do checklist no banco. Não precisa fazer nada aqui. */

            /* Chamado #61 — se houve remarcação enquanto o INSERT estava
               em voo, os dados novos ficaram represados em _pendingPatch.
               Agora que temos o _uuid, aplicamos como UPDATE na MESMA
               linha (nunca um segundo INSERT). */
            if (ag._pendingPatch) {
              var patch = ag._pendingPatch;
              ag._pendingPatch = null;
              SLog.info('agendamento: aplicando remarcação represada (pós-INSERT)');
              self.atualizarAgendamento(ag, patch);
            }

            /* v5.4 (Sprint 6 / Patch 2 — RN-04): notifica os gerentes da
               filial do agendamento. Só chama se tem filialId (sem filial
               não há alvo pra RPC); se falhar, self.adicionarNotificacao-
               Gestores já loga e retorna 0 — não propaga erro. */
            if (filialId) {
              var leadNome = ag.lead?.nome || ag.nome || '—';
              var espNomeFmt = espNome || 'Especialista';
              var dt = ag.data ? new Date(ag.data) : new Date();
              var dtStr = isNaN(dt.getTime())
                ? '—'
                : dt.toLocaleDateString('pt-BR') + ' ' +
                  dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
              var msg = '📅 Novo agendamento: ' + espNomeFmt +
                        ' → ' + leadNome + ' em ' + dtStr;
              self.adicionarNotificacaoGestores(filialId, msg);
            }
          } else {
            /* Resposta sem id — trata como falha pra permitir recuperação. */
            ag._persistState = 'failed';
            SLog.warn('adicionarAgendamento: INSERT sem id de retorno — marcado como failed');
          }
        })
        .catch(function(err) {
          ag._persistState = 'failed';
          SLog.error('store.adicionarAgendamento: ' + err.message);
        });
    } else {
      ag._persistState = 'failed';
      SLog.warn('AgendaService indisponível — agendamento salvo apenas em memória local.');
    }
  }

  /* ================================================================
     ATUALIZAR AGENDAMENTO (Chamado #61)
     ================================================================
     Remarcação in place: atualiza o objeto local já existente em
     store.agendamentos (para _agendamentoVigente / badge / auto-avanço
     lerem o valor novo IMEDIATAMENTE, sem esperar reload) e persiste a
     mudança na MESMA linha do banco via AgendaService.atualizar().

     Diferente de adicionarAgendamento, NÃO faz push (não cria linha
     nova) e NÃO renotifica os gestores (D1 do chamado — remarcar não
     dispara nova notificação, evita spam).

     Parâmetros:
       agLocal — o objeto do agendamento vigente (shape do store)
       dados   — { data, local, categoria, obs }
     ================================================================ */
  atualizarAgendamento(agLocal, dados) {
    if (!agLocal) {
      SLog.warn('atualizarAgendamento: agendamento local ausente');
      return;
    }
    dados = dados || {};

    /* Mesmo tratamento de local_tipo do adicionarAgendamento, pra
       manter paridade com o CHECK do banco ('interno'|'externo'|'online'). */
    var localTipo = (dados.local || 'interno').toLowerCase().replace(/[🏢📍💻\s]/g, '') || 'interno';

    /* ── Atualiza o objeto LOCAL in place ── */
    if (dados.data !== undefined)      agLocal.data       = dados.data;
    if (dados.local !== undefined)     agLocal.local      = dados.local;
    if (dados.categoria !== undefined) agLocal.categoria  = dados.categoria;
    if (dados.obs !== undefined) {     agLocal.obs = dados.obs; agLocal._obs = dados.obs; }
    agLocal._local_tipo = localTipo;

    /* ════════════════════════════════════════════════════════════
       Chamado #61 (reincidência) — NUNCA cair em INSERT aqui.
       ════════════════════════════════════════════════════════════
       Esta função é a rota de REMARCAÇÃO. A causa da duplicação que
       o cliente reportou era: quando o agendamento vigente ainda não
       tinha _uuid (INSERT em voo, ou INSERT que falhou), o chamador
       caía no adicionarAgendamento e criava uma segunda linha.

       Agora tratamos os 3 estados de persistência SEM nunca duplicar:

         • _uuid presente ('ok')  → UPDATE normal na mesma linha.
         • 'pending' (INSERT em   → represa os dados em _pendingPatch.
           voo, sem _uuid ainda)     O .then() do INSERT original vai
                                     aplicar o UPDATE assim que o _uuid
                                     chegar. Zero segunda linha.
         • 'failed' (INSERT nunca  → recuperação: tenta UM INSERT agora
           foi/ falhou)              (o registro não existe no banco,
                                     então criar é o correto — não é
                                     duplicação). Guardado por flag pra
                                     não reentrar.
       ════════════════════════════════════════════════════════════ */

    /* Caso A — INSERT em voo: represa e sai. Não faz UPDATE (sem _uuid)
       nem INSERT (linha já será criada pelo adicionarAgendamento). */
    if (!agLocal._uuid && agLocal._persistState === 'pending') {
      agLocal._pendingPatch = {
        data:      (dados.data !== undefined)      ? dados.data      : agLocal.data,
        local:     (dados.local !== undefined)     ? dados.local     : agLocal.local,
        categoria: (dados.categoria !== undefined) ? dados.categoria : agLocal.categoria,
        obs:       (dados.obs !== undefined)       ? dados.obs       : agLocal.obs,
      };
      SLog.info('atualizarAgendamento: INSERT em voo — remarcação represada (sem duplicar)');
      return;
    }

    /* Caso B — INSERT falhou (ou nunca ocorreu): a linha NÃO existe no
       banco. Recupera criando UMA vez. Não é duplicação: é a primeira
       linha real. Protegido por _recovering pra não reentrar. */
    if (!agLocal._uuid && agLocal._persistState === 'failed' && !agLocal._recovering) {
      agLocal._recovering = true;
      SLog.warn('atualizarAgendamento: INSERT anterior falhou — tentando recuperação (INSERT único)');
      if (typeof AgendaService !== 'undefined' &&
          agLocal._lead_uuid && agLocal._esp_id) {
        var selfRec = this;
        AgendaService.criar({
          lead_id:           agLocal._lead_uuid,
          especialista_id:   agLocal._esp_id,
          filial_id:         agLocal._filial_id || null,
          data_hora:         agLocal.data || new Date().toISOString(),
          local_tipo:        localTipo,
          local_descricao:   agLocal.local || '',
          categoria_veiculo: agLocal.categoria || '',
          obs:               agLocal.obs || '',
        })
          .then(function(registro) {
            agLocal._recovering = false;
            if (registro && registro.id) {
              agLocal._uuid = registro.id;
              agLocal._persistState = 'ok';
              if (registro.created_at) agLocal._created_at = registro.created_at;
              SLog.info('atualizarAgendamento: recuperação OK — linha criada ✓');
            } else {
              agLocal._persistState = 'failed';
              SLog.warn('atualizarAgendamento: recuperação sem id — segue failed');
            }
          })
          .catch(function(err) {
            agLocal._recovering = false;
            agLocal._persistState = 'failed';
            SLog.error('atualizarAgendamento (recuperação): ' + err.message);
          });
      } else {
        agLocal._recovering = false;
        SLog.warn('atualizarAgendamento: recuperação impossível (sem lead_uuid/esp_id) — só local');
      }
      /* Log de auditoria da remarcação mesmo na recuperação. */
      this._logAudit('Agendamento Remarcado', '—', (agLocal.lead?.nome || agLocal.nome || '—'));
      return;
    }

    /* Caso C — ainda sem _uuid e sem estado tratável (defensivo):
       não arrisca INSERT; mantém só local. */
    if (!agLocal._uuid) {
      SLog.warn('atualizarAgendamento: agendamento sem _uuid, atualizado só localmente');
      this._logAudit('Agendamento Remarcado', '—', (agLocal.lead?.nome || agLocal.nome || '—'));
      return;
    }

    /* Caso D — caminho normal: linha existe no banco, faz UPDATE. */
    SLog.info('UPDATE agendamento: ' + (agLocal.lead?.nome || agLocal.nome || '—'));
    this._logAudit('Agendamento Remarcado', '—', (agLocal.lead?.nome || agLocal.nome || '—'));

    if (typeof AgendaService !== 'undefined') {
      AgendaService.atualizar(agLocal._uuid, {
        data_hora:         dados.data || agLocal.data || new Date().toISOString(),
        local_tipo:        localTipo,
        local_descricao:   dados.local || '',
        categoria_veiculo: dados.categoria || '',
        obs:               dados.obs || '',
      })
        .then(function(registro) {
          if (registro && registro.data_hora) {
            /* Reconcilia com o valor autoritativo do banco (mantém
               ISO consistente). */
            agLocal.data = registro.data_hora;
          }
        })
        .catch(function(err) {
          SLog.error('store.atualizarAgendamento: ' + err.message);
        });
    } else {
      SLog.warn('AgendaService indisponível — remarcação salva apenas em memória local.');
    }
  }

  /* ================================================================
     Chamado #86 — EXCLUIR AGENDAMENTO
     ================================================================
     Remove um agendamento da agenda (memória + banco). Usado pelo
     botão de excluir do modal do lead. Fluxo:
       1. Marca _status='cancelado' no objeto local (some da agenda
          imediatamente, pois AgendaModule._getBaseSemana filtra por
          status desde o #86).
       2. Remove do array store.agendamentos.
       3. DELETE no banco (best-effort; se falhar, loga — o objeto já
          saiu da UI e uma reconciliação futura não o traz de volta
          porque foi deletado).
     Não afeta C2: o C2 é um agendamento próprio; excluí-lo é uma ação
     explícita do usuário, não um efeito colateral de remarcação.
     Retorna Promise<boolean> (true se o DELETE no banco confirmou).
     ================================================================ */
  async excluirAgendamento(agLocal) {
    if (!agLocal) {
      SLog.warn('excluirAgendamento: agendamento ausente');
      return false;
    }

    /* 1) Marca cancelado + 2) remove do array local */
    agLocal._status = 'cancelado';
    var idx = this.agendamentos.indexOf(agLocal);
    if (idx >= 0) this.agendamentos.splice(idx, 1);
    SLog.info('DELETE agendamento (local): ' + (agLocal.lead?.nome || agLocal.nome || '—'));
    this._logAudit('Agendamento Excluído', (agLocal.lead?.nome || agLocal.nome || '—'), '—');

    /* 3) DELETE no banco. Sem _uuid não há linha (só existia local). */
    if (!agLocal._uuid) {
      SLog.warn('excluirAgendamento: sem _uuid, removido apenas localmente');
      return true;
    }
    if (!supa) {
      SLog.warn('excluirAgendamento: Supabase offline, removido apenas localmente');
      return false;
    }
    try {
      var res = await supa.from('agendamentos').delete().eq('id', agLocal._uuid);
      if (res.error) {
        SLog.error('excluirAgendamento: ' + res.error.message);
        return false;
      }
      SLog.info('DELETE agendamento (banco) OK ✓');
      return true;
    } catch (err) {
      SLog.error('excluirAgendamento exceção: ' + err.message);
      return false;
    }
  }

  /* ================================================================
     TAREFA 7 — VISITAS
     adicionarVisita: registra uma visita persistindo via VisitaService.
     dados = {
       lead_uuid, agendamento_uuid, tipo_resultado,
       tentativa_data_hora, tentativa_resultado, obs
     }
     ================================================================ */
  adicionarVisita(dados) {
    if (!dados || !dados.lead_uuid || !dados.tipo_resultado) {
      SLog.warn('adicionarVisita: parâmetros obrigatórios ausentes');
      return null;
    }

    var espId    = this._authUid();
    var filialId = this._authFilialId();
    if (!espId) {
      SLog.warn('adicionarVisita: especialista_id ausente, só local');
      return null;
    }

    /* Insere local imediatamente (UI responsiva) */
    var registroLocal = {
      _lead_uuid:         dados.lead_uuid,
      _agendamento_uuid:  dados.agendamento_uuid || null,
      _esp_id:            espId,
      _filial_id:         filialId,
      tipoResultado:      dados.tipo_resultado,
      tentativaDataHora:  dados.tentativa_data_hora || null,
      tentativaResultado: dados.tentativa_resultado || null,
      localTipo:          dados.local_tipo || null,
      tipo_c2:            dados.tipo_c2 || null,
      objecao:            dados.objecao || null,
      obs:                dados.obs || '',
      created_at:         new Date().toISOString(),
    };
    this.visitas.unshift(registroLocal);
    SLog.info('CREATE visita: ' + dados.tipo_resultado);

    if (typeof VisitaService === 'undefined') {
      SLog.warn('VisitaService indisponível — visita salva apenas em memória local.');
      return registroLocal;
    }

    VisitaService.registrar({
      lead_id:             dados.lead_uuid,
      agendamento_id:      dados.agendamento_uuid || null,
      especialista_id:     espId,
      filial_id:           filialId,
      tipo_resultado:      dados.tipo_resultado,
      tentativa_data_hora: dados.tentativa_data_hora || null,
      tentativa_resultado: dados.tentativa_resultado || null,
      local_tipo:          dados.local_tipo || null,
      tipo_c2:             dados.tipo_c2 || null,
      objecao:             dados.objecao || null,
      obs:                 dados.obs || '',
    }).then(function(reg) {
      if (reg && reg.id) registroLocal._uuid = reg.id;
    }).catch(function(err) {
      SLog.error('store.adicionarVisita: ' + err.message);
    });

    return registroLocal;
  }

  /* ================================================================
     TAREFA 7 — VENDAS
     adicionarVenda: cria 1 venda para o lead.
     dados = {
       lead_uuid, valor_adesao, valor_mensalidade,
       valor_rastreador, data_venda, aniversario, obs
     }
     Trigger do banco já cria os itens do checklist pós-venda.
     ================================================================ */
  adicionarVenda(dados) {
    if (!dados || !dados.lead_uuid || dados.valor_adesao == null) {
      SLog.warn('adicionarVenda: parâmetros obrigatórios ausentes');
      return null;
    }

    /* ═══════════════════════════════════════════════════════════
       Chamado #127 — a venda pertence a quem TRABALHOU o lead
       ═══════════════════════════════════════════════════════════
       ANTES: especialista_id = sempre o usuário LOGADO. Enquanto o
       próprio especialista fecha a venda dele, os dois coincidem e
       ninguém nota. Mas o #121 abriu o caso de o GERENTE lançar uma
       venda retroativa esquecida de outra pessoa — e aí a venda era
       creditada ao gerente. O especialista ficava sem a venda, sem a
       mensalidade e sem a comissão do ciclo (foi o #127: a Melissa
       parou em 14 vendas quando deveria ter 15).

       AGORA: a venda é atribuída ao responsável atual do lead, com
       queda para o captador e, só em último caso, para quem está
       logado. Assim quem registra deixa de importar para o crédito —
       o que importa é de quem é o cliente.

       Isso preserva o fluxo normal: quando o especialista fecha a
       própria venda, ele é o responsável do lead e continua recebendo
       o crédito, exatamente como antes.

       A filial acompanha a pessoa creditada, e não quem registrou —
       creditar a venda a um especialista e a filial a outra produziria
       relatório por filial inconsistente com o relatório por pessoa.
       A filial vem de store.usuarios (o lead local não carrega
       filial_id), com queda para a filial de quem está logado. */
    var leadDaVenda = (this.leads || []).find(function(l) {
      return l && l._uuid === dados.lead_uuid;
    }) || null;

    var espId = (leadDaVenda && (leadDaVenda.responsavel_id || leadDaVenda.captador_id)) || this._authUid();

    var donoVenda = (this.usuarios || []).find(function(u) {
      return u && (u._id || u.id) === espId;
    }) || null;
    var filialId = (donoVenda && donoVenda._filial_id) || this._authFilialId();

    if (leadDaVenda && espId !== this._authUid()) {
      SLog.info('VENDA-DONO (#127): crédito da venda do lead ' + (leadDaVenda.id || dados.lead_uuid) +
                ' atribuído ao responsável do lead (' + espId + '), não a quem registrou (' +
                this._authUid() + ')');
    }

    if (!espId) {
      SLog.warn('adicionarVenda: especialista_id ausente, só local');
      return null;
    }

    /* Insere/atualiza local imediato */
    var jaExiste = this.vendas.find(function(v) { return v._lead_uuid === dados.lead_uuid; });
    var registroLocal = jaExiste || {
      _lead_uuid: dados.lead_uuid,
      _esp_id:    espId,
      _filial_id: filialId,
      created_at: new Date().toISOString(),
    };

    registroLocal.valorAdesao      = Number(dados.valor_adesao) || 0;
    registroLocal.valorMensalidade = dados.valor_mensalidade != null ? Number(dados.valor_mensalidade) : null;
    registroLocal.valorRastreador  = dados.valor_rastreador  != null ? Number(dados.valor_rastreador)  : null;
    registroLocal.dataVenda        = dados.data_venda    || null;
    registroLocal.aniversario      = dados.aniversario   || null;
    registroLocal.obs              = dados.obs || '';

    if (!jaExiste) {
      this.vendas.unshift(registroLocal);
      SLog.info('CREATE venda (R$ ' + registroLocal.valorAdesao.toFixed(2) + ')');
    } else {
      SLog.info('UPDATE venda local');
    }

    if (typeof VendaService === 'undefined') {
      SLog.warn('VendaService indisponível — venda salva apenas em memória local.');
      return registroLocal;
    }

    VendaService.criar({
      lead_id:           dados.lead_uuid,
      especialista_id:   espId,
      filial_id:         filialId,
      valor_adesao:      dados.valor_adesao,
      valor_mensalidade: dados.valor_mensalidade,
      valor_rastreador:  dados.valor_rastreador,
      data_venda:        dados.data_venda,
      aniversario:       dados.aniversario,
      obs:               dados.obs,
    }).then(function(reg) {
      if (reg && reg.id) registroLocal._uuid = reg.id;
    }).catch(function(err) {
      SLog.error('store.adicionarVenda: ' + err.message);
    });

    return registroLocal;
  }

  /* ================================================================
     TAREFA 7 — CARTEIRA
     adicionarCarteiraInteracao: registra ligação/contato da carteira.
     dados = { lead_uuid, tipo, motivo, resultado, data_hora, obs }
     ================================================================ */
  adicionarCarteiraInteracao(dados) {
    if (!dados || !dados.lead_uuid || !dados.tipo) {
      SLog.warn('adicionarCarteiraInteracao: parâmetros obrigatórios ausentes');
      return null;
    }

    var espId    = this._authUid();
    var filialId = this._authFilialId();
    if (!espId) {
      SLog.warn('adicionarCarteiraInteracao: especialista_id ausente, só local');
      return null;
    }

    var registroLocal = {
      _lead_uuid: dados.lead_uuid,
      _esp_id:    espId,
      _filial_id: filialId,
      tipo:       dados.tipo,
      motivo:     dados.motivo || '',
      resultado:  dados.resultado || '',
      dataHora:   dados.data_hora || new Date().toISOString(),
      obs:        dados.obs || '',
    };
    this.carteiraInteracoes.unshift(registroLocal);
    SLog.info('CREATE carteira (' + dados.tipo + ')');

    if (typeof CarteiraService === 'undefined') {
      SLog.warn('CarteiraService indisponível — interação salva apenas em memória local.');
      return registroLocal;
    }

    CarteiraService.registrar({
      lead_id:         dados.lead_uuid,
      especialista_id: espId,
      filial_id:       filialId,
      tipo:            dados.tipo,
      motivo:          dados.motivo,
      resultado:       dados.resultado,
      data_hora:       dados.data_hora,
      obs:             dados.obs,
    }).then(function(reg) {
      if (reg && reg.id) registroLocal._uuid = reg.id;
    }).catch(function(err) {
      SLog.error('store.adicionarCarteiraInteracao: ' + err.message);
    });

    return registroLocal;
  }

  /* ================================================================
     CURRÍCULOS
     ================================================================ */
  adicionarCurriculo(c) {
    var maxId = Math.max(0, ...this.curriculos.map(function(x) { return x.id; }));
    c.id = maxId + 1;
    this.curriculos.push(c);
    SLog.info('CREATE currículo #' + c.id + ': ' + c.nome);
    this._logAudit('Novo Currículo', '—', c.nome + ' • ' + (c.cargo || ''));

    this._persist('INSERT curriculos', supa.from('curriculos').insert({
      nome:        c.nome,
      cargo:       c.cargo || '',
      email:       c.email || '',
      tel:         c.tel || '',
      nascimento:  c.nascimento || null,
      endereco:    c.endereco || '',
      sexo:        c.sexo || null,
      cnh:         c.cnh || false,
      experiencia: c.exp || 0,
      status:      c.status || 'recebido',
      nota:        c.nota || null,
      obs:         c.obs || '',
      perfil:      c.perfil || null, /* Chamado #73 */
      data_cadastro: c.dataCadastro || null, /* Chamado #71 */
      /* Chamado #118 — anexo (PDF) já pode ter sido enviado pro Storage
         antes de salvar o cadastro (caminho gerado na hora do upload,
         independente do id do currículo — ver CurriculoAnexoService). */
      anexo_path:          c.anexoPath || null,
      anexo_nome_original: c.anexoNomeOriginal || null,
      anexo_tamanho:       c.anexoTamanho || null,
    }).select().single().then(function(res) {
      if (res.data) c._uuid = res.data.id;
      return res;
    }));

    return c;
  }

  removerCurriculo(id) {
    var c = this.buscarCurriculo(id);
    this.curriculos = this.curriculos.filter(function(x) { return x.id !== id; });
    SLog.warn('DELETE currículo #' + id + (c ? ' — ' + c.nome : ''));
    this._logAudit('Exclusão Currículo', c ? c.nome : '#' + id, '—');

    if (c && c._uuid) {
      this._persist('DELETE curriculos', supa.from('curriculos').delete().eq('id', c._uuid));
    }
  }

  buscarCurriculo(id) {
    return this.curriculos.find(function(c) { return c.id === id; }) || null;
  }

  atualizarCurriculo(id, campos) {
    var c = this.buscarCurriculo(id);
    if (c) {
      Object.assign(c, campos);
      SLog.info('UPDATE currículo #' + id + ': ' + Object.keys(campos).join(', '));
      this._logAudit('Atualização Currículo (#' + id + ')', '—', Object.keys(campos).join(', '));

      if (c._uuid) {
        var dbCampos = {};
        if (campos.nome !== undefined) dbCampos.nome = campos.nome;
        if (campos.cargo !== undefined) dbCampos.cargo = campos.cargo;
        if (campos.email !== undefined) dbCampos.email = campos.email;
        if (campos.tel !== undefined) dbCampos.tel = campos.tel;
        if (campos.status !== undefined) dbCampos.status = campos.status;
        if (campos.nota !== undefined) dbCampos.nota = campos.nota;
        if (campos.obs !== undefined) dbCampos.obs = campos.obs;
        /* Ticket curriculos_perfil_check — igual ao INSERT (adicionarCurriculo),
           string vazia (opção "—" no select) precisa virar null, senão viola
           a constraint (que só aceita NULL ou um dos valores da lista). */
        if (campos.perfil !== undefined) dbCampos.perfil = campos.perfil || null; /* Chamado #73 */
        if (campos.dataCadastro !== undefined) dbCampos.data_cadastro = campos.dataCadastro; /* Chamado #71 */
        /* Chamado #118 — anexo (PDF): novo anexo, ou remoção (null). */
        if (campos.anexoPath !== undefined) dbCampos.anexo_path = campos.anexoPath;
        if (campos.anexoNomeOriginal !== undefined) dbCampos.anexo_nome_original = campos.anexoNomeOriginal;
        if (campos.anexoTamanho !== undefined) dbCampos.anexo_tamanho = campos.anexoTamanho;
        if (Object.keys(dbCampos).length > 0) {
          this._persist('UPDATE curriculos', supa.from('curriculos').update(dbCampos).eq('id', c._uuid));
        }
      }
    } else {
      SLog.warn('UPDATE currículo falhou: #' + id + ' não existe');
    }
    return c;
  }

  /* ================================================================
     USUÁRIOS
     ================================================================ */
  adicionarUsuario(u) {
    this.usuarios.push(u);
    SLog.info('CREATE usuário: ' + u.nome + ' (' + u.perfil + ')');
    this._logAudit('Novo Usuário', '—', u.nome + ' (' + u.perfil + ')');
  }

  /* ================================================================
     NOTIFICAÇÕES
     ================================================================ */
  adicionarNotificacao(msg, leadCodigo) {
    this.notifications.unshift({
      msg: msg, read: false, time: Utils.getHoraAtual(),
      _leadCodigo: leadCodigo || null,   /* Chamado #26: link pro card do lead */
    });
    SLog.load('NOTIF: ' + msg);

    var destId = this._authUid();
    if (destId) {
      var payload = { destinatario_id: destId, msg: msg };
      if (leadCodigo) payload.lead_codigo = leadCodigo;
      this._persist('INSERT notifications', supa.from('notifications').insert(payload));
    }
  }

  /* ────────────────────────────────────────────────────
     Notificar GESTORES da filial (RN-04 do DRS v1.2).
     Usado quando um agendamento é criado: cada gerente
     ativo responsável pela filial recebe uma notificação
     persistida no Supabase. O usuário que criou o
     agendamento NÃO recebe a própria notificação
     (a função SQL filtra auth.uid()).

     Parâmetros:
       filialId — UUID da filial do agendamento
       msg      — texto da notificação

     Retorna: Promise<number> com a quantidade de
              gerentes notificados (0 se algo falhar).
     ──────────────────────────────────────────────────── */
  async adicionarNotificacaoGestores(filialId, msg) {
    if (!supa) {
      SLog.warn('NOTIF gestores: Supabase offline');
      return 0;
    }
    if (!filialId) {
      SLog.warn('NOTIF gestores: filialId ausente — notificação ignorada');
      return 0;
    }
    if (!msg) {
      SLog.warn('NOTIF gestores: msg vazia — notificação ignorada');
      return 0;
    }

    try {
      var res = await supa.rpc('notificar_gerentes_da_filial', {
        p_filial_id: filialId,
        p_msg:       msg,
      });

      if (res.error) {
        SLog.error('NOTIF gestores: ' + res.error.message);
        return 0;
      }

      var qtd = res.data || 0;
      SLog.info('NOTIF gestores: ' + qtd + ' gerente(s) notificado(s)');
      return qtd;
    } catch (err) {
      SLog.error('NOTIF gestores exceção: ' + err.message);
      return 0;
    }
  }

  /* ────────────────────────────────────────────────────
     Chamado #56 — Notificar TODOS os usuários ativos.
     Usado na notificação de "alcance de meta", que deve chegar
     para todo mundo (fan-out: cada usuário recebe a SUA cópia,
     com seu próprio "lida"). Delega à RPC notificar_todos
     (SECURITY DEFINER) — ver migration_notificacoes_rls.sql.
     ──────────────────────────────────────────────────── */
  async notificarTodos(msg) {
    if (!supa || !msg) return 0;
    try {
      var res = await supa.rpc('notificar_todos', { p_msg: msg });
      if (res.error) { SLog.error('notificarTodos: ' + res.error.message); return 0; }
      var qtd = res.data || 0;
      SLog.info('notificarTodos: ' + qtd + ' usuário(s) notificado(s)');
      return qtd;
    } catch (err) {
      SLog.error('notificarTodos exceção: ' + err.message);
      return 0;
    }
  }

  marcarNotificacoesLidas() {
    var naoLidas = this.notifications.filter(function(n) { return !n.read; });
    var qtd = naoLidas.length;
    if (qtd === 0) return;

    /* Atualiza local imediatamente (UI responsiva) */
    this.notifications.forEach(function(n) { n.read = true; });
    SLog.info('NOTIF: ' + qtd + ' marcadas como lidas (local)');

    /* Persiste no banco em background.
       Sem a policy notifications_update_own no Supabase, este UPDATE
       falharia silenciosamente (RLS bloqueia) — ver patch_notifications_update.sql. */
    if (!supa) return;

    var userId = this._authUid();
    if (!userId) return;

    this._persist('UPDATE notifications.read',
      supa.from('notifications')
        .update({ read: true })
        .eq('destinatario_id', userId)
        .eq('read', false)
    );
  }

  /* ================================================================
     AUDIT LOG
     ================================================================ */
  _logAudit(campo, anterior, novo) {
    var nomeUsuario = this._authNome();
    var userId = this._authUid();
    /* Chamado #55 — carimbar _usuario_id e _datahora_iso já no registro
       local (não só no que vem do banco). Sem isso, um registro recém-
       criado pelo próprio usuário sumiria do recorte "meus últimos 3
       meses" do AuditModule até o próximo reload (quando o SupabaseSync
       recarrega com esses campos). */
    this.auditLog.unshift({
      usuario: nomeUsuario,
      _usuario_id: userId || null,
      _datahora_iso: new Date().toISOString(),
      campo: campo,
      anterior: anterior,
      novo: novo,
      datahora: Utils.getDataAtual()+' '+Utils.getHoraAtual(),
    });
    SLog.load('AUDIT: ' + campo + ' [' + anterior + ' → ' + novo + ']');

    /* Atualizar a tela imediatamente */
    if (typeof AuditModule !== 'undefined') AuditModule.render();

    this._persist('INSERT audit_log', supa.from('audit_log').insert({
      usuario_id: userId,
      usuario:    nomeUsuario,
      campo:      campo,
      anterior:   anterior || '—',
      novo:       typeof novo === 'object' ? JSON.stringify(novo) : (novo || ''),
    }));
  }

  /* ================================================================
     PESQUISA GLOBAL
     ================================================================ */
  pesquisar(q) {
    if (!q || q.length < 2) return [];
    var t = q.toLowerCase();
    var resultados = this.leads.filter(function(l) {
      return l.nome.toLowerCase().indexOf(t) >= 0 ||
        l.tel.indexOf(t) >= 0 ||
        l.id.toLowerCase().indexOf(t) >= 0 ||
        (l.fonte||'').toLowerCase().indexOf(t) >= 0;
    }).slice(0, 8);
    SLog.load('SEARCH: "' + q + '" → ' + resultados.length + ' resultado(s)');
    return resultados;
  }
}

var store = new Store();
