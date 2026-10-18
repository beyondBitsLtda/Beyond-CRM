/* ============================================================
   BEYOND CRM — js/modules/VisibilidadeModule.js   v1.0
   UI para o gerente conceder/revogar visualização de um lead
   a um ou vários supervisores (sem transferir propriedade).
   Beyond Bits Tecnologia © 2026
   ============================================================ */
'use strict';

class VisibilidadeModule {

  /* ── Injetar botão "Compartilhar" no modal-lead ──── */
  static injetarBotaoNoModalLead() {
    if (!AuthService.currentProfile || AuthService.currentProfile.perfil !== 'gerente') return;

    var lead = store.currentLead;
    if (!lead || !lead._uuid) return;

    var $footer = $('#modal-lead .amp-modal-footer');
    if (!$footer.length) return;
    if ($footer.find('#mld-btn-compartilhar').length) return;

    var btn = '<button id="mld-btn-compartilhar" class="btn-beyond btn-secondary-amp" ' +
              'onclick="VisibilidadeModule.abrir(\'' + lead._uuid + '\')">' +
              '<i class="bi bi-people"></i> Compartilhar</button>';

    var $transf = $footer.find('#mld-btn-transferir');
    if ($transf.length) $transf.before(btn);
    else {
      var $avancar = $footer.find('#mld-btn-avancar');
      if ($avancar.length) $avancar.before(btn);
      else                 $footer.append(btn);
    }
  }

  /* ── Abrir modal ──────────────────────────────────── */
  static async abrir(leadUuid) {
    $('#vis-lead-uuid').val(leadUuid);

    var l = store.leads.find(function(x) { return x._uuid === leadUuid; });
    $('#vis-lead-info').text(l ? (l.id + ' — ' + l.nome) : 'Lead');

    $('#vis-lista-container').html('<div class="text-center py-3 text-muted"><i class="bi bi-arrow-repeat spin-icon"></i> Carregando supervisores...</div>');
    Modal.abrir('modal-visibilidade');

    /* Supervisores ativos */
    var resSup = await supa.from('profiles')
      .select('id, nome, sigla, filiais(nome)')
      .eq('perfil', 'supervisor')
      .eq('ativo', true)
      .order('nome');

    if (resSup.error) {
      $('#vis-lista-container').html('<div class="text-danger">Erro ao carregar supervisores.</div>');
      SLog.error('VIS abrir: ' + resSup.error.message);
      return;
    }

    var supervisores = resSup.data || [];

    /* Já concedidos */
    var concedidos = await LeadVisibilidadeService.listarConcedidos(leadUuid);
    var idsConcedidos = {};
    concedidos.forEach(function(c) { idsConcedidos[c.user_id] = true; });

    /* Renderiza checklist */
    if (supervisores.length === 0) {
      $('#vis-lista-container').html(
        '<div class="alert-info-amp">Nenhum supervisor ativo cadastrado.</div>'
      );
      return;
    }

    var html = '<div class="vis-lista">';
    supervisores.forEach(function(s) {
      var checked = idsConcedidos[s.id] ? 'checked' : '';
      var filialLbl = s.filiais ? s.filiais.nome : '—';
      html += '<label class="vis-item">' +
              '<input type="checkbox" class="vis-checkbox" data-user-id="' + s.id + '" ' + checked + '>' +
              '<div class="vis-info">' +
              '<div class="vis-nome">' + Utils.escHtml(s.nome) + ' <span class="vis-sigla">(' + Utils.escHtml(s.sigla || '') + ')</span></div>' +
              '<div class="vis-filial">' + Utils.escHtml(filialLbl) + '</div>' +
              '</div>' +
              '</label>';
    });
    html += '</div>';

    $('#vis-lista-container').html(html);
  }

  /* ── Confirmar (diff entre antes/depois) ──────────── */
  static async confirmar() {
    var leadUuid = $('#vis-lead-uuid').val();

    var selecionados = [];
    $('#vis-lista-container .vis-checkbox:checked').each(function() {
      selecionados.push($(this).data('user-id'));
    });

    var atuais = await LeadVisibilidadeService.listarConcedidos(leadUuid);
    var idsAtuais = atuais.map(function(c) { return c.user_id; });

    var aAdicionar = selecionados.filter(function(id) { return idsAtuais.indexOf(id) < 0; });
    var aRemover   = idsAtuais.filter(function(id)   { return selecionados.indexOf(id) < 0; });

    if (aAdicionar.length === 0 && aRemover.length === 0) {
      Modal.fechar('modal-visibilidade');
      return;
    }

    var $btn = $('#btn-confirmar-vis');
    var htmlOriginal = $btn.html();
    $btn.prop('disabled', true).html('<i class="bi bi-arrow-repeat spin-icon"></i> Salvando...');

    try {
      if (aAdicionar.length > 0) {
        await LeadVisibilidadeService.conceder(leadUuid, aAdicionar);
      }
      for (var i = 0; i < aRemover.length; i++) {
        await LeadVisibilidadeService.revogar(leadUuid, aRemover[i]);
      }
      Toast.show('Compartilhamentos atualizados.', 'success');
      Modal.fechar('modal-visibilidade');
    } catch (err) {
      Toast.show('Erro: ' + err.message, 'danger');
    } finally {
      $btn.prop('disabled', false).html(htmlOriginal);
    }
  }
}
