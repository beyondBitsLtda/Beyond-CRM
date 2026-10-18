/* ============================================================
   BEYOND CRM — js/modules/TransferenciaModule.js   v1.0
   UI para transferir um lead avulso (somente gerente).
   Beyond Bits Tecnologia © 2026
   ============================================================ */
'use strict';

class TransferenciaModule {

  /* ── Injetar botão "Transferir" no footer do modal-lead ── */
  static injetarBotaoNoModalLead() {
    if (!AuthService.currentProfile || AuthService.currentProfile.perfil !== 'gerente') return;

    var lead = store.currentLead;
    if (!lead || !lead._uuid) return;

    var $footer = $('#modal-lead .amp-modal-footer');
    if (!$footer.length) return;
    if ($footer.find('#mld-btn-transferir').length) return; /* já injetado */

    var btn = '<button id="mld-btn-transferir" class="btn-beyond btn-secondary-amp" ' +
              'onclick="TransferenciaModule.abrir(\'' + lead._uuid + '\')">' +
              '<i class="bi bi-arrow-left-right"></i> Transferir</button>';

    /* insere antes do botão de Avançar */
    var $avancar = $footer.find('#mld-btn-avancar');
    if ($avancar.length) $avancar.before(btn);
    else                 $footer.append(btn);
  }

  /* ── Abrir modal de transferência ───────────────────── */
  static async abrir(leadUuid) {
    $('#transf-lead-uuid').val(leadUuid);
    $('#transf-motivo').val('');
    $('#transf-destino').html('<option value="">Carregando...</option>');

    /* Info do lead */
    var l = store.leads.find(function(x) { return x._uuid === leadUuid; });
    var infoTxt = l ? (l.id + ' — ' + l.nome) : 'Lead selecionado';
    $('#transf-lead-info').text(infoTxt);

    await TransferenciaModule._popularUsuarios();
    Modal.abrir('modal-transferencia');
  }

  /* ── Confirmar ──────────────────────────────────────── */
  static async confirmar() {
    var leadUuid   = $('#transf-lead-uuid').val();
    var paraUserId = $('#transf-destino').val();
    var motivo     = $('#transf-motivo').val().trim();

    if (!paraUserId) {
      Toast.show('Selecione um destinatário.', 'warning');
      return;
    }

    var $btn = $('#btn-confirmar-transf');
    var htmlOriginal = $btn.html();
    $btn.prop('disabled', true).html('<i class="bi bi-arrow-repeat spin-icon"></i> Transferindo...');

    try {
      await LeadTransferService.transferir(leadUuid, paraUserId, motivo);
      Toast.show('Lead transferido com sucesso.', 'success');
      Modal.fechar('modal-transferencia');
      Modal.fechar('modal-lead');

      /* Recarregar dados do Supabase e renderizar */
      if (typeof SupabaseSync !== 'undefined' && SupabaseSync.carregarTudo) {
        await SupabaseSync.carregarTudo();
      }
      if (typeof FunilModule !== 'undefined') {
        FunilModule.renderKanban && FunilModule.renderKanban();
        FunilModule.atualizarKPIs && FunilModule.atualizarKPIs();
      }
    } catch (err) {
      Toast.show('Erro: ' + err.message, 'danger');
    } finally {
      $btn.prop('disabled', false).html(htmlOriginal);
    }
  }

  /* ── Popular select de usuários ativos ─────────────── */
  static async _popularUsuarios() {
    var $sel = $('#transf-destino');
    var meuId = AuthService.currentUser ? AuthService.currentUser.id : null;
    var leadUuid = $('#transf-lead-uuid').val();
    var responsavelAtual = null;
    var l = store.leads.find(function(x) { return x._uuid === leadUuid; });
    if (l) responsavelAtual = l.responsavel_id || l.captador_id;

    var res = await supa.from('profiles')
      .select('id, nome, sigla, perfil, filiais(nome)')
      .eq('ativo', true)
      .order('nome');

    if (res.error) {
      $sel.html('<option value="">Erro ao carregar usuários</option>');
      SLog.error('TRANSF popularUsuarios: ' + res.error.message);
      return;
    }

    var users = res.data || [];
    $sel.html('<option value="">Selecione...</option>');

    users.forEach(function(u) {
      if (u.id === responsavelAtual) return; /* não mostra o responsável atual */
      var perfilLbl = ((PERFIL_CONFIG[u.perfil] || {}).label) || u.perfil;
      var filialLbl = u.filiais ? u.filiais.nome : '—';
      var label = Utils.escHtml(u.nome) + ' (' + Utils.escHtml(u.sigla || '') + ') — ' +
                  Utils.escHtml(perfilLbl) + ' • ' + Utils.escHtml(filialLbl);
      $sel.append('<option value="' + u.id + '">' + label + '</option>');
    });
  }
}
