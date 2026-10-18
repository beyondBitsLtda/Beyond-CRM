/* ============================================================
   BEYOND CRM — js/modules/InativacaoUsuarioModule.js   v1.0
   Fluxo: gerente inativa usuário → DEVE redistribuir leads
   (em massa ou seletivamente) → profile.ativo = false.
   Beyond Bits Tecnologia © 2026
   ============================================================ */
'use strict';

class InativacaoUsuarioModule {

  static _leadsDoUsuario = [];
  static _userInativando = null;
  static _htmlOpcoes     = '';

  /* ── Abrir fluxo ────────────────────────────────────── */
  static async abrir(userId, userNome) {
    if (!AuthService.currentProfile || AuthService.currentProfile.perfil !== 'gerente') {
      Toast.show('Apenas gerentes podem inativar usuários.', 'warning');
      return;
    }
    if (userId === AuthService.currentUser.id) {
      Toast.show('Você não pode inativar a si mesmo.', 'warning');
      return;
    }

    InativacaoUsuarioModule._userInativando = { id: userId, nome: userNome };
    SLog.load('INATIV abrindo fluxo: ' + userNome);

    /* Busca leads onde o usuário é responsável */
    var leads = await LeadTransferService.leadsDoUsuario(userId);
    InativacaoUsuarioModule._leadsDoUsuario = leads;

    $('#inativ-user-nome').text(userNome);
    $('#inativ-count').text(leads.length);

    if (leads.length === 0) {
      $('#inativ-com-leads').hide();
      $('#inativ-sem-leads').show();
    } else {
      $('#inativ-sem-leads').hide();
      $('#inativ-com-leads').show();
      await InativacaoUsuarioModule._popularSelects();
      InativacaoUsuarioModule._renderTabelaLeads();
      InativacaoUsuarioModule._mudarModo('massa');
    }

    Modal.abrir('modal-inativacao');
  }

  /* ── Popular selects de destinatários ───────────────── */
  static async _popularSelects() {
    var inativandoId = InativacaoUsuarioModule._userInativando.id;

    var res = await supa.from('profiles')
      .select('id, nome, sigla, perfil')
      .eq('ativo', true)
      .neq('id', inativandoId)
      .order('nome');

    var html = '<option value="">Selecione...</option>';
    (res.data || []).forEach(function(u) {
      var perfilLbl = ((PERFIL_CONFIG[u.perfil] || {}).label) || u.perfil;
      html += '<option value="' + u.id + '">' +
              Utils.escHtml(u.nome) + ' (' + Utils.escHtml(u.sigla || '') + ') — ' +
              Utils.escHtml(perfilLbl) +
              '</option>';
    });

    $('#inativ-destino-massa').html(html);
    $('#inativ-destino-padrao').html(html);
    InativacaoUsuarioModule._htmlOpcoes = html;
  }

  /* ── Renderizar tabela de leads (modo seletivo) ─────── */
  static _renderTabelaLeads() {
    var leads = InativacaoUsuarioModule._leadsDoUsuario;
    var html = '<div class="table-wrap">';
    html += '<table class="amp-table">' +
            '<thead><tr>' +
              '<th>Código</th>' +
              '<th>Nome</th>' +
              '<th>Etapa</th>' +
              '<th style="min-width:240px;">Destinatário</th>' +
            '</tr></thead><tbody>';

    leads.forEach(function(l) {
      var etapaLbl = ((STAGE_CONFIG[l.etapa] || {}).label) || l.etapa;
      html += '<tr>' +
              '<td><span class="cod-mono">' + Utils.escHtml(l.codigo || '') + '</span></td>' +
              '<td>' + Utils.escHtml(l.nome || '') + '</td>' +
              '<td>' + Utils.escHtml(etapaLbl) + '</td>' +
              '<td>' +
                '<select class="form-select form-select-sm inativ-destino-row" data-lead-uuid="' + l.id + '">' +
                InativacaoUsuarioModule._htmlOpcoes +
                '</select>' +
              '</td>' +
              '</tr>';
    });
    html += '</tbody></table></div>';

    $('#inativ-tabela-leads').html(html);
  }

  /* ── Trocar modo (massa ↔ seletivo) ─────────────────── */
  static _mudarModo(modo) {
    $('#inativ-modo').val(modo);
    if (modo === 'massa') {
      $('#inativ-bloco-massa').show();
      $('#inativ-bloco-seletivo').hide();
      $('#btn-modo-massa').addClass('active');
      $('#btn-modo-seletivo').removeClass('active');
    } else {
      $('#inativ-bloco-massa').hide();
      $('#inativ-bloco-seletivo').show();
      $('#btn-modo-massa').removeClass('active');
      $('#btn-modo-seletivo').addClass('active');
    }
  }

  /* ── Confirmar inativação ───────────────────────────── */
  static async confirmar() {
    var user  = InativacaoUsuarioModule._userInativando;
    var leads = InativacaoUsuarioModule._leadsDoUsuario;

    var $btn = $('#btn-confirmar-inativ');
    var htmlOriginal = $btn.html();
    $btn.prop('disabled', true).html('<i class="bi bi-arrow-repeat spin-icon"></i> Processando...');

    try {
      /* Caso A: sem leads → inativa direto */
      if (leads.length === 0) {
        await InativacaoUsuarioModule._executarInativacao(user.id);
        Toast.show('Usuário inativado.', 'success');
        InativacaoUsuarioModule._finalizar();
        return;
      }

      var modo = $('#inativ-modo').val();
      var resT;

      /* Caso B: massa */
      if (modo === 'massa') {
        var destinoMassa = $('#inativ-destino-massa').val();
        if (!destinoMassa) {
          Toast.show('Selecione o destinatário.', 'warning');
          return;
        }
        var uuids = leads.map(function(l) { return l.id; });
        resT = await LeadTransferService.transferirLote(uuids, destinoMassa, 'Inativação de ' + user.nome);
      }
      /* Caso C: seletivo */
      else {
        var padrao = $('#inativ-destino-padrao').val();
        var mapa = {};
        $('.inativ-destino-row').each(function() {
          var leadUuid = $(this).data('lead-uuid');
          var dest     = $(this).val();
          if (!dest && padrao) dest = padrao;
          if (dest) mapa[leadUuid] = dest;
        });

        var faltam = leads.length - Object.keys(mapa).length;
        if (faltam > 0) {
          Toast.show(faltam + ' lead(s) sem destinatário. Defina um destino padrão ou preencha todos.', 'warning');
          return;
        }
        resT = await LeadTransferService.transferirSeletivo(mapa, 'Inativação de ' + user.nome);
      }

      if (resT.falhas.length > 0) {
        Toast.show('Algumas transferências falharam (' + resT.falhas.length + '). Inativação cancelada.', 'danger');
        SLog.error('INATIV abortada — falhas: ' + JSON.stringify(resT.falhas));
        return;
      }

      /* Limpa compartilhamentos do usuário */
      await LeadVisibilidadeService.removerTodosDoUsuario(user.id);

      /* Inativa profile */
      await InativacaoUsuarioModule._executarInativacao(user.id);

      Toast.show('Usuário inativado. ' + resT.ok + ' lead(s) redistribuído(s).', 'success');
      InativacaoUsuarioModule._finalizar();
    } catch (err) {
      Toast.show('Erro: ' + err.message, 'danger');
      SLog.error('INATIV exceção: ' + err.message);
    } finally {
      $btn.prop('disabled', false).html(htmlOriginal);
    }
  }

  /* ── UPDATE profile.ativo = false ───────────────────── */
  static async _executarInativacao(userId) {
    var res = await supa.from('profiles').update({ ativo: false }).eq('id', userId);
    if (res.error) throw new Error('Falha ao inativar profile: ' + res.error.message);

    if (typeof store !== 'undefined' && store._logAudit) {
      store._logAudit('Inativação de Usuário', userId, 'inativo');
    }
    SLog.info('INATIV profile ' + userId + ' marcado como inativo ✓');
  }

  /* ── Pós-confirmação: fecha modal e re-renderiza ────── */
  static async _finalizar() {
    Modal.fechar('modal-inativacao');
    if (typeof SupabaseSync !== 'undefined' && SupabaseSync.carregarTudo) {
      await SupabaseSync.carregarTudo();
    }
    if (typeof UsuarioModule !== 'undefined' && UsuarioModule.render) UsuarioModule.render();
    if (typeof FunilModule !== 'undefined') {
      FunilModule.renderKanban && FunilModule.renderKanban();
      FunilModule.atualizarKPIs && FunilModule.atualizarKPIs();
    }
  }
}
