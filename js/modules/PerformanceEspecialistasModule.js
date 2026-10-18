/* ============================================================
   BEYOND CRM — js/modules/PerformanceEspecialistasModule.js   v1.2
   Feature 5.3 — Performance individual por especialista (KPIs)
   Requisito: DRS 4.6 (Relatório completo, gerente-only, exportável)

   v1.2 changes:
     - Cards expandíveis (Opção C):
       · Top 2 sempre expandidos por padrão
       · Do 3º em diante colapsados (só header com KPIs resumidos)
       · Cada card compacto é clicável para expandir individualmente
       · Botão global "Expandir todos" / "Recolher todos"
       · Se resultado ≤ 2 cards, todos vêm expandidos automaticamente

   v1.1 changes:
     - Multi-select de especialistas via dropdown com checkboxes
     - Padrão de período mudado para "Últimos 30 dias" (mais inclusivo)
     - Mensagem gentil quando o período retornar sem dados
     - Fechamento automático do dropdown ao clicar fora

   Beyond Bits Tecnologia © 2026
   ============================================================ */
'use strict';

class PerformanceEspecialistasModule {

  /* Estado de expansão dos cards (chave = userId → boolean) */
  static _cardsExpandidos = {};

  /* Chamado #75 — estado global tri-estado:
       null  = padrão (≤2 todos; senão top-2 expandidos)
       true  = expandir todos
       false = recolher todos */
  static _expandirTodos = null;

  /* ================================================================
     RENDER PRINCIPAL
     ================================================================ */
  static renderRelatorio() {
    const $wrap = $('#rel-performance');
    if (!$wrap.length) return;

    PerformanceEspecialistasModule._popularFiltros();

    const filtros = PerformanceEspecialistasModule._lerFiltros();
    const stats   = PerformanceEspecialistasModule._calcular(filtros);

    /* Header — resumo agregado */
    const $resumo = $('#rel-perf-resumo');
    if ($resumo.length) {
      const totalVendas    = stats.reduce((a, s) => a + s.vendas, 0);
      const totalMensal    = stats.reduce((a, s) => a + s.mensal, 0);
      /* Chamado #101 — mesmo cuidado do card por especialista: ticket
         médio do resumo divide pela quantidade de vendas que TÊM
         mensalidade registrada (qtdMensal), não pela quantidade total
         de vendas (totalVendas) — populações diferentes, dividir pela
         errada distorce a média. */
      const totalQtdMensal = stats.reduce((a, s) => a + (s.qtdMensal || 0), 0);
      const totalLeads     = stats.reduce((a, s) => a + s.leads, 0);
      const totalLigacoes  = stats.reduce((a, s) => a + s.lig, 0);
      const taxaGeral      = totalLeads > 0 ? (totalVendas / totalLeads * 100) : 0;
      const ticketMedio    = totalQtdMensal > 0 ? (totalMensal / totalQtdMensal) : 0;

      $resumo.html(`
        <div class="row g-3">
          <div class="col-md-2">
            <div style="padding:12px;background:var(--d-bgc-dbeafe);border-radius:8px;text-align:center;border:1px solid var(--d-brd-bfdbfe);">
              <!-- Chamado #93 — rótulo ajustado: o card agora pode incluir
                   supervisores e gerente, não só especialistas. -->
              <div style="font-size:11px;color:var(--d-txt-1e40af);text-transform:uppercase;letter-spacing:.5px;">Usuários no relatório</div>
              <div style="font-weight:800;color:var(--d-txt-1e40af);margin-top:4px;font-size:22px;">${stats.length}</div>
            </div>
          </div>
          <div class="col-md-2">
            <div style="padding:12px;background:var(--d-bgc-e0f2fe);border-radius:8px;text-align:center;border:1px solid var(--d-brd-bae6fd);">
              <div style="font-size:11px;color:var(--d-txt-075985);text-transform:uppercase;letter-spacing:.5px;">Leads captados</div>
              <div style="font-weight:800;color:var(--d-txt-075985);margin-top:4px;font-size:22px;">${totalLeads}</div>
            </div>
          </div>
          <div class="col-md-2">
            <div style="padding:12px;background:var(--d-bgc-ede9fe);border-radius:8px;text-align:center;border:1px solid var(--d-brd-ddd6fe);">
              <div style="font-size:11px;color:var(--d-txt-5b21b6);text-transform:uppercase;letter-spacing:.5px;">Ligações</div>
              <div style="font-weight:800;color:var(--d-txt-5b21b6);margin-top:4px;font-size:22px;">${totalLigacoes}</div>
            </div>
          </div>
          <div class="col-md-2">
            <div style="padding:12px;background:var(--d-bgc-d1fae5);border-radius:8px;text-align:center;border:1px solid var(--d-brd-a7f3d0);">
              <div style="font-size:11px;color:var(--d-txt-065f46);text-transform:uppercase;letter-spacing:.5px;">Vendas</div>
              <div style="font-weight:800;color:var(--d-txt-065f46);margin-top:4px;font-size:22px;">${totalVendas}</div>
            </div>
          </div>
          <div class="col-md-2">
            <div style="padding:12px;background:var(--d-bgc-fef3c7);border-radius:8px;text-align:center;border:1px solid var(--d-brd-fde68a);">
              <div style="font-size:11px;color:var(--d-txt-92400e);text-transform:uppercase;letter-spacing:.5px;">Ticket médio</div>
              <div style="font-weight:800;color:var(--d-txt-92400e);margin-top:4px;font-size:16px;">R$ ${ticketMedio.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            </div>
          </div>
          <div class="col-md-2">
            <div style="padding:12px;background:var(--d-bgc-fce7f3);border-radius:8px;text-align:center;border:1px solid var(--d-brd-fbcfe8);">
              <div style="font-size:11px;color:var(--d-txt-9f1239);text-transform:uppercase;letter-spacing:.5px;">Taxa geral</div>
              <div style="font-weight:800;color:var(--d-txt-9f1239);margin-top:4px;font-size:22px;">${taxaGeral.toFixed(1)}%</div>
            </div>
          </div>
        </div>`);
    }

    /* Grid de cards por especialista */
    const $grid = $('#rel-perf-grid');
    if (!$grid.length) return;

    if (!stats.length) {
      $grid.html('<div style="padding:32px;text-align:center;color:var(--d-txt-6b7280);">Nenhum especialista encontrado com os filtros selecionados.</div>');
      return;
    }

    /* Detecta se todos os KPIs vieram zerados (período muito restritivo) */
    const totalGeral = stats.reduce((a, s) => a + s.leads + s.lig + s.vendas, 0);
    if (totalGeral === 0) {
      $grid.html(`
        <div style="padding:32px;text-align:center;color:var(--d-txt-6b7280);background:var(--d-bgc-fef3c7);border-radius:8px;border:1px dashed var(--d-brd-f59e0b);">
          <div style="font-size:36px;margin-bottom:8px;">📅</div>
          <div style="font-weight:600;color:var(--d-txt-92400e);margin-bottom:4px;">Nenhum registro no período selecionado</div>
          <div style="font-size:13px;">Tente ampliar o período para <strong>"Últimos 30 dias"</strong> ou <strong>"Todos os períodos"</strong>.</div>
        </div>`);
      return;
    }

    /* Regras de expansão automática:
       - Se resultado ≤ 2 → todos expandidos
       - Senão → top 2 expandidos, resto compacto (a menos que o usuário tenha marcado individualmente)
    */
    const autoExpandirTodos = stats.length <= 2;

    const cardsHtml = stats.map((s, idx) => {
      const key = s.userId || s.sigla;
      const expandido = PerformanceEspecialistasModule._estaExpandido(key, idx, autoExpandirTodos);
      return expandido
        ? PerformanceEspecialistasModule._cardEspecialistaCompleto(s, idx)
        : PerformanceEspecialistasModule._cardEspecialistaCompacto(s, idx);
    }).join('');

    /* Botão global — só aparece se tiver mais que 2 cards (senão não faz sentido) */
    let botaoGlobal = '';
    if (stats.length > 2) {
      const label = PerformanceEspecialistasModule._expandirTodos === true ? 'Recolher todos' : 'Expandir todos';
      const icon  = PerformanceEspecialistasModule._expandirTodos === true ? 'bi-chevron-double-up' : 'bi-chevron-double-down';
      botaoGlobal = `
        <div style="text-align:center;margin-top:8px;margin-bottom:4px;">
          <button class="btn-beyond btn-secondary-amp btn-sm-amp" onclick="PerformanceEspecialistasModule.toggleExpandirTodos()">
            <i class="bi ${icon}"></i> ${label}
          </button>
        </div>`;
    }

    $grid.html(cardsHtml + botaoGlobal);
  }

  /* ================================================================
     CÁLCULO DE MÉTRICAS
     Chamado #112 — aceita `fontes` opcional { ligacoes, vendas }: quando
     passado (export Excel busca o histórico completo direto do banco),
     usa esses arrays em vez de store.ligacoes/store.vendas (capados no
     cache de boot em 200/500 registros). Sem o parâmetro, o card em
     tela continua idêntico.
     ================================================================ */
  static _calcular(filtros, fontes) {
    fontes = fontes || {};
    const ligacoesArr = fontes.ligacoes || store.ligacoes || [];
    const vendasArr   = fontes.vendas   || store.vendas   || [];
    /* Chamado #93 — o dropdown de usuários (_popularListaEsp, logo
       abaixo) já lista especialista/supervisor/gerente, mas o cálculo
       só considerava 'especialista' — supervisor aparecia pra
       selecionar no filtro e simplesmente sumia do relatório (nenhuma
       linha `stats[u.nome]` era criada pra ele, então os leads/vendas
       atribuídos a um supervisor não caíam em lugar nenhum). Alinha
       com o mesmo escopo do dropdown e do bloco "Toda a Equipe" do
       Atingimento de Metas (#74/#98): especialista, supervisor e
       gerente também vendem e devem aparecer aqui. */
    let usuarios = (store.usuarios || [])
      .filter(u => ['especialista', 'supervisor', 'gerente'].includes(u.perfil) && u.status !== 'inativo')
      .filter(u => !filtros.filial || u.filial === filtros.filial);

    /* Filtro por especialistas selecionados (null = todos) */
    if (Array.isArray(filtros.especialistas) && filtros.especialistas.length > 0) {
      const set = new Set(filtros.especialistas);
      usuarios = usuarios.filter(u => set.has(u._id || u.id));
    }

    const stats = {};
    usuarios.forEach(u => {
      stats[u.nome] = {
        userId:      u._id || u.id,
        nome:        u.nome,
        sigla:       u.sigla,
        perfil:      u.perfil,   /* Chamado #93 — pra badge distinguir especialista/supervisor/gerente no card */
        filial:      u.filial || '—',
        metaVendas:  Number(u.meta_vendas) || 0,
        metaMensal:  Number(u.meta_mensalidade) || 0,
        leads:       0,
        lig:         0,
        agend:       0,
        visitas:     0,
        vendas:      0,
        mensal:      0,
        qtdMensal:   0,
      };
    });

    /* Chamado #126 — mesma regra do KPI "Ligações" do dashboard: toda
       ligação registrada conta, em qualquer etapa e com qualquer
       resultado, EXCETO a feita na etapa da carteira. Antes esta tela
       somava também as de carteira e divergia do dashboard. */
    const _mapaCartPerf = (typeof FunilModule !== 'undefined' && FunilModule._mapaCarteiraEm)
      ? FunilModule._mapaCarteiraEm() : Object.create(null);
    ligacoesArr.forEach(l => {
      if (!PerformanceEspecialistasModule._dentroPeriodo(l._data_hora || l._created_at, filtros)) return;
      if (typeof FunilModule !== 'undefined' && FunilModule._ligacaoContaNoTotal
          && !FunilModule._ligacaoContaNoTotal(l, _mapaCartPerf)) return;
      const s = stats[l.esp]; if (s) s.lig++;
    });

    (store.leads || []).forEach(l => {
      if (!l || !l.responsavel_nome) return;
      /* Chamado #75 — o objeto lead usa _createdAt (não created_at). Antes
         chegava undefined aqui e _dentroPeriodo descartava TODOS os leads
         com qualquer período != 'todos' — por isso só ligações apareciam. */
      if (!PerformanceEspecialistasModule._dentroPeriodo(l._createdAt, filtros)) return;
      /* Chamado #75/#69 — atribuição pelo RESPONSÁVEL ATUAL do lead, não pelo
         criador. Consistente com o #69 (a propriedade do card segue quem o
         trata agora). Leads cujo responsável não é especialista ativo caem
         fora (stats só tem especialistas). */
      const s = stats[l.responsavel_nome]; if (!s) return;
      s.leads++;
      if (['agendamento','visita','venda','carteira'].includes(l.etapa)) s.agend++;
      if (['visita','venda','carteira'].includes(l.etapa)) s.visitas++;
      if (l.etapa === 'carteira') s.vendas++;
    });

    /* ════════════════════════════════════════════════════════════
       Chamado #101 (retorno do #75) — Mensalidade total / Ticket médio
       ════════════════════════════════════════════════════════════
       Regra do cliente: "a mensalidade total é a soma de todas as
       mensalidades que foram CADASTRADAS NO CARD NA COLUNA VENDA e
       foram pra carteira. O ticket médio é a média DOS MESMOS valores."
       Isso é o valor REAL registrado no formulário de venda (tabela
       `vendas` / store.vendas), não a mensalidade ESTIMADA do lead
       (mensalidadeEst — preenchida bem antes, no cadastro/negociação,
       e frequentemente vazia ou diferente do que fechou).
       Mesmo bug já corrigido no #87 pro KPI "Ticket Médio" do dashboard
       (FunilModule.atualizarKPIs) — este relatório ainda usava a fonte
       antiga. Filtra por período pela DATA DA VENDA (dataVenda),
       mesma convenção de FunilModule._getVendasFiltradasDashboard —
       não pela data de criação do lead (que pode ser bem anterior). */
    const statsPorId = {};
    Object.values(stats).forEach(s => { statsPorId[s.userId] = s; });

    vendasArr.forEach(v => {
      if (!v || !v._esp_id) return;
      /* Chamado #105 — dataVenda é data pura ("2026-08-26", sem hora);
         new Date() direto nisso vira meia-noite UTC (21h do dia
         anterior em Brasília). Normaliza pra meia-noite LOCAL antes de
         passar pro _dentroPeriodo (que só faz new Date(str) puro). */
      const dataVendaLocal = v.dataVenda ? (String(v.dataVenda).slice(0, 10) + 'T00:00:00') : v.created_at;
      if (!PerformanceEspecialistasModule._dentroPeriodo(dataVendaLocal, filtros)) return;
      const s = statsPorId[v._esp_id]; if (!s) return;
      const valor = Number(v.valorMensalidade);
      if (!isNaN(valor) && valor > 0) {
        s.mensal += valor;
        s.qtdMensal++;
      }
    });

    const arr = Object.values(stats).map(s => {
      s.taxaConversao = s.leads > 0 ? (s.vendas / s.leads * 100) : 0;
      s.ticketMedio   = s.qtdMensal > 0 ? (s.mensal / s.qtdMensal) : 0;
      s.pctVendas     = s.metaVendas > 0 ? Math.round(s.vendas / s.metaVendas * 100) : 0;
      s.pctMensal     = s.metaMensal > 0 ? Math.round(s.mensal / s.metaMensal * 100) : 0;
      return s;
    });

    const ordem = filtros.ordem || 'vendas';
    if (ordem === 'vendas')         arr.sort((a,b) => b.vendas - a.vendas);
    else if (ordem === 'conversao') arr.sort((a,b) => b.taxaConversao - a.taxaConversao);
    else if (ordem === 'valor')     arr.sort((a,b) => b.mensal - a.mensal);
    else if (ordem === 'leads')     arr.sort((a,b) => b.leads - a.leads);

    return arr;
  }

  /* Chamado #93 — badge de perfil (mesma paleta usada em MetasModule),
     pra distinguir especialista/supervisor/gerente agora que os três
     aparecem juntos no relatório. Especialista não ganha badge (é o
     caso mais comum; badge só chama atenção pra quem é exceção). */
  static _perfilBadge(perfil) {
    if (perfil === 'gerente')    return '<span style="display:inline-block;padding:1px 7px;border-radius:8px;font-size:9px;font-weight:700;background:#7C3AED18;color:#7C3AED;text-transform:uppercase;letter-spacing:.03em;margin-left:6px;">Gerente</span>';
    if (perfil === 'supervisor') return '<span style="display:inline-block;padding:1px 7px;border-radius:8px;font-size:9px;font-weight:700;background:#0284C718;color:#0284C7;text-transform:uppercase;letter-spacing:.03em;margin-left:6px;">Supervisor</span>';
    return '';
  }

  /* ================================================================
     RENDER DE UM CARD EXPANDIDO (versão completa com todos os blocos)
     ================================================================ */
  static _cardEspecialistaCompleto(s, idx) {
    const rankMedalha = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : (idx + 1) + 'º';
    const rankCor     = idx === 0 ? '#FBBF24' : idx === 1 ? '#94A3B8' : idx === 2 ? '#FBC46A' : '#9CA3AF';

    const corVendas  = s.pctVendas >= 100 ? BX_COR.up : s.pctVendas >= 60 ? BX_COR.accent3 : BX_COR.accent;
    const corMensal  = s.pctMensal >= 100 ? BX_COR.up : s.pctMensal >= 60 ? BX_COR.accent3 : BX_COR.accent;
    const corTaxa    = s.taxaConversao >= 20 ? BX_COR.up : s.taxaConversao >= 10 ? BX_COR.accent3 : '#A3A3A3';
    const key        = s.userId || s.sigla;

    return `
      <div style="border:1px solid var(--d-brd-e5e7eb);border-radius:10px;padding:16px;margin-bottom:14px;background:var(--d-bgc-ffffff);">

        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--d-brd-f3f4f6);cursor:pointer;"
             onclick="PerformanceEspecialistasModule.toggleCard('${key}')" title="Clique para recolher">
          <div style="width:40px;height:40px;background:${rankCor}22;color:${rankCor};border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;">${rankMedalha}</div>
          <div style="width:44px;height:44px;background:var(--d-bgc-eef2ff);color:var(--d-txt-3730a3);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">${Utils.escHtml(s.sigla)}</div>
          <div style="flex:1;">
            <div style="font-weight:700;font-size:15px;color:var(--d-txt-111827);">${Utils.escHtml(s.nome)}${PerformanceEspecialistasModule._perfilBadge(s.perfil)}</div>
            <div style="font-size:12px;color:var(--d-txt-6b7280);"><i class="bi bi-building"></i> ${Utils.escHtml(s.filial)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:var(--d-txt-6b7280);text-transform:uppercase;">Meta: <strong>${s.metaVendas}</strong> vendas / R$ ${s.metaMensal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </div>
          <i class="bi bi-chevron-up" style="color:var(--d-txt-6b7280);font-size:18px;margin-left:8px;" title="Recolher"></i>
        </div>

        <div style="margin-bottom:14px;">
          <div style="font-size:11px;color:var(--d-txt-6b7280);text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin-bottom:8px;">📊 Volume</div>
          <div class="pe-grid" style="display:grid;grid-template-columns:repeat(4, 1fr);gap:10px;">
            ${PerformanceEspecialistasModule._miniKpi('Leads captados',     s.leads,     '#7DD3FC')}
            ${PerformanceEspecialistasModule._miniKpi('Ligações',           s.lig,       '#C4B5FD')}
            ${PerformanceEspecialistasModule._miniKpi('Agendamentos',       s.agend,     '#FBC46A')}
            ${PerformanceEspecialistasModule._miniKpi('Visitas realizadas', s.visitas,   BX_COR.up)}
          </div>
        </div>

        <div style="margin-bottom:14px;">
          <div style="font-size:11px;color:var(--d-txt-6b7280);text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin-bottom:8px;">💼 Conversão</div>
          <div class="pe-grid" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;">
            ${PerformanceEspecialistasModule._miniKpi('Vendas',        s.vendas, '#86EFAC')}
            ${PerformanceEspecialistasModule._miniKpi('Taxa conversão', s.taxaConversao.toFixed(1) + '%', corTaxa)}
            ${PerformanceEspecialistasModule._miniKpi('Ticket médio',   'R$ ' + s.ticketMedio.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}), '#FF9A52')}
          </div>
        </div>

        <div>
          <div style="font-size:11px;color:var(--d-txt-6b7280);text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin-bottom:8px;">🎯 Atingimento de Metas</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
            ${PerformanceEspecialistasModule._barraMeta('Vendas',       s.vendas,  s.metaVendas, s.pctVendas, corVendas, '')}
            ${PerformanceEspecialistasModule._barraMeta('Mensalidade',  s.mensal,  s.metaMensal, s.pctMensal, corMensal, 'R$ ')}
          </div>
        </div>
      </div>`;
  }

  /* ================================================================
     RENDER DE UM CARD COMPACTO (só header com KPIs resumidos)
     ================================================================ */
  static _cardEspecialistaCompacto(s, idx) {
    const rankMedalha = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : (idx + 1) + 'º';
    const rankCor     = idx === 0 ? '#FBBF24' : idx === 1 ? '#94A3B8' : idx === 2 ? '#B45309' : '#9CA3AF';
    const corVendas   = s.pctVendas >= 100 ? BX_COR.up : s.pctVendas >= 60 ? BX_COR.accent3 : BX_COR.accent;
    const corMensal   = s.pctMensal >= 100 ? BX_COR.up : s.pctMensal >= 60 ? BX_COR.accent3 : BX_COR.accent;
    const key         = s.userId || s.sigla;

    return `
      <div style="border:1px solid var(--d-brd-e5e7eb);border-radius:10px;padding:12px 16px;margin-bottom:8px;background:var(--d-bgc-ffffff);cursor:pointer;transition:background .15s;"
           onclick="PerformanceEspecialistasModule.toggleCard('${key}')"
           onmouseover="this.style.background='var(--bg-subtle)'"
           onmouseout="this.style.background='var(--bg-card)'"
           title="Clique para expandir">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <div style="width:34px;height:34px;background:${rankCor}22;color:${rankCor};border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;">${rankMedalha}</div>
          <div style="width:38px;height:38px;background:var(--d-bgc-eef2ff);color:var(--d-txt-3730a3);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;">${Utils.escHtml(s.sigla)}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:14px;color:var(--d-txt-111827);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.escHtml(s.nome)}</div>
            <div style="font-size:11px;color:var(--d-txt-6b7280);">${Utils.escHtml(s.filial)}</div>
          </div>
          <!-- KPIs resumidos: Vendas / Taxa conv / % meta vendas / % meta mensal -->
          <div class="pe-resumo" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;">
            <div style="text-align:center;">
              <div style="font-size:10px;color:var(--d-txt-6b7280);text-transform:uppercase;">Vendas</div>
              <div style="font-weight:700;font-size:15px;color:var(--d-txt-065f46);">${s.vendas}</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:10px;color:var(--d-txt-6b7280);text-transform:uppercase;">Taxa</div>
              <div style="font-weight:700;font-size:15px;color:var(--d-txt-374151);">${s.taxaConversao.toFixed(1)}%</div>
            </div>
            <div style="text-align:center;min-width:60px;">
              <div style="font-size:10px;color:var(--d-txt-6b7280);text-transform:uppercase;">% Meta V.</div>
              <div style="font-weight:700;font-size:15px;color:${corVendas};">${s.pctVendas}%</div>
            </div>
            <div style="text-align:center;min-width:60px;">
              <div style="font-size:10px;color:var(--d-txt-6b7280);text-transform:uppercase;">% Meta M.</div>
              <div style="font-weight:700;font-size:15px;color:${corMensal};">${s.pctMensal}%</div>
            </div>
          </div>
          <i class="bi bi-chevron-down" style="color:var(--d-txt-6b7280);font-size:16px;margin-left:6px;" title="Expandir"></i>
        </div>
      </div>`;
  }

  /* ================================================================
     TOGGLES DE EXPANSÃO
     ================================================================ */
  static toggleCard(key) {
    /* Chamado #75 — toggle individual confiável em UM clique para qualquer
       card (inclusive os top-2). Resolve o estado visual atual e inverte,
       gravando um override explícito. Antes o clique setava `true` num card
       já expandido por rank (exigia 2 cliques) e os top-2 não recolhiam. */
    const filtros = PerformanceEspecialistasModule._lerFiltros();
    const stats   = PerformanceEspecialistasModule._calcular(filtros);
    const autoExpandirTodos = stats.length <= 2;
    const idx = stats.findIndex(s => (s.userId || s.sigla) === key);
    const atual = PerformanceEspecialistasModule._estaExpandido(key, idx, autoExpandirTodos);
    PerformanceEspecialistasModule._cardsExpandidos[key] = !atual;
    PerformanceEspecialistasModule.renderRelatorio();
  }

  static toggleExpandirTodos() {
    /* Chamado #75 — 2 estados após a 1ª interação: expandir todos (true) x
       recolher todos (false). Recolher agora recolhe TODOS de fato (antes os
       top-2 ficavam presos por rank). Limpa overrides individuais. */
    PerformanceEspecialistasModule._expandirTodos =
      (PerformanceEspecialistasModule._expandirTodos === true) ? false : true;
    PerformanceEspecialistasModule._cardsExpandidos = {};
    PerformanceEspecialistasModule.renderRelatorio();
  }

  /* Chamado #75 — resolve o estado de expansão de um card:
       1) override individual explícito, se houver;
       2) flag global (true=todos, false=nenhum);
       3) padrão: ≤2 cards todos expandidos, senão top-2 (idx<2). */
  static _estaExpandido(key, idx, autoExpandirTodos) {
    if (Object.prototype.hasOwnProperty.call(PerformanceEspecialistasModule._cardsExpandidos, key)) {
      return !!PerformanceEspecialistasModule._cardsExpandidos[key];
    }
    if (PerformanceEspecialistasModule._expandirTodos === true)  return true;
    if (PerformanceEspecialistasModule._expandirTodos === false) return false;
    return autoExpandirTodos || idx < 2;
  }

  /* Verifica se o usuário mexeu manualmente no estado individual de um card */
  static _temEstadoIndividual(key) {
    return Object.prototype.hasOwnProperty.call(PerformanceEspecialistasModule._cardsExpandidos, key);
  }

  static _miniKpi(label, valor, cor) {
    return `
      <div style="padding:10px;background:var(--d-bgc-f9fafb);border-radius:6px;text-align:center;border:1px solid var(--d-brd-e5e7eb);">
        <div style="font-size:10px;color:var(--d-txt-6b7280);text-transform:uppercase;letter-spacing:.3px;">${label}</div>
        <div style="font-weight:700;color:${cor};margin-top:4px;font-size:16px;">${valor}</div>
      </div>`;
  }

  static _barraMeta(label, valor, meta, pct, cor, prefixo) {
    const valFmt  = typeof valor === 'number' && !Number.isInteger(valor)
      ? valor.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})
      : (typeof valor === 'number' ? valor.toString() : valor);
    const metaFmt = typeof meta === 'number' && !Number.isInteger(meta)
      ? meta.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})
      : (typeof meta === 'number' ? meta.toString() : meta);

    return `
      <div>
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
          <span style="font-weight:600;color:var(--d-txt-374151);">${label}</span>
          <span style="color:${cor};font-weight:700;">${pct}% ${pct >= 100 ? '✅' : ''}</span>
        </div>
        <div style="height:10px;background:var(--d-bgc-e5e7eb);border-radius:5px;overflow:hidden;">
          <div style="height:100%;width:${Math.min(pct, 100)}%;background:${cor};"></div>
        </div>
        <div style="font-size:11px;color:var(--d-txt-6b7280);margin-top:3px;">${prefixo}${valFmt} / ${prefixo}${metaFmt}</div>
      </div>`;
  }

  /* ================================================================
     FILTROS — POPULAR SELECTS + MULTI-SELECT
     ================================================================ */
  static _popularFiltros() {
    const $fil = $('#rel-perf-filial');
    if ($fil.length && !$fil.data('populado')) {
      $fil.html('<option value="">Todas as filiais</option>');
      (store.filiais || []).forEach(f => {
        $fil.append('<option value="' + f.nome + '">' + f.nome + '</option>');
      });
      $fil.data('populado', true);
    }

    /* Multi-select de usuários — Chamado #47 (revisão):
       - Lista TODOS os cargos com prefixo [E]/[S]/[G]
       - Inclui inativos apenas se o toggle "Incluir inativos" marcado
       - Populado uma vez, mas `_recarregarListaEsp()` refaz quando o
         toggle muda */
    const $lista = $('#rel-perf-esp-lista');
    if ($lista.length && !$lista.data('populado')) {
      PerformanceEspecialistasModule._popularListaEsp();
      $lista.data('populado', true);

      /* Fecha dropdown ao clicar fora */
      $(document).on('click.relPerfEspDropdown', function(e) {
        const $target = $(e.target);
        if (!$target.closest('#rel-perf-esp-dropdown').length &&
            !$target.closest('#rel-perf-esp-btn').length) {
          $('#rel-perf-esp-dropdown').hide();
        }
      });

      PerformanceEspecialistasModule._atualizarLabelEsp();
    }
  }

  /* Popula a lista de checkboxes de usuários no dropdown.
     Considera o toggle "Incluir inativos". */
  static _popularListaEsp() {
    const $lista = $('#rel-perf-esp-lista');
    if (!$lista.length) return;
    const incluirInativos = $('#rel-perf-inativos').is(':checked');
    const LBL_PERFIL = { especialista: 'E', supervisor: 'S', gerente: 'G' };
    const usuarios = (store.usuarios || [])
      .filter(u => ['especialista', 'supervisor', 'gerente'].includes(u.perfil))
      .filter(u => incluirInativos || u.status !== 'inativo')
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    $lista.html(usuarios.map(u => {
      const id = u._id || u.id;
      const tag = LBL_PERFIL[u.perfil] || '?';
      const inativoBadge = (u.status === 'inativo')
        ? ' <span style="font-size:10px;color:var(--d-txt-9ca3af);">(inativo)</span>'
        : '';
      return `
        <div class="form-check" style="padding-left:1.75em;margin-bottom:2px;">
          <input class="form-check-input rel-perf-esp-chk" type="checkbox" value="${id}"
                 id="rel-perf-esp-chk-${id}" checked
                 onchange="PerformanceEspecialistasModule.onCheckEsp()">
          <label class="form-check-label" for="rel-perf-esp-chk-${id}" style="font-size:13px;cursor:pointer;">
            <strong>[${tag}]</strong> ${Utils.escHtml(u.nome || '')}${inativoBadge}
          </label>
        </div>`;
    }).join(''));
  }

  /* Chamado quando o usuário liga/desliga "Incluir inativos".
     Repopula a lista mantendo marcados só os que estão em `_selecionadosAntes`.
     Depois atualiza label e re-renderiza o relatório. */
  static _recarregarListaEsp() {
    /* Guarda o que estava marcado (por id) */
    const antesMarcados = new Set();
    $('.rel-perf-esp-chk:checked').each(function() { antesMarcados.add($(this).val()); });

    PerformanceEspecialistasModule._popularListaEsp();

    /* Re-aplica a seleção anterior. Usuários que ficaram fora da lista
       (ex: usuário inativo que sumiu porque desmarcou o toggle) são
       naturalmente ignorados. */
    $('.rel-perf-esp-chk').each(function() {
      $(this).prop('checked', antesMarcados.has($(this).val()));
    });

    PerformanceEspecialistasModule._atualizarLabelEsp();
    PerformanceEspecialistasModule.renderRelatorio();
  }

  static toggleDropdownEsp() {
    const $dd = $('#rel-perf-esp-dropdown');
    if ($dd.is(':visible')) $dd.hide();
    else                    $dd.show();
  }

  static marcarTodosEsp(marcar) {
    $('.rel-perf-esp-chk').prop('checked', !!marcar);
    PerformanceEspecialistasModule.onCheckEsp();
  }

  static onCheckEsp() {
    PerformanceEspecialistasModule._atualizarLabelEsp();
    PerformanceEspecialistasModule.renderRelatorio();
  }

  static _atualizarLabelEsp() {
    const $chks = $('.rel-perf-esp-chk');
    const total = $chks.length;
    const marcados = $chks.filter(':checked').length;

    let label;
    if (marcados === 0)         label = 'Nenhum selecionado';
    else if (marcados === total) label = 'Todos os usuários (' + total + ')';
    else if (marcados === 1) {
      const id = $chks.filter(':checked').val();
      const u = (store.usuarios || []).find(x => (x._id || x.id) === id);
      label = u ? (u.sigla + ' — ' + u.nome) : '1 selecionado';
    } else {
      label = marcados + ' selecionados';
    }
    $('#rel-perf-esp-btn-label').text(label);
  }

  static _lerFiltros() {
    const $chks    = $('.rel-perf-esp-chk');
    const total    = $chks.length;
    const marcados = $chks.filter(':checked').map(function() { return this.value; }).get();

    /* Se todos marcados (ou nenhum populado ainda), passa null = sem filtro */
    const espFiltro = (total > 0 && marcados.length < total) ? marcados : null;

    return {
      periodo:       $('#rel-perf-periodo').val() || 'ultimos-30',
      dtIni:         $('#rel-perf-dt-inicio').val(),
      dtFim:         $('#rel-perf-dt-fim').val(),
      filial:        $('#rel-perf-filial').val() || '',
      ordem:         $('#rel-perf-ordem').val()  || 'vendas',
      especialistas: espFiltro,
    };
  }

  static onFiltroChange() {
    const periodo = $('#rel-perf-periodo').val();
    if (periodo === 'custom') $('#rel-perf-custom-wrap').show();
    else                       $('#rel-perf-custom-wrap').hide();
    PerformanceEspecialistasModule.renderRelatorio();
  }

  static _dentroPeriodo(dataStr, filtros) {
    if (!dataStr) return filtros.periodo === 'todos';
    const [inicio, fim] = PerformanceEspecialistasModule._resolverPeriodo(filtros.periodo, filtros.dtIni, filtros.dtFim);
    if (!inicio && !fim) return true;
    const dt = new Date(dataStr);
    if (inicio && dt < inicio) return false;
    if (fim    && dt > fim)    return false;
    return true;
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

  static _parseMoeda(str) {
    if (typeof str === 'number') return str;
    if (!str) return 0;
    return parseFloat(String(str).replace(/[^0-9.,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
  }

  /* ================================================================
     EXPORTAÇÃO EXCEL
     ================================================================ */
  static async exportarExcel() {
    if (typeof ExcelJS === 'undefined') {
      Toast.show('Biblioteca ExcelJS não carregada.', 'danger');
      return;
    }

    const filtros = PerformanceEspecialistasModule._lerFiltros();

    /* Chamado #112 — busca ligações/vendas completas direto do banco
       (sem os limites 200/500 do cache de boot), pra que "Todos os
       períodos" realmente traga tudo desde o início da operação. */
    const fontesCompleto = {
      ligacoes: (typeof SupabaseSync !== 'undefined' && SupabaseSync.buscarLigacoesCompleto) ? await SupabaseSync.buscarLigacoesCompleto() : (store.ligacoes || []),
      vendas:   (typeof SupabaseSync !== 'undefined' && SupabaseSync.buscarVendasCompleto)   ? await SupabaseSync.buscarVendasCompleto()   : (store.vendas || []),
    };
    const stats = PerformanceEspecialistasModule._calcular(filtros, fontesCompleto);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Beyond CRM';
    wb.created = new Date();

    const ws = wb.addWorksheet('Performance');
    ws.columns = [
      { header: 'Rank',              key: 'rank',    width: 8 },
      { header: 'Sigla',             key: 'sigla',   width: 10 },
      { header: 'Nome',              key: 'nome',    width: 28 },
      { header: 'Filial',            key: 'filial',  width: 16 },
      { header: 'Leads captados',    key: 'leads',   width: 16 },
      { header: 'Ligações',          key: 'lig',     width: 12 },
      { header: 'Agendamentos',      key: 'agend',   width: 14 },
      { header: 'Visitas',           key: 'visitas', width: 12 },
      { header: 'Vendas',            key: 'vendas',  width: 10 },
      { header: 'Taxa conv. (%)',    key: 'taxa',    width: 14 },
      { header: 'Ticket médio (R$)', key: 'ticket',  width: 18 },
      { header: 'Mensal. (R$)',      key: 'mensal',  width: 16 },
      { header: 'Meta vendas',       key: 'metaV',   width: 12 },
      { header: '% meta vendas',     key: 'pctV',    width: 14 },
      { header: 'Meta mensal. (R$)', key: 'metaM',   width: 18 },
      { header: '% meta mensal.',    key: 'pctM',    width: 14 },
    ];
    const header = ws.getRow(1);
    header.font   = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
    header.height = 20;

    stats.forEach((s, i) => {
      const row = ws.addRow({
        rank:    i + 1,
        sigla:   s.sigla,
        nome:    s.nome,
        filial:  s.filial,
        leads:   s.leads,
        lig:     s.lig,
        agend:   s.agend,
        visitas: s.visitas,
        vendas:  s.vendas,
        taxa:    Number(s.taxaConversao.toFixed(2)),
        ticket:  Number(s.ticketMedio.toFixed(2)),
        mensal:  Number(s.mensal.toFixed(2)),
        metaV:   s.metaVendas,
        pctV:    s.pctVendas,
        metaM:   Number(s.metaMensal.toFixed(2)),
        pctM:    s.pctMensal,
      });
      if (i === 0)      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      else if (i === 1) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
      else if (i === 2) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFED7AA' } };
    });

    const wsInfo = wb.addWorksheet('Informações');
    wsInfo.getColumn('A').width = 32;
    wsInfo.getColumn('B').width = 48;

    /* Descrição amigável do filtro de especialistas */
    let descEsp;
    if (!Array.isArray(filtros.especialistas)) descEsp = 'Todos os usuários';
    else if (filtros.especialistas.length === 0) descEsp = 'Nenhum selecionado';
    else if (filtros.especialistas.length === 1) {
      const u = (store.usuarios || []).find(x => (x._id || x.id) === filtros.especialistas[0]);
      descEsp = u ? (u.sigla + ' — ' + u.nome) : filtros.especialistas[0];
    } else {
      descEsp = filtros.especialistas.length + ' usuários selecionados';
    }

    const rows = [
      ['Relatório',                'Performance individual por especialista'],
      ['Data de geração',          new Date().toLocaleString('pt-BR')],
      ['Especialistas listados',   stats.length],
      ['Período',                  $('#rel-perf-periodo option:selected').text()],
      ['Filial filtrada',          $('#rel-perf-filial option:selected').text()],
      ['Especialistas filtrados',  descEsp],
      ['Ordenação',                $('#rel-perf-ordem option:selected').text()],
    ];
    rows.forEach(([k, v]) => {
      const r = wsInfo.addRow([k, v]);
      r.getCell(1).font = { bold: true };
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const nome = 'BeyondCRM_Performance_' + new Date().toISOString().slice(0, 10) + '.xlsx';

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    Toast.show('Relatório exportado: ' + nome, 'success');
  }
}

if (typeof window !== 'undefined') window.PerformanceEspecialistasModule = PerformanceEspecialistasModule;
