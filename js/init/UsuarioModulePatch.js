/* ============================================================
   BEYOND CRM — js/init/UsuarioModulePatch.js   v1.0
   Patch em runtime: substitui UsuarioModule.inativar() e
   UsuarioModule.excluir() pelo fluxo novo de InativacaoUsuarioModule
   (que obriga redistribuir leads antes de marcar status='inativo').

   IMPORTANTE: este arquivo DEVE ser carregado APÓS Modules.js
   e APÓS InativacaoUsuarioModule.js.
   Beyond Bits Tecnologia © 2026
   ============================================================ */
'use strict';

(function() {
  if (typeof UsuarioModule === 'undefined') {
    if (typeof SLog !== 'undefined') SLog.warn('UsuarioModulePatch: UsuarioModule não carregado, patch ignorado.');
    return;
  }

  /* ── Substitui inativar(): abre fluxo com transferência obrigatória ── */
  UsuarioModule.inativar = function(sigla) {
    var u = store.usuarios.find(function(x) { return x.sigla === sigla; });
    if (!u) { Toast.show('Usuário não encontrado.', 'warning'); return; }
    if (!u._id) { Toast.show('Usuário sem UUID. Recarregue a página (F5).', 'warning'); return; }

    if (typeof InativacaoUsuarioModule === 'undefined') {
      Toast.show('Módulo de inativação não carregado. Verifique a ordem dos scripts.', 'danger');
      SLog.error('UsuarioModulePatch: InativacaoUsuarioModule indisponível.');
      return;
    }

    SLog.load('UsuarioModulePatch: abrindo fluxo de inativação para ' + u.nome);
    InativacaoUsuarioModule.abrir(u._id, u.nome);
  };

  /* ── Substitui excluir(): mesmo comportamento (soft delete via status) ── */
  UsuarioModule.excluir = function(sigla) {
    /* Por decisão de negócio: excluir == inativar (soft delete).
       Não invocamos mais a Edge Function delete-user.
       Os dados ficam preservados; só o status muda. */
    UsuarioModule.inativar(sigla);
  };

  if (typeof SLog !== 'undefined') SLog.info('UsuarioModulePatch instalado ✓ (inativar/excluir → fluxo novo)');
})();
