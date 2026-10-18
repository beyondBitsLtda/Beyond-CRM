/* ============================================================
   BEYOND CRM — js/components/Toast.js   v2.1
   Notificações visuais (toasts). Uso: Toast.show('msg','success')

   v2.1 (Onda 5 pós-testes — Ticket #31): novo showError(userMsg,
   techMsg, err) que exibe mensagem amigável ao usuário + botão
   "detalhes" que expande a técnica. Também registra no SLog
   interno pra que SLog.exportarFalhas monte o TXT baixável.

   Beyond Bits Tecnologia © 2026
   ============================================================ */
'use strict';

class Toast {
  static show(msg, tipo = '') {
    const $c = $('#toast-container');
    if (!$c.length) return;
    const icons = { success:'✅', warning:'⚠️', info:'ℹ️', danger:'❌' };
    const $t = $('<div>').addClass('amp-toast').addClass(tipo ? 'toast-'+tipo : '')
      .html(`<span class="toast-icon">${icons[tipo]||''}</span><span>${msg}</span>`);
    $c.append($t);
    setTimeout(() => $t.addClass('show'), 10);
    setTimeout(() => { $t.removeClass('show'); setTimeout(() => $t.remove(), 350); }, 3000);
  }

  /* ============================================================
     showError — Ticket #31 (Onda 5 pós-testes, revisado)
     ============================================================
     Toast de erro com camada extra de utilidade:
     - userMsg: frase clara, curta, orientada ao usuário.
       Ex: "Não foi possível salvar o lead. Verifique sua conexão."
     - techMsg: detalhe técnico curto (ex.: error.message da API).
       Ex: "postgres error 23505 duplicate key"
     - err: opcional, um Error object. Se passado, stack é registrada.
     - contexto: opcional, o que a operação estava tentando fazer.
       Ex: "Salvando novo lead", "Transferindo 5 leads em lote".

     O Toast fica visível 6s (mais que os 3s comuns) e mostra um
     botão [Detalhes] que expande a mensagem técnica.

     Registra 1 entrada MULTI-LINHA no SLog pra que o export TXT
     traga contexto humano-legível + detalhe técnico + origem numa
     única "entrada" (contagem coerente). Formato:

       ⚠️ Ao [contexto]:
       ↳ SITUAÇÃO: [userMsg]
       ↳ DETALHE TÉCNICO: [techMsg]
       ↳ ORIGEM: [stack primeira linha do app]
     ============================================================ */
  static showError(userMsg, techMsg, err, contexto) {
    const $c = $('#toast-container');
    userMsg = userMsg || 'Ocorreu um erro. Tente novamente ou reporte ao suporte.';
    techMsg = techMsg || '';
    contexto = contexto || '';

    /* Registra no SLog pra export posterior — em uma linha multi-linha
       com prefixos claros pro leitor humano. */
    if (typeof SLog !== 'undefined' && SLog.error) {
      var partes = [];
      if (contexto) partes.push('⚠️ Ao ' + contexto + ':');
      partes.push('   ↳ SITUAÇÃO: ' + userMsg);
      if (techMsg) partes.push('   ↳ DETALHE TÉCNICO: ' + techMsg);
      if (err && err.stack) {
        /* Pega a primeira linha da stack que pareça vir do app (não do
           supabase-js interno nem do jQuery). */
        var linhas = err.stack.split('\n').slice(1, 6);
        var origem = linhas.find(function(l) {
          return l.indexOf('.js') > -1 && l.indexOf('supabase') === -1 && l.indexOf('jquery') === -1;
        }) || linhas[0];
        if (origem) partes.push('   ↳ ORIGEM: ' + origem.trim());
      }
      SLog.error(partes.join('\n'));
    }

    if (!$c.length) {
      try { alert(userMsg + (techMsg ? '\n\nDetalhe técnico: ' + techMsg : '')); } catch (e) {}
      return;
    }

    /* Escape básico pra evitar HTML injection */
    var esc = function(s) {
      return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    };

    var $t = $('<div>').addClass('amp-toast toast-danger toast-error-expandable');
    var htmlContexto = contexto
      ? '<div class="toast-contexto">Ao ' + esc(contexto) + ':</div>'
      : '';
    var htmlDetalhes = techMsg
      ? '<button class="toast-err-toggle" type="button">Detalhes ▾</button>' +
        '<div class="toast-err-detalhe" style="display:none;">' + esc(techMsg) + '</div>'
      : '';
    $t.html(
      '<span class="toast-icon">❌</span>' +
      '<div class="toast-body">' +
        htmlContexto +
        '<div class="toast-user-msg">' + esc(userMsg) + '</div>' +
        htmlDetalhes +
      '</div>'
    );

    /* Toggle dos detalhes */
    $t.on('click', '.toast-err-toggle', function(e) {
      e.stopPropagation();
      var $btn = $(this);
      var $det = $t.find('.toast-err-detalhe');
      var aberto = $det.is(':visible');
      $det.toggle();
      $btn.text(aberto ? 'Detalhes ▾' : 'Detalhes ▴');
    });

    $c.append($t);
    setTimeout(() => $t.addClass('show'), 10);
    var timer = setTimeout(function() {
      if (!$t.find('.toast-err-detalhe').is(':visible')) {
        $t.removeClass('show');
        setTimeout(() => $t.remove(), 350);
      }
    }, 6000);
    $t.on('click', function(e) {
      if ($(e.target).hasClass('toast-err-toggle')) return;
      clearTimeout(timer);
      $t.removeClass('show');
      setTimeout(() => $t.remove(), 350);
    });
  }
}
