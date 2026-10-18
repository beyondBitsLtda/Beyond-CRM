/* ============================================================
   BEYOND CRM — js/modules/FunilModule.js   v2.14
   Módulo do Processo de Vendas — Kanban 6 etapas + detalhe lead.
   Implementa RN-01 a RN-29 do DRS v1.2
   Beyond Bits Tecnologia © 2026

   Histórico:
   - v2.14 (VIS-DATE-2 — Chamados de agendamento/remarcação):
       Corrige DOIS defeitos que tinham origem comum: as três
       decisões de "qual agendamento vale" (badge, ordem da coluna
       Visita e auto-avanço) usavam critérios DIFERENTES.
         • Badge/ordem = agendamento futuro criado mais recentemente.
         • Auto-avanço = data MAIS DISTANTE no tempo (d > atual).
       Resultado: ao remarcar pra uma data ANTERIOR (ou corrigir
       digitação pra mais cedo), o auto-avanço continuava enxergando
       o agendamento antigo (mais distante) e o lead ficava travado
       em Agendamento — sem avanço automático e sem caminho manual
       (o botão foi removido no #28 e o drag entre colunas é bloqueado).

       Correções:
         1) NOVO helper único `_agendamentoVigente(lead)` — o
            agendamento criado mais recentemente (passado OU futuro),
            ignorando cancelado/realizado. Passa a ser a ÚNICA fonte
            de verdade, consumida por: badge (KanbanCard), ordenação
            da Visita e auto-avanço. Fim da divergência.
         2) `autoAvancarVisitasVencidas` agora avalia o prazo do
            agendamento VIGENTE (não mais o mais distante) → remarcar
            pra frente OU pra trás e corrigir digitação passam a
            funcionar.
         3) `_ordenarVisitaHibrida` ordena a coluna Visita pela data
            do agendamento vigente de forma cronológica ASC (passado
            OU futuro): os atrasados sobem pro topo, depois hoje,
            depois futuros. Antes, quem já tinha vencido (auto-avançado)
            perdia a ordenação por data e caía no bloco de fallback.
         4) `confirmarAgendamento` dispara re-avaliação imediata após
            salvar, pro card reposicionar/avançar na hora, sem esperar
            o tick de 60s.
   - v2.0/2.1/2.2/2.3/2.4/2.5: ver commits anteriores.
   - v2.6 (Pacote 2 v1.4.0): feature 4.9 (RN-29)
       • Nada de código próprio — o RealtimeService.js cuida da
         escuta de eventos e chama renderKanban/atualizarKPIs/
         renderNumeroMagico/renderFunilPreview automaticamente.
         Apenas incrementa versionamento para refletir que este
         módulo agora é consumidor de sincronia em tempo real.
   - v2.7 (VIS-DATE-1 / Pacote 1.2 pós-homologação):
       Regra híbrida de ordenação na coluna VISITA — resolve o
       conflito entre RN-23 (ordem por data do agendamento) e
       RN-28 (drag manual). Antes, qualquer drag na Visita
       fixava o card no topo e mascarava a ordem por data, o
       que na prática impedia o especialista de identificar o
       "próximo atendimento" (queixa central da homologação).

       Nova regra na coluna Visita — 3 blocos concatenados:
         1) Bloco topo: leads COM agendamento FUTURO
              → ordena por data ASC (o próximo fica no topo).
              → ordem_manual é IGNORADA aqui.
         2) Bloco meio: leads SEM agendamento futuro mas com
            ordem_manual definido → respeita drag (RN-28).
         3) Bloco fim: leads sem agendamento futuro e sem
            ordem_manual → ordem natural (created_at).

       Nas demais colunas (Lead, Ligação, Agendamento, Venda,
       Carteira), a RN-28 continua exatamente como antes — a
       função _aplicarOrdemManual é aplicada normalmente.

       A função _ordenarVisitaPorAgendamento (v2.1) foi
       incorporada à nova _ordenarVisitaHibrida — o comentário
       da função antiga fica marcando o rastro.
   - v2.8 (VIS-DATE-1 / Pacote 1.3 pós-homologação):
       Regra de escolha do agendamento ativo alinhada ao KanbanCard
       v2.5. Antes, entre agendamentos futuros do mesmo lead, o
       código escolhia o mais PRÓXIMO no tempo — o que fazia um C2
       remarcando pra data mais distante ser ignorado. Corrigido:
       agora escolhe o mais RECENTEMENTE CRIADO (_created_at DESC).
       Isso reflete a intenção do especialista: o C2 supera o
       agendamento anterior.
   - v2.9 (Pacote 4 pós-homologação — T22, T23):
       Corrige a configuração de filtros avançados do Funil:
         • categoriaVeiculo agora usa as 6 opções OFICIAIS do
           dropdown do modal de agendamento (T22), em vez de
           derivar das categorias digitadas nos agendamentos
           existentes (que traziam erros de digitação, versões
           antigas e sinônimos).
         • Novo campo checkbox "Incluir arquivados" no drawer
           de filtros (T23). Ao marcar, força renderKanban a
           usar store.leadsPorEtapa(key, true), sobrescrevendo
           o toggle da toolbar. Ao desmarcar, o toggle da
           toolbar volta a mandar. Sincronização é feita via
           FunilModule._filtroIncluirArquivados().
   - v2.10 (Pacote 5 pós-homologação — T24, T25, T29):
       Filtros avançados do Dashboard:
         • Dropdown #nm-periodo estendido (T24) com 4 novas
           opções: "Últimos 90 dias", "Trimestre atual",
           "Ano atual" e "📅 Data personalizada..." (abre o
           drawer focando no campo daterange).
         • Novo handler onPeriodoDashboardChange() que roteia
           entre "custom" (abre drawer) e as demais opções
           (re-renderiza direto). Se o usuário selecionar
           "custom" e não preencher datas ou fechar o drawer,
           o dropdown reverte pra "Esta semana".
         • Ticket Médio agora reage ao filtro de período (T29)
           — antes usava base sem período (ignorarPeriodo:true).
           Mantém a semântica de "Associados" cumulativa (não
           faria sentido "associados no período de 3 dias").
         • NM agora reage ao filtro de usuário (T25): antes o
           _calcularMetaVendasConsolidada() ignorava a seleção
           do drawer e sempre somava as metas do perfil todo (ex.:
           gerente = soma de todos os especialistas). Agora se o
           drawer tem N usuários selecionados, a meta consolidada
           passa a somar SOMENTE esses N. Os REAIS já reagiam
           corretamente — a impressão de "não recalcula" vinha
           das metas paradas nos números grandes.
   - v2.11 (Pacote 6 pós-homologação — T26, T27):
       Corrige o registrarCuidarBase:
         • Normaliza "resultado" retirando o emoji "✅" que a UI
           adiciona só na opção "Atendeu" (T26). Antes o banco
           gravava tanto "Atendeu" quanto "✅ Atendeu", causando
           inconsistência e potencial rejeição por CHECK constraint.
         • Valida o motivo contra a lista fechada de 9 valores do
           <select #cb-motivo> (T27) e SEMPRE envia — antes,
           quando o select caía pra vazio por algum motivo, o
           motivo ia como '' e o CarteiraService descartava o
           campo (só envia se truthy), gerando linha com motivo NULL.
         • Log detalhado do payload REAL antes de enviar e do
           registro que voltou do banco, com aviso se o motivo
           não persistiu.
         • Fallback do array local usa o valor do banco (reg.motivo)
           antes do digitado, garantindo consistência.
   - v2.12 (Onda 1 pós-testes — Tickets #10, #13, #15, #16, #22):
       Bugs de persistência do lead.
       • #15 (Crítica): #mld-captador vira <select> populado com
         store.usuarios. _salvarCamposLead persiste captador_id
         (UUID) em vez do texto livre. store.atualizarLead expandiu
         whitelist pra aceitar captador_id.
       • #16 (Crítica): dirty tracking das abas de etapa
         (Ligação/Agendamento/Visita/Venda/Carteira). Snapshot ao
         abrir, ConfirmDialog ao fechar com rascunho. Usa
         Modal.setGuard v2.2. Métodos: _capturarSnapshotAbas,
         _detectarAlteracoesNaoSalvas, _forcarFecharModalLead.
         Todos os confirmar* trocam Modal.fechar('modal-lead') por
         FunilModule._forcarFecharModalLead() (pula guarda).
       • #10/#13 (Alta/Média): _cadastrarLeadEfetivo usa
         Promise.all pra INSERTs de lead_tags em paralelo, com
         coleta de falhas e Toast de aviso. RECONCILIAÇÃO final
         relê lead_tags do banco pra corrigir o local se algum
         INSERT falhou — sem esperar F5.
       • #22 (Média — parcial em conjunto com store.js v5.5 e
         SupabaseSync v1.6): defesa em profundidade. O UPDATE
         otimista de tentativas seta _pendingWrite.tentativas,
         que o novo carregarLeads in-place respeita, evitando
         sobrescrita stale. Referência estável de store.currentLead
         garante que _atualizarContadorTentativas atualize a UI
         corretamente.
   - v2.13 (Onda 2 pós-testes — Tickets #18, #23):
       • #23 parte 1: registrarInteracaoCarteira reescrito no
         mesmo padrão do registrarCuidarBase v3 — async/await
         direto no CarteiraService, log do payload enviado e do
         retorno, aviso claro se motivo voltar NULL do banco.
         Facilita diagnóstico se motivo continuar sumindo (aponta
         pra trigger/RLS/CHECK em vez do JS).
       • #18 + #23 parte 2: novo botão "Ver Histórico" na aba
         Carteira abre modal-hist-carteira. Métodos novos:
         abrirHistoricoCarteira, filtrarHistoricoCarteira,
         _renderHistoricoCarteira. Cache em memória de uma consulta
         por abertura pra que os cliques de filtro sejam instantâneos.
   ============================================================ */
'use strict';

class FunilModule {

  /* ---- KANBAN ---- */
  static renderKanban() {
    const $board = $('#kanban-board');
    if (!$board.length) return;
    $board.empty();

    /* v2.1 — Aplica classe de modo seleção no board (feature 4.3).
       O CSS usa `.k-selection-mode` para revelar os checkboxes dos cards. */
    $board.toggleClass('k-selection-mode', FunilModule._modoSelecao === true);

    /* 3B.6: filtro por filial aplicado sobre store.usuarios[captador_id].filial */
    const filialFiltro = FunilModule._filtroFilialAtual;

    STAGE_ORDER.forEach(key => {
      const cfg   = STAGE_CONFIG[key];

      /* v2.1 — Passa true em incluirArquivados quando o toggle está ativo (RN-21).
         O default do store (false) esconde arquivados de todos os outros usos.
         v2.9 (T23) — Toggle do drawer de filtros também pode ativar isso
         (override sobre o botão da toolbar). Ver _filtroIncluirArquivados. */
      let incluirArq = FunilModule._verArquivados === true
                    || FunilModule._filtroIncluirArquivados();
      let leads = store.leadsPorEtapa(key, incluirArq);

      if (filialFiltro) {
        leads = leads.filter(l => {
          const cap = store.usuarios.find(u => (u._id || u.id) === l.captador_id);
          if (!cap) return false;
          return cap.filial === filialFiltro.nome || cap.filial === 'Todas';
        });
      }

      /* v2.3 (RN-26 / feature 4.10): filtros avançados. Aplicados DEPOIS do
         filtro de filial (mais restritivo primeiro reduz o trabalho do avançado),
         ANTES da ordenação de Visita. Se o componente ainda não foi montado
         (edge case de render antes do bootstrap), silenciosamente ignora. */
      if (FunilModule._filtroAvancado && FunilModule._filtroAvancado.contarAtivos() > 0) {
        leads = FunilModule._filtroAvancado.filtrar(leads, {
          agendamentos: store.agendamentos || [],
          visitas:      store.visitas      || [],
        });
      }

      /* v2.7 (VIS-DATE-1 / Pacote 1.2) — Regra híbrida na coluna Visita.
         Substitui a lógica antiga (ordena por data → aplica ordem_manual
         por cima). Agora, na Visita:
           - leads COM agendamento FUTURO ordenam por data e não são
             afetados por ordem_manual;
           - leads sem futuro seguem RN-28 (ordem_manual → drag) e no
             fim os que não têm nenhum critério.
         Nas demais colunas o comportamento é o mesmo de antes: aplica
         ordem_manual sobre a ordem natural (created_at). */
      if (key === 'visita') {
        leads = FunilModule._ordenarVisitaHibrida(leads);
      } else {
        /* Chamado #27 — ordem de criação (mais novo no topo) em todas as
           colunas exceto Visita; ignora ordem_manual conforme decisão do
           cliente. */
        leads = FunilModule._ordenarPorCriacaoDesc(leads);
      }

      $board.append(FunilModule._buildColuna(key, cfg, leads));
    });
    $('#badge-funil').text(store.leads.length);

    /* v2.1 — Atualiza label/badge do botão "Ver arquivados" após render. */
    FunilModule._atualizarBotaoVerArquivados();

    /* v2.5 — Ativa drag-and-drop nas colunas recém-renderizadas.
       Feito por último pra garantir que o DOM está pronto. */
    FunilModule._ativarDragDrop();
  }

  /* v2.7 (VIS-DATE-1 / Pacote 1.2) — Substitui _ordenarVisitaPorAgendamento
     (v2.1) integrando também o critério de RN-28 (ordem_manual) para os
     leads que NÃO têm agendamento futuro. Regra em 3 blocos:

       1) leads com agendamento futuro → ordena por data ASC
       2) leads sem futuro mas com ordem_manual → respeita drag
       3) leads sem futuro e sem ordem_manual → ordem natural

     Detecção de "agendamento ativo" espelha a lógica do KanbanCard
     (VIS-DATE-1) — match por _lead_uuid OU ag.lead._uuid como fallback,
     pra manter consistência entre a posição do card e o badge exibido.

     Complexidade O(n × m) onde n = leads da Visita, m = agendamentos.
     Aceitável porque a coluna Visita costuma ter poucos leads (<30). */
  static _ordenarVisitaHibrida(leads) {
    if (!leads || leads.length <= 1) return leads;

    var comAgenda    = [];   /* { lead, ts } — tem agendamento vigente (passado OU futuro) */
    var comPassado   = [];   /* { lead, ts } — sem agendamento, mas com visita registrada */
    var comManual    = [];   /* sem agendamento/visita mas com ordem_manual */
    var restante     = [];   /* fallback: sem critério */

    leads.forEach(function(l) {
      /* v2.14 (VIS-DATE-2) — usa o agendamento VIGENTE (criado mais
         recentemente), independente de a data ser passada ou futura.
         Antes só considerava agendamento FUTURO, então os cards que
         acabaram de ser auto-avançados pra Visita (data já vencida)
         perdiam a ordenação por data e caíam no fallback. */
      var ag = FunilModule._agendamentoVigente(l);
      if (ag && ag.data) {
        var ts = new Date(ag.data).getTime();
        if (!isNaN(ts)) {
          comAgenda.push({ lead: l, ts: ts });
          return;
        }
      }

      /* Onda 5 fix (bug 4) — sem agendamento vigente, olha as VISITAS
         já registradas do lead (delay, C2, etc.). O especialista quer
         ver primeiro os cards com atividade mais recente. */
      var dataPassado = FunilModule._dataUltimaVisita(l);
      if (dataPassado != null) {
        comPassado.push({ lead: l, ts: dataPassado });
        return;
      }

      if (l.ordem_manual != null && l.ordem_manual !== '') {
        comManual.push(l);
      } else {
        restante.push(l);
      }
    });

    /* Bloco 1 — cronológico ASC pela data do agendamento vigente.
       Como é ASC, os atrasados (data mais antiga) sobem pro topo,
       seguidos de hoje e depois dos futuros — exatamente a leitura
       de "próximo atendimento / precisa de ação" pedida na homologação. */
    comAgenda.sort(function(a, b) { return a.ts - b.ts; });

    /* Bloco 2 — sort DESC por data da visita mais recente
       (atividade mais recente primeiro = precisa de próximo passo). */
    comPassado.sort(function(a, b) { return b.ts - a.ts; });

    /* Bloco 3 — sort por ordem_manual ASC (mesmo critério da RN-28) */
    comManual.sort(function(a, b) {
      return Number(a.ordem_manual) - Number(b.ordem_manual);
    });

    return comAgenda.map(function(x) { return x.lead; })
                    .concat(
                      comPassado.map(function(x) { return x.lead; }),
                      comManual,
                      restante
                    );
  }

  /* ============================================================
     v2.14 (VIS-DATE-2) — _agendamentoVigente
     ============================================================
     Fonte ÚNICA de verdade sobre "qual agendamento vale" para um
     lead. Consumida por: badge do card (KanbanCard._encontrarAgendamento),
     ordenação da coluna Visita (_ordenarVisitaHibrida) e auto-avanço
     (autoAvancarVisitasVencidas). Manter os três consumindo esta
     função é o que impede a divergência que causava os defeitos de
     remarcação.

     Regra: entre os agendamentos do lead (ignorando cancelado/
     realizado), escolhe o criado MAIS RECENTEMENTE (_created_at DESC),
     seja a data passada ou futura. Isso reflete a intenção atual do
     especialista — ao remarcar/corrigir, o novo agendamento sempre
     supera o anterior, mesmo que a data nova seja mais cedo que a
     antiga.

     Retorna o objeto do agendamento (shape do store.agendamentos) ou
     null se o lead não tiver nenhum agendamento ativo.

     Match por _lead_uuid OU ag.lead._uuid (fallback p/ agendamentos
     de versões antigas do store que não populavam _lead_uuid). */
  static _agendamentoVigente(lead) {
    if (!lead || !lead._uuid) return null;
    if (typeof store === 'undefined' || !store.agendamentos) return null;

    var uuid = lead._uuid;
    var candidatos = [];

    for (var i = 0; i < store.agendamentos.length; i++) {
      var ag = store.agendamentos[i];
      if (!ag || !ag.data) continue;

      var uuidAg = ag._lead_uuid || (ag.lead && ag.lead._uuid) || null;
      if (uuidAg !== uuid) continue;

      /* Ignora agendamentos cancelados/realizados — não representam
         mais um compromisso ativo. */
      if (ag._status === 'cancelado' || ag._status === 'realizado') continue;

      candidatos.push(ag);
    }

    if (!candidatos.length) return null;

    candidatos.sort(function(a, b) {
      var ca = a._created_at || '';
      var cb = b._created_at || '';
      if (cb !== ca) return cb.localeCompare(ca);   /* mais recém-criado primeiro */
      /* Desempate (mesmo instante de criação): data mais recente. */
      return (new Date(b.data).getTime() || 0) - (new Date(a.data).getTime() || 0);
    });

    return candidatos[0];
  }

  /* ============================================================
     Onda 5 fix (bug 4) — _dataUltimaVisita
     ============================================================
     Retorna o timestamp (ms) da tentativa_data_hora da VISITA mais
     recente do lead (qualquer tipo: delay, c2, nao_fechou), ou null
     se não houver histórico. Usado como fallback pela ordenação
     híbrida quando o lead não tem agendamento futuro.

     Nota: C2 confirmada cria agendamento futuro que é pego pelo
     _dataAgendamentoAtivo — só cai aqui se por algum motivo o
     agendamento não foi criado ou já venceu.
     ============================================================ */
  static _dataUltimaVisita(lead) {
    if (!lead || !lead._uuid) return null;
    if (typeof store === 'undefined' || !store.visitas) return null;

    var uuid = lead._uuid;
    var maisRecente = null;

    for (var i = 0; i < store.visitas.length; i++) {
      var v = store.visitas[i];
      if (!v) continue;
      var uuidV = v._lead_uuid || v.lead_id || (v.lead && v.lead._uuid) || null;
      if (uuidV !== uuid) continue;

      /* Prefere tentativa_data_hora; se ausente, cai em created_at */
      var raw = v.tentativa_data_hora || v._created_at || v.created_at;
      if (!raw) continue;
      var t = new Date(raw).getTime();
      if (isNaN(t)) continue;
      if (maisRecente == null || t > maisRecente) maisRecente = t;
    }

    return maisRecente;
  }

  /* v2.14 (VIS-DATE-2) — DEPRECADO como filtro de "futuro".
     Mantido por compatibilidade: agora apenas delega para
     _agendamentoVigente e devolve o timestamp (ms) do agendamento
     vigente do lead (passado OU futuro), ou null se não houver.

     O parâmetro `agoraTs` foi mantido na assinatura para não quebrar
     chamadas antigas, mas não é mais usado — a ordenação da Visita
     passou a considerar também datas passadas (atrasados). */
  static _dataAgendamentoAtivo(lead /*, agoraTs */) {
    var ag = FunilModule._agendamentoVigente(lead);
    if (!ag || !ag.data) return null;
    var t = new Date(ag.data).getTime();
    return isNaN(t) ? null : t;
  }

  static _buildColuna(key, cfg, leads) {
    /* Beyond CRM — a cor da etapa vira variável CSS (--stage): o tema usa
       pra marcar cabeçalho e cards sem pintar a coluna inteira. */
    const $col = $('<div>').addClass('k-col').attr('data-etapa', key).css('--stage', cfg.color);
    $col.append($('<div>').addClass('k-col-header').css('background', cfg.color).html(`
      <span class="k-col-icon">${cfg.icon}</span>
      <span class="k-col-label">${cfg.label}</span>
      <span class="k-col-count badge bg-white text-dark">${leads.length}</span>
    `));
    const $cards = $('<div>').addClass('k-col-body');
    if (!leads.length) {
      $cards.html(`<div class="k-empty">Sem leads</div>`);
    } else {
      leads.forEach(l => $cards.append(new KanbanCard(l, cfg.color).render()));
    }
    $col.append($cards);
    if (cfg.addLabel) {
      $col.append($('<button>').addClass('k-add-btn').html(`<i class="bi bi-plus-lg"></i> ${cfg.addLabel}`)
        .css({background: cfg.color+'22', color: cfg.color, 'border-color': cfg.color+'55'})
        .on('click', () => key === 'lead' ? FunilModule.novoLead() : FunilModule.abrirDetalhePorEtapa(key)));
    }
    return $col;
  }

  /* Chamado #108 — cálculo compartilhado entre o card resumido
     (renderFunilPreview) e o modal "Ver detalhado"
     (abrirDetalheFunilPreview), pra nunca divergir entre os dois.
     Retorna, por etapa: contagem só de ativos e contagem com
     arquivados; e os dois TOTAIS gerais (soma de todas as etapas). */
  static _calcularTotaisFunilPreview() {
    /* v2.4 (RN-27): aplica filtros de usuário/fonte do dashboard.
       Estado ATUAL do funil (não filtra por período — funil preview mostra
       onde os leads estão AGORA, não histórico do período). */
    const baseLeads = FunilModule._getLeadsFiltradosDashboard({ ignorarPeriodo: true });
    const totais = {};
    STAGE_ORDER.forEach(e => {
      totais[e] = baseLeads.filter(l => l.etapa === e).length;
    });

    const baseLeadsComArquivados = FunilModule._getLeadsFiltradosDashboard({ ignorarPeriodo: true, incluirArquivados: true });
    const totaisComArquivados = {};
    STAGE_ORDER.forEach(e => {
      totaisComArquivados[e] = baseLeadsComArquivados.filter(l => l.etapa === e).length;
    });

    return {
      totais,
      totaisComArquivados,
      totalAtivos:        Object.values(totais).reduce((a, b) => a + b, 0) || 1,
      totalComArquivados: Object.values(totaisComArquivados).reduce((a, b) => a + b, 0) || 1,
    };
  }

  /* ---- FUNIL PREVIEW (Dashboard) ---- */
  static renderFunilPreview() {
    const $c = $('#funil-preview');
    if (!$c.length) return;
    const cores = BX_COR.etapas;   /* Beyond CRM — cores das etapas do tema ativo */
    const labels = { lead:'Leads', ligacao:'Ligações', agendamento:'Agendamentos', visita:'Visitas', venda:'Vendas', carteira:'Carteira' };

    const { totais, totaisComArquivados, totalComArquivados } = FunilModule._calcularTotaisFunilPreview();

    /* Chamado #108 (reaberto) — a % de cada etapa passa a ser simples:
       "quantos % dos leads estão nesta etapa" = contagem da etapa ÷
       total de leads. O NÚMERO continua só ativos (sem arquivados); a %
       do card usa o total COM arquivados (ex.: 54 em Agendamento / 600
       no total = 9%). O botão "Ver detalhado" mostra as duas leituras
       (sem e com arquivados) lado a lado. */
    $c.html(STAGE_ORDER.map(e => {
      const n = totais[e];
      const pctNum = Math.round((totaisComArquivados[e] / totalComArquivados) * 100);
      return `<div class="funil-row">
        <div class="funil-lbl">${labels[e]}</div>
        <div class="funil-track"><div class="funil-fill" style="width:${Math.min(pctNum, 100)}%;background:${cores[e]};"></div></div>
        <div class="funil-val">${n}</div>
        <div class="funil-pct">${pctNum}%</div>
      </div>`;
    }).join(''));
  }

  /* Chamado #108 — botão "Ver detalhado" do card "Leads no Funil":
     mostra, etapa por etapa, o número e a % tanto SEM quanto COM
     arquivados, lado a lado. */
  static abrirDetalheFunilPreview() {
    const $body = $('#funil-detalhado-body');
    if (!$body.length) return;

    const labels = { lead:'Leads', ligacao:'Ligações', agendamento:'Agendamentos', visita:'Visitas', venda:'Vendas', carteira:'Carteira' };
    const { totais, totaisComArquivados, totalAtivos, totalComArquivados } = FunilModule._calcularTotaisFunilPreview();

    const linhas = STAGE_ORDER.map(e => {
      const pctAtivos = Math.round((totais[e] / totalAtivos) * 100);
      const pctArquiv = Math.round((totaisComArquivados[e] / totalComArquivados) * 100);
      return `
        <tr>
          <td>${labels[e]}</td>
          <td style="text-align:center;">${totais[e]}</td>
          <td style="text-align:center;">${pctAtivos}%</td>
          <td style="text-align:center;">${totaisComArquivados[e]}</td>
          <td style="text-align:center;">${pctArquiv}%</td>
        </tr>`;
    }).join('');

    $body.html(`
      <div class="table-wrap">
        <table class="amp-table">
          <thead>
            <tr>
              <th>Etapa</th>
              <th style="text-align:center;">Qtd. (ativos)</th>
              <th style="text-align:center;">% sem arquivados</th>
              <th style="text-align:center;">Qtd. (c/ arquivados)</th>
              <th style="text-align:center;">% com arquivados</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
          <tfoot>
            <tr style="font-weight:700;">
              <td>Total</td>
              <td style="text-align:center;">${totalAtivos}</td>
              <td style="text-align:center;">100%</td>
              <td style="text-align:center;">${totalComArquivados}</td>
              <td style="text-align:center;">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="small text-muted mt-2 mb-0">A % de cada etapa é <strong>quantos % dos leads estão naquela etapa</strong> (contagem da etapa ÷ total). "% sem arquivados" usa só os leads ativos; "% com arquivados" inclui os arquivados no total e na contagem de cada etapa. O card resumido do dashboard mostra a coluna "% com arquivados".</p>`);

    if (typeof openModal === 'function') openModal('modal-funil-detalhado');
    else if (typeof Modal !== 'undefined') Modal.abrir('modal-funil-detalhado');
  }

 /* ---- KPIs ---- */
  static atualizarKPIs() {
    /* Chamado #57 — especialista/supervisor SEM filtro veem os totais
       da EMPRESA nos 3 KPIs (Ligações, Ticket, Associados). */
    var _TE = (FunilModule._modoEmpresa && FunilModule._modoEmpresa())
      ? FunilModule._totaisEmpresa : null;
    if (_TE) {
      $('#kpi-associados').text(Number(_TE.carteira_total) || 0);
      /* Chamado #83 — o KPI de Ligações agora vem SEMPRE da RPC
         contar_ligacoes_totais (fonte única de verdade, sem o limit
         200 e com o recorte de carteira). Substitui o antigo
         _TE.ligacoes_total, que não tinha o recorte e divergia entre
         usuários. */
      FunilModule._atualizarKpiLigacoes();
      var tk = Number(_TE.ticket_medio) || 0;
      $('#kpi-ticket').text('R$ ' + tk.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      if (FunilModule._talvezCarregarTotaisEmpresa) FunilModule._talvezCarregarTotaisEmpresa();
      return;
    }

    /* v2.4 (RN-27): usa base filtrada por usuário/fonte (mas NÃO por período —
       KPIs de estado atual como "Associados" são cumulativos). */
    const baseLeads = FunilModule._getLeadsFiltradosDashboard({ ignorarPeriodo: true });
    const carteira  = baseLeads.filter(l => l.etapa === 'carteira');

    $('#kpi-associados').text(carteira.length);

    /* Chamado #83 — Ligações via RPC (fonte única). Ver _atualizarKpiLigacoes. */
    FunilModule._atualizarKpiLigacoes();

    /* ════════════════════════════════════════════════════════════
       Chamado #87 — Ticket Médio a partir das VENDAS (não dos leads).
       ════════════════════════════════════════════════════════════
       Bug: o cálculo lia l.mensalidade / l.mensalidadeEst do objeto
       LEAD. Mas o lead do banco só tem mensalidade_est (estimada do
       cadastro) — l.mensalidade nem é mapeado no sync. O valor real da
       venda (valor_mensalidade) mora em store.vendas. Resultado: se a
       mensalidade estimada estava vazia, o ticket zerava (caso da
       Fulana), e quando divergia da real, ficava errado.

       Regra do cliente (textual): "puxar os valores do campo Valor
       mensalidade registrado na coluna venda, divididos pela quantidade
       de vendas do especialista no filtro." → média de valorMensalidade
       das VENDAS filtradas (usuário + período + fonte), via o helper
       _getVendasFiltradasDashboard que já respeita todos os filtros do
       dashboard.
       ──────────────────────────────────────────────────────────── */
    const vendasPeriodo = FunilModule._getVendasFiltradasDashboard();
    const valores = vendasPeriodo
      .map(v => Number(v.valorMensalidade))
      .filter(v => !isNaN(v) && v > 0);
    const ticket = valores.length
      ? valores.reduce((a, b) => a + b, 0) / valores.length
      : 0;
    $('#kpi-ticket').text('R$ ' + ticket.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }

  /* ════════════════════════════════════════════════════════════
     Chamado #83 — KPI "Ligações" via RPC contar_ligacoes_totais
     ════════════════════════════════════════════════════════════
     Fonte ÚNICA de verdade do total de ligações. Resolve os dois
     problemas do chamado:
       1. Inconsistência entre usuários — o cálculo local usava
          store.ligacoes, limitado a 200 registros (carregarLigacoes),
          então cada usuário via um subconjunto diferente. A RPC é
          SECURITY DEFINER: conta a tabela inteira no banco, mesmo
          número pra todo mundo.
       2. Recorte de carteira — a RPC não conta ligações feitas após
          o lead entrar em carteira (usa leads.carteira_em), mas conta
          as feitas antes. Some as da coluna "Ligações" e os delays da
          "Visita" (mesma tabela ligacoes).

     Passa os filtros atuais do dashboard (usuários + período). O
     filtro de FONTE a RPC não cobre (exige olhar lead a lead), então
     quando há fonte ativa caímos no cálculo local — que desde o #83
     também aplica o recorte de carteira, ficando consistente.

     Assíncrono: atualiza #kpi-ligacoes quando a RPC responde. Enquanto
     isso o valor anterior permanece (sem piscar zero). Se a RPC falhar
     ou o Supabase estiver offline, cai no cálculo local como fallback.
     ──────────────────────────────────────────────────────────── */
  static _atualizarKpiLigacoes() {
    var $kpi = $('#kpi-ligacoes');

    /* Fallback local reusável (também usado quando há filtro de fonte).
       Chamado #131 — pede o histórico completo antes de contar; sem
       isso o número sai limitado às 200 ligações do cache de boot.
       Pinta o que tem agora e repinta quando o histórico chega. */
    var usarLocal = function() {
      try {
        var ligs = FunilModule._getLigacoesFiltradasDashboard();
        /* Chamado #131 — soma as tentativas pós-delay da aba Visita,
           que são ligações mas vivem na tabela `visitas`. Mesma conta
           da RPC contar_ligacoes_totais, pra os dois caminhos nunca
           mostrarem números diferentes. */
        $kpi.text(ligs.length + FunilModule._tentativasDelayFiltradas().length);
      } catch (e) {
        SLog.warn('_atualizarKpiLigacoes local: ' + e.message);
      }
    };
    var usarLocalComHistorico = function() {
      usarLocal();
      FunilModule._garantirLigacoesHist(usarLocal);
    };

    /* Filtro de fonte ativo → RPC não cobre; usa local (já com recorte). */
    var setFontes = FunilModule._filtroFontesDashboardSet
      ? FunilModule._filtroFontesDashboardSet() : null;
    if (setFontes) { usarLocalComHistorico(); return; }

    /* Sem supa (offline) → local, com o que estiver em cache. */
    if (typeof supa === 'undefined' || !supa) { usarLocal(); return; }

    /* Monta parâmetros da RPC a partir dos filtros do dashboard. */
    var setUsers = FunilModule._filtroUsuariosDashboardSet
      ? FunilModule._filtroUsuariosDashboardSet() : null;
    var pUsers = setUsers ? Array.from(setUsers) : null;

    var periodo = FunilModule._resolverPeriodoDashboard();
    var pIni = (periodo && periodo.inicio) ? new Date(periodo.inicio).toISOString() : null;
    var pFim = (periodo && periodo.fim)    ? new Date(periodo.fim).toISOString()    : null;

    /* Marca a chamada mais recente pra descartar respostas fora de ordem
       (usuário troca o filtro rápido e uma resposta antiga chega depois). */
    var chamada = (FunilModule._kpiLigChamada || 0) + 1;
    FunilModule._kpiLigChamada = chamada;

    supa.rpc('contar_ligacoes_totais', {
      p_users: pUsers,
      p_ini:   pIni,
      p_fim:   pFim,
    }).then(function(res) {
      /* Resposta obsoleta? ignora. */
      if (FunilModule._kpiLigChamada !== chamada) return;
      if (res.error) {
        SLog.warn('contar_ligacoes_totais: ' + res.error.message + ' — usando cálculo local');
        usarLocalComHistorico();
        return;
      }
      var total = Number(res.data);
      $kpi.text(isNaN(total) ? 0 : total);
    }).catch(function(err) {
      if (FunilModule._kpiLigChamada !== chamada) return;
      SLog.warn('contar_ligacoes_totais exceção: ' + err.message + ' — usando cálculo local');
      usarLocalComHistorico();
    });
  }
  /* ================================================================
     Chamado #57 — Visão da EMPRESA no dashboard para não-gerentes.
     ================================================================
     Especialista/supervisor só carregam os próprios dados (RLS), então
     por padrão os 4 campos (Número Mágico + 3 KPIs) mostram só o deles.
     O cliente quer que, SEM filtro, vejam o total da empresa. Como não
     dá pra somar a empresa no navegador deles (RLS), buscamos apenas os
     TOTAIS (números) via RPC SECURITY DEFINER — sem expor dado
     individual de colega. Com filtro de usuário ativo, ou sendo gerente,
     mantém-se o comportamento local de sempre. */
  static _modoEmpresa() {
    try {
      var prof = (typeof AuthService !== 'undefined') ? AuthService.currentProfile : null;
      if (!prof || prof.perfil === 'gerente') return false;  // gerente já vê tudo localmente
      var setU = FunilModule._filtroUsuariosDashboardSet ? FunilModule._filtroUsuariosDashboardSet() : null;
      if (setU && setU.size > 0) return false;                // filtro de usuário → visão específica
      return true;
    } catch (e) { return false; }
  }

  /* Chamado #90 — invalida o cache dos totais da empresa, forçando um
     novo fetch no próximo render. Chame ao mudar dados que afetam os
     números da empresa (ex.: via RealtimeService) se quiser os totais
     ao vivo para especialista/supervisor. */
  static invalidarTotaisEmpresa() {
    FunilModule._totaisEmpresa      = null;
    FunilModule._totaisEmpresaChave = null;
    FunilModule._totaisEmpresaLoading = null;
    FunilModule._totaisEmpresaFail  = null;
  }

  static _talvezCarregarTotaisEmpresa() {
    try {
      if (!FunilModule._modoEmpresa()) return;
      if (typeof supa === 'undefined' || !supa) return;

      var periodo = FunilModule._resolverPeriodoDropdown ? FunilModule._resolverPeriodoDropdown() : null;
      var ini = (periodo && periodo.inicio) ? new Date(periodo.inicio) : new Date(2000, 0, 1);
      var fim = (periodo && periodo.fim)    ? new Date(periodo.fim)    : new Date();

      /* ── Chamado #90 — CHAVE ESTÁVEL (fix do storm de requisições) ──
         Antes a chave usava fim.toISOString() com precisão de milissegundo
         (fim = new Date() vindo de _resolverPeriodoDropdown). Como mudava a
         cada chamada, os guards de chave/loading nunca batiam: cada render
         disparava uma RPC nova e, no sucesso, o re-render chamava este
         método outra vez com chave nova → loop infinito (ERR_INSUFFICIENT_
         RESOURCES / Failed to fetch). Só especialista/supervisor caíam nisso
         (modo empresa); o gerente nunca entra aqui.
         A chave agora é quantizada por DIA + a seleção do dropdown. Os
         PARÂMETROS enviados à RPC continuam com timestamp preciso. */
      var selPeriodo = ($('#nm-periodo').val() || '');
      var chave = selPeriodo + '|' + ini.toISOString().slice(0, 10) + '|' + fim.toISOString().slice(0, 10);

      /* já temos os totais desta chave, ou já estamos buscando */
      if (FunilModule._totaisEmpresaChave === chave && FunilModule._totaisEmpresa) return;
      if (FunilModule._totaisEmpresaLoading === chave) return;

      /* Cooldown de falha: se a MESMA chave falhou há < 8s, não re-dispara.
         Sem isso, sob erro de rede o re-render volta a martelar a RPC. */
      if (FunilModule._totaisEmpresaFail
          && FunilModule._totaisEmpresaFail.chave === chave
          && (Date.now() - FunilModule._totaisEmpresaFail.ts) < 8000) return;

      FunilModule._totaisEmpresaLoading = chave;

      supa.rpc('dashboard_totais_empresa', { p_ini: ini.toISOString(), p_fim: fim.toISOString() })
        .then(function(res) {
          FunilModule._totaisEmpresaLoading = null;
          if (res.error) {
            FunilModule._totaisEmpresaFail = { chave: chave, ts: Date.now() };
            SLog.error('dashboard_totais_empresa: ' + res.error.message);
            return;
          }
          FunilModule._totaisEmpresaFail = null;
          var mudou = (FunilModule._totaisEmpresaChave !== chave) || !FunilModule._totaisEmpresa;
          FunilModule._totaisEmpresa = res.data || null;
          FunilModule._totaisEmpresaChave = chave;
          /* Re-render UMA vez com os totais recém-chegados. O guard de
             chave acima impede que este render re-dispare a RPC. */
          if (mudou) {
            FunilModule.renderNumeroMagico();
            FunilModule.atualizarKPIs();
          }
        })
        .catch(function(err) {
          FunilModule._totaisEmpresaLoading = null;
          FunilModule._totaisEmpresaFail = { chave: chave, ts: Date.now() };
          SLog.error('dashboard_totais_empresa exceção: ' + err.message);
        });
    } catch (e) { SLog.warn('_talvezCarregarTotaisEmpresa: ' + e.message); }
  }

  /* Chamado #95 — mantém a legenda "Valores 'Real' são do período X"
     (nm-subtitle, index.html) sincronizada com o dropdown #nm-periodo.
     Chamada no boot e sempre que renderNumeroMagico roda (troca de
     período, filtro do drawer etc.). Lê o texto direto da <option>
     selecionada — não duplica a lista de labels aqui, então continua
     certo mesmo se o dropdown ganhar/perder opções no futuro. */
  static _atualizarLabelPeriodoNM() {
    var $opt = $('#nm-periodo option:selected');
    var label = $opt.length ? $opt.text() : 'período selecionado';
    $('#nm-periodo-label').text(label);
  }

  /* ---- NÚMERO MÁGICO (dados reais + filtro período + filtros avançados) ----
     Chamado #102 — opts.pularFallbackLocal: true faz este render pintar
     SÓ com o valor da RPC (fonte única, nm_totais_reais), sem passar
     pelo fallback local primeiro. Usado pelo RealtimeService: toda vez
     que QUALQUER usuário da empresa mexe em leads/ligações/etc., o
     Realtime chama renderNumeroMagico() de novo — e como o fallback
     local é síncrono e a RPC é assíncrona, cada uma dessas chamadas
     repintava primeiro com o valor local (podendo ser 0, por cache
     desatualizado) e só depois com o valor certo da RPC — visível como
     os cards "piscando" entre os dois valores em empresas com bastante
     atividade (várias chamadas Realtime por minuto). Com fonte de
     dashboard ativa a RPC não roda (não cobre esse filtro), então nesse
     caso o local CONTINUA sendo pintado sempre — é a única fonte ali. */
  static renderNumeroMagico(opts) {
    opts = opts || {};
    FunilModule._atualizarLabelPeriodoNM();
    /* v2.6 — REFATORAÇÃO BUG-A (Número Mágico correto):
       Cada card do NM agora conta EVENTOS ocorridos no período, lendo
       da fonte correspondente. Antes, contava "leads em etapa X" com
       filtro por _createdAt do lead — o que era estruturalmente errado:
         - VENDAS sempre mostrava 0 (leads viram etapa='carteira' logo
           após a venda, ninguém fica em 'venda').
         - Um lead captado antes do ciclo, mas vendido/agendado/visitado
           DENTRO do ciclo, não contava em NENHUM card.

       Semântica nova (alinhada com "20 leads → 12 contatos → 4 agend →
       2 visitas → 1 venda → 3 recomendações"):
         LEADS         = leads criados no período
         CONTATOS      = ligações no período onde HOUVE contato efetivo
                         (tipo_contato === 'contato' — exclui Não Atendeu,
                         Número Errado, Pediu para Retornar)
         AGENDAMENTOS  = agendamentos criados no período
         VISITAS       = visitas registradas no período
         VENDAS        = vendas registradas no período (por dataVenda)
         RECOMENDAÇÕES = interações de carteira tipo='recomendacao' no período

       O NM agora bate com o Atingimento de Metas (que sempre usou
       store.vendas por dataVenda). */

    var leadsNoPeriodo   = FunilModule._getLeadsFiltradosDashboard({ ignorarPeriodo: false });
    /* Chamado #100 — o card "Leads" do Número Mágico deve CONTAR os
       arquivados (só não conta os excluídos da base, que já nem entram
       em store.leads). Os demais cards continuam usando leadsNoPeriodo
       (sem arquivados), que é o comportamento correto pra eles. */
    var leadsNoPeriodoComArquivados = FunilModule._getLeadsFiltradosDashboard({ ignorarPeriodo: false, incluirArquivados: true });
    var ligsNoPeriodo    = FunilModule._getLigacoesFiltradasDashboard();
    var agendsNoPeriodo  = FunilModule._getAgendamentosFiltradosDashboard();
    var visitasNoPeriodo = FunilModule._getVisitasFiltradasDashboard();
    var vendasNoPeriodo  = FunilModule._getVendasFiltradasDashboard();
    var cartNoPeriodo    = FunilModule._getCarteiraFiltradaDashboard();

    /* Chamado #57 — quando é especialista/supervisor SEM filtro, os
       cards mostram o total da EMPRESA (via RPC), não só os dele. */
    var _TE = (FunilModule._modoEmpresa && FunilModule._modoEmpresa())
      ? FunilModule._totaisEmpresa : null;

    /* ══════════ Chamado #82 — REGRAS REAIS DO NÚMERO MÁGICO ══════════
       Cada card conta LEADS DISTINTOS que atendem ao critério. A fonte
       autoritativa e consistente entre usuários é a RPC nm_totais_reais
       (chamada em _atualizarNmReais, ao fim deste método). Este bloco é
       o fallback local — vale até a RPC responder e quando há filtro de
       FONTE ativo (a RPC cobre usuário+período, não fonte).            */
    function _distintosLig(ligs, pred) {
      var set = Object.create(null), n = 0;
      for (var i = 0; i < ligs.length; i++) {
        var l = ligs[i];
        if (l && l._lead_uuid && pred(l) && !set[l._lead_uuid]) { set[l._lead_uuid] = 1; n++; }
      }
      return n;
    }
    function _distintosVis(vis, pred) {
      var set = Object.create(null), n = 0;
      for (var i = 0; i < vis.length; i++) {
        var v = vis[i];
        if (v && v._lead_uuid && pred(v) && !set[v._lead_uuid]) { set[v._lead_uuid] = 1; n++; }
      }
      return n;
    }
    function _ehRecom(l) {
      var f = l.fonte || '';
      return f === 'Recomendação Associado' || f === 'Recomendação Não Associado';
    }

    var totais = {
      /* Chamado #100 — Leads: leads-raiz cadastrados pelo especialista no
         período, INCLUINDO arquivados e EXCLUINDO os excluídos da base
         (que já não existem em store.leads). Antes excluía arquivados;
         o cliente confirmou que arquivado deve contar normalmente aqui. */
      lead:        leadsNoPeriodoComArquivados.filter(function(l) { return !l.lead_pai_id; }).length,
      /* Chamado #99 — o botão da aba Ligação tem o rótulo "✅ Agendamento"
         (com o emoji — ver index.html), e é esse texto exato que fica
         gravado em ligacao.resultado, nunca o texto puro "Agendamento".
         A comparação abaixo usava o texto sem emoji e nunca batia — por
         isso "Agendamentos" ficava sempre 0 (e "Contato" sub-contava os
         leads cuja única ligação relevante fosse essa). */
      /* ═══════════════════════════════════════════════════════════
         Chamado #131 — CONTATO volta a exigir contato efetivo
         ═══════════════════════════════════════════════════════════
         O #126 tinha removido este filtro, fazendo o card contar
         qualquer ligação. O cliente corrigiu a interpretação no #131:

           "contato são todos os leads que passaram pela coluna ligação
            e tiveram como resultado as opções agendamento ou não agendou.
            Qualquer outro resultado não é contato."

         A própria tela de registro já dizia isso: os resultados estão
         agrupados em "Sem Contato" (Não Atendeu, Número Errado, Pediu
         para Retornar) e "Contato — conseguiu falar e expor o script"
         (Não Agendou, ✅ Agendamento). O card conta o segundo grupo.

         Onde o #126 continua valendo: no KPI "Ligações" do topo, que
         soma TODA ligação registrada, de qualquer resultado, exceto as
         da carteira. São métricas diferentes — "quantas ligações fiz"
         e "com quantos leads consegui falar". */
      ligacao:     _distintosLig(ligsNoPeriodo, function(l) {
                     return l.resultado === 'Não Agendou' || l.resultado === '✅ Agendamento';
                   }),
      /* Agendamento: leads distintos com ligação resultado '✅ Agendamento'. */
      agendamento: _distintosLig(ligsNoPeriodo, function(l) { return l.resultado === '✅ Agendamento'; }),
      /* Visitas: leads distintos com visita 'venda' ou 'nao_fechou' (exclui delay/c2/sem-resultado). */
      visita:      _distintosVis(visitasNoPeriodo, function(v) { return v.tipoResultado === 'venda' || v.tipoResultado === 'nao_fechou'; }),
      /* Vendas: leads distintos com visita 'venda'. */
      venda:       _distintosVis(visitasNoPeriodo, function(v) { return v.tipoResultado === 'venda'; }),
      /* Recomendações: leads com fonte de recomendação (qualquer coluna). */
      carteira:    leadsNoPeriodo.filter(_ehRecom).length,
    };

    /* dispara (uma vez por período) o carregamento dos totais da empresa */
    if (FunilModule._talvezCarregarTotaisEmpresa) FunilModule._talvezCarregarTotaisEmpresa();

    /* NM-FIX-1: metas derivadas de META_CONVERSAO × meta_vendas consolidada.
       Consolidação depende do perfil ativo:
         - especialista → própria meta_vendas
         - supervisor   → soma das meta_vendas dos especialistas cujos leads o supervisor enxerga
         - gerente      → soma das meta_vendas de todos especialistas ativos
       No modo-empresa (#57), usa a meta consolidada da empresa (da RPC).
       Se a soma final = 0 (sem meta cadastrada), o card renderiza traço, sem falso positivo. */
    const metaVendasBase = _TE ? (Number(_TE.meta_vendas_total) || 0)
                               : FunilModule._calcularMetaVendasConsolidada();
    const metas = {};
    STAGE_ORDER.forEach(e => {
      metas[e] = metaVendasBase > 0 ? (META_CONVERSAO[e] || 0) * metaVendasBase : 0;
    });

    /* Chamado Contato — guarda a base de meta pra o override assíncrono
       do card "Contato" recomputar meta/% com o valor vindo da RPC. */
    FunilModule._nmMetaBaseVendas = metaVendasBase;

    /* Chamado #102 — só pula a pintura local quando a RPC VAI rodar
       (sem filtro de fonte ativo). Com fonte ativa, a RPC não cobre
       esse cenário e o local segue sendo a única fonte — pinta sempre. */
    var _setFontesAtivo = FunilModule._filtroFontesDashboardSet
      ? FunilModule._filtroFontesDashboardSet() : null;
    if (!opts.pularFallbackLocal || _setFontesAtivo) {
      STAGE_ORDER.forEach(e => {
        FunilModule._pintarCardNM(e, totais[e], metas[e]);
      });
    }

    /* Chamado #82 — os 6 reais do Número Mágico vêm da RPC nm_totais_reais
       (fonte única, consistente entre TODOS os perfis para o mesmo filtro).
       Assíncrono: sobrescreve o fallback local assim que a RPC responde.
       Supersede o override antigo só-do-Contato. */
    FunilModule._atualizarNmReais();
  }

  /* Pinta um card do Número Mágico (real, meta, %, barra, achieved).
     Extraído do loop de renderNumeroMagico pra ser reusado pelo override
     assíncrono do card "Contato". */
  static _pintarCardNM(e, real, meta) {
    const pct = meta > 0 ? Math.round((real/meta)*100) : (real > 0 ? 100 : 0);
    const atingido = meta > 0 ? real >= meta : false;
    $(`#nm-real-${e}`).text(real);
    $(`#nm-meta-${e}`).text(meta);
    var pctTxt = meta > 0 ? ((atingido ? '✅ ' : '📈 ') + pct + '%') : '—';
    $(`#nm-pct-${e}`).text(pctTxt).removeClass('text-success text-danger');
    const $bar = $(`#nm-bar-${e}`);
    $bar.css('width', Math.min(pct,100)+'%')
      .toggleClass('bg-success', atingido)
      .toggleClass('bg-warning', !atingido && pct>=50)
      .toggleClass('bg-danger', pct<50);
    $(`#nm-card-${e}`).toggleClass('nm-achieved', atingido);
  }

  /* Override assíncrono do card "Contato" via RPC contar_contatos_efetivos.
     Espelha o padrão de _atualizarKpiLigacoes (#83): fonte única no banco,
     sem cap, com recorte de carteira. Com filtro de FONTE ativo a RPC não
     cobre → mantém o valor local já renderizado. Guard de sequência
     (_nmContatoChamada) descarta respostas obsoletas. */
  static _atualizarNmContato() {
    var setFontes = FunilModule._filtroFontesDashboardSet
      ? FunilModule._filtroFontesDashboardSet() : null;
    if (setFontes) return;                 /* fonte ativa → mantém local */
    if (typeof supa === 'undefined' || !supa) return;

    var setUsers = FunilModule._filtroUsuariosDashboardSet
      ? FunilModule._filtroUsuariosDashboardSet() : null;
    var pUsers = setUsers ? Array.from(setUsers) : null;

    var periodo = FunilModule._resolverPeriodoDashboard();
    var pIni = (periodo && periodo.inicio) ? new Date(periodo.inicio).toISOString() : null;
    var pFim = (periodo && periodo.fim)    ? new Date(periodo.fim).toISOString()    : null;

    var chamada = (FunilModule._nmContatoChamada || 0) + 1;
    FunilModule._nmContatoChamada = chamada;

    supa.rpc('contar_contatos_efetivos', { p_users: pUsers, p_ini: pIni, p_fim: pFim })
      .then(function(res) {
        if (FunilModule._nmContatoChamada !== chamada) return;   /* obsoleta */
        if (res.error) { SLog.warn('contar_contatos_efetivos: ' + res.error.message + ' — mantém local'); return; }
        var real = Number(res.data);
        if (isNaN(real)) return;
        var metaBase = Number(FunilModule._nmMetaBaseVendas) || 0;
        var meta = metaBase > 0 ? (META_CONVERSAO['ligacao'] || 0) * metaBase : 0;
        FunilModule._pintarCardNM('ligacao', real, meta);
      })
      .catch(function(err) {
        if (FunilModule._nmContatoChamada !== chamada) return;
        SLog.warn('contar_contatos_efetivos exceção: ' + err.message + ' — mantém local');
      });
  }

  /* Chamado #82 — override assíncrono dos 6 reais do Número Mágico via RPC
     nm_totais_reais(p_users, p_ini, p_fim). SECURITY DEFINER no banco →
     mesmo número para gerente e supervisor no mesmo filtro (resolve a
     inconsistência entre usuários). Roda para TODOS os perfis. Com filtro
     de FONTE ativo a RPC não cobre → mantém o fallback local. Guard de
     sequência descarta respostas obsoletas. */
  static _atualizarNmReais() {
    var setFontes = FunilModule._filtroFontesDashboardSet
      ? FunilModule._filtroFontesDashboardSet() : null;
    if (setFontes) return;                 /* fonte ativa → mantém local */
    if (typeof supa === 'undefined' || !supa) return;

    var setUsers = FunilModule._filtroUsuariosDashboardSet
      ? FunilModule._filtroUsuariosDashboardSet() : null;
    var pUsers = setUsers ? Array.from(setUsers) : null;

    var periodo = FunilModule._resolverPeriodoDashboard();
    var pIni = (periodo && periodo.inicio) ? new Date(periodo.inicio).toISOString() : null;
    var pFim = (periodo && periodo.fim)    ? new Date(periodo.fim).toISOString()    : null;

    var chamada = (FunilModule._nmReaisChamada || 0) + 1;
    FunilModule._nmReaisChamada = chamada;

    supa.rpc('nm_totais_reais', { p_users: pUsers, p_ini: pIni, p_fim: pFim })
      .then(function(res) {
        if (FunilModule._nmReaisChamada !== chamada) return;   /* obsoleta */
        if (res.error) { SLog.warn('nm_totais_reais: ' + res.error.message + ' — mantém local'); return; }
        var d = res.data || {};
        var metaBase = Number(FunilModule._nmMetaBaseVendas) || 0;
        /* card do NM -> chave retornada pela RPC (o card 'carteira' = recomendação) */
        var mapa = { lead:'lead', ligacao:'ligacao', agendamento:'agendamento', visita:'visita', venda:'venda', carteira:'recomendacao' };
        Object.keys(mapa).forEach(function(cardKey) {
          var real = Number(d[mapa[cardKey]]);
          if (isNaN(real)) return;
          var meta = metaBase > 0 ? (META_CONVERSAO[cardKey] || 0) * metaBase : 0;
          FunilModule._pintarCardNM(cardKey, real, meta);
        });
      })
      .catch(function(err) {
        if (FunilModule._nmReaisChamada !== chamada) return;
        SLog.warn('nm_totais_reais exceção: ' + err.message + ' — mantém local');
      });
  }

  /* NM-FIX-1: helper — consolida meta_vendas de acordo com o perfil ativo.
     Síncrono, opera sobre store.leads e store.usuarios já em memória.

     v2.10 (T25) — Agora respeita o filtro de USUÁRIOS do drawer do
     Dashboard. Se o gerente/supervisor filtrou por N especialistas,
     a meta consolidada passa a somar SOMENTE as meta_vendas desses
     especialistas — antes o cálculo ignorava o filtro e as metas
     ficavam sempre no total do perfil, dando a impressão de que o
     NM não recalculava (na verdade os REAIS mudavam, mas as METAS
     ficavam paradas). */
  static _calcularMetaVendasConsolidada() {
    const p = AuthService.currentProfile;
    if (!p) return 0;

    /* v2.10 (T25) — Verifica se há filtro por usuário ativo. Se sim,
       o cálculo passa a se basear na seleção do drawer (independente
       do perfil de quem consulta). */
    const filtroUsuarios = (FunilModule._filtroDashboard
                         && FunilModule._filtroDashboard.filtros
                         && FunilModule._filtroDashboard.filtros.usuarios) || null;

    if (Array.isArray(filtroUsuarios) && filtroUsuarios.length > 0) {
      const setSel = new Set(filtroUsuarios);
      return (store.usuarios || [])
        .filter(u => setSel.has(u._id || u.id) && u.status !== 'inativo')
        .reduce((acc, u) => acc + (Number(u.meta_vendas) || 0), 0);
    }

    /* Especialista: só a própria meta */
    if (p.perfil === 'especialista') {
      return Number(p.meta_vendas) || 0;
    }

    /* ── Chamado #74 — Meta do Número Mágico (visão gerente) ──
       Regra confirmada pelo cliente: o "número mágico" deve consolidar
       as metas de TODOS os usuários ativos, EXCETO os gerentes — ou
       seja, especialistas E supervisores (ambos vendem). Antes somava
       só especialistas (dava 38); incluindo supervisores fecha o total
       esperado (66 no cenário do cliente).
       Nota importante: o gerente NUNCA passa pela RPC dashboard_totais_
       empresa (_modoEmpresa() retorna false para gerente), então este
       cálculo local é a fonte de verdade da meta do gerente — não há
       migração SQL necessária para o caso do print. */
    if (p.perfil === 'gerente') {
      return (store.usuarios || [])
        .filter(u => (u.perfil === 'especialista' || u.perfil === 'supervisor')
                     && u.status !== 'inativo')
        .reduce((acc, u) => acc + (Number(u.meta_vendas) || 0), 0);
    }

    /* Supervisor: soma dos especialistas cujos leads o supervisor enxerga
       hoje + a PRÓPRIA meta (o supervisor também vende — Chamado #74).
       Identifica os responsavel_id únicos em store.leads (já filtrado
       pela RLS/visibilidade do supervisor) e soma as meta_vendas desses
       especialistas, acrescentando a meta do próprio supervisor.
       Nota: após VIS-SUP-1 fase 4, poderemos trocar por leitura direta
       da nova tabela de vínculo. */
    if (p.perfil === 'supervisor') {
      const responsaveisVisiveis = new Set();
      (store.leads || []).forEach(l => {
        if (l.responsavel_id) responsaveisVisiveis.add(l.responsavel_id);
      });
      const somaEsp = (store.usuarios || [])
        .filter(u => u.perfil === 'especialista' && responsaveisVisiveis.has(u.id))
        .reduce((acc, u) => acc + (Number(u.meta_vendas) || 0), 0);
      /* Própria meta do supervisor sempre entra (mesmo sem leads visíveis) */
      return somaEsp + (Number(p.meta_vendas) || 0);
    }

    return 0;
  }

  /* ---- NOVO LEAD ---- */
  static novoLead() {
    /* FIX BUG-ID: não gerar mais o ID localmente — era inconsistente com o
       código real gerado pela RPC proximo_lead_id() no banco (contador local
       diverge porque cada perfil vê só um subconjunto de leads). O ID real
       é atribuído no save e exibido no toast. */
    $('#nl-id').val('').attr('placeholder', 'Será gerado automaticamente ao salvar');
    $('#nl-data').val(Utils.getTodayDate());
    $('#nl-nome, #nl-tel, #nl-quem, #nl-placa, #nl-fipe, #nl-obs, #nl-mensest').val('');
    $('#nl-fonte').val('');
    $('#nl-tags').val('');
    Utils.limparInvalidos('#modal-novo-lead');   /* Patch UX-1 */
    $('#nl-captador').val(AuthService.currentProfile ? AuthService.currentProfile.nome : '');
    /* Popular tags disponíveis como botões toggle */
    var $tagSel = $('#nl-tags-select');
    $tagSel.empty();
    store.tags.forEach(function(slug) {
      var cfg = TAG_CONFIG[slug] || { cls: '', label: slug };
      $tagSel.append('<button type="button" class="amp-tag ' + cfg.cls + ' nl-tag-btn" data-slug="' + slug + '" style="font-size:11px;padding:4px 10px;cursor:pointer;opacity:0.5;" onclick="FunilModule.toggleNovaLeadTag(this)">' + cfg.label + '</button>');
    });
    $('#form-novo-lead').removeData('editId');
    Modal.abrir('modal-novo-lead');
    setTimeout(() => $('#nl-nome').focus(), 300);
  }

  static toggleNovaLeadTag(btn) {
    var $btn = $(btn);
    var selected = $btn.data('selected');
    if (selected) {
      $btn.css('opacity', '0.5').data('selected', false);
    } else {
      $btn.css('opacity', '1').data('selected', true);
    }
    /* Atualizar campo hidden com slugs selecionados */
    var tags = [];
    $('.nl-tag-btn').each(function() { if ($(this).data('selected')) tags.push($(this).data('slug')); });
    $('#nl-tags').val(tags.join(','));
  }

  static async salvarNovoLead() {
    /* Patch UX-1: validação consolidada com marcação visual */
    const ok = Utils.validarObrigatorios([
      { sel: '#nl-nome',  label: 'Nome' },
      { sel: '#nl-tel',   label: 'Telefone' },
      { sel: '#nl-fonte', label: 'Fonte do lead' },
    ]);
    if (!ok) return;

    /* Hotfix UX-1 — telefone precisa ter 10 ou 11 dígitos */
    if (!Utils.validarTelefone('#nl-tel', 'Telefone')) return;

    const nome     = $('#nl-nome').val().trim();
    const tel      = $('#nl-tel').val().trim();
    const fonte    = $('#nl-fonte').val();
    const captador = $('#nl-captador').val().trim();

    /* Ler tags selecionadas */
    var tagsStr = $('#nl-tags').val();
    var tags = tagsStr ? tagsStr.split(',') : [];

    /* Patch UX-1: converte valores monetários para Number ao salvar
       (input pode estar como "R$ 1.234,56") */
    const fipeNum = Utils.parseValor($('#nl-fipe').val());
    const mensNum = Utils.parseValor($('#nl-mensest').val());

    const lead = {
      /* FIX BUG-ID: id fica vazio aqui; store.adicionarLead vai preencher
         com o codigo retornado pela RPC proximo_lead_id() do banco. */
      id: '', nome, tel, fonte, captador,
      tags: tags, etapa:'lead', tentativas:0,
      obs:      $('#nl-obs').val().trim(),
      placa:    $('#nl-placa').val().trim(),
      fipe:           fipeNum != null ? fipeNum : '',
      mensalidadeEst: mensNum != null ? mensNum : '',
      quemIndicou:    $('#nl-quem').val().trim(),
    };

    /* ============================================================
       v2.2 — RN-25 / Feature 4.4: detecção de telefone duplicado
       ============================================================
       Antes de fazer o INSERT, consulta o banco pelo telefone
       normalizado. Se houver duplicidade, guarda o payload
       pendente e abre o modal de alerta pro usuário decidir.
       Se o service não estiver disponível (código antigo), cai
       no fluxo direto sem quebrar.
       ============================================================ */
    if (typeof LeadDuplicadoService !== 'undefined') {
      /* Feedback visual: desabilita o botão salvar enquanto consulta */
      var $btnSalvar = $('#modal-novo-lead .amp-modal-footer .btn-primary-amp').first();
      var htmlOrig = $btnSalvar.html();
      $btnSalvar.prop('disabled', true).html('<i class="bi bi-arrow-repeat spin-icon"></i> Verificando...');

      var duplicados = [];
      try {
        duplicados = await LeadDuplicadoService.buscarPorTelefone(tel);
      } catch (e) {
        SLog.error('salvarNovoLead: checagem dup falhou — ' + e.message);
        /* Fail-open: se a checagem falhar, segue o cadastro normal
           pra não travar o especialista. O banco não bloqueia; a
           feature é só de alerta. */
      }
      $btnSalvar.prop('disabled', false).html(htmlOrig);

      if (duplicados && duplicados.length > 0) {
        /* Guarda o payload e abre modal de alerta */
        FunilModule._leadPendenteDup = { lead: lead, tags: tags, duplicados: duplicados };
        FunilModule._abrirModalTelDuplicado(lead, duplicados);
        return; /* Não cadastra ainda; espera decisão do usuário. */
      }
    }

    /* Fluxo limpo — sem duplicidade */
    await FunilModule._cadastrarLeadEfetivo(lead, tags);
  }

  /* ============================================================
     v2.2 — Helper extraído: cadastro efetivo (INSERT + tags + UI)
     Reusado pelo fluxo limpo do salvarNovoLead E pelo fluxo pós-
     confirmação de duplicidade (confirmarCadastroComDuplicado).
     ============================================================ */
  static async _cadastrarLeadEfetivo(lead, tags) {
    await store.adicionarLead(lead);

    /* ================================================================
       Onda 1 (Tickets #10, #13 / PERS-3) — Persistência robusta de tags
       ================================================================
       Antes: for-loop sequencial silenciava falhas individuais.
       Se uma INSERT falhasse (RLS, rede, tag inexistente), a próxima
       renderização do Kanban usava lead.tags do LOCAL (que tinha as
       tags) — dando ilusão de que salvou. No próximo F5, o banco não
       tinha as tags, e o card renderizava sem elas.

       Agora:
         1. Promise.all em paralelo com tratamento explícito por tag.
         2. Coleta falhas e mostra Toast informativo se alguma falhar.
         3. RECONCILIAÇÃO final: re-lê lead_tags do banco e ajusta o
            lead.tags local pra bater com a verdade do banco. Assim
            se qualquer INSERT falhou, o card já renderiza a realidade
            desde a primeira renderização — sem esperar F5.
       ================================================================ */
    if (supa && lead._uuid && tags && tags.length > 0) {
      var falhas = [];
      var resultados = await Promise.all(tags.map(async function(slug) {
        try {
          var tagRes = await supa.from('tags').select('id').eq('slug', slug).single();
          if (!tagRes.data) {
            falhas.push(slug + ' (slug não encontrado)');
            return { slug: slug, ok: false };
          }
          var insRes = await supa.from('lead_tags').insert({ lead_id: lead._uuid, tag_id: tagRes.data.id });
          if (insRes.error) {
            falhas.push(slug + ' (' + insRes.error.message + ')');
            SLog.error('DB INSERT lead_tags ' + slug + ': ' + insRes.error.message);
            return { slug: slug, ok: false };
          }
          SLog.info('DB INSERT lead_tags: ' + slug + ' ✓');
          return { slug: slug, ok: true };
        } catch (e) {
          falhas.push(slug + ' (exceção: ' + e.message + ')');
          SLog.error('DB lead_tags exceção: ' + e.message);
          return { slug: slug, ok: false };
        }
      }));

      /* Reconciliação: relê do banco e ajusta lead.tags local */
      try {
        var relRes = await supa
          .from('lead_tags')
          .select('tag:tags(slug)')
          .eq('lead_id', lead._uuid);
        if (relRes.data) {
          lead.tags = relRes.data
            .map(function(row) { return row.tag && row.tag.slug; })
            .filter(Boolean);
          SLog.info('Reconciliação lead_tags: ' + lead.tags.length + ' tag(s) confirmada(s)');
        }
      } catch (e) {
        SLog.error('Reconciliação lead_tags exceção: ' + e.message);
      }

      /* Avisa o usuário se houve falha (sem bloquear o fluxo — o
         lead foi criado; só as tags falharam). */
      if (falhas.length > 0) {
        Toast.show(
          'Lead criado, mas ' + falhas.length + ' tag(s) falharam ao salvar. '
          + 'Tente adicioná-las manualmente pelo modal do lead.',
          'warning'
        );
        SLog.warn('Tags que falharam: ' + falhas.join('; '));
      }
    }

    FunilModule.renderKanban();
    FunilModule.renderFunilPreview();
    FunilModule.renderNumeroMagico();
    AtividadeModule.adicionar('🌱', lead.nome, 'Lead cadastrado', lead.fonte, '#D1FAE5', '#059669', 'lead');
    Modal.fechar('modal-novo-lead');
    /* FIX BUG-ID: lead.id agora é o codigo REAL retornado pelo banco
       (preenchido em store.adicionarLead). */
    Toast.show('Lead ' + (lead.id || '') + ' cadastrado com sucesso!', 'success');
  }

  /* ---- DETALHE DO LEAD ---- */
  static abrirDetalhe(id) {
    const lead = store.buscarLead(id);
    if (!lead) return;
    store.currentLead = lead;
    FunilModule._popularModal(lead);
    Modal.abrir('modal-lead');

    /* ============================================================
       Onda 3 fix v3 (Ticket #16, quarta iteração e definitiva) —
       DIRTY TRACKING POR BASELINE PER-CAMPO
       ============================================================
       Filosofia: só marcamos "dirty" quando o usuário efetivamente
       INTERAGE com um campo E o valor final desse campo é diferente
       do valor que ele tinha NO MOMENTO em que o usuário começou
       a interagir.

       Como funciona:
       1. Quando o usuário DÁ FOCUS num input/select/textarea das
          abas de etapa, capturamos o valor atual como "baseline"
          num atributo data-* daquele campo específico (só na
          PRIMEIRA vez, pra não sobrescrever a cada refocus).
       2. Campos que o usuário NUNCA tocou não têm baseline — ficam
          fora da verificação (não podem gerar falso positivo).
       3. Ao fechar, comparamos baseline vs valor atual de cada
          campo tocado. Se qualquer um difere → prompt.

       Isso ignora completamente qualquer preenchimento async
       feito pelo código (LigacaoService.ultimaDoLead, CarteiraService.
       listar etc.) — porque .val() de código NÃO dispara focus/mousedown.

       A aba Lead é excluída por convenção (seletor específico) porque
       autosave OBS-3.5 já garante persistência dela.

       Ticket #8 (teste #85, 2ª iteração) — botões .res-opt/.vres-btn
       (Não Atendeu, Não Agendou, Agendamento etc.) NÃO entram mais
       nesse rastreamento. Antes, só CLICAR num resultado (sem chegar
       a apertar "Registrar Resultado") já disparava o alerta ao
       fechar — mas escolher um resultado é reversível e rápido de
       refazer, não é "trabalho perdido" no mesmo sentido que texto
       digitado. Só os campos de texto/data/select (observações,
       datas, etc.) continuam gerando o aviso.
       ============================================================ */
    var $modal = $('#modal-lead');
    /* Limpa baselines de aberturas anteriores */
    $modal.find('[data-dirty-baseline]').removeAttr('data-dirty-baseline');
    /* Remove listeners anteriores */
    $modal.off('.dirty3');

    /* Onda 3 fix v3.1 — CORREÇÃO CRÍTICA do seletor.
       A versão anterior usava:
           '#tab-ligacao, #tab-agendamento, ..., #tab-carteira input'
       CSS interpretou a vírgula como separador de seletores INDEPENDENTES,
       então só '#tab-carteira input' era "input dentro da aba Carteira".
       Os outros 4 casavam com o elemento .tab-* em si (que não emite focusin).
       Só a aba Carteira estava sendo monitorada → falso negativo em todas
       as outras.

       Correção: usa seletor único que cobre TODOS os campos do modal-body
       (inclusive #mld-obs que está fora das abas). Sem exclusões — quando
       o usuário toca em qualquer campo e muda o valor, o prompt aparece. */

    /* Captura baseline no PRIMEIRO focusin em input/select/textarea */
    $modal.on('focusin.dirty3',
      '.amp-modal-body input, .amp-modal-body select, .amp-modal-body textarea',
      function() {
        if (this.getAttribute('data-dirty-baseline') === null) {
          this.setAttribute('data-dirty-baseline', this.value || '');
          SLog.info('dirty3 baseline: ' + (this.id || 'sem-id') + ' = "' + (this.value || '') + '"');
        }
      }
    );

    /* Guarda de fechamento */
    Modal.setGuard('modal-lead', function(fecharPadrao) {
      var diffs = FunilModule._detectarDiffsPorBaseline();
      if (!diffs.length) return false; /* fecha limpo — nada mudou */

      SLog.info('dirty3: alterações detectadas em ' + diffs.length + ' campo(s): ' + diffs.join(' | '));

      ConfirmDialog.show(
        '⚠️',
        'Alterações não salvas',
        'Você fez alterações nesta ficha que ainda não foram confirmadas. ' +
        'Se fechar agora, os dados preenchidos serão perdidos. ' +
        'Deseja fechar mesmo assim?',
        function() {
          Modal.clearGuard('modal-lead');
          Modal.fechar('modal-lead', true);
          /* Limpa baselines pra próxima abertura ficar limpa */
          $('#modal-lead').find('[data-dirty-baseline]').removeAttr('data-dirty-baseline');
        }
      );
      return true;
    });
  }

  /* ============================================================
     Onda 3 fix v3 — verificação de diffs por baseline per-campo
     ============================================================ */
  static _detectarDiffsPorBaseline() {
    var diffs = [];
    var $modal = $('#modal-lead');

    /* Inputs / selects / textareas com baseline capturado */
    $modal.find('input[data-dirty-baseline], select[data-dirty-baseline], textarea[data-dirty-baseline]')
      .each(function() {
        var base = this.getAttribute('data-dirty-baseline');
        var atual = this.value || '';
        if (atual !== base) {
          diffs.push((this.id || 'sem-id') + ' ("' + base + '" → "' + atual + '")');
        }
      });

    /* Ticket #8 (teste #85, 2ª iteração) — botões .res-opt/.vres-btn não
       são mais rastreados aqui (ver nota em abrirDetalhe). Selecionar um
       resultado sozinho não conta mais como "alteração não salva". */

    return diffs;
  }

  /* Chamado #85 — grava o estado ATUAL de cada campo rastreado como novo
     baseline. Chamado após um registro que persiste dados mas mantém o
     modal aberto (ex.: registrarLigacao), evitando o falso alerta de
     'Alterações não salvas' ao fechar. */
  static _rebaselinearModalLead() {
    var $modal = $('#modal-lead');
    $modal.find('input[data-dirty-baseline], select[data-dirty-baseline], textarea[data-dirty-baseline]')
      .each(function() { this.setAttribute('data-dirty-baseline', this.value || ''); });
  }
  static abrirDetalhePorEtapa(etapa) {
    const ls = store.leadsPorEtapa(etapa);
    if (ls.length) FunilModule.abrirDetalhe(ls[0].id);
    else Toast.show('Nenhum lead nesta etapa','info');
  }

  static _popularModal(lead) {
    const idx = STAGE_ORDER.indexOf(lead.etapa);
    const cfg = STAGE_CONFIG[lead.etapa];
    const $m  = $('#modal-lead');

    /* Hotfix VAL-1 — limpa marcações de invalid de sessões anteriores.
       Necessário porque o auto-clear do marcarInvalido só dispara em
       input/change; se o usuário só fecha e reabre o modal sem editar,
       a classe persiste no DOM. */
    Utils.limparInvalidos('#modal-lead');

    /* Header */
    $m.find('#mld-nome').text(lead.nome);
    $m.find('#mld-id').text(lead.id);
    $m.find('#mld-stage').text(cfg.icon+' '+cfg.label).css({background:cfg.color+'22',color:cfg.color});

    /* Abas progressivas — RN-11 */
    STAGE_ORDER.forEach((s,i) => {
      const $tab = $m.find(`[data-tab="${s}"]`);
      if (i <= idx) $tab.removeClass('disabled').removeAttr('disabled');
      else $tab.addClass('disabled').attr('disabled','disabled');
    });
    /* Ativa aba atual */
    $m.find('.lead-tab').removeClass('active');
    $m.find('.lead-tab-pane').removeClass('active');
    $m.find(`[data-tab="${lead.etapa}"]`).addClass('active');
    $('#tab-'+lead.etapa).addClass('active');

    /* Preenche campos */
    FunilModule._preencherAbaLead(lead);
    FunilModule._preencherAbaLigacao(lead);
    FunilModule._preencherAbaAgendamento(lead);
    FunilModule._preencherAbaVisita(lead);
    FunilModule._preencherAbaVenda(lead);
    FunilModule._preencherAbaCarteira(lead);
    FunilModule._atualizarBotoesModal(lead);
    FunilModule._atualizarRemarketing(lead.tentativas);
  }

  /* ============================================================
     Onda 1 (Ticket #16 / PERS-2) — Dirty tracking das abas de etapa
     ============================================================
     A aba Lead tem autosave OBS-3.5 (já cobre fonte, captador, placa,
     fipe, mensalidade, obs). As demais abas (Ligação, Agendamento,
     Visita, Venda, Carteira) SÓ persistem quando o usuário clica em
     "Confirmar" na aba respectiva. Sem esse tracking, dados
     preenchidos e não confirmados sumiam silenciosamente ao fechar.

     Estratégia:
       1. Após popular o modal, tira um snapshot dos campos-chave de
          cada aba de etapa (via _capturarSnapshotAbas).
       2. Ao tentar fechar, compara snapshot × estado atual. Se algo
          mudou em pelo menos uma aba, avisa com ConfirmDialog.

     Campos monitorados por aba (só os que representam RASCUNHO
     não persistido — os do painel de resultado/consulta ficam fora):
       Ligação:    #lig-datetime, seleção de #tab-ligacao .res-opt
       Agendamento: #agen-data-feito, #agen-data-visita, #agen-cat, #agen-local
       Visita:      seleção de #tab-visita .vres-btn + detalhe da opção
       Venda:       #venda-adesao, #venda-mensalidade, #venda-rastreador,
                    #venda-data, #venda-aniversario
       Carteira:    #cart-datetime + seleção de resultado + campos rec-*
                    #cb-motivo, #cb-datetime, #cb-obs + resultado

     ============================================================ */
  static _capturarSnapshotAbas() {
    function selRes(seletor) {
      var $sel = $(seletor + ' .res-opt.selected').first();
      return $sel.length ? ($sel.text() || '').trim() : '';
    }
    function selVres() {
      var $sel = $('#tab-visita .vres-btn.selected').first();
      return $sel.length ? ($sel.data('tipo') || '') : '';
    }
    function selCbRes() {
      var $sel = $('#cb-resultado-opts .res-opt.selected').first();
      return $sel.length ? ($sel.text() || '').trim() : '';
    }
    return {
      ligacao: {
        datetime: $('#lig-datetime').val() || '',
        resultado: selRes('#tab-ligacao'),
      },
      agendamento: {
        dataFeito: $('#agen-data-feito').val() || '',
        dataVisita: $('#agen-data-visita').val() || '',
        cat: $('#agen-cat').val() || '',
        local: $('#agen-local').val() || '',
      },
      visita: {
        tipo: selVres(),
      },
      venda: {
        adesao: $('#venda-adesao').val() || '',
        mensalidade: $('#venda-mensalidade').val() || '',
        rastreador: $('#venda-rastreador').val() || '',
        data: $('#venda-data').val() || '',
        aniversario: $('#venda-aniversario').val() || '',
      },
      carteira: {
        cartDatetime: $('#cart-datetime').val() || '',
        cbMotivo: $('#cb-motivo').val() || '',
        cbDatetime: $('#cb-datetime').val() || '',
        cbObs: $('#cb-obs').val() || '',
        cbResultado: selCbRes(),
      },
    };
  }

  static _detectarAlteracoesNaoSalvas() {
    var snap = FunilModule._snapshotAbasEtapa;
    if (!snap) return { temAlteracoes: false, abas: [], abasDescricao: '' };
    var atual = FunilModule._capturarSnapshotAbas();
    var abas = [];

    function difere(a, b) {
      var ka = Object.keys(a || {});
      for (var i = 0; i < ka.length; i++) {
        if ((a[ka[i]] || '') !== (b[ka[i]] || '')) return true;
      }
      return false;
    }

    if (difere(snap.ligacao,     atual.ligacao))     abas.push('Ligação');
    if (difere(snap.agendamento, atual.agendamento)) abas.push('Agendamento');
    if (difere(snap.visita,      atual.visita))      abas.push('Visita');
    if (difere(snap.venda,       atual.venda))       abas.push('Venda');
    if (difere(snap.carteira,    atual.carteira))    abas.push('Carteira');

    var desc = '';
    if (abas.length === 1) desc = 'na aba ' + abas[0];
    else if (abas.length === 2) desc = 'nas abas ' + abas[0] + ' e ' + abas[1];
    else if (abas.length > 2) desc = 'nas abas ' + abas.slice(0, -1).join(', ') + ' e ' + abas[abas.length - 1];

    return { temAlteracoes: abas.length > 0, abas: abas, abasDescricao: desc };
  }

  /* ============================================================
     Onda 1 (Ticket #16 / PERS-2) — Ganchos de limpeza da guarda
     ============================================================
     Cada método confirmar* já chama Modal.fechar('modal-lead') após
     persistir. Isso passa pela guarda que compara snapshots — se
     o próprio confirmar já persistiu os dados, ainda assim o
     snapshot antigo pode diferir do atual porque a aba mudou.

     Solução: sempre que um confirmar rodar, atualiza o snapshot pra
     bater com o estado atual ANTES de fechar. Assim a guarda vê
     "sem alterações" e fecha limpo. Como esses fluxos passam por
     Modal.fechar('modal-lead') sem o `true`, eles precisariam do
     `true` — MAS quero manter a compatibilidade: só chamo essa
     função dos confirmar* pra pular a guarda de forma explícita.
     ============================================================ */
  static _forcarFecharModalLead() {
    Modal.clearGuard('modal-lead');
    Modal.fechar('modal-lead', true);
    /* Onda 3 fix v3 — limpa baselines pra próxima abertura ficar zerada */
    $('#modal-lead').find('[data-dirty-baseline]').removeAttr('data-dirty-baseline');
    /* Legados — mantidos pra compat caso algo externo consulte */
    FunilModule._userInteragiu = false;
    FunilModule._snapshotAbas = null;
    if (FunilModule._snapshotTimer) {
      clearTimeout(FunilModule._snapshotTimer);
      FunilModule._snapshotTimer = null;
    }
    FunilModule._camposModificados = false;
    FunilModule._snapshotAbasEtapa = null;
  }

  static _preencherAbaLead(l) {
    $('#mld-lead-nome').text(l.nome);
    $('#mld-lead-tel').text(l.tel);
    $('#mld-lead-id-show').text(l.id);
    /* Chamado #67 — popular os inputs editáveis de Nome e Telefone. */
    $('#mld-nome-edit').val(l.nome || '');
    $('#mld-tel-edit').val(l.tel || '');
    FunilModule._popularSelectFonte(l);
    /* Onda 1 (Ticket #15 / PERS-1) — popular #mld-captador como
       <select> de store.usuarios. O value é o UUID (para persistir
       captador_id). Antes era <input type="text"> livre — mudanças
       nunca chegavam ao banco porque o campo `captador` (texto)
       não estava na whitelist do store.atualizarLead E o schema
       usa captador_id (FK profiles). Agora o select mostra o nome
       e persiste o UUID correto. */
    FunilModule._popularSelectCaptador(l);
    $('#mld-placa').val(l.placa||'');
    /* Patch UX-1: aplica formatação BR ao popular */
    $('#mld-fipe').val(l.fipe != null && l.fipe !== '' ? Utils.formatarValorBR(l.fipe) : '');
    $('#mld-mensest').val(l.mensalidadeEst != null && l.mensalidadeEst !== '' ? Utils.formatarValorBR(l.mensalidadeEst) : '');

    /* Chamado #84 — campos somente leitura da etapa de entrada.
       Data de Chegada = created_at do lead (quando ele chegou ao
       funil). Quem Indicou = campo preenchido no cadastro. Ambos
       apenas exibidos; não entram no autosave (são read-only). */
    var _dataChegadaIso = l._createdAt || null;
    if (_dataChegadaIso) {
      var _dc = new Date(_dataChegadaIso);
      $('#mld-data-chegada').val(isNaN(_dc.getTime())
        ? '—'
        : _dc.toLocaleDateString('pt-BR'));
    } else {
      $('#mld-data-chegada').val('—');
    }
    $('#mld-quem-indicou').val(l.quemIndicou && l.quemIndicou.trim() ? l.quemIndicou : '—');

    /* Chamado #67 — ao (re)abrir um lead, o botão Salvar começa oculto
       (nenhuma edição pendente ainda). */
    $('#mld-lead-save-wrap').css('display', 'none');
    $('#mld-lead-save-status').text('');

    $('#mld-obs').val(l.obs||'');
    $('#mld-copy-tel').off('click').on('click', () => { Utils.copyTel(l.tel); Toast.show('Número copiado!','success'); });

    // AJUSTE 7: renderizar tags atuais e disponíveis
    const $atuais = $('#mld-tags-atuais');
    $atuais.html((l.tags || []).map(t => {
      const c = TAG_CONFIG[t] || { cls: '', label: t };
      return `<span class="amp-tag ${c.cls}" style="cursor:pointer;"
        onclick="FunilModule.removerTag('${Utils.escHtml(l.id)}','${t}')" title="Clique para remover">
        ${c.label} <i class='bi bi-x-circle-fill' style='font-size:10px;opacity:.7;'></i></span>`;
    }).join(''));

    const $disp = $('#mld-tags-disponiveis');
    $disp.html(store.tags.filter(t => !(l.tags||[]).includes(t)).map(t => {
      const c = TAG_CONFIG[t] || { cls: '', label: t };
      return `<span class="amp-tag ${c.cls}" style="cursor:pointer;opacity:0.55;"
        onclick="FunilModule.adicionarTag('${Utils.escHtml(l.id)}','${t}')" title="Clique para adicionar">
        <i class='bi bi-plus-lg' style='font-size:10px;'></i> ${c.label}</span>`;
    }).join(''));

    /* ============================================================
       PATCH OBS-3.5 — Auto-save dos campos editáveis do lead
       ============================================================
       Os 6 campos editáveis (fonte, captador, placa, fipe,
       mensalidade, obs) não tinham listener — qualquer edição se
       perdia quando o usuário fechava o modal ou trocava de aba
       sem clicar em "Confirmar".

       Agora: ao perder foco em qualquer um deles, chama
       _salvarCamposLead, que detecta o que mudou e persiste via
       store.atualizarLead (atualiza local + UPDATE no Supabase).
       ============================================================ */
    /* Chamado #67 — inclui os inputs de Nome e Telefone.
       Comportamento do botão Salvar explícito:
         • ao DIGITAR (input) em qualquer campo editável, mostramos o
           botão "Salvar alterações" (sinaliza que há mudança pendente).
         • ao clicar em Salvar, grava e some o botão com feedback.
         • no BLUR mantemos o autosave como rede de segurança (grava
           mesmo se o usuário esquecer de clicar), e escondemos o botão.
       Assim o cliente tem o feedback claro que pediu, e o popup de
       "perder preenchimento" não dispara à toa porque os dados já
       foram salvos. */
    var selCampos = '#mld-nome-edit, #mld-tel-edit, #mld-fonte, #mld-captador, #mld-placa, #mld-fipe, #mld-mensest, #mld-obs';
    $(selCampos).off('change.obs35 blur.obs35 input.obs35');
    /* Digitou/alterou → revela o botão Salvar */
    $(selCampos).on('input.obs35 change.obs35', function() {
      $('#mld-lead-save-wrap').css('display', 'flex');
      $('#mld-lead-save-status').text('');
    });
    /* Perdeu foco → autosave silencioso (rede de segurança) */
    $(selCampos).on('blur.obs35', function() {
      FunilModule._salvarCamposLead(l);
    });
  }

  /* ============================================================
     Onda 1 (Ticket #15 / PERS-1) — _popularSelectCaptador
     ============================================================
     Transforma o input livre #mld-captador em <select> populado
     com store.usuarios. Value = UUID (captador_id). Sempre inclui
     o captador atual, mesmo que o usuário esteja inativo, pra não
     "perder" o valor visível ao abrir um lead antigo.

     Filtro: usuários ativos (status != 'inativo') ordenados por nome.
     ============================================================ */
  /* ============================================================
     BUGFIX FONTE — _popularSelectFonte
     ============================================================
     Garante que o <select> #mld-fonte SEMPRE reflita a fonte real
     do lead. Se a fonte atual não existir como <option> (fonte de
     texto livre vinda de importação, ou lista de options diferente
     do valor gravado), injeta a opção e a seleciona.

     Sem isto, o select abre VAZIO quando o valor não casa com
     nenhuma opção; aí o autosave (blur) lê "vazio" e GRAVA vazio
     por cima — apagando a fonte no banco. Era a causa do
     "fonte parou de persistir".
     ============================================================ */
  static _popularSelectFonte(lead) {
    var $sel = $('#mld-fonte');
    if (!$sel.length) return;
    var fonteAtual = (lead && lead.fonte) ? lead.fonte : '';

    /* Fallback: se por acaso não for <select> (input/datalist), só seta */
    if (!$sel.is('select')) { $sel.val(fonteAtual); return; }

    /* Injeta a fonte atual como option se ela não existir na lista */
    if (fonteAtual) {
      var existe = false;
      $sel.find('option').each(function() {
        var v = $(this).attr('value');
        var val = (v !== undefined && v !== null) ? v : $(this).text();
        if (val === fonteAtual) { existe = true; return false; }
      });
      if (!existe) {
        $sel.append('<option value="' + Utils.escHtml(fonteAtual) + '">' +
                    Utils.escHtml(fonteAtual) + '</option>');
      }
    }

    $sel.val(fonteAtual);
  }

  static _popularSelectCaptador(lead) {
    var $sel = $('#mld-captador');
    if (!$sel.length) return;
    /* Se o elemento ainda for input (antes do primeiro carregamento
       do index.html novo), força uma pequena tolerância: só popula
       se for select. */
    if (!$sel.is('select')) {
      /* Fallback defensivo: usa como texto (mantém compat antiga).
         Este ramo só roda se alguém publicou o JS mas não o HTML;
         evita quebra total. */
      $sel.val(lead.captador || '');
      return;
    }

    var atualId = lead.captador_id || '';
    var opts = '<option value="">— Selecionar captador —</option>';

    /* Ordena por nome ativos primeiro */
    var ativos = (store.usuarios || [])
      .filter(function(u) { return u.status !== 'inativo'; })
      .slice()
      .sort(function(a, b) { return (a.nome || '').localeCompare(b.nome || ''); });

    /* Se o captador atual do lead não está nos ativos (ex.: inativado
       depois), inclui explicitamente pra preservar o valor visível. */
    var atualFora = atualId && !ativos.some(function(u) { return u._id === atualId; });
    if (atualFora) {
      var atualUser = (store.usuarios || []).find(function(u) { return u._id === atualId; });
      if (atualUser) {
        opts += '<option value="' + Utils.escHtml(atualUser._id) + '" data-inativo="1">'
              + Utils.escHtml(atualUser.nome) + ' (inativo)</option>';
      }
    }

    ativos.forEach(function(u) {
      opts += '<option value="' + Utils.escHtml(u._id) + '">' + Utils.escHtml(u.nome) + '</option>';
    });

    $sel.html(opts).val(atualId);
  }

  /* ============================================================
     PATCH OBS-3.5 — _salvarCamposLead
     ============================================================
     Lê os 6 campos editáveis do modal-lead, compara com o estado
     atual do `lead` e persiste APENAS o que mudou via
     store.atualizarLead. É idempotente — se nada mudou, não
     dispara UPDATE.

     Chamada em 2 lugares:
       - Listener change/blur (autosave passivo)
       - Antes de cada confirmar* (defesa em camada)

     Onda 1 (Ticket #15 / PERS-1) — captador agora vem do <select>
     como UUID (captador_id). Além de persistir no banco, sincroniza
     o campo derivado `lead.captador` (nome) via lookup em
     store.usuarios pra a UI (KanbanCard, header etc.) atualizar
     imediatamente, sem esperar F5.
     ============================================================ */

  /* Chamado #67 — Salvar explícito (botão "Salvar alterações").
     Chama o mesmo _salvarCamposLead (fonte única de persistência) e
     dá feedback visual: mostra "Salvo ✓" e esconde o botão. */
  static salvarDadosLead() {
    var lead = store.currentLead;
    if (!lead) return;
    FunilModule._salvarCamposLead(lead);
    $('#mld-lead-save-status').text('Salvo ✓').css('color', 'var(--d-txt-059669,#059669)');
    /* Esconde o botão após um instante (feedback visível e depois some). */
    setTimeout(function() {
      $('#mld-lead-save-wrap').css('display', 'none');
      $('#mld-lead-save-status').text('');
    }, 1200);
    Toast.show('Dados do lead salvos.', 'success');
  }

  static _salvarCamposLead(lead) {
    if (!lead) return;

    var fonteNova   = $('#mld-fonte').val() || '';
    /* Onda 1 — captador vira UUID (value do <select>). Se o elemento
       ainda for input (fallback), extrai como texto pra não travar. */
    var $capSel     = $('#mld-captador');
    var captadorIdNew = $capSel.is('select')
      ? ($capSel.val() || '')
      : null;
    var captadorTxtNew = !$capSel.is('select')
      ? (($capSel.val() || '').trim())
      : null;
    var placaNova   = ($('#mld-placa').val() || '').trim();
    var fipeNum     = Utils.parseValor($('#mld-fipe').val());
    var mensNum     = Utils.parseValor($('#mld-mensest').val());
    var obsNova     = $('#mld-obs').val() || '';
    /* Chamado #67 — nome e telefone editáveis. */
    var nomeNovo    = ($('#mld-nome-edit').val() || '').trim();
    var telNovo     = ($('#mld-tel-edit').val() || '').trim();

    var campos = {};
    /* Chamado #67 — só grava nome se não ficar vazio (evita apagar o
       nome do lead por engano ao limpar o campo). Telefone segue a
       mesma proteção. */
    if (nomeNovo && nomeNovo !== (lead.nome || '')) campos.nome = nomeNovo;
    if (telNovo  && telNovo  !== (lead.tel  || '')) campos.tel  = telNovo;
    if (fonteNova   !== (lead.fonte || ''))                                campos.fonte          = fonteNova;
    if (captadorIdNew != null && captadorIdNew !== (lead.captador_id || '')) {
      campos.captador_id = captadorIdNew || null;
    }
    /* Fallback compat: só usado se index.html ainda estiver na versão input */
    if (captadorTxtNew != null && captadorTxtNew !== (lead.captador || '')) {
      campos.captador = captadorTxtNew;
    }
    if (placaNova   !== (lead.placa || ''))                                campos.placa          = placaNova;
    if ((fipeNum != null ? fipeNum : '') !== (lead.fipe != null ? lead.fipe : ''))                       campos.fipe           = fipeNum != null ? fipeNum : '';
    if ((mensNum != null ? mensNum : '') !== (lead.mensalidadeEst != null ? lead.mensalidadeEst : ''))   campos.mensalidadeEst = mensNum != null ? mensNum : '';
    if (obsNova     !== (lead.obs || ''))                                  campos.obs            = obsNova;

    if (Object.keys(campos).length === 0) {
      /* Chamado #67 — nada de fato mudou (ex.: digitou e reverteu):
         some o botão pra não ficar "preso" visível. */
      $('#mld-lead-save-wrap').css('display', 'none');
      $('#mld-lead-save-status').text('');
      return;
    }

    store.atualizarLead(lead.id, campos);

    /* Chamado #67 — salvou (pelo botão OU pelo blur): esconde o botão de
       Salvar. Isso também garante que a guarda de "alterações não salvas"
       não acuse pendência inexistente ao fechar o modal. */
    $('#mld-lead-save-wrap').css('display', 'none');

    /* Chamado #67 — refletir nome/telefone alterados nos displays sem
       precisar reabrir o modal: cabeçalho verde da aba Lead, título do
       modal, abas que mostram nome/tel, e o card no kanban. */
    if (campos.nome !== undefined || campos.tel !== undefined) {
      if (campos.nome !== undefined) {
        $('#mld-lead-nome').text(lead.nome);
        $('#mld-nome').text(lead.nome);
        $('#mld-lig-nome, #mld-agen-nome, #mld-vis-nome, #mld-venda-nome, #mld-cart-nome').text(lead.nome);
      }
      if (campos.tel !== undefined) {
        $('#mld-lead-tel').text(lead.tel);
        $('#mld-lig-tel, #mld-agen-tel, #mld-vis-tel, #mld-venda-tel, #mld-cart-tel').text(lead.tel);
      }
      if (FunilModule.renderKanban) FunilModule.renderKanban();
    }

    /* Sincroniza display local do nome do captador quando o UUID mudou */
    if (campos.captador_id !== undefined) {
      var novoCap = (store.usuarios || []).find(function(u) { return u._id === campos.captador_id; });
      lead.captador = novoCap ? novoCap.nome : '—';
      /* Re-renderiza kanban pra badge do criador ficar coerente */
      if (FunilModule.renderKanban) FunilModule.renderKanban();
    }

    SLog.info('OBS-3.5 autosave: ' + Object.keys(campos).join(', '));
  }

  static _preencherAbaLigacao(l) {
    $('#mld-lig-nome').text(l.nome);
    $('#mld-lig-tel').text(l.tel);
    $('#mld-lig-id').text(l.id);
    // AJUSTE 1: bind do botão copiar na aba ligação
    $('#mld-copy-lig-tel').off('click').on('click', () => {
      Utils.copyTel(l.tel);
      Toast.show('Número copiado!', 'success');
    });
    FunilModule._atualizarContadorTentativas(l.tentativas);
    /* Defaults — sobrescritos abaixo se houver última ligação */
    $('#tab-ligacao .res-opt').removeClass('selected');
    $('#mld-lig-obs').val('');
    $('#lig-datetime').val(Utils.getNowLocal());

    /* Patch 7.6 — restaura última ligação registrada para este lead.
       Tarefa 2 (RF-12) já persistia data_hora e obs específicas da
       ligação; aqui fechamos o ciclo no restore. */
    if (typeof LigacaoService === 'undefined' || !l || !l._uuid) return;

    LigacaoService.ultimaDoLead(l._uuid).then(function(lig) {
      if (!lig) return;

      /* Data e Hora — converte ISO para YYYY-MM-DDTHH:MM */
      if (lig.data_hora) {
        var pad = function(n) { return String(n).padStart(2, '0'); };
        var d = new Date(lig.data_hora);
        $('#lig-datetime').val(
          d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) +
          'T' + pad(d.getHours()) + ':' + pad(d.getMinutes())
        );
      }

      /* Resultado — marca o botão .res-opt cujo texto bate com lig.resultado */
      if (lig.resultado) {
        $('#tab-ligacao .res-opt').each(function() {
          if ($(this).text().trim() === lig.resultado) {
            $(this).addClass('selected');
          }
        });
      }

      /* Observações específicas da ligação (não do lead) */
      if (lig.obs) $('#mld-lig-obs').val(lig.obs);

      /* Ticket #8 (teste #85) — essa busca é ASSÍNCRONA e foi disparada
         lá no abrir do modal. Se o usuário for rápido (registra a
         ligação ANTES dessa promise resolver), ela ainda chega depois
         e reaplica valores aqui — DEPOIS do _rebaselinearModalLead()
         já ter rodado em registrarLigacao(). Resultado: o campo/botão
         já tinha baseline (o usuário tocou nele), mas o valor atual
         muda de novo por código (sem focus/mousedown), e o dirty-check
         via _detectarDiffsPorBaseline acusa diferença — alerta falso
         de 'alterações não salvas' ao fechar, mesmo a ligação já
         registrada. Rebaseia de novo aqui: qualquer campo que já
         tinha baseline (usuário tocou) fica com o valor que acabou de
         ser aplicado por código como o novo "salvo" — consistente com
         a filosofia do dirty3 de que preenchimento por código nunca é
         'alteração não salva'. */
      FunilModule._rebaselinearModalLead();
    }).catch(function(err) {
      SLog.error('_preencherAbaLigacao: ' + err.message);
    });
  }

  static _preencherAbaAgendamento(l) {
    $('#mld-agen-nome').text(l.nome);
    $('#mld-agen-tel').text('📱 '+l.tel);
    /* Defaults — sobrescritos abaixo se houver último agendamento */
    $('#agen-data-feito').val(Utils.getTodayDate());
    $('#agen-data-visita').val('');
    $('#mld-agen-obs').val('');
    $('#agen-cat').val('Nacional Particular');
    $('#agen-local').val('🏢 Interno');
    FunilModule._carregarChecklistAgendamento(l);

    /* Chamado #86 — botão "Excluir Agendamento" só aparece se existe
       agendamento vigente pra este lead (senão não há o que excluir). */
    var _agVig = FunilModule._agendamentoVigente(l);
    if (_agVig) $('#mld-agen-excluir-wrap').show();
    else        $('#mld-agen-excluir-wrap').hide();

    /* Patch 7.6 — restaura último agendamento registrado deste lead.
       O AgendaService já tem ultimoDoLead (Tarefa 4A). */
    if (typeof AgendaService === 'undefined' || !l || !l._uuid) return;

    AgendaService.ultimoDoLead(l._uuid).then(function(ag) {
      if (!ag) return;

      /* Data e Hora da visita agendada — converte ISO para YYYY-MM-DDTHH:MM */
      if (ag.data_hora) {
        var pad = function(n) { return String(n).padStart(2, '0'); };
        var d = new Date(ag.data_hora);
        $('#agen-data-visita').val(
          d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) +
          'T' + pad(d.getHours()) + ':' + pad(d.getMinutes())
        );
      }

      /* Categoria do veículo (texto direto) */
      if (ag.categoria_veiculo) $('#agen-cat').val(ag.categoria_veiculo);

      /* Local — mapear o enum do banco (interno/externo/online) para o
         texto exato do <option> que tem emoji. */
      if (ag.local_tipo) {
        var label = ag.local_tipo === 'externo' ? '📍 Externo'
                  : ag.local_tipo === 'online'  ? '💻 Online'
                  : '🏢 Interno';
        $('#agen-local').val(label);
      }

      /* Observações específicas do agendamento */
      if (ag.obs) $('#mld-agen-obs').val(ag.obs);

      /* Patch PERS-1 — restaura "data em que o agendamento foi feito" (ponto 3.c).
         Supabase devolve DATE como ISO completo às vezes — fatiamos pros 10
         primeiros caracteres pra ficar no formato YYYY-MM-DD aceito pelo
         <input type="date">. */
      if (ag.data_realizacao) {
        $('#agen-data-feito').val(String(ag.data_realizacao).slice(0, 10));
      }
    }).catch(function(err) {
      SLog.error('_preencherAbaAgendamento: ' + err.message);
    });
  }

  /* ============================================================
     Tarefa 4B — Carrega o checklist do agendamento direto do
     banco (tabela agendamento_checklist). Garante que o estado
     dos itens (feito / não feito) seja restaurado a cada abertura
     da aba e que cliques no checkbox persistam no Supabase.
     ============================================================ */
  static _carregarChecklistAgendamento(lead) {
    var $cont = $('#checklist-agendamento');
    if (!$cont.length) return;

    /* Estado de carregamento */
    $cont.html('<div class="text-muted small p-2"><i class="bi bi-hourglass-split"></i> Carregando checklist...</div>');

    /* Sem service ou sem UUID → checklist apenas visual (lead não persistido ainda) */
    if (typeof AgendaService === 'undefined' || !lead || !lead._uuid) {
      $cont.html('<div class="text-muted small p-2">Os itens do checklist aparecerão após o agendamento ser criado.</div>');
      return;
    }

    AgendaService.ultimoDoLead(lead._uuid).then(function(agendamento) {
      if (!agendamento) {
        $cont.html('<div class="text-muted small p-2">Os itens do checklist aparecerão após o agendamento ser criado.</div>');
        return;
      }
      return AgendaService.checklistDoAgendamento(agendamento.id);
    }).then(function(items) {
      if (!items) return; /* já tratado acima */

      if (!items.length) {
        $cont.html('<div class="text-muted small p-2">Nenhum item de checklist encontrado para este agendamento.</div>');
        return;
      }

      /* Renderiza cada item respeitando o estado do banco. data-item-id
         é o que o ChecklistItem.alternar usa para identificar a linha
         e persistir o UPDATE via AgendaService.marcarItemChecklist. */
      var esc = function(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
          return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
        });
      };

      var html = items.map(function(it) {
        var doneCls   = it.feito ? ' done' : '';
        var iconHtml  = it.feito ? '<i class="bi bi-check-lg"></i>' : '';
        var quemQuando = '';
        if (it.feito && it.feito_em) {
          var dt = new Date(it.feito_em);
          var quem = (it.feito_por_user && it.feito_por_user.nome) ? it.feito_por_user.nome.split(' ')[0] : '';
          quemQuando = '<span class="text-muted small ms-2" style="font-size:11px;">' +
                       '✓ ' + (quem ? esc(quem) + ' · ' : '') +
                       dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) +
                       '</span>';
        }
        return '<div class="check-item' + doneCls + '" data-item-id="' + esc(it.id) + '">' +
                 '<div class="check-icon">' + iconHtml + '</div> ' +
                 esc(it.item_label) +
                 quemQuando +
               '</div>';
      }).join('');

      $cont.html(html);
    }).catch(function(err) {
      SLog.error('_carregarChecklistAgendamento: ' + err.message);
      $cont.html('<div class="text-danger small p-2"><i class="bi bi-exclamation-triangle"></i> Erro ao carregar checklist.</div>');
    });
  }

  static _preencherAbaVisita(l) {
    $('#mld-vis-nome').text(l.nome);
    $('#mld-vis-tel').text('📱 '+l.tel);
    $('#tab-visita .vres-btn').removeClass('selected');
    $('#tab-visita .resultado-detail').removeClass('active');
    $('#mld-vis-obs').val(l.obs||'');
    $('#vis-delay-dt, #vis-nao-dt').val(Utils.getNowLocal());
    $('#c2-data').val(Utils.getTodayDate());

    /* PATCH FLOW-3.6 — reseta os selects novos antes de popular.
       Sem isto, o valor do lead anterior fica grudado no DOM
       quando o lead novo não tem histórico do tipo. */
    $('#c2-tipo').val('');
    $('#nao-objecao').val('');
    Utils.marcarInvalido('#c2-tipo', false);
    Utils.marcarInvalido('#nao-objecao', false);

    /* ============================================================
       Patch PERS-3 — Modo read-only (ponto 4.e)
       Quando o lead já avançou para Venda ou Carteira, a aba Visita
       vira modo "histórico de consulta": os botões funcionam como
       FILTROS do histórico (não como ação) e os forms ficam ocultos.
       ============================================================ */
    const ehReadonly = (l.etapa === 'venda' || l.etapa === 'carteira');
    $('#tab-visita').toggleClass('modo-readonly', ehReadonly);
    FunilModule._cacheHistoricoVisitas = [];

    if (typeof VisitaService === 'undefined' || !l || !l._uuid) return;

    if (ehReadonly) {
      /* Modo histórico read-only — busca todas as visitas de uma vez,
         cacheia para uso ao clicar nos botões filtros, e mostra
         placeholder inicial. */
      FunilModule._garantirContainerHistorico();
      $('#vis-historico-container').html(
        '<div class="vis-hist-placeholder">' +
        '👆 Clique em <strong>Delay</strong>, <strong>C2</strong> ou <strong>Não Fechou</strong> ' +
        'acima para ver o histórico de cada tipo.' +
        '</div>'
      );

      VisitaService.historicoPorLead(l._uuid).then(function(visitas) {
        FunilModule._cacheHistoricoVisitas = visitas || [];
        SLog.info('PERS-3 histórico read-only: ' + (visitas?.length || 0) + ' visita(s) em cache');
      }).catch(function(err) {
        SLog.error('_preencherAbaVisita histórico: ' + err.message);
      });
      return; /* Modo read-only não popula forms — eles estão ocultos via CSS */
    }

    /* ============================================================
       Modo edição (etapas anteriores a Venda)
       Patch PERS-3 — corrige ponto 4.d: usa histórico completo para
       popular a data de CADA tipo separadamente (delay/nao_fechou/c2),
       não apenas a última visita registrada.
       ============================================================ */
    VisitaService.historicoPorLead(l._uuid).then(function(visitas) {
      /* Patch FLOW-1 — popula cache do histórico para uso pelo
         _atualizarBotaoAvancarVisita (mesmo cache usado em modo readonly) */
      FunilModule._cacheHistoricoVisitas = visitas || [];

      if (!visitas || !visitas.length) {
        /* HOTFIX FLOW-1 — só interferimos no botão Avançar se o lead
           está REALMENTE na etapa Visita. Caso contrário, deixamos
           intacto o que _atualizarBotoesModal configurou (que pode
           ser "Avançar: Ligação", "Avançar: Agendamento" etc). */
        if (l.etapa === 'visita') {
          FunilModule._atualizarBotaoAvancarVisita(null);
        }
        return;
      }

      /* Última visita (qualquer tipo) — marca o botão correspondente.
         Mantém o comportamento original de "última registrada fica selecionada". */
      var ultima = visitas[0]; /* historicoPorLead já vem DESC por created_at */
      var tipoBtn = (ultima.tipo_resultado === 'nao_fechou') ? 'nao' : ultima.tipo_resultado;
      var $btn = $('#tab-visita .vres-btn[data-tipo="' + tipoBtn + '"]');
      if ($btn.length) {
        $btn.addClass('selected');
        $('#vis-detail-' + tipoBtn).addClass('active');
      }

      /* Patch PERS-3 / ponto 4.d — última visita de CADA tipo */
      var ultimaDelay = visitas.find(function(v) { return v.tipo_resultado === 'delay'; });
      var ultimaNao   = visitas.find(function(v) { return v.tipo_resultado === 'nao_fechou'; });
      var ultimaC2    = visitas.find(function(v) { return v.tipo_resultado === 'c2'; });

      /* Popula data específica de Delay (se houver) */
      if (ultimaDelay && ultimaDelay.tentativa_data_hora) {
        $('#vis-delay-dt').val(ultimaDelay.tentativa_data_hora.slice(0, 16));
      }
      if (ultimaDelay && ultimaDelay.tentativa_resultado) {
        var txtDelay = FunilModule._enumToTextoResultado(ultimaDelay.tentativa_resultado, 'delay');
        if (txtDelay) $('#vis-detail-delay select').val(txtDelay);
      }

      /* PATCH FLOW-3.6 (item 3.11) — Popula Objeção da última "Não Fechou".
         Visitas antigas não têm objeção (só data/hora/resultado); novas só
         têm objeção. Campos antigos foram removidos da UI. */
      if (ultimaNao && ultimaNao.objecao) {
        $('#nao-objecao').val(ultimaNao.objecao);
      }

      /* Popula campos de C2 (data, hora, local) */
      if (ultimaC2 && ultimaC2.tentativa_data_hora) {
        var dt = new Date(ultimaC2.tentativa_data_hora);
        var pad = function(n) { return String(n).padStart(2, '0'); };
        $('#c2-data').val(dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()));
        $('#c2-hora').val(pad(dt.getHours()) + ':' + pad(dt.getMinutes()));
      }
      if (ultimaC2 && ultimaC2.local_tipo) {
        var label = ultimaC2.local_tipo.charAt(0).toUpperCase() + ultimaC2.local_tipo.slice(1);
        $('#c2-local').val(label);
      }
      /* PATCH FLOW-3.6 (item 3.10) — Popula tipo_c2 da última C2 (se houver) */
      if (ultimaC2 && ultimaC2.tipo_c2) {
        $('#c2-tipo').val(ultimaC2.tipo_c2);
      }

      /* HOTFIX FLOW-1 — só interferimos no botão Avançar se o lead
         está REALMENTE na etapa Visita. Em outras etapas, este método
         só popula campos da aba Visita pra fins de visualização
         (Tarefa 7 — abas anteriores ficam visíveis em read), mas NÃO
         deve alterar o botão Avançar do footer. */
      if (l.etapa === 'visita') {
        FunilModule._atualizarBotaoAvancarVisita(tipoBtn);
      }
    }).catch(function(err) {
      SLog.error('_preencherAbaVisita: ' + err.message);
      /* HOTFIX FLOW-1 — em caso de erro, só toca no botão se for etapa visita */
      if (l.etapa === 'visita') {
        $('#mld-btn-avancar').prop('disabled', false).removeAttr('title');
      }
    });
  }

  /* ============================================================
     Patch PERS-3 — cria container do histórico read-only se não existir
     ============================================================ */
  static _garantirContainerHistorico() {
    if ($('#vis-historico-container').length) return;
    /* Insere após o bloco de botões e forms, dentro da .form-section
       que contém o título "Resultado da Visita" */
    var $alvo = $('#tab-visita .form-section').first();
    if (!$alvo.length) $alvo = $('#tab-visita');
    $alvo.append(
      '<div id="vis-historico-container" class="vis-historico">' +
      '<div class="vis-hist-placeholder">👆 Clique em um filtro acima para ver o histórico.</div>' +
      '</div>'
    );
  }

  /* ============================================================
     Patch PERS-3 — renderiza histórico filtrado por tipo (4.e)
     Chamado a partir de selecionarVisita quando modo readonly.
     ============================================================ */
  static _renderizarHistoricoReadonly(tipo) {
    var $cont = $('#vis-historico-container');
    if (!$cont.length) return;

    /* Mapear UI tipo → enum do banco */
    var tipoEnum = (tipo === 'nao') ? 'nao_fechou' : tipo;
    var visitas = (FunilModule._cacheHistoricoVisitas || []).filter(function(v) {
      return v.tipo_resultado === tipoEnum;
    });

    if (!visitas.length) {
      $cont.html(
        '<div class="vis-hist-placeholder">' +
        'Nenhum registro de <strong>' + FunilModule._labelTipoVisita(tipo) + '</strong> ' +
        'encontrado para este lead.' +
        '</div>'
      );
      return;
    }

    var iconConfig = {
      delay: { icon: '⏳', label: 'Delay',      cls: 'hist-delay' },
      c2:    { icon: '📅', label: 'C2',         cls: 'hist-c2' },
      nao:   { icon: '❌', label: 'Não Fechou', cls: 'hist-nao' },
    };
    var cfg = iconConfig[tipo] || iconConfig.delay;

    var html = '<div class="vis-hist-header">';
    html += '<span class="vis-hist-count">' + visitas.length + '</span> ';
    html += 'registro(s) de <strong>' + cfg.label + '</strong>';
    html += '</div>';
    html += '<div class="vis-hist-lista">';

    visitas.forEach(function(v) {
      var data = v.tentativa_data_hora || v.created_at;
      var dataFmt = data ? Utils.formatDate(data) : '—';
      var resultado = v.tentativa_resultado ? FunilModule._enumToTextoResultado(v.tentativa_resultado, tipo) : null;

      html += '<div class="vis-hist-item ' + cfg.cls + '">';
      html += '  <div class="vis-hist-icon">' + cfg.icon + '</div>';
      html += '  <div class="vis-hist-body">';
      html += '    <div class="vis-hist-data">' + dataFmt + '</div>';

      /* PATCH FLOW-3.6 (item 3.10) — Tipo de C2 (visitas novas) */
      if (tipo === 'c2' && v.tipo_c2) {
        var labelC2 = (v.tipo_c2 === 'c2_agendamento') ? '📅 C2 Agendamento'
                    : (v.tipo_c2 === 'c2_venda')       ? '💰 C2 Venda'
                    : v.tipo_c2;
        html += '    <div class="vis-hist-resultado">' + Utils.escHtml(labelC2) + '</div>';
      }

      /* PATCH FLOW-3.6 (item 3.11) — Objeção (visitas novas de Não Fechou) */
      if (tipo === 'nao' && v.objecao) {
        var labelObj = FunilModule._labelObjecao(v.objecao);
        html += '    <div class="vis-hist-resultado">🗣️ ' + Utils.escHtml(labelObj) + '</div>';
      }

      /* Opção A: visitas antigas ainda mostram resultado/data — fallback */
      if (resultado && !(tipo === 'nao' && v.objecao)) {
        html += '    <div class="vis-hist-resultado">' + Utils.escHtml(resultado) + '</div>';
      }
      if (v.local_tipo) {
        var localCap = v.local_tipo.charAt(0).toUpperCase() + v.local_tipo.slice(1);
        html += '    <div class="vis-hist-local">📍 ' + Utils.escHtml(localCap) + '</div>';
      }
      if (v.obs) {
        html += '    <div class="vis-hist-obs">' + Utils.escHtml(v.obs) + '</div>';
      }
      html += '  </div>';
      html += '</div>';
    });

    html += '</div>';
    $cont.html(html);
  }

  /* PATCH FLOW-3.6 — Labels amigáveis das objeções (Não Fechou) */
  static _labelObjecao(slug) {
    var mapa = {
      sem_dinheiro:      'Sem dinheiro',
      falar_conjuge:     'Falar com cônjuge',
      tem_seguro:        'Tem seguro',
      vou_pensar:        'Vou pensar',
      nao_tem_interesse: 'Não tem interesse',
      beneficios:        'Benefícios',
      adesao_zero:       'Adesão zero',
      comparacao_preco:  'Comparação de preço',
      outros:            'Outros',
    };
    return mapa[slug] || slug;
  }

  static _labelTipoVisita(tipo) {
    if (tipo === 'delay') return 'Delay';
    if (tipo === 'c2')    return 'C2';
    if (tipo === 'nao')   return 'Não Fechou';
    if (tipo === 'venda') return 'Venda';
    return tipo;
  }

  /* Mapeia o enum de tentativa_resultado de volta para o texto do <select>.
     Importante: o painel "delay" usa "Pediu para Retornar" e o painel "nao"
     usa "Pediu Retorno" (textos ligeiramente diferentes no HTML). */
  static _enumToTextoResultado(enumVal, tipoUI) {
    if (enumVal === 'nao_atendeu')   return 'Não Atendeu';
    if (enumVal === 'nao_reagendou') return 'Não Reagendou';
    if (enumVal === 'agendamento')   return 'Agendamento';
    if (enumVal === 'pediu_retorno') return tipoUI === 'delay' ? 'Pediu para Retornar' : 'Pediu Retorno';
    return null;
  }

  static _preencherAbaVenda(l) {
    $('#mld-venda-nome').text(l.nome);
    $('#mld-venda-tel').text('📱 '+l.tel);
    $('#mld-venda-placa').text(l.placa||'—');
    $('#mld-venda-fonte').text(l.fonte||'—');
    $('#venda-data').val(Utils.getTodayDate());
    $('#venda-aniversario').val(l.aniversario||'');
    $('#venda-adesao, #venda-mensalidade, #venda-rastreador').val('');
    /* Chamado #60 — form limpo abre com rastreador habilitado e
       checkbox "Não tem" desmarcado (estado padrão). */
    $('#venda-sem-rastreador').prop('checked', false);
    FunilModule.toggleSemRastreador(false);
    /* 3B.1: form único de Recomendação — só rec-card-1 permanece.
       Apenas garante que os inputs estejam limpos ao abrir. */
    $('.rec-form').find('input').val('');
    /* Chamado #33 — botão de duplicar p/ novo veículo */
    FunilModule._injetarBotaoDuplicarVeiculo(l, '#tab-venda');
    /* Chamado #32 — campo Placa do Veículo (obrigatório na venda) */
    FunilModule._injetarCampoPlacaVenda(l);
    /* Carrega venda + checklist do banco (Tarefa 7) */
    FunilModule._carregarVendaELiCard(l);
  }

  /* ============================================================
     Tarefa 7 — Carrega venda do banco e renderiza checklist
     pós-venda dinâmico (espelha _carregarChecklistAgendamento).
     ============================================================ */
  static _carregarVendaELiCard(lead) {
    var $cont = $('#checklist-venda');
    /* Coloca o placeholder em estado de loading se o ID novo existir */
    if ($cont.length) {
      $cont.html('<div class="text-muted small p-2"><i class="bi bi-hourglass-split"></i> Carregando checklist...</div>');
    }

    if (typeof VendaService === 'undefined' || !lead || !lead._uuid) {
      if ($cont.length) $cont.html('<div class="text-muted small p-2">Os itens do checklist aparecerão após a venda ser registrada.</div>');
      return;
    }

    VendaService.porLead(lead._uuid).then(function(venda) {
      if (!venda) {
        /* Chamado #53 — ainda não há venda registrada: mostra a PRÉVIA
           do checklist (itens reais do modelo, em modo somente-leitura)
           em vez do texto estático. Vira checklist marcável/salvo após
           registrar a venda. */
        FunilModule._renderChecklistVendaPreview($cont);
        return null;
      }

      /* Preenche campos da venda — Patch UX-1: aplica formatação BR */
      if (venda.valor_adesao      != null) $('#venda-adesao').val(Utils.formatarValorBR(venda.valor_adesao));
      if (venda.valor_mensalidade != null) $('#venda-mensalidade').val(Utils.formatarValorBR(venda.valor_mensalidade));
      /* Chamado #60 — se a venda foi registrada sem rastreador
         (valor null/0), reabre com o checkbox "Não tem rastreador"
         marcado e o campo desabilitado. Caso contrário, mostra o
         valor normalmente e garante o checkbox desmarcado. */
      var _semRastr = (venda.valor_rastreador == null || Number(venda.valor_rastreador) === 0);
      $('#venda-sem-rastreador').prop('checked', _semRastr);
      if (_semRastr) {
        FunilModule.toggleSemRastreador(true);
      } else {
        FunilModule.toggleSemRastreador(false);
        $('#venda-rastreador').val(Utils.formatarValorBR(venda.valor_rastreador));
      }
      /* Supabase devolve DATE como ISO completo com timezone às vezes
         (ex.: "2026-06-15T00:00:00-03:00"). O <input type="date"> só
         aceita "YYYY-MM-DD" — qualquer coisa diferente é rejeitada
         silenciosamente. Cortamos para os 10 primeiros caracteres. */
      if (venda.data_venda)   $('#venda-data').val(String(venda.data_venda).slice(0, 10));
      if (venda.aniversario)  $('#venda-aniversario').val(String(venda.aniversario).slice(0, 10));

      return VendaService.checklistDaVenda(venda.id);
    }).then(function(items) {
      if (!items || !$cont.length) return;
      if (!items.length) {
        $cont.html('<div class="text-muted small p-2">Nenhum item de checklist encontrado.</div>');
        return;
      }

      var esc = function(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
          return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
        });
      };

      var html = items.map(function(it) {
        var doneCls = it.feito ? ' done' : '';
        var iconHtml = it.feito ? '<i class="bi bi-check-lg"></i>' : '';
        var quemQuando = '';
        if (it.feito && it.feito_em) {
          var dt = new Date(it.feito_em);
          var quem = (it.feito_por_user && it.feito_por_user.nome) ? it.feito_por_user.nome.split(' ')[0] : '';
          quemQuando = '<span class="text-muted small ms-2" style="font-size:11px;">✓ ' +
                       (quem ? esc(quem) + ' · ' : '') +
                       dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) +
                       '</span>';
        }
        /* data-checklist-tipo="venda" → Controllers.js sabe qual service usar */
        return '<div class="check-item' + doneCls + '" data-item-id="' + esc(it.id) + '" data-checklist-tipo="venda">' +
                 '<div class="check-icon">' + iconHtml + '</div> ' +
                 esc(it.item_label) +
                 quemQuando +
               '</div>';
      }).join('');

      $cont.html(html);
    }).catch(function(err) {
      SLog.error('_carregarVendaELiCard: ' + err.message);
      if ($cont.length) $cont.html('<div class="text-danger small p-2"><i class="bi bi-exclamation-triangle"></i> Erro ao carregar checklist.</div>');
    });
  }

  /* ============================================================
     Chamado #53 — PRÉVIA do checklist de venda (somente-leitura)
     ============================================================
     Mostra os itens do checklist ANTES de a venda ser registrada,
     como um guia. Os itens vêm do modelo real (VendaService.
     checklistModelo, que amostra a venda mais recente) — assim não
     duplicamos os rótulos no front. São renderizados SEM
     data-item-id e com data-checklist-preview="1", então não
     persistem nada (o Controllers ignora itens de prévia).

     Cold start (base sem nenhuma venda visível): se você quiser um
     fallback fixo, popule FunilModule.VENDA_CHECKLIST_MODELO com um
     array de rótulos (ex.: ['Conferir documentos', 'Enviar contrato'])
     — quando o modelo do banco vier vazio, a prévia usa essa lista. */
  static _renderChecklistVendaPreview($cont) {
    if (!$cont || !$cont.length) return;

    var textoPadrao = '<div class="text-muted small p-2">Os itens do checklist aparecerão após a venda ser registrada.</div>';

    if (typeof VendaService === 'undefined' || !VendaService.checklistModelo) {
      $cont.html(textoPadrao);
      return;
    }

    var esc = function(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
        return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
      });
    };

    var pintar = function(itens) {
      if (!$cont.length) return;
      if ((!itens || !itens.length) &&
          Array.isArray(FunilModule.VENDA_CHECKLIST_MODELO) && FunilModule.VENDA_CHECKLIST_MODELO.length) {
        itens = FunilModule.VENDA_CHECKLIST_MODELO.map(function(lbl, i) {
          return { item_label: lbl, ordem: i };
        });
      }
      if (!itens || !itens.length) { $cont.html(textoPadrao); return; }

      var nota = '<div class="text-muted small p-2" style="border-bottom:1px dashed var(--border,var(--d-brd-e5e7eb));margin-bottom:4px;">' +
                 '<i class="bi bi-eye"></i> Prévia do checklist — estes itens ficam ' +
                 '<strong>marcáveis e salvos</strong> assim que você registrar a venda.</div>';

      var html = itens.map(function(it) {
        return '<div class="check-item check-preview" data-checklist-preview="1" ' +
               'title="Vai virar item marcável após registrar a venda" ' +
               'style="opacity:.7;cursor:default;">' +
                 '<div class="check-icon"></div> ' + esc(it.item_label) +
               '</div>';
      }).join('');

      $cont.html(nota + html);
    };

    VendaService.checklistModelo()
      .then(pintar)
      .catch(function(err) {
        SLog.error('_renderChecklistVendaPreview: ' + err.message);
        /* Ainda tenta o fallback fixo antes de desistir. */
        pintar([]);
      });
  }

static _preencherAbaCarteira(l) {
    $('#mld-cart-nome').text(l.nome);
    /* Chamado #33 — botão de duplicar p/ novo veículo */
    FunilModule._injetarBotaoDuplicarVeiculo(l, '#tab-carteira');
    $('#mld-cart-tel').text('📱 '+l.tel);
    $('#mld-cart-ultima').text(l.ultimaLigacao || '—');

    /* ── Reset defensivo dos DOIS blocos (evita bleed entre leads) ── */
    /* Bloco Pedido de Recomendações */
    $('#cart-datetime').val(Utils.getNowLocal());
    $('#tab-carteira .form-section').first().find('.res-opt').removeClass('selected');
    $('#rec-cart').find('input').val('');
    var $selMotivo = $('#tab-carteira .form-section').first().find('select').first();
    if ($selMotivo.length) $selMotivo.prop('selectedIndex', 0);

    /* Bloco Cuidar da Base (3B.4) */
    $('#cb-motivo').prop('selectedIndex', 0);
    $('#cb-datetime').val(Utils.getNowLocal());
    $('#cb-obs').val('');
    $('#cb-resultado-opts .res-opt').removeClass('selected');

    if (typeof CarteiraService === 'undefined' || !l || !l._uuid) return;

    /* ── FIX: busca histórico e restaura UMA POR TIPO ────────────
       Antes: só restaurava se a última fosse 'recomendacao'.
       Agora: pega os últimos ~20 e usa o mais recente de cada tipo
       para preencher o bloco correspondente. */
    CarteiraService.listar({ lead_id: l._uuid, limit: 20 }).then(function(hist) {
      if (!hist || !hist.length) return;

      /* Onda 3 fix (bug 2) — sort explícito por data_hora DESC antes
         de escolher a "última" de cada tipo. Antes o código confiava
         na ordem retornada pelo Supabase; em cenários com dois
         registros com data_hora idêntica (precisão mínima do
         datetime-local é minuto), o navegador podia retornar
         em ordem estável de inserção, o que às vezes coincidia com
         a ordem CRESCENTE (mais antigo primeiro) — resultando em
         "última" sendo na verdade a mais antiga. Sort local
         determinístico resolve. */
      hist.sort(function(a, b) {
        var da = a.data_hora ? new Date(a.data_hora).getTime() : 0;
        var db = b.data_hora ? new Date(b.data_hora).getTime() : 0;
        return db - da;
      });

      /* Atualiza header "Última ligação:" com a interação mais recente (qualquer tipo) */
      var ult = hist[0];
      var dt  = new Date(ult.data_hora);
      var label = dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      if (ult.motivo)    label += ' · ' + ult.motivo;
      if (ult.resultado) label += ' · ' + ult.resultado; /* 3B.3 */
      $('#mld-cart-ultima').text(label);

      /* Última de cada tipo (agora garantidamente a mais recente) */
      var ultRec = hist.find(function(x) { return x.tipo === 'recomendacao'; });
      var ultCb  = hist.find(function(x) { return x.tipo === 'cuidar_base';  });

      /* Onda 3 fix — log de diagnóstico pra saber o que foi escolhido */
      if (ultCb) {
        SLog.info('_preencherAbaCarteira ultCb: ' + ultCb.data_hora + ' — motivo="' + (ultCb.motivo||'') + '" resultado="' + (ultCb.resultado||'') + '"');
      }
      if (ultRec) {
        SLog.info('_preencherAbaCarteira ultRec: ' + ultRec.data_hora + ' — motivo="' + (ultRec.motivo||'') + '" resultado="' + (ultRec.resultado||'') + '"');
      }

      /* Restaura bloco Pedido de Recomendações */
      if (ultRec) {
        if (ultRec.motivo) {
          var $sel = $('#tab-carteira .form-section').first().find('select').first();
          $sel.find('option').each(function() {
            if ($(this).text().trim() === ultRec.motivo) { $sel.val($(this).val()); return false; }
          });
        }
        if (ultRec.data_hora) {
          var pad = function(n) { return String(n).padStart(2, '0'); };
          var d = new Date(ultRec.data_hora);
          $('#cart-datetime').val(d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()));
        }
        if (ultRec.resultado) {
          $('#tab-carteira .form-section').first().find('.res-opt').each(function() {
            if ($(this).text().trim() === ultRec.resultado) $(this).addClass('selected');
          });
        }
      }

      /* Restaura bloco Cuidar da Base */
      if (ultCb) {
        /* Onda 3 fix v2 (bug 2) — fill defensivo com log em cada passo.
           Se algum passo silenciosamente falhar, o console mostra por quê. */
        SLog.info('CB fill INICIO — motivo="' + (ultCb.motivo || '(vazio)') +
                  '" data_hora="' + (ultCb.data_hora || '(vazia)') +
                  '" obs="' + (ultCb.obs || '(vazia)') +
                  '" resultado="' + (ultCb.resultado || '(vazio)') + '"');

        /* MOTIVO */
        if (ultCb.motivo) {
          var $selCb = $('#cb-motivo');
          /* Tentativa 1: match direto via jQuery .val() (funciona
             quando o effective value do option é igual ao texto). */
          $selCb.val(ultCb.motivo);
          if (($selCb.val() || '').trim() !== ultCb.motivo.trim()) {
            /* Tentativa 2: percorre options comparando texto (mais tolerante) */
            var achou = false;
            $selCb.find('option').each(function() {
              if ($(this).text().trim() === ultCb.motivo.trim()) {
                $selCb.val($(this).val() || $(this).text());
                achou = true;
                return false;
              }
            });
            if (!achou) {
              /* Tentativa 3: match case-insensitive */
              var alvo = ultCb.motivo.toLowerCase().trim();
              $selCb.find('option').each(function() {
                if ($(this).text().toLowerCase().trim() === alvo) {
                  $selCb.val($(this).val() || $(this).text());
                  achou = true;
                  return false;
                }
              });
            }
            SLog.info('CB fill MOTIVO ' + (achou ? 'OK' : 'FALHOU') +
                      ' — final: "' + ($selCb.val() || '(vazio)') + '"');
          } else {
            SLog.info('CB fill MOTIVO OK (direct) — "' + $selCb.val() + '"');
          }
        }

        /* DATA/HORA */
        if (ultCb.data_hora) {
          var pad2 = function(n) { return String(n).padStart(2, '0'); };
          var d2 = new Date(ultCb.data_hora);
          if (isNaN(d2.getTime())) {
            SLog.warn('CB fill DATA — data_hora inválida: ' + ultCb.data_hora);
          } else {
            var isoLocal = d2.getFullYear() + '-' + pad2(d2.getMonth()+1) + '-' + pad2(d2.getDate()) +
                           'T' + pad2(d2.getHours()) + ':' + pad2(d2.getMinutes());
            $('#cb-datetime').val(isoLocal);
            SLog.info('CB fill DATA OK — "' + isoLocal + '"');
          }
        }

        /* OBS */
        if (ultCb.obs) {
          $('#cb-obs').val(ultCb.obs);
          SLog.info('CB fill OBS OK — "' + ultCb.obs + '"');
        }

        /* RESULTADO */
        if (ultCb.resultado) {
          var $btns = $('#cb-resultado-opts .res-opt');
          $btns.removeClass('selected'); /* garante reset */
          var achouRes = false;
          $btns.each(function() {
            if ($(this).text().trim() === ultCb.resultado.trim()) {
              $(this).addClass('selected');
              achouRes = true;
              return false;
            }
          });
          if (!achouRes) {
            /* Match case-insensitive fallback */
            var alvoRes = ultCb.resultado.toLowerCase().trim();
            $btns.each(function() {
              if ($(this).text().toLowerCase().trim() === alvoRes) {
                $(this).addClass('selected');
                achouRes = true;
                return false;
              }
            });
          }
          SLog.info('CB fill RESULTADO ' + (achouRes ? 'OK' : 'FALHOU'));
        }
      } else {
        SLog.info('CB fill — nenhuma interação cuidar_base encontrada no histórico');
      }
    }).catch(function(err) {
      SLog.error('_preencherAbaCarteira: ' + err.message);
    });
  }

  /* ============================================================
     Chamado #31 — Fonte do Lead obrigatória na etapa Lead.
     ============================================================
     Como a aba Lead não tem botão "confirmar" (é autosave), a
     obrigatoriedade é checada no momento de AVANÇAR de etapa
     (Lead → Ligação). Se estiver vazia:
       • ativa a aba Lead (o usuário pode estar em outra aba),
       • marca o campo #mld-fonte como inválido,
       • mostra Toast e devolve false.
     Só bloqueia em lead.etapa === 'lead'. Retorna true nas demais.
     ============================================================ */
  static _validarFonteObrigatoria(lead) {
    if (!lead || lead.etapa !== 'lead') return true;
    var fonte = ($('#mld-fonte').val() || '').trim();
    if (fonte) return true;

    /* Ativa a aba Lead pra o usuário ver o campo destacado */
    var $tabBtn = $('#modal-lead .lead-tab-btn[data-tab="tab-lead"]');
    if ($tabBtn.length && $tabBtn.trigger) $tabBtn.trigger('click');

    Utils.marcarInvalido('#mld-fonte', true);
    Toast.show('Fonte do Lead obrigatória antes de avançar','warning');
    return false;
  }

  static _atualizarBotoesModal(lead) {
    const idx = STAGE_ORDER.indexOf(lead.etapa);
    const $btnAvan  = $('#mld-btn-avancar');
    const $btnLig   = $('#mld-btn-lig');
    const $btnExcl  = $('#mld-btn-excluir');
    /* v2.1 — botões de arquivamento (RN-21) */
    const $btnArq   = $('#mld-btn-arquivar');
    const $btnDesarq= $('#mld-btn-desarquivar');

    /* Botão excluir — só gerente vê */
    var isGerente = AuthService.currentProfile && AuthService.currentProfile.perfil === 'gerente';
    $btnExcl.toggle(!!isGerente);

    /* v2.1 (RN-21) — Arquivar/Desarquivar disponível para TODOS os perfis
       (regra do documento: "disponível para todos os perfis"). Alterna
       conforme estado atual do lead. */
    if (lead.arquivado === true) {
      $btnArq.hide();
      $btnDesarq.show();
    } else {
      $btnArq.show();
      $btnDesarq.hide();
    }

    /* Reset defensivo do estado disabled — em caso de troca rápida
       entre leads de etapas diferentes, evita herdar estado anterior. */
    $btnAvan.prop('disabled', false).removeAttr('title');

    if (lead.etapa === 'ligacao') {
      $btnLig.show(); $btnAvan.hide();
    } else if (lead.etapa === 'carteira') {
      $btnLig.hide(); $btnAvan.text('Registrar ✓').show();
    } else {
      $btnLig.hide();
      const prox = STAGE_CONFIG[STAGE_ORDER[idx+1]];
      $btnAvan.text(prox ? 'Avançar: '+prox.icon+' '+prox.label+' →' : 'Salvar ✓').show();
    }

    /* ============================================================
       Patch FLOW-1 — estado inicial do botão na etapa Visita (ponto 4.b)
       Aplicamos um pre-state "carregando" enquanto o histórico não
       resolve. A regra real (habilitar/desabilitar baseado no tipo
       selecionado) fica em _atualizarBotaoAvancarVisita, chamado a
       partir de _preencherAbaVisita após o histórico carregar e
       de selecionarVisita a cada clique do usuário.
       ============================================================ */
    if (lead.etapa === 'visita') {
      $btnAvan.prop('disabled', true).attr('title', 'Carregando histórico...');
    }
  }

  /* ============================================================
     Patch FLOW-1 — atualiza estado do botão Avançar conforme o
     tipo de visita selecionado (ponto 4.b)

     Regra simples:
     - Sem nenhum tipo selecionado → disabled (evita avanço acidental
       quando o lead entra na etapa Visita sem nada registrado).
     - Delay/C2/NãoFechou selecionado → "Registrar Resultado", habilitado.
     - Venda selecionado → "Avançar: Venda →", habilitado.

     A intenção do usuário é clara pelo botão que ele selecionou.
     O sistema apenas evita o caso "botão vem habilitado por padrão
     antes do usuário escolher qualquer coisa".
     ============================================================ */
  static _atualizarBotaoAvancarVisita(tipo) {
    /* Em modo read-only (lead em Venda/Carteira) não toca no botão */
    if ($('#tab-visita').hasClass('modo-readonly')) return;

    /* HOTFIX FLOW-1 — defesa em profundidade: só atua se o lead atual
       realmente está na etapa Visita. Evita sobrescrever o botão
       Avançar configurado pra outras etapas (Lead, Agendamento, etc). */
    var leadAtual = (typeof store !== 'undefined') ? store.currentLead : null;
    if (!leadAtual || leadAtual.etapa !== 'visita') return;

    const $btnAvan = $('#mld-btn-avancar');

    if (!tipo) {
      /* Nenhum tipo selecionado — bloqueia até o usuário escolher.
         É o estado que aparece quando o lead entra na etapa Visita
         sem nenhuma visita registrada ainda. */
      $btnAvan.text('Avançar: 💰 Venda →')
              .prop('disabled', true)
              .attr('title', 'Selecione um resultado da visita primeiro');
      return;
    }

    if (tipo === 'venda') {
      /* Venda selecionada → libera avanço para etapa Venda */
      $btnAvan.text('Avançar: 💰 Venda →')
              .prop('disabled', false)
              .removeAttr('title');
    } else {
      /* Delay / C2 / Não Fechou → registra mais uma tentativa do tipo */
      $btnAvan.text('✓ Registrar Resultado')
              .prop('disabled', false)
              .removeAttr('title');
    }
  }

  /* ── Excluir lead atual (soft delete) ──
     Chamado "Exclusão de Card" (carteira):
     ANTES (BUG-H): bloqueava excluir qualquer lead com venda registrada,
     pra não deixar venda órfã descolando os KPIs. Isso impedia excluir
     cards na carteira — mas o cliente precisa disso (às vezes a venda
     retorna/é cancelada).

     AGORA: a exclusão é permitida mesmo com venda. A VENDA é PRESERVADA
     no banco (decisão do cliente — mantém o histórico financeiro); o que
     o soft-delete do lead faz é tirar o card do funil. A consistência de
     KPIs é garantida porque o SupabaseSync.carregarVendas passou a
     DESCARTAR vendas de leads soft-deletados — então a venda preservada
     não conta mais nos números enquanto o card estiver excluído (e volta
     a contar se o lead for restaurado).

     Mantém confirmação reforçada quando há venda, pra deixar claro que é
     um card de carteira/venda sendo removido.
  */
  static excluirLeadAtual() {
    var lead = store.currentLead;
    if (!lead) return;

    var temVenda = (store.vendas || []).some(function(v) {
      return v._lead_uuid === lead._uuid;
    });

    /* Chamado Exclusão na carteira — EXCLUSÃO REAL (hard delete).
       Decisão do cliente (D1): excluir = apagar de vez; para ocultar de
       forma reversível existe o Arquivar. As FKs de leads são ON DELETE
       CASCADE (vendas, ligacoes, agendamentos, visitas, carteira_interacoes
       etc.), então a venda 'retornada' some do banco e deixa de contar em
       metas/relatórios em qualquer perfil. Mensagem deixa a permanência
       explícita. */
    var titulo = 'Excluir Card (permanente)';
    var msg;
    if (temVenda) {
      msg = '⚠️ EXCLUSÃO PERMANENTE. Este card tem venda registrada (carteira). '
          + 'Ao excluir, o lead E a venda associada são apagados de vez do banco '
          + '(ligações, agendamentos, visitas e interações de carteira também). '
          + 'A venda deixa de contar em metas e relatórios. Esta ação NÃO tem volta — '
          + 'para ocultar de forma reversível, use Arquivar. Excluir "'
          + lead.nome + '" (' + lead.id + ')?';
    } else {
      msg = '⚠️ EXCLUSÃO PERMANENTE. O lead e todo o histórico dele são apagados de vez '
          + 'do banco. Esta ação NÃO tem volta — para ocultar de forma reversível, use '
          + 'Arquivar. Excluir "' + lead.nome + '" (' + lead.id + ')?';
    }

    ConfirmDialog.show('🗑️', titulo, msg, async function() {
      SLog.load('Excluindo card (HARD DELETE): ' + lead.id + (temVenda ? ' (com venda — cascata)' : ''));

      /* Auditoria best-effort ANTES de apagar (a linha some do banco). */
      try {
        if (typeof AuditLogger !== 'undefined' && AuditLogger.logExclusao) {
          await AuditLogger.logExclusao('lead',
            'Código ' + lead.id + ' — ' + lead.nome +
            (temVenda ? ' (com venda associada)' : '') + ' [exclusão permanente]');
        }
      } catch (e) { SLog.warn('Auditoria exclusão: ' + e.message); }

      /* HARD DELETE no Supabase. Não dispara o trigger BEFORE UPDATE de
         deleted_at (que bloqueava o soft-delete de lead com venda), pois
         é um DELETE, não um UPDATE. A cascata cuida das tabelas filhas. */
      if (lead._uuid && supa) {
        var res = await supa.from('leads').delete().eq('id', lead._uuid);
        if (res.error) {
          SLog.error('DB DELETE leads: ' + res.error.message);
          Toast.show('Erro ao excluir: ' + (res.error.message || 'erro desconhecido'), 'danger');
          return;
        }
        SLog.info('DB DELETE leads: hard delete + cascata ✓');
      }

      /* Limpa a memória do que a cascata removeu no banco, pra os números
         baterem na hora sem esperar reload. */
      var uuid = lead._uuid;
      store.leads             = store.leads.filter(function(l) { return l.id !== lead.id; });
      store.vendas            = (store.vendas || []).filter(function(v) { return v._lead_uuid !== uuid; });
      store.ligacoes          = (store.ligacoes || []).filter(function(l) { return l._lead_uuid !== uuid; });
      store.agendamentos      = (store.agendamentos || []).filter(function(a) { return a._lead_uuid !== uuid; });
      store.visitas           = (store.visitas || []).filter(function(v) { return v._lead_uuid !== uuid; });
      store.carteiraInteracoes= (store.carteiraInteracoes || []).filter(function(c) { return c._lead_uuid !== uuid; });

      store.currentLead = null;
      FunilModule._forcarFecharModalLead();
      FunilModule.renderKanban();
      FunilModule.renderFunilPreview();
      FunilModule.renderNumeroMagico();
      FunilModule.atualizarKPIs();
      /* Invalida os totais de empresa (esp/sup em modo empresa) pra refletir
         a exclusão na hora — a RPC reconta sem a venda apagada. */
      if (FunilModule.invalidarTotaisEmpresa) FunilModule.invalidarTotaisEmpresa();
      Toast.show('Card "' + lead.nome + '" excluído definitivamente.', 'warning');
    });
  }

  static _atualizarContadorTentativas(t) {
    const $b = $('#mld-tent-badge');
    $b.text(t+' tentativas').toggleClass('tent-warn', t>=25);
  }

  static _atualizarRemarketing(t) {
    const $rem = $('#tab-ligacao .res-opt[data-tipo="remarketing"]');
    const $warn = $('#remarketing-warn');
    if (t >= 30) { $rem.removeClass('disabled-opt'); $warn.hide(); }
    else { $rem.addClass('disabled-opt'); $warn.show().find('span').text(30-t+' tentativas restantes para Remarketing'); }
  }

  /* ---- LIGAÇÃO ---- */
  static registrarLigacao() {
    const lead = store.currentLead;
    if (!lead) return;
    const resultado = $('#tab-ligacao .res-opt.selected').text().trim();
    if (!resultado) { Toast.show('Selecione um resultado','warning'); return; }

    /* Patch VAL-1 — bloqueia ligação com data/hora futura (ponto 2.a) */
    if (!Utils.validarDataNaoFutura('#lig-datetime', 'ligação')) return;

    /* Captura data/hora escolhida pelo especialista no formulário (RF-12 do DRS).
       Campo datetime-local devolve "YYYY-MM-DDTHH:mm" sem timezone — convertemos
       para ISO completo para o Supabase (TIMESTAMPTZ) interpretar corretamente. */
    let dataHoraInput = $('#lig-datetime').val();
    let dataHoraISO   = null;
    if (dataHoraInput) {
      try {
        dataHoraISO = new Date(dataHoraInput).toISOString();
      } catch (e) { dataHoraISO = null; }
    }

    /* Observações ESPECÍFICAS desta ligação (independentes do lead.obs geral). */
    const obsLigacao = ($('#mld-lig-obs').val() || '').trim();

    ConfirmDialog.show('📞','Confirmar Ligação',
      `Registrar ligação para ${lead.nome}?\nResultado: ${resultado}`, () => {
      lead.tentativas++;
      /* PATCH OBS-3.5 — persiste obs geral + campos editáveis da aba Lead
         (fonte, placa, fipe, mensalidade etc) que estavam sendo perdidos */
      FunilModule._salvarCamposLead(lead);
      store.adicionarLigacao(lead, resultado, {
        dataHora: dataHoraISO,
        obs:      obsLigacao,
      });
      AtividadeModule.adicionar('📞', lead.nome, `Tentativa #${lead.tentativas}`, resultado, '#D1FAE5','#059669','ligacao');
      FunilModule.renderKanban();
      FunilModule.atualizarKPIs();
      FunilModule._atualizarContadorTentativas(lead.tentativas);
      FunilModule._atualizarRemarketing(lead.tentativas);
      HistoricoModule.render();
      /* Chamado #85 — a ligação foi PERSISTIDA e o modal continua aberto
         (resultado ainda 'selected', data/obs preenchidas). Sem rebaseline,
         ao fechar o dirty-check acusava 'Alterações não salvas' mesmo já tendo
         registrado. Rebaseia o estado atual como novo baseline → fechar fica
         limpo. */
      FunilModule._rebaselinearModalLead();

      if (resultado.includes('Agendamento')) {
        setTimeout(() => FunilModule._popupConcluirLigacao(lead,'agendamento'), 400);
      } else if (resultado.includes('Remarketing') && lead.tentativas >= 30) {
        setTimeout(() => FunilModule._popupConcluirLigacao(lead,'remarketing'), 400);
      } else {
        Toast.show(`Ligação registrada! Tentativa #${lead.tentativas}`,'success');
      }
    });
  }

  static _popupConcluirLigacao(lead, tipo) {
    $('#mcl-nome').text(lead.nome);
    $('#mcl-tent').text(lead.tentativas);
    const bloq = lead.tentativas < 30;
    $('#mcl-btn-remarketing').prop('disabled', bloq);
    $('#mcl-remarketing-warn').toggle(bloq);
    $('#mcl-btn-agendamento').off('click').on('click', () => {
      store.avancarEtapa(lead,'agendamento');
      Modal.fechar('modal-concluir-lig');
      FunilModule._forcarFecharModalLead();
      Toast.show('Prosseguindo para Agendamento...','success');
      FunilModule.renderKanban();
      setTimeout(() => FunilModule.abrirDetalhe(lead.id), 250);
    });
    $('#mcl-btn-remarketing').off('click').on('click', async () => {
      Modal.fechar('modal-concluir-lig');

      /* v2.1 (RN-22 / feature 4.2) — Auto-arquivamento em Remarketing.
         Antes: só mostrava toast e o lead ficava na coluna Ligação com 30+
         tentativas indefinidamente, sujando a visão de todos.
         Agora: arquiva o lead automaticamente (arquivado_por = NULL para
         diferenciar de arquivamento manual na auditoria). Se o gerente
         desarquivar depois, o card volta à coluna Ligação onde ele está. */
      var okArquiv = await store.autoArquivarPorRemarketing(lead.id);

      if (okArquiv) {
        FunilModule.renderKanban();
        FunilModule.renderFunilPreview();
        FunilModule.renderNumeroMagico();
        FunilModule._forcarFecharModalLead();
        Toast.show('Lead enviado para Remarketing e arquivado automaticamente.', 'info');
      } else {
        /* Fallback: se o auto-arquivamento falhar (rede/RLS), mantém o
           comportamento anterior — só informa e não bloqueia o fluxo. */
        Toast.show('Lead enviado para Remarketing.', 'info');
      }
    });
    Modal.abrir('modal-concluir-lig');
  }

  static concluirLigacao() {
    const lead = store.currentLead;
    if (!lead) return;
    FunilModule._popupConcluirLigacao(lead, 'menu');
  }

  /* ---- AGENDAMENTO ---- */
  static confirmarAgendamento() {
    const lead = store.currentLead;
    if (!lead) return;
    const data     = $('#agen-data-visita').val();
    const cat      = $('#agen-cat').val();
    const local    = $('#agen-local').val();
    const obs      = ($('#mld-agen-obs').val() || '').trim();
    /* Patch PERS-1 — data em que o agendamento foi feito (ponto 3.b/3.c) */
    const dataFeito = $('#agen-data-feito').val();

    if (!data) {
      Utils.marcarInvalido('#agen-data-visita', true);
      Toast.show('Data/hora da visita obrigatória','warning');
      return;
    }

    /* ════════════════════════════════════════════════════════════
       Chamado "Não está registrando o agendamento" (BCR-2026-00275)
       ════════════════════════════════════════════════════════════
       Detecta ANTES das validações se é uma REMARCAÇÃO (já existe
       agendamento vigente) ou um PRIMEIRO registro. Isso é crucial:
       na remarcação, o campo "data em que o agendamento foi feito"
       (#agen-data-feito) NÃO deve ser reexigido nem revalidado — a
       data de realização original já foi gravada na criação e é
       preservada (decisão D2 do #61).

       O bug: as validações de dataFeito abaixo rodavam SEMPRE. Quando
       o prospecto remarcava (reabrindo o card, às vezes com o campo
       de data-feito vazio ou com data que a validação "não futura"
       barrava), a função dava return ANTES de gravar — a remarcação
       era perdida silenciosamente. Agora, sendo remarcação, pulamos
       essas duas validações e seguimos direto pra gravação. */
    var agVigente = FunilModule._agendamentoVigente(lead);
    var ehRemarcacao = !!agVigente;

    if (!ehRemarcacao) {
      /* Patch PERS-1 — data de realização obrigatória só no 1º registro */
      if (!dataFeito) {
        Utils.marcarInvalido('#agen-data-feito', true);
        Toast.show('Data de realização do agendamento é obrigatória','warning');
        return;
      }
      /* Patch VAL-1 — bloqueia "data em que o agendamento foi feito" no futuro */
      if (!Utils.validarDataNaoFutura('#agen-data-feito', 'data de realização do agendamento')) return;
    }

    /* Hotfix VAL-1 bloqueava a data da visita no passado. Chamado #121 —
       o cliente precisa registrar vendas retroativas (esqueceu de lançar
       no ciclo passado); pra isso o funil inteiro precisa aceitar datas
       passadas, inclusive o agendamento. Mantido só o limpar de marcação
       de erro; sem bloqueio de data passada aqui. */
    Utils.marcarInvalido('#agen-data-visita', false);

    /* ============================================================
       Chamado #61 — remarcar NÃO duplica mais.
       ============================================================
       ANTES: confirmarAgendamento sempre chamava adicionarAgendamento
       (INSERT), então reabrir o card em Agendamento e trocar Local/
       horário criava uma NOVA linha na agenda (duplicidade).
       AGORA: se já existe um agendamento vigente para este lead,
       ATUALIZAMOS a mesma linha (store.atualizarAgendamento). Só cria
       linha nova quando não há agendamento vigente (primeiro registro).

       Os dois casos legítimos de duplicação não passam por aqui:
         1) C2 na coluna Visita → criado em confirmarVisita() (segue INSERT);
         2) Lead duplicado p/ nova placa → outro _uuid → _agendamentoVigente
            devolve null → cai no INSERT natural abaixo.

       Patch PERS-1 — dataRealizacao só é usada na CRIAÇÃO; na
       remarcação a data de realização original é preservada (D2). */
    /* Chamado #61 (reincidência) — a decisão criar-vs-remarcar passa a
       usar a EXISTÊNCIA do agendamento vigente, não a presença do _uuid.
       Motivo: o _uuid só chega quando o INSERT do banco retorna; se o
       usuário remarcava antes disso (ou após o INSERT falhar), a guarda
       antiga (agVigente && agVigente._uuid) caía no INSERT e DUPLICAVA.
       Agora, se existe vigente em memória, delegamos ao
       store.atualizarAgendamento, que trata internamente os estados
       'pending'/'failed'/'ok' sem nunca criar segunda linha. */
    if (agVigente) {
      store.atualizarAgendamento(agVigente, { data: data, local: local, categoria: cat, obs: obs });
    } else {
      store.adicionarAgendamento({ lead, data, dataRealizacao: dataFeito, categoria: cat, local, obs });
    }
    /* PATCH OBS-3.5 — salva obs geral + campos editáveis da aba Lead */
    FunilModule._salvarCamposLead(lead);
    /* Chamado #28 — ANTES: avancarEtapa(lead,'visita') pulava o card
       direto pra Visita ao confirmar. AGORA: a data/hora é salva
       (adicionarAgendamento acima) e o card PERMANECE em Agendamento.
       O AutoAvancoVisita (FunilModule.autoAvancarVisitasVencidas, no
       app.js) promove pra Visita automaticamente quando a data/hora
       do agendamento passar. */
    store.avancarEtapa(lead,'agendamento');
    /* Chamado #61 — mensageria coerente: remarcação não é "novo".
       Usa o ehRemarcacao calculado no topo (existência do vigente),
       não a presença de _uuid (que pode ainda não ter chegado do
       banco em remarcações rápidas). */
    var _ehRemarcacao = ehRemarcacao;
    var _verboAgen = _ehRemarcacao ? 'Agendamento remarcado' : 'Novo agendamento';
    store.adicionarNotificacao(`📅 ${_verboAgen}: ${lead.nome} — ${Utils.formatDate(data)}`);

    /* ════════════════════════════════════════════════════════════
       Chamado #125 — agendamento RETROATIVO tem que avançar pra Visita
       ════════════════════════════════════════════════════════════
       O #121 liberou o cadastro com data retroativa, mas o card do lead
       ficava preso em Agendamento: o especialista tinha que lançar uma
       data futura pra conseguir seguir o fluxo.

       O avanço dependia SO do autoAvancarVisitasVencidas, que descobre
       a data via _agendamentoVigente(lead) — uma leitura do cache
       `store.agendamentos`. Esse cache é parcial (o boot traz um lote
       limitado), então quando o agendamento do lead não está nele o
       auto-avanço simplesmente não encontra prazo nenhum e desiste em
       silêncio — sem erro, sem toast, exatamente o sintoma relatado.

       Agora a decisão usa a data que o especialista ACABOU de digitar
       (`data`, lá do #agen-data-visita), que é informação de primeira
       mão e não depende de cache nenhum:

         • data/hora JÁ PASSOU  → avança pra Visita agora;
         • data/hora NO FUTURO  → fica em Agendamento (regra preservada
           explicitamente no chamado), e o tick de 60s do
           autoAvancarVisitasVencidas promove quando o horário chegar.

       O autoAvancar continua sendo chamado depois: ele cobre os OUTROS
       leads cujo prazo venceu enquanto a tela estava aberta. */
    var _tsAgen = new Date(data).getTime();
    var _agenVencido = !isNaN(_tsAgen) && _tsAgen <= Date.now();
    if (_agenVencido) {
      store.avancarEtapa(lead, 'visita');
      SLog.info('AGEN-RETRO (#125): lead ' + lead.id + ' com agendamento em ' +
                data + ' (já passado) → avançado direto pra Visita');
    }

    /* v2.14 (VIS-DATE-2) — re-avalia o avanço dos DEMAIS leads (o deste
       já foi resolvido acima pela data digitada). Idempotente: se este
       lead já saiu de 'agendamento', a guarda de etapa o ignora. */
    if (FunilModule.autoAvancarVisitasVencidas) {
      try { FunilModule.autoAvancarVisitasVencidas(true); }
      catch (e) { SLog.error('VIS-DATE-2 re-avaliação pós-save: ' + e.message); }
    }
    FunilModule.renderKanban();
    FunilModule.renderFunilPreview();
    FunilModule.renderNumeroMagico();
    AgendaModule.renderFull();
    AtividadeModule.adicionar('📅', lead.nome, (_ehRemarcacao ? 'Agendamento remarcado' : 'Agendamento confirmado'), Utils.formatDate(data),'#DBEAFE','#2563EB','agendamento');
    NotifController.atualizar();
    /* Chamado #125 — o toast diz PRA ONDE o card foi. Sem isso o
       especialista salva um agendamento retroativo, o card muda de
       coluna e ele não entende o que aconteceu (nem se funcionou). */
    var _msgAgen = _ehRemarcacao ? 'Agendamento remarcado!' : 'Agendamento confirmado! Gestor notificado.';
    if (_agenVencido) _msgAgen += ' A data já passou — o lead foi movido para Visita.';
    Toast.show(_msgAgen, 'success');
    FunilModule._forcarFecharModalLead();
  }

  /* ---- VISITA ---- */
  static confirmarVisita() {
    const lead = store.currentLead;
    if (!lead) return;
    const $sel = $('#tab-visita .vres-btn.selected');
    if (!$sel.length) { Toast.show('Selecione o resultado da visita','warning'); return; }
    const tipo = $sel.data('tipo');
    /* PATCH OBS-3.5: obs geral vem do #mld-obs (acumulada).
       Antes pegava de #mld-vis-obs, que é a obs ESPECÍFICA da
       visita — ia parar errado em lead.obs e sobrescrevia
       acumulado das outras etapas. */
    lead.obs = $('#mld-obs').val() || lead.obs;

    /* Mapeia o tipo de UI ('nao'/'delay'/'c2'/'venda') para o enum do banco */
    var tipoBanco = (tipo === 'nao') ? 'nao_fechou' : tipo;

    /* Coleta + VALIDA dados específicos por tipo ANTES de persistir */
    var tentativaDataHora = null;
    var tentativaResultado = null;
    var localTipo = null;
    /* PATCH FLOW-3.6 — novos campos */
    var tipoC2  = null;
    var objecao = null;

    if (tipo === 'delay') {
      /* Patch VAL-1 — tentativa Delay não pode estar no futuro (ponto 4.a) */
      if (!Utils.validarDataNaoFutura('#vis-delay-dt', 'tentativa pós-delay')) return;
      tentativaDataHora = $('#vis-delay-dt').val();
      tentativaResultado = FunilModule._mapTentativaResultado($('#vis-detail-delay select').val());
    } else if (tipo === 'nao') {
      /* PATCH FLOW-3.6 (item 3.11) — reformulado para usar Objeção
         em vez de data/hora/resultado. Campos antigos ficam NULL. */
      objecao = $('#nao-objecao').val();
      if (!objecao) {
        Utils.marcarInvalido('#nao-objecao', true);
        Toast.show('Selecione a objeção do lead','warning');
        return;
      }
    } else if (tipo === 'c2') {
      /* PATCH FLOW-3.6 (item 3.10) — exige Tipo de C2 */
      tipoC2 = $('#c2-tipo').val();
      if (!tipoC2) {
        Utils.marcarInvalido('#c2-tipo', true);
        Toast.show('Selecione o tipo de C2','warning');
        return;
      }

      var c2data = $('#c2-data').val();
      var c2hora = $('#c2-hora').val();
      if (!c2data || !c2hora) { Toast.show('Preencha data e hora do C2','warning'); return; }
      /* Junta data + hora num único ISO para guardar em visitas.tentativa_data_hora */
      tentativaDataHora = c2data + 'T' + c2hora;
      var c2localRaw = ($('#c2-local').val() || 'Interno').toLowerCase().trim();
      localTipo = (c2localRaw.indexOf('extern') >= 0) ? 'externo'
                : (c2localRaw.indexOf('onlin')  >= 0) ? 'online'
                : 'interno';
    }

    /* Persiste a visita (depois de validar) */
    if (lead._uuid) {
      store.adicionarVisita({
        lead_uuid:           lead._uuid,
        tipo_resultado:      tipoBanco,
        tentativa_data_hora: tentativaDataHora ? new Date(tentativaDataHora).toISOString() : null,
        tentativa_resultado: tentativaResultado,
        local_tipo:          localTipo,
        tipo_c2:             tipoC2,
        objecao:             objecao,
        obs:                 '',
      });
    }

    if (tipo === 'venda') {
      store.avancarEtapa(lead,'venda');
      FunilModule.renderKanban();
      AtividadeModule.adicionar('💰',lead.nome,'Visita — Venda realizada!','','#D1FAE5','#059669','venda');
      Toast.show('🎉 Venda realizada! Avançando...','success');
      FunilModule._forcarFecharModalLead();
      setTimeout(() => FunilModule.abrirDetalhe(lead.id), 250);
    } else if (tipo === 'c2') {
      /* Chamado #88 — o C2 gera/atualiza um agendamento (mantém a Agenda
         atualizada). A coluna agendamentos.categoria_veiculo tem CHECK com
         as 6 categorias oficiais; 'C2' NÃO é uma delas, então o INSERT
         falhava (async) e, no reload, o agendamento sumia da agenda e o
         balãozinho voltava ao horário antigo. Reaproveita a categoria do
         agendamento vigente do lead (ou o default 'Nacional Particular').
         O marcador de C2 já vem da visita (tipo_resultado='c2' /
         tipo_c2), então não se perde nada.

         Chamado #96 (revisa #81) — C2 é um REAGENDAMENTO de uma visita,
         não um novo agendamento: o card só deve mudar de posição na
         coluna Visitas/Agenda conforme o novo horário, sem contar como
         "novo agendamento" nos relatórios (Taxa de Conversão etc., que
         somam store.agendamentos). Por isso, quando já existe um
         agendamento vigente para o lead, ATUALIZAMOS a mesma linha
         (store.atualizarAgendamento — mesmo padrão do Chamado #61 em
         confirmarAgendamento) em vez de inserir uma nova. Só cai no
         INSERT se por algum motivo não houver vigente (não deveria
         acontecer no fluxo normal de C2, mas evita perder a data). */
      var _agVigC2 = FunilModule._agendamentoVigente(lead);
      var _catC2 = (_agVigC2 && _agVigC2.categoria) ? _agVigC2.categoria : 'Nacional Particular';
      if (_agVigC2) {
        store.atualizarAgendamento(_agVigC2, { data: tentativaDataHora, categoria: _catC2, local: $('#c2-local').val() });
      } else {
        store.adicionarAgendamento({ lead, data: tentativaDataHora, categoria: _catC2, local: $('#c2-local').val() });
      }

      /* RN-04 do DRS v1.2: C2 é um agendamento — gerentes da filial recebem notificação. */
      const filialIdC2 = (AuthService.currentProfile && AuthService.currentProfile.filial_id) || null;
      const msgGestorC2 = `📅 C2 agendado: ${lead.nome}`;
      if (filialIdC2) {
        store.adicionarNotificacaoGestores(filialIdC2, msgGestorC2)
          .then(function(qtd) {
            if (qtd > 0) Toast.show('C2 registrado. ' + qtd + ' gestor(es) notificado(s).', 'success');
            else         Toast.show('C2 registrado.', 'success');
          });
      } else {
        SLog.warn('confirmarVisita C2: usuário sem filial_id — gestores não notificados');
        Toast.show('C2 registrado.', 'success');
      }

      NotifController.atualizar();
      AtividadeModule.adicionar('📅',lead.nome,'Visita — C2 agendado','','#DBEAFE','#2563EB','agendamento');
      /* Chamado #96 — reflete o novo horário do C2 na Agenda imediatamente
         (mesmo padrão do confirmarAgendamento), já que agora é um UPDATE
         na linha vigente e não um novo registro. */
      if (typeof AgendaModule !== 'undefined' && AgendaModule.renderFull) AgendaModule.renderFull();
      FunilModule._forcarFecharModalLead();
    } else {
      const det = tipo==='delay'?'Delay':'Não fechou';
      AtividadeModule.adicionar('🏠',lead.nome,`Visita — ${det}`,'','#FEF3C7','#D97706','visita');
      Toast.show('Resultado registrado.','success');
      FunilModule._forcarFecharModalLead();
    }
    FunilModule.renderKanban();
    FunilModule.renderNumeroMagico();
  }

  /* Mapeia o texto do <select> para o enum salvo na coluna tentativa_resultado */
  static _mapTentativaResultado(texto) {
    if (!texto) return null;
    var t = String(texto).toLowerCase();
    if (t.indexOf('não atendeu')   >= 0 || t.indexOf('nao atendeu')   >= 0) return 'nao_atendeu';
    if (t.indexOf('não reagendou') >= 0 || t.indexOf('nao reagendou') >= 0) return 'nao_reagendou';
    if (t.indexOf('agendamento')   >= 0) return 'agendamento';
    if (t.indexOf('retorn')        >= 0) return 'pediu_retorno';
    return null;
  }

  /* ════════════════════════════════════════════════════════════
     Chamado #86 — Excluir agendamento da agenda
     ════════════════════════════════════════════════════════════
     Aciona a exclusão do agendamento vigente do lead aberto. Pede
     confirmação (ação destrutiva), delega ao store.excluirAgendamento
     (remove de memória + banco) e re-renderiza a agenda e o funil pra
     o evento sumir na hora — sem F5.
     Não interfere no C2: excluir é uma ação explícita; a regra do #86
     ("ao alterar a data, exceto C2, apagar da agenda") é atendida pelo
     UPDATE in-place do #61, que já move o evento da data antiga.
     ──────────────────────────────────────────────────────────── */
  static excluirAgendamentoAtual() {
    var lead = store.currentLead;
    if (!lead) return;
    var ag = FunilModule._agendamentoVigente(lead);
    if (!ag) {
      Toast.show('Nenhum agendamento para excluir.', 'info');
      return;
    }
    ConfirmDialog.show(
      '🗑️',
      'Excluir Agendamento',
      'Deseja remover este agendamento da agenda? Esta ação não pode ser desfeita.',
      function() {
        store.excluirAgendamento(ag).then(function(ok) {
          if (ok) Toast.show('Agendamento excluído da agenda.', 'success');
          else    Toast.show('Agendamento removido localmente (verifique a conexão).', 'warning');

          /* Re-render imediato pra sumir da agenda e do card. */
          if (typeof AgendaModule !== 'undefined' && AgendaModule.renderFull) {
            try { AgendaModule.renderFull(); } catch (e) { SLog.warn('excluirAgendamentoAtual render agenda: ' + e.message); }
          }
          if (FunilModule.renderKanban) {
            try { FunilModule.renderKanban(); } catch (e) { SLog.warn('excluirAgendamentoAtual render funil: ' + e.message); }
          }
          /* Esconde o botão (não há mais vigente) e limpa os campos. */
          $('#mld-agen-excluir-wrap').hide();
          $('#agen-data-visita').val('');
        });
      }
    );
  }

  /* ---- VENDA ---- */

  /* ════════════════════════════════════════════════════════════
     Chamado #60 — "Não tem rastreador"
     ════════════════════════════════════════════════════════════
     O campo Valor Rastreador é obrigatório por padrão (regra do
     #31), mas o rastreador só existe em casos específicos. Este
     toggle permite marcar que o associado NÃO tem rastreador:
       • marcado  → campo de valor desabilitado + limpo, obrigatorie-
                    dade suspensa (a venda salva valor_rastreador=null).
       • desmarc. → campo reabilitado, obrigatório e > 0 como já era.
     Centralizado aqui pra ser reusado pelo onchange do checkbox,
     pela reabertura de venda existente e pelo reset do form.
     ──────────────────────────────────────────────────────────── */
  static toggleSemRastreador(semRastreador) {
    var $inp = $('#venda-rastreador');
    var $req = $('#venda-rastreador-req');   /* o asterisco "*" */
    if (semRastreador) {
      $inp.val('');
      $inp.prop('disabled', true);
      Utils.marcarInvalido('#venda-rastreador', false);  /* limpa marcação de erro */
      $req.hide();                                        /* esconde o "*" */
    } else {
      $inp.prop('disabled', false);
      $req.show();
    }
  }

  static confirmarVenda() {
    const lead = store.currentLead;
    if (!lead) return;
    const adesaoStr = $('#venda-adesao').val();
    const mensalStr = $('#venda-mensalidade').val();
    const rastrStr  = $('#venda-rastreador').val();
    const aniv      = $('#venda-aniversario').val();
    const dataV     = $('#venda-data').val() || Utils.getTodayDate();

    /* Patch UX-1: validação com marcação visual */
    if (!adesaoStr) {
      Utils.marcarInvalido('#venda-adesao', true);
      Toast.show('Valor de adesão obrigatório','warning');
      return;
    }

    /* Chamado #32 — Placa do Veículo é OBRIGATÓRIA na venda (segue
       opcional no Lead). Sincroniza com o input da aba Lead (#mld-placa)
       pra o autosave _salvarCamposLead persistir a placa correta e não
       zerá-la ao ler a aba Lead. Fallback: se o input não existir,
       usa a placa já gravada no lead. */
    var $placaInput = $('#venda-placa');
    var placaVenda = $placaInput.length
      ? ($placaInput.val() || '').trim()
      : ((lead.placa || '').trim());
    if (!placaVenda) {
      if ($placaInput.length) Utils.marcarInvalido('#venda-placa', true);
      Toast.show('Placa do veículo é obrigatória na venda','warning');
      return;
    }
    /* Chamado #91 — NÃO seta lead.placa aqui antes do _salvarCamposLead()
       logo abaixo. _salvarCamposLead só inclui `placa` no UPDATE que vai
       pro banco se o valor lido do input (#mld-placa) DIFERIR do
       lead.placa atual (ver campos.placa em _salvarCamposLead). Se
       setássemos lead.placa = placaVenda aqui, os dois já ficariam
       iguais na hora da comparação — o diff não detecta mudança, o
       campo nunca entra no payload, e a placa fica só na memória da
       sessão: ao ir pra Carteira e recarregar (F5, outro dispositivo),
       ela some porque nunca foi gravada no banco. Só atualizamos o
       INPUT; lead.placa é sincronizado pelo próprio store.atualizarLead
       (chamado dentro de _salvarCamposLead) quando o UPDATE for feito. */
    $('#mld-placa').val(placaVenda);

    /* Patch VAL-1 — data da venda não pode estar no futuro (ponto 5.c) */
    if (!Utils.validarDataNaoFutura('#venda-data', 'data da venda')) return;

    /* Patch UX-1: parser centralizado (aceita "R$ 1.234,56" e "1234.56") */
    var adesao = Utils.parseValor(adesaoStr);
    var mensal = Utils.parseValor(mensalStr);
    var rastr  = Utils.parseValor(rastrStr);

    if (adesao == null || adesao <= 0) {
      Utils.marcarInvalido('#venda-adesao', true);
      Toast.show('Valor de adesão inválido','warning'); return;
    }

    /* Chamado #31 — campos obrigatórios adicionais na venda:
       Valor Mensalidade, Valor Rastreador, Data da Venda e
       Aniversário do Associado. Validação item a item com marcação
       visual e mensagem específica (padrão UX-1). */
    if (mensal == null || mensal <= 0) {
      Utils.marcarInvalido('#venda-mensalidade', true);
      Toast.show('Valor de mensalidade obrigatório','warning'); return;
    }
    /* Chamado #60 — "Não tem rastreador".
       Se o especialista marcou que o associado não tem rastreador, a
       obrigatoriedade do valor é suspensa e a venda grava
       valor_rastreador = null. Caso contrário, mantém a regra do #31
       (obrigatório e > 0). */
    var semRastreador = $('#venda-sem-rastreador').is(':checked');
    if (!semRastreador) {
      if (rastr == null || rastr <= 0) {
        Utils.marcarInvalido('#venda-rastreador', true);
        Toast.show('Valor de rastreador obrigatório (ou marque "Não tem rastreador")','warning'); return;
      }
    }
    if (!$('#venda-data').val()) {
      Utils.marcarInvalido('#venda-data', true);
      Toast.show('Data da venda obrigatória','warning'); return;
    }
    if (!aniv) {
      Utils.marcarInvalido('#venda-aniversario', true);
      Toast.show('Aniversário do associado obrigatório','warning'); return;
    }

    /* Chamado #60 — valor efetivo do rastreador. Se marcado "Não tem",
       grava null (banco aceita) e zera o local pra exibições. */
    var rastrFinal = semRastreador ? null : rastr;

    /* Atualiza objeto local (para exibições imediatas e compatibilidade) */
    lead.adesao      = adesaoStr;
    lead.mensalidade = mensalStr;
    lead.rastreador  = semRastreador ? '' : rastrStr;
    lead.aniversario = aniv;
    lead.dataVenda   = dataV;

    /* PATCH OBS-3.5 — persiste obs + campos editáveis da aba Lead */
    FunilModule._salvarCamposLead(lead);

    /* Persiste em 'vendas' (Tarefa 7). Trigger cria o checklist pós-venda. */
    if (lead._uuid) {
      store.adicionarVenda({
        lead_uuid:         lead._uuid,
        valor_adesao:      adesao,
        valor_mensalidade: mensal,
        valor_rastreador:  rastrFinal,
        data_venda:        dataV,
        aniversario:       aniv || null,
        obs:               '',
      });
    }

    /* v2.6 — PATCH BUG-A (Opção B), revisado pelo Chamado #127
       ═══════════════════════════════════════════════════════════
       A regra do BUG-A — "quem fecha a venda vira o dono do cliente na
       carteira" — continua valendo, e faz sentido: em campo, quem
       fecha é quem passa a atender aquele associado.

       O que o #127 mostrou é que ela não pode valer quando um GESTOR
       lança a venda por outra pessoa. No caso do #121, o gerente
       cadastrou uma venda retroativa esquecida da Melissa e a regra
       transferiu o lead — e o crédito — para o gerente. A especialista
       perdeu o cliente da carteira dela sem ter feito nada.

       Nova condição: o lead só troca de dono quando quem registra é um
       ESPECIALISTA (fechou de fato) ou quando o lead ainda não tem
       responsável. Supervisor e gerente registrando venda de lead de
       outra pessoa passam a agir como lançamento administrativo:
       gravam a venda e deixam o cliente com quem é dele.

       Nota: se o trigger trg_sync_lead_responsavel_com_venda existir no
       banco, ele ainda vai sobrescrever responsavel_id no INSERT. O
       script sql/040 ajusta o trigger para a mesma regra — sem ele,
       esta correção vale só até o próximo F5. */
    var _perfilQuemRegistra = (typeof AuthService !== 'undefined' && AuthService.currentProfile)
      ? AuthService.currentProfile.perfil : null;
    var novoResp = (typeof AuthService !== 'undefined' && AuthService.currentUser)
      ? AuthService.currentUser.id
      : null;
    var _podeAssumirLead = !!novoResp && (
      _perfilQuemRegistra === 'especialista' ||   /* fechou a venda em campo */
      !lead.responsavel_id                        /* lead sem dono definido */
    );
    if (_podeAssumirLead && lead.responsavel_id !== novoResp) {
      var respAntigo = lead.responsavel_id;
      lead.responsavel_id = novoResp;
      var respNovoUsr = (store.usuarios || []).find(function(u) { return (u._id || u.id) === novoResp; });
      lead.responsavel_nome = respNovoUsr ? respNovoUsr.nome : (lead.responsavel_nome || '—');
      SLog.info('BUG-A/OpçãoB: responsavel_id sincronizado local (' + respAntigo + ' → ' + novoResp + ')');
    } else if (novoResp && lead.responsavel_id && lead.responsavel_id !== novoResp) {
      SLog.info('VENDA-DONO (#127): lançamento administrativo — lead ' + lead.id +
                ' permanece com o responsável ' + lead.responsavel_id +
                ' (registrado por ' + _perfilQuemRegistra + ' ' + novoResp + ')');
    }

    store.avancarEtapa(lead,'carteira');
    FunilModule.renderKanban();
    FunilModule.atualizarKPIs();
    FunilModule.renderFunilPreview();
    FunilModule.renderNumeroMagico();
    AtividadeModule.adicionar('💰',lead.nome,`Venda concluída — ${mensalStr || '—'}/mês`,`Adesão: ${adesaoStr}`,'#D1FAE5','#059669','venda');
    Toast.show('🎉 Venda registrada! Associado na carteira.','success');
    FunilModule._verificarMetaAtingida();   /* Chamado #56 — avisa todos se bateu a meta do ciclo */
    FunilModule._forcarFecharModalLead();
  }

  /* ================================================================
     Chamado #56 — Notificação de alcance de meta (para TODOS).
     ================================================================
     Após uma venda, conta as vendas do ciclo (RN-16: 26→25) do usuário
     que registrou (quem fecha vira o dono — Opção B) e, se ACABOU de
     cruzar a meta de vendas (count === meta), dispara a notificação
     global via store.notificarTodos (fan-out).

     Usa "=== meta" (e não ">=") para notificar UMA única vez, no exato
     momento em que a meta é batida. Reusa MetasModule._cicloAtual e o
     mesmo shape de vendas (v._esp_id / v.dataVenda) do Atingimento. */
  static _verificarMetaAtingida() {
    try {
      if (typeof MetasModule === 'undefined' || !MetasModule._cicloAtual) return;
      var prof = (typeof AuthService !== 'undefined') ? AuthService.currentProfile : null;
      var uid  = (typeof AuthService !== 'undefined' && AuthService.currentUser) ? AuthService.currentUser.id : null;
      if (!prof || !uid) return;

      var meta = Number(prof.meta_vendas) || 0;
      if (meta <= 0) return;

      var ciclo = MetasModule._cicloAtual();
      var count = (store.vendas || []).filter(function(v) {
        if ((v._esp_id) !== uid) return false;
        var dt = new Date(v.dataVenda || v.created_at);
        return dt >= ciclo.ini && dt <= ciclo.fim;
      }).length;

      if (count === meta) {
        var nome = prof.nome || (AuthService.currentUser && AuthService.currentUser.nome) || 'Um especialista';
        store.notificarTodos('🎉 ' + nome + ' atingiu a meta de vendas do ciclo!');
        SLog.info('Chamado #56: meta atingida por ' + nome + ' — notificando todos');
      }
    } catch (e) {
      SLog.warn('_verificarMetaAtingida: ' + e.message);
    }
  }

  /* ---- CARTEIRA — registrar interação (Tarefa 7) ----
     Onda 2 pós-testes (Ticket #23 parte 1) — mesmo padrão de defesa
     do registrarCuidarBase v3: await direto no CarteiraService pra
     capturar erro real do banco, log do payload enviado e do
     retorno pra investigar se o motivo persistiu. Antes o fluxo
     usava .then/.catch do store.adicionarCarteiraInteracao,
     dificultando descobrir onde o motivo estava se perdendo.

     Se o motivo voltar NULL do banco (Hip. 1 ou 2 do diagnóstico),
     o Toast avisa e o console tem o payload/reg pra investigar
     trigger/RLS/CHECK. Se voltar preenchido, então a persistência
     funciona e o problema seria só de exibição (Hip. 3). */
  static async registrarInteracaoCarteira() {
    const lead = store.currentLead;
    if (!lead) { Toast.show('Nenhum lead selecionado','warning'); return; }
    if (!lead._uuid) { Toast.show('Lead sem UUID; recarregue a página','warning'); return; }

    /* Captura motivo (primeiro select da aba carteira), data/hora, resultado
       3B.4: seleciona apenas dentro do bloco de Pedido de Recomendações,
       para não colidir com o novo bloco de Cuidar da Base. */
    var motivo    = $('#tab-carteira .form-section').first().find('select').first().val() || '';
    var dataHora  = $('#cart-datetime').val();
    var $resSel   = $('#tab-carteira .form-section').first().find('.res-opt.selected').first();
    var resultadoRaw = $resSel.length ? $resSel.text().trim() : '';

    if (!resultadoRaw) { Toast.show('Selecione um resultado','warning'); return; }

    /* Normaliza o resultado — a UI adiciona "✅ " em "Passou Recomendações".
       Padroniza pro banco: "Passou Recomendações" | "Não Passou Recomendações" |
       "Não Atendeu" | "Pediu para Retornar". */
    var resultado = resultadoRaw.replace(/^[^A-Za-zÀ-ÿ0-9]+/, '').trim();

    /* PATCH OBS-3.5 — persiste obs + campos editáveis da aba Lead */
    FunilModule._salvarCamposLead(lead);

    var espId    = (AuthService.currentProfile && (AuthService.currentProfile.id || AuthService.currentProfile._id)) || null;
    var filialId = (AuthService.currentProfile && AuthService.currentProfile.filial_id) || null;

    if (!espId) {
      Toast.show('Erro: usuário sem UUID (especialista_id). Faça logout/login.', 'danger');
      console.error('[Recomendacao] AuthService.currentProfile:', AuthService.currentProfile);
      return;
    }

    var payload = {
      lead_id:         lead._uuid,
      especialista_id: espId,
      filial_id:       filialId,
      tipo:            'recomendacao',
      motivo:          motivo,
      resultado:       resultado,
      data_hora:       dataHora ? new Date(dataHora).toISOString() : new Date().toISOString(),
      obs:             '',
    };
    console.log('[Recomendacao] Payload que será enviado:', payload);

    if (typeof CarteiraService === 'undefined' || !supa) {
      Toast.show('Supabase offline — não foi possível salvar.', 'danger');
      return;
    }

    try {
      var reg = await CarteiraService.registrar(payload);

      if (!reg || !reg.id) {
        Toast.show('Falha ao salvar interação — veja o console.', 'danger');
        console.error('[Recomendacao] CarteiraService.registrar retornou:', reg);
        return;
      }

      /* Onda 2 (Ticket #23) — checagem explícita de persistência do motivo */
      if (!reg.motivo) {
        console.warn('[Recomendacao] ⚠️ Motivo não persistiu no banco:', reg);
        Toast.show('Interação salva, mas o motivo ficou em branco. Reporte ao desenvolvedor.', 'warning');
      }

      /* Só adiciona ao array local depois do OK do banco */
      store.carteiraInteracoes.unshift({
        _uuid:      reg.id,
        _lead_uuid: lead._uuid,
        _esp_id:    espId,
        _filial_id: filialId,
        tipo:       'recomendacao',
        motivo:     reg.motivo || motivo,
        resultado:  reg.resultado || resultado,
        dataHora:   reg.data_hora,
        obs:        reg.obs || '',
      });

      console.log('[Recomendacao] ✅ Gravado — id:', reg.id, 'motivo:', reg.motivo);
      AtividadeModule.adicionar('👛', lead.nome, 'Carteira — ' + (reg.motivo || motivo || 'Contato'), reg.resultado || resultado, '#EDE9FE', '#7C3AED', 'carteira');
      Toast.show('Interação registrada na carteira.', 'success');
      FunilModule._forcarFecharModalLead();

    } catch (err) {
      Toast.show('Erro ao salvar: ' + (err.message || err), 'danger');
      console.error('[Recomendacao] Exceção:', err);
    }
  }

  /* ---- 3B.4: CARTEIRA — registrar interação de Cuidar da Base ----
     Fluxo paralelo ao registrarInteracaoCarteira, mas com:
       - tipo = 'cuidar_base' (grava separado em carteira_interacoes)
       - resultados restritos: Não Atendeu, Pediu para Retornar, Atendeu
       - motivo vem dos itens já existentes no select (Aniversários, Férias etc.)
     Sem dedup: cada clique cria uma linha nova (padrão do sistema). */
/* ---- 3B.4: CARTEIRA — registrar interação de Cuidar da Base ----
     v2 (diagnóstico): async + await direto no CarteiraService pra pegar
     erro do banco na hora e mostrar pro user. Se falhar, o Toast vira
     vermelho com o motivo real, ao invés do "sucesso" fantasma.

     v3 (Pacote 6 pós-homologação — T26, T27):
       - Normaliza o "resultado" removendo emoji (✅) que a UI adiciona
         só na opção "Atendeu". Antes ficava inconsistente no banco
         ("Atendeu" vs "✅ Atendeu") e podia falhar em CHECK constraint.
       - SEMPRE envia motivo, mesmo se o select cair pra vazio — evita
         cenário em que o campo motivo fica NULL no banco (T27).
       - Log detalhado do payload REAL enviado (antes só logava dados
         de entrada, não o que efetivamente foi pro banco).
       - Valida o motivo contra a lista fechada — se sair fora dela,
         mostra erro claro em vez de deixar o banco reclamar.
   */
  static async registrarCuidarBase() {
    const lead = store.currentLead;
    if (!lead) { Toast.show('Nenhum lead selecionado', 'warning'); return; }
    if (!lead._uuid) { Toast.show('Lead sem UUID; recarregue a página', 'warning'); return; }

    var motivo    = ($('#cb-motivo').val() || '').trim();
    var dataHora  = $('#cb-datetime').val();
    var $resSel   = $('#cb-resultado-opts .res-opt.selected').first();
    var resultadoRaw = $resSel.length ? $resSel.text().trim() : '';
    var obs       = ($('#cb-obs').val() || '').trim();

    /* v3 (T26) — Normaliza o resultado tirando emoji/prefixos visuais.
       A UI só coloca "✅ " em "Atendeu"; os outros vêm limpos. Padroniza
       tudo para valores canônicos: "Atendeu" | "Não Atendeu" | "Pediu para Retornar". */
    var resultado = resultadoRaw
      .replace(/^[^A-Za-zÀ-ÿ0-9]+/, '')  // remove símbolos/emojis do início
      .trim();

    if (!resultado) { Toast.show('Selecione um resultado para Cuidar da Base', 'warning'); return; }

    /* v3 (T27) — Valida motivo contra a lista fechada do <select>.
       Se sair fora dessa lista (bug de UI ou manipulação), aborta
       com toast claro em vez de deixar o banco reclamar de CHECK. */
    var MOTIVOS_VALIDOS = [
      'Aniversários', 'Férias', 'Festas', 'Feriado',
      'Fenômenos da Natureza', 'Índice de Acidentes',
      'Campanhas Promocionais', 'Relembrar Benefícios', 'Outros'
    ];
    if (!motivo || MOTIVOS_VALIDOS.indexOf(motivo) === -1) {
      Toast.show('Selecione um motivo válido para Cuidar da Base.', 'warning');
      console.warn('[CuidarBase] Motivo inválido ou vazio:', motivo);
      return;
    }

    /* Salva obs + campos editáveis do Lead junto — mesmo padrão do outro fluxo */
    FunilModule._salvarCamposLead(lead);

    /* Diagnóstico: valida pré-requisitos ANTES de tentar o INSERT */
    var espId    = (AuthService.currentProfile && (AuthService.currentProfile.id || AuthService.currentProfile._id)) || null;
    var filialId = (AuthService.currentProfile && AuthService.currentProfile.filial_id) || null;

    /* v3 — Log do payload REAL (antes de enviar) */
    var payload = {
      lead_id:         lead._uuid,
      especialista_id: espId,
      filial_id:       filialId,
      tipo:            'cuidar_base',
      motivo:          motivo,
      resultado:       resultado,
      data_hora:       dataHora ? new Date(dataHora).toISOString() : new Date().toISOString(),
      obs:             obs,
    };
    console.log('[CuidarBase] Payload que será enviado:', payload);

    if (!espId) {
      Toast.show('Erro: usuário sem UUID (especialista_id). Faça logout/login.', 'danger');
      console.error('[CuidarBase] AuthService.currentProfile:', AuthService.currentProfile);
      return;
    }

    /* Chamada DIRETA ao CarteiraService, com await — para capturar erro. */
    if (typeof CarteiraService === 'undefined' || !supa) {
      Toast.show('Supabase offline — não foi possível salvar.', 'danger');
      return;
    }

    try {
      var reg = await CarteiraService.registrar(payload);

      if (!reg || !reg.id) {
        Toast.show('Falha ao salvar Cuidar da Base — veja o console.', 'danger');
        console.error('[CuidarBase] CarteiraService.registrar retornou:', reg);
        return;
      }

      /* v3 — Confere se o registro veio de volta COM o motivo preenchido
         (defesa contra T27 — se o banco/RLS descartou o campo, avisa). */
      if (!reg.motivo) {
        console.warn('[CuidarBase] ⚠️ Motivo não persistiu no banco:', reg);
        Toast.show('Cuidar da Base salvo, mas o motivo ficou em branco. Reporte ao desenvolvedor.', 'warning');
      }

      /* Só adiciona ao array local se o banco confirmou */
      store.carteiraInteracoes.unshift({
        _uuid:      reg.id,
        _lead_uuid: lead._uuid,
        _esp_id:    espId,
        _filial_id: filialId,
        tipo:       'cuidar_base',
        motivo:     reg.motivo || motivo,   /* v3 — usa o do banco; fallback pro digitado */
        resultado:  reg.resultado || resultado,
        dataHora:   reg.data_hora,
        obs:        obs,
      });

      console.log('[CuidarBase] ✅ Gravado com sucesso — id:', reg.id, 'motivo:', reg.motivo);
      AtividadeModule.adicionar('🌱', lead.nome, 'Cuidar da Base — ' + motivo, resultado, '#D1FAE5', '#059669', 'carteira');
      Toast.show('Cuidar da Base registrado.', 'success');
      FunilModule._forcarFecharModalLead();

    } catch (err) {
      Toast.show('Erro ao salvar: ' + (err.message || err), 'danger');
      console.error('[CuidarBase] Exceção:', err);
    }
  }

  /* ============================================================
     Onda 2 pós-testes (Tickets #18, #23) — Histórico da Carteira
     ============================================================
     Modal único com todas as interações de carteira_interacoes
     do lead atual, filtro por tipo (todas | recomendacao | cuidar_base).
     Fonte de verdade: CarteiraService.historicoPorLead(leadUuid).

     _histCarteiraCache guarda o resultado da última busca pra que
     os cliques de filtro não disparem novo SELECT (o modal é
     re-renderizado do cache). Nova abertura re-consulta.
     ============================================================ */
  static async abrirHistoricoCarteira() {
    var lead = store.currentLead;
    if (!lead || !lead._uuid) {
      Toast.show('Lead sem UUID; recarregue a página.', 'warning');
      return;
    }

    $('#mhc-lead-info').text(lead.nome + ' · ' + lead.id);
    $('#mhc-contador').text('Carregando...');
    $('#mhc-lista').html('<div class="text-muted small p-2 text-center">Carregando histórico...</div>');
    /* Reset visual dos filtros — sempre abre em "todas" */
    $('.mhc-filtro').removeClass('selected');
    $('.mhc-filtro[data-tipo="todas"]').addClass('selected');
    FunilModule._histCarteiraFiltroAtual = 'todas';

    Modal.abrir('modal-hist-carteira');

    try {
      var hist = [];
      if (typeof CarteiraService !== 'undefined' && CarteiraService.historicoPorLead) {
        hist = await CarteiraService.historicoPorLead(lead._uuid);
      }
      FunilModule._histCarteiraCache = hist || [];
      FunilModule._renderHistoricoCarteira();
    } catch (err) {
      console.error('[HistCarteira] Erro ao carregar:', err);
      $('#mhc-lista').html('<div class="text-danger small p-2 text-center">Erro ao carregar histórico. Veja o console.</div>');
      $('#mhc-contador').text('erro');
    }
  }

  static filtrarHistoricoCarteira(tipo) {
    $('.mhc-filtro').removeClass('selected');
    $('.mhc-filtro[data-tipo="' + tipo + '"]').addClass('selected');
    FunilModule._histCarteiraFiltroAtual = tipo;
    FunilModule._renderHistoricoCarteira();
  }

  static _renderHistoricoCarteira() {
    var todos = FunilModule._histCarteiraCache || [];
    var filtro = FunilModule._histCarteiraFiltroAtual || 'todas';
    var lista = (filtro === 'todas')
      ? todos
      : todos.filter(function(x) { return x.tipo === filtro; });

    $('#mhc-contador').text(lista.length + ' registro' + (lista.length === 1 ? '' : 's'));

    if (!lista.length) {
      $('#mhc-lista').html('<div class="text-muted small p-3 text-center">Nenhuma interação encontrada para este filtro.</div>');
      return;
    }

    var TIPO_LABEL = {
      'recomendacao': { icone: '📞', label: 'Recomendação', cor: '#7C3AED', bg: '#EDE9FE' },
      'cuidar_base':  { icone: '🌱', label: 'Cuidar da Base', cor: '#059669', bg: '#D1FAE5' },
    };

    var html = lista.map(function(x) {
      var meta = TIPO_LABEL[x.tipo] || { icone: '•', label: x.tipo, cor: '#64748B', bg: '#F1F5F9' };
      var dt = x.data_hora ? new Date(x.data_hora) : null;
      var dataFmt = dt && !isNaN(dt.getTime())
        ? dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : '—';
      var espNome = (x.especialista && x.especialista.nome) || '—';
      var motivo    = Utils.escHtml(x.motivo    || '—');
      var resultado = Utils.escHtml(x.resultado || '—');
      var obs       = x.obs ? Utils.escHtml(x.obs) : '';

      return '<div class="mhc-item" style="border:1px solid var(--d-brd-e2e8f0); border-left:4px solid ' + meta.cor + '; border-radius:8px; padding:10px 12px; margin-bottom:8px;">'
           +   '<div class="d-flex justify-content-between align-items-start mb-1">'
           +     '<span style="background:' + meta.bg + '; color:' + meta.cor + '; padding:2px 8px; border-radius:12px; font-size:12px; font-weight:600;">'
           +       meta.icone + ' ' + meta.label
           +     '</span>'
           +     '<span class="small text-muted">' + dataFmt + '</span>'
           +   '</div>'
           +   '<div class="small mt-2"><strong>Motivo:</strong> ' + motivo + '</div>'
           +   '<div class="small"><strong>Resultado:</strong> ' + resultado + '</div>'
           +   (obs ? '<div class="small mt-1" style="background:var(--d-bgc-f8fafc); padding:6px 8px; border-radius:4px;"><strong>Obs:</strong> ' + obs + '</div>' : '')
           +   '<div class="small text-muted mt-1">Registrado por: ' + Utils.escHtml(espNome) + '</div>'
           + '</div>';
    }).join('');

    $('#mhc-lista').html(html);
  }

  /* ---- RECOMENDAÇÃO → LEAD (RN-06) ----
     3B.2: persiste também profissão, veículo e observações da recomendação
     no lead novo (campos que já existiam no HTML mas eram descartados). */
  static async criarLeadRec(containerId) {
    const $c    = $('#'+containerId);
    const nome      = $c.find('.rec-nome').val()?.trim();
    const tel       = $c.find('.rec-tel').val()?.trim();
    const grau      = $c.find('.rec-grau').val()?.trim();
    const profissao = $c.find('.rec-profissao').val()?.trim() || '';
    const veiculo   = $c.find('.rec-veiculo').val()?.trim()   || '';
    const obsRec    = $c.find('.rec-obs').val()?.trim()       || '';

    if (!nome||!tel) { Toast.show('Nome e telefone são obrigatórios','warning'); return; }
    if (!grau)       { Toast.show('Grau de proximidade é obrigatório','warning'); return; }

    /* Hotfix UX-1 — telefone precisa ter 10 ou 11 dígitos */
    if (!Utils.validarTelefone($c.find('.rec-tel')[0], 'Telefone da recomendação')) return;

    /* Monta obs combinando o contexto de recomendação + campos livres */
    var partes = ['Recomendado por ' + (store.currentLead?.nome || 'associado') + ' — ' + grau];
    if (profissao) partes.push('Profissão: ' + profissao);
    if (obsRec)    partes.push(obsRec);
    var obsFinal = partes.join(' · ');

    const newLead = {
      id: store.proximoLeadId(), nome, tel,
      fonte: 'Recomendação Associado',
      captador: (AuthService.currentProfile ? AuthService.currentProfile.nome : '—'),
      tags: ['novo'], etapa:'lead', tentativas:0,
      obs:            obsFinal,
      placa:          veiculo,   /* 3B.2: veículo vira placa/modelo no lead */
      fipe:           '',
      mensalidadeEst:'',
    };

    /* ============================================================
       Chamado #29 — Detecção de telefone duplicado em Recomendação.
       ============================================================
       O caminho normal (novoLead) já checa duplicidade via
       LeadDuplicadoService antes do INSERT. Recomendações pulavam
       essa checagem porque chamavam adicionarLead direto. Aqui
       replicamos exatamente o mesmo fluxo do novoLead:
         • busca duplicados por telefone;
         • se houver, abre o MESMO modal (_abrirModalTelDuplicado)
           e guarda o payload em _leadPendenteDup — quando o usuário
           confirmar, confirmarCadastroComDuplicado faz o INSERT e
           dispara a notificação clicável (#26);
         • se não houver, segue direto pra criação.
       Fail-open: se o service falhar, cadastra normal pra não travar
       o especialista.

       Efeito colateral proposital: o formulário só limpa depois que
       o cadastro efetivo acontece (ou o usuário cancelar no modal),
       porque interromper com "return" aqui deixa o formulário como
       está — o cliente ainda pode revisar/corrigir se cancelar.
       ============================================================ */
    if (typeof LeadDuplicadoService !== 'undefined') {
      var duplicadosRec = [];
      try {
        duplicadosRec = await LeadDuplicadoService.buscarPorTelefone(tel);
      } catch (e) {
        SLog.error('criarLeadRec: checagem dup falhou — ' + e.message);
      }
      if (duplicadosRec && duplicadosRec.length > 0) {
        /* Reusa o mesmo payload/modal do fluxo novoLead. O
           confirmarCadastroComDuplicado consome _leadPendenteDup e
           roda _cadastrarLeadEfetivo (INSERT + notificação #26). */
        FunilModule._leadPendenteDup = {
          lead: newLead,
          tags: newLead.tags || [],
          duplicados: duplicadosRec,
          /* origem opcional pra limpar o form quando o cadastro
             efetivo acontecer via confirmação da duplicidade */
          _recContainerId: containerId,
        };
        FunilModule._abrirModalTelDuplicado(newLead, duplicadosRec);
        return; /* espera decisão do usuário no modal */
      }
    }

    await store.adicionarLead(newLead);
    FunilModule.renderKanban();
    FunilModule.renderFunilPreview();
    AtividadeModule.adicionar('🌱',nome,'Lead criado via recomendação','','#DBEAFE','#2563EB','lead');
    Toast.show('Lead criado automaticamente no funil!','success');
    $c.find('input, textarea').val(''); /* RN-06: limpa formulário */
  }

  /* ================================================================
     DUPLICAR LEAD P/ NOVO VEÍCULO  (Chamado #33)
     ================================================================ */

  /* Injeta o botão "Duplicar p/ novo veículo" no topo da aba
     (venda ou carteira). Idempotente (remove antes de recriar).
     Não aparece em clones (lead com lead_pai_id) nem em lead sem
     vínculo no banco (_uuid). */
  static _injetarBotaoDuplicarVeiculo(lead, paneSelector) {
    var $pane = $(paneSelector);
    if (!$pane.length) return;

    $pane.find('.btn-dup-veiculo-wrap').remove();

    if (!lead || !lead._uuid || lead.lead_pai_id) return;

    var html =
      '<div class="btn-dup-veiculo-wrap d-flex justify-content-end mb-2">' +
        '<button type="button" class="btn-beyond btn-secondary-amp btn-sm-amp" ' +
                'onclick="FunilModule.duplicarLeadVeiculo(\'' + lead.id + '\')" ' +
                'title="Cria uma cópia deste lead na coluna Venda para cadastrar outro veículo, ' +
                'sem recadastrar os dados da pessoa">' +
          '➕ Duplicar p/ novo veículo' +
        '</button>' +
      '</div>';
    $pane.prepend(html);
  }

  /* Handler do botão. Confirma com o usuário e dispara a duplicação. */
  static duplicarLeadVeiculo(codigoLead) {
    var leadPai = store.buscarLead(codigoLead) || store.currentLead;
    if (!leadPai) { Toast.show('Lead não encontrado para duplicar.', 'warning'); return; }
    if (leadPai.lead_pai_id) { Toast.show('Este lead já é um veículo adicional.', 'info'); return; }
    if (!leadPai._uuid) { Toast.show('Lead ainda não sincronizado com o banco — aguarde e tente de novo.', 'warning'); return; }

    ConfirmDialog.show(
      '🚗',
      'Duplicar para novo veículo?',
      'Vou criar uma cópia de <strong>' + Utils.escHtml(leadPai.nome) + '</strong> direto na coluna ' +
      '<strong>Venda</strong>, com os dados da pessoa preenchidos e o veículo em branco. ' +
      'Você só preenche o carro novo e registra a venda.',
      function() { FunilModule._executarDuplicacaoVeiculo(leadPai); }
    );
  }

  /* Executa a duplicação (assíncrona) após a confirmação. */
  static async _executarDuplicacaoVeiculo(leadPai) {
    var clone = await store.duplicarLeadParaVenda(leadPai);
    if (!clone) { Toast.show('Não foi possível duplicar o lead. Veja o log (SLog).', 'danger'); return; }

    FunilModule._forcarFecharModalLead();
    FunilModule.renderKanban();
    FunilModule.renderFunilPreview();
    FunilModule.renderNumeroMagico();

    if (typeof AtividadeModule !== 'undefined') {
      AtividadeModule.adicionar('🚗', clone.nome, 'Duplicado p/ novo veículo',
        'Origem: ' + (leadPai.id || '—'), '#FEF3C7', '#92400E', 'venda');
    }
    Toast.show('Cópia criada na coluna Venda. Abra o card e registre o novo veículo.', 'success');
  }

  /* ================================================================
     PLACA OBRIGATÓRIA NA VENDA  (Chamado #32)
     ================================================================
     Injeta o campo "Placa do Veículo *" na aba Venda (via JS, sem
     mexer no index.html). Pré-preenche com a placa do lead se já
     houver. A placa segue OPCIONAL no Lead; só a Venda a exige.
     Validação/persistência ficam no confirmarVenda(). */
  static _injetarCampoPlacaVenda(lead) {
    var $row = $('#venda-adesao').closest('.row');
    if (!$row.length) return;
    $row.find('.venda-placa-wrap').remove();

    var placaAtual = (lead && lead.placa) ? lead.placa : '';
    var html =
      '<div class="col-md-4 venda-placa-wrap">' +
        '<label class="form-label">Placa do Veículo <span class="required">*</span></label>' +
        '<input type="text" id="venda-placa" class="form-control" ' +
               'placeholder="Ex: ABC1D23" value="' + Utils.escHtml(placaAtual) + '">' +
      '</div>';
    $row.prepend(html);
  }

  /* ================================================================
     AUTO-AVANÇO AGENDAMENTO → VISITA  (Chamado #28)
     ================================================================
     Move para 'visita' os leads que estão em 'agendamento' cuja
     data/hora do agendamento JÁ passou.
       • Só muda a etapa (o card troca de coluna). NÃO cria registro
         de visita — a visita ainda não aconteceu; o especialista
         registra quando de fato for.
       • Usa a data/hora MAIS RECENTE entre os agendamentos do lead
         (respeita reagendamento pra frente).
       • Idempotente: só mexe em quem ainda está em 'agendamento'.
         Se dois usuários rodarem ao mesmo tempo, ambos gravam o mesmo
         valor ('visita') — inofensivo.
       • A mudança de etapa já é auditada por store.avancarEtapa.

     Param `silent` = true → não re-renderiza (usado no boot, onde a
     renderização principal do app.js vem logo depois).
     Retorna a quantidade de leads movidos. */
  static autoAvancarVisitasVencidas(silent) {
    if (!store || !Array.isArray(store.leads)) return 0;
    var agora = Date.now();

    var movidos = 0;
    (store.leads || []).forEach(function(lead) {
      if (!lead || lead.arquivado) return;
      if (lead.etapa !== 'agendamento') return;
      if (!lead._uuid) return;

      /* v2.14 (VIS-DATE-2) — avalia o prazo do agendamento VIGENTE
         (criado mais recentemente), NÃO mais o mais distante no tempo.
         Antes, ao remarcar/corrigir pra uma data anterior, o registro
         antigo (mais distante) mandava e o lead nunca avançava. Agora
         a intenção mais recente do especialista prevalece. */
      var ag = FunilModule._agendamentoVigente(lead);
      if (!ag || !ag.data) return;   /* sem agendamento ativo com data → não move */

      var prazo = new Date(ag.data).getTime();
      if (isNaN(prazo) || prazo > agora) return;   /* vigente ainda no futuro → não move */

      /* venceu → move pra visita (guarda idempotente) */
      store.avancarEtapa(lead, 'visita');
      movidos++;
      SLog.info('AUTO-VISITA (#28): lead ' + lead.id + ' venceu (vigente ' +
                ag.data + ') → visita');
    });

    if (movidos > 0 && !silent) {
      FunilModule.renderKanban();
      FunilModule.renderFunilPreview();
      FunilModule.renderNumeroMagico();
      if (FunilModule.atualizarKPIs) FunilModule.atualizarKPIs();
    }
    return movidos;
  }

  /* ---- TAGS (AJUSTE 7) ---- */
  static async adicionarTag(leadId, tag) {
    const lead = store.buscarLead(leadId);
    if (!lead || (lead.tags||[]).includes(tag)) return;
    lead.tags = [...(lead.tags||[]), tag];
    store._logAudit(`Tag (${leadId})`, '—', TAG_CONFIG[tag]?.label || tag);
    FunilModule._preencherAbaLead(lead);
    FunilModule.renderKanban();
    Toast.show('Tag adicionada!', 'success');

    /* Persistir na tabela lead_tags */
    if (supa && lead._uuid) {
      try {
        var tagRes = await supa.from('tags').select('id').eq('slug', tag).single();
        if (tagRes.data) {
          var insRes = await supa.from('lead_tags').insert({ lead_id: lead._uuid, tag_id: tagRes.data.id });
          if (insRes.error) SLog.error('DB INSERT lead_tags: ' + insRes.error.message);
          else SLog.info('DB INSERT lead_tags: ' + tag + ' ✓');
        }
      } catch (e) { SLog.error('DB lead_tags exceção: ' + e.message); }
    }
  }

  static async removerTag(leadId, tag) {
    const lead = store.buscarLead(leadId);
    if (!lead) return;
    lead.tags = (lead.tags||[]).filter(t => t !== tag);
    store._logAudit(`Tag (${leadId})`, TAG_CONFIG[tag]?.label || tag, '—');
    FunilModule._preencherAbaLead(lead);
    FunilModule.renderKanban();
    Toast.show('Tag removida.', '');

    /* Remover da tabela lead_tags */
    if (supa && lead._uuid) {
      try {
        var tagRes = await supa.from('tags').select('id').eq('slug', tag).single();
        if (tagRes.data) {
          var delRes = await supa.from('lead_tags').delete().eq('lead_id', lead._uuid).eq('tag_id', tagRes.data.id);
          if (delRes.error) SLog.error('DB DELETE lead_tags: ' + delRes.error.message);
          else SLog.info('DB DELETE lead_tags: ' + tag + ' ✓');
        }
      } catch (e) { SLog.error('DB lead_tags exceção: ' + e.message); }
    }
  }

  /* ============================================================
     IMPORTAÇÃO DE LEADS (Sprint 7 · 7.3) — v2.0
     ============================================================
     v1.0 (Ajuste 4): só CSV, split por vírgula, 3 colunas fixas.
     v2.0 (Sprint 7):
       - Suporte a CSV E XLSX/XLS (via ExcelJS já carregado)
       - Cabeçalho DINÂMICO — reconhece colunas por nome
         (case-insensitive, com/sem acento)
       - Mapeia TODOS os campos gravados por store.adicionarLead:
         Nome, Telefone, Fonte, Etapa, Tentativas, Placa, FIPE,
         Mensalidade Estimada, Quem Indicou, Observações
       - Valida obrigatórios (nome + telefone) e fonte contra
         FONTES_LEAD; telefone contra Utils.validarTelefone
       - Preview em tabela ANTES de importar (5 primeiras linhas
         + estatísticas: total, válidas, com aviso, com erro)
       - Checagem de duplicidade em lote via
         LeadDuplicadoService — leads duplicados vão pra coluna
         "com aviso" e o usuário decide se importa mesmo assim
       - Fluxo: seleciona → analisa → mostra preview → confirma → importa
       - Zero risco de regressão: chamada externa é a mesma
         (FunilModule.processarImportacao), mas agora é um
         DISPATCHER — se ainda não fez o preview, faz; se já fez,
         confirma e grava.

     ARQUITETURA (métodos privados):
       _lerArquivoImportacao(file)   → Promise<{linhas, colunas}>
       _mapearColunas(cabecalho)     → { nome: idx, tel: idx, ... }
       _analisarLinhas(linhas, mapa) → Promise<{ok, avisos, erros}>
       _renderPreviewImportacao(ana) → injeta HTML em #import-preview
       _confirmarImportacao(ok)      → grava no store, um a um

     Estado guardado em FunilModule._importState pra sobreviver
     entre o clique de "Analisar" e "Importar".
     ============================================================ */

  /* Estado da importação atual (limpo ao fechar o modal). */
  static _importState = null;

  /* Colunas aceitas (chave canônica → aliases reconhecidos).
     Chaves são comparadas SEM acento e em minúsculas. */
  static _COLS_IMPORTACAO = {
    nome:          ['nome', 'nome completo', 'nomecompleto', 'cliente'],
    tel:           ['telefone', 'tel', 'celular', 'fone', 'contato'],
    fonte:         ['fonte', 'fonte do lead', 'origem'],
    etapa:         ['etapa', 'stage', 'coluna'],
    tentativas:    ['tentativas', 'qtd tentativas', 'tentativas ligacao'],
    placa:         ['placa', 'placa veiculo', 'placa do veiculo'],
    fipe:          ['fipe', 'valor fipe', 'valor do veiculo'],
    mensalidadeEst:['mensalidade', 'valor medio mensalidade', 'mensalidade estimada', 'mensalidade est'],
    quemIndicou:   ['quem indicou', 'indicado por', 'indicacao'],
    obs:           ['observacoes', 'observacao', 'obs', 'notas'],
    /* Chamado #45 — 5 colunas de VENDA. Aliases específicos pra
       NÃO colidir com o `mensalidadeEst` do lead (que aceitava
       "valor mensalidade" como alias antigamente). */
    aniversario:      ['aniversario do associado', 'aniversario associado', 'aniversario do cliente', 'aniversario'],
    valorAdesao:      ['valor de adesao', 'valor adesao', 'adesao'],
    valorMensalidade: ['valor mensalidade venda', 'mensalidade venda', 'valor mensalidade da venda', 'mensalidade fechada'],
    valorRastreador:  ['valor rastreador', 'valor do rastreador', 'rastreador'],
    dataVenda:        ['data da venda', 'data venda', 'data fechamento'],
  };

  /* Etapas válidas — reaproveita STAGE_ORDER pra não divergir. */
  static _ETAPAS_IMPORTACAO() {
    if (typeof STAGE_ORDER !== 'undefined') return STAGE_ORDER;
    return ['lead','ligacao','agendamento','visita','venda','carteira'];
  }

  /* Normaliza cabeçalho: minúsculas, sem acento, sem espaço no início/fim. */
  static _normalizarCabecalho(txt) {
    if (txt == null) return '';
    return String(txt)
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* Mapeia cada coluna do arquivo à chave canônica (ou null se desconhecida). */
  static _mapearColunas(cabecalho) {
    var mapa = {};
    var COLS = FunilModule._COLS_IMPORTACAO;
    cabecalho.forEach(function(nomeCol, idx) {
      var norm = FunilModule._normalizarCabecalho(nomeCol);
      if (!norm) return;
      Object.keys(COLS).forEach(function(chave) {
        if (mapa[chave] !== undefined) return; /* primeira ocorrência ganha */
        var aliases = COLS[chave];
        if (aliases.indexOf(norm) >= 0) {
          mapa[chave] = idx;
        }
      });
    });
    return mapa;
  }

  /* Handler do input file (chamado pelo change do #import-file em app.js).
     Faz preview de nome/tamanho e roda a análise já emendada. */
  static async previewArquivoImportacao(file) {
    if (!file) {
      $('#import-preview').html('');
      FunilModule._importState = null;
      return;
    }
    /* Preview básico: nome + tamanho */
    $('#import-preview').html(
      '<div class="p-2" style="background:var(--d-bgc-f3f4f6);border-radius:6px;border:1px solid var(--d-brd-e5e7eb);">' +
        '<i class="bi bi-file-earmark-check text-success"></i> ' +
        '<strong>' + Utils.escHtml(file.name) + '</strong> ' +
        '<span class="text-muted">(' + (file.size/1024).toFixed(1) + ' KB)</span>' +
        '<div class="small text-muted mt-1"><i class="bi bi-hourglass-split"></i> Analisando arquivo…</div>' +
      '</div>'
    );

    try {
      var conteudo = await FunilModule._lerArquivoImportacao(file);
      if (!conteudo || !conteudo.linhas || !conteudo.linhas.length) {
        $('#import-preview').append(
          '<div class="alert alert-warning small mt-2 mb-0">Arquivo sem dados legíveis.</div>'
        );
        return;
      }

      var mapa = FunilModule._mapearColunas(conteudo.cabecalho);
      if (mapa.nome === undefined || mapa.tel === undefined) {
        $('#import-preview').append(
          '<div class="alert alert-danger small mt-2 mb-0">' +
            '<strong>Cabeçalho inválido.</strong> Não encontrei as colunas <code>Nome</code> e/ou <code>Telefone</code>. ' +
            'Baixe o modelo abaixo para conferir o formato esperado.' +
          '</div>'
        );
        return;
      }

      var analise = await FunilModule._analisarLinhas(conteudo.linhas, mapa);
      FunilModule._importState = {
        arquivo: file.name,
        mapa: mapa,
        analise: analise,
      };
      FunilModule._renderPreviewImportacao(analise, conteudo.cabecalho, mapa);
    } catch (err) {
      SLog.error('IMPORT preview: ' + err.message);
      $('#import-preview').append(
        '<div class="alert alert-danger small mt-2 mb-0">Erro ao ler o arquivo: ' + Utils.escHtml(err.message) + '</div>'
      );
    }
  }

  /* Lê arquivo e devolve { cabecalho: [str,str,...], linhas: [[celula,...],...] }.
     Detecta CSV ou XLSX pela extensão. XLSX usa ExcelJS (já carregado). */
  static _lerArquivoImportacao(file) {
    return new Promise(function(resolve, reject) {
      var ext = (file.name.split('.').pop() || '').toLowerCase();
      var isXlsx = (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm');
      var reader = new FileReader();

      reader.onerror = function() { reject(new Error('Falha ao ler o arquivo')); };

      if (isXlsx) {
        if (typeof ExcelJS === 'undefined') {
          reject(new Error('Biblioteca ExcelJS não carregada — só CSV disponível.'));
          return;
        }
        reader.onload = async function(e) {
          try {
            var wb = new ExcelJS.Workbook();
            await wb.xlsx.load(e.target.result);
            var ws = wb.worksheets[0];
            if (!ws) { reject(new Error('Planilha sem abas.')); return; }

            var todas = [];
            ws.eachRow({ includeEmpty: false }, function(row) {
              var celulas = [];
              /* row.values tem índice 1-based; ignora index 0 */
              for (var i = 1; i <= row.cellCount; i++) {
                var v = row.getCell(i).value;
                if (v && typeof v === 'object' && v.text) v = v.text;   /* rich text */
                if (v && typeof v === 'object' && v.result !== undefined) v = v.result; /* formula */
                celulas.push(v == null ? '' : String(v).trim());
              }
              todas.push(celulas);
            });

            if (!todas.length) { reject(new Error('Planilha vazia.')); return; }
            resolve({ cabecalho: todas[0], linhas: todas.slice(1).filter(function(r) { return r.some(function(c) { return c !== ''; }); }) });
          } catch (err) { reject(err); }
        };
        reader.readAsArrayBuffer(file);
      } else {
        /* CSV: separador por vírgula OU ponto-e-vírgula (o Excel BR salva ";") */
        reader.onload = function(e) {
          try {
            var raw = e.target.result;
            /* Remove BOM */
            if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
            var linhasRaw = raw.split(/\r?\n/).filter(function(l) { return l.trim(); });
            if (!linhasRaw.length) { reject(new Error('Arquivo CSV vazio.')); return; }
            /* Detecta separador: se linha 1 tem mais ";" que ",", usa ";" */
            var sep = ((linhasRaw[0].match(/;/g) || []).length > (linhasRaw[0].match(/,/g) || []).length) ? ';' : ',';
            var parsed = linhasRaw.map(function(l) {
              return l.split(sep).map(function(c) { return c.replace(/^"|"$/g, '').trim(); });
            });
            resolve({ cabecalho: parsed[0], linhas: parsed.slice(1) });
          } catch (err) { reject(err); }
        };
        reader.readAsText(file, 'UTF-8');
      }
    });
  }

  /* Percorre cada linha do arquivo, valida campo a campo e classifica em
     ok / avisos / erros. Também roda checagem de duplicidade em lote. */
  static async _analisarLinhas(linhas, mapa) {
    var FONTES = (typeof FONTES_LEAD !== 'undefined')
      ? FONTES_LEAD.map(function(f) { return f.value; })
      : [];
    var ETAPAS_OK = FunilModule._ETAPAS_IMPORTACAO();

    var ok = [], avisos = [], erros = [];
    var telsParaChecar = [];

    /* Guard v2.0.1 — pula linhas de METADADOS/LEGENDA (ex: linha
       "● OBRIGATÓRIO / ○ opcional" que existia na v1.0 do modelo).
       Se TODAS as células não vazias contêm apenas as palavras
       "obrigatorio", "obrigatório", "opcional" (com/sem acento e
       pontinhos), a linha é ignorada silenciosamente. */
    function _ehLinhaLegenda(linha) {
      var celulasComTexto = linha.filter(function(c) { return String(c || '').trim(); });
      if (!celulasComTexto.length) return true; /* linha totalmente vazia */
      var padraoLegenda = /^[\u25CF\u25CB\u2022\*\-\s]*(obrigat[óo]rio|opcional)[\s\!\.\)]*$/i;
      return celulasComTexto.every(function(c) {
        return padraoLegenda.test(String(c).trim());
      });
    }

    for (var i = 0; i < linhas.length; i++) {
      var linha = linhas[i];
      var linhaNum = i + 2; /* +1 pelo cabeçalho, +1 pra ser 1-based */

      /* Pula linhas de legenda sem contabilizar */
      if (_ehLinhaLegenda(linha)) {
        SLog.load('IMPORT: linha ' + linhaNum + ' ignorada (legenda/metadados)');
        continue;
      }

      var lead = {
        nome:           (mapa.nome           !== undefined ? String(linha[mapa.nome]           || '').trim() : ''),
        tel:            (mapa.tel            !== undefined ? String(linha[mapa.tel]            || '').trim() : ''),
        fonte:          (mapa.fonte          !== undefined ? String(linha[mapa.fonte]          || '').trim() : ''),
        etapa:          (mapa.etapa          !== undefined ? String(linha[mapa.etapa]          || '').trim().toLowerCase() : ''),
        tentativas:     (mapa.tentativas     !== undefined ? String(linha[mapa.tentativas]     || '').trim() : ''),
        placa:          (mapa.placa          !== undefined ? String(linha[mapa.placa]          || '').trim() : ''),
        fipe:           (mapa.fipe           !== undefined ? String(linha[mapa.fipe]           || '').trim() : ''),
        mensalidadeEst: (mapa.mensalidadeEst !== undefined ? String(linha[mapa.mensalidadeEst] || '').trim() : ''),
        quemIndicou:    (mapa.quemIndicou    !== undefined ? String(linha[mapa.quemIndicou]    || '').trim() : ''),
        obs:            (mapa.obs            !== undefined ? String(linha[mapa.obs]            || '').trim() : ''),
        /* Chamado #45 — colunas de venda (só aplicáveis quando etapa=carteira) */
        aniversario:      (mapa.aniversario      !== undefined ? String(linha[mapa.aniversario]      || '').trim() : ''),
        valorAdesao:      (mapa.valorAdesao      !== undefined ? String(linha[mapa.valorAdesao]      || '').trim() : ''),
        valorMensalidade: (mapa.valorMensalidade !== undefined ? String(linha[mapa.valorMensalidade] || '').trim() : ''),
        valorRastreador:  (mapa.valorRastreador  !== undefined ? String(linha[mapa.valorRastreador]  || '').trim() : ''),
        dataVenda:        (mapa.dataVenda        !== undefined ? String(linha[mapa.dataVenda]        || '').trim() : ''),
      };

      var problemas = [];

      /* Obrigatórios */
      if (!lead.nome) problemas.push({ tipo: 'erro',  msg: 'Nome vazio' });
      if (!lead.tel)  problemas.push({ tipo: 'erro',  msg: 'Telefone vazio' });

      /* Telefone: só dígitos, 10-11 chars após remover formatação */
      if (lead.tel) {
        var telNum = lead.tel.replace(/\D/g, '');
        if (telNum.length < 10 || telNum.length > 13) {
          problemas.push({ tipo: 'erro',  msg: 'Telefone inválido' });
        } else {
          telsParaChecar.push({ tel: lead.tel, linha: linhaNum, idx: i });
        }
      }

      /* Fonte: se veio, tem que estar na lista oficial. Se vazia, default. */
      if (lead.fonte) {
        var fonteCasa = FONTES.find(function(f) {
          return f.toLowerCase() === lead.fonte.toLowerCase();
        });
        if (!fonteCasa) {
          problemas.push({ tipo: 'aviso', msg: 'Fonte "' + lead.fonte + '" não reconhecida — será mantida como texto livre' });
        } else {
          lead.fonte = fonteCasa; /* normaliza case */
        }
      } else {
        lead.fonte = 'Carteira Própria';
        problemas.push({ tipo: 'aviso', msg: 'Fonte vazia — usando "Carteira Própria"' });
      }

      /* Etapa: default lead se vazia; valida se veio */
      if (lead.etapa) {
        if (ETAPAS_OK.indexOf(lead.etapa) < 0) {
          problemas.push({ tipo: 'aviso', msg: 'Etapa "' + lead.etapa + '" não é válida — usando "lead"' });
          lead.etapa = 'lead';
        }
      } else {
        lead.etapa = 'lead';
      }

      /* Números: sanitiza tentativas/fipe/mensalidadeEst */
      if (lead.tentativas) {
        var t = parseInt(String(lead.tentativas).replace(/\D/g, ''), 10);
        lead.tentativas = isNaN(t) ? 0 : t;
      } else {
        lead.tentativas = 0;
      }
      if (lead.fipe) {
        lead.fipe = String(lead.fipe).replace(/[^\d,\.]/g, '');
      }
      if (lead.mensalidadeEst) {
        lead.mensalidadeEst = String(lead.mensalidadeEst).replace(/[^\d,\.]/g, '');
      }

      /* ============================================================
         Chamado #45 — Validação do bloco de VENDA (5 campos)
         ============================================================
         REGRAS:
         • Se etapa === 'carteira': os 5 campos de venda são
           OBRIGATÓRIOS sempre — carteira significa que a pessoa já
           é cliente, então precisa ter data da venda, valores e
           aniversário. Se algum faltar → erro na linha.
         • Se etapa !== 'carteira' e vier qualquer campo de venda
           preenchido → aviso, campos ignorados (não faz sentido
           gravar venda em lead que ainda tá no funil).
         Isso pareia com a obrigatoriedade do #31 (venda pelo modal). */
      var camposVenda = ['aniversario', 'valorAdesao', 'valorMensalidade', 'valorRastreador', 'dataVenda'];
      var vendaPreenchidos = camposVenda.filter(function(k) { return lead[k]; });
      var temAlgumVenda    = vendaPreenchidos.length > 0;
      var temTodosVenda    = vendaPreenchidos.length === camposVenda.length;
      lead._temVenda = false;

      if (lead.etapa === 'carteira') {
        /* Carteira EXIGE os 5 campos, tenha vindo nada ou parcial */
        if (!temTodosVenda) {
          var faltando = camposVenda.filter(function(k) { return !lead[k]; });
          problemas.push({
            tipo: 'erro',
            msg: 'Etapa "carteira" exige todos os 5 campos de venda — faltam: ' + faltando.join(', '),
          });
        } else {
          /* Todos preenchidos → sanitiza e valida formatos */
          var adesaoNum = Utils.parseValor ? Utils.parseValor(lead.valorAdesao)      : parseFloat(String(lead.valorAdesao).replace(',', '.'));
          var mensNum   = Utils.parseValor ? Utils.parseValor(lead.valorMensalidade) : parseFloat(String(lead.valorMensalidade).replace(',', '.'));
          var rastrNum  = Utils.parseValor ? Utils.parseValor(lead.valorRastreador)  : parseFloat(String(lead.valorRastreador).replace(',', '.'));

          if (!(adesaoNum > 0)) problemas.push({ tipo: 'erro', msg: 'Valor de Adesão inválido' });
          if (!(mensNum   > 0)) problemas.push({ tipo: 'erro', msg: 'Valor Mensalidade inválido' });
          if (!(rastrNum >= 0)) problemas.push({ tipo: 'erro', msg: 'Valor Rastreador inválido' });

          /* Datas — aceitar YYYY-MM-DD ou o que o Excel devolver */
          var dv = new Date(lead.dataVenda);
          var an = new Date(lead.aniversario);
          if (isNaN(dv.getTime())) problemas.push({ tipo: 'erro', msg: 'Data da Venda inválida (use AAAA-MM-DD)' });
          if (isNaN(an.getTime())) problemas.push({ tipo: 'erro', msg: 'Aniversário do Associado inválido (use AAAA-MM-DD)' });

          if (adesaoNum > 0 && mensNum > 0 && !isNaN(dv.getTime()) && !isNaN(an.getTime())) {
            lead._temVenda    = true;
            lead._vendaAdesao = adesaoNum;
            lead._vendaMensal = mensNum;
            lead._vendaRastr  = (rastrNum >= 0) ? rastrNum : 0;
            lead._vendaData   = dv.toISOString().slice(0, 10);
            lead._vendaAniver = an.toISOString().slice(0, 10);
          }
        }
      } else if (temAlgumVenda) {
        /* Etapa != carteira + veio algum campo de venda → aviso, ignora */
        problemas.push({
          tipo: 'aviso',
          msg: 'Etapa "' + lead.etapa + '" não recebe dados de venda — campos ignorados',
        });
        camposVenda.forEach(function(k) { lead[k] = ''; });
      }

      var registro = {
        linha: linhaNum,
        lead:  lead,
        problemas: problemas,
      };

      var temErro  = problemas.some(function(p) { return p.tipo === 'erro'; });
      var temAviso = problemas.some(function(p) { return p.tipo === 'aviso'; });

      if (temErro)       erros.push(registro);
      else if (temAviso) avisos.push(registro);
      else               ok.push(registro);
    }

    /* Checagem de duplicidade em lote (RN-25).
       Roda em paralelo com limite de 8 pra não estourar o Supabase. */
    if (typeof LeadDuplicadoService !== 'undefined' && telsParaChecar.length > 0 && supa) {
      var promises = telsParaChecar.map(function(item) {
        return LeadDuplicadoService.buscarPorTelefone(item.tel).then(function(dups) {
          if (dups && dups.length > 0) {
            /* Marca o registro correspondente como aviso */
            [ok, avisos].forEach(function(lista) {
              var reg = lista.find(function(r) { return r.linha === item.linha; });
              if (reg) {
                reg.problemas.push({
                  tipo: 'aviso',
                  msg: 'Telefone já existe: ' + dups.map(function(d) {
                    return d.codigo + ' (' + d.responsavel_sigla + ')';
                  }).join(', '),
                });
              }
            });
          }
        }).catch(function() { /* dedup opcional — falha silenciosa */ });
      });
      await Promise.all(promises);

      /* Re-categoriza: quem tá em ok e ganhou aviso, migra pra avisos */
      var okFinal = [], avisosFinal = avisos.slice();
      ok.forEach(function(r) {
        var temAvisoAgora = r.problemas.some(function(p) { return p.tipo === 'aviso'; });
        if (temAvisoAgora) avisosFinal.push(r);
        else               okFinal.push(r);
      });
      ok = okFinal;
      avisos = avisosFinal;
    }

    return { ok: ok, avisos: avisos, erros: erros, total: ok.length + avisos.length + erros.length };
  }

  /* Renderiza o preview no #import-preview. */
  static _renderPreviewImportacao(analise, cabecalho, mapa) {
    var colsReconhecidas = Object.keys(mapa).length;
    var colsTotal = cabecalho.length;

    var html = '';

    /* Sumário */
    html += '<div class="p-3 mt-2" style="background:var(--d-bgc-f9fafb);border:1px solid var(--d-brd-e5e7eb);border-radius:8px;">';
    html += '<div class="d-flex justify-content-between align-items-center mb-2">';
    html += '<strong><i class="bi bi-clipboard-check"></i> Resultado da análise</strong>';
    html += '<span class="small text-muted">' + colsReconhecidas + ' de ' + colsTotal + ' colunas reconhecidas</span>';
    html += '</div>';

    html += '<div class="row g-2 text-center">';
    html += '  <div class="col-4"><div style="background:var(--d-bgc-d1fae5);border-radius:6px;padding:8px;">'
         +  '    <div class="fw-bold" style="font-size:20px;color:var(--d-txt-065f46);">' + analise.ok.length + '</div>'
         +  '    <div class="small text-muted">Prontos</div></div></div>';
    html += '  <div class="col-4"><div style="background:var(--d-bgc-fef3c7);border-radius:6px;padding:8px;">'
         +  '    <div class="fw-bold" style="font-size:20px;color:var(--d-txt-92400e);">' + analise.avisos.length + '</div>'
         +  '    <div class="small text-muted">Com aviso</div></div></div>';
    html += '  <div class="col-4"><div style="background:var(--d-bgc-fee2e2);border-radius:6px;padding:8px;">'
         +  '    <div class="fw-bold" style="font-size:20px;color:var(--d-txt-991b1b);">' + analise.erros.length + '</div>'
         +  '    <div class="small text-muted">Com erro</div></div></div>';
    html += '</div>';
    html += '</div>';

    /* Amostra: 5 primeiras linhas OK + 5 primeiras com problema */
    var amostra = analise.ok.slice(0, 3)
      .concat(analise.avisos.slice(0, 3))
      .concat(analise.erros.slice(0, 3));

    if (amostra.length) {
      html += '<div class="mt-3">';
      html += '<div class="small text-muted mb-1"><i class="bi bi-eye"></i> Amostra (primeiras linhas):</div>';
      html += '<div class="table-responsive" style="max-height:220px;overflow:auto;">';
      html += '<table class="table table-sm table-bordered small mb-0" style="background:var(--d-bgc-ffffff);">';
      html += '<thead style="background:var(--d-bgc-f3f4f6);position:sticky;top:0;">';
      html += '<tr><th>Linha</th><th>Nome</th><th>Telefone</th><th>Fonte</th><th>Etapa</th><th>Status</th></tr>';
      html += '</thead><tbody>';
      amostra.forEach(function(r) {
        var cor = r.problemas.some(function(p) { return p.tipo === 'erro'; }) ? '#FEE2E2' :
                  r.problemas.length ? '#FEF3C7' : '';
        var status = r.problemas.length
          ? r.problemas.map(function(p) {
              var ico = p.tipo === 'erro' ? '❌' : '⚠️';
              return ico + ' ' + Utils.escHtml(p.msg);
            }).join('<br>')
          : '<span class="text-success">✓ OK</span>';
        html += '<tr style="background:' + cor + ';">'
             +  '<td>' + r.linha + '</td>'
             +  '<td>' + Utils.escHtml(r.lead.nome || '—') + '</td>'
             +  '<td>' + Utils.escHtml(r.lead.tel || '—') + '</td>'
             +  '<td>' + Utils.escHtml(r.lead.fonte || '—') + '</td>'
             +  '<td>' + Utils.escHtml(r.lead.etapa || '—') + '</td>'
             +  '<td class="small">' + status + '</td>'
             +  '</tr>';
      });
      html += '</tbody></table>';
      html += '</div>';
      html += '</div>';
    }

    /* Instrução final */
    var vaiImportar = analise.ok.length + analise.avisos.length;
    html += '<div class="mt-2 small text-muted">';
    html += '<i class="bi bi-info-circle"></i> Clique em <strong>Processar Importação</strong> para gravar ';
    html += '<strong>' + vaiImportar + ' lead(s)</strong> ';
    if (analise.erros.length) {
      html += '(as <strong>' + analise.erros.length + ' linha(s) com erro</strong> serão ignoradas).';
    } else {
      html += 'no banco.';
    }
    html += '</div>';

    $('#import-preview').html(html);
  }

  /* Chamado pelo botão "Processar Importação" do modal.
     Dispatcher: se ainda não tem estado (usuário clicou sem selecionar),
     avisa. Caso contrário, confirma a gravação. */
  static async processarImportacao() {
    var state = FunilModule._importState;
    if (!state || !state.analise) {
      Toast.show('Selecione um arquivo primeiro.', 'warning');
      return;
    }
    var vaiImportar = state.analise.ok.length + state.analise.avisos.length;
    if (vaiImportar === 0) {
      Toast.show('Nenhuma linha válida para importar.', 'warning');
      return;
    }

    /* Confirmação — importante quando tem aviso (duplicidade) */
    var msg = 'Confirmar importação de ' + vaiImportar + ' lead(s)?';
    if (state.analise.avisos.length) {
      msg += '\n\n' + state.analise.avisos.length + ' linha(s) têm avisos ' +
             '(fontes desconhecidas ou telefones duplicados) — serão importadas ' +
             'mesmo assim como leads novos.';
    }
    if (state.analise.erros.length) {
      msg += '\n\n' + state.analise.erros.length + ' linha(s) com erro serão ignoradas.';
    }

    ConfirmDialog.show('📥', 'Confirmar importação', msg.replace(/\n/g, '<br>'), async function() {
      await FunilModule._executarImportacao();
    });
  }

  /* Executa de fato a gravação — chama store.adicionarLead pra cada linha
     válida. Usa Promise.all sequencial pra não pegar o rate limit do
     Supabase e pra deixar SLog legível. */
  static async _executarImportacao() {
    var state = FunilModule._importState;
    if (!state) return;

    var registros = state.analise.ok.concat(state.analise.avisos);
    var importados = 0, falhas = 0;

    /* Toast de progresso */
    Toast.show('Importando ' + registros.length + ' lead(s)…', 'info');

    for (var i = 0; i < registros.length; i++) {
      var r = registros[i];
      var l = r.lead;
      try {
        /* Chamado #45 — adicionarLead agora retorna o lead com _uuid
           populado, permitindo encadear a criação da venda. */
        var leadSalvo = await store.adicionarLead({
          id:             store.proximoLeadId(),
          nome:           l.nome,
          tel:            l.tel,
          fonte:          l.fonte,
          captador:       (AuthService.currentProfile ? AuthService.currentProfile.nome : '—'),
          tags:           [],
          etapa:          l.etapa || 'lead',
          tentativas:     l.tentativas || 0,
          obs:            l.obs || '',
          placa:          l.placa || '',
          fipe:           l.fipe || '',
          mensalidadeEst: l.mensalidadeEst || '',
          quemIndicou:    l.quemIndicou || '',
        });

        /* Hotfix v2.0.2: mesmo padrão do salvarNovoLead() — registra
           atividade "Lead cadastrado" pra aparecer na aba Histórico.
           Sem isso, leads importados sumiam do HistoricoModule (só
           apareciam nas atividades os cadastrados via modal). */
        if (typeof AtividadeModule !== 'undefined') {
          AtividadeModule.adicionar('🌱', l.nome, 'Lead cadastrado', l.fonte, '#D1FAE5', '#059669', 'lead');
        }
        importados++;

        /* Chamado #45 — se veio bloco de venda completo (etapa=carteira),
           grava a venda também. Só rola se o lead pegou _uuid do INSERT. */
        if (l._temVenda && leadSalvo && leadSalvo._uuid) {
          try {
            store.adicionarVenda({
              lead_uuid:         leadSalvo._uuid,
              valor_adesao:      l._vendaAdesao,
              valor_mensalidade: l._vendaMensal,
              valor_rastreador:  l._vendaRastr,
              data_venda:        l._vendaData,
              aniversario:       l._vendaAniver,
              obs:               'Venda importada via planilha de carteira',
            });
            if (typeof AtividadeModule !== 'undefined') {
              AtividadeModule.adicionar('💰', l.nome, 'Venda importada',
                'R$ ' + l._vendaAdesao.toFixed(2), '#D1FAE5', '#059669', 'venda');
            }
            SLog.info('IMPORT venda linha ' + r.linha + ': ✓');
          } catch (vendaErr) {
            SLog.error('IMPORT venda linha ' + r.linha + ': ' + vendaErr.message);
            /* Venda falhou mas lead foi importado — não desfaz nem
               conta como falha geral (o lead está lá, o gerente pode
               registrar a venda manualmente depois). */
          }
        } else if (l._temVenda && (!leadSalvo || !leadSalvo._uuid)) {
          SLog.warn('IMPORT venda linha ' + r.linha + ': pulada, lead sem _uuid do banco');
        }
      } catch (err) {
        SLog.error('IMPORT linha ' + r.linha + ': ' + err.message);
        falhas++;
      }
    }

    FunilModule.renderKanban();
    FunilModule.renderFunilPreview();
    FunilModule.renderNumeroMagico();
    /* Hotfix v2.0.1: força atualização da tabela de auditoria pra garantir
       que os "Novo Lead" gerados durante o import fiquem visíveis mesmo se
       o usuário estiver em outra tela (o Router não re-renderiza páginas
       inativas). AuditModule é seguro chamar mesmo se DOM não estiver
       visível — só atualiza #audit-tbody se existir. */
    if (typeof AuditModule !== 'undefined') AuditModule.render();
    document.getElementById('import-file').value = '';
    $('#import-preview').html('');
    FunilModule._importState = null;
    Modal.fechar('modal-importar-leads');

    var msgFinal = importados + ' lead(s) importados';
    if (state.analise.erros.length) msgFinal += ' • ' + state.analise.erros.length + ' ignorados';
    if (falhas) msgFinal += ' • ' + falhas + ' falha(s) na gravação';
    Toast.show(msgFinal, falhas ? 'warning' : 'success');
  }

  /* ============================================================
     BAIXAR PLANILHA MODELO (Sprint 7 · 7.3)
     ============================================================
     v1.0: fazia download de asset estático em docs/. Problema:
           depende de deploy da pasta docs/ no Vercel → dava 404.
     v2.0 (hotfix pós-teste): gera a planilha em memória via
           ExcelJS (já carregado no index.html). Zero dependência
           de asset externo. Também simplifica: só cabeçalho +
           3 exemplos (a linha "OBRIGATÓRIO/opcional" da v1.0
           estava confundindo o parser de importação).
     ============================================================ */
  static async baixarModeloImportacao() {
    if (typeof ExcelJS === 'undefined') {
      Toast.show('Biblioteca ExcelJS não carregada.', 'danger');
      return;
    }

    try {
      /* Paleta Beyond (mesma dos relatórios) */
      var MARINHO       = '111111';
      var MARINHO_MED   = '2A3175';
      var MARINHO_CLARO = 'F0F1F7';
      var BRANCO        = 'FFFFFF';
      var CINZA         = '6B7280';
      var CINZA_CLARO   = 'F3F4F6';
      var VERMELHO      = 'DC2626';
      var BORDA         = 'E5E7F0';

      /* Colunas: [chave_interna, label, largura]
         Chamado #45: adicionadas 5 colunas de VENDA no fim (Aniversário,
         Adesão, Mensalidade, Rastreador, Data da Venda). Preenchidas
         apenas quando etapa='carteira' (regra H1 do parser). Todas
         obrigatórias EM CONJUNTO — parcial = erro (regra H2 do parser). */
      var COLUNAS = [
        ['nome',              'Nome',                    32],
        ['tel',               'Telefone',                20],
        ['fonte',             'Fonte',                   24],
        ['etapa',             'Etapa',                   16],
        ['tentativas',        'Tentativas',              14],
        ['placa',             'Placa',                   12],
        ['fipe',              'Valor FIPE',              14],
        ['mensalidadeEst',    'Valor Médio Mensalidade', 22],
        ['quemIndicou',       'Quem Indicou',            24],
        ['obs',               'Observações',             40],
        /* Colunas de venda — apenas para carteira */
        ['aniversario',       'Aniversário do Associado',24],
        ['valorAdesao',       'Valor de Adesão',         18],
        ['valorMensalidade',  'Valor Mensalidade Venda', 22],
        ['valorRastreador',   'Valor Rastreador',        18],
        ['dataVenda',         'Data da Venda',           16],
      ];

      var FONTES_VALIDAS = (typeof FONTES_LEAD !== 'undefined')
        ? FONTES_LEAD.map(function(f) { return f.value; })
        : [];
      var ETAPAS_VALIDAS = FunilModule._ETAPAS_IMPORTACAO();

      var wb = new ExcelJS.Workbook();
      wb.creator = 'Beyond CRM';
      wb.created = new Date();

      /* ══════════════ ABA 1: LEADS ══════════════ */
      var ws = wb.addWorksheet('Leads');

      /* Cabeçalho (linha 1) */
      COLUNAS.forEach(function(col, idx) {
        var cell = ws.getCell(1, idx + 1);
        cell.value = col[1];
        cell.font  = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF' + BRANCO } };
        cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + MARINHO } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = {
          top:    { style: 'thin', color: { argb: 'FF' + MARINHO_MED } },
          bottom: { style: 'thin', color: { argb: 'FF' + MARINHO_MED } },
          left:   { style: 'thin', color: { argb: 'FF' + MARINHO_MED } },
          right:  { style: 'thin', color: { argb: 'FF' + MARINHO_MED } },
        };
        ws.getColumn(idx + 1).width = col[2];
      });
      ws.getRow(1).height = 32;

      /* Exemplos (linhas 2 a 4) — SEM linha de legenda pra não confundir o parser.
         Chamado #45: 3ª linha demonstra carteira com dados de venda. */
      var EXEMPLOS = [
        ['João da Silva',         '(27) 99999-1234', 'Carteira Própria',       'lead',    0, 'ABC1D23', '45000', '150', '',                        'Cliente antigo, reativar contato', '',           '',    '',    '',    ''],
        ['Maria Souza',           '27988884321',     'Recomendação Associado', 'ligacao', 1, '',        '',      '',    'Pedro Almeida (AMP-042)', 'Interessada em plano família',      '',           '',    '',    '',    ''],
        ['Carlos Eduardo Rocha',  '+55 11 97777-2222','Carteira Própria',      'carteira',0, 'DEF2E45', '80000', '220', '',                        'Migração de carteira antiga',       '1985-03-15', '350', '220', '80',  '2024-11-20'],
      ];

      EXEMPLOS.forEach(function(exemplo, rowIdx) {
        var fillColor = (rowIdx % 2 === 0) ? BRANCO : MARINHO_CLARO;
        exemplo.forEach(function(valor, colIdx) {
          var cell = ws.getCell(rowIdx + 2, colIdx + 1);
          cell.value = valor;
          cell.font  = { name: 'Arial', size: 10, color: { argb: 'FF0E1023' } };
          cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + fillColor } };
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
          cell.border = {
            bottom: { style: 'hair', color: { argb: 'FF' + BORDA } },
            left:   { style: 'hair', color: { argb: 'FF' + BORDA } },
            right:  { style: 'hair', color: { argb: 'FF' + BORDA } },
          };
        });
      });

      /* Congela cabeçalho */
      ws.views = [{ state: 'frozen', ySplit: 1 }];

      /* Data validations em Fonte e Etapa (nas próximas 1000 linhas) */
      if (FONTES_VALIDAS.length) {
        for (var r = 2; r <= 1001; r++) {
          ws.getCell(r, 3).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: ['"' + FONTES_VALIDAS.join(',') + '"'],
          };
        }
      }
      for (var r2 = 2; r2 <= 1001; r2++) {
        ws.getCell(r2, 4).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"' + ETAPAS_VALIDAS.join(',') + '"'],
        };
      }

      /* ══════════════ ABA 2: INSTRUÇÕES ══════════════ */
      var ws2 = wb.addWorksheet('Instruções');

      /* Título simples */
      ws2.getCell('A1').value = 'Modelo de Importação de Leads';
      ws2.getCell('A1').font  = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF' + BRANCO } };
      ws2.getCell('A1').fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + MARINHO } };
      ws2.getCell('A1').alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      ws2.mergeCells('A1:D1');
      ws2.getRow(1).height = 32;

      /* Cabeçalho da tabela de instruções */
      ['Coluna', 'Obrigatório', 'Formato', 'Descrição / Valores aceitos'].forEach(function(h, idx) {
        var cell = ws2.getCell(3, idx + 1);
        cell.value = h;
        cell.font  = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF' + BRANCO } };
        cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + MARINHO } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });
      ws2.getRow(3).height = 24;
      ws2.getColumn(1).width = 24;
      ws2.getColumn(2).width = 14;
      ws2.getColumn(3).width = 24;
      ws2.getColumn(4).width = 70;

      var INSTRUCOES = [
        ['Nome',                    'SIM',  'Texto livre',        'Nome completo do lead. Não pode estar vazio.'],
        ['Telefone',                'SIM',  '10 a 13 dígitos',    'Aceita qualquer formato: (27) 99999-1234, 27999991234, +55 27 99999-1234. O sistema normaliza automaticamente.'],
        ['Fonte',                   'não',  'Lista fechada',      'Se vazia, o sistema usa "Carteira Própria". Valores aceitos: ' + FONTES_VALIDAS.join('; ') + '.'],
        ['Etapa',                   'não',  'Lista fechada',      'Etapa inicial no funil. Se vazia, usa "lead". Valores aceitos: ' + ETAPAS_VALIDAS.join(', ') + '.'],
        ['Tentativas',              'não',  'Número inteiro ≥ 0', 'Número de tentativas de ligação já feitas. Padrão 0.'],
        ['Placa',                   'não',  'Texto livre',        'Placa do veículo (opcional). Ex: ABC1D23.'],
        ['Valor FIPE',              'não',  'Número (R$)',        'Valor FIPE do veículo. Aceita vírgula ou ponto. Ex: 45000 ou 45.000,00.'],
        ['Valor Médio Mensalidade', 'não',  'Número (R$)',        'Valor médio de mensalidade estimado. Ex: 150 ou 149,90.'],
        ['Quem Indicou',            'não',  'Texto livre',        'Nome ou código de quem fez a indicação (se aplicável).'],
        ['Observações',             'não',  'Texto livre',        'Anotações livres sobre o lead.'],
        /* Chamado #45 — Bloco de venda (só para etapa=carteira) */
        ['Aniversário do Associado','SIM se etapa=carteira', 'Data (AAAA-MM-DD)', 'OBRIGATÓRIO quando etapa="carteira" (ignorado nas demais). Data de aniversário do associado.'],
        ['Valor de Adesão',         'SIM se etapa=carteira', 'Número (R$)',       'OBRIGATÓRIO quando etapa="carteira" (ignorado nas demais). Valor pago na adesão. Ex: 350 ou 349,90.'],
        ['Valor Mensalidade Venda', 'SIM se etapa=carteira', 'Número (R$)',       'OBRIGATÓRIO quando etapa="carteira" (ignorado nas demais). Valor da mensalidade fechada. Ex: 220.'],
        ['Valor Rastreador',        'SIM se etapa=carteira', 'Número (R$)',       'OBRIGATÓRIO quando etapa="carteira" (ignorado nas demais). Valor do rastreador. Ex: 80.'],
        ['Data da Venda',           'SIM se etapa=carteira', 'Data (AAAA-MM-DD)', 'OBRIGATÓRIO quando etapa="carteira" (ignorado nas demais). Data em que a venda foi fechada. IMPORTANTE: se etapa="carteira", TODOS os 5 campos deste bloco precisam estar preenchidos — parcial ou ausente = erro na linha.'],
      ];

      INSTRUCOES.forEach(function(row, idx) {
        var rowNum = 4 + idx;
        var fillColor = (rowNum % 2 === 0) ? MARINHO_CLARO : BRANCO;
        row.forEach(function(valor, colIdx) {
          var cell = ws2.getCell(rowNum, colIdx + 1);
          cell.value = valor;
          cell.font  = {
            name: 'Arial',
            size: 10,
            bold: colIdx === 0 || (colIdx === 1 && valor === 'SIM'),
            color: { argb: colIdx === 1 && valor === 'SIM' ? 'FF' + VERMELHO : 'FF0E1023' },
          };
          cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + fillColor } };
          cell.alignment = {
            horizontal: colIdx === 1 ? 'center' : 'left',
            vertical: 'top',
            wrapText: true,
          };
          cell.border = {
            bottom: { style: 'hair', color: { argb: 'FF' + BORDA } },
            left:   { style: 'hair', color: { argb: 'FF' + BORDA } },
            right:  { style: 'hair', color: { argb: 'FF' + BORDA } },
          };
        });
        ws2.getRow(rowNum).height = 42;
      });

      /* Notas finais */
      var notaRow = 4 + INSTRUCOES.length + 2;
      ws2.getCell(notaRow, 1).value = '📌 Regras de validação aplicadas na importação:';
      ws2.getCell(notaRow, 1).font  = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF' + MARINHO } };
      ws2.mergeCells(notaRow, 1, notaRow, 4);

      var NOTAS = [
        '• Linhas com Nome ou Telefone vazios/inválidos são marcadas como ERRO e ignoradas.',
        '• Linhas com fonte não reconhecida ou telefone duplicado são marcadas como AVISO (importam mesmo assim).',
        '• A checagem de duplicidade compara com todos os leads ativos e arquivados do banco.',
        '• Quem importa fica automaticamente como responsável dos leads criados.',
        '• Filial vem do usuário logado; não é lida da planilha.',
        '• O sistema exibe uma prévia antes de gravar — nada é importado sem sua confirmação.',
      ];
      NOTAS.forEach(function(nota, idx) {
        var r = notaRow + 1 + idx;
        ws2.getCell(r, 1).value = nota;
        ws2.getCell(r, 1).font  = { name: 'Arial', size: 10 };
        ws2.mergeCells(r, 1, r, 4);
      });

      /* Download */
      var buffer = await wb.xlsx.writeBuffer();
      var blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var url  = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'BeyondCRM_Modelo_Importacao_Leads.xlsx';
      a.click();
      URL.revokeObjectURL(url);

      Toast.show('Planilha modelo baixada.', 'success');
    } catch (err) {
      SLog.error('IMPORT modelo: ' + err.message);
      Toast.show('Erro ao gerar planilha: ' + err.message, 'danger');
    }
  }

  /* ---- FILTRO POR FILIAL (3B.6 · corrigido) ---- */
  /* Bug original: filtrava lendo texto de `.k-captador` no DOM, mas essa
     classe foi removida no PATCH UI-3.2 (badge substituiu texto). Resultado:
     todos os cards eram escondidos e o filtro parecia quebrado.

     Correção: mantém o filtro em ESTADO da classe (_filtroFilialAtual) e
     aplica dentro do renderKanban por dado (captador_id → filial). Isso
     também resolve o bug secundário de "filtro perdido após qualquer ação
     que re-renderize o kanban". */
  static _filtroFilialAtual = null;

  static filtrarPorFilial(filialId) {
    if (!filialId) {
      FunilModule._filtroFilialAtual = null;
    } else {
      const filial = store.filiais.find(f => f.id === filialId);
      FunilModule._filtroFilialAtual = filial || null;
    }
    FunilModule.renderKanban();
  }

  /* ---- RESULTADO LIGAÇÃO ---- */
  static selecionarRes(el) {
    const $opt = $(el);
    if ($opt.hasClass('disabled-opt')) {
      Toast.show('Remarketing disponível após 30 tentativas','warning'); return;
    }
    /* AJUSTE 2 (revisto): desseleciona apenas dentro do MESMO bloco.
       Antes escopava por .lead-tab-pane, o que fazia clicar em Cuidar da Base
       apagar seleção do Pedido de Recomendações (e vice-versa). Agora usa
       .form-section, ou fallback pro pane inteiro se não houver form-section. */
    const $escopo = $opt.closest('.form-section');
    const $reset  = $escopo.length ? $escopo : $opt.closest('.lead-tab-pane');
    $reset.find('.res-opt').removeClass('selected');
    $opt.addClass('selected');

    // AJUSTE 8: atualizar texto do botão de ligação conforme resultado
    const texto = $opt.text().trim();
    const isAvanco = texto.includes('Agendamento') || texto.includes('Remarketing');
    $('#mld-btn-lig').text(isAvanco ? '→ Registrar e Avançar' : '✓ Registrar Resultado');
  }

  /* ---- RESULTADO VISITA ---- */
  static selecionarVisita(el, tipo) {
    $('#tab-visita .vres-btn').removeClass('selected');
    $(el).addClass('selected');
    $('#tab-visita .resultado-detail').removeClass('active');
    $('#vis-detail-'+tipo).addClass('active');

    /* ============================================================
       Patch PERS-3 — em modo read-only (lead já está em Venda/Carteira)
       os botões viram filtros do histórico, não ação de edição.
       ============================================================ */
    if ($('#tab-visita').hasClass('modo-readonly')) {
      if (tipo === 'venda') {
        /* Venda não tem histórico próprio listável — mostra só info */
        $('#vis-historico-container').html(
          '<div class="vis-hist-placeholder">' +
          '💰 A venda deste lead foi registrada. Veja os detalhes na aba <strong>Venda</strong>.' +
          '</div>'
        );
      } else {
        FunilModule._renderizarHistoricoReadonly(tipo);
      }
      return; /* Em modo read-only, NÃO altera o texto do botão Avançar */
    }

    /* Patch FLOW-1 — delega para helper central que aplica regra:
       - Delay/C2/NãoFechou → "Registrar Resultado" sempre habilitado
       - Venda → "Avançar: Venda →" só habilitado se última visita foi Venda */
    FunilModule._atualizarBotaoAvancarVisita(tipo);
  }

  /* ============================================================
     v2.1 — PACOTE 1 v1.3.0 — Estado + métodos novos
     ============================================================ */

  /* Toggle "ver arquivados" — quando true, o renderKanban chama
     store.leadsPorEtapa(key, true) e inclui arquivados. Default: false. */
  static _verArquivados = false;

  /* Modo seleção múltipla — quando true, o board recebe a classe
     `.k-selection-mode` (CSS revela checkboxes) e clicks nos cards
     alternam seleção em vez de abrir o modal. Default: false. */
  static _modoSelecao = false;

  /* ────────────────────────────────────────────────────
     RN-21 (feature 4.1) — Toggle "Ver arquivados"
     ──────────────────────────────────────────────────── */
  static toggleArquivados() {
    FunilModule._verArquivados = !FunilModule._verArquivados;
    SLog.info('Funil: ver arquivados = ' + FunilModule._verArquivados);
    FunilModule.renderKanban();
  }

  /* Helper — atualiza label e badge de contagem do botão "Ver arquivados".
     Chamado ao final de cada renderKanban. */
  static _atualizarBotaoVerArquivados() {
    var $btn   = $('#btn-toggle-arquivados');
    var $lbl   = $('#btn-toggle-arquivados-lbl');
    var $count = $('#btn-toggle-arquivados-count');
    if (!$btn.length) return;

    /* Conta quantos leads estão arquivados no store (todas as etapas) */
    var qtdArquiv = (store.leads || []).reduce(function(acc, l) {
      return acc + (l.arquivado === true ? 1 : 0);
    }, 0);

    if (FunilModule._verArquivados) {
      $lbl.text('Ocultar arquivados');
      $btn.addClass('active').css({ background: '#E5E7EB', 'font-weight': '600' });
    } else {
      $lbl.text('Ver arquivados');
      $btn.removeClass('active').css({ background: '', 'font-weight': '' });
    }

    if (qtdArquiv > 0) {
      $count.text(qtdArquiv).show();
    } else {
      $count.hide();
    }
  }

  /* ────────────────────────────────────────────────────
     RN-21 (feature 4.1) — Arquivar/Desarquivar no modal-lead
     ──────────────────────────────────────────────────── */
  static async arquivarLeadAtual() {
    var lead = store.currentLead;
    if (!lead) return;

    ConfirmDialog.show(
      '📁',
      'Arquivar Lead',
      'Deseja arquivar "' + lead.nome + '" (' + lead.id + ')? O lead ficará oculto da visualização padrão e pode ser recuperado a qualquer momento com "Ver arquivados".',
      async function() {
        var ok = await store.arquivarLead(lead.id);
        if (!ok) return;

        FunilModule._forcarFecharModalLead();
        FunilModule.renderKanban();
        FunilModule.renderFunilPreview();
        FunilModule.renderNumeroMagico();
        FunilModule.atualizarKPIs();
        Toast.show('Lead "' + lead.nome + '" arquivado.', 'success');
      }
    );
  }

  static async desarquivarLeadAtual() {
    var lead = store.currentLead;
    if (!lead) return;

    var ok = await store.desarquivarLead(lead.id);
    if (!ok) return;

    /* Atualiza os botões do modal em tempo real (o lead permanece aberto) */
    FunilModule._atualizarBotoesModal(lead);
    FunilModule.renderKanban();
    FunilModule.renderFunilPreview();
    FunilModule.renderNumeroMagico();
    FunilModule.atualizarKPIs();
    Toast.show('Lead "' + lead.nome + '" desarquivado.', 'success');
  }

  /* ────────────────────────────────────────────────────
     Feature 4.3 — Modo seleção múltipla no Kanban
     ──────────────────────────────────────────────────── */
  static entrarModoSelecao() {
    /* Permissão: só gerente e supervisor podem transferir em lote */
    var perfil = AuthService.currentProfile && AuthService.currentProfile.perfil;
    if (perfil !== 'gerente' && perfil !== 'supervisor') {
      Toast.show('Apenas gerentes e supervisores podem selecionar em lote.', 'warning');
      return;
    }

    FunilModule._modoSelecao = true;
    $('#kanban-board').addClass('k-selection-mode');
    $('#btn-modo-selecao').hide();
    $('#selecao-actions').show().css('display', 'inline-flex');
    FunilModule.onSelecaoAlterada();
    SLog.info('Funil: modo seleção ATIVO');
  }

  static sairDoModoSelecao() {
    FunilModule._modoSelecao = false;
    $('#kanban-board').removeClass('k-selection-mode');
    $('.k-card').removeClass('k-card-selected');
    $('#selecao-actions').hide();
    /* Só mostra o botão de novo se o perfil pode selecionar */
    var perfil = AuthService.currentProfile && AuthService.currentProfile.perfil;
    if (perfil === 'gerente' || perfil === 'supervisor') {
      $('#btn-modo-selecao').show();
    }
    SLog.info('Funil: modo seleção DESATIVADO');
  }

  /* Callback chamado pelo KanbanCard quando um card é (des)selecionado.
     Atualiza o contador visual na toolbar. */
  static onSelecaoAlterada() {
    var qtd = $('.k-card.k-card-selected').length;
    var texto = qtd === 1 ? '1 selecionado' : (qtd + ' selecionados');
    $('#selecao-count').text(texto);
  }

  /* ────────────────────────────────────────────────────
     Inicialização da toolbar do Funil.
     Chamado uma vez pelo app.js (ou pelo router ao navegar
     pra página do funil). Mostra o botão "Selecionar" só
     para gerente/supervisor.
     ──────────────────────────────────────────────────── */
  static inicializarToolbar() {
    var perfil = AuthService.currentProfile && AuthService.currentProfile.perfil;
    var podeSelecionar = (perfil === 'gerente' || perfil === 'supervisor');
    $('#btn-modo-selecao').toggle(podeSelecionar);
    $('#selecao-actions').hide();
    FunilModule._atualizarBotaoVerArquivados();
    /* v2.3 — Monta o filtro avançado (feature 4.10) */
    FunilModule._montarFiltroAvancado();
    /* v2.4 — Monta o filtro do Dashboard (feature 4.11) */
    FunilModule._montarFiltroDashboard();
  }

  /* ============================================================
     v2.2 — PACOTE 2 v1.4.0 — Feature 4.4 (RN-25)
     Detecção de telefone duplicado
     ============================================================ */

  /* Guarda o payload pendente enquanto o modal de alerta de
     duplicidade está aberto. Estrutura:
       { lead: {...}, tags: [...], duplicados: [...] }
     Limpa quando o usuário decide (confirma ou cancela). */
  static _leadPendenteDup = null;

  /* Abre o modal de alerta de duplicidade. Popula o corpo com
     o nome/tel digitado e a lista de leads existentes com o
     mesmo telefone. */
  static _abrirModalTelDuplicado(leadNovo, duplicados) {
    /* Header — dados do lead que o especialista tentou cadastrar */
    $('#dup-novo-nome').text(leadNovo.nome || '—');
    $('#dup-novo-tel').text(leadNovo.tel || '—');
    $('#dup-count').text(duplicados.length);

    /* Corpo — cards dos leads existentes que batem no telefone */
    var $lista = $('#dup-lista');
    $lista.empty();

    duplicados.forEach(function(d) {
      var stageCfg = (typeof STAGE_CONFIG !== 'undefined' && STAGE_CONFIG[d.etapa]) || null;
      var stageLbl = stageCfg ? (stageCfg.icon + ' ' + stageCfg.label) : d.etapa;
      var stageCor = stageCfg ? stageCfg.color : '#6B7280';
      var badgeArq = d.arquivado
        ? '<span class="dup-badge-arq"><i class="bi bi-archive-fill"></i> arquivado</span>'
        : '';

      var html =
        '<div class="dup-card">' +
        '  <div class="dup-card-head">' +
        '    <span class="dup-card-codigo">' + Utils.escHtml(d.codigo) + '</span>' +
        '    <span class="dup-card-etapa" style="background:' + stageCor + '22;color:' + stageCor + ';">' + Utils.escHtml(stageLbl) + '</span>' +
             badgeArq +
        '  </div>' +
        '  <div class="dup-card-nome">' + Utils.escHtml(d.nome) + '</div>' +
        '  <div class="dup-card-info">' +
        '    <i class="bi bi-telephone-fill"></i> ' + Utils.escHtml(d.tel) +
        '  </div>' +
        '  <div class="dup-card-info">' +
        '    <i class="bi bi-person-fill"></i> Responsável: <strong>' + Utils.escHtml(d.responsavel_nome) +
        '</strong> <span class="text-muted">(' + Utils.escHtml(d.responsavel_sigla) + ')</span>' +
        '  </div>' +
        '  <div class="dup-card-info">' +
        '    <i class="bi bi-building"></i> Unidade: ' + Utils.escHtml(d.filial_nome) +
        '  </div>' +
        '</div>';
      $lista.append(html);
    });

    Modal.abrir('modal-tel-duplicado');
  }

  /* Chamado pelo botão "Cadastrar mesmo assim e Notificar Gerente"
     do modal-tel-duplicado. Executa o cadastro normal e depois
     dispara notificação para gerentes da filial. */
  static async confirmarCadastroComDuplicado() {
    var pend = FunilModule._leadPendenteDup;
    if (!pend) {
      Toast.show('Nada pendente para cadastrar.', 'warning');
      Modal.fechar('modal-tel-duplicado');
      return;
    }

    /* Bloqueia o botão enquanto processa */
    var $btn = $('#btn-dup-confirmar');
    var htmlOrig = $btn.html();
    $btn.prop('disabled', true).html('<i class="bi bi-arrow-repeat spin-icon"></i> Cadastrando...');

    try {
      /* 1) Cadastra o lead efetivamente */
      await FunilModule._cadastrarLeadEfetivo(pend.lead, pend.tags);

      /* 2) Notifica gerentes da filial. A filial usada é a do usuário
         logado (via profile.filial_id) — é dela que virão os gestores
         que precisam agir. Se preferirmos notificar gestores da filial
         do RESPONSÁVEL ANTIGO (do lead existente), fica pra uma
         evolução; hoje o padrão do sistema é notificar a filial atual
         (mesmo padrão do C2 / RN-04). */
      var filialId = (AuthService.currentProfile && AuthService.currentProfile.filial_id) || null;
      var especialistaNm = (AuthService.currentProfile && AuthService.currentProfile.nome) || 'Especialista';

      if (typeof LeadDuplicadoService !== 'undefined' && LeadDuplicadoService.notificarGerentes) {
        await LeadDuplicadoService.notificarGerentes(
          filialId,
          { codigo: pend.lead.id, nome: pend.lead.nome },
          pend.duplicados,
          especialistaNm
        );
      }

      /* Chamado #26 — notificação persistente PRO PRÓPRIO usuário que
         cadastrou, pra ele reabrir/dar sequência pelo sininho. O
         notificarGerentes acima vai só pros gerentes (a RPC exclui
         quem criou), então sem isto o especialista não recebia nada
         no próprio sino. */
      var qtdDup = (pend.duplicados && pend.duplicados.length) || 0;
      store.adicionarNotificacao(
        '⚠️ Telefone duplicado ao cadastrar ' + (pend.lead.nome || 'lead') +
        ' (' + (pend.lead.tel || '') + ') — já existe ' + qtdDup +
        ' lead(s) com esse número. Clique para abrir o lead.',
        pend.lead.id   /* Chamado #26 — clicar na notificação abre este lead */
      );

      /* Atualiza o sino local pra refletir a notificação recém-criada */
      if (typeof NotifController !== 'undefined' && NotifController.atualizar) {
        NotifController.atualizar();
      }

      Modal.fechar('modal-tel-duplicado');
      Toast.show('Lead cadastrado. Gerentes notificados sobre a duplicidade.', 'success');

      /* Chamado #29 — se o cadastro veio via Recomendação, limpa o
         formulário da recomendação e re-renderiza o funil (o fluxo
         normal do criarLeadRec fazia isso; aqui reproduzimos após a
         confirmação da duplicidade). */
      if (pend._recContainerId) {
        $('#' + pend._recContainerId).find('input, textarea').val('');
        FunilModule.renderFunilPreview();
        AtividadeModule.adicionar('🌱', pend.lead.nome,
          'Lead criado via recomendação', '', '#DBEAFE', '#2563EB', 'lead');
      }
    } catch (err) {
      SLog.error('confirmarCadastroComDuplicado: ' + err.message);
      Toast.show('Erro ao cadastrar: ' + err.message, 'danger');
    } finally {
      $btn.prop('disabled', false).html(htmlOrig);
      FunilModule._leadPendenteDup = null;
    }
  }

  /* Chamado pelo botão "Cancelar" do modal-tel-duplicado.
     Fecha o alerta E MANTÉM o modal-novo-lead aberto pro
     especialista corrigir o telefone (ou desistir manualmente). */
  static cancelarCadastroDuplicado() {
    FunilModule._leadPendenteDup = null;
    Modal.fechar('modal-tel-duplicado');
    /* Foca no campo telefone pra facilitar a correção */
    setTimeout(function() { $('#nl-tel').focus(); }, 200);
  }

  /* ============================================================
     v2.3 — PACOTE 2 v1.4.0 — Feature 4.10 (RN-26)
     Filtros avançados no Processo de Vendas
     ============================================================ */

  /* Instância do componente. Criada em inicializarToolbar. */
  static _filtroAvancado = null;

  /* Chamado por inicializarToolbar — configura o componente
     com a lista de campos declarativos. */
  static _montarFiltroAvancado() {
    if (typeof FiltroAvancadoComponent === 'undefined') {
      SLog.warn('FunilModule: FiltroAvancadoComponent indisponível');
      return;
    }

    FunilModule._filtroAvancado = new FiltroAvancadoComponent({
      key:        'funil',
      storageKey: 'beyond-filtros-funil',
      container:  '#filtro-avancado-body',
      drawerId:   'filtro-avancado-drawer',
      onChange:   function() {
        FunilModule.renderKanban();
        FunilModule._atualizarBadgeFiltro();
      },
      campos: [
        {
          tipo: 'text',
          id: 'codigo',
          label: 'Código do lead',
          propriedade: 'id',
          placeholder: 'Ex: 00042 ou BCR-2026',
        },
        {
          tipo: 'multi-select',
          id: 'tags',
          label: 'Tag(s)',
          propriedade: 'tags',
          /* Onda 6 (#14) — habilita toggle "Qualquer marcada / Todas marcadas".
             Antes o filtro sempre fazia OR (qualquer tag marcada bate).
             Agora o usuário pode escolher AND (todas as marcadas precisam
             estar no lead). Útil quando quer isolar leads que combinam
             perfis específicos (ex.: "🔥 quente" E "💰 alto valor"). */
          permitirAndOr: true,
          opcoesFn: function() {
            return (store.tags || []).map(function(slug) {
              var cfg = (typeof TAG_CONFIG !== 'undefined' && TAG_CONFIG[slug]) || {};
              return { val: slug, label: cfg.label || slug };
            });
          },
        },
        {
          /* Chamado #69 — filtro de usuário do KANBAN (processo de vendas).
             Antes filtrava por captador_id ("Cadastrado por" / criador), então
             um lead transferido continuava aparecendo pra quem o criou mesmo
             filtrando "os meus". O #69 anterior corrigiu só o filtro do
             DASHBOARD; este, do kanban, ficou pra trás. Agora filtra pelo
             RESPONSÁVEL ATUAL (responsavel_id), atualizado na transferência
             (RPC transferir_lead_seguro) e no fechamento de venda — o card sai
             da base do antigo responsável e passa pro atual.

             Inclui todos os usuários ativos, ordenados por nome. */
          tipo: 'multi-select',
          id: 'responsavel',
          label: 'Usuário responsável',
          getValor: function(l) { return l.responsavel_id || l.captador_id; },
          opcoesFn: function() {
            return (store.usuarios || [])
              .filter(function(u) { return u.status !== 'inativo'; })
              .slice()
              .sort(function(a, b) {
                return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
              })
              .map(function(u) { return { val: u._id, label: u.nome }; });
          },
        },
        {
          tipo: 'daterange',
          id: 'dataCriacao',
          label: 'Data de criação',
          propriedade: '_createdAt',
        },
        {
          tipo: 'multi-select',
          id: 'fontes',
          label: 'Fonte do lead',
          propriedade: 'fonte',
          opcoesFn: function() {
            /* Deriva fontes distintas de store.leads (ignora vazios) */
            var s = new Set();
            (store.leads || []).forEach(function(l) {
              if (l.fonte && String(l.fonte).trim()) s.add(String(l.fonte).trim());
            });
            return Array.from(s).sort();
          },
        },
        {
          tipo: 'faixa-numerica',
          id: 'mensalidade',
          label: 'Mensalidade estimada (R$)',
          propriedade: 'mensalidadeEst',
          vazias: true,
        },
        {
          tipo: 'faixa-numerica',
          id: 'fipe',
          label: 'Valor FIPE (R$)',
          propriedade: 'fipe',
          vazias: true,
        },
        {
          tipo: 'multi-select',
          id: 'categoriaVeiculo',
          label: 'Categoria do veículo',
          /* v2.9 (T22) — Opções FIXAS das 6 categorias oficiais do
             dropdown do modal de agendamento (#agen-cat no index.html).
             Antes derivava de store.agendamentos, o que trazia sujeira
             de digitação e sinônimos antigos. Comparação continua via
             índice pré-computado (agendamentos → leads) — ver
             FiltroAvancadoComponent._passaFiltro. */
          opcoes: [
            'Nacional Particular',
            'Importado/Diesel',
            'Nacional Trabalho',
            'Motocicleta',
            'Caminhão',
            'Não sei',
          ],
        },
        {
          tipo: 'multi-select',
          id: 'resultadoVisita',
          label: 'Resultado de visita',
          /* Comparação via índice pré-computado (visitas → leads) — ver _passaFiltro */
          opcoes: [
            { val: 'delay',      label: '⏳ Delay' },
            { val: 'c2',         label: '📅 C2' },
            { val: 'nao_fechou', label: '❌ Não Fechou' },
            { val: 'venda',      label: '💰 Venda' },
          ],
        },
        {
          /* v2.9 (T23) — Toggle "Incluir arquivados" no drawer.
             Não usa passaSeMarcado — o efeito é externo: quando
             ativo, renderKanban usa store.leadsPorEtapa(key, true).
             Ver FunilModule._filtroIncluirArquivados. */
          tipo: 'checkbox',
          id: 'incluirArquivados',
          label: 'Incluir arquivados',
          hint: 'Mostra leads arquivados junto com os ativos no funil.',
        },
      ],
    });

    FunilModule._filtroAvancado.montar();
    FunilModule._atualizarBadgeFiltro();
  }

  /* Atualiza a badge de contagem no botão da toolbar */
  static _atualizarBadgeFiltro() {
    if (!FunilModule._filtroAvancado) return;
    var qtd = FunilModule._filtroAvancado.contarAtivos();
    var $badge = $('#btn-filtro-avancado-count');
    if (qtd > 0) $badge.text(qtd).show();
    else $badge.hide();
  }

  /* v2.9 (T23) — Retorna true se o filtro "Incluir arquivados" está
     marcado no drawer avançado. Consumido no renderKanban pra
     decidir o segundo parâmetro de store.leadsPorEtapa. Se o filtro
     nem existe (componente não montado), retorna false. */
  static _filtroIncluirArquivados() {
    if (!FunilModule._filtroAvancado) return false;
    return FunilModule._filtroAvancado.getValor('incluirArquivados') === true;
  }

  /* Ganchos chamados pelos botões da toolbar / drawer */
  static abrirFiltroAvancado() {
    if (!FunilModule._filtroAvancado) FunilModule._montarFiltroAvancado();
    /* Re-monta opcoesFn dinâmicas — precisamos disso pra pegar novos
       leads/agendamentos/tags que possam ter entrado depois do bootstrap */
    FunilModule._filtroAvancado.montar();
    FunilModule._filtroAvancado.abrir();
  }
  aplicarFiltroAvancado() { /* stub — chamado via handler abaixo */ }
  static aplicarFiltroAvancado() {
    if (FunilModule._filtroAvancado) FunilModule._filtroAvancado.aplicar();
    FunilModule._atualizarBadgeFiltro();
  }
  static limparFiltroAvancado() {
    if (FunilModule._filtroAvancado) FunilModule._filtroAvancado.limpar();
    FunilModule._atualizarBadgeFiltro();
  }
  static fecharFiltroAvancado() {
    if (FunilModule._filtroAvancado) FunilModule._filtroAvancado.fechar();
  }

  /* ============================================================
     v2.4 — PACOTE 2 v1.4.0 — Feature 4.11 (RN-27)
     Filtros avançados no Dashboard/Número Mágico
     ============================================================ */

  /* Segunda instância do FiltroAvancadoComponent, dedicada ao Dashboard.
     Independente do _filtroAvancado do Funil (chaves diferentes no
     localStorage, campos diferentes, container diferente). */
  static _filtroDashboard = null;

  static _montarFiltroDashboard() {
    if (typeof FiltroAvancadoComponent === 'undefined') {
      SLog.warn('FunilModule: FiltroAvancadoComponent indisponível');
      return;
    }

    FunilModule._filtroDashboard = new FiltroAvancadoComponent({
      key:        'dashboard',
      storageKey: 'beyond-filtros-dashboard',
      container:  '#filtro-dashboard-body',
      drawerId:   'filtro-dashboard-drawer',
      onChange:   function() {
        FunilModule.atualizarKPIs();
        FunilModule.renderFunilPreview();
        FunilModule.renderNumeroMagico();
        FunilModule._atualizarBadgeFiltroDashboard();
        /* Chamado #78 — o card "Visão do Funil — Conversão entre etapas"
           também precisa reagir ao filtro (antes era o único que não
           reagia). Re-renderiza com as bases já filtradas. */
        if (typeof TaxaConversaoModule !== 'undefined' && TaxaConversaoModule.renderDashboardCard) {
          try { TaxaConversaoModule.renderDashboardCard(); }
          catch (e) { SLog.warn('renderDashboardCard onChange: ' + e.message); }
        }
      },
      campos: [
        {
          tipo: 'multi-select',
          id: 'usuarios',
          label: 'Usuário(s) responsável(is)',
          /* Chamado #69 — filtra pelo RESPONSÁVEL ATUAL do lead
             (responsavel_id), não pelo criador (captador_id). Antes o
             label dizia "responsável" mas filtrava por captador_id, então
             após uma transferência o lead continuava aparecendo para
             quem criou o card, e não para quem passou a tratá-lo. O
             responsavel_id é atualizado na transferência (RPC
             transferir_lead_seguro) e no fechamento de venda (Opção B),
             então este filtro passa a refletir sempre o dono atual. */
          propriedade: 'responsavel_id',
          opcoesFn: function() {
            /* Lista todos os usuários ativos (não inativos). Inclui
               especialistas, supervisores e gerentes. */
            return (store.usuarios || [])
              .filter(function(u) { return u.status !== 'inativo'; })
              .map(function(u) {
                return { val: u._id || u.id, label: u.nome + (u.sigla ? ' (' + u.sigla + ')' : '') };
              })
              .sort(function(a, b) { return a.label.localeCompare(b.label); });
          },
        },
        {
          tipo: 'multi-select',
          id: 'fontes',
          label: 'Fonte do lead',
          propriedade: 'fonte',
          opcoesFn: function() {
            var s = new Set();
            (store.leads || []).forEach(function(l) {
              if (l.fonte && String(l.fonte).trim()) s.add(String(l.fonte).trim());
            });
            return Array.from(s).sort();
          },
        },
        {
          tipo: 'daterange',
          id: 'periodoCustom',
          label: 'Data personalizada (sobrescreve dropdown)',
          propriedade: '_createdAt',
        },
      ],
    });

    FunilModule._filtroDashboard.montar();
    FunilModule._atualizarBadgeFiltroDashboard();
  }

  static _atualizarBadgeFiltroDashboard() {
    if (!FunilModule._filtroDashboard) return;
    var qtd = FunilModule._filtroDashboard.contarAtivos();
    var $badge = $('#btn-filtro-dashboard-count');
    if (qtd > 0) $badge.text(qtd).show();
    else $badge.hide();
  }

  /* Ganchos dos botões do drawer dashboard */
  static abrirFiltroDashboard() {
    if (!FunilModule._filtroDashboard) FunilModule._montarFiltroDashboard();
    /* Re-monta opções dinâmicas (usuários/fontes podem ter mudado) */
    FunilModule._filtroDashboard.montar();
    FunilModule._filtroDashboard.abrir();
  }
  static aplicarFiltroDashboard() {
    if (FunilModule._filtroDashboard) FunilModule._filtroDashboard.aplicar();
    FunilModule._atualizarBadgeFiltroDashboard();
  }
  static limparFiltroDashboard() {
    if (FunilModule._filtroDashboard) FunilModule._filtroDashboard.limpar();
    FunilModule._atualizarBadgeFiltroDashboard();
  }
  static fecharFiltroDashboard() {
    if (FunilModule._filtroDashboard) FunilModule._filtroDashboard.fechar();
  }

  /* ────────────────────────────────────────────────────
     Helper central — retorna leads filtrados pelo dashboard.
       opts.ignorarPeriodo = true → não filtra por período
                                    (usado por Funil Preview e KPIs
                                    de estado atual)
     ──────────────────────────────────────────────────── */
  static _getLeadsFiltradosDashboard(opts) {
    opts = opts || {};
    /* Chamado #100 — opts.incluirArquivados permite que um consumidor
       específico (ex.: card "Leads" do Número Mágico) receba também os
       leads arquivados. Default continua excluindo (Funil Preview,
       "Associados na carteira" etc. não mudam de comportamento). */
    var leads = (store.leads || []).filter(function(l) { return opts.incluirArquivados || !l.arquivado; });

    /* 1) Filtros do drawer (usuário, fonte, data personalizada) */
    if (FunilModule._filtroDashboard && FunilModule._filtroDashboard.contarAtivos() > 0) {
      var filtros = FunilModule._filtroDashboard.filtros;
      var camposParaAplicar = FunilModule._filtroDashboard.config.campos.slice();

      /* Se pedimos pra ignorar período, removemos o campo periodoCustom */
      if (opts.ignorarPeriodo) {
        camposParaAplicar = camposParaAplicar.filter(function(c) { return c.id !== 'periodoCustom'; });
      }

      /* Chama filtrar() com config temporária (sem mutar a original) */
      var configOriginal = FunilModule._filtroDashboard.config.campos;
      FunilModule._filtroDashboard.config.campos = camposParaAplicar;
      leads = FunilModule._filtroDashboard.filtrar(leads, {
        agendamentos: store.agendamentos || [],
        visitas:      store.visitas      || [],
      });
      FunilModule._filtroDashboard.config.campos = configOriginal;
    }

    /* 2) Filtro de período do dropdown (só quando não pediram ignorar
          E o daterange do drawer NÃO está preenchido — daterange tem
          prioridade sobre o dropdown). */
    if (!opts.ignorarPeriodo) {
      var f = FunilModule._filtroDashboard && FunilModule._filtroDashboard.filtros;
      var temDataCustom = !!(f && f.periodoCustom && (f.periodoCustom.de || f.periodoCustom.ate));
      if (!temDataCustom) {
        var periodo = FunilModule._resolverPeriodoDropdown();
        if (periodo) {
          leads = leads.filter(function(l) {
            if (!l._createdAt) return false;
            var d = new Date(l._createdAt);
            return d >= periodo.inicio && d <= periodo.fim;
          });
        }
      }
    }

    return leads;
  }

  /* ═══════════════════════════════════════════════════════════════════
     v2.6 — REFATORAÇÃO BUG-A (Número Mágico correto)

     Antes deste bloco, o renderNumeroMagico contava "leads por etapa"
     filtrando por `l._createdAt` no período. Isso tinha 2 defeitos
     estruturais:
       (a) Não conseguia contar vendas: leads viram etapa='carteira'
           imediatamente após a venda; ninguém fica em 'venda'.
       (b) Um lead captado ANTES do período mas que gerou evento DENTRO
           do período não contava. O NM ficava cego pra vendas de leads
           antigos, agendamentos de leads antigos, etc.

     A refatoração faz o NM contar EVENTOS no período (não estados do
     lead). Cada card do NM lê da fonte correspondente:
       LEADS         → store.leads      (por _createdAt)
       CONTATOS      → store.ligacoes   (por _data_hora, só tipo_contato='contato')
       AGENDAMENTOS  → store.agendamentos (por _created_at)
       VISITAS       → store.visitas    (por created_at)
       VENDAS        → store.vendas     (por dataVenda)
       RECOMENDAÇÕES → store.carteiraInteracoes (por dataHora, tipo='recomendacao')

     Cada helper respeita filtro de usuário (por _esp_id do evento) e
     filtro de fonte (via lookup no lead, por _lead_uuid). Todos usam
     o helper unificado _resolverPeriodoDashboard() para respeitar o
     dropdown OU o daterange do drawer.
     ═══════════════════════════════════════════════════════════════════ */

  /* Retorna o período efetivo do Dashboard: daterange do drawer
     tem prioridade; se não estiver preenchido, usa o dropdown. */
  static _resolverPeriodoDashboard() {
    var f = FunilModule._filtroDashboard && FunilModule._filtroDashboard.filtros;
    var temDataCustom = !!(f && f.periodoCustom && (f.periodoCustom.de || f.periodoCustom.ate));
    if (temDataCustom) {
      return {
        inicio: f.periodoCustom.de  ? new Date(f.periodoCustom.de  + 'T00:00:00') : new Date(0),
        fim:    f.periodoCustom.ate ? new Date(f.periodoCustom.ate + 'T23:59:59') : new Date(),
      };
    }
    return FunilModule._resolverPeriodoDropdown();
  }

  /* Set com IDs de usuários do drawer, ou null se filtro não ativo. */
  static _filtroUsuariosDashboardSet() {
    var f = FunilModule._filtroDashboard && FunilModule._filtroDashboard.filtros;
    if (!f || !f.usuarios || !f.usuarios.length) return null;
    return new Set(f.usuarios);
  }

  /* Set com fontes do drawer, ou null se filtro não ativo. */
  static _filtroFontesDashboardSet() {
    var f = FunilModule._filtroDashboard && FunilModule._filtroDashboard.filtros;
    if (!f || !f.fontes || !f.fontes.length) return null;
    return new Set(f.fontes);
  }

  /* Verifica se um evento passa no filtro de fonte, olhando o lead
     pelo _lead_uuid. Se não há filtro de fonte, sempre passa. */
  static _eventoPassaFiltroFonte(leadUuid, setFontes) {
    if (!setFontes) return true;
    var lead = (store.leads || []).find(function(l) { return l._uuid === leadUuid; });
    return !!(lead && setFontes.has(lead.fonte));
  }

  /* Ligações filtradas por período + usuário + fonte do dashboard.
     v2.6: agora usa _resolverPeriodoDashboard e passa a respeitar
     o filtro de fonte (via lead). */
  /* ════════════════════════════════════════════════════════════
     Chamado #131 — o cálculo local não pode usar só o cache do boot
     ════════════════════════════════════════════════════════════
     `store.ligacoes` é carregado no boot com apenas 200 registros
     (SupabaseSync.carregarLigacoes). Para o Kanban isso basta, mas o
     KPI "Ligações" cai neste cálculo local sempre que há filtro de
     FONTE ativo — e aí 200 é muito pouco: só a Fulana tem mais de
     900 ligações num único ciclo. O número exibido ficava truncado, o
     que o cliente leu como "não está registrando as ligações".

     Agora o dashboard usa o histórico completo quando ele já foi
     buscado, e dispara a busca quando precisa. Até chegar, segue com
     o cache do boot — nunca fica sem número na tela. */
  static _ligacoesHistCache = null;
  static _ligacoesHistFetching = false;

  static _ligacoesParaDashboard() {
    return FunilModule._ligacoesHistCache || store.ligacoes || [];
  }

  static _garantirLigacoesHist(aoConcluir) {
    if (FunilModule._ligacoesHistCache || FunilModule._ligacoesHistFetching) return;
    if (typeof SupabaseSync === 'undefined' || !SupabaseSync.buscarLigacoesCompleto) return;
    FunilModule._ligacoesHistFetching = true;
    SupabaseSync.buscarLigacoesCompleto()
      .then(function(l) {
        FunilModule._ligacoesHistCache = (l && l.length) ? l : null;
        if (FunilModule._ligacoesHistCache) {
          SLog.info('LIG-HIST (#131): ' + FunilModule._ligacoesHistCache.length +
                    ' ligações carregadas (cache do boot tinha ' + (store.ligacoes || []).length + ')');
        }
      })
      .catch(function(e) { SLog.warn('LIG-HIST (#131): ' + (e && e.message)); })
      .then(function() {
        FunilModule._ligacoesHistFetching = false;
        if (FunilModule._ligacoesHistCache && typeof aoConcluir === 'function') aoConcluir();
      });
  }

  static _getLigacoesFiltradasDashboard() {
    var ligs = FunilModule._ligacoesParaDashboard();
    var setUsers  = FunilModule._filtroUsuariosDashboardSet();
    var setFontes = FunilModule._filtroFontesDashboardSet();

    if (setUsers)  ligs = ligs.filter(function(l) { return setUsers.has(l._esp_id); });
    if (setFontes) ligs = ligs.filter(function(l) { return FunilModule._eventoPassaFiltroFonte(l._lead_uuid, setFontes); });

    var periodo = FunilModule._resolverPeriodoDashboard();
    if (periodo) {
      ligs = ligs.filter(function(l) {
        var iso = l._data_hora || l._created_at;
        if (!iso) return false;
        var d = new Date(iso);
        return d >= periodo.inicio && d <= periodo.fim;
      });
    }

    /* Chamado #83 — recorte de carteira: exclui ligações feitas DEPOIS
       que o lead entrou em carteira (as anteriores contam). Mesma regra
       da RPC contar_ligacoes_totais, aplicada aqui pro cálculo local
       ficar consistente (usado quando há filtro de fonte, que a RPC não
       cobre, e como fallback se a RPC falhar).

       Chamado #126 — extraído pro helper _ligacaoContaNoTotal, agora
       reusado também pelo Número Mágico e pelo relatório de desempenho.
       O `.find` por ligação (O(n×m)) virou um mapa montado uma vez. */
    var _mapaCart = FunilModule._mapaCarteiraEm();
    ligs = ligs.filter(function(l) { return FunilModule._ligacaoContaNoTotal(l, _mapaCart); });

    return ligs;
  }

  /* ════════════════════════════════════════════════════════════
     Chamado #126 — regra ÚNICA de "esta ligação conta?"
     ════════════════════════════════════════════════════════════
     Regra confirmada pelo cliente: TODA ligação registrada conta, em
     qualquer etapa do processo de vendas (Ligação, Agendamento, Visita,
     Venda) e com QUALQUER resultado — inclusive "Não Atendeu", "Número
     Errado" e "Pediu para Retornar". A única exceção é a ligação feita
     na etapa da CARTEIRA.

     Como a tabela `ligacoes` não guarda a etapa em que a ligação foi
     feita, "ligação de carteira" é identificada pelo mesmo critério
     temporal que a RPC contar_ligacoes_totais usa desde o #83: o lead
     está em carteira E a ligação é posterior ao carteira_em (timestamp
     gravado pelo trigger trg_marcar_carteira_em quando o lead entra na
     carteira). Ligações do mesmo lead ANTERIORES à entrada em carteira
     seguem contando — foram prospecção de verdade.

     Nota: as interações de carteira em si (Pedido de Recomendações e
     Cuidar da Base) nem passam por aqui — vão pra tabela
     `carteira_interacoes`, não pra `ligacoes`. */
  static _mapaCarteiraEm() {
    var m = Object.create(null);
    (store.leads || []).forEach(function(l) {
      if (l && l._uuid && l.etapa === 'carteira' && l.carteira_em) m[l._uuid] = l.carteira_em;
    });
    return m;
  }

  static _ligacaoContaNoTotal(lig, mapaCarteira) {
    if (!lig) return false;
    var corte = mapaCarteira ? mapaCarteira[lig._lead_uuid] : null;
    if (!corte) return true;               /* lead fora de carteira → conta */
    var iso = lig._data_hora || lig._created_at;
    if (!iso) return true;                 /* sem data → não dá pra recortar */
    return new Date(iso) <= new Date(corte);
  }

  /* v2.6 — Agendamentos filtrados por período + usuário + fonte.
     Data usada: _created_at (quando o agendamento foi criado). */
  /* ════════════════════════════════════════════════════════════
     Chamado #131 — tentativas pós-delay contam como ligação
     ════════════════════════════════════════════════════════════
     O sistema registra ligação em dois lugares, e só um deles grava
     na tabela `ligacoes`:

       • aba "Ligação"  → `ligacoes`, funciona em qualquer etapa e
         sempre contou (os dados mostram 344 ligações de leads em
         visita/agendamento/lead entrando normalmente no KPI);
       • aba "Visita", tentativa pós-delay → `visitas`, nos campos
         tentativa_data_hora/tentativa_resultado. É uma ligação feita
         na etapa Visita, e nunca entrou no KPI.

     Pela regra do #131 — "todas as ligações realizadas em qualquer
     uma das etapas", com a carteira como única exceção — as segundas
     precisam contar.

     O filtro por `tipoResultado === 'delay'` é essencial: o C2
     (agendamento de retorno) usa o MESMO campo de data/hora, mas não
     é uma chamada. No ciclo de Setembro eram 60 C2 contra 157
     tentativas reais — sem o filtro, o KPI passaria a contar
     agendamento como ligação. */
  static _tentativasDelayFiltradas() {
    var vis = store.visitas || [];
    var setUsers  = FunilModule._filtroUsuariosDashboardSet();
    var setFontes = FunilModule._filtroFontesDashboardSet();

    var tent = vis.filter(function(v) {
      return v && v.tipoResultado === 'delay' && v.tentativaDataHora;
    });

    if (setUsers)  tent = tent.filter(function(v) { return setUsers.has(v._esp_id); });
    if (setFontes) tent = tent.filter(function(v) { return FunilModule._eventoPassaFiltroFonte(v._lead_uuid, setFontes); });

    var periodo = FunilModule._resolverPeriodoDashboard();
    if (periodo) {
      tent = tent.filter(function(v) {
        var d = new Date(v.tentativaDataHora);
        return !isNaN(d.getTime()) && d >= periodo.inicio && d <= periodo.fim;
      });
    }

    /* Mesma exceção de carteira das ligações. */
    var mapaCart = FunilModule._mapaCarteiraEm();
    tent = tent.filter(function(v) {
      var corte = mapaCart[v._lead_uuid];
      if (!corte) return true;
      return new Date(v.tentativaDataHora) <= new Date(corte);
    });

    return tent;
  }

  static _getAgendamentosFiltradosDashboard() {
    var ags = store.agendamentos || [];
    var setUsers  = FunilModule._filtroUsuariosDashboardSet();
    var setFontes = FunilModule._filtroFontesDashboardSet();

    if (setUsers)  ags = ags.filter(function(a) { return setUsers.has(a._esp_id); });
    if (setFontes) ags = ags.filter(function(a) { return FunilModule._eventoPassaFiltroFonte(a._lead_uuid, setFontes); });

    var periodo = FunilModule._resolverPeriodoDashboard();
    if (periodo) {
      ags = ags.filter(function(a) {
        var iso = a._created_at;
        if (!iso) return false;
        var d = new Date(iso);
        return d >= periodo.inicio && d <= periodo.fim;
      });
    }
    return ags;
  }

  /* v2.6 — Visitas filtradas por período + usuário + fonte.
     Data usada: created_at (quando a visita foi registrada) — EXCETO
     para visitas tipo_resultado='venda', que usam a DATA DA VENDA
     (chamado #121 — venda retroativa: o registro de visita nasce com
     created_at=agora quando alguém cadastra uma venda antiga; o recorte
     de ciclo tem que seguir a data_venda, igual o RPC nm_totais_reais). */
  static _getVisitasFiltradasDashboard() {
    var vis = store.visitas || [];
    var setUsers  = FunilModule._filtroUsuariosDashboardSet();
    var setFontes = FunilModule._filtroFontesDashboardSet();

    if (setUsers)  vis = vis.filter(function(v) { return setUsers.has(v._esp_id); });
    if (setFontes) vis = vis.filter(function(v) { return FunilModule._eventoPassaFiltroFonte(v._lead_uuid, setFontes); });

    var periodo = FunilModule._resolverPeriodoDashboard();
    if (periodo) {
      /* data_venda por lead (a mais recente), pra usar nas visitas 'venda'. */
      var dataVendaPorLead = {};
      (store.vendas || []).forEach(function(vn) {
        if (!vn._lead_uuid || !vn.dataVenda) return;
        var dv = new Date(String(vn.dataVenda).slice(0, 10) + 'T00:00:00');
        if (isNaN(dv.getTime())) return;
        if (!dataVendaPorLead[vn._lead_uuid] || dv > dataVendaPorLead[vn._lead_uuid]) {
          dataVendaPorLead[vn._lead_uuid] = dv;
        }
      });
      vis = vis.filter(function(v) {
        var d = (v.tipoResultado === 'venda' && dataVendaPorLead[v._lead_uuid])
          ? dataVendaPorLead[v._lead_uuid]
          : (v.created_at ? new Date(v.created_at) : null);
        if (!d) return false;
        return d >= periodo.inicio && d <= periodo.fim;
      });
    }
    return vis;
  }

  /* v2.6 — Vendas filtradas por período + usuário + fonte.
     Data usada: dataVenda (data comercial da venda, escolhida pelo
     especialista no form). Fallback pra created_at se dataVenda faltar. */
  static _getVendasFiltradasDashboard() {
    var vds = store.vendas || [];
    var setUsers  = FunilModule._filtroUsuariosDashboardSet();
    var setFontes = FunilModule._filtroFontesDashboardSet();

    if (setUsers)  vds = vds.filter(function(v) { return setUsers.has(v._esp_id); });
    if (setFontes) vds = vds.filter(function(v) { return FunilModule._eventoPassaFiltroFonte(v._lead_uuid, setFontes); });

    var periodo = FunilModule._resolverPeriodoDashboard();
    if (periodo) {
      vds = vds.filter(function(v) {
        /* Chamado #105 — dataVenda é data pura ("2026-08-26", sem hora).
           new Date() direto nisso interpreta como meia-noite UTC, que em
           horário de Brasília já é o dia anterior às 21h — derrubava
           vendas do início do período pro fuso errado. Força meia-noite
           LOCAL (mesmo fix aplicado em MetasModule._agregarEsp). */
        var d = v.dataVenda
          ? new Date(String(v.dataVenda).slice(0, 10) + 'T00:00:00')
          : (v.created_at ? new Date(v.created_at) : null);
        if (!d) return false;
        return d >= periodo.inicio && d <= periodo.fim;
      });
    }

    /* Chamado #128 — uma venda por cliente. Duas linhas para o mesmo
       lead inflavam a contagem de vendas do Dashboard e distorciam o
       Ticket Médio, que é a média das mensalidades destas vendas. */
    if (typeof MetasModule !== 'undefined' && MetasModule._dedupVendasPorLead) {
      vds = MetasModule._dedupVendasPorLead(vds);
    }
    return vds;
  }

  /* v2.6 — Interações de carteira filtradas por período + usuário + fonte.
     Data usada: dataHora (data da interação). Usado pra contar
     RECOMENDAÇÕES (tipo='recomendacao') no NM. */
  static _getCarteiraFiltradaDashboard() {
    var itens = store.carteiraInteracoes || [];
    var setUsers  = FunilModule._filtroUsuariosDashboardSet();
    var setFontes = FunilModule._filtroFontesDashboardSet();

    if (setUsers)  itens = itens.filter(function(c) { return setUsers.has(c._esp_id); });
    if (setFontes) itens = itens.filter(function(c) { return FunilModule._eventoPassaFiltroFonte(c._lead_uuid, setFontes); });

    var periodo = FunilModule._resolverPeriodoDashboard();
    if (periodo) {
      itens = itens.filter(function(c) {
        var iso = c.dataHora;
        if (!iso) return false;
        var d = new Date(iso);
        return d >= periodo.inicio && d <= periodo.fim;
      });
    }
    return itens;
  }

  /* Resolve o período ativo do dropdown #nm-periodo.
     Retorna { inicio, fim } ou null se não conseguir. */
  static _resolverPeriodoDropdown() {
    var p = $('#nm-periodo').val();
    if (!p) return null;

    var agora = new Date();
    var inicio = new Date(agora);
    inicio.setHours(0, 0, 0, 0);

    switch (p) {
      case 'hoje':
        /* inicio já está em 00:00 hoje */
        break;

      case 'semana':
        /* Últimos 7 dias corridos */
        inicio.setDate(agora.getDate() - 7);
        break;

      case 'mes':
        /* Últimos 30 dias corridos */
        inicio.setDate(agora.getDate() - 30);
        break;

      case '90dias':
        /* v2.10 (T24) — Últimos 90 dias corridos */
        inicio.setDate(agora.getDate() - 90);
        break;

      case 'trimestre':
        /* v2.10 (T24) — Trimestre atual (Q1: jan-mar, Q2: abr-jun,
           Q3: jul-set, Q4: out-dez). Início: dia 1º do mês inicial
           do trimestre atual. */
        var mesAtual = agora.getMonth();  /* 0..11 */
        var mesInicioTri = Math.floor(mesAtual / 3) * 3;
        inicio.setMonth(mesInicioTri);
        inicio.setDate(1);
        break;

      case 'ano':
        /* v2.10 (T24) — Ano atual (1º de jan até agora) */
        inicio.setMonth(0);
        inicio.setDate(1);
        break;

      case 'ciclo':
        /* Ciclo de comissão: dia 26 do mês anterior até dia 25 do mês atual
           (padrão Beyond). Se hoje >= 26, o ciclo começou dia 26 deste mês.

           Chamado #122 — o código antigo fazia setMonth(-1) sobre uma
           data que ainda estava no DIA DE HOJE. Rodando num dia 31 (ou
           29/30), o mês alvo pode não ter esse dia e o JS normaliza pra
           frente (31/03 → setMonth(fev) → 03/03), fazendo o setDate(26)
           seguinte cair no MÊS ERRADO. Montamos pelo construtor, que
           independe do dia corrente e já trata virada de ano. */
        var _mesIniCiclo = (agora.getDate() >= 26) ? agora.getMonth() : agora.getMonth() - 1;
        inicio = new Date(agora.getFullYear(), _mesIniCiclo, 26, 0, 0, 0, 0);
        break;

      case 'custom':
        /* v2.10 (T24) — "Data personalizada" é tratada pelo drawer.
           Aqui retornamos null pra deixar o filtro do drawer (daterange
           periodoCustom) assumir. Se o drawer não tem daterange
           preenchido, o filtro fica "sem período" (mostra tudo). */
        return null;

      default:
        return null;
    }

    return { inicio: inicio, fim: agora };
  }

  /* v2.10 (T24) — Handler do dropdown de período do Dashboard.
     Substitui o antigo inline "renderNumeroMagico();atualizarKPIs()".
     Roteia entre:
       - "custom" → abre o drawer focando no campo daterange.
                    Se o drawer for fechado sem preencher, reverte
                    pra "Esta semana" (default).
       - demais   → re-renderiza NM + KPIs + FunilPreview direto. */
  static onPeriodoDashboardChange(valor) {
    if (valor === 'custom') {
      /* Abre o drawer avançado. Se o filtroDashboard ainda não foi
         montado (edge case), monta primeiro. */
      if (!FunilModule._filtroDashboard) FunilModule._montarFiltroDashboard();
      FunilModule._filtroDashboard.montar();
      FunilModule._filtroDashboard.abrir();

      /* Foco no campo daterange do periodoCustom pra facilitar o
         preenchimento. Timeout curto pra esperar o drawer abrir. */
      setTimeout(function() {
        $('[data-campo-input="periodoCustom"][data-parte="de"]').trigger('focus');
      }, 200);

      /* Reverte o dropdown pra semana quando o usuário fechar o drawer
         sem preencher datas. Verifica no próximo tick + repete até o
         drawer fechar. */
      var checkFecharDrawer = setInterval(function() {
        var drawerAberto = $('#filtro-dashboard-drawer').hasClass('fa-drawer-open');
        if (drawerAberto) return;
        clearInterval(checkFecharDrawer);
        var f = FunilModule._filtroDashboard.filtros;
        var temDataCustom = !!(f && f.periodoCustom && (f.periodoCustom.de || f.periodoCustom.ate));
        if (!temDataCustom) {
          /* Não preencheu — reverte pra semana */
          $('#nm-periodo').val('ciclo'); /* Chamado #79 — default = ciclo de comissão */
        }
      }, 500);
      return;
    }

    /* Opções normais — re-renderiza tudo */
    FunilModule.renderNumeroMagico();
    FunilModule.atualizarKPIs();
    FunilModule.renderFunilPreview();
    /* Chamado #78 — card de conversão também reage ao período. */
    if (typeof TaxaConversaoModule !== 'undefined' && TaxaConversaoModule.renderDashboardCard) {
      try { TaxaConversaoModule.renderDashboardCard(); }
      catch (e) { SLog.warn('renderDashboardCard período: ' + e.message); }
    }
  }

  /* ============================================================
     v2.5 — PACOTE 2 v1.4.0 — Feature 4.6 (RN-28)
     Reordenação manual via drag-and-drop
     ============================================================ */

  /* Espaçamento fracional: usa saltos de 10 pra permitir inserção
     entre 2 leads sem cascatear UPDATEs (novo valor = média dos
     vizinhos). Só rebalanceia quando a diferença fica < 1. */
  static _ORDEM_STEP = 10;

  /* Aplica ordem_manual em uma lista de leads.
     - Leads COM ordem_manual definida vão pro topo, sorted asc.
     - Leads SEM ordem_manual mantêm a ordem original (que já respeita
       a ordenação natural aplicada antes — created_at ou agendamento). */
  /* Chamado #27 — ordena por data de criação, MAIS NOVO NO TOPO.
     Determinístico (não depende da ordem do array). Usado em todas as
     colunas exceto Visita. Substitui o _aplicarOrdemManual nessas
     colunas: por decisão do cliente, a ordem é sempre de criação e o
     "reordenar arrastando dentro da coluna" (ordem_manual) é ignorado.
     (Arrastar ENTRE colunas pra mudar de etapa continua funcionando.) */
  static _ordenarPorCriacaoDesc(leads) {
    if (!leads || leads.length <= 1) return leads;
    return leads.slice().sort(function(a, b) {
      var ta = (a && a._createdAt) ? new Date(a._createdAt).getTime() : 0;
      var tb = (b && b._createdAt) ? new Date(b._createdAt).getTime() : 0;
      if (isNaN(ta)) ta = 0;
      if (isNaN(tb)) tb = 0;
      if (tb !== ta) return tb - ta;            /* mais novo primeiro */
      /* desempate estável por id (ids maiores = mais recentes) */
      return String((b && b.id) || '').localeCompare(String((a && a.id) || ''));
    });
  }

  static _aplicarOrdemManual(leads) {
    if (!leads || leads.length <= 1) return leads;

    var comOrdem = [];
    var semOrdem = [];
    leads.forEach(function(l) {
      if (l.ordem_manual != null && l.ordem_manual !== '') {
        comOrdem.push(l);
      } else {
        semOrdem.push(l);
      }
    });

    if (!comOrdem.length) return leads; /* nada mudou */

    comOrdem.sort(function(a, b) {
      return Number(a.ordem_manual) - Number(b.ordem_manual);
    });

    return comOrdem.concat(semOrdem);
  }

  /* Ativa SortableJS em cada coluna. Idempotente — destrói instância
     anterior antes de criar nova (evita listeners duplicados). */
  static _sortableInstances = [];
  static _ativarDragDrop() {
    if (typeof Sortable === 'undefined') {
      SLog.warn('Funil: SortableJS não carregado — drag desabilitado');
      return;
    }

    /* Destrói instâncias anteriores */
    FunilModule._sortableInstances.forEach(function(s) { try { s.destroy(); } catch(e) {} });
    FunilModule._sortableInstances = [];

    /* Modo seleção múltipla desliga drag — ações conflitantes no mesmo card */
    if (FunilModule._modoSelecao === true) {
      SLog.info('Funil: drag desativado (modo seleção ativo)');
      return;
    }

    $('#kanban-board .k-col-body').each(function() {
      var el = this;
      var $col = $(el).closest('.k-col');
      /* Extrai etapa via posição — pega o header pra ler o label ou usa
         index. Como o board segue STAGE_ORDER exato, uso o index. */
      var idx = $('#kanban-board .k-col').index($col);
      var etapa = STAGE_ORDER[idx];
      if (!etapa) return;

      var s = new Sortable(el, {
        group: 'kanban-' + etapa,     /* isolado por etapa — bloqueia drag entre colunas */
        animation: 150,
        ghostClass: 'k-card-ghost',
        chosenClass: 'k-card-chosen',
        dragClass: 'k-card-dragging',
        handle: '.k-card',
        filter: '.k-card-checkbox, .k-empty',  /* click no checkbox NÃO inicia drag */
        preventOnFilter: false,
        onEnd: function(evt) {
          if (evt.oldIndex === evt.newIndex) return; /* nada mudou */
          FunilModule._onDropCard(etapa, evt.item, evt.newIndex);
        },
      });
      FunilModule._sortableInstances.push(s);
    });
  }

  /* Chamado após um drop bem-sucedido. Calcula nova ordem_manual
     pro card movido baseada nos vizinhos, atualiza local e persiste. */
  static async _onDropCard(etapa, itemEl, newIndex) {
    var leadUuid = $(itemEl).attr('data-lead-uuid');
    var leadCodigo = $(itemEl).attr('data-lead-id');
    if (!leadUuid) {
      SLog.warn('Drop: card sem data-lead-uuid — ignorando');
      return;
    }

    var lead = store.leads.find(function(l) { return l._uuid === leadUuid; });
    if (!lead) { SLog.warn('Drop: lead não encontrado — ' + leadUuid); return; }

    /* Lê os cards vizinhos no DOM (antes e depois) pra calcular nova ordem */
    var $body = $(itemEl).parent('.k-col-body');
    var $vizinhos = $body.children('.k-card');
    var $antes  = $vizinhos.eq(newIndex - 1);
    var $depois = $vizinhos.eq(newIndex + 1);

    var vizinhoAntesUuid  = $antes.length  ? $antes.attr('data-lead-uuid')  : null;
    var vizinhoDepoisUuid = $depois.length ? $depois.attr('data-lead-uuid') : null;

    var leadAntes  = vizinhoAntesUuid  ? store.leads.find(function(l) { return l._uuid === vizinhoAntesUuid; })  : null;
    var leadDepois = vizinhoDepoisUuid ? store.leads.find(function(l) { return l._uuid === vizinhoDepoisUuid; }) : null;

    /* Se o vizinho não tem ordem_manual, precisamos criar uma pra ele
       ANTES de calcular a do card movido. Fazemos isso preenchendo
       ordens em toda a coluna baseadas na posição atual do DOM.
       Isso é simples e evita edge-cases com fracional. */
    var updates = FunilModule._calcularOrdensDaColuna($vizinhos);

    /* Update local + persistir em lote */
    updates.forEach(function(u) {
      var l = store.leads.find(function(x) { return x._uuid === u.uuid; });
      if (l) l.ordem_manual = u.ordem;
    });

    /* Persiste no banco */
    var ok = await FunilModule._persistirOrdensLote(updates);
    if (!ok) {
      /* Rollback local + re-render */
      SLog.warn('Drop: falha ao persistir — revertendo');
      Toast.show('Erro ao salvar nova ordem — recarregando.', 'danger');
      /* Recarrega dados do banco pra garantir consistência */
      if (typeof SupabaseSync !== 'undefined' && SupabaseSync.carregarLeads) {
        await SupabaseSync.carregarLeads();
      }
      FunilModule.renderKanban();
      return;
    }

    SLog.info('Drop: ordem persistida — lead ' + leadCodigo + ' movido para posição ' + newIndex);
  }

  /* Calcula ordem_manual para todos os cards da coluna a partir da
     posição atual no DOM. Usa saltos de _ORDEM_STEP (10 por padrão)
     pra deixar espaço fracional. */
  static _calcularOrdensDaColuna($cards) {
    var updates = [];
    $cards.each(function(i) {
      var uuid = $(this).attr('data-lead-uuid');
      if (!uuid) return;
      updates.push({ uuid: uuid, ordem: (i + 1) * FunilModule._ORDEM_STEP });
    });
    return updates;
  }

  /* Persiste um lote de {uuid, ordem} no banco.
     Usa UPDATE individual em série (Supabase não tem batch UPDATE
     direto sem RPC). Para colunas grandes (>50 leads), é aceitável
     mas seria melhor via RPC. */
  static async _persistirOrdensLote(updates) {
    if (!supa) return false;
    if (!updates || !updates.length) return true;

    try {
      for (var i = 0; i < updates.length; i++) {
        var res = await supa.from('leads')
          .update({ ordem_manual: updates[i].ordem })
          .eq('id', updates[i].uuid);
        if (res.error) {
          SLog.error('DB UPDATE ordem_manual: ' + res.error.message);
          return false;
        }
      }
      SLog.info('DB UPDATE ordem_manual: ' + updates.length + ' lead(s) ✓');
      return true;
    } catch (e) {
      SLog.error('_persistirOrdensLote exceção: ' + e.message);
      return false;
    }
  }
}
