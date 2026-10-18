/* ============================================================
   BEYOND CRM — js/init/LeadModalHooks.js   v1.0
   Patcha Modal.abrir para que, ao abrir o #modal-lead,
   os botões "Transferir" e "Compartilhar" sejam injetados
   automaticamente (somente para gerente).

   Não exige nenhuma alteração em FunilModule.js.
   Beyond Bits Tecnologia © 2026
   ============================================================ */
'use strict';

(function() {
  if (typeof Modal === 'undefined' || !Modal.abrir) {
    if (typeof SLog !== 'undefined') SLog.warn('LeadModalHooks: Modal indisponível, hook não aplicado.');
    return;
  }

  var abrirOriginal = Modal.abrir.bind(Modal);

  Modal.abrir = function(id) {
    var ret = abrirOriginal(id);

    if (id === 'modal-lead') {
      /* Pequeno delay para garantir que FunilModule terminou de popular o modal */
      setTimeout(function() {
        try {
          if (typeof TransferenciaModule !== 'undefined') {
            TransferenciaModule.injetarBotaoNoModalLead();
          }
          if (typeof VisibilidadeModule !== 'undefined') {
            VisibilidadeModule.injetarBotaoNoModalLead();
          }
        } catch (e) {
          if (typeof SLog !== 'undefined') SLog.error('LeadModalHooks: ' + e.message);
        }
      }, 60);
    }

    return ret;
  };

  if (typeof SLog !== 'undefined') SLog.info('LeadModalHooks instalado ✓');
})();
