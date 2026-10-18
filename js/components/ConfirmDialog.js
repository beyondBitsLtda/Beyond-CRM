/* ============================================================
   BEYOND CRM — js/components/ConfirmDialog.js   v2.0
   Diálogo de confirmação reutilizável.
   Uso: ConfirmDialog.show('🗑️','Título','Mensagem', callback)
   Beyond Bits Tecnologia © 2026
   ============================================================ */
'use strict';

class ConfirmDialog {
  static show(icon, titulo, msg, onConfirm) {
    $('#cd-icon').text(icon);
    $('#cd-title').text(titulo);
    $('#cd-msg').text(msg);
    store.confirmCallback = onConfirm;
    Modal.abrir('modal-confirm');
  }

  static confirmar() {
    Modal.fechar('modal-confirm');
    if (store.confirmCallback) {
      store.confirmCallback();
      store.confirmCallback = null;
    }
  }

  static cancelar() {
    Modal.fechar('modal-confirm');
    store.confirmCallback = null;
  }
}
