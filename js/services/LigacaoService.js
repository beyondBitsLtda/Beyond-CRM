/* ============================================================
   BEYOND CRM — js/services/LigacaoService.js   v1.0
   Serviço de Ligações — ponte entre Store e Supabase.
   Beyond Bits Tecnologia © 2026

   ESCOPO:
   - Centraliza todo CRUD da tabela 'ligacoes' do Supabase.
   - Substitui o INSERT direto que existia no store.adicionarLigacao().
   - O Store continua sendo o ponto único de acesso aos dados em memória;
     este service é a camada de persistência.

   USO:
   - LigacaoService.registrar(lead, { resultado })   → grava nova ligação
   - LigacaoService.listar()                          → lista geral
   - LigacaoService.historicoPorLead(leadUuid)        → histórico de um lead
   - LigacaoService.porEspecialista(espId)            → ligações de um esp.
   - LigacaoService.estatisticasPorEspecialista()     → resumo agregado

   ARQUITETURA:
   - Cumpre Tarefa 1 do board (LigacaoService + migrar para Supabase).
   - Preparado para receber `data_hora` na próxima tarefa (RF-12 / Card 2).
   ============================================================ */
'use strict';

class LigacaoService {

  /* ── Constantes ─────────────────────────────────────── */
  static RESULTADOS_SEM_CONTATO = ['Não Atendeu', 'Número Errado', 'Pediu para Retornar'];

  /* ── Helpers ────────────────────────────────────────── */
  static _tipoContato(resultado) {
    return LigacaoService.RESULTADOS_SEM_CONTATO.indexOf(resultado) >= 0
      ? 'sem_contato'
      : 'contato';
  }

  /* ================================================================
     REGISTRAR uma nova ligação
     ================================================================
     Parâmetros:
       lead         — objeto do store (precisa ter ._uuid e .tentativas)
       dados        — { resultado, dataHora?, obs?, tipoContato? }

     Retorna:
       Promise<object|null> — registro inserido ou null em caso de erro.
     ================================================================ */
  static async registrar(lead, dados) {
    if (!supa) {
      SLog.warn('LigacaoService.registrar: Supabase offline, só local');
      return null;
    }
    if (!lead || !lead._uuid) {
      SLog.warn('LigacaoService.registrar: lead sem _uuid, ignorando');
      return null;
    }

    var espId = (AuthService.currentUser && AuthService.currentUser.id) || null;
    if (!espId) {
      SLog.warn('LigacaoService.registrar: usuário não autenticado, ignorando');
      return null;
    }

    var insertData = {
      lead_id:         lead._uuid,
      especialista_id: espId,
      resultado:       dados.resultado,
      tipo_contato:    dados.tipoContato || LigacaoService._tipoContato(dados.resultado),
      tentativa_num:   lead.tentativas,
    };

    /* data_hora: hora informada pelo especialista no formulário (RF-12 do DRS).
       Se não passar, o banco usa NOW() automaticamente via DEFAULT. */
    if (dados.dataHora) {
      insertData.data_hora = dados.dataHora;
    }

    /* obs: observações ESPECÍFICAS desta ligação (separadas do lead.obs geral). */
    if (dados.obs && dados.obs.trim()) {
      insertData.obs = dados.obs.trim();
    }

    try {
      var res = await supa
        .from('ligacoes')
        .insert(insertData)
        .select()
        .single();

      if (res.error) {
        SLog.error('LigacaoService.registrar: ' + res.error.message);
        return null;
      }

      SLog.info('LigacaoService.registrar OK ✓ (id: ' + res.data.id + ')');
      return res.data;
    } catch (err) {
      SLog.error('LigacaoService.registrar exceção: ' + err.message);
      return null;
    }
  }

  /* ================================================================
     LISTAR ligações (com filtros opcionais)
     ================================================================
     Filtros aceitos:
       { especialista_id, lead_id, resultado, tipo_contato,
         data_inicio (ISO), data_fim (ISO), limit (default 200) }

     Retorna: array de ligações com lead e especialista embedados.
     ================================================================ */
  static async listar(filtros) {
    if (!supa) return [];
    filtros = filtros || {};

    var query = supa
      .from('ligacoes')
      .select(
        '*, ' +
        'lead:leads!lead_id(id, codigo, nome, tel, etapa), ' +
        'especialista:profiles!especialista_id(id, nome, sigla)'
      )
      .order('created_at', { ascending: false })
      .limit(filtros.limit || 200);

    if (filtros.especialista_id) query = query.eq('especialista_id', filtros.especialista_id);
    if (filtros.lead_id)         query = query.eq('lead_id', filtros.lead_id);
    if (filtros.resultado)       query = query.eq('resultado', filtros.resultado);
    if (filtros.tipo_contato)    query = query.eq('tipo_contato', filtros.tipo_contato);
    if (filtros.data_inicio)     query = query.gte('created_at', filtros.data_inicio);
    if (filtros.data_fim)        query = query.lte('created_at', filtros.data_fim);

    var res = await query;
    if (res.error) {
      SLog.error('LigacaoService.listar: ' + res.error.message);
      return [];
    }
    return res.data || [];
  }

  /* ================================================================
     HISTÓRICO de um lead específico (ordenado do mais recente)
     ================================================================ */
  static async historicoPorLead(leadUuid) {
    if (!supa || !leadUuid) return [];

    var res = await supa
      .from('ligacoes')
      .select(
        '*, ' +
        'especialista:profiles!especialista_id(id, nome, sigla)'
      )
      .eq('lead_id', leadUuid)
      .order('created_at', { ascending: false });

    if (res.error) {
      SLog.error('LigacaoService.historicoPorLead: ' + res.error.message);
      return [];
    }
    return res.data || [];
  }

  /* ================================================================
     ÚLTIMA ligação de um lead — útil para restaurar o estado do
     formulário ao reabrir o modal. Retorna o registro mais recente
     ou null se não houver nenhum.
     ================================================================ */
  static async ultimaDoLead(leadUuid) {
    if (!supa || !leadUuid) return null;

    var res = await supa
      .from('ligacoes')
      .select('*')
      .eq('lead_id', leadUuid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (res.error) {
      SLog.error('LigacaoService.ultimaDoLead: ' + res.error.message);
      return null;
    }
    return res.data;
  }

  /* ================================================================
     LIGAÇÕES de um especialista (período opcional)
     ================================================================ */
  static async porEspecialista(espId, periodo) {
    return await LigacaoService.listar({
      especialista_id: espId,
      data_inicio:     periodo && periodo.inicio,
      data_fim:        periodo && periodo.fim,
    });
  }

  /* ================================================================
     ESTATÍSTICAS agregadas por especialista
     Retorna: [{ especialista_id, nome, total, agendamentos, taxa_conv }]
     ================================================================ */
  static async estatisticasPorEspecialista() {
    if (!supa) return [];

    var res = await supa
      .from('ligacoes')
      .select(
        'especialista_id, resultado, ' +
        'especialista:profiles!especialista_id(nome, sigla)'
      );

    if (res.error) {
      SLog.error('LigacaoService.estatisticasPorEspecialista: ' + res.error.message);
      return [];
    }

    var agregado = {};
    (res.data || []).forEach(function(l) {
      var id = l.especialista_id || 'sem_esp';
      if (!agregado[id]) {
        agregado[id] = {
          especialista_id: id,
          nome:            l.especialista ? l.especialista.nome : '—',
          sigla:           l.especialista ? l.especialista.sigla : '—',
          total:           0,
          agendamentos:    0,
        };
      }
      agregado[id].total++;
      if ((l.resultado || '').toLowerCase().indexOf('agendamento') >= 0) {
        agregado[id].agendamentos++;
      }
    });

    return Object.values(agregado).map(function(a) {
      a.taxa_conv = a.total > 0 ? (a.agendamentos / a.total * 100).toFixed(1) + '%' : '0%';
      return a;
    });
  }

  /* ================================================================
     CONTAR tentativas de um lead (consulta direta ao banco)
     Útil para validações de defesa em profundidade (Card 3).
     ================================================================ */
  static async contarTentativas(leadUuid) {
    if (!supa || !leadUuid) return 0;

    var res = await supa
      .from('ligacoes')
      .select('id', { count: 'exact', head: true })
      .eq('lead_id', leadUuid);

    if (res.error) {
      SLog.error('LigacaoService.contarTentativas: ' + res.error.message);
      return 0;
    }
    return res.count || 0;
  }
}
