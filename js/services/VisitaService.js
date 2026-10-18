/* ============================================================
   BEYOND CRM — js/services/VisitaService.js   v1.0
   Serviço de Visitas — ponte entre Store e Supabase.
   Beyond Bits Tecnologia © 2026

   ESCOPO:
   - CRUD da tabela 'visitas' (registros da aba Visita)
   - Suporta os 4 tipos de resultado: delay, c2, nao_fechou, venda
   ============================================================ */
'use strict';

class VisitaService {

  /* ================================================================
     REGISTRAR visita
     Parâmetros (dados):
       lead_id              — UUID do lead (obrigatório)
       especialista_id      — UUID do user (obrigatório)
       filial_id            — UUID da filial
       agendamento_id       — UUID do agendamento (opcional)
       tipo_resultado       — 'delay' | 'c2' | 'nao_fechou' | 'venda' (obrigatório)
       tentativa_data_hora  — ISO string (delay/nao_fechou)
       tentativa_resultado  — 'nao_atendeu'|'nao_reagendou'|'agendamento'|'pediu_retorno'
       obs                  — string livre
     ================================================================ */
  static async registrar(dados) {
    if (!supa) {
      SLog.warn('VisitaService.registrar: Supabase offline');
      return null;
    }
    if (!dados || !dados.lead_id || !dados.especialista_id || !dados.tipo_resultado) {
      SLog.warn('VisitaService.registrar: parâmetros obrigatórios ausentes');
      return null;
    }

    var insertData = {
      lead_id:         dados.lead_id,
      especialista_id: dados.especialista_id,
      filial_id:       dados.filial_id || null,
      agendamento_id:  dados.agendamento_id || null,
      tipo_resultado:  dados.tipo_resultado,
    };
    if (dados.tentativa_data_hora) insertData.tentativa_data_hora = dados.tentativa_data_hora;
    if (dados.tentativa_resultado) insertData.tentativa_resultado = dados.tentativa_resultado;
    if (dados.local_tipo)          insertData.local_tipo          = dados.local_tipo;
    /* PATCH FLOW-3.6 — novos campos (3.10 e 3.11) */
    if (dados.tipo_c2)             insertData.tipo_c2             = dados.tipo_c2;
    if (dados.objecao)             insertData.objecao             = dados.objecao;
    if (dados.obs && dados.obs.trim()) insertData.obs = dados.obs.trim();

    try {
      var res = await supa
        .from('visitas')
        .insert(insertData)
        .select()
        .single();

      if (res.error) {
        SLog.error('VisitaService.registrar: ' + res.error.message);
        return null;
      }
      SLog.info('VisitaService.registrar OK ✓ (' + dados.tipo_resultado + ', id: ' + res.data.id + ')');
      return res.data;
    } catch (err) {
      SLog.error('VisitaService.registrar exceção: ' + err.message);
      return null;
    }
  }

  /* ================================================================
     LISTAR visitas com filtros opcionais
     ================================================================ */
  static async listar(filtros) {
    if (!supa) return [];
    filtros = filtros || {};

    var query = supa
      .from('visitas')
      .select(
        '*, ' +
        'lead:leads!lead_id(id, codigo, nome), ' +
        'especialista:profiles!especialista_id(id, nome, sigla)'
      )
      .order('created_at', { ascending: false })
      .limit(filtros.limit || 500);

    if (filtros.lead_id)         query = query.eq('lead_id', filtros.lead_id);
    if (filtros.especialista_id) query = query.eq('especialista_id', filtros.especialista_id);
    if (filtros.tipo_resultado)  query = query.eq('tipo_resultado', filtros.tipo_resultado);

    var res = await query;
    if (res.error) {
      SLog.error('VisitaService.listar: ' + res.error.message);
      return [];
    }
    return res.data || [];
  }

  /* ================================================================
     ÚLTIMA visita de um lead — usado para restaurar estado da aba
     ================================================================ */
  static async ultimaDoLead(leadUuid) {
    if (!supa || !leadUuid) return null;

    var res = await supa
      .from('visitas')
      .select('*')
      .eq('lead_id', leadUuid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (res.error) {
      SLog.error('VisitaService.ultimaDoLead: ' + res.error.message);
      return null;
    }
    return res.data;
  }

  /* Histórico completo de visitas de um lead */
  static async historicoPorLead(leadUuid) {
    return await VisitaService.listar({ lead_id: leadUuid });
  }
}
