/* ============================================================
   BEYOND CRM — js/services/LeadTransferService.js   v1.2
   Transferência de leads entre usuários.
   Beyond Bits Tecnologia © 2026

   Histórico:
   - v1.0: só gerente podia transferir (UPDATE + INSERT diretos)
   - v1.1 (PATCH PERM-3.4): supervisor habilitado via RLS — não
     funcionou de forma confiável.
   - v1.2 (PATCH PERM-3.4 abordagem RPC): tudo passa pela função
     transferir_lead_seguro() no banco, que valida permissão e
     executa UPDATE + INSERT em uma transação. Funciona pra
     gerente e supervisor; RLS não precisa ser ajustada.
   ============================================================ */
'use strict';

class LeadTransferService {

  /* ── Transferir UM lead via RPC ──────────────────────── */
  static async transferir(leadUuid, paraUserId, motivo) {
    if (!supa) throw new Error('Supabase offline');
    LeadTransferService._exigirGerente();

    SLog.load('TRANSF lead ' + leadUuid + ' → ' + paraUserId);

    var res = await supa.rpc('transferir_lead_seguro', {
      p_lead_id:      leadUuid,
      p_para_user_id: paraUserId,
      p_motivo:       motivo || null,
    });

    if (res.error) {
      SLog.error('TRANSF RPC: ' + res.error.message);
      throw new Error('Falha na transferência: ' + res.error.message);
    }

    var resultado = res.data || {};
    if (!resultado.ok) {
      SLog.warn('TRANSF rejeitada: ' + (resultado.erro || 'sem detalhes'));
      throw new Error(resultado.erro || 'Transferência rejeitada pelo banco');
    }

    /* Audit log local (front-end) */
    if (typeof store !== 'undefined' && store._logAudit) {
      store._logAudit(
        'Transferência (' + leadUuid + ')',
        resultado.de  || '—',
        resultado.para || paraUserId
      );
    }

    SLog.info('TRANSF OK ✓ (de ' + resultado.de + ' → ' + resultado.para + ')');
    return true;
  }

  /* ── Transferência em lote (mesmo destino) ──────────── */
  static async transferirLote(leadUuids, paraUserId, motivo) {
    if (!leadUuids || leadUuids.length === 0) return { ok: 0, falhas: [] };
    LeadTransferService._exigirGerente();

    SLog.load('TRANSF lote: ' + leadUuids.length + ' leads → ' + paraUserId);
    var ok = 0;
    var falhas = [];

    for (var i = 0; i < leadUuids.length; i++) {
      try {
        await LeadTransferService.transferir(leadUuids[i], paraUserId, motivo);
        ok++;
      } catch (e) {
        falhas.push({ leadUuid: leadUuids[i], erro: e.message });
        SLog.error('TRANSF lote falha em ' + leadUuids[i] + ': ' + e.message);
      }
    }

    SLog.info('TRANSF lote: ' + ok + ' ok, ' + falhas.length + ' falhas');
    return { ok: ok, falhas: falhas };
  }

  /* ── Transferência seletiva: { leadUuid: paraUserId } ── */
  static async transferirSeletivo(mapa, motivo) {
    LeadTransferService._exigirGerente();
    var entries = Object.entries(mapa);
    var ok = 0;
    var falhas = [];

    for (var i = 0; i < entries.length; i++) {
      var leadUuid   = entries[i][0];
      var paraUserId = entries[i][1];
      try {
        await LeadTransferService.transferir(leadUuid, paraUserId, motivo);
        ok++;
      } catch (e) {
        falhas.push({ leadUuid: leadUuid, erro: e.message });
      }
    }
    return { ok: ok, falhas: falhas };
  }

  /* ── Histórico de transferências de um lead ─────────── */
  static async historico(leadUuid) {
    if (!supa) return [];
    var res = await supa.from('lead_transferencias')
      .select('id, motivo, created_at, de_user_id, para_user_id, transferido_por, ' +
              'de:profiles!de_user_id(nome, sigla), ' +
              'para:profiles!para_user_id(nome, sigla), ' +
              'por:profiles!transferido_por(nome, sigla)')
      .eq('lead_id', leadUuid)
      .order('created_at', { ascending: false });
    if (res.error) { SLog.warn('TRANSF histórico: ' + res.error.message); return []; }
    return res.data;
  }

  /* ── Leads onde o usuário é responsável atual ───────── */
  static async leadsDoUsuario(userId) {
    if (!supa) return [];
    var res = await supa.from('leads')
      .select('id, codigo, nome, tel, etapa, fonte, created_at')
      .eq('responsavel_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (res.error) { SLog.error('TRANSF leadsDoUsuario: ' + res.error.message); return []; }
    return res.data || [];
  }

  /* ── Util: garantir permissão no front (defesa em camada) ── */
  /* O banco também valida via RPC; este check só evita ida e
     volta desnecessária ao servidor. */
  static _exigirGerente() {
    var perfil = AuthService.currentProfile && AuthService.currentProfile.perfil;
    if (perfil !== 'gerente' && perfil !== 'supervisor') {
      throw new Error('Apenas gerentes ou supervisores podem transferir leads.');
    }
  }
}
