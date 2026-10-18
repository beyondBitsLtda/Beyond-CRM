/* ============================================================
   BEYOND CRM — js/modules/TaxaConversaoModule.js   v1.0
   Feature 5.2 — Taxa de Conversão por Etapa do Funil
   Requisitos: DRS 4.1.5 (card Dashboard) + DRS 4.6 (relatório completo)

   Renderização em duas superfícies:
   1. Card compacto no Dashboard (todos os perfis)
   2. Seção completa em Relatórios (dentro de #secao-relatorios-gerente)

   Beyond Bits Tecnologia © 2026
   ============================================================ */
'use strict';

class TaxaConversaoModule {

  /* ── Config ─────────────────────────────────────────────── */
  static ETAPAS = ['lead', 'ligacao', 'agendamento', 'visita', 'venda', 'carteira'];

  static LABELS = {
    lead:        'Lead',
    ligacao:     'Ligação',
    agendamento: 'Agendamento',
    visita:      'Visita',
    venda:       'Venda',
    carteira:    'Carteira',
  };

  /* Metas derivadas de META_CONVERSAO (20-12-4-2-1-3): % esperada em cada transição */
  /* Chamado #44 — valores PADRÃO (fallback). A config real vem de
     store.metasConversao (tabela config_metas_conversao), editável
     pelo gerente. Use SEMPRE TaxaConversaoModule._metas() pra ler,
     nunca TaxaConversaoModule.METAS_PADRAO direto. */
  static METAS_PADRAO = {
    lead_ligacao:     100.0,  /* chamado #50: todo lead captado deve receber tentativa de ligação */
    ligacao_agendam:  33.3,   /* 4/12 */
    agendam_visita:   50.0,   /* 2/4 */
    visita_venda:     50.0,   /* 1/2 */
    venda_carteira:   100.0,  /* toda venda vira carteira */
  };

  /* Retorna as metas vigentes: config global se existir, senão o padrão. */
  static _metas() {
    var cfg = (typeof store !== 'undefined') ? store.metasConversao : null;
    if (cfg && typeof cfg === 'object') {
      return {
        lead_ligacao:    (cfg.lead_ligacao    != null) ? cfg.lead_ligacao    : TaxaConversaoModule.METAS_PADRAO.lead_ligacao,
        ligacao_agendam: (cfg.ligacao_agendam != null) ? cfg.ligacao_agendam : TaxaConversaoModule.METAS_PADRAO.ligacao_agendam,
        agendam_visita:  (cfg.agendam_visita  != null) ? cfg.agendam_visita  : TaxaConversaoModule.METAS_PADRAO.agendam_visita,
        visita_venda:    (cfg.visita_venda    != null) ? cfg.visita_venda    : TaxaConversaoModule.METAS_PADRAO.visita_venda,
        venda_carteira:  (cfg.venda_carteira  != null) ? cfg.venda_carteira  : TaxaConversaoModule.METAS_PADRAO.venda_carteira,
      };
    }
    return TaxaConversaoModule.METAS_PADRAO;
  }

  /* ================================================================
     Chamado #44 — UI de configuração das metas de conversão
     ================================================================
     Só o gerente vê o card (mostrado por _prepararConfigMetas).
     Os valores atuais preenchem os inputs; salvarMetasConversao faz
     o upsert e atualiza store.metasConversao pra refletir na hora. */

  /* Mostra o card só pra gerente e popula os inputs. Deve ser chamado
     ao entrar na tela de Configurações. */
  static _prepararConfigMetas() {
    var $card = $('#config-metas-conversao');
    if (!$card.length) return;

    var ehGerente = (typeof AuthService !== 'undefined' &&
                     AuthService.currentProfile &&
                     AuthService.currentProfile.perfil === 'gerente');
    if (!ehGerente) { $card.hide(); return; }
    $card.show();

    var M = TaxaConversaoModule._metas();
    $('#cmc-lead-ligacao').val(M.lead_ligacao);
    $('#cmc-ligacao-agendam').val(M.ligacao_agendam);
    $('#cmc-agendam-visita').val(M.agendam_visita);
    $('#cmc-visita-venda').val(M.visita_venda);
    $('#cmc-venda-carteira').val(M.venda_carteira);
  }

  static async salvarMetasConversao() {
    /* Lê e valida os 5 valores (0 a 1000%) */
    var campos = [
      ['lead_ligacao',    '#cmc-lead-ligacao'],
      ['ligacao_agendam', '#cmc-ligacao-agendam'],
      ['agendam_visita',  '#cmc-agendam-visita'],
      ['visita_venda',    '#cmc-visita-venda'],
      ['venda_carteira',  '#cmc-venda-carteira'],
    ];
    var payload = {};
    for (var i = 0; i < campos.length; i++) {
      var val = parseFloat(String($(campos[i][1]).val()).replace(',', '.'));
      if (isNaN(val) || val < 0 || val > 1000) {
        Utils.marcarInvalido(campos[i][1], true);
        Toast.show('Meta inválida em "' + campos[i][0] + '" (0 a 1000%).', 'warning');
        return;
      }
      payload[campos[i][0]] = Math.round(val * 10) / 10;   /* 1 casa decimal */
    }

    if (!supa) { Toast.show('Sem conexão com o banco.', 'danger'); return; }

    try {
      var meuUid = (AuthService.currentProfile && AuthService.currentProfile.id) || null;
      var res = await supa.from('config_metas_conversao').upsert({
        id: 1,
        lead_ligacao:    payload.lead_ligacao,
        ligacao_agendam: payload.ligacao_agendam,
        agendam_visita:  payload.agendam_visita,
        visita_venda:    payload.visita_venda,
        venda_carteira:  payload.venda_carteira,
        atualizado_em:   new Date().toISOString(),
        atualizado_por:  meuUid,
      }, { onConflict: 'id' }).select().single();

      if (res.error) {
        SLog.error('salvarMetasConversao: ' + res.error.message);
        Toast.show('Erro ao salvar: ' + res.error.message, 'danger');
        return;
      }
      /* Atualiza store local pra o relatório refletir sem F5 */
      store.metasConversao = {
        lead_ligacao:    payload.lead_ligacao,
        ligacao_agendam: payload.ligacao_agendam,
        agendam_visita:  payload.agendam_visita,
        visita_venda:    payload.visita_venda,
        venda_carteira:  payload.venda_carteira,
      };
      SLog.info('config_metas_conversao: salva ✓');
      Toast.show('Metas de conversão atualizadas!', 'success');

      /* Re-renderiza o relatório se estiver aberto */
      if (typeof TaxaConversaoModule.renderRelatorio === 'function') {
        try { TaxaConversaoModule.renderRelatorio(); } catch (e) {}
      }
    } catch (err) {
      SLog.error('salvarMetasConversao exceção: ' + err.message);
      Toast.show('Erro ao salvar: ' + err.message, 'danger');
    }
  }

  /* Limiar de gargalo: taxa/meta abaixo disso = destacado como gargalo */
  static GARGALO_THRESHOLD = 0.70;

  /* ── Conversões-chave do especialista (chamado #50) ──────────
     Calculadas por EVENTO (store.ligacoes / store.vendas /
     store.carteiraInteracoes), NÃO por ocupação de etapa.
     Base sempre = leads captados no período/filtros.
       - Lead→Ligação:       100%  (todo lead deve receber tentativa)
       - Lead→Contato:        60%  (contato = falou e expôs o script,
                                    tipo_contato==='contato')
       - Venda→Recomendação: 500%  (5 recomendações por venda) */
  static META_CHAVE_LIGACAO      = 100.0;
  static META_CHAVE_CONTATO      = 60.0;
  static META_CHAVE_RECOMENDACAO = 500.0;

  /* ================================================================
     CÁLCULO CORE
     ================================================================ */

  /**
   * Calcula quantos leads passaram por cada etapa (cumulativo).
   * cumulativo[X] = qtd. de leads que estão em X ou em qualquer etapa depois.
   */
  static _cumulativos(leadsArr) {
    const idx = {};
    TaxaConversaoModule.ETAPAS.forEach((e, i) => { idx[e] = i; });
    const totais = {};
    TaxaConversaoModule.ETAPAS.forEach(e => { totais[e] = 0; });

    (leadsArr || []).forEach(l => {
      const meuIdx = idx[l.etapa];
      if (meuIdx === undefined) return;
      for (let i = 0; i <= meuIdx; i++) {
        totais[TaxaConversaoModule.ETAPAS[i]]++;
      }
    });
    return totais;
  }

  /**
   * Calcula transições etapa->etapa com taxa real, meta e flag de gargalo.
   */
  static calcular(leadsArr) {
    const cum = TaxaConversaoModule._cumulativos(leadsArr);
    const M = TaxaConversaoModule._metas();   /* Chamado #44: config global c/ fallback */
    const definicoes = [
      { key: 'lead_ligacao',    de: 'lead',        para: 'ligacao',     meta: M.lead_ligacao },
      { key: 'ligacao_agendam', de: 'ligacao',     para: 'agendamento', meta: M.ligacao_agendam },
      { key: 'agendam_visita',  de: 'agendamento', para: 'visita',      meta: M.agendam_visita },
      { key: 'visita_venda',    de: 'visita',      para: 'venda',       meta: M.visita_venda },
      { key: 'venda_carteira',  de: 'venda',       para: 'carteira',    meta: M.venda_carteira },
    ];

    return definicoes.map(t => {
      const qtdDe    = cum[t.de]   || 0;
      const qtdPara  = cum[t.para] || 0;
      const taxa     = qtdDe > 0 ? (qtdPara / qtdDe) * 100 : 0;
      const razaoMeta = t.meta > 0 ? taxa / t.meta : 0;
      const isGargalo = qtdDe > 0 && razaoMeta < TaxaConversaoModule.GARGALO_THRESHOLD;
      return {
        key: t.key,
        deKey: t.de, paraKey: t.para,
        deLabel:   TaxaConversaoModule.LABELS[t.de],
        paraLabel: TaxaConversaoModule.LABELS[t.para],
        qtdDe, qtdPara,
        taxa, meta: t.meta, razaoMeta,
        isGargalo,
      };
    });
  }

  /**
   * Retorna a transição de maior queda relativa à meta (gargalo principal).
   */
  static identificarGargaloPrincipal(transicoes) {
    const validas = (transicoes || []).filter(t => t.qtdDe > 0);
    if (!validas.length) return null;
    return validas.reduce((pior, t) => (t.razaoMeta < pior.razaoMeta ? t : pior), validas[0]);
  }

  /* ════════════════════════════════════════════════════════════
     Chamado #78 — Conversão entre etapas no DASHBOARD
     ════════════════════════════════════════════════════════════
     Dois problemas corrigidos aqui (sem alterar o cálculo cumulativo
     usado no relatório, que segue válido):

     1) RESPEITA O FILTRO — este método recebe as bases JÁ filtradas
        pelo dashboard (usuário + período + fonte). O renderDashboardCard
        passa a chamá-lo em vez de calcular(store.leads) cru.

     2) C2 e DELAY NÃO CONTAM COMO VISITA — as taxas agendamento→visita
        e visita→venda deixam de se basear na OCUPAÇÃO de etapa (que não
        distingue o resultado da visita) e passam a se basear nos
        REGISTROS de visita (store.visitas), contando como "visita
        presencial real" apenas os resultados 'nao_fechou' e 'venda'.
        C2 e delay são excluídos do numerador/denominador dessas taxas.

     Definições (regra do cliente):
       • agendamento → visita = visitas presenciais ÷ agendamentos
       • visita → venda       = vendas ÷ visitas presenciais
       onde visita presencial = tipo_resultado ∈ {'nao_fechou','venda'}.

     As outras 3 taxas (lead→ligação, ligação→agendamento,
     venda→carteira) são mantidas do cálculo cumulativo original
     (calcular), apenas usando os leads filtrados.

     Params: objetos já filtrados —
       { leads, agendamentos, visitas, vendas }
     ──────────────────────────────────────────────────────────── */
  static VISITA_PRESENCIAL = ['nao_fechou', 'venda'];

  static calcularDashboard(bases) {
    bases = bases || {};
    var leads        = bases.leads        || [];
    var agendamentos = bases.agendamentos || [];
    var visitas      = bases.visitas      || [];
    var vendas       = bases.vendas       || [];

    /* Base: as 3 taxas mantidas vêm do cálculo cumulativo sobre os
       leads filtrados (mesma lógica de sempre). */
    var baseTrans = TaxaConversaoModule.calcular(leads);
    var M = TaxaConversaoModule._metas();

    /* Contagens por EVENTO (já filtradas). */
    var qtdAgendamentos = agendamentos.length;
    var qtdVisitasPresenciais = visitas.filter(function(v) {
      return TaxaConversaoModule.VISITA_PRESENCIAL.indexOf(v.tipoResultado) >= 0;
    }).length;
    var qtdVendas = vendas.length;

    /* Helper pra montar o objeto de transição no mesmo formato que
       _barraCompacta espera. */
    function montarTransicao(key, deKey, paraKey, qtdDe, qtdPara, meta) {
      var taxa = qtdDe > 0 ? (qtdPara / qtdDe) * 100 : 0;
      var razaoMeta = meta > 0 ? taxa / meta : 0;
      var isGargalo = qtdDe > 0 && razaoMeta < TaxaConversaoModule.GARGALO_THRESHOLD;
      return {
        key: key,
        deKey: deKey, paraKey: paraKey,
        deLabel:   TaxaConversaoModule.LABELS[deKey],
        paraLabel: TaxaConversaoModule.LABELS[paraKey],
        qtdDe: qtdDe, qtdPara: qtdPara,
        taxa: taxa, meta: meta, razaoMeta: razaoMeta,
        isGargalo: isGargalo,
      };
    }

    /* Sobrescreve as 2 taxas de visita por versões baseadas em evento. */
    var transVisita = {
      agendam_visita: montarTransicao(
        'agendam_visita', 'agendamento', 'visita',
        qtdAgendamentos, qtdVisitasPresenciais, M.agendam_visita
      ),
      visita_venda: montarTransicao(
        'visita_venda', 'visita', 'venda',
        qtdVisitasPresenciais, qtdVendas, M.visita_venda
      ),
    };

    /* Substitui no array base, preservando a ordem original. */
    return baseTrans.map(function(t) {
      if (t.key === 'agendam_visita') return transVisita.agendam_visita;
      if (t.key === 'visita_venda')   return transVisita.visita_venda;
      return t;
    });
  }

  /* ================================================================
     RENDER: CARD DO DASHBOARD (DRS 4.1.5)
     ================================================================ */
  static renderDashboardCard() {
    const $c = $('#dash-visao-funil');
    if (!$c.length) return;

    /* Chamado #78 — usa as bases JÁ filtradas pelo dashboard (usuário +
       período + fonte) e o cálculo por evento (calcularDashboard), que
       trata C2/delay como não-visita nas taxas de visita. Antes usava
       calcular(store.leads) cru — ignorava o filtro e contava C2/delay
       como visita. Guarda defensiva: se os helpers do FunilModule não
       existirem, cai nos arrays completos do store.

       Chamado #109 — incluirArquivados:true na base de leads, pra que
       as 3 transições calculadas a partir de leads (Lead→Ligação,
       Ligação→Agendamento, Venda→Carteira) considerem também os leads
       arquivados, não só os ativos. As outras 2 transições
       (Agendamento→Visita, Visita→Venda) já vêm de agendamentos/
       visitas/vendas — esses arrays nunca excluíram eventos de leads
       arquivados (não há esse filtro nos helpers abaixo), então já
       incluíam tudo; nenhuma mudança precisou ser feita ali. */
    const bases = TaxaConversaoModule._calcularBasesDashboard(true);
    const trans = TaxaConversaoModule.calcularDashboard(bases);
    const temDados = trans.some(t => t.qtdDe > 0);

    if (!temDados) {
      $c.html(`
        <div class="amp-card">
          <div class="amp-card-header">
            <div class="amp-card-title"><i class="bi bi-funnel-fill me-1"></i> Visão do Funil</div>
          </div>
          <div style="padding:24px;text-align:center;color:var(--d-txt-6b7280);font-size:13px;">
            Nenhum lead no funil no momento.
          </div>
        </div>`);
      return;
    }

    const html = `
      <div class="amp-card">
        <div class="amp-card-header">
          <div class="amp-card-title"><i class="bi bi-funnel-fill me-1"></i> Visão do Funil — Conversão entre etapas</div>
          <!-- Chamado #109 — comparação lado a lado das % sem/com arquivados -->
          <button class="btn-beyond btn-secondary-amp btn-sm-amp" onclick="TaxaConversaoModule.abrirDetalheVisaoFunil()">Ver detalhado</button>
        </div>
        <div style="padding:14px 16px;">
          ${trans.map(t => TaxaConversaoModule._barraCompacta(t)).join('')}
        </div>
      </div>`;
    $c.html(html);
  }

  /* Chamado #78/#109 — monta as bases (leads/agendamentos/visitas/vendas)
     já filtradas pelo dashboard (usuário + período + fonte), usadas por
     calcularDashboard. Extraído pra um helper único, parametrizado por
     `incluirArquivados`, pra que o card resumido e o modal "Ver
     detalhado" (abrirDetalheVisaoFunil) nunca divirjam entre si.
     Guarda defensiva: se os helpers do FunilModule não existirem, cai
     nos arrays completos do store. */
  static _calcularBasesDashboard(incluirArquivados) {
    var _FM = (typeof FunilModule !== 'undefined') ? FunilModule : null;
    return {
      leads:        (_FM && _FM._getLeadsFiltradosDashboard)        ? _FM._getLeadsFiltradosDashboard({ ignorarPeriodo: false, incluirArquivados: !!incluirArquivados }) : (store.leads || []),
      agendamentos: (_FM && _FM._getAgendamentosFiltradosDashboard) ? _FM._getAgendamentosFiltradosDashboard() : (store.agendamentos || []),
      visitas:      (_FM && _FM._getVisitasFiltradasDashboard)      ? _FM._getVisitasFiltradasDashboard()      : (store.visitas || []),
      vendas:       (_FM && _FM._getVendasFiltradasDashboard)       ? _FM._getVendasFiltradasDashboard()       : (store.vendas || []),
    };
  }

  /* Chamado #109 — botão "Ver detalhado" do card "Visão do Funil":
     mostra, transição por transição, a quantidade e a % tanto SEM
     quanto COM arquivados, lado a lado (mesmo padrão do "Ver
     detalhado" do card "Leads no Funil", chamado #108). As transições
     Agendamento→Visita e Visita→Venda vêm de registros de evento
     (agendamentos/visitas), que nunca excluíram arquivados — por isso
     aparecem iguais nas duas colunas, o que já é esperado. */
  static abrirDetalheVisaoFunil() {
    const $body = $('#visao-funil-detalhado-body');
    if (!$body.length) return;

    const transAtivos       = TaxaConversaoModule.calcularDashboard(TaxaConversaoModule._calcularBasesDashboard(false));
    const transComArquivados = TaxaConversaoModule.calcularDashboard(TaxaConversaoModule._calcularBasesDashboard(true));

    const linhas = transAtivos.map((t, i) => {
      const c = transComArquivados[i] || t;
      return `
        <tr>
          <td>${t.deLabel} → ${t.paraLabel}</td>
          <td style="text-align:center;">${t.qtdDe} → ${t.qtdPara}</td>
          <td style="text-align:center;">${t.taxa.toFixed(1)}%</td>
          <td style="text-align:center;">${c.qtdDe} → ${c.qtdPara}</td>
          <td style="text-align:center;">${c.taxa.toFixed(1)}%</td>
        </tr>`;
    }).join('');

    $body.html(`
      <div class="table-wrap">
        <table class="amp-table">
          <thead>
            <tr>
              <th>Transição</th>
              <th style="text-align:center;">Qtd. (sem arquivados)</th>
              <th style="text-align:center;">% sem arquivados</th>
              <th style="text-align:center;">Qtd. (c/ arquivados)</th>
              <th style="text-align:center;">% com arquivados</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
      <p class="small text-muted mt-2 mb-0">"% sem arquivados" usa só leads ativos (o cálculo antes do chamado #109). "% com arquivados" é o que o card resumido mostra hoje. Agendamento→Visita e Visita→Venda vêm de registros de visita/agendamento, que nunca excluíram arquivados — por isso aparecem iguais nas duas colunas.</p>`);

    if (typeof openModal === 'function') openModal('modal-visao-funil-detalhado');
    else if (typeof Modal !== 'undefined') Modal.abrir('modal-visao-funil-detalhado');
  }

  static _barraCompacta(t) {
    const cor = t.isGargalo ? BX_COR.accent : (t.razaoMeta >= 1 ? '#10A64A' : '#F59E0B');
    const badge = t.isGargalo ? ' <span style="color:var(--d-txt-d91a3c);font-weight:700;">🚧</span>' : '';
    return `
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
          <span><strong>${t.deLabel} → ${t.paraLabel}</strong>${badge}</span>
          <span style="color:${cor};font-weight:700;">${t.taxa.toFixed(1)}%</span>
        </div>
        <div style="height:8px;background:var(--d-bgc-e5e7eb);border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${Math.min(t.taxa, 100)}%;background:${cor};"></div>
        </div>
        <div style="font-size:10px;color:var(--d-txt-6b7280);margin-top:2px;">
          ${t.qtdDe} → ${t.qtdPara} · meta ${t.meta.toFixed(0)}%
        </div>
      </div>`;
  }

  /* ================================================================
     RENDER: SEÇÃO COMPLETA EM RELATÓRIOS (DRS 4.6)
     ================================================================ */
  static renderRelatorio() {
    const $wrap = $('#rel-taxa-conversao');
    if (!$wrap.length) return;

    /* Popular selects na primeira vez */
    TaxaConversaoModule._popularFiltros();

    /* Aplicar filtros e calcular */
    const leadsFiltrados = TaxaConversaoModule._aplicarFiltros(store.leads || []);
    const trans = TaxaConversaoModule.calcular(leadsFiltrados);
    const gargalo = TaxaConversaoModule.identificarGargaloPrincipal(trans);

    /* Grid principal */
    const $grid = $('#rel-taxa-conversao-grid');
    if ($grid.length) {
      if (!leadsFiltrados.length) {
        $grid.html('<div style="padding:32px;text-align:center;color:var(--d-txt-6b7280);">Nenhum lead no período/filtros selecionados.</div>');
      } else {
        $grid.html(
          TaxaConversaoModule._renderBlocoChave(leadsFiltrados) +
          trans.map(t => TaxaConversaoModule._barraCompleta(t)).join('')
        );
      }
    }

    /* Card de resumo */
    const $resumo = $('#rel-taxa-conversao-resumo');
    if ($resumo.length) {
      const carteira    = trans[trans.length - 1] || { qtdPara: 0 };
      const totalConv   = carteira.qtdPara;
      const totalPeriodo = leadsFiltrados.length;
      const recPorVenda = TaxaConversaoModule._recomendacoesPorVenda(leadsFiltrados);

      $resumo.html(`
        <div class="row g-3">
          <div class="col-md-3">
            <div style="padding:14px;background:var(--d-bgc-fef3c7);border-radius:8px;text-align:center;border:1px solid var(--d-brd-fde68a);">
              <div style="font-size:11px;color:var(--d-txt-92400e);text-transform:uppercase;letter-spacing:.5px;">Gargalo principal</div>
              <div style="font-weight:700;color:var(--d-txt-92400e);margin-top:6px;font-size:14px;">
                ${gargalo ? gargalo.deLabel + ' → ' + gargalo.paraLabel : '—'}
              </div>
              <div style="font-size:11px;color:var(--d-txt-92400e);margin-top:2px;">
                ${gargalo ? gargalo.taxa.toFixed(1) + '% (meta ' + gargalo.meta.toFixed(0) + '%)' : ''}
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div style="padding:14px;background:var(--d-bgc-d1fae5);border-radius:8px;text-align:center;border:1px solid var(--d-brd-a7f3d0);">
              <div style="font-size:11px;color:var(--d-txt-065f46);text-transform:uppercase;letter-spacing:.5px;">Convertidos</div>
              <div style="font-weight:700;color:var(--d-txt-065f46);margin-top:6px;font-size:22px;">${totalConv}</div>
              <div style="font-size:11px;color:var(--d-txt-065f46);">viraram carteira</div>
            </div>
          </div>
          <div class="col-md-3">
            <div style="padding:14px;background:var(--d-bgc-dbeafe);border-radius:8px;text-align:center;border:1px solid var(--d-brd-bfdbfe);">
              <div style="font-size:11px;color:var(--d-txt-1e40af);text-transform:uppercase;letter-spacing:.5px;">Total no período</div>
              <div style="font-weight:700;color:var(--d-txt-1e40af);margin-top:6px;font-size:22px;">${totalPeriodo}</div>
              <div style="font-size:11px;color:var(--d-txt-1e40af);">leads captados</div>
            </div>
          </div>
          <div class="col-md-3">
            <div style="padding:14px;background:var(--d-bgc-ede9fe);border-radius:8px;text-align:center;border:1px solid var(--d-brd-ddd6fe);">
              <div style="font-size:11px;color:var(--d-txt-5b21b6);text-transform:uppercase;letter-spacing:.5px;">Recomendações/Venda</div>
              <div style="font-weight:700;color:var(--d-txt-5b21b6);margin-top:6px;font-size:22px;">${recPorVenda.toFixed(1)}</div>
              <div style="font-size:11px;color:var(--d-txt-5b21b6);">meta: 5.0</div>
            </div>
          </div>
        </div>`);
    }
  }

  static _barraCompleta(t) {
    const cor        = t.isGargalo ? BX_COR.accent : (t.razaoMeta >= 1 ? '#10A64A' : '#F59E0B');
    const badgeGarg  = t.isGargalo
      ? '<span style="background:var(--d-bgc-fee2e2);color:var(--d-txt-991b1b);padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;margin-left:8px;">🚧 GARGALO</span>'
      : '';
    const iconStatus = t.razaoMeta >= 1 ? '<i class="bi bi-check-circle-fill" style="color:var(--d-txt-10a64a);"></i>'
                     : t.isGargalo      ? '<i class="bi bi-x-circle-fill" style="color:var(--d-txt-d91a3c);"></i>'
                                        : '<i class="bi bi-exclamation-triangle-fill" style="color:var(--d-txt-f59e0b);"></i>';

    return `
      <div style="padding:16px;background:var(--d-bgc-f9fafb);border-radius:8px;margin-bottom:14px;border:1px solid var(--d-brd-e5e7eb);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div>
            ${iconStatus}
            <strong style="font-size:14px;margin-left:6px;">${t.deLabel} → ${t.paraLabel}</strong>
            ${badgeGarg}
          </div>
          <div style="font-size:24px;font-weight:700;color:${cor};line-height:1;">${t.taxa.toFixed(1)}%</div>
        </div>

        <!-- Barra dupla: meta cinza atrás, real colorido na frente -->
        <div style="position:relative;height:14px;background:var(--d-bgc-e5e7eb);border-radius:7px;overflow:hidden;margin-bottom:8px;">
          <div style="position:absolute;height:100%;width:${Math.min(t.meta, 100)}%;background:var(--d-bgc-9ca3af);opacity:0.35;"
               title="Meta: ${t.meta.toFixed(1)}%"></div>
          <div style="position:absolute;height:100%;width:${Math.min(t.taxa, 100)}%;background:${cor};transition:width .3s;"></div>
        </div>

        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--d-txt-6b7280);">
          <span>
            <strong style="color:var(--d-txt-374151);">${t.qtdDe}</strong> leads em ${t.deLabel} →
            <strong style="color:var(--d-txt-374151);">${t.qtdPara}</strong> avançaram para ${t.paraLabel}
          </span>
          <span>Meta: <strong>${t.meta.toFixed(1)}%</strong></span>
        </div>
      </div>`;
  }

  /* ================================================================
     CONVERSÕES-CHAVE (chamado #50) — cálculo por EVENTO
     ================================================================
     Base = leads captados (o conjunto já filtrado por esp/filial/
     período). Os eventos são associados pela pessoa, via _uuid do
     lead == _lead_uuid do evento. Assim respondemos exatamente:
     "dos leads que captei, com quantos consegui ligação/contato,
      e quantas vendas/recomendações vieram deles".
     ================================================================ */

  /* Set com os _uuid dos leads do conjunto (base do cálculo). */
  static _setUuidsLeads(leadsArr) {
    const s = new Set();
    (leadsArr || []).forEach(l => { if (l._uuid) s.add(l._uuid); });
    return s;
  }

  /**
   * Retorna as 3 conversões-chave já calculadas para o conjunto de leads.
   * Cada item: { key, label, sub, taxa, meta, valorFmt }.
   * Chamado #112 — aceita `fontes` opcional { ligacoes, vendas, carteiraInteracoes }:
   * quando passado (export Excel busca o histórico completo direto do
   * banco), usa esses arrays em vez de store.X (capados no cache de
   * boot). Sem o parâmetro, o card do dashboard/relatório em tela
   * continua idêntico.
   */
  static _conversoesChave(leadsFiltrados, fontes) {
    fontes = fontes || {};
    const ligacoesArr = fontes.ligacoes || store.ligacoes || [];
    const vendasArr   = fontes.vendas   || store.vendas   || [];
    const carteiraArr = fontes.carteiraInteracoes || store.carteiraInteracoes || [];

    const setUuids   = TaxaConversaoModule._setUuidsLeads(leadsFiltrados);
    const totalLeads = setUuids.size;

    /* Leads distintos com ≥1 ligação (qualquer resultado) e com contato. */
    const comLigacao = new Set();
    const comContato = new Set();
    ligacoesArr.forEach(lg => {
      const uid = lg._lead_uuid;
      if (!uid || !setUuids.has(uid)) return;
      comLigacao.add(uid);
      if (lg.tipo_contato === 'contato') comContato.add(uid);
    });

    /* Vendas e recomendações dos leads do conjunto. */
    const totalVendas = vendasArr.filter(v =>
      v._lead_uuid && setUuids.has(v._lead_uuid)
    ).length;

    const totalRecomend = carteiraArr.filter(c =>
      c.tipo === 'recomendacao' && c._lead_uuid && setUuids.has(c._lead_uuid)
    ).length;

    const taxaLig  = totalLeads  > 0 ? (comLigacao.size / totalLeads)  * 100 : 0;
    const taxaCont = totalLeads  > 0 ? (comContato.size / totalLeads)  * 100 : 0;
    const taxaRec  = totalVendas > 0 ? (totalRecomend   / totalVendas) * 100 : 0;
    const recPorVenda = totalVendas > 0 ? (totalRecomend / totalVendas) : 0;

    return [
      {
        key: 'lead_ligacao_ev',
        label: 'Lead → Ligação',
        sub: `${comLigacao.size} de ${totalLeads} leads receberam tentativa de ligação`,
        taxa: taxaLig, meta: TaxaConversaoModule.META_CHAVE_LIGACAO,
        valorFmt: taxaLig.toFixed(1) + '%',
      },
      {
        key: 'lead_contato_ev',
        label: 'Lead → Contato',
        sub: `${comContato.size} de ${totalLeads} leads viraram contato (falou e expôs o script)`,
        taxa: taxaCont, meta: TaxaConversaoModule.META_CHAVE_CONTATO,
        valorFmt: taxaCont.toFixed(1) + '%',
      },
      {
        key: 'venda_recomendacao_ev',
        label: 'Venda → Recomendação',
        sub: `${totalRecomend} recomendações em ${totalVendas} vendas (${recPorVenda.toFixed(1)} por venda)`,
        taxa: taxaRec, meta: TaxaConversaoModule.META_CHAVE_RECOMENDACAO,
        valorFmt: taxaRec.toFixed(0) + '%',
      },
    ];
  }

  /* Barra de conversão-chave. Preenchimento é RELATIVO À META
     (meta batida = barra cheia), pra funcionar igual pra 60%, 100%
     e 500% sem estourar visualmente. */
  static _barraChave(item) {
    const razao   = item.meta > 0 ? item.taxa / item.meta : 0;
    const atingiu = razao >= 1;
    const cor     = atingiu
      ? '#10A64A'
      : (razao < TaxaConversaoModule.GARGALO_THRESHOLD ? BX_COR.accent : '#F59E0B');
    const fill    = Math.max(0, Math.min(razao * 100, 100));
    const icon    = atingiu
      ? '<i class="bi bi-check-circle-fill" style="color:var(--d-txt-10a64a);"></i>'
      : (razao < TaxaConversaoModule.GARGALO_THRESHOLD
          ? '<i class="bi bi-x-circle-fill" style="color:var(--d-txt-d91a3c);"></i>'
          : '<i class="bi bi-exclamation-triangle-fill" style="color:var(--d-txt-f59e0b);"></i>');

    return `
      <div style="padding:16px;background:var(--d-bgc-ffffff);border-radius:8px;margin-bottom:12px;border:1px solid var(--d-brd-e5e7eb);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div>${icon} <strong style="font-size:14px;margin-left:6px;">${item.label}</strong></div>
          <div style="font-size:24px;font-weight:700;color:${cor};line-height:1;">${item.valorFmt}</div>
        </div>
        <div style="height:14px;background:var(--d-bgc-e5e7eb);border-radius:7px;overflow:hidden;margin-bottom:8px;">
          <div style="height:100%;width:${fill}%;background:${cor};transition:width .3s;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--d-txt-6b7280);">
          <span>${item.sub}</span>
          <span>Meta: <strong>${item.meta.toFixed(0)}%</strong></span>
        </div>
      </div>`;
  }

  /* Bloco completo: título "Conversões-chave" + 3 barras +
     subtítulo pras barras de etapa que vêm logo abaixo. */
  static _renderBlocoChave(leadsFiltrados) {
    const itens = TaxaConversaoModule._conversoesChave(leadsFiltrados);
    return `
      <div style="margin-bottom:18px;">
        <div style="font-size:13px;font-weight:700;color:var(--d-txt-1e2761);text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px;">
          Conversões-chave
          <span style="font-weight:500;color:var(--d-txt-6b7280);text-transform:none;letter-spacing:0;">(base: leads captados no período)</span>
        </div>
        ${itens.map(i => TaxaConversaoModule._barraChave(i)).join('')}
      </div>
      <div style="font-size:13px;font-weight:700;color:var(--d-txt-1e2761);text-transform:uppercase;letter-spacing:.4px;margin:6px 0 10px;">
        Conversão entre etapas do funil
      </div>`;
  }

  /* ================================================================
     FILTROS
     ================================================================ */
  static _popularFiltros(forcarRepopular) {
    /* Usuários — Chamado #47 (revisão v2):
       - Convertido de <select> pra dropdown custom (botão + lista)
       - Toggle "Incluir inativos" agora dentro do dropdown
       - A seleção é gravada num <input type="hidden" id="rel-tc-filtro-esp">
         pra que o resto do código do módulo continue funcionando. */
    const $lista = $('#rel-tc-esp-lista');
    if ($lista.length && !$lista.data('populado')) {
      TaxaConversaoModule._popularListaEsp();
      $lista.data('populado', true);

      /* Fecha dropdown ao clicar fora */
      $(document).on('click.relTcEspDropdown', function(e) {
        const $target = $(e.target);
        if (!$target.closest('#rel-tc-esp-dropdown').length &&
            !$target.closest('#rel-tc-esp-btn').length) {
          $('#rel-tc-esp-dropdown').hide();
        }
      });
    }

    /* Filiais */
    const $fil = $('#rel-tc-filtro-filial');
    if ($fil.length && !$fil.data('populado')) {
      $fil.html('<option value="">Todas as filiais</option>');
      (store.filiais || []).forEach(f => {
        $fil.append('<option value="' + f.nome + '">' + f.nome + '</option>');
      });
      $fil.data('populado', true);
    }
  }

  /* ================================================================
     DROPDOWN CUSTOM DE USUÁRIO (Chamado #47 v2)
     ================================================================ */
  static _popularListaEsp() {
    const $lista = $('#rel-tc-esp-lista');
    if (!$lista.length) return;
    const incluirInativos = $('#rel-tc-inativos').is(':checked');
    const idSelecionado = $('#rel-tc-filtro-esp').val() || '';
    const LBL_PERFIL = { especialista: 'E', supervisor: 'S', gerente: 'G' };

    const usuarios = (store.usuarios || [])
      .filter(u => ['especialista', 'supervisor', 'gerente'].includes(u.perfil))
      .filter(u => incluirInativos || u.status !== 'inativo')
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    let html = `
      <div class="rel-tc-esp-item" data-id="" data-label="Todos os usuários"
           style="padding:6px 10px;cursor:pointer;font-size:13px;${idSelecionado === '' ? 'background:var(--d-bgc-eef2ff);font-weight:600;' : ''}">
        Todos os usuários
      </div>`;
    html += usuarios.map(u => {
      const id = u._id || u.id;
      if (!id) return '';
      const tag = LBL_PERFIL[u.perfil] || '?';
      const inativoBadge = (u.status === 'inativo')
        ? ' <span style="font-size:10px;color:var(--d-txt-9ca3af);">(inativo)</span>'
        : '';
      const marcado = (idSelecionado === id) ? 'background:#EEF2FF;font-weight:600;' : '';
      const labelPlano = '[' + tag + '] ' + (u.nome || '') + (u.status === 'inativo' ? ' (inativo)' : '');
      return `
        <div class="rel-tc-esp-item"
             data-id="${Utils.escHtml(id)}"
             data-label="${Utils.escHtml(labelPlano)}"
             style="padding:6px 10px;cursor:pointer;font-size:13px;${marcado}">
          <strong>[${tag}]</strong> ${Utils.escHtml(u.nome || '')}${inativoBadge}
        </div>`;
    }).join('');

    $lista.html(html);

    /* Handler delegado — mesma técnica do Aniversariantes.
       Evita bug de escape em nomes com aspas. */
    $lista.off('click.selEsp').on('click.selEsp', '.rel-tc-esp-item', function() {
      const id    = $(this).attr('data-id') || '';
      const label = $(this).attr('data-label') || 'Todos os usuários';
      TaxaConversaoModule.selecionarEsp(id, label);
    });
  }

  static toggleDropdownEsp() {
    const $dd = $('#rel-tc-esp-dropdown');
    if ($dd.is(':visible')) $dd.hide();
    else                    $dd.show();
  }

  static selecionarEsp(id, label) {
    $('#rel-tc-filtro-esp').val(id);
    $('#rel-tc-esp-btn-label').text(label);
    $('#rel-tc-esp-dropdown').hide();
    TaxaConversaoModule.renderRelatorio();
  }

  static _aplicarFiltros(leadsArr) {
    const espId   = $('#rel-tc-filtro-esp').val();
    const filial  = $('#rel-tc-filtro-filial').val();
    const periodo = $('#rel-tc-filtro-periodo').val() || 'mes-vigente';
    const dtIni   = $('#rel-tc-dt-inicio').val();
    const dtFim   = $('#rel-tc-dt-fim').val();

    const [inicio, fim] = TaxaConversaoModule._resolverPeriodo(periodo, dtIni, dtFim);

    return (leadsArr || []).filter(l => {
      /* Chamado #33 — clones de veículo adicional (lead_pai_id preenchido)
         NÃO são pessoas novas no funil; ficam fora da base de leads captados
         pra não distorcer Lead→Ligação / Lead→Contato. */
      if (l.lead_pai_id) return false;

      /* Filtro por especialista (captador) */
      if (espId && l.captador_id !== espId) return false;

      /* Filtro por filial (via captador) */
      if (filial) {
        const cap = (store.usuarios || []).find(u => (u._id || u.id) === l.captador_id);
        if (!cap || cap.filial !== filial) return false;
      }

      /* Filtro por período (created_at do lead) */
      if (inicio && l.created_at) {
        const dt = new Date(l.created_at);
        if (dt < inicio) return false;
        if (fim && dt > fim) return false;
      }

      return true;
    });
  }

  static _resolverPeriodo(preset, dtIniStr, dtFimStr) {
    const hoje = new Date();
    let inicio = null, fim = null;

    switch (preset) {
      case 'todos':
        return [null, null];

      case 'esta-semana': {
        const dom = new Date(hoje);
        dom.setDate(hoje.getDate() - hoje.getDay());
        dom.setHours(0, 0, 0, 0);
        inicio = dom;
        fim = new Date(hoje);
        fim.setHours(23, 59, 59, 999);
        break;
      }

      case 'mes-vigente': {
        inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1, 0, 0, 0, 0);
        fim    = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      }

      case 'ciclo-comissao': {
        /* Ciclo 26 → 25 (comissão) */
        const dia = hoje.getDate();
        if (dia >= 26) {
          inicio = new Date(hoje.getFullYear(), hoje.getMonth(),     26, 0, 0, 0, 0);
          fim    = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 25, 23, 59, 59, 999);
        } else {
          inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 26, 0, 0, 0, 0);
          fim    = new Date(hoje.getFullYear(), hoje.getMonth(),     25, 23, 59, 59, 999);
        }
        break;
      }

      case 'ultimos-30': {
        inicio = new Date(hoje);
        inicio.setDate(hoje.getDate() - 30);
        inicio.setHours(0, 0, 0, 0);
        fim = new Date(hoje);
        fim.setHours(23, 59, 59, 999);
        break;
      }

      case 'custom': {
        if (dtIniStr) inicio = new Date(dtIniStr + 'T00:00:00');
        if (dtFimStr) fim    = new Date(dtFimStr + 'T23:59:59');
        break;
      }
    }
    return [inicio, fim];
  }

  static _recomendacoesPorVenda(leadsArr) {
    /* chamado #50: agora conta RECOMENDAÇÕES REAIS (interações de
       carteira tipo='recomendacao') por VENDA REAL, ambos restritos
       aos leads do conjunto — mesma fonte usada na barra
       "Venda → Recomendação", pra card e barra nunca divergirem.
       (Antes contava "leads cuja fonte contém recomendação", que é
       coisa diferente e distorcia o número.) */
    const setUuids = TaxaConversaoModule._setUuidsLeads(leadsArr);

    const totalVendas = (store.vendas || []).filter(v =>
      v._lead_uuid && setUuids.has(v._lead_uuid)
    ).length;
    if (!totalVendas) return 0;

    const totalRecomend = (store.carteiraInteracoes || []).filter(c =>
      c.tipo === 'recomendacao' && c._lead_uuid && setUuids.has(c._lead_uuid)
    ).length;

    return totalRecomend / totalVendas;
  }

  /**
   * Trigger de mudança nos filtros — mostra/esconde custom range e re-renderiza.
   */
  static onFiltroChange() {
    const periodo = $('#rel-tc-filtro-periodo').val();
    if (periodo === 'custom') $('#rel-tc-custom-wrap').show();
    else                       $('#rel-tc-custom-wrap').hide();
    TaxaConversaoModule.renderRelatorio();
  }

  /* ================================================================
     EXPORTAÇÃO EXCEL
     ================================================================ */
  static async exportarExcel() {
    if (typeof ExcelJS === 'undefined') {
      Toast.show('Biblioteca ExcelJS não carregada.', 'danger');
      return;
    }

    const leadsFiltrados = TaxaConversaoModule._aplicarFiltros(store.leads || []);
    const trans          = TaxaConversaoModule.calcular(leadsFiltrados);
    const gargalo        = TaxaConversaoModule.identificarGargaloPrincipal(trans);

    /* Chamado #112 — "Conversões-chave" (aba 2, abaixo) soma ligações,
       vendas e recomendações de carteira; busca o histórico completo
       dessas 3 fontes direto do banco (sem os limites 200/500 do cache
       de boot), pra não subcontar leads antigos que caíram fora do
       cache local. */
    const fontesCompleto = {
      ligacoes:           (typeof SupabaseSync !== 'undefined' && SupabaseSync.buscarLigacoesCompleto)           ? await SupabaseSync.buscarLigacoesCompleto()           : (store.ligacoes || []),
      vendas:             (typeof SupabaseSync !== 'undefined' && SupabaseSync.buscarVendasCompleto)             ? await SupabaseSync.buscarVendasCompleto()             : (store.vendas || []),
      carteiraInteracoes: (typeof SupabaseSync !== 'undefined' && SupabaseSync.buscarCarteiraInteracoesCompleto) ? await SupabaseSync.buscarCarteiraInteracoesCompleto() : (store.carteiraInteracoes || []),
    };

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Beyond CRM';
    wb.created = new Date();

    /* ── Aba 1: Sumário ── */
    const wsSum = wb.addWorksheet('Sumário');
    wsSum.columns = [
      { header: 'Transição',     key: 'transicao', width: 32 },
      { header: 'Qtd. Origem',   key: 'qtdDe',     width: 14 },
      { header: 'Qtd. Destino',  key: 'qtdPara',   width: 14 },
      { header: 'Taxa Real (%)', key: 'taxa',      width: 16 },
      { header: 'Meta (%)',      key: 'meta',      width: 12 },
      { header: 'Razão (real/meta)', key: 'razao', width: 18 },
      { header: 'Status',        key: 'status',    width: 18 },
    ];
    TaxaConversaoModule._estilizarHeader(wsSum.getRow(1));

    trans.forEach(t => {
      const row = wsSum.addRow({
        transicao: t.deLabel + ' → ' + t.paraLabel,
        qtdDe:     t.qtdDe,
        qtdPara:   t.qtdPara,
        taxa:      Number(t.taxa.toFixed(2)),
        meta:      Number(t.meta.toFixed(2)),
        razao:     Number(t.razaoMeta.toFixed(2)),
        status:    t.isGargalo ? '🚧 GARGALO' : (t.razaoMeta >= 1 ? '✅ Atingido' : '⚠️ Abaixo'),
      });
      if (t.isGargalo) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      } else if (t.razaoMeta >= 1) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      } else {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      }
    });

    /* ── Aba 2: Conversões-chave (chamado #50) ── */
    const chave = TaxaConversaoModule._conversoesChave(leadsFiltrados, fontesCompleto);
    const wsChave = wb.addWorksheet('Conversões-chave');
    wsChave.columns = [
      { header: 'Conversão',  key: 'conv',    width: 26 },
      { header: 'Valor (%)',  key: 'valor',   width: 14 },
      { header: 'Meta (%)',   key: 'meta',    width: 12 },
      { header: 'Atingiu',    key: 'atingiu', width: 12 },
      { header: 'Detalhe',    key: 'det',     width: 60 },
    ];
    TaxaConversaoModule._estilizarHeader(wsChave.getRow(1));
    chave.forEach(i => {
      const ok = i.meta > 0 && (i.taxa / i.meta) >= 1;
      const row = wsChave.addRow({
        conv:    i.label,
        valor:   Number(i.taxa.toFixed(1)),
        meta:    Number(i.meta.toFixed(0)),
        atingiu: ok ? 'Sim' : 'Não',
        det:     i.sub,
      });
      row.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: ok ? 'FFD1FAE5' : 'FFFEF3C7' },
      };
    });

    /* ── Aba 3: Informações do relatório ── */
    const wsInfo = wb.addWorksheet('Informações');
    wsInfo.getColumn('A').width = 32;
    wsInfo.getColumn('B').width = 46;
    const infoRows = [
      ['Relatório',              'Taxa de Conversão por Etapa'],
      ['Data de geração',        new Date().toLocaleString('pt-BR')],
      ['Total de leads (período)', leadsFiltrados.length],
      ['Gargalo principal',      gargalo ? (gargalo.deLabel + ' → ' + gargalo.paraLabel) : '—'],
      ['Especialista filtrado',  $('#rel-tc-filtro-esp option:selected').text()],
      ['Filial filtrada',        $('#rel-tc-filtro-filial option:selected').text()],
      ['Período',                $('#rel-tc-filtro-periodo option:selected').text()],
    ];
    infoRows.forEach(([k, v]) => {
      const r = wsInfo.addRow([k, v]);
      r.getCell(1).font = { bold: true };
    });

    /* ── Aba 3: Leads no período ── */
    const wsLeads = wb.addWorksheet('Leads no período');
    wsLeads.columns = [
      { header: 'Código',           key: 'codigo',     width: 18 },
      { header: 'Nome',             key: 'nome',       width: 32 },
      { header: 'Etapa atual',      key: 'etapa',      width: 16 },
      { header: 'Captador',         key: 'captador',   width: 26 },
      { header: 'Fonte',            key: 'fonte',      width: 22 },
      { header: 'Data de criação',  key: 'created_at', width: 20 },
    ];
    TaxaConversaoModule._estilizarHeader(wsLeads.getRow(1));

    (leadsFiltrados || []).forEach(l => {
      wsLeads.addRow({
        codigo:     l.codigo || l.id || '',
        nome:       l.nome || '',
        etapa:      TaxaConversaoModule.LABELS[l.etapa] || l.etapa,
        captador:   l.captador || '',
        fonte:      l.fonte || '',
        created_at: l.created_at ? new Date(l.created_at).toLocaleString('pt-BR') : '',
      });
    });

    /* Download */
    const buffer = await wb.xlsx.writeBuffer();
    const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const nome   = 'BeyondCRM_TaxaConversao_' + new Date().toISOString().slice(0, 10) + '.xlsx';

    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    Toast.show('Relatório exportado: ' + nome, 'success');
  }

  static _estilizarHeader(row) {
    row.font   = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
    row.height = 20;
  }
}

/* Expõe global (mesmo padrão dos outros Modules) */
if (typeof window !== 'undefined') window.TaxaConversaoModule = TaxaConversaoModule;
