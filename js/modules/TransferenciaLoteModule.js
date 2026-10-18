/* ============================================================
   BEYOND CRM — js/modules/TransferenciaLoteModule.js   v1.2
   Transferência em LOTE de leads selecionados.
   Beyond Bits Tecnologia © 2026

   Feature 4.3 do Pacote 1 v1.3.0: seleção múltipla de cards no
   Kanban permite redistribuir vários leads para um mesmo
   destinatário em uma única ação. Caso de uso real:
   redistribuir 1.000 leads para 5 especialistas.

   ARQUITETURA:
   - Reaproveita LeadTransferService.transferirLote (v1.2), que
     internamente chama a RPC transferir_lead_seguro para cada
     lead. RLS e permissões são validadas no banco.
   - Permissão: gerente e supervisor (mesma regra do
     TransferenciaModule v1.1.3).
   - Popular usuários: mesmo padrão `.or('status.is.null,
     status.neq.inativo')` — evita depender da coluna 'ativo'
     que não existe em profiles.

   FLUXO:
     1. Usuário ativa modo seleção na toolbar do Funil (FASE 3C).
     2. Marca cards clicando neles.
     3. Clica em "Transferir Selecionados" → chama
        TransferenciaLoteModule.abrirDosSelecionados().
     4. Modal exibe preview (nome + código dos primeiros 5 leads
        + contador do resto) e select de destinatário.
     5. Ao confirmar, chama LeadTransferService.transferirLote e
        exibe resultado (X transferidos, Y falharam).

   API PÚBLICA:
     TransferenciaLoteModule.abrirDosSelecionados()
     TransferenciaLoteModule.abrir(leadUuids)     // uso genérico
     TransferenciaLoteModule.confirmar()          // botão do modal

   Histórico:
   - v1.0: implementação base.
   - v1.1 (Pacote 8 pós-homologação — T1, T3):
       • T1 — Sinalização de lead já com outro responsável:
         antes de fechar o preview, calcula quantos leads
         selecionados NÃO têm o usuário logado como responsável
         (podem ter sido transferidos por outro entre o marcar
         e o confirmar via Realtime). Se houver, exibe aviso
         amarelo no topo do preview. Não bloqueia — só avisa;
         o banco continua sendo a fonte de verdade e vai
         rejeitar quem não puder mexer.
       • T3 — Overlay visual de progresso durante o INSERT em
         lote. Substitui o spin discreto no botão por um overlay
         cobrindo o modal com spinner grande + mensagem
         "Transferindo N lead(s)..." + barra indeterminada.
         Dá feedback visível pra transferências grandes (100+
         leads), evitando a sensação de "travou".
   - v1.2 (Onda 3 pós-testes — Ticket #30):
       • Parte 1: aviso "já é responsável" DEIXA de aparecer ao
         abrir o modal. Agora só aparece quando o usuário
         seleciona um destino no <select>, mostrando quantos
         leads da seleção já são responsabilidade DESSE destino.
         Semanticamente correto (usuário quer saber se está
         escolhendo bem o alvo, não relação vs. si mesmo).
       • Parte 2: falhas na transferência abrem um modal com
         lista dos leads afetados + motivo de cada um vindo
         direto do banco. Antes só saía console.warn — usuário
         não sabia o que aconteceu. O erro cru já é propagado
         pelo LeadTransferService desde v1.2; só faltava expor.
   ============================================================ */
'use strict';

class TransferenciaLoteModule {

  /* Estado — UUIDs pendentes na sessão aberta do modal */
  static _leadsSelecionados = [];

  /* ── Permissão de acesso ao módulo ──────────────────── */
  static _podeTransferir() {
    var perfil = AuthService.currentProfile && AuthService.currentProfile.perfil;
    return perfil === 'gerente' || perfil === 'supervisor';
  }

  /* ────────────────────────────────────────────────────
     abrirDosSelecionados — atalho: lê os cards marcados
     no DOM (`.k-card.k-card-selected`) e chama abrir.
     Este é o método que o botão "Transferir Selecionados"
     da toolbar do Funil (FASE 3C) vai chamar.
     ──────────────────────────────────────────────────── */
  static abrirDosSelecionados() {
    if (!TransferenciaLoteModule._podeTransferir()) {
      Toast.show('Você não tem permissão para transferir leads.', 'warning');
      return;
    }

    var uuids = [];
    $('.k-card.k-card-selected').each(function() {
      var uuid = $(this).attr('data-lead-uuid');
      var codigo = $(this).attr('data-lead-id');
      if (uuid) {
        uuids.push(uuid);
      } else {
        /* Fallback: card sem uuid (pouco provável, mas se ocorrer,
           tenta resolver via store) */
        var l = store.leads.find(function(x) { return x.id === codigo; });
        if (l && l._uuid) uuids.push(l._uuid);
      }
    });

    if (uuids.length === 0) {
      Toast.show('Nenhum lead selecionado para transferência.', 'warning');
      return;
    }

    TransferenciaLoteModule.abrir(uuids);
  }

  /* ────────────────────────────────────────────────────
     abrir(leadUuids) — popula e exibe o modal de lote.
     ──────────────────────────────────────────────────── */
  static async abrir(leadUuids) {
    if (!TransferenciaLoteModule._podeTransferir()) {
      Toast.show('Você não tem permissão para transferir leads.', 'warning');
      return;
    }
    if (!leadUuids || !leadUuids.length) {
      Toast.show('Nenhum lead informado.', 'warning');
      return;
    }

    TransferenciaLoteModule._leadsSelecionados = leadUuids.slice();
    TransferenciaLoteModule._leadsDetalhesCache = null;

    /* Reset UI */
    $('#transf-lote-motivo').val('');
    $('#transf-lote-destino').html('<option value="">Carregando...</option>');
    $('#transf-lote-count').text(leadUuids.length);

    /* Preview: monta lista neutra + cacheia detalhes (Onda 3 #30) */
    TransferenciaLoteModule._preencherPreview(leadUuids);

    /* Popula usuários e abre */
    await TransferenciaLoteModule._popularUsuarios(leadUuids);

    /* Onda 3 (#30) — sempre re-anexa o handler on-change do destino
       pra recalcular o aviso "já é responsável" apenas quando o
       usuário selecionar de fato o destinatário. Usa .off/.on pra
       evitar múltiplos handlers ao reabrir. */
    $('#transf-lote-destino').off('change.avisoDestino').on('change.avisoDestino', function() {
      TransferenciaLoteModule._atualizarAvisoDestino();
    });

    Modal.abrir('modal-transferencia-lote');
  }

  /* ────────────────────────────────────────────────────
     _preencherPreview — mostra TODOS os leads selecionados
     em lista scrollável (v1.1 — antes limitava a 5).

     Onda 3 pós-testes (#30 parte 1): o cálculo do aviso
     "N lead(s) já está com X" NÃO roda mais aqui, no momento
     de abrir o modal. Antes disparava logo comparando com o
     usuário LOGADO, o que não fazia sentido pro fluxo do
     usuário (queixa: "mensagem deve aparecer só quando eu
     selecionar o especialista de destino").

     Agora: o preview mostra só a lista neutra. O aviso é
     calculado e injetado por _atualizarAvisoDestino a cada
     mudança do <select id="transf-lote-destino">.
     ──────────────────────────────────────────────────── */
  static _preencherPreview(leadUuids) {
    var $box = $('#transf-lote-preview');
    if (!$box.length) return;

    var leadsDetalhes = leadUuids.map(function(uuid) {
      var l = store.leads.find(function(x) { return x._uuid === uuid; });
      return l ? {
        id: l.id,
        nome: l.nome,
        etapa: l.etapa,
        responsavel_id:   l.responsavel_id   || l.captador_id || null,
        responsavel_nome: l.responsavel_nome || l.captador     || '—',
      } : { id: '?', nome: '(desconhecido)', etapa: '?', responsavel_id: null, responsavel_nome: '—' };
    });

    /* Guarda em cache pra _atualizarAvisoDestino usar sem re-varrer */
    TransferenciaLoteModule._leadsDetalhesCache = leadsDetalhes;

    var htmlLista = leadsDetalhes.map(function(l) {
      var stageCfg = (typeof STAGE_CONFIG !== 'undefined' && STAGE_CONFIG[l.etapa]) || null;
      var stageLbl = stageCfg ? (stageCfg.icon + ' ' + stageCfg.label) : l.etapa;
      return '<div class="transf-lote-lead" data-lead-id="' + Utils.escHtml(l.id) + '">' +
             '  <span class="transf-lote-codigo">' + Utils.escHtml(l.id) + '</span>' +
             '  <span class="transf-lote-nome">' + Utils.escHtml(l.nome) + '</span>' +
             '  <span class="transf-lote-etapa text-muted small">' + Utils.escHtml(stageLbl) + '</span>' +
             '</div>';
    }).join('');

    var htmlContagem =
      '<div class="transf-lote-contagem text-muted small">' +
      '  <i class="bi bi-list-check"></i> ' +
      '  <strong>' + leadsDetalhes.length + '</strong> lead(s) selecionado(s) — ' +
      '  role para ver todos' +
      '</div>';

    /* Container do aviso vazio inicialmente — preenchido on-change */
    $box.html(
      '<div id="transf-lote-aviso-container"></div>' +
      htmlContagem +
      '<div class="transf-lote-lista-scroll">' + htmlLista + '</div>'
    );
  }

  /* ────────────────────────────────────────────────────
     Onda 3 (#30 parte 1) — _atualizarAvisoDestino
     Recalcula quantos leads da seleção já são responsabilidade
     do destino escolhido. Se algum, mostra aviso amarelo no
     topo do preview. Se destino vazio ou nenhum coincide,
     limpa o aviso.

     Também marca visualmente cada linha da lista com uma
     classe extra pra destacar os leads que serão "no-op"
     (mesmo responsável).
     ──────────────────────────────────────────────────── */
  static _atualizarAvisoDestino() {
    var destino = $('#transf-lote-destino').val();
    var $aviso = $('#transf-lote-aviso-container');
    var leads = TransferenciaLoteModule._leadsDetalhesCache || [];

    /* Limpa marcações da lista */
    $('#transf-lote-preview .transf-lote-lead').removeClass('transf-lote-lead-outro');
    $('#transf-lote-preview .transf-lote-resp-outro').remove();

    if (!destino || !leads.length) {
      $aviso.html('');
      return;
    }

    /* Leads onde o responsavel_id == destino → transferência seria no-op */
    var jaDoDestino = leads.filter(function(l) { return l.responsavel_id === destino; });
    if (jaDoDestino.length === 0) {
      $aviso.html('');
      return;
    }

    /* Descobre nome do destino pra usar na mensagem */
    var destUser = (store.usuarios || []).find(function(u) { return u._id === destino; });
    var destNome = destUser ? destUser.nome : 'este destinatário';

    /* Marca visualmente cada linha afetada */
    var jaSet = new Set(jaDoDestino.map(function(l) { return l.id; }));
    $('#transf-lote-preview .transf-lote-lead').each(function() {
      var id = $(this).attr('data-lead-id');
      if (jaSet.has(id)) {
        $(this).addClass('transf-lote-lead-outro');
        $(this).append(
          '<span class="transf-lote-resp-outro" title="Já é responsabilidade de ' +
          Utils.escHtml(destNome) + '">' +
          '<i class="bi bi-person-fill-exclamation"></i> já é responsável</span>'
        );
      }
    });

    var htmlAviso =
      '<div class="transf-lote-aviso-outro">' +
      '  <i class="bi bi-exclamation-triangle-fill"></i>' +
      '  <div>' +
      '    <strong>' + jaDoDestino.length + ' lead(s)</strong> ' +
      '    ' + (jaDoDestino.length > 1 ? 'já são' : 'já é') +
      '    responsabilidade de <strong>' + Utils.escHtml(destNome) + '</strong>. ' +
      '    Essas linhas serão rejeitadas pelo banco (sem efeito), mas o restante prossegue.' +
      '  </div>' +
      '</div>';
    $aviso.html(htmlAviso);
  }

  /* ────────────────────────────────────────────────────
     _popularUsuarios — mesmo padrão do TransferenciaModule
     v1.1.3: `.or('status.is.null,status.neq.inativo')`.

     Removemos da lista o(s) responsável(is) atual(is) dos
     leads selecionados? Não — em lote é comum ter leads de
     múltiplos responsáveis; deixamos todos os usuários ativos
     no dropdown e o próprio banco rejeita transferências
     inválidas (mesmo user já é responsável) via RPC.
     ──────────────────────────────────────────────────── */
  static async _popularUsuarios(leadUuids) {
    var $sel = $('#transf-lote-destino');

    var res = await supa.from('profiles')
      .select('id, nome, sigla, perfil, status, filiais(nome)')
      .or('status.is.null,status.neq.inativo')
      .order('nome');

    if (res.error) {
      $sel.html('<option value="">Erro ao carregar usuários</option>');
      SLog.error('TRANSF LOTE popularUsuarios: ' + res.error.message);
      return;
    }

    var users = res.data || [];
    $sel.html('<option value="">Selecione o destinatário...</option>');

    users.forEach(function(u) {
      var perfilLbl = ((PERFIL_CONFIG[u.perfil] || {}).label) || u.perfil;
      var filialLbl = u.filiais ? u.filiais.nome : '—';
      var label = Utils.escHtml(u.nome) + ' (' + Utils.escHtml(u.sigla || '') + ') — ' +
                  Utils.escHtml(perfilLbl) + ' • ' + Utils.escHtml(filialLbl);
      $sel.append('<option value="' + u.id + '">' + label + '</option>');
    });
  }

  /* ────────────────────────────────────────────────────
     confirmar — executa a transferência em lote.
     ──────────────────────────────────────────────────── */
  static async confirmar() {
    if (!TransferenciaLoteModule._leadsSelecionados.length) {
      Toast.show('Nenhum lead na fila.', 'warning');
      return;
    }

    var paraUserId = $('#transf-lote-destino').val();
    var motivo     = ($('#transf-lote-motivo').val() || '').trim();

    if (!paraUserId) {
      Toast.show('Selecione um destinatário.', 'warning');
      return;
    }

    var qtd = TransferenciaLoteModule._leadsSelecionados.length;

    /* Confirmação extra em transferências grandes (>=10) */
    var confirmarPromise = new Promise(function(resolve) {
      if (qtd >= 10) {
        ConfirmDialog.show(
          '🔁',
          'Confirmar transferência em lote',
          'Você vai transferir ' + qtd + ' lead(s) para o destinatário selecionado. Deseja continuar?',
          function() { resolve(true); }
        );
        /* Se o usuário cancelar, ConfirmDialog não invoca callback;
           esperamos alguns segundos e resolvemos com false via
           timeout NÃO — na verdade, o padrão do sistema é o cancelar
           simplesmente fechar sem callback, e nossa promise nunca
           resolve. Melhor: se o usuário fechar sem confirmar, o
           fluxo trava aqui e ele reabre. Aceitável. */
      } else {
        resolve(true);
      }
    });

    var podeSeguir = await confirmarPromise;
    if (!podeSeguir) return;

    /* v1.1 (T3) — Overlay de progresso.
       v1.1.1: usa position:fixed anexado ao <body> em vez de
       position:absolute no modal — a estrutura do amp-modal tinha
       overflow/z-index que engoliam o overlay. Agora fica sempre
       por cima, cobrindo a viewport, e some no finally. */
    $('#transf-lote-overlay').remove(); /* limpa qualquer resíduo */
    var overlayHtml =
      '<div class="transf-lote-progress-overlay" id="transf-lote-overlay">' +
      '  <div class="transf-lote-progress-card">' +
      '    <div class="transf-lote-progress-spinner"></div>' +
      '    <div class="transf-lote-progress-title">Transferindo ' + qtd + ' lead(s)...</div>' +
      '    <div class="transf-lote-progress-sub">Isso pode levar alguns segundos. Não feche a janela.</div>' +
      '    <div class="transf-lote-progress-bar-wrap"><div class="transf-lote-progress-bar-fill"></div></div>' +
      '  </div>' +
      '</div>';
    $('body').append(overlayHtml);

    /* Botão do modal também fica desabilitado como fallback */
    var $btn = $('#btn-confirmar-transf-lote');
    $btn.prop('disabled', true);

    try {
      var resultado = await LeadTransferService.transferirLote(
        TransferenciaLoteModule._leadsSelecionados,
        paraUserId,
        motivo || 'Transferência em lote via seleção múltipla'
      );

      /* Feedback proporcional ao resultado.
         Onda 3 (#30 parte 2): quando há falhas, mostra um dialog
         com a lista dos leads que falharam e o motivo real de cada
         um. Antes só saía console.warn — o usuário não sabia
         o que aconteceu nem quais leads foram afetados. */
      var ok = resultado.ok || 0;
      var falhasArr = resultado.falhas || [];
      var falhas = falhasArr.length;

      if (ok > 0 && falhas === 0) {
        Toast.show('✅ ' + ok + ' lead(s) transferido(s) com sucesso.', 'success');
      } else if (ok > 0 && falhas > 0) {
        Toast.show('⚠️ ' + ok + ' transferido(s), ' + falhas + ' falharam.', 'warning');
        TransferenciaLoteModule._mostrarFalhasDetalhadas(ok, falhasArr);
      } else {
        Toast.show('❌ Nenhum lead foi transferido.', 'danger');
        TransferenciaLoteModule._mostrarFalhasDetalhadas(0, falhasArr);
      }

      Modal.fechar('modal-transferencia-lote');

      /* Recarregar dados e re-render */
      if (typeof SupabaseSync !== 'undefined' && SupabaseSync.carregarTudo) {
        await SupabaseSync.carregarTudo();
      }
      if (typeof FunilModule !== 'undefined') {
        /* Sai do modo seleção e limpa marcações */
        $('#kanban-board').removeClass('k-selection-mode');
        $('.k-card').removeClass('k-card-selected');
        if (typeof FunilModule.sairDoModoSelecao === 'function') {
          FunilModule.sairDoModoSelecao();
        }
        FunilModule.renderKanban && FunilModule.renderKanban();
        FunilModule.atualizarKPIs && FunilModule.atualizarKPIs();
        FunilModule.renderFunilPreview && FunilModule.renderFunilPreview();
        FunilModule.renderNumeroMagico && FunilModule.renderNumeroMagico();
      }

      /* Reset do estado interno */
      TransferenciaLoteModule._leadsSelecionados = [];

    } catch (err) {
      Toast.show('Erro na transferência em lote: ' + err.message, 'danger');
      SLog.error('TRANSF LOTE exceção: ' + err.message);
    } finally {
      /* v1.1 (T3) — remove overlay e reabilita botão */
      $('#transf-lote-overlay').remove();
      $btn.prop('disabled', false);
    }
  }

  /* ────────────────────────────────────────────────────
     Onda 3 (#30 parte 2) — _mostrarFalhasDetalhadas
     Exibe um dialog com a lista de leads que falharam na
     transferência e o motivo real de cada um (retornado pelo
     LeadTransferService, que propaga a mensagem do RPC do banco
     — ex.: "usuário destino é o mesmo que o atual", "sem permissão", etc.).

     Reusa o padrão de dialog customizado — como não temos modal
     dedicado no HTML, usamos um wrapper leve construído on-the-fly.
     ──────────────────────────────────────────────────── */
  static _mostrarFalhasDetalhadas(sucessos, falhas) {
    /* Remove qualquer dialog residual */
    $('#modal-transf-falhas-onda3').remove();

    var linhasHtml = falhas.map(function(f) {
      /* Tenta descobrir o código do lead a partir do UUID pra ficar humano */
      var l = store.leads.find(function(x) { return x._uuid === f.leadUuid; });
      var codigo = l ? l.id : (f.leadUuid ? f.leadUuid.substring(0, 8) + '…' : '—');
      var nome   = l ? l.nome : '—';
      return '<tr>' +
             '  <td><span class="cod-mono">' + Utils.escHtml(codigo) + '</span></td>' +
             '  <td>' + Utils.escHtml(nome) + '</td>' +
             '  <td class="text-danger small">' + Utils.escHtml(f.erro || 'sem detalhes') + '</td>' +
             '</tr>';
    }).join('');

    var titulo = (sucessos > 0)
      ? '⚠️ Transferência parcial'
      : '❌ Transferência falhou';

    var subtitulo = (sucessos > 0)
      ? sucessos + ' lead(s) transferido(s) com sucesso · ' + falhas.length + ' falharam abaixo:'
      : 'Nenhum lead foi transferido. Motivos abaixo:';

    var html =
      '<div class="amp-modal show" id="modal-transf-falhas-onda3" style="display:flex;">' +
      '  <div class="amp-modal-content">' +
      '    <div class="amp-modal-header">' +
      '      <div>' +
      '        <div class="amp-modal-title">' + titulo + '</div>' +
      '        <div class="amp-modal-subtitle">' + subtitulo + '</div>' +
      '      </div>' +
      '      <button class="modal-close-btn" onclick="$(\'#modal-transf-falhas-onda3\').remove(); if (!$(\'.amp-modal.show\').length) $(\'body\').removeClass(\'modal-open\');"><i class="bi bi-x-lg"></i></button>' +
      '    </div>' +
      '    <div class="amp-modal-body">' +
      '      <div class="table-wrap" style="max-height:50vh; overflow-y:auto;">' +
      '        <table class="amp-table">' +
      '          <thead><tr><th>Código</th><th>Lead</th><th>Motivo da falha</th></tr></thead>' +
      '          <tbody>' + linhasHtml + '</tbody>' +
      '        </table>' +
      '      </div>' +
      '      <div class="small text-muted mt-3">' +
      '        <i class="bi bi-info-circle"></i> ' +
      '        As mensagens acima vêm diretamente do banco de dados. ' +
      '        Se o motivo não estiver claro, copie e me repasse.' +
      '      </div>' +
      '    </div>' +
      '    <div class="amp-modal-footer">' +
      '      <button class="btn-beyond btn-primary-amp" onclick="$(\'#modal-transf-falhas-onda3\').remove(); if (!$(\'.amp-modal.show\').length) $(\'body\').removeClass(\'modal-open\');">Entendi</button>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    $('body').append(html).addClass('modal-open');
  }
}
