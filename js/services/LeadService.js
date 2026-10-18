/* ============================================================
   BEYOND CRM — js/services/LeadService.js   v1.0
   Serviço de Leads — ponte entre Store e Supabase (Fase 2).
   Beyond Bits Tecnologia © 2026
   ============================================================

   COMO FUNCIONA:
   - O Store continua sendo o ponto único de acesso aos dados.
   - Cada método do Store que antes operava em arrays locais
     agora pode chamar o LeadService para persistir no banco.
   - Os módulos (FunilModule etc.) NÃO mudam — eles continuam
     chamando store.adicionarLead(), store.buscarLead(), etc.

   MIGRAÇÃO GRADUAL:
   - Enquanto a integração não estiver completa, o Store pode
     usar os dados em memória como fallback.
   - Para ativar a integração, basta trocar os métodos do Store
     para chamar LeadService (conforme Seção 7.3 do Doc. Técnico).

   ============================================================ */
'use strict';

class LeadService {

  /* ── Buscar todos os leads (respeitando RLS) ── */
  static async listar(filtros = {}) {
    if (!supa) return [];

    let query = supa
      .from('leads')
      .select(`
        *,
        captador:profiles!captador_id(nome, sigla),
        filial:filiais(nome),
        lead_tags(tag:tags(slug, label, cls))
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    /* Filtros opcionais */
    if (filtros.etapa) query = query.eq('etapa', filtros.etapa);
    if (filtros.captador_id) query = query.eq('captador_id', filtros.captador_id);
    if (filtros.filial_id) query = query.eq('filial_id', filtros.filial_id);
    if (filtros.fonte) query = query.eq('fonte', filtros.fonte);

    const { data, error } = await query;

    if (error) {
      console.error('[LeadService] Erro ao listar leads:', error.message);
      return [];
    }

    return data;
  }

  /* ── Buscar lead por ID ── */
  static async buscar(id) {
    if (!supa) return null;

    const { data, error } = await supa
      .from('leads')
      .select(`
        *,
        captador:profiles!captador_id(nome, sigla),
        filial:filiais(nome),
        lead_tags(tag:tags(slug, label, cls))
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('[LeadService] Erro ao buscar lead:', error.message);
      return null;
    }

    return data;
  }

  /* ── Criar novo lead ── */
  static async criar(dadosLead) {
    if (!supa) return null;

    /* Gerar código incremental via função do banco */
    const { data: codigoData, error: codigoError } = await supa
      .rpc('proximo_lead_id');

    if (codigoError) {
      console.error('[LeadService] Erro ao gerar código:', codigoError.message);
      return null;
    }

    const lead = {
      ...dadosLead,
      codigo: codigoData,
      /* responsavel_id obrigatorio apos migration; default = captador */
      responsavel_id: dadosLead.responsavel_id
                   || dadosLead.captador_id
                   || (typeof AuthService !== 'undefined' && AuthService.currentUser && AuthService.currentUser.id),
    };

    const { data, error } = await supa
      .from('leads')
      .insert(lead)
      .select()
      .single();

    if (error) {
      console.error('[LeadService] Erro ao criar lead:', error.message);
      return null;
    }

    /* Sprint 7 · 7.4 — Log de auditoria REMOVIDO daqui pra evitar
       duplicação. A rota autoritativa é store._logAudit(), que já
       grava em audit_log em TODOS os fluxos que passam pelo store
       (que hoje é 100% do app — este método não é chamado por
       nenhum consumidor, mas fica sem log preventivamente pra
       evitar dedup caso venha a ser usado no futuro). */
    /* await AuditLogger.logCriacao('Lead', data.codigo + ' — ' + data.nome); */
    return data;
  }

  /* ── Atualizar lead ── */
  static async atualizar(id, campos) {
    if (!supa) return null;

    const { data, error } = await supa
      .from('leads')
      .update(campos)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[LeadService] Erro ao atualizar lead:', error.message);
      return null;
    }

    /* Sprint 7 · 7.4 — Log removido daqui (ver comentário em criar()). */
    /* await AuditLogger.log('Dados do lead ' + data.codigo, '—', JSON.stringify(campos)); */
    return data;
  }

  /* ── Avançar etapa ── */
  static async avancarEtapa(id, novaEtapa) {
    if (!supa) return null;

    /* Buscar etapa atual para log */
    const leadAtual = await LeadService.buscar(id);
    if (!leadAtual) return null;

    const etapaAnterior = leadAtual.etapa;

    const { data, error } = await supa
      .from('leads')
      .update({ etapa: novaEtapa })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[LeadService] Erro ao avançar etapa:', error.message);
      return null;
    }

    /* Sprint 7 · 7.4 — Log removido daqui (ver comentário em criar()). */
    /* await AuditLogger.logEtapa(data.codigo, etapaAnterior, novaEtapa); */
    return data;
  }

  /* ── Soft delete ── */
  static async remover(id) {
    if (!supa) return false;

    const { error } = await supa
      .from('leads')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[LeadService] Erro ao remover lead:', error.message);
      return false;
    }

    return true;
  }

  /* ── Pesquisa global (RF-24) ── */
  static async pesquisar(query) {
    if (!supa || !query || query.length < 2) return [];

    const { data, error } = await supa
      .from('leads')
      .select('id, codigo, nome, tel, etapa, fonte')
      .is('deleted_at', null)
      .or(`nome.ilike.%${query}%,tel.ilike.%${query}%,codigo.ilike.%${query}%`)
      .limit(8);

    if (error) {
      console.error('[LeadService] Erro na pesquisa:', error.message);
      return [];
    }

    return data;
  }

  /* ── Contar leads por etapa ── */
  static async contarPorEtapa() {
    if (!supa) return {};

    const { data, error } = await supa
      .from('leads')
      .select('etapa')
      .is('deleted_at', null);

    if (error) {
      console.error('[LeadService] Erro ao contar por etapa:', error.message);
      return {};
    }

    const contagem = {};
    data.forEach(l => {
      contagem[l.etapa] = (contagem[l.etapa] || 0) + 1;
    });

    return contagem;
  }

  /* ── Adicionar tag ao lead ── */
  static async adicionarTag(leadId, tagSlug) {
    if (!supa) return false;

    /* Buscar ID da tag pelo slug */
    const { data: tag } = await supa
      .from('tags')
      .select('id')
      .eq('slug', tagSlug)
      .single();

    if (!tag) return false;

    const { error } = await supa
      .from('lead_tags')
      .insert({ lead_id: leadId, tag_id: tag.id });

    return !error;
  }

  /* ── Remover tag do lead ── */
  static async removerTag(leadId, tagSlug) {
    if (!supa) return false;

    const { data: tag } = await supa
      .from('tags')
      .select('id')
      .eq('slug', tagSlug)
      .single();

    if (!tag) return false;

    const { error } = await supa
      .from('lead_tags')
      .delete()
      .eq('lead_id', leadId)
      .eq('tag_id', tag.id);

    return !error;
  }
}
