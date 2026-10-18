/* ============================================================
   BEYOND CRM — js/services/LeadVisibilidadeService.js   v1.0
   Compartilhamento de leads gerente → supervisor(es).
   NÃO transfere propriedade — apenas concede visibilidade.
   Beyond Bits Tecnologia © 2026
   ============================================================ */
'use strict';

class LeadVisibilidadeService {

  /* ── Conceder acesso a um ou vários usuários ────────── */
  static async conceder(leadUuid, userIds) {
    if (!supa) throw new Error('Supabase offline');
    LeadVisibilidadeService._exigirGerente();

    if (!Array.isArray(userIds)) userIds = [userIds];
    if (userIds.length === 0) return true;

    var rows = userIds.map(function(uid) {
      return {
        lead_id:       leadUuid,
        user_id:       uid,
        concedido_por: AuthService.currentUser.id,
      };
    });

    SLog.load('VIS conceder: lead ' + leadUuid + ' → ' + userIds.length + ' usuário(s)');

    /* upsert evita erro se já existir */
    var res = await supa.from('lead_visibilidade')
      .upsert(rows, { onConflict: 'lead_id,user_id' });

    if (res.error) throw new Error('Falha ao conceder: ' + res.error.message);

    if (typeof store !== 'undefined' && store._logAudit) {
      store._logAudit('Compartilhamento de Lead', '—', userIds.length + ' usuário(s)');
    }

    SLog.info('VIS conceder OK ✓');
    return true;
  }

  /* ── Revogar acesso ─────────────────────────────────── */
  static async revogar(leadUuid, userId) {
    if (!supa) throw new Error('Supabase offline');
    LeadVisibilidadeService._exigirGerente();

    SLog.load('VIS revogar: lead ' + leadUuid + ' / user ' + userId);

    var res = await supa.from('lead_visibilidade')
      .delete()
      .eq('lead_id', leadUuid)
      .eq('user_id', userId);

    if (res.error) throw new Error('Falha ao revogar: ' + res.error.message);

    if (typeof store !== 'undefined' && store._logAudit) {
      store._logAudit('Revogação de Compartilhamento', userId, '—');
    }

    SLog.info('VIS revogar OK ✓');
    return true;
  }

  /* ── Listar quem tem acesso a um lead ───────────────── */
  static async listarConcedidos(leadUuid) {
    if (!supa) return [];
    var res = await supa.from('lead_visibilidade')
      .select('user_id, created_at, ' +
              'user:profiles!user_id(nome, sigla, perfil, filiais(nome))')
      .eq('lead_id', leadUuid);
    if (res.error) { SLog.warn('VIS listar: ' + res.error.message); return []; }
    return res.data || [];
  }

  /* ── Remover TODOS os compartilhamentos de um usuário ─
       Usado na inativação para limpar registros pendentes. */
  static async removerTodosDoUsuario(userId) {
    if (!supa) return false;
    SLog.load('VIS removendo compartilhamentos do user ' + userId);
    var res = await supa.from('lead_visibilidade')
      .delete()
      .eq('user_id', userId);
    if (res.error) { SLog.error('VIS removerTodos: ' + res.error.message); return false; }
    SLog.info('VIS removerTodos OK ✓');
    return true;
  }

  /* ── Util ───────────────────────────────────────────── */
  static _exigirGerente() {
    if (!AuthService.currentProfile || AuthService.currentProfile.perfil !== 'gerente') {
      throw new Error('Apenas gerentes podem alterar compartilhamentos.');
    }
  }
}
