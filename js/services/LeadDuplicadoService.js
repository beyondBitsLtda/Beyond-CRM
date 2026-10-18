/* ============================================================
   BEYOND CRM — js/services/LeadDuplicadoService.js   v1.0
   Detecção de leads com telefone duplicado (feature 4.4).
   Beyond Bits Tecnologia © 2026

   Cobre RN-25: ao cadastrar um novo lead, verificar se o
   telefone já existe na base ativa. Se sim, retornar os leads
   existentes com dados do responsável atual para o modal de
   alerta decidir o fluxo.

   ARQUITETURA:
   - Normalização é feita no BANCO pela função immutable
     public.normalizar_telefone(), que também alimenta a coluna
     leads.tel_normalizado (GENERATED STORED).
   - Aqui no cliente NORMALIZAMOS a string ANTES da query
     (mesma lógica), pra encaminhar já pronto ao banco e
     usar o índice idx_leads_tel_normalizado (performance).
   - Escopo: todos os leads NÃO deletados (deleted_at IS NULL).
     Isso inclui leads arquivados de propósito — se o mesmo
     telefone voltou, o gerente precisa saber pra decidir.

   USO:
     var duplicados = await LeadDuplicadoService.buscarPorTelefone(tel);
     if (duplicados.length > 0) { ...abre modal... }
   ============================================================ */
'use strict';

class LeadDuplicadoService {

  /* ────────────────────────────────────────────────────
     Normaliza telefone no cliente com a MESMA regra do banco
     (public.normalizar_telefone). Reproduzir a lógica aqui evita
     round-trip só pra normalizar antes de buscar.

     Regras (idênticas às do SQL):
       - Remove tudo que não é dígito
       - Se tiver 12 ou 13 dígitos começando com '55', remove '55'
       - String vazia → null
     ──────────────────────────────────────────────────── */
  static normalizar(tel) {
    if (tel == null) return null;
    var d = String(tel).replace(/\D/g, '');
    if (d === '') return null;
    if ((d.length === 12 || d.length === 13) && d.substr(0, 2) === '55') {
      d = d.substr(2);
    }
    return d;
  }

  /* ────────────────────────────────────────────────────
     buscarPorTelefone(tel)
       tel     : string (qualquer formato, será normalizado)
       excluir : opcional, UUID de um lead a IGNORAR na busca
                 (útil no futuro em edição de lead existente)

     Retorno: array de objetos formatados para consumo do modal:
       [{
         _uuid, codigo, nome, tel, tel_normalizado, etapa,
         arquivado, responsavel_id,
         responsavel_nome, responsavel_sigla,
         filial_id, filial_nome
       }, ...]
     Array vazio quando não há duplicidade.
     ──────────────────────────────────────────────────── */
  static async buscarPorTelefone(tel, excluir) {
    if (!supa) {
      SLog.warn('LEAD DUP: Supabase offline — pulando checagem');
      return [];
    }

    var telNorm = LeadDuplicadoService.normalizar(tel);
    if (!telNorm || telNorm.length < 8) {
      /* Telefone muito curto pra ser válido — não checa. A validação
         de formato do telefone é feita antes por Utils.validarTelefone. */
      return [];
    }

    var query = supa.from('leads')
      .select(
        'id, codigo, nome, tel, tel_normalizado, etapa, arquivado, ' +
        'responsavel_id, filial_id, ' +
        'responsavel:profiles!responsavel_id(nome, sigla), ' +
        'filial:filiais(nome)'
      )
      .eq('tel_normalizado', telNorm)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (excluir) query = query.neq('id', excluir);

    var res = await query;
    if (res.error) {
      SLog.error('LEAD DUP busca: ' + res.error.message);
      return [];
    }

    /* Achata o retorno para o formato consumível pelo modal */
    return (res.data || []).map(function(l) {
      return {
        _uuid:              l.id,
        codigo:             l.codigo,
        nome:               l.nome,
        tel:                l.tel,
        tel_normalizado:    l.tel_normalizado,
        etapa:              l.etapa,
        arquivado:          l.arquivado === true,
        responsavel_id:     l.responsavel_id,
        responsavel_nome:   (l.responsavel && l.responsavel.nome)  || '—',
        responsavel_sigla:  (l.responsavel && l.responsavel.sigla) || '—',
        filial_id:          l.filial_id,
        filial_nome:        (l.filial && l.filial.nome) || '—',
      };
    });
  }

  /* ────────────────────────────────────────────────────
     Notificar gerentes da filial sobre uma tentativa de
     cadastro com telefone duplicado. Reaproveita o RPC
     notificar_gerentes_da_filial (mesma infra que o C2 usa).

       filialId       : UUID da filial (do usuário logado ou do lead
                        existente — aqui usamos a do usuário logado
                        para chegar aos gestores dele)
       novoLead       : { codigo, nome }         — o lead recém-criado
       leadsExistentes: array retornado por buscarPorTelefone
       especialistaNm : nome do especialista que cadastrou

     Retorna quantidade de gerentes notificados.
     ──────────────────────────────────────────────────── */
  static async notificarGerentes(filialId, novoLead, leadsExistentes, especialistaNm) {
    if (!filialId) {
      SLog.warn('LEAD DUP notif: sem filialId — sem gestores para notificar');
      return 0;
    }

    /* Constrói a mensagem — se houver 1 existente, cita nome do responsável;
       se houver múltiplos, usa contagem. */
    var msg;
    if (leadsExistentes.length === 1) {
      var existente = leadsExistentes[0];
      msg = '⚠️ Telefone duplicado: ' + (novoLead.nome || 'lead') +
            ' (' + (novoLead.codigo || '?') + ') cadastrado por ' +
            (especialistaNm || 'um especialista') +
            ' — telefone já em uso por ' + existente.nome +
            ' (' + existente.codigo + '), responsável ' + existente.responsavel_nome + '.';
    } else {
      msg = '⚠️ Telefone duplicado: ' + (novoLead.nome || 'lead') +
            ' (' + (novoLead.codigo || '?') + ') cadastrado por ' +
            (especialistaNm || 'um especialista') +
            ' — telefone já em uso por ' + leadsExistentes.length + ' outro(s) lead(s).';
    }

    /* Reaproveita a mesma infra de notificação usada pelo C2 (RN-04). */
    if (typeof store === 'undefined' || !store.adicionarNotificacaoGestores) {
      SLog.warn('LEAD DUP notif: store.adicionarNotificacaoGestores indisponível');
      return 0;
    }

    var qtd = await store.adicionarNotificacaoGestores(filialId, msg);
    SLog.info('LEAD DUP: ' + qtd + ' gerente(s) notificado(s) sobre duplicidade');
    return qtd;
  }
}
