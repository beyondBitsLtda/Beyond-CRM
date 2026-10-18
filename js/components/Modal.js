/* ============================================================
   BEYOND CRM — js/components/Modal.js   v2.2   (Onda 1 / PERS-2)
   Controla abertura/fechamento dos modais .amp-modal

   Patch UX-1 (ponto 1.a):
   Antes, o handler de click no .amp-modal fechava o modal
   sempre que o e.target fosse o overlay — o que disparava
   se o usuário selecionasse texto dentro de um input
   (Ctrl+A, arrastar) e soltasse o mouse fora.

   Solução: rastrear o mousedown. Só fecha se o mousedown
   E o click ambos tiverem ocorrido diretamente no overlay
   (não em filhos com seleção arrastada pra fora).

   v2.2 (Onda 1 pós-testes — ticket #16 / PERS-2):
   Sistema de close-guards. Consumidores podem registrar
   uma função de guarda (via Modal.setGuard) que roda antes
   de qualquer tentativa de fechamento — tanto via botão X,
   quanto backdrop click, quanto Modal.fechar direto.

   Uso:
     Modal.setGuard('modal-lead', function(fecharPadrao) {
       if (temAlteracoesNaoSalvas()) {
         ConfirmDialog.show(...); // custom
         return true; // guarda tratou o fechamento
       }
       return false; // guarda não tratou, fecha normal
     });

   Um segundo parâmetro `forcarFechamento=true` em Modal.fechar
   pula a guarda — pra uso interno após confirmação explícita
   (ex.: confirmarLigacao, confirmarAgendamento).
   Beyond Bits Tecnologia © 2026
   ============================================================ */
'use strict';

class Modal {
  static abrir(id) {
    const $el = $('#' + id);
    if (!$el.length) return;
    $el.addClass('show').css('display', 'flex');
    $('body').addClass('modal-open');
  }

  /* v2.2 — fecha o modal, respeitando close-guard se houver.
     forcarFechamento=true pula a guarda. */
  static fechar(id, forcarFechamento) {
    /* Close-guard: se houver e não estiver forçado, delega */
    if (!forcarFechamento && Modal._guards && Modal._guards[id]) {
      var guard = Modal._guards[id];
      try {
        var tratou = guard(function() { Modal._fecharSemGuarda(id); });
        if (tratou === true) return; /* guarda cuidou do fluxo */
      } catch (e) {
        /* Se a guarda falhar, deixa fechar pra não travar o usuário */
        if (typeof SLog !== 'undefined') SLog.error('Modal guard exceção: ' + e.message);
      }
    }
    Modal._fecharSemGuarda(id);
  }

  /* v2.2 — implementação real do fechamento (sem consultar guarda). */
  static _fecharSemGuarda(id) {
    const $el = $('#' + id);
    if (!$el.length) return;
    $el.removeClass('show');
    setTimeout(() => {
      if (!$el.hasClass('show')) $el.css('display', 'none');
    }, 300);
    if (!$('.amp-modal.show').length) $('body').removeClass('modal-open');
  }

  /* v2.2 — registra/remove uma guarda de fechamento para um modal.
     A guarda recebe uma função `fecharPadrao` que ela pode chamar
     depois de decidir. Se retornar `true`, entende-se que a guarda
     assumiu o controle e o fluxo padrão NÃO deve rodar.
     Se retornar `false` (ou qualquer coisa != true), o Modal.fechar
     prossegue normalmente. */
  static setGuard(id, fn) {
    Modal._guards = Modal._guards || {};
    Modal._guards[id] = fn;
  }

  static clearGuard(id) {
    if (Modal._guards) delete Modal._guards[id];
  }

  /* ----------------------------------------------------------
     inicializarBackdrops — fecha modal ao clicar no overlay,
     mas apenas se o mousedown E o click ocorreram no overlay
     direto (evita fechar ao soltar mouse após selecionar texto
     dentro de um input).
     ---------------------------------------------------------- */
  static inicializarBackdrops() {
    /* Estado por-modal: se o mousedown atual começou no overlay */
    Modal._mouseDownNoOverlay = false;

    $(document).on('mousedown', '.amp-modal', function (e) {
      Modal._mouseDownNoOverlay = $(e.target).is('.amp-modal');
    });

    $(document).on('click', '.amp-modal', function (e) {
      if (Modal._mouseDownNoOverlay && $(e.target).is('.amp-modal')) {
        /* v2.2 — chama Modal.fechar SEM forçar; guard tem chance de intervir */
        Modal.fechar($(this).attr('id'));
      }
      Modal._mouseDownNoOverlay = false;
    });

    /* Defesa adicional: se o usuário soltar o mouse fora do
       documento (drag de seleção), zera o flag. */
    $(document).on('mouseup', function() {
      Modal._mouseDownNoOverlay = false;
    });
  }

  static trocarAba(tabId, context) {
    const $modal = $(context).closest('.amp-modal-content');
    $modal.find('.lead-tab').removeClass('active');
    $modal.find('.lead-tab-pane').removeClass('active');
    $modal.find(`[data-tab="${tabId}"]`).addClass('active');
    $('#tab-' + tabId).addClass('active');
  }
}
