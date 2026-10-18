/* ============================================================
   BEYOND CRM — js/services/ArquivamentoService.js   v1.0
   Serviço de Arquivamento de Leads.
   Beyond Bits Tecnologia © 2026

   Cobre:
   - RN-21 (arquivamento manual — todos os perfis)
   - RN-22 (auto-arquivamento em Remarketing com 30+ tentativas)

   PADRÃO:
   - Wrapper thin sobre supa.from('leads').update({arquivado:...}).
   - O trigger trg_leads_arquivamento_timestamp no banco preenche
     arquivado_em automaticamente — não passamos aqui.
   - arquivado_por = auth.uid() para ação manual, NULL para
     auto-arquivamento (permite distinguir na auditoria).

   USO:
     await ArquivamentoService.arquivar(leadUuid);
     await ArquivamentoService.desarquivar(leadUuid);
     await ArquivamentoService.autoArquivar(leadUuid);         // RN-22
     var lista = await ArquivamentoService.listarArquivados();
     var qtd   = await ArquivamentoService.contarArquivados();
   ============================================================ */
'use strict';

class ArquivamentoService {

  /* ── Arquivar um lead (ação manual) ──────────────────
     RN-21: qualquer perfil autenticado pode arquivar.
     Retorna true em sucesso, false em falha. */
  static async arquivar(leadUuid) {
    if (!supa) { SLog.warn('ARQUIV: Supabase offline'); return false; }
    if (!leadUuid) { SLog.warn('ARQUIV: leadUuid ausente'); return false; }

    var userId = ArquivamentoService._userIdAtual();
    if (!userId) {
      SLog.warn('ARQUIV: usuário não autenticado');
      return false;
    }

    SLog.load('ARQUIV lead ' + leadUuid);

    var res = await supa.from('leads')
      .update({
        arquivado:     true,
        arquivado_por: userId,
        /* arquivado_em preenchido pelo trigger no banco */
      })
      .eq('id', leadUuid);

    if (res.error) {
      SLog.error('ARQUIV: ' + res.error.message);
      Toast.show('Erro ao arquivar: ' + res.error.message, 'danger');
      return false;
    }

    SLog.info('ARQUIV lead ' + leadUuid + ' OK ✓');
    return true;
  }

  /* ── Desarquivar um lead ──────────────────────────────
     O trigger no banco limpa arquivado_em e arquivado_por
     automaticamente quando arquivado passa para false. */
  static async desarquivar(leadUuid) {
    if (!supa) { SLog.warn('DESARQUIV: Supabase offline'); return false; }
    if (!leadUuid) { SLog.warn('DESARQUIV: leadUuid ausente'); return false; }

    if (!ArquivamentoService._userIdAtual()) {
      SLog.warn('DESARQUIV: usuário não autenticado');
      return false;
    }

    SLog.load('DESARQUIV lead ' + leadUuid);

    var res = await supa.from('leads')
      .update({ arquivado: false })
      .eq('id', leadUuid);

    if (res.error) {
      SLog.error('DESARQUIV: ' + res.error.message);
      Toast.show('Erro ao desarquivar: ' + res.error.message, 'danger');
      return false;
    }

    SLog.info('DESARQUIV lead ' + leadUuid + ' OK ✓');
    return true;
  }

  /* ── Auto-arquivar (RN-22) ─────────────────────────────
     Usado quando um lead atinge 30 tentativas e é marcado
     como Remarketing. Registra arquivado_por = NULL para
     diferenciar de arquivamento manual na auditoria. */
  static async autoArquivar(leadUuid) {
    if (!supa) { SLog.warn('AUTO-ARQUIV: Supabase offline'); return false; }
    if (!leadUuid) { SLog.warn('AUTO-ARQUIV: leadUuid ausente'); return false; }

    SLog.load('AUTO-ARQUIV lead ' + leadUuid + ' (remarketing)');

    var res = await supa.from('leads')
      .update({
        arquivado:     true,
        arquivado_por: null,   /* sinaliza automação */
      })
      .eq('id', leadUuid);

    if (res.error) {
      SLog.error('AUTO-ARQUIV: ' + res.error.message);
      return false;
    }

    SLog.info('AUTO-ARQUIV lead ' + leadUuid + ' OK ✓');
    return true;
  }

  /* ── Listar leads arquivados (para relatório futuro) ── */
  static async listarArquivados(filtros) {
    if (!supa) return [];
    filtros = filtros || {};

    var query = supa.from('leads')
      .select('id, codigo, nome, tel, etapa, tentativas, fonte, ' +
              'captador_id, responsavel_id, arquivado_em, arquivado_por, ' +
              'quem_arquivou:profiles!arquivado_por(nome, sigla)')
      .eq('arquivado', true)
      .is('deleted_at', null)
      .order('arquivado_em', { ascending: false });

    if (filtros.etapa)       query = query.eq('etapa',       filtros.etapa);
    if (filtros.captador_id) query = query.eq('captador_id', filtros.captador_id);

    var res = await query;
    if (res.error) {
      SLog.error('ARQUIV listar: ' + res.error.message);
      return [];
    }
    return res.data || [];
  }

  /* ── Contar arquivados (para badge no toggle) ────────── */
  static async contarArquivados() {
    if (!supa) return 0;

    var res = await supa.from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('arquivado', true)
      .is('deleted_at', null);

    if (res.error) {
      SLog.error('ARQUIV contar: ' + res.error.message);
      return 0;
    }
    return res.count || 0;
  }

  /* ── Helper privado ──────────────────────────────────── */
  static _userIdAtual() {
    return (AuthService.currentUser && AuthService.currentUser.id) || null;
  }
}
