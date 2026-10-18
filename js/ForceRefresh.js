/* ============================================================================
   BEYOND CRM — js/ForceRefresh.js   v1.0
   Botão "Atualizar sistema" — força o navegador a buscar a versão mais recente.
   Beyond Bits Tecnologia © 2026

   OBJETIVO
   --------
   Dar ao usuário um botão que garante que ele está vendo a versão mais nova do
   sistema, evitando reaberturas de chamado causadas por JS/CSS antigos servidos
   do cache do navegador.

   COMO FUNCIONA (o mais próximo possível de um Ctrl+Shift+R via JS)
   ----------------------------------------------------------------
   Não existe API para disparar um "hard reload" puro. Então este módulo:
     1) Limpa o Cache Storage (caches API / cache de PWA), se houver.
     2) Desregistra service workers, se houver.
     3) Chama location.reload() — que, iniciado pelo usuário, faz o navegador
        REVALIDAR os arquivos (envia If-Modified-Since/ETag). Se o arquivo mudou
        no servidor, ele baixa a versão nova.
     4) Fallback: se algo travar, navega para a mesma URL com um parâmetro de
        cache-bust (?_amp_cb=timestamp).

   ISOLAMENTO / SEGURANÇA
   ----------------------
   - Vanilla JS puro. NÃO depende de jQuery, do store, nem de qualquer global
     do app. Não sobrescreve nada.
   - IDs, classes e estilos com prefixo "ampfr-" (sem colisão).
   - Só injeta um botão; não executa mais nada no load.
   - Idempotente: se carregar duas vezes, não duplica o botão.

   USO
   ---
   - Básico: só inclua no index.html (de preferência por último):
       <script src="ForceRefresh.js"></script>
     Um botão flutuante discreto aparece no canto inferior direito.

   - Sem o botão flutuante (você põe o seu próprio botão):
       <script src="ForceRefresh.js" data-auto-button="false"></script>
     e ligue QUALQUER elemento com:
       <button data-amp-force-refresh>Atualizar</button>
     ou chame direto:  window.forcarAtualizacaoSistema();

   - Reposicionar o botão flutuante:
       data-position="bottom-right" | "bottom-left" | "top-right" | "top-left"
   ============================================================================ */
(function () {
  'use strict';

  /* Evita dupla-inicialização se o script for incluído mais de uma vez. */
  if (window.__ampForceRefreshLoaded) return;
  window.__ampForceRefreshLoaded = true;

  var EM_ANDAMENTO = false;

  /* ── Núcleo: limpa caches e recarrega buscando a versão nova ── */
  function forcarAtualizacaoSistema() {
    if (EM_ANDAMENTO) return;
    EM_ANDAMENTO = true;
    marcarBotaoOcupado(true);

    var limpezas = [];

    /* 1) Cache Storage (caches API / PWA) */
    try {
      if (window.caches && caches.keys) {
        limpezas.push(
          caches.keys()
            .then(function (keys) {
              return Promise.all(keys.map(function (k) { return caches.delete(k); }));
            })
            .catch(function () {})
        );
      }
    } catch (e) {}

    /* 2) Service workers */
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        limpezas.push(
          navigator.serviceWorker.getRegistrations()
            .then(function (regs) {
              return Promise.all(regs.map(function (r) { return r.unregister(); }));
            })
            .catch(function () {})
        );
      }
    } catch (e) {}

    /* 3) Depois das limpezas (ou de um timeout curto), recarrega. */
    var recarregou = false;
    function recarregar() {
      if (recarregou) return;
      recarregou = true;
      try {
        /* reload iniciado pelo usuário => o navegador revalida os arquivos. */
        window.location.reload();
      } catch (e) {
        /* Fallback: força um documento novo com cache-bust na URL. */
        try {
          var u = new URL(window.location.href);
          u.searchParams.set('_amp_cb', String(Date.now()));
          window.location.replace(u.toString());
        } catch (e2) {
          window.location.href =
            window.location.pathname + '?_amp_cb=' + Date.now();
        }
      }
    }

    /* Não deixa o usuário preso se alguma promise não resolver: teto de 1.2s. */
    var timeout = setTimeout(recarregar, 1200);
    Promise.all(limpezas).then(function () {
      clearTimeout(timeout);
      recarregar();
    }).catch(function () {
      clearTimeout(timeout);
      recarregar();
    });
  }

  /* ── Feedback visual no botão flutuante enquanto processa ── */
  function marcarBotaoOcupado(ocupado) {
    var btn = document.getElementById('ampfr-botao');
    if (!btn) return;
    if (ocupado) {
      btn.classList.add('ampfr-girando');
      btn.setAttribute('disabled', 'disabled');
      btn.setAttribute('title', 'Atualizando para a versão mais recente...');
    } else {
      btn.classList.remove('ampfr-girando');
      btn.removeAttribute('disabled');
    }
  }

  /* ── Estilos isolados (prefixo ampfr-) ── */
  function injetarEstilos() {
    if (document.getElementById('ampfr-estilos')) return;
    var css =
      '.ampfr-fab{position:fixed;z-index:2147483000;width:44px;height:44px;' +
      'border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;' +
      'justify-content:center;background:#1E2761;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.25);' +
      'transition:transform .15s ease,opacity .15s ease;opacity:.85;padding:0;}' +
      '.ampfr-fab:hover{opacity:1;transform:scale(1.06);}' +
      '.ampfr-fab[disabled]{cursor:default;opacity:.7;}' +
      '.ampfr-fab svg{width:22px;height:22px;display:block;}' +
      '.ampfr-girando svg{animation:ampfr-spin .8s linear infinite;}' +
      '@keyframes ampfr-spin{to{transform:rotate(360deg);}}' +
      '.ampfr-pos-bottom-right{right:18px;bottom:18px;}' +
      '.ampfr-pos-bottom-left{left:18px;bottom:18px;}' +
      '.ampfr-pos-top-right{right:18px;top:18px;}' +
      '.ampfr-pos-top-left{left:18px;top:18px;}';
    var st = document.createElement('style');
    st.id = 'ampfr-estilos';
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* Ícone de refresh (SVG inline — sem depender de bootstrap-icons). */
  var SVG_REFRESH =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path>' +
    '<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"></path>' +
    '<path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"></path></svg>';

  /* ── Botão flutuante (opcional) ── */
  function montarBotaoFlutuante(posicao) {
    if (document.getElementById('ampfr-botao')) return;
    injetarEstilos();

    var pos = ['bottom-right', 'bottom-left', 'top-right', 'top-left']
      .indexOf(posicao) >= 0 ? posicao : 'bottom-right';

    var btn = document.createElement('button');
    btn.id = 'ampfr-botao';
    btn.type = 'button';
    btn.className = 'ampfr-fab ampfr-pos-' + pos;
    btn.setAttribute('title', 'Atualizar sistema (garante a versão mais recente)');
    btn.setAttribute('aria-label', 'Atualizar sistema para a versão mais recente');
    btn.innerHTML = SVG_REFRESH;
    btn.addEventListener('click', forcarAtualizacaoSistema);
    document.body.appendChild(btn);
  }

  /* ── Liga qualquer elemento com [data-amp-force-refresh] à função ── */
  function ligarElementosDelegados() {
    document.addEventListener('click', function (ev) {
      var alvo = ev.target;
      while (alvo && alvo !== document) {
        if (alvo.hasAttribute && alvo.hasAttribute('data-amp-force-refresh')) {
          ev.preventDefault();
          forcarAtualizacaoSistema();
          return;
        }
        alvo = alvo.parentNode;
      }
    }, false);
  }

  /* ── Lê configuração do próprio <script> ── */
  function lerConfig() {
    var atual = document.currentScript;
    if (!atual) {
      var todos = document.getElementsByTagName('script');
      for (var i = todos.length - 1; i >= 0; i--) {
        if ((todos[i].src || '').indexOf('ForceRefresh') >= 0) { atual = todos[i]; break; }
      }
    }
    var autoBtn = true;
    var posicao = 'bottom-right';
    if (atual) {
      if (atual.getAttribute('data-auto-button') === 'false') autoBtn = false;
      var p = atual.getAttribute('data-position');
      if (p) posicao = p;
    }
    return { autoBtn: autoBtn, posicao: posicao };
  }

  /* ── Inicialização ── */
  function iniciar() {
    var cfg = lerConfig();
    ligarElementosDelegados();
    if (cfg.autoBtn) montarBotaoFlutuante(cfg.posicao);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  /* ── API pública (para wiring custom) ── */
  window.forcarAtualizacaoSistema = forcarAtualizacaoSistema;
  window.BeyondForceRefresh = {
    VERSION: '1.0',
    forcar: forcarAtualizacaoSistema,
    montarBotao: montarBotaoFlutuante,
  };
})();
