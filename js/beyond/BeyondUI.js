/* ============================================================
   BEYOND CRM — js/beyond/BeyondUI.js
   Pequenos acabamentos de interface do tema Beyond:
   • cartão do usuário no rodapé do menu lateral;
   • indicador "Dados atualizados · há X min";
   • re-render do dashboard ao voltar para ele;
   • troca de tema (Laranja ⇄ Violeta), logo do tema, saudação e
     barra de navegação inferior do tema Violeta.
   Beyond Bits Tecnologia © 2026
   ============================================================ */
'use strict';

var BeyondUI = (function() {
  var _ultimaAtualizacao = Date.now();

  function marcarAtualizado() {
    _ultimaAtualizacao = Date.now();
    pintarTempo();
  }

  function pintarTempo() {
    var el = document.getElementById('bx-sync-time');
    if (!el) return;
    var min = Math.floor((Date.now() - _ultimaAtualizacao) / 60000);
    el.textContent = min < 1 ? 'agora' : (min === 1 ? 'há 1 min' : 'há ' + min + ' min');
  }

  /* ── Tema ── */
  var NOMES_TEMA = { laranja: 'Laranja', violeta: 'Violeta' };
  function trocarTema() {
    var novo = (window.BX_TEMA === 'violeta') ? 'laranja' : 'violeta';
    try { localStorage.setItem('bx-tema', novo); } catch (e) { /* sem storage */ }
    /* Recarrega: gráficos e módulos leem a paleta (BX_COR) na renderização.
       Os dados da demonstração ficam no sessionStorage — nada se perde. */
    window.location.reload();
  }
  function aplicarMarcaDoTema() {
    var violeta = window.BX_TEMA === 'violeta';
    var arquivo = violeta ? 'assets/beyond-mark-violeta.svg' : 'assets/beyond-mark.svg';
    document.querySelectorAll('img[src$="beyond-mark.svg"], img[src$="beyond-mark-violeta.svg"]').forEach(function(img) { img.setAttribute('src', arquivo); });
    var fav = document.querySelector('link[rel="icon"]');
    if (fav) fav.setAttribute('href', arquivo);
    var nome = document.getElementById('bx-tema-nome');
    var proximo = violeta ? 'laranja' : 'violeta';
    if (nome) nome.textContent = NOMES_TEMA[proximo];
    var btn = document.getElementById('bx-btn-tema');
    if (btn) btn.title = 'Mudar para o tema ' + NOMES_TEMA[proximo];
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', violeta ? '#09080F' : '#0A0A0A');
  }
  function marcarNavInferior(pagina) {
    document.querySelectorAll('.bx-bottomnav button').forEach(function(b) {
      b.classList.toggle('active', b.getAttribute('data-p') === pagina);
    });
  }

  function preencherUsuario() {
    var p = (typeof AuthService !== 'undefined') ? AuthService.currentProfile : null;
    if (!p) return;
    var papel = ((typeof PERFIL_CONFIG !== 'undefined' && PERFIL_CONFIG[p.perfil]) || {}).label || p.perfil;
    var filial = p.filiais && p.filiais.nome ? ' · ' + p.filiais.nome : '';
    var nome = document.getElementById('bx-user-nome');
    var cargo = document.getElementById('bx-user-papel');
    var av = document.getElementById('bx-user-av');
    if (nome) nome.textContent = p.nome || '—';
    var saud = document.getElementById('bx-saudacao');
    if (saud) saud.textContent = 'Bem-vindo de volta, ' + String(p.nome || '').split(' ')[0] + ' 👋';
    if (cargo) cargo.textContent = papel + filial;
    if (av) {
      var img = document.getElementById('header-avatar-img');
      if (img && img.getAttribute('src') && img.style.display !== 'none') {
        av.innerHTML = '';
        var copia = document.createElement('img');
        copia.src = img.getAttribute('src');
        copia.alt = '';
        av.appendChild(copia);
      } else {
        av.textContent = p.sigla || (p.nome || '?').slice(0, 2).toUpperCase();
      }
    }
  }

  /* Ganchos: cabeçalho (perfil carregado) e navegação (voltar ao dashboard) */
  if (typeof AuthService !== 'undefined' && typeof AuthService.atualizarHeader === 'function') {
    var origHeader = AuthService.atualizarHeader;
    AuthService.atualizarHeader = function() {
      var r = origHeader.apply(this, arguments);
      preencherUsuario();
      return r;
    };
  }
  if (typeof Router !== 'undefined' && typeof Router.ir === 'function') {
    var origIr = Router.ir;
    var _agendaAjustada = false;
    Router.ir = function(pagina) {
      var r = origIr.apply(this, arguments);
      if (pagina === 'dashboard' && typeof BeyondDashboard !== 'undefined') BeyondDashboard.agendar();
      marcarNavInferior(pagina);
      /* No celular a semana inteira não cabe: na primeira visita abre a
         Agenda na visão "Dia" (o usuário pode voltar pra Semana). */
      if (pagina === 'agenda' && !_agendaAjustada && window.matchMedia &&
          window.matchMedia('(max-width: 768px)').matches &&
          typeof AgendaModule !== 'undefined' && AgendaModule.setView) {
        _agendaAjustada = true;
        try { AgendaModule.setView('dia'); } catch (e) { /* silent */ }
      }
      return r;
    };
  }

  /* O avatar do header pode carregar depois (Storage) — sincroniza o cartão */
  document.addEventListener('DOMContentLoaded', function() {
    aplicarMarcaDoTema();
    var img = document.getElementById('header-avatar-img');
    if (img && window.MutationObserver) {
      new MutationObserver(preencherUsuario).observe(img, { attributes: true, attributeFilter: ['src', 'style'] });
    }
  });

  setInterval(pintarTempo, 30000);

  return { marcarAtualizado: marcarAtualizado, preencherUsuario: preencherUsuario, trocarTema: trocarTema };
})();
