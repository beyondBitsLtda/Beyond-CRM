/* ============================================================
   BEYOND CRM — js/services/CarteiraService.js   v1.0
   Serviço de Interações de Carteira.
   Beyond Bits Tecnologia © 2026

   ESCOPO:
   - CRUD da tabela 'carteira_interacoes'
   - Tipos: 'recomendacao' (pedido de indicações) | 'cuidar_base' (relacionamento)
   ============================================================ */
'use strict';

class CarteiraService {

  /* ================================================================
     REGISTRAR interação
     Parâmetros (dados):
       lead_id          — UUID (associado a quem ligamos)
       especialista_id  — UUID
       filial_id        — UUID
       tipo             — 'recomendacao' | 'cuidar_base' (obrigatório)
       motivo           — string livre (ex.: 'Pedido de Recomendação', 'Aniversários')
       resultado        — string livre (ex.: 'Passou Recomendações')
       data_hora        — ISO string (default = NOW)
       obs              — string livre
     ================================================================ */
  static async registrar(dados) {
    if (!supa) {
      SLog.warn('CarteiraService.registrar: Supabase offline');
      return null;
    }
    if (!dados || !dados.lead_id || !dados.especialista_id || !dados.tipo) {
      SLog.warn('CarteiraService.registrar: parâmetros obrigatórios ausentes');
      return null;
    }

    var insertData = {
      lead_id:         dados.lead_id,
      especialista_id: dados.especialista_id,
      filial_id:       dados.filial_id || null,
      tipo:            dados.tipo,
    };
    if (dados.motivo)    insertData.motivo    = dados.motivo;
    if (dados.resultado) insertData.resultado = dados.resultado;
    if (dados.data_hora) insertData.data_hora = dados.data_hora;
    if (dados.obs && dados.obs.trim()) insertData.obs = dados.obs.trim();

    try {
      var res = await supa
        .from('carteira_interacoes')
        .insert(insertData)
        .select()
        .single();

      if (res.error) {
        SLog.error('CarteiraService.registrar: ' + res.error.message);
        return null;
      }
      SLog.info('CarteiraService.registrar OK ✓ (' + dados.tipo + ', id: ' + res.data.id + ')');
      return res.data;
    } catch (err) {
      SLog.error('CarteiraService.registrar exceção: ' + err.message);
      return null;
    }
  }

  /* ================================================================
     LISTAR interações com filtros opcionais
     ================================================================ */
  static async listar(filtros) {
    if (!supa) return [];
    filtros = filtros || {};

    var query = supa
      .from('carteira_interacoes')
      .select(
        '*, ' +
        'lead:leads!lead_id(id, codigo, nome), ' +
        'especialista:profiles!especialista_id(id, nome, sigla)'
      )
      .order('data_hora', { ascending: false })
      .limit(filtros.limit || 500);

    if (filtros.lead_id)         query = query.eq('lead_id', filtros.lead_id);
    if (filtros.especialista_id) query = query.eq('especialista_id', filtros.especialista_id);
    if (filtros.tipo)            query = query.eq('tipo', filtros.tipo);

    var res = await query;
    if (res.error) {
      SLog.error('CarteiraService.listar: ' + res.error.message);
      return [];
    }
    return res.data || [];
  }

  /* Última interação do lead — útil para mostrar resumo na aba */
  static async ultimaDoLead(leadUuid) {
    if (!supa || !leadUuid) return null;

    var res = await supa
      .from('carteira_interacoes')
      .select('*')
      .eq('lead_id', leadUuid)
      .order('data_hora', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (res.error) {
      SLog.error('CarteiraService.ultimaDoLead: ' + res.error.message);
      return null;
    }
    return res.data;
  }

  /* Histórico completo do lead */
  static async historicoPorLead(leadUuid) {
    return await CarteiraService.listar({ lead_id: leadUuid });
  }
}
