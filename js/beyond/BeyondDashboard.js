/* ============================================================
   BEYOND CRM — js/beyond/BeyondDashboard.js
   "Beyond Insights": faixa de KPIs, evolução diária, conversão
   por etapa, coortes de leads (heatmap) e ranking da equipe.
   Beyond Bits Tecnologia © 2026

   Tudo é calculado a partir do `store` (mesmos dados do resto do
   app) e respeita o período e o filtro de usuários do Dashboard
   (FunilModule._resolverPeriodoDashboard / _filtroUsuariosDashboardSet).
   Os gráficos são SVG desenhados aqui, sem biblioteca externa.

   Re-renderiza quando o FunilModule atualiza os KPIs (boot, troca de
   período, filtros, Realtime) e ao redimensionar a janela.

   Tema Violeta (BX_TEMA === 'violeta'): KPIs com ícone + minigráfico
   próprio, evolução em BARRAS (7D / 30D / 12M), insight do período,
   últimas vendas, rosca de origem das vendas e ligações da semana.
   O tema Laranja mantém o layout original.
   ============================================================ */
'use strict';

var BeyondDashboard = (function() {

  var DIA = 864e5;
  var VIOLETA = window.BX_TEMA === 'violeta';
  var COR = window.BX_COR || { accent: '#FF6B05', accent2: '#FF8A3D', deep: '#E05A00', rgb: '255, 107, 5', up: '#3DDC84', serie: ['#FF6B05'] };
  var JANELAS = VIOLETA ? [7, 30, 365] : [7, 30, 90];
  var estado = { metrica: 'receita', janela: 30 };
  var _timer = null;
  var _svgSeq = 0;   /* ids únicos de gradientes SVG */

  /* ── helpers de formatação ── */
  function esc(s) { return (typeof Utils !== 'undefined' && Utils.escHtml) ? Utils.escHtml(String(s)) : String(s); }
  function num(n, casas) {
    return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas || 0, maximumFractionDigits: casas || 0 });
  }
  function brl(n, curto) {
    n = Number(n || 0);
    if (curto && Math.abs(n) >= 1000) return 'R$ ' + num(n / 1000, n >= 10000 ? 0 : 1) + ' mil';
    return 'R$ ' + num(n, curto ? 0 : 2);
  }
  function diaMes(d) { return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); }
  function inicioDia(ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function ts(v) { var t = v ? new Date(v).getTime() : NaN; return isNaN(t) ? null : t; }

  /* ── fontes de dados (respeitando filtro de usuários do dashboard) ── */
  function usuariosFiltro() {
    try { return (FunilModule._filtroUsuariosDashboardSet && FunilModule._filtroUsuariosDashboardSet()) || null; }
    catch (e) { return null; }
  }
  function dados() {
    var set = usuariosFiltro();
    var ok = function(id) { return !set || set.has(id); };
    return {
      leads: (store.leads || []).filter(function(l) { return !l.lead_pai_id && ok(l.responsavel_id || l.captador_id); }),
      vendas: (store.vendas || []).filter(function(v) { return ok(v._esp_id); }),
      ligacoes: (store.ligacoes || []).filter(function(l) { return ok(l._esp_id); }),
      set: set,
    };
  }
  function periodo() {
    var p = null;
    try { p = FunilModule._resolverPeriodoDashboard && FunilModule._resolverPeriodoDashboard(); } catch (e) { p = null; }
    var fim = (p && p.fim) ? new Date(p.fim).getTime() : Date.now();
    var ini = (p && p.inicio) ? new Date(p.inicio).getTime() : fim - 30 * DIA;
    if (fim > Date.now()) fim = Date.now();
    if (ini < 0 || fim - ini > 400 * DIA) ini = fim - 365 * DIA;   /* "sem período": compara o último ano */
    var len = Math.max(fim - ini, DIA);
    return { ini: ini, fim: fim, pIni: ini - len, pFim: ini };
  }
  function entre(t, a, b) { return t != null && t >= a && t <= b; }

  /* ── delta formatado ── */
  function delta(atual, anterior, modo) {
    if (modo === 'pts') {
      var d = atual - anterior;
      var cls = Math.abs(d) < .05 ? 'flat' : (d > 0 ? 'up' : 'down');
      var seta = cls === 'up' ? '↑' : cls === 'down' ? '↓' : '→';
      return '<div class="bx-kpi-delta ' + cls + '">' + seta + ' ' + num(Math.abs(d), 1) + ' pts <span>vs período anterior</span></div>';
    }
    if (!anterior) {
      return atual ? '<div class="bx-kpi-delta up">↑ novo <span>sem base no período anterior</span></div>'
                   : '<div class="bx-kpi-delta flat">→ 0% <span>vs período anterior</span></div>';
    }
    var pct = (atual - anterior) / anterior * 100;
    var c = Math.abs(pct) < .5 ? 'flat' : (pct > 0 ? 'up' : 'down');
    var s = c === 'up' ? '↑' : c === 'down' ? '↓' : '→';
    return '<div class="bx-kpi-delta ' + c + '">' + s + ' ' + num(Math.abs(pct), 0) + '% <span>vs período anterior</span></div>';
  }

  /* ================================================================
     KPIs
     ================================================================ */
  function renderKpis(D, P) {
    var $el = document.getElementById('bx-kpis');
    if (!$el) return;

    var vendasP  = D.vendas.filter(function(v) { return entre(ts(v.dataVenda), P.ini, P.fim); });
    var vendasA  = D.vendas.filter(function(v) { return entre(ts(v.dataVenda), P.pIni, P.pFim); });
    var leadsP   = D.leads.filter(function(l) { return entre(ts(l._createdAt), P.ini, P.fim); });
    var leadsA   = D.leads.filter(function(l) { return entre(ts(l._createdAt), P.pIni, P.pFim); });
    var receita  = function(arr) { return arr.reduce(function(a, v) { return a + (Number(v.valorMensalidade) || 0); }, 0); };
    var recP = receita(vendasP), recA = receita(vendasA);
    var convP = leadsP.length ? vendasP.length / leadsP.length * 100 : 0;
    var convA = leadsA.length ? vendasA.length / leadsA.length * 100 : 0;
    var ticket = vendasP.length ? recP / vendasP.length : 0;
    var carteira = D.leads.filter(function(l) { return l.etapa === 'carteira' && !l.arquivado; });
    var novosCart = carteira.filter(function(l) { return entre(ts(l.carteira_em), P.ini, P.fim); }).length;

    /* sparkline: receita por semana (últimas 8 semanas) */
    var semanas = [];
    var hoje = inicioDia(Date.now()) + DIA;
    for (var i = 7; i >= 0; i--) {
      var a = hoje - (i + 1) * 7 * DIA, b = hoje - i * 7 * DIA;
      semanas.push(receita(D.vendas.filter(function(v) { var t = ts(v.dataVenda); return t != null && t >= a && t < b; })));
    }

    if (VIOLETA) {
      renderKpisV2($el, D, P, { recP: recP, recA: recA, vendasP: vendasP, vendasA: vendasA, leadsP: leadsP, leadsA: leadsA,
        convP: convP, convA: convA, ticket: ticket, carteira: carteira, novosCart: novosCart, receitaSemanal: semanas });
      return;
    }
    $el.classList.remove('v2');
    $el.innerHTML =
      '<div class="bx-kpi bx-kpi-hero">' +
        '<div class="bx-kpi-main"><div>' +
          '<div class="bx-kpi-lbl">Receita mensal nova <i class="bi bi-info-circle" title="Soma das mensalidades das vendas fechadas no período selecionado."></i></div>' +
          '<div class="bx-kpi-val" title="' + brl(recP) + '">R$ ' + num(recP) + '</div>' +
          delta(recP, recA) +
        '</div>' + sparkline(semanas) + '</div>' +
      '</div>' +
      cardKpi('Vendas', num(vendasP.length), delta(vendasP.length, vendasA.length), 'Ticket médio ' + brl(ticket)) +
      cardKpi('Leads', num(leadsP.length), delta(leadsP.length, leadsA.length)) +
      cardKpi('Conversão', num(convP, 1) + '<small>%</small>', delta(convP, convA, 'pts'), null, 'Vendas ÷ leads que entraram no período') +
      cardKpi('Associados', num(carteira.length), '<div class="bx-kpi-delta ' + (novosCart ? 'up' : 'flat') + '">' + (novosCart ? '↑ ' : '→ ') + num(novosCart) + ' <span>novos no período</span></div>');
  }

  function cardKpi(lbl, val, deltaHtml, rodape, dica) {
    return '<div class="bx-kpi">' +
      '<div class="bx-kpi-lbl">' + lbl + (dica ? ' <i class="bi bi-info-circle" title="' + esc(dica) + '"></i>' : '') + '</div>' +
      '<div class="bx-kpi-val">' + val + '</div>' + deltaHtml +
      (rodape ? '<div class="bx-card-sub" style="margin-top:6px;">' + esc(rodape) + '</div>' : '') +
    '</div>';
  }

  function sparkline(vals, cor, cls) {
    cor = cor || COR.accent;
    var gid = 'bxSparkG' + (++_svgSeq);
    var W = 170, H = 64, max = Math.max.apply(null, vals.concat([1]));
    var pts = vals.map(function(v, i) { return { x: 4 + i * (W - 8) / (vals.length - 1), y: H - 6 - (v / max) * (H - 14) }; });
    var d = caminhoSuave(pts);
    var ult = pts[pts.length - 1];
    return '<svg class="' + (cls || 'bx-spark') + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<defs><linearGradient id="' + gid + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + cor + '" stop-opacity=".35"/><stop offset="1" stop-color="' + cor + '" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + d + ' L' + ult.x + ',' + H + ' L' + pts[0].x + ',' + H + ' Z" fill="url(#' + gid + ')"/>' +
      '<path d="' + d + '" fill="none" stroke="' + cor + '" stroke-width="2.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
    '</svg>';
  }

  /* Curva monotônica (Fritsch–Carlson): suave sem "passar" abaixo de zero */
  function caminhoSuave(p) {
    var n = p.length;
    if (!n) return '';
    if (n === 1) return 'M' + p[0].x + ',' + p[0].y;
    var dx = [], m = [], t = [], i;
    for (i = 0; i < n - 1; i++) { dx[i] = p[i + 1].x - p[i].x; m[i] = (p[i + 1].y - p[i].y) / (dx[i] || 1); }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (i = 1; i < n - 1; i++) t[i] = (m[i - 1] * m[i] <= 0) ? 0 : (m[i - 1] + m[i]) / 2;
    for (i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      var a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
      if (s > 9) { var k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    var d = 'M' + p[0].x.toFixed(1) + ',' + p[0].y.toFixed(1);
    for (i = 0; i < n - 1; i++) {
      var h = dx[i] / 3;
      d += ' C' + (p[i].x + h).toFixed(1) + ',' + (p[i].y + t[i] * h).toFixed(1) + ' ' +
                  (p[i + 1].x - h).toFixed(1) + ',' + (p[i + 1].y - t[i + 1] * h).toFixed(1) + ' ' +
                  p[i + 1].x.toFixed(1) + ',' + p[i + 1].y.toFixed(1);
    }
    return d;
  }

  function maxBonito(v) {
    if (v <= 0) return 4;
    var exp = Math.pow(10, Math.floor(Math.log10(v)));
    var passos = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < passos.length; i++) { if (passos[i] * exp * 4 >= v) return passos[i] * exp * 4; }
    return 40 * exp;
  }

  /* ================================================================
     EVOLUÇÃO (gráfico de área)
     ================================================================ */
  var ROTULO_METRICA = { receita: 'da Receita', vendas: 'das Vendas', leads: 'dos Leads', ligacoes: 'das Ligações' };

  function serieDiaria(D, metrica, janela) {
    var suavizar = janela > 7;
    var extra = suavizar ? 6 : 0;
    var hoje0 = inicioDia(Date.now());
    var ini = hoje0 - (janela - 1 + extra) * DIA;
    var brutos = new Array(janela + extra).fill(0);
    function soma(t, v) {
      if (t == null) return;
      var idx = Math.floor((inicioDia(t) - ini) / DIA);
      if (idx >= 0 && idx < brutos.length) brutos[idx] += v;
    }
    if (metrica === 'receita') D.vendas.forEach(function(v) { soma(ts(v.dataVenda), Number(v.valorMensalidade) || 0); });
    if (metrica === 'vendas')  D.vendas.forEach(function(v) { soma(ts(v.dataVenda), 1); });
    if (metrica === 'leads')   D.leads.forEach(function(l) { soma(ts(l._createdAt), 1); });
    if (metrica === 'ligacoes') D.ligacoes.forEach(function(l) { soma(ts(l._data_hora || l._created_at), 1); });

    var serie = [];
    for (var i = 0; i < janela; i++) {
      var j = i + extra, v = brutos[j];
      if (suavizar) { v = 0; for (var k = j - 6; k <= j; k++) v += brutos[k]; }
      serie.push({ data: new Date(ini + j * DIA), v: v });
    }
    return { serie: serie, suavizada: suavizar };
  }

  function renderTendencia(D) {
    var box = document.getElementById('bx-trend-chart');
    if (!box) return;
    if (VIOLETA) { renderBarras(D, box); return; }
    var r = serieDiaria(D, estado.metrica, estado.janela);
    var s = r.serie;
    var lbl = document.getElementById('bx-trend-metric-lbl');
    if (lbl) lbl.textContent = ROTULO_METRICA[estado.metrica];
    var sub = document.getElementById('bx-trend-sub');
    if (sub) sub.textContent = 'Últimos ' + estado.janela + ' dias · ' + (r.suavizada ? 'soma móvel de 7 dias' : 'valor por dia');

    var W = Math.max(box.clientWidth, 280), H = box.clientHeight || 260;
    var mL = estado.metrica === 'receita' ? 64 : 36, mR = 16, mT = 16, mB = 30;
    var iw = W - mL - mR, ih = H - mT - mB;
    var max = maxBonito(Math.max.apply(null, s.map(function(p) { return p.v; })));
    var x = function(i) { return mL + (s.length === 1 ? iw / 2 : i * iw / (s.length - 1)); };
    var y = function(v) { return mT + ih - (v / max) * ih; };
    var pts = s.map(function(p, i) { return { x: x(i), y: y(p.v) }; });
    var fmt = estado.metrica === 'receita' ? function(v) { return brl(v, true); } : function(v) { return num(v); };

    var grade = '', eixoY = '';
    for (var g = 0; g <= 4; g++) {
      var val = max * g / 4, yy = y(val);
      grade += '<line class="bx-grid-line" x1="' + mL + '" x2="' + (W - mR) + '" y1="' + yy + '" y2="' + yy + '"/>';
      eixoY += '<text x="' + (mL - 10) + '" y="' + (yy + 4) + '" text-anchor="end">' + fmt(val) + '</text>';
    }
    var nX = W < 520 ? 4 : 7, eixoX = '';
    for (var q = 0; q < nX; q++) {
      var ix = Math.round(q * (s.length - 1) / (nX - 1));
      eixoX += '<text x="' + x(ix) + '" y="' + (H - 8) + '" text-anchor="middle">' + diaMes(s[ix].data) + '</text>';
    }
    var d = caminhoSuave(pts);
    var u = pts[pts.length - 1];
    box.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gráfico da evolução ' + esc(ROTULO_METRICA[estado.metrica]) + '">' +
        '<defs><linearGradient id="bxAreaG" x1="0" x2="0" y1="0" y2="1">' +
          '<stop offset="0" stop-color="' + COR.accent + '" stop-opacity=".38"/><stop offset=".7" stop-color="' + COR.accent + '" stop-opacity=".06"/><stop offset="1" stop-color="' + COR.accent + '" stop-opacity="0"/>' +
        '</linearGradient>' +
        '<filter id="bxGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter></defs>' +
        '<g class="bx-axis">' + grade + eixoY + eixoX + '</g>' +
        '<path d="' + d + ' L' + u.x + ',' + (mT + ih) + ' L' + pts[0].x + ',' + (mT + ih) + ' Z" fill="url(#bxAreaG)"/>' +
        '<path d="' + d + '" fill="none" stroke="' + COR.accent + '" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<g id="bx-cursor"><line id="bx-cur-line" x1="' + u.x + '" x2="' + u.x + '" y1="' + u.y + '" y2="' + (mT + ih) + '" stroke="' + COR.accent + '" stroke-opacity=".7" stroke-width="1.5"/>' +
          '<circle id="bx-cur-glow" cx="' + u.x + '" cy="' + u.y + '" r="9" fill="' + COR.accent + '" opacity=".45" filter="url(#bxGlow)"/>' +
          '<circle id="bx-cur-dot" cx="' + u.x + '" cy="' + u.y + '" r="5" fill="' + COR.accent + '" stroke="#0A0A0A" stroke-width="2"/></g>' +
        '<rect id="bx-hit" x="' + mL + '" y="' + mT + '" width="' + iw + '" height="' + ih + '" fill="transparent"/>' +
      '</svg>' +
      '<div class="bx-tip" id="bx-tip"></div>';

    var tip = document.getElementById('bx-tip');
    function mostrar(i) {
      var p = pts[i], dado = s[i];
      ['bx-cur-line'].forEach(function(id) { var el = document.getElementById(id); el.setAttribute('x1', p.x); el.setAttribute('x2', p.x); el.setAttribute('y1', p.y); });
      ['bx-cur-glow', 'bx-cur-dot'].forEach(function(id) { var el = document.getElementById(id); el.setAttribute('cx', p.x); el.setAttribute('cy', p.y); });
      var dataTxt = dado.data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
      tip.innerHTML = esc(dataTxt) + '<b>' + (estado.metrica === 'receita' ? brl(dado.v) : num(dado.v)) + '</b>';
      var left = p.x / W * box.clientWidth;
      left = Math.min(Math.max(left, 70), box.clientWidth - 70);
      tip.style.left = left + 'px';
      tip.style.top = (p.y / H * box.clientHeight) + 'px';
    }
    mostrar(pts.length - 1);
    var hit = document.getElementById('bx-hit');
    function mover(ev) {
      var rect = box.getBoundingClientRect();
      var cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left) * W / rect.width;
      var i = Math.round((cx - mL) / (iw / Math.max(s.length - 1, 1)));
      mostrar(Math.max(0, Math.min(s.length - 1, i)));
    }
    hit.addEventListener('mousemove', mover);
    hit.addEventListener('touchmove', mover, { passive: true });
    hit.addEventListener('touchstart', mover, { passive: true });
    hit.addEventListener('mouseleave', function() { mostrar(pts.length - 1); });
  }

  /* ================================================================
     CONVERSÃO POR ETAPA
     ================================================================ */
  function renderConversao(D) {
    var el = document.getElementById('bx-conv');
    if (!el) return;
    var ordem = (typeof STAGE_ORDER !== 'undefined') ? STAGE_ORDER : ['lead', 'ligacao', 'agendamento', 'visita', 'venda', 'carteira'];
    var alcancou = ordem.map(function(_, i) {
      return D.leads.filter(function(l) { return ordem.indexOf(l.etapa) >= i; }).length;
    });
    var metas = {};
    try { metas = TaxaConversaoModule._metas(); } catch (e) { metas = {}; }
    var linhas = [
      ['Lead → Ligação',        'bi-telephone',       metas.lead_ligacao],
      ['Ligação → Agendamento', 'bi-calendar-check',  metas.ligacao_agendam],
      ['Agendamento → Visita',  'bi-house-door',      metas.agendam_visita],
      ['Visita → Venda',        'bi-currency-dollar', metas.visita_venda],
      ['Venda → Carteira',      'bi-wallet2',         metas.venda_carteira],
    ];
    el.innerHTML = linhas.map(function(l, i) {
      var de = alcancou[i], para = alcancou[i + 1];
      var pct = de ? Math.round(para / de * 100) : 0;
      var meta = (l[2] != null) ? Math.min(Number(l[2]), 100) : null;
      return '<div class="bx-fator">' +
        '<div class="bx-fator-ico"><i class="bi ' + l[1] + '"></i></div>' +
        '<div><div class="bx-fator-nome">' + l[0] + '<small>' + num(para) + ' de ' + num(de) + '</small></div>' +
          '<div class="bx-bar" title="Meta: ' + (meta != null ? num(meta, 1) + '%' : '—') + '"><i style="width:' + Math.min(pct, 100) + '%"></i>' +
          (meta != null ? '<em style="left:calc(' + meta + '% - 1px)"></em>' : '') + '</div></div>' +
        '<div class="bx-fator-val">' + pct + '<small style="font-size:12px;color:var(--bx-txt-3);">%</small></div>' +
      '</div>';
    }).join('');
  }

  /* ================================================================
     COORTES (heatmap)
     ================================================================ */
  function renderCoortes(D) {
    var el = document.getElementById('bx-heatmap');
    if (!el) return;
    var ordem = (typeof STAGE_ORDER !== 'undefined') ? STAGE_ORDER : ['lead', 'ligacao', 'agendamento', 'visita', 'venda', 'carteira'];
    var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    var seg = new Date(hoje); seg.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7)); /* segunda desta semana */
    var colunas = [['ligacao', 'Ligação'], ['agendamento', 'Agend.'], ['visita', 'Visita'], ['venda', 'Venda'], ['carteira', 'Carteira']];

    var linhas = '';
    for (var w = 0; w < 6; w++) {
      var a = new Date(seg); a.setDate(seg.getDate() - w * 7);
      var b = new Date(a); b.setDate(a.getDate() + 7);
      var coorte = D.leads.filter(function(l) { var t = ts(l._createdAt); return t != null && t >= a.getTime() && t < b.getTime(); });
      var fimTxt = new Date(b.getTime() - DIA);
      var html = '<td class="lbl">' + diaMes(a) + ' – ' + diaMes(fimTxt) + (w === 0 ? ' <span style="color:var(--bx-orange-2);font-size:11px;">• atual</span>' : '') + '</td>' +
                 '<td class="n">' + coorte.length + '</td>';
      colunas.forEach(function(c) {
        if (!coorte.length) { html += '<td class="vazio">–</td>'; return; }
        var idx = ordem.indexOf(c[0]);
        var n = coorte.filter(function(l) { return ordem.indexOf(l.etapa) >= idx; }).length;
        var pct = Math.round(n / coorte.length * 100);
        var alpha = pct === 0 ? .05 : .1 + .85 * Math.pow(pct / 100, .75);
        var cor = (alpha > .55 && !VIOLETA) ? '#0A0A0A' : '#F2F2F2';
        html += '<td style="background:rgba(' + COR.rgb + ',' + alpha.toFixed(2) + ');color:' + cor + ';" title="' + n + ' de ' + coorte.length + ' leads">' + pct + '%</td>';
      });
      linhas += '<tr>' + html + '</tr>';
    }
    el.innerHTML = '<table class="bx-heat"><thead><tr><th>Semana de entrada</th><th>Leads</th>' +
      colunas.map(function(c) { return '<th>' + c[1] + '</th>'; }).join('') + '</tr></thead><tbody>' + linhas + '</tbody></table>';
  }

  /* ================================================================
     RANKING (ciclo de comissão atual × meta)
     ================================================================ */
  function cicloAtual() {
    var h = new Date();
    var mesIni = h.getDate() >= 26 ? h.getMonth() : h.getMonth() - 1;
    var ini = new Date(h.getFullYear(), mesIni, 26, 0, 0, 0, 0);
    var fim = new Date(h.getFullYear(), mesIni + 1, 25, 23, 59, 59, 999);
    return { ini: ini, fim: fim };
  }

  function renderRanking(D) {
    var el = document.getElementById('bx-ranking');
    if (!el) return;
    var c = cicloAtual();
    var sub = document.getElementById('bx-rank-sub');
    if (sub) sub.textContent = 'Vendas no ciclo ' + diaMes(c.ini) + ' → ' + diaMes(c.fim) + ' × meta';

    var eu = (typeof AuthService !== 'undefined' && AuthService.currentProfile) ? AuthService.currentProfile : null;
    var donosVisiveis = {};
    D.leads.forEach(function(l) { donosVisiveis[l.responsavel_id] = true; });
    var equipe = (store.usuarios || []).filter(function(u) {
      if (u.perfil !== 'especialista' || u.status === 'inativo') return false;
      if (D.set && !D.set.has(u._id)) return false;
      if (eu && eu.perfil !== 'gerente' && !donosVisiveis[u._id] && u._id !== eu.id) return false;
      return true;
    });
    var linhas = equipe.map(function(u) {
      var vendas = D.vendas.filter(function(v) { return v._esp_id === u._id && entre(ts(v.dataVenda), c.ini.getTime(), c.fim.getTime()); }).length;
      var meta = Number(u.meta_vendas) || 0;
      return { nome: u.nome, vendas: vendas, meta: meta, pct: meta ? vendas / meta * 100 : 0 };
    }).sort(function(a, b) { return b.pct - a.pct || b.vendas - a.vendas; }).slice(0, 6);

    if (!linhas.length) { el.innerHTML = '<div class="bx-vazio">Nenhum especialista no filtro atual.</div>'; return; }
    el.innerHTML = linhas.map(function(r, i) {
      var primeiro = r.nome.split(' ')[0], resto = r.nome.split(' ').slice(1).join(' ');
      return '<div class="bx-rank-row" title="' + esc(r.nome) + ': ' + r.vendas + ' de ' + r.meta + ' vendas">' +
        '<div class="bx-rank-nome">' + esc(primeiro) + (resto ? ' ' + esc(resto.charAt(0)) + '.' : '') + '</div>' +
        '<div class="bx-rank-track"><div class="bx-rank-fill f' + (i + 1) + '" style="width:' + Math.min(r.pct, 100).toFixed(1) + '%"></div>' +
          '<span class="bx-rank-meta">' + r.vendas + '/' + (r.meta || '—') + '</span></div>' +
        '<div class="bx-rank-pct">' + Math.round(r.pct) + '%</div>' +
      '</div>';
    }).join('') +
    '<div class="bx-rank-axis"><div></div><div><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div><div></div></div>';
  }

  /* ================================================================
     TEMA VIOLETA — componentes extras
     ================================================================ */
  var MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  var DIAS_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  function um() { return 1; }
  function mensalidade(v) { return Number(v.valorMensalidade) || 0; }

  /* soma por semana (últimas 8 semanas, da mais antiga pra mais recente) */
  function semanal(arr, campoTs, valorFn) {
    var out = [], fimHoje = inicioDia(Date.now()) + DIA;
    for (var i = 7; i >= 0; i--) {
      var a = fimHoje - (i + 1) * 7 * DIA, b = fimHoje - i * 7 * DIA, soma = 0;
      for (var j = 0; j < arr.length; j++) { var t = ts(campoTs(arr[j])); if (t != null && t >= a && t < b) soma += valorFn(arr[j]); }
      out.push(soma);
    }
    return out;
  }

  /* fonte de cada métrica do gráfico: [lista, timestamp, valor] */
  function fonteMetrica(D, metrica) {
    if (metrica === 'receita') return [D.vendas, function(v) { return v.dataVenda; }, mensalidade];
    if (metrica === 'vendas')  return [D.vendas, function(v) { return v.dataVenda; }, um];
    if (metrica === 'leads')   return [D.leads, function(l) { return l._createdAt; }, um];
    return [D.ligacoes, function(l) { return l._data_hora || l._created_at; }, um];
  }
  function totalEntre(D, metrica, a, b) {
    var f = fonteMetrica(D, metrica), soma = 0;
    f[0].forEach(function(x) { var t = ts(f[1](x)); if (t != null && t >= a && t < b) soma += f[2](x); });
    return soma;
  }

  /* ── KPIs com ícone + minigráfico próprio ── */
  function renderKpisV2(el, D, P, k) {
    el.classList.add('v2');
    var vendasSem = semanal(D.vendas, function(v) { return v.dataVenda; }, um);
    var leadsSem  = semanal(D.leads, function(l) { return l._createdAt; }, um);
    var convSem   = vendasSem.map(function(v, i) { return leadsSem[i] ? v / leadsSem[i] * 100 : 0; });
    var cartSem   = semanal(D.leads.filter(function(l) { return l.carteira_em; }), function(l) { return l.carteira_em; }, um);
    var cards = [
      { lbl: 'Receita mensal nova', ico: 'bi-wallet2', cor: COR.serie[0], val: 'R$ ' + num(k.recP), titulo: brl(k.recP),
        delta: delta(k.recP, k.recA), serie: k.receitaSemanal, dica: 'Soma das mensalidades das vendas fechadas no período selecionado.' },
      { lbl: 'Vendas', ico: 'bi-bag-check', cor: COR.up, val: num(k.vendasP.length), titulo: 'Ticket médio ' + brl(k.ticket),
        delta: delta(k.vendasP.length, k.vendasA.length), serie: vendasSem },
      { lbl: 'Leads', ico: 'bi-person-plus', cor: '#38BDF8', val: num(k.leadsP.length),
        delta: delta(k.leadsP.length, k.leadsA.length), serie: leadsSem },
      { lbl: 'Conversão', ico: 'bi-graph-up-arrow', cor: COR.accent2, val: num(k.convP, 1) + '<small>%</small>',
        delta: delta(k.convP, k.convA, 'pts'), serie: convSem, dica: 'Vendas ÷ leads que entraram no período' },
      { lbl: 'Associados', ico: 'bi-people', cor: '#F59E0B', val: num(k.carteira.length),
        delta: '<div class="bx-kpi-delta ' + (k.novosCart ? 'up' : 'flat') + '">' + (k.novosCart ? '↑ ' : '→ ') + num(k.novosCart) + ' <span>novos no período</span></div>',
        serie: cartSem },
    ];
    el.innerHTML = cards.map(function(c) {
      return '<div class="bx-kpi bx-kv" style="--kv-cor:' + c.cor + '">' +
        '<div class="bx-kv-top"><div class="bx-kpi-lbl">' + c.lbl + (c.dica ? ' <i class="bi bi-info-circle" title="' + esc(c.dica) + '"></i>' : '') + '</div>' +
          '<div class="bx-kv-ico"><i class="bi ' + c.ico + '"></i></div></div>' +
        '<div class="bx-kpi-val"' + (c.titulo ? ' title="' + esc(c.titulo) + '"' : '') + '>' + c.val + '</div>' +
        c.delta + sparkline(c.serie, c.cor, 'bx-kv-spark') +
      '</div>';
    }).join('');
  }

  /* ── Evolução em barras (7D / 30D por dia · 12M por mês) ── */
  function renderBarras(D, box) {
    var metrica = estado.metrica, janela = estado.janela, mensal = janela > 90;
    var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    var b = [];
    if (mensal) {
      for (var i = 11; i >= 0; i--) {
        var a = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1), z = new Date(hoje.getFullYear(), hoje.getMonth() - i + 1, 1);
        b.push({ a: a.getTime(), b: z.getTime(), rotulo: MESES_CURTO[a.getMonth()],
                 dica: a.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }), v: 0 });
      }
    } else {
      for (var j = janela - 1; j >= 0; j--) {
        var d0 = hoje.getTime() - j * DIA, dt = new Date(d0);
        b.push({ a: d0, b: d0 + DIA, rotulo: janela <= 7 ? DIAS_CURTO[dt.getDay()] : diaMes(dt),
                 dica: dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }), v: 0 });
      }
    }
    var f = fonteMetrica(D, metrica);
    f[0].forEach(function(x) {
      var t = ts(f[1](x)); if (t == null) return;
      for (var k = 0; k < b.length; k++) { if (t >= b[k].a && t < b[k].b) { b[k].v += f[2](x); return; } }
    });

    /* cabeçalho: total da janela × janela anterior do mesmo tamanho */
    var ini = b[0].a, fim = b[b.length - 1].b;
    var total = b.reduce(function(s, x) { return s + x.v; }, 0);
    var anterior = mensal ? totalEntre(D, metrica, new Date(new Date(ini).setFullYear(new Date(ini).getFullYear() - 1)).getTime(), ini)
                          : totalEntre(D, metrica, ini - (fim - ini), ini);
    var fmtVal = metrica === 'receita' ? function(v) { return brl(v); } : function(v) { return num(v); };
    var elTot = document.getElementById('bx-trend-total'), elDel = document.getElementById('bx-trend-delta');
    if (elTot) elTot.textContent = fmtVal(total);
    if (elDel) elDel.outerHTML = delta(total, anterior).replace('class="bx-kpi-delta', 'id="bx-trend-delta" class="bx-kpi-delta');
    var lbl = document.getElementById('bx-trend-metric-lbl');
    if (lbl) lbl.textContent = ROTULO_METRICA[metrica];
    var sub = document.getElementById('bx-trend-sub');
    if (sub) sub.textContent = mensal ? 'Últimos 12 meses · por mês' : 'Últimos ' + janela + ' dias · por dia';

    var W = Math.max(box.clientWidth, 280), H = box.clientHeight || 260;
    var mL = metrica === 'receita' ? 62 : 34, mR = 8, mT = 34, mB = 28;
    var iw = W - mL - mR, ih = H - mT - mB;
    var max = maxBonito(Math.max.apply(null, b.map(function(x) { return x.v; })));
    var slot = iw / b.length, bw = Math.max(3, Math.min(30, slot * .58));
    var fmtEixo = metrica === 'receita' ? function(v) { return brl(v, true); } : function(v) { return num(v); };
    var gid = 'bxBar' + (++_svgSeq);
    var grade = '', eixo = '';
    for (var g = 0; g <= 4; g++) {
      var yy = mT + ih - ih * g / 4;
      grade += '<line class="bx-grid-line" x1="' + mL + '" x2="' + (W - mR) + '" y1="' + yy + '" y2="' + yy + '"/>';
      eixo += '<text x="' + (mL - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + fmtEixo(max * g / 4) + '</text>';
    }
    var passo = Math.ceil(b.length / (W < 520 ? 6 : 12));
    var barras = '';
    b.forEach(function(x, i) {
      var h = x.v / max * ih, xx = mL + slot * i + (slot - bw) / 2, yy = mT + ih - h;
      barras += '<rect class="bx-col" data-i="' + i + '" x="' + xx.toFixed(1) + '" y="' + yy.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(h, 0).toFixed(1) + '" rx="' + Math.min(5, bw / 2).toFixed(1) + '" fill="url(#' + gid + ')"/>';
      if (i % passo === 0 || i === b.length - 1) eixo += '<text x="' + (mL + slot * i + slot / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + x.rotulo + '</text>';
    });
    box.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gráfico de barras ' + esc(ROTULO_METRICA[metrica]) + '">' +
        '<defs><linearGradient id="' + gid + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + COR.accent + '" stop-opacity=".95"/><stop offset="1" stop-color="' + COR.deep + '" stop-opacity=".55"/></linearGradient>' +
        '<linearGradient id="' + gid + 'On" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#E9DDFF"/><stop offset="1" stop-color="' + COR.accent + '"/></linearGradient>' +
        '<filter id="' + gid + 'Glow" x="-60%" y="-30%" width="220%" height="160%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
        '<g class="bx-axis">' + grade + eixo + '</g>' + barras +
        '<rect id="bx-bar-hit" x="' + mL + '" y="' + mT + '" width="' + iw + '" height="' + ih + '" fill="transparent"/>' +
      '</svg><div class="bx-tip" id="bx-tip"></div>';

    var tip = document.getElementById('bx-tip'), atual = null;
    function ativar(i) {
      if (atual != null) { var ant = box.querySelector('.bx-col[data-i="' + atual + '"]'); if (ant) { ant.setAttribute('fill', 'url(#' + gid + ')'); ant.removeAttribute('filter'); } }
      var r = box.querySelector('.bx-col[data-i="' + i + '"]'); if (!r) return;
      r.setAttribute('fill', 'url(#' + gid + 'On)'); r.setAttribute('filter', 'url(#' + gid + 'Glow)');
      atual = i;
      tip.innerHTML = esc(b[i].dica) + '<b>' + fmtVal(b[i].v) + '</b>';
      var cx = (Number(r.getAttribute('x')) + Number(r.getAttribute('width')) / 2) / W * box.clientWidth;
      tip.style.left = Math.min(Math.max(cx, 70), box.clientWidth - 70) + 'px';
      tip.style.top = (Number(r.getAttribute('y')) / H * box.clientHeight) + 'px';
    }
    /* destaca o maior valor (como na referência); hover/toque troca */
    var maior = 0; b.forEach(function(x, i) { if (x.v >= b[maior].v) maior = i; });
    ativar(maior);
    var hit = document.getElementById('bx-bar-hit');
    function mover(ev) {
      var rect = box.getBoundingClientRect();
      var cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left) * W / rect.width;
      ativar(Math.max(0, Math.min(b.length - 1, Math.floor((cx - mL) / slot))));
    }
    hit.addEventListener('mousemove', mover);
    hit.addEventListener('touchstart', mover, { passive: true });
    hit.addEventListener('touchmove', mover, { passive: true });
    hit.addEventListener('mouseleave', function() { ativar(maior); });
  }

  /* ── Insight do período (regras sobre os próprios dados) ── */
  function renderInsight(D, P) {
    var el = document.getElementById('bx-insight-txt');
    if (!el) return;
    var frases = [];
    var recP = totalEntre(D, 'receita', P.ini, P.fim + 1), recA = totalEntre(D, 'receita', P.pIni, P.pFim);
    if (recA) {
      var pct = Math.round((recP - recA) / recA * 100);
      frases.push(pct === 0 ? 'Sua receita nova está <strong>estável</strong> em relação ao período anterior.'
        : 'Sua receita nova está <span class="' + (pct > 0 ? 'up' : 'down') + '">' + Math.abs(pct) + '% ' + (pct > 0 ? 'acima' : 'abaixo') + '</span> do período anterior.' + (pct > 0 ? ' Continue assim!' : ''));
    } else if (recP) {
      frases.push('Você somou <strong>' + brl(recP) + '</strong> em mensalidades novas no período.');
    }
    /* líder do ciclo */
    var c = cicloAtual(), porEsp = {};
    D.vendas.forEach(function(v) { if (entre(ts(v.dataVenda), c.ini.getTime(), c.fim.getTime())) porEsp[v._esp_id] = (porEsp[v._esp_id] || 0) + 1; });
    var lider = Object.keys(porEsp).sort(function(a, b) { return porEsp[b] - porEsp[a]; })[0];
    if (lider) {
      var u = (store.usuarios || []).find(function(x) { return x._id === lider; });
      if (u) frases.push('<strong>' + esc(u.nome) + '</strong> lidera o ciclo com <strong>' + porEsp[lider] + ' venda' + (porEsp[lider] > 1 ? 's' : '') + '</strong>.');
    }
    /* gargalo do funil (pior conversão relativa à meta) */
    var ordem = (typeof STAGE_ORDER !== 'undefined') ? STAGE_ORDER : ['lead', 'ligacao', 'agendamento', 'visita', 'venda', 'carteira'];
    var alc = ordem.map(function(_, i) { return D.leads.filter(function(l) { return ordem.indexOf(l.etapa) >= i; }).length; });
    var metas = {}; try { metas = TaxaConversaoModule._metas(); } catch (e) { metas = {}; }
    var chaves = ['lead_ligacao', 'ligacao_agendam', 'agendam_visita', 'visita_venda', 'venda_carteira'];
    var nomes = ['Lead → Ligação', 'Ligação → Agendamento', 'Agendamento → Visita', 'Visita → Venda', 'Venda → Carteira'];
    var pior = null;
    chaves.forEach(function(ch, i) {
      var meta = Number(metas[ch]); if (!meta || !alc[i]) return;
      var taxa = alc[i + 1] / alc[i] * 100, razao = taxa / meta;
      if (razao < 1 && (!pior || razao < pior.razao)) pior = { nome: nomes[i], taxa: taxa, meta: meta, razao: razao };
    });
    if (pior) frases.push('Ponto de atenção: <strong>' + pior.nome + '</strong> converte ' + Math.round(pior.taxa) + '% (meta ' + num(pior.meta, 0) + '%).');
    else {
      var agora = Date.now();
      var prox = (store.agendamentos || []).filter(function(a) {
        var t = ts(a.data); return t != null && t >= agora && t <= agora + 7 * DIA && a._status !== 'cancelado' && a._status !== 'realizado' && (!D.set || D.set.has(a._esp_id));
      }).length;
      frases.push('Todas as etapas estão na meta de conversão' + (prox ? ' e há <strong>' + prox + ' visita' + (prox > 1 ? 's' : '') + '</strong> agendada' + (prox > 1 ? 's' : '') + ' para os próximos 7 dias.' : '.'));
    }
    el.innerHTML = frases.length ? frases.join(' ') : 'Ainda não há movimento suficiente no período para gerar um insight.';
  }

  /* ── Últimas vendas ── */
  function renderUltimasVendas(D) {
    var el = document.getElementById('bx-ultimas-vendas');
    if (!el) return;
    var lista = D.vendas.slice().sort(function(a, b) { return (ts(b.dataVenda) || 0) - (ts(a.dataVenda) || 0); }).slice(0, 5);
    if (!lista.length) { el.innerHTML = '<div class="bx-vazio">Nenhuma venda registrada ainda.</div>'; return; }
    el.innerHTML = lista.map(function(v) {
      var d = new Date(v.dataVenda);
      var quando = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ', ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      var esp = String(v.espNome || '').split(' ')[0];
      return '<div class="bx-li"><div class="bx-li-ico"><i class="bi bi-bag-check-fill"></i></div>' +
        '<div style="min-width:0"><div class="bx-li-nome">' + esc(v.leadNome || '—') + '</div><div class="bx-li-sub">' + esc(quando) + (esp ? ' · ' + esc(esp) : '') + '</div></div>' +
        '<div class="bx-li-val">+' + brl(mensalidade(v)) + '<small>Mensalidade</small></div></div>';
    }).join('');
  }

  /* ── Rosca: origem das vendas do período (fonte do lead) ── */
  function renderDonut(D, P) {
    var el = document.getElementById('bx-donut');
    if (!el) return;
    var porUuid = {};
    (store.leads || []).forEach(function(l) { porUuid[l._uuid] = l; });
    var grupos = {}, total = 0, receita = 0;
    D.vendas.forEach(function(v) {
      if (!entre(ts(v.dataVenda), P.ini, P.fim)) return;
      var l = porUuid[v._lead_uuid], fonte = (l && l.fonte) || 'Sem fonte';
      if (!grupos[fonte]) grupos[fonte] = { n: 0, r: 0 };
      grupos[fonte].n++; grupos[fonte].r += mensalidade(v); total++; receita += mensalidade(v);
    });
    if (!total) { el.innerHTML = '<div class="bx-vazio">Nenhuma venda no período selecionado.</div>'; return; }
    var itens = Object.keys(grupos).map(function(k) { return { nome: k, n: grupos[k].n, r: grupos[k].r }; }).sort(function(a, b) { return b.n - a.n; });
    if (itens.length > 5) {
      var resto = itens.slice(4).reduce(function(s, x) { s.n += x.n; s.r += x.r; return s; }, { nome: 'Outras fontes', n: 0, r: 0 });
      itens = itens.slice(0, 4).concat([resto]);
    }
    var R = 80, C = 2 * Math.PI * R, acc = 0, gap = itens.length > 1 ? 3 : 0;
    var arcos = itens.map(function(x, i) {
      var len = x.n / total * C, cor = COR.serie[i % COR.serie.length];
      var arco = '<circle cx="105" cy="105" r="' + R + '" fill="none" stroke="' + cor + '" stroke-width="24" stroke-dasharray="' + Math.max(len - gap, 0.1).toFixed(2) + ' ' + (C - Math.max(len - gap, 0.1)).toFixed(2) + '" stroke-dashoffset="' + (-acc).toFixed(2) + '" transform="rotate(-90 105 105)"><title>' + esc(x.nome) + ': ' + x.n + '</title></circle>';
      acc += len; x.cor = cor; return arco;
    }).join('');
    el.innerHTML =
      '<svg class="bx-donut-svg" viewBox="0 0 210 210" role="img" aria-label="Origem das vendas">' +
        '<circle cx="105" cy="105" r="' + R + '" fill="none" stroke="var(--bx-fill)" stroke-width="24"/>' + arcos +
        '<text x="105" y="102" text-anchor="middle" class="bx-donut-centro" fill="var(--bx-txt)" font-size="30" font-weight="600">' + total + '</text>' +
        '<text x="105" y="124" text-anchor="middle" class="bx-donut-centro" fill="var(--bx-txt-3)" font-size="12">vendas · ' + esc(brl(receita, true)) + '</text>' +
      '</svg>' +
      '<div class="bx-donut-leg">' + itens.map(function(x) {
        return '<div class="bx-donut-item"><span class="bx-donut-dot" style="background:' + x.cor + '"></span>' +
          '<div style="min-width:0"><div class="bx-donut-nome">' + esc(x.nome) + '</div><div class="bx-donut-sub">' + x.n + ' venda' + (x.n > 1 ? 's' : '') + ' · ' + brl(x.r) + '</div></div>' +
          '<div class="bx-donut-pct">' + Math.round(x.n / total * 100) + '%</div></div>';
      }).join('') + '</div>';
  }

  /* ── Ligações da semana (linha com pontos) ── */
  function renderSemana(D) {
    var box = document.getElementById('bx-semana-chart');
    if (!box) return;
    var hoje = inicioDia(Date.now()), dias = [];
    for (var i = 6; i >= 0; i--) dias.push({ a: hoje - i * DIA, v: 0 });
    var anterior = 0, iniAnt = hoje - 13 * DIA, fimAnt = hoje - 6 * DIA;
    D.ligacoes.forEach(function(l) {
      var t = ts(l._data_hora || l._created_at); if (t == null) return;
      if (t >= iniAnt && t < fimAnt) anterior++;
      for (var k = 0; k < dias.length; k++) { if (t >= dias[k].a && t < dias[k].a + DIA) { dias[k].v++; break; } }
    });
    var total = dias.reduce(function(s, x) { return s + x.v; }, 0);
    var elTot = document.getElementById('bx-semana-total'), elDel = document.getElementById('bx-semana-delta');
    if (elTot) elTot.textContent = num(total) + ' ligações';
    if (elDel) elDel.outerHTML = delta(total, anterior).replace('class="bx-kpi-delta', 'id="bx-semana-delta" class="bx-kpi-delta').replace('vs período anterior', 'vs semana anterior');

    var W = Math.max(box.clientWidth, 260), H = box.clientHeight || 220, mL = 30, mR = 14, mT = 40, mB = 26;
    var iw = W - mL - mR, ih = H - mT - mB, max = maxBonito(Math.max.apply(null, dias.map(function(x) { return x.v; })));
    var pts = dias.map(function(x, i) { return { x: mL + i * iw / 6, y: mT + ih - x.v / max * ih }; });
    var d = caminhoSuave(pts), gid = 'bxSem' + (++_svgSeq), grade = '', eixo = '';
    for (var g = 0; g <= 4; g++) {
      var yy = mT + ih - ih * g / 4;
      grade += '<line class="bx-grid-line" x1="' + mL + '" x2="' + (W - mR) + '" y1="' + yy + '" y2="' + yy + '"/>';
      eixo += '<text x="' + (mL - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + num(max * g / 4) + '</text>';
    }
    dias.forEach(function(x, i) { eixo += '<text x="' + pts[i].x + '" y="' + (H - 6) + '" text-anchor="middle">' + DIAS_CURTO[new Date(x.a).getDay()] + '</text>'; });
    box.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Ligações por dia nos últimos 7 dias">' +
        '<defs><linearGradient id="' + gid + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + COR.accent + '" stop-opacity=".35"/><stop offset="1" stop-color="' + COR.accent + '" stop-opacity="0"/></linearGradient></defs>' +
        '<g class="bx-axis">' + grade + eixo + '</g>' +
        '<path d="' + d + ' L' + pts[6].x + ',' + (mT + ih) + ' L' + pts[0].x + ',' + (mT + ih) + ' Z" fill="url(#' + gid + ')"/>' +
        '<path d="' + d + '" fill="none" stroke="' + COR.accent + '" stroke-width="2.4" stroke-linecap="round"/>' +
        pts.map(function(p, i) { return '<circle class="bx-sem-pt" data-i="' + i + '" cx="' + p.x + '" cy="' + p.y + '" r="4" fill="' + COR.accent2 + '" stroke="var(--bx-card)" stroke-width="2"/>'; }).join('') +
        '<rect id="bx-sem-hit" x="' + mL + '" y="' + mT + '" width="' + iw + '" height="' + ih + '" fill="transparent"/>' +
      '</svg><div class="bx-tip" id="bx-sem-tip"></div>';
    var tip = document.getElementById('bx-sem-tip');
    function mostrar(i) {
      box.querySelectorAll('.bx-sem-pt').forEach(function(c) { c.setAttribute('r', Number(c.getAttribute('data-i')) === i ? 6 : 4); });
      tip.innerHTML = esc(new Date(dias[i].a).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })) + '<b>' + num(dias[i].v) + ' ligações</b>';
      tip.style.left = Math.min(Math.max(pts[i].x / W * box.clientWidth, 70), box.clientWidth - 70) + 'px';
      tip.style.top = (pts[i].y / H * box.clientHeight) + 'px';
    }
    var pico = 0; dias.forEach(function(x, i) { if (x.v >= dias[pico].v) pico = i; });
    mostrar(pico);
    var hit = document.getElementById('bx-sem-hit');
    function mover(ev) {
      var rect = box.getBoundingClientRect();
      var cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left) * W / rect.width;
      mostrar(Math.max(0, Math.min(6, Math.round((cx - mL) / (iw / 6)))));
    }
    hit.addEventListener('mousemove', mover);
    hit.addEventListener('touchstart', mover, { passive: true });
    hit.addEventListener('touchmove', mover, { passive: true });
    hit.addEventListener('mouseleave', function() { mostrar(pico); });
  }

  /* ================================================================
     ORQUESTRAÇÃO
     ================================================================ */
  function render() {
    if (!document.getElementById('bx-kpis') || typeof store === 'undefined') return;
    try {
      var D = dados(), P = periodo();
      renderKpis(D, P);
      renderTendencia(D);
      renderConversao(D);
      renderCoortes(D);
      renderRanking(D);
      if (VIOLETA) {
        renderInsight(D, P);
        renderUltimasVendas(D);
        renderDonut(D, P);
        renderSemana(D);
      }
      if (typeof BeyondUI !== 'undefined') BeyondUI.marcarAtualizado();
    } catch (e) {
      if (typeof SLog !== 'undefined') SLog.error('BeyondDashboard: ' + e.message);
      else console.error(e);
    }
  }
  function agendar() {
    clearTimeout(_timer);
    _timer = setTimeout(render, 80);
  }

  function ligarControles() {
    /* Violeta: janelas 7D / 30D / 12M (barras); Laranja: 7D / 30D / 90D (área) */
    if (VIOLETA) {
      var faixa = document.getElementById('bx-trend-range');
      if (faixa) faixa.innerHTML = '<button type="button" data-v="7">7D</button><button type="button" data-v="30" class="active">30D</button><button type="button" data-v="365">12M</button>';
      var dica = document.getElementById('bx-trend-dica');
      if (dica) dica.title = '7D e 30D mostram uma barra por dia; 12M mostra uma barra por mês.';
    }
    [['bx-trend-metric', 'metrica'], ['bx-trend-range', 'janela']].forEach(function(par) {
      var grupo = document.getElementById(par[0]);
      if (!grupo) return;
      grupo.addEventListener('click', function(ev) {
        var btn = ev.target.closest('button[data-v]');
        if (!btn) return;
        grupo.querySelectorAll('button').forEach(function(b) { b.classList.toggle('active', b === btn); b.setAttribute('aria-selected', b === btn); });
        estado[par[1]] = par[1] === 'janela' ? Number(btn.dataset.v) : btn.dataset.v;
        try { localStorage.setItem('bx-trend', JSON.stringify(estado)); } catch (e) { /* silent */ }
        var D = dados();
        renderTendencia(D);
      });
    });
    /* restaura a última escolha do usuário (conveniência local) */
    try {
      var salvo = JSON.parse(localStorage.getItem('bx-trend') || 'null');
      if (salvo && ROTULO_METRICA[salvo.metrica] && JANELAS.indexOf(salvo.janela) >= 0) {
        estado = salvo;
        document.querySelectorAll('#bx-trend-metric button').forEach(function(b) { b.classList.toggle('active', b.dataset.v === estado.metrica); });
        document.querySelectorAll('#bx-trend-range button').forEach(function(b) { b.classList.toggle('active', Number(b.dataset.v) === estado.janela); });
      }
    } catch (e) { /* silent */ }

    var rz;
    window.addEventListener('resize', function() {
      clearTimeout(rz);
      rz = setTimeout(function() { if (document.getElementById('page-dashboard').classList.contains('active')) { var D = dados(); renderTendencia(D); if (VIOLETA) renderSemana(D); } }, 150);
    });
  }

  /* Re-render junto com os KPIs do Funil (boot, período, filtros, Realtime) */
  function instalarGanchos() {
    if (typeof FunilModule === 'undefined') return;
    ['atualizarKPIs', 'renderNumeroMagico'].forEach(function(nome) {
      var orig = FunilModule[nome];
      if (typeof orig !== 'function' || orig.__bx) return;
      FunilModule[nome] = function() {
        var r = orig.apply(this, arguments);
        agendar();
        return r;
      };
      FunilModule[nome].__bx = true;
    });
  }

  /* FunilModule já está carregado (script anterior): instala os ganchos
     agora, antes do boot assíncrono do app.js chamar atualizarKPIs(). */
  instalarGanchos();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligarControles);
  else ligarControles();

  return { render: render, agendar: agendar };
})();
