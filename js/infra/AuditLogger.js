/* ============================================================
   BEYOND CRM — js/infra/AuditLogger.js   v1.0
   Log de auditoria no Supabase (Fase 5 do Roadmap).
   Grava cada operação CRUD na tabela audit_log.
   Beyond Bits Tecnologia © 2026
   ============================================================ */
'use strict';

class AuditLogger {

  /* ── Registrar alteração ── */
  static async log(campo, anterior, novo) {
    if (!supabase) {
      console.warn('[AuditLogger] Supabase não disponível, log ignorado.');
      return;
    }

    try {
      const user = await AuthService.getUser();
      const profile = user ? await AuthService.getProfile(user.id) : null;
      const nomeUsuario = profile ? profile.nome : 'Sistema';

      const { error } = await supabase
        .from('audit_log')
        .insert({
          usuario_id: user?.id || null,
          usuario:    nomeUsuario,
          campo:      campo,
          anterior:   anterior || '—',
          novo:       typeof novo === 'object' ? JSON.stringify(novo) : (novo || ''),
        });

      if (error) {
        console.error('[AuditLogger] Erro ao gravar log:', error.message);
      }
    } catch (err) {
      console.error('[AuditLogger] Exceção:', err.message);
    }
  }

  /* ── Registrar criação ── */
  static async logCriacao(entidade, detalhes) {
    await AuditLogger.log(
      'Criação (' + entidade + ')',
      '—',
      detalhes
    );
  }

  /* ── Registrar exclusão ── */
  static async logExclusao(entidade, detalhes) {
    await AuditLogger.log(
      'Exclusão (' + entidade + ')',
      detalhes,
      '—'
    );
  }

  /* ── Registrar mudança de etapa ── */
  static async logEtapa(leadId, etapaAnterior, etapaNova) {
    await AuditLogger.log(
      'Etapa (' + leadId + ')',
      etapaAnterior,
      etapaNova
    );
  }
}
