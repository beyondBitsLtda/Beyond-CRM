/* ============================================================
   BEYOND CRM — js/controllers/Controllers.js   v2.0
   Beyond Bits Tecnologia © 2026
   ============================================================ */
'use strict';

class SidebarController {
  static alternar() {
    if ($(window).width() <= 768) {
      store.mobileSidebarOpen = !store.mobileSidebarOpen;
      $('#sidebar').toggleClass('sidebar-mobile-open', store.mobileSidebarOpen);
      $('#sidebar-backdrop').toggleClass('show', store.mobileSidebarOpen);
    } else {
      store.sidebarCollapsed = !store.sidebarCollapsed;
      $('#sidebar').toggleClass('sidebar-collapsed', store.sidebarCollapsed);
      $('#app-main').toggleClass('main-expanded', store.sidebarCollapsed);
    }
  }
  static fecharMobile() {
    store.mobileSidebarOpen = false;
    $('#sidebar').removeClass('sidebar-mobile-open');
    $('#sidebar-backdrop').removeClass('show');
  }
}

class FonteSelect {
  static atualizar(el) {
    const val = $(el).val();
    const f = FONTES_LEAD.find(x => x.value === val);
    const $tip = $(el).closest('.mb-3').find('.fonte-desc');
    if ($tip.length && f) $tip.text(f.desc).fadeIn(200);
    else if ($tip.length) $tip.fadeOut(200);
  }
}

class DateTimeHelper {
  static inicializar() {
    const agora = Utils.getNowLocal();
    const hoje  = Utils.getTodayDate();
    $('input[type="datetime-local"]').each(function() { if (!$(this).val()) $(this).val(agora); });
    $('input[type="date"]').each(function() { if (!$(this).val()) $(this).val(hoje); });
  }
  static setNow(id) { $('#'+id).val(Utils.getNowLocal()); }
}

class SearchController {
  static init() {
    let timer;
    $('#header-search').on('input', function() {
      clearTimeout(timer);
      const q = $(this).val().trim();
      if (!q) { $('#search-results').hide(); return; }
      timer = setTimeout(() => SearchController.render(q), 200);
    });
    $(document).on('click', function(e) {
      if (!$(e.target).closest('.search-wrap').length) $('#search-results').hide();
    });
  }
  static render(q) {
    const results = store.pesquisar(q);
    const $box = $('#search-results');
    if (!results.length) { $box.hide(); return; }
    $box.html(results.map(l => `
      <div class="search-item" onclick="FunilModule.abrirDetalhe('${l.id}'); $('#search-results').hide(); $('#header-search').val('');">
        <div class="search-nome">${Utils.escHtml(l.nome)}</div>
        <div class="search-det">${l.id} · ${Utils.escHtml(l.etapa)} · ${Utils.escHtml(l.tel)}</div>
      </div>`).join('')).show();
  }
}

class NotifController {
  static atualizar() {
    const unread = store.notifications.filter(n => !n.read).length;
    const $badge = $('#notif-badge');
    if (unread > 0) { $badge.text(unread).show(); } else { $badge.hide(); }
  }
  static toggleDropdown() {
    const $d = $('#notif-dropdown');
    if ($d.hasClass('show')) { $d.removeClass('show'); return; }
    const list = store.notifications.slice(0,5);
    $d.html(list.length ? list.map(n => `
      <div class="notif-item${n.read?'':' unread'}${n._leadCodigo ? ' notif-clicavel' : ''}"${n._leadCodigo ? ` onclick="NotifController.abrirLead('${n._leadCodigo}')" style="cursor:pointer;"` : ''}>
        <div class="notif-msg">${Utils.escHtml(n.msg)}</div>
        <div class="notif-time">${n.time}</div>
      </div>`).join('') : '<div class="notif-empty">Nenhuma notificação</div>').addClass('show');
    store.marcarNotificacoesLidas();
    NotifController.atualizar();
    setTimeout(() => $(document).one('click', () => $d.removeClass('show')), 10);
  }

  /* Chamado #26 — clicar numa notificação vinculada a um lead abre o
     card dele. Notificações sem lead_codigo seguem só texto (como antes). */
  static abrirLead(codigo) {
    $('#notif-dropdown').removeClass('show');
    if (!codigo) return;
    var lead = (typeof store !== 'undefined' && store.buscarLead) ? store.buscarLead(codigo) : null;
    if (!lead) {
      if (typeof Toast !== 'undefined') {
        Toast.show('Lead não encontrado — pode ter sido removido ou não estar visível pra você.', 'warning');
      }
      return;
    }
    if (typeof FunilModule !== 'undefined' && FunilModule.abrirDetalhe) {
      FunilModule.abrirDetalhe(codigo);
    }
  }
}

class ChecklistItem {
  /* Tarefa 4B + 7 — alternar item do checklist.
     Itens da aba Agendamento têm data-item-id (UUID em agendamento_checklist).
     Itens da aba Venda  têm data-item-id + data-checklist-tipo="venda".
     Cada um persiste no service apropriado.
     Itens sem data-item-id mantêm apenas o toggle visual como antes. */
  static alternar(el) {
    var $el = $(el);

    /* Chamado #53 — itens de PRÉVIA (aba Venda antes de registrar) são
       somente-leitura: não alternam nem persistem. */
    if ($el.data('checklist-preview')) return;

    var itemId = $el.data('item-id');
    var tipo   = $el.data('checklist-tipo'); /* "venda" ou undefined (=agendamento) */

    /* Toggle visual imediato (UI responsiva) */
    var novoEstado = !$el.hasClass('done');
    $el.toggleClass('done', novoEstado);
    $el.find('.check-icon').html(novoEstado ? '<i class="bi bi-check-lg"></i>' : '');

    /* Sem item-id → checklist puramente visual */
    if (!itemId) return;

    /* Escolhe o service correto pelo tipo */
    var service = null;
    if (tipo === 'venda' && typeof VendaService !== 'undefined') {
      service = VendaService;
    } else if (typeof AgendaService !== 'undefined') {
      service = AgendaService;
    }

    if (!service) {
      SLog.warn('ChecklistItem.alternar: service indisponível, mudança não persistida.');
      return;
    }

    service.marcarItemChecklist(itemId, novoEstado)
      .then(function(res) {
        if (!res) {
          $el.toggleClass('done', !novoEstado);
          $el.find('.check-icon').html(!novoEstado ? '<i class="bi bi-check-lg"></i>' : '');
          Toast.show('Não foi possível salvar a alteração do checklist.', 'danger');
        }
      })
      .catch(function(err) {
        SLog.error('ChecklistItem.alternar: ' + err.message);
        $el.toggleClass('done', !novoEstado);
        $el.find('.check-icon').html(!novoEstado ? '<i class="bi bi-check-lg"></i>' : '');
        Toast.show('Erro ao salvar checklist: ' + err.message, 'danger');
      });
  }
}
