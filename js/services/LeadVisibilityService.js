/* ============================================================
   BEYOND CRM — js/services/LeadVisibilityService.js   v1.0
   Controle de visibilidade de leads + transferências.
   Beyond Bits Tecnologia © 2026

   RESPONSABILIDADES:
   - Filtrar leads conforme perfil do usuário logado
   - Gerenciar acessos de supervisores (tabela supervisor_lead_access)
   - Transferir leads individual e em massa
   - Contar leads por usuário (para modal de transferência)
   ============================================================ */
'use strict';

class LeadVisibilityService {

  /* ================================================================
     FILTRO DE VISIBILIDADE (Front-end — defesa em profundidade)
     O RLS no Supabase já filtra no banco. Este filtro é redundante
     para garantir segurança mesmo se o front exibir dados em cache.
     ================================================================ */

  /**
   * Retorna os leads que o usuário logado pode ver.
   * Usa o array store.leads (já filtrado pelo RLS do banco).
   * Esta camada extra previne exibição acidental de dados em cache.
   */
  static leadsVisiveis() {
    var perfil = LeadVisibilityService._perfilAtual();
    var userId = LeadVisibilityService._userIdAtual();

    if (!perfil || !userId) return [];

    /* Gerente: vê tudo */
    if (perfil === 'gerente') return store.leads;

    /* Especialista e Supervisor: filtram pelos próprios + acessos */
    return store.leads.filter(function(lead) {
      /* Lead que eu mesmo cadastrei */
      if (lead.captador_id === userId) return true;

      /* Supervisor: verificar acessos concedidos */
      if (perfil === 'supervisor' && store._supervisorAccess) {
        /* Acesso por usuário (vê todos os leads de um especialista) */
        var acessoUsuarios = store._supervisorAccess.usuarios || [];
        if (acessoUsuarios.indexOf(lead.captador_id) >= 0) return true;

        /* Acesso por lead individual */
        var acessoLeads = store._supervisorAccess.leads || [];
        if (lead._uuid && acessoLeads.indexOf(lead._uuid) >= 0) return true;
      }

      return false;
    });
  }

  /**
   * Versão filtrada de leadsPorEtapa
   */
  static leadsPorEtapaVisiveis(etapa) {
    return LeadVisibilityService.leadsVisiveis().filter(function(l) {
      return l.etapa === etapa;
    });
  }

  /* ================================================================
     CARREGAR ACESSOS DO SUPERVISOR
     ================================================================ */

  /**
   * Carrega do banco os acessos concedidos ao supervisor logado.
   * Armazena em store._supervisorAccess para uso no filtro front-end.
   */
  static async carregarAcessosSupervisor() {
    var perfil = LeadVisibilityService._perfilAtual();
    if (perfil !== 'supervisor' || !supa) {
      store._supervisorAccess = { usuarios: [], leads: [] };
      return;
    }

    var userId = LeadVisibilityService._userIdAtual();
    var { data, error } = await supa
      .from('supervisor_lead_access')
      .select('usuario_id, lead_id')
      .eq('supervisor_id', userId);

    if (error) {
      SLog.error('supervisor_lead_access: ' + error.message);
      store._supervisorAccess = { usuarios: [], leads: [] };
      return;
    }

    var usuarios = [];
    var leads = [];
    (data || []).forEach(function(row) {
      if (row.usuario_id) usuarios.push(row.usuario_id);
      if (row.lead_id) leads.push(row.lead_id);
    });

    store._supervisorAccess = { usuarios: usuarios, leads: leads };
    SLog.info('supervisor_access: ' + usuarios.length + ' usuários, ' + leads.length + ' leads individuais');
  }

  /* ================================================================
     GERENCIAR ACESSOS (só gerente)
     ================================================================ */

  /**
   * Listar todos os acessos de um supervisor específico
   */
  static async listarAcessos(supervisorId) {
    if (!supa) return [];
    var { data, error } = await supa
      .from('supervisor_lead_access')
      .select('*, usuario:profiles!usuario_id(nome, sigla), lead:leads!lead_id(codigo, nome)')
      .eq('supervisor_id', supervisorId);

    if (error) { SLog.error('listarAcessos: ' + error.message); return []; }
    return data || [];
  }

  /**
   * Conceder acesso a um supervisor (por usuário inteiro)
   */
  static async concederAcessoUsuario(supervisorId, usuarioId) {
    if (!supa) return false;
    var gerenteId = LeadVisibilityService._userIdAtual();
    var { error } = await supa.from('supervisor_lead_access').insert({
      supervisor_id: supervisorId,
      usuario_id: usuarioId,
      concedido_por: gerenteId,
    });
    if (error) {
      if (error.code === '23505') { /* duplicata — já existe */ return true; }
      SLog.error('concederAcessoUsuario: ' + error.message);
      return false;
    }
    SLog.info('Acesso concedido: supervisor=' + supervisorId + ' → usuário=' + usuarioId);
    return true;
  }

  /**
   * Conceder acesso a um supervisor (por lead individual)
   */
  static async concederAcessoLead(supervisorId, leadUuid) {
    if (!supa) return false;
    var gerenteId = LeadVisibilityService._userIdAtual();
    var { error } = await supa.from('supervisor_lead_access').insert({
      supervisor_id: supervisorId,
      lead_id: leadUuid,
      concedido_por: gerenteId,
    });
    if (error) {
      if (error.code === '23505') return true;
      SLog.error('concederAcessoLead: ' + error.message);
      return false;
    }
    SLog.info('Acesso concedido: supervisor=' + supervisorId + ' → lead=' + leadUuid);
    return true;
  }

  /**
   * Revogar acesso de um supervisor (por ID do registro)
   */
  static async revogarAcesso(acessoId) {
    if (!supa) return false;
    var { error } = await supa.from('supervisor_lead_access').delete().eq('id', acessoId);
    if (error) { SLog.error('revogarAcesso: ' + error.message); return false; }
    SLog.info('Acesso revogado: ' + acessoId);
    return true;
  }

  /**
   * Revogar TODOS os acessos de um supervisor
   */
  static async revogarTodosAcessos(supervisorId) {
    if (!supa) return false;
    var { error } = await supa.from('supervisor_lead_access').delete().eq('supervisor_id', supervisorId);
    if (error) { SLog.error('revogarTodosAcessos: ' + error.message); return false; }
    SLog.info('Todos os acessos revogados para supervisor: ' + supervisorId);
    return true;
  }

  /* ================================================================
     TRANSFERÊNCIA DE LEADS
     ================================================================ */

  /**
   * Transferir um lead individual
   */
  static async transferirLead(leadUuid, paraUsuarioId, motivo) {
    if (!supa) return false;

    var deUsuarioId = null;
    var lead = store.leads.find(function(l) { return l._uuid === leadUuid; });
    if (lead) deUsuarioId = lead.captador_id;

    /* Atualizar no banco */
    var { error } = await supa.from('leads').update({ captador_id: paraUsuarioId }).eq('id', leadUuid);
    if (error) {
      SLog.error('transferirLead UPDATE: ' + error.message);
      Toast.show('Erro ao transferir: ' + error.message, 'danger');
      return false;
    }

    /* Registrar transferência */
    var gerenteId = LeadVisibilityService._userIdAtual();
    await supa.from('lead_transfers').insert({
      lead_id: leadUuid,
      de_usuario_id: deUsuarioId || gerenteId,
      para_usuario_id: paraUsuarioId,
      transferido_por: gerenteId,
      motivo: motivo || 'Transferência individual',
    });

    /* Atualizar store local */
    if (lead) {
      lead.captador_id = paraUsuarioId;
      var novoUser = store.usuarios.find(function(u) { return u._id === paraUsuarioId; });
      lead.captador = novoUser ? novoUser.nome : '—';
    }

    SLog.info('Lead transferido: ' + leadUuid + ' → ' + paraUsuarioId);
    return true;
  }

  /**
   * Transferir leads em massa (usando função do banco)
   */
  static async transferirEmMassa(leadUuids, paraUsuarioId, motivo) {
    if (!supa || !leadUuids.length) return 0;

    var { data, error } = await supa.rpc('transferir_leads_em_massa', {
      p_lead_ids: leadUuids,
      p_para_usuario: paraUsuarioId,
      p_motivo: motivo || 'Transferência em massa',
    });

    if (error) {
      SLog.error('transferirEmMassa: ' + error.message);
      Toast.show('Erro na transferência: ' + error.message, 'danger');
      return 0;
    }

    /* Atualizar store local */
    var novoUser = store.usuarios.find(function(u) { return u._id === paraUsuarioId; });
    leadUuids.forEach(function(uuid) {
      var lead = store.leads.find(function(l) { return l._uuid === uuid; });
      if (lead) {
        lead.captador_id = paraUsuarioId;
        lead.captador = novoUser ? novoUser.nome : '—';
      }
    });

    SLog.info('Transferência em massa: ' + data + ' leads transferidos para ' + paraUsuarioId);
    return data || 0;
  }

  /**
   * Contar leads de um usuário (para exibir no modal de transferência)
   */
  static contarLeadsUsuario(usuarioId) {
    return store.leads.filter(function(l) { return l.captador_id === usuarioId; }).length;
  }

  /**
   * Listar leads de um usuário (para seleção no modal)
   */
  static leadsDoUsuario(usuarioId) {
    return store.leads.filter(function(l) { return l.captador_id === usuarioId; });
  }

  /* ================================================================
     HELPERS PRIVADOS
     ================================================================ */

  static _perfilAtual() {
    return AuthService.currentProfile ? AuthService.currentProfile.perfil : null;
  }

  static _userIdAtual() {
    return AuthService.currentUser ? AuthService.currentUser.id : null;
  }

  /**
   * Verifica se o usuário logado é gerente
   */
  static isGerente() {
    return LeadVisibilityService._perfilAtual() === 'gerente';
  }

  /**
   * Verifica se o usuário logado é supervisor
   */
  static isSupervisor() {
    return LeadVisibilityService._perfilAtual() === 'supervisor';
  }
}
