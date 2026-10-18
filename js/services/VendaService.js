/* ============================================================
   BEYOND CRM — js/services/VendaService.js   v1.0
   Serviço de Vendas — ponte entre Store e Supabase.
   Beyond Bits Tecnologia © 2026

   ESCOPO:
   - CRUD da tabela 'vendas' (1 venda por lead, garantido por UNIQUE)
   - Checklist pós-venda via 'venda_checklist' (espelha agendamento)
   - Os itens do checklist são criados pelo trigger trg_criar_checklist_venda
   ============================================================ */
'use strict';

class VendaService {

  /* ================================================================
     CRIAR venda
     Parâmetros (dados):
       lead_id            — UUID do lead (obrigatório)
       especialista_id    — UUID do user (obrigatório)
       filial_id          — UUID da filial
       valor_adesao       — número (obrigatório)
       valor_mensalidade  — número
       valor_rastreador   — número
       data_venda         — 'YYYY-MM-DD'
       aniversario        — 'YYYY-MM-DD'
       obs                — string livre
     ================================================================ */
  static async criar(dados) {
    if (!supa) {
      SLog.warn('VendaService.criar: Supabase offline');
      return null;
    }
    if (!dados || !dados.lead_id || !dados.especialista_id || dados.valor_adesao == null) {
      SLog.warn('VendaService.criar: parâmetros obrigatórios ausentes');
      return null;
    }

    var insertData = {
      lead_id:         dados.lead_id,
      especialista_id: dados.especialista_id,
      filial_id:       dados.filial_id || null,
      valor_adesao:    Number(dados.valor_adesao) || 0,
    };
    if (dados.valor_mensalidade != null) insertData.valor_mensalidade = Number(dados.valor_mensalidade) || null;
    if (dados.valor_rastreador  != null) insertData.valor_rastreador  = Number(dados.valor_rastreador)  || null;
    if (dados.data_venda)   insertData.data_venda   = dados.data_venda;
    if (dados.aniversario)  insertData.aniversario  = dados.aniversario;
    if (dados.obs && dados.obs.trim()) insertData.obs = dados.obs.trim();

    try {
      var res = await supa
        .from('vendas')
        .insert(insertData)
        .select()
        .single();

      if (res.error) {
        /* Erro 23505 = duplicate key (UNIQUE em lead_id). Trata como update. */
        if (res.error.code === '23505') {
          SLog.warn('VendaService.criar: já existe venda, atualizando…');
          return await VendaService.atualizarPorLead(dados.lead_id, insertData);
        }
        SLog.error('VendaService.criar: ' + res.error.message);
        return null;
      }

      SLog.info('VendaService.criar OK ✓ (id: ' + res.data.id + ')');

      /* ANIV-SYNC-1: espelha aniversário em leads.aniversario + store.leads
         para que o AniversariantesModule e o card antigo enxerguem o dado
         sem depender de JOIN com vendas. */
      if (dados.aniversario) {
        await VendaService._espelharAniversarioNoLead(dados.lead_id, dados.aniversario);
      }

      return res.data;
    } catch (err) {
      SLog.error('VendaService.criar exceção: ' + err.message);
      return null;
    }
  }

  /* ================================================================
     ATUALIZAR venda por lead (1 venda por lead)
     ================================================================ */
  static async atualizarPorLead(leadUuid, campos) {
    if (!supa || !leadUuid) return null;

    /* Campos não atualizáveis */
    delete campos.lead_id;
    delete campos.especialista_id;
    delete campos.id;
    delete campos.created_at;

    var res = await supa
      .from('vendas')
      .update(campos)
      .eq('lead_id', leadUuid)
      .select()
      .single();

    if (res.error) {
      SLog.error('VendaService.atualizarPorLead: ' + res.error.message);
      return null;
    }
    SLog.info('VendaService.atualizarPorLead OK ✓');

    /* ANIV-SYNC-1: mesmo espelhamento no update */
    if (campos.aniversario) {
      await VendaService._espelharAniversarioNoLead(leadUuid, campos.aniversario);
    }

    return res.data;
  }

  /* ================================================================
     ANIV-SYNC-1 · Espelha aniversario da venda em leads.aniversario
     e atualiza o cache store.leads correspondente.
     Necessário porque SupabaseSync.carregarLeads lê aniversario direto
     da tabela leads, sem JOIN com vendas.
     ================================================================ */
  static async _espelharAniversarioNoLead(leadUuid, aniversario) {
    if (!supa || !leadUuid || !aniversario) return;

    try {
      var upd = await supa
        .from('leads')
        .update({ aniversario: aniversario })
        .eq('id', leadUuid);

      if (upd.error) {
        SLog.warn('ANIV-SYNC-1: falha ao espelhar em leads: ' + upd.error.message);
        return;
      }

      /* Atualiza cache local (evita depender de F5) */
      if (typeof store !== 'undefined' && Array.isArray(store.leads)) {
        var lead = store.leads.find(function(l) { return l._uuid === leadUuid; });
        if (lead) lead.aniversario = aniversario;
      }

      SLog.info('ANIV-SYNC-1: aniversário espelhado em leads ✓');
    } catch (err) {
      SLog.warn('ANIV-SYNC-1 exceção: ' + err.message);
    }
  }

  /* ================================================================
     BUSCAR venda do lead
     ================================================================ */
  static async porLead(leadUuid) {
    if (!supa || !leadUuid) return null;

    var res = await supa
      .from('vendas')
      .select('*')
      .eq('lead_id', leadUuid)
      .maybeSingle();

    if (res.error) {
      SLog.error('VendaService.porLead: ' + res.error.message);
      return null;
    }
    return res.data;
  }

  /* ================================================================
     LISTAR vendas com filtros
     ================================================================ */
  static async listar(filtros) {
    if (!supa) return [];
    filtros = filtros || {};

    var query = supa
      .from('vendas')
      .select(
        '*, ' +
        'lead:leads!lead_id(id, codigo, nome, tel), ' +
        'especialista:profiles!especialista_id(id, nome, sigla)'
      )
      .order('data_venda', { ascending: false })
      .limit(filtros.limit || 500);

    if (filtros.especialista_id) query = query.eq('especialista_id', filtros.especialista_id);
    if (filtros.filial_id)       query = query.eq('filial_id', filtros.filial_id);
    if (filtros.data_inicio)     query = query.gte('data_venda', filtros.data_inicio);
    if (filtros.data_fim)        query = query.lte('data_venda', filtros.data_fim);

    var res = await query;
    if (res.error) {
      SLog.error('VendaService.listar: ' + res.error.message);
      return [];
    }
    return res.data || [];
  }

  /* ================================================================
     CHECKLIST PÓS-VENDA — idêntico ao do agendamento
     ================================================================ */
  static async checklistDaVenda(vendaId) {
    if (!supa || !vendaId) return [];

    var res = await supa
      .from('venda_checklist')
      .select('*, feito_por_user:profiles!feito_por(nome, sigla)')
      .eq('venda_id', vendaId)
      .order('ordem', { ascending: true });

    if (res.error) {
      SLog.error('VendaService.checklistDaVenda: ' + res.error.message);
      return [];
    }
    return res.data || [];
  }

  /* ================================================================
     Chamado #53 — MODELO do checklist de venda (para PRÉVIA).
     ================================================================
     Antes de a venda ser registrada não existem linhas em
     venda_checklist (o trigger trg_criar_checklist_venda só cria
     após o INSERT em vendas). Para mostrar a prévia do checklist já
     na aba Venda, buscamos os itens da venda MAIS RECENTE que o
     usuário pode ver — como o trigger cria sempre o mesmo modelo,
     isso reflete o template atual sem precisar duplicar os rótulos
     no front (evita divergência).

     Retorna [{ item_label, ordem }] ordenado, ou [] se não houver
     nenhuma venda com checklist visível (ex.: base nova). */
  static async checklistModelo() {
    if (!supa) return [];

    var res = await supa
      .from('venda_checklist')
      .select('venda_id, item_label, ordem, created_at')
      .order('created_at', { ascending: false })
      .limit(60);

    if (res.error) {
      SLog.error('VendaService.checklistModelo: ' + res.error.message);
      return [];
    }

    var rows = res.data || [];
    if (!rows.length) return [];

    /* Isola os itens da venda mais recente (primeira linha do desc). */
    var vendaAlvo = rows[0].venda_id;
    var itens = rows.filter(function(r) { return r.venda_id === vendaAlvo; });
    itens.sort(function(a, b) { return (a.ordem || 0) - (b.ordem || 0); });

    /* Dedup defensivo por rótulo, preservando a ordem. */
    var vistos = {};
    var out = [];
    itens.forEach(function(r) {
      var k = String(r.item_label == null ? '' : r.item_label);
      if (k && !vistos[k]) { vistos[k] = 1; out.push({ item_label: r.item_label, ordem: r.ordem }); }
    });
    return out;
  }

  static async marcarItemChecklist(itemId, feito) {
    if (!supa || !itemId) return null;

    var userId = (AuthService.currentUser && AuthService.currentUser.id) || null;
    var update = {
      feito:     !!feito,
      feito_em:  feito ? new Date().toISOString() : null,
      feito_por: feito ? userId : null,
    };

    var res = await supa
      .from('venda_checklist')
      .update(update)
      .eq('id', itemId)
      .select()
      .single();

    if (res.error) {
      SLog.error('VendaService.marcarItemChecklist: ' + res.error.message);
      return null;
    }
    SLog.info('VendaService.marcarItemChecklist OK ✓ (' + (feito ? 'feito' : 'desmarcado') + ')');
    return res.data;
  }
}
