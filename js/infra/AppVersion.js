/* ============================================================
   BEYOND CRM — js/infra/AppVersion.js   v1.5.1
   Beyond Bits Tecnologia © 2026

   Módulo central de versionamento, changelog e controle de
   ferramentas de desenvolvedor.

   PADRÃO DE VERSIONAMENTO: Semantic Versioning (MAJOR.MINOR.PATCH)
     - MAJOR: mudanças que quebram compatibilidade
     - MINOR: novas funcionalidades sem quebra
     - PATCH: correções de bugs

   USO:
     - AppVersion.aplicar()       — chamar no boot após login
     - AppVersion.mostrarChangelog() — exibe modal manualmente
   ============================================================ */
'use strict';

const AppVersion = {

  /* ----------------------------------------------------------
     Configuração da versão atual
     ---------------------------------------------------------- */
  NUMERO:       '2.0.0',
  DATA_RELEASE: '18/out/2026',

  /* Emails dos desenvolvedores autorizados a ver ferramentas
     internas (painel de log do Supabase, etc).
     Use email exato — case-insensitive. */
  DEV_EMAILS: [
    /* adicione aqui o e-mail de quem pode ver o painel de diagnóstico */
  ],

  /* ----------------------------------------------------------
     CHANGELOG — Cada nova versão adicionar entrada no topo.
     Linguagem de USUÁRIO (não técnica), focada em VALOR.
     ---------------------------------------------------------- */
  CHANGELOG: [
    {
      versao: '2.0.0',
      data:   '18/out/2026',
      titulo: 'Beyond CRM — nova experiência',
      resumo: 'Visual escuro redesenhado do zero, painel de indicadores em tempo real e uso completo no celular.',
      grupos: [
        {
          icone: '🎨',
          titulo: 'Interface nova',
          itens: [
            'Tema escuro com destaques em laranja, tipografia Barlow e cards mais limpos em todas as telas.',
            'Menu lateral com indicação clara da tela atual e cartão do usuário no rodapé.',
          ],
        },
        {
          icone: '📈',
          titulo: 'Dashboard com insights',
          itens: [
            'Indicadores do período com variação em relação ao período anterior.',
            'Gráfico de evolução (7, 30 ou 90 dias) para vendas, receita, leads e ligações.',
            'Conversão entre etapas, heatmap das coortes de leads e ranking da equipe contra a meta.',
          ],
        },
        {
          icone: '📱',
          titulo: 'Pronto para o celular',
          itens: [
            'Menu em gaveta, funil com rolagem por etapa, modais em tela cheia e tabelas roláveis.',
          ],
        },
      ],
    },
  ],

  /* ----------------------------------------------------------
     isDevUser — verifica se o usuário logado é dev autorizado
     ---------------------------------------------------------- */
  isDevUser() {
    try {
      var email = (AuthService.currentUser && AuthService.currentUser.email) ||
                  (AuthService.currentProfile && AuthService.currentProfile.email) || '';
      if (!email) return false;
      var emailNorm = String(email).trim().toLowerCase();
      return AppVersion.DEV_EMAILS.some(function(e) {
        return e.trim().toLowerCase() === emailNorm;
      });
    } catch (err) {
      return false;
    }
  },

  /* ----------------------------------------------------------
     _chaveStorage — cria chave única por usuário pra não
     ter colisão se dois usuários logarem no mesmo browser
     ---------------------------------------------------------- */
  _chaveStorage() {
    var uid = '';
    try {
      uid = (AuthService.currentUser && AuthService.currentUser.id) || 'anon';
    } catch (e) { uid = 'anon'; }
    return 'beyond.changelog.visto.' + uid;
  },

  /* ----------------------------------------------------------
     _ultimaVistaPeloUsuario — retorna a última versão que o
     usuário marcou como vista (ou null)
     ---------------------------------------------------------- */
  _ultimaVistaPeloUsuario() {
    try { return localStorage.getItem(AppVersion._chaveStorage()); }
    catch (e) { return null; }
  },

  /* ----------------------------------------------------------
     _marcarComoVista — registra que o usuário viu a versão
     atual (não vai exibir o modal automaticamente de novo)
     ---------------------------------------------------------- */
  _marcarComoVista() {
    try { localStorage.setItem(AppVersion._chaveStorage(), AppVersion.NUMERO); }
    catch (e) { /* localStorage indisponível — ignora */ }
  },

  /* ----------------------------------------------------------
     aplicar — chamado no boot após login
     1) Renderiza badge da versão no sidebar
     2) Mostra/oculta painel dev (Supabase Log)
     3) Verifica se precisa exibir o modal de changelog
     ---------------------------------------------------------- */
  aplicar() {
    AppVersion._renderizarBadgeSidebar();
    AppVersion._aplicarVisibilidadeDevTools();
    /* Beyond CRM (demo): as novidades ficam no selo de versão da barra
       lateral — sem abrir o modal sozinho no primeiro acesso. */
  },

  /* ----------------------------------------------------------
     _renderizarBadgeSidebar — coloca a versão no
     rodapé da sidebar, clicável pra reabrir o changelog
     ---------------------------------------------------------- */
  _renderizarBadgeSidebar() {
    var $footer = $('.sidebar-footer');
    if (!$footer.length) return;

    /* Remove badge anterior se existir (re-render seguro) */
    $footer.find('.app-version-badge').remove();

    var html = '' +
      '<div class="app-version-badge" title="Clique para ver as novidades desta versão">' +
        '<span class="app-version-icon">✨</span>' +
        '<span class="app-version-label">v' + AppVersion.NUMERO + '</span>' +
        '<span class="app-version-date">' + AppVersion.DATA_RELEASE + '</span>' +
      '</div>';
    $footer.append(html);
    $footer.find('.app-version-badge').on('click', function() {
      AppVersion.mostrarChangelog();
    });
  },

  /* ----------------------------------------------------------
     _aplicarVisibilidadeDevTools — esconde painel dev de
     usuários não autorizados
     ---------------------------------------------------------- */
  _aplicarVisibilidadeDevTools() {
    var $panel = $('#supa-panel');
    if (!$panel.length) return;
    if (AppVersion.isDevUser()) {
      $panel.show();
    } else {
      $panel.hide();
    }
  },

  /* ----------------------------------------------------------
     _verificarChangelog — se usuário nunca viu a versão atual,
     mostra modal automaticamente (com pequeno delay pra UX)
     ---------------------------------------------------------- */
  _verificarChangelog() {
    var ultima = AppVersion._ultimaVistaPeloUsuario();
    if (ultima === AppVersion.NUMERO) return; /* já viu esta versão */
    /* Delay pequeno pra deixar a UI principal carregar antes */
    setTimeout(function() {
      AppVersion.mostrarChangelog(true);
    }, 800);
  },

  /* ----------------------------------------------------------
     mostrarChangelog — exibe modal com todas as versões do
     changelog. Se exibicaoAutomatica=true, marca como visto
     ao fechar.
     ---------------------------------------------------------- */
  mostrarChangelog(exibicaoAutomatica) {
    AppVersion._garantirDomChangelog();

    /* Renderiza o conteúdo (versões mais recentes primeiro) */
    var $body = $('#modal-changelog .changelog-body');
    $body.empty();
    AppVersion.CHANGELOG.forEach(function(ver, idx) {
      var $secao = $(
        '<div class="changelog-versao' + (idx === 0 ? ' atual' : '') + '">' +
          '<div class="changelog-versao-header">' +
            (idx === 0 ? '<span class="changelog-tag-novo">NOVO</span>' : '') +
            '<span class="changelog-versao-num">v' + ver.versao + '</span>' +
            '<span class="changelog-versao-data">' + ver.data + '</span>' +
          '</div>' +
          '<div class="changelog-versao-titulo">' + Utils.escHtml(ver.titulo) + '</div>' +
          (ver.resumo ? '<div class="changelog-versao-resumo">' + Utils.escHtml(ver.resumo) + '</div>' : '') +
        '</div>'
      );

      ver.grupos.forEach(function(grupo) {
        var $g = $(
          '<div class="changelog-grupo">' +
            '<div class="changelog-grupo-titulo">' +
              '<span class="changelog-grupo-icone">' + grupo.icone + '</span> ' +
              Utils.escHtml(grupo.titulo) +
            '</div>' +
            '<ul class="changelog-itens"></ul>' +
          '</div>'
        );
        var $ul = $g.find('.changelog-itens');
        grupo.itens.forEach(function(it) {
          $ul.append('<li>' + Utils.escHtml(it) + '</li>');
        });
        $secao.append($g);
      });

      $body.append($secao);
    });

    Modal.abrir('modal-changelog');

    /* Se exibição automática, marca como vista ao fechar */
    if (exibicaoAutomatica) {
      $('#modal-changelog').one('click', '.btn-entendi-changelog', function() {
        AppVersion._marcarComoVista();
      });
      /* Cobre também o fechamento pelo X ou pelo backdrop */
      $('#modal-changelog').one('click', '.amp-modal-close', function() {
        AppVersion._marcarComoVista();
      });
    }
  },

  /* ----------------------------------------------------------
     _garantirDomChangelog — cria o modal dinamicamente se
     ainda não estiver no DOM (não precisa mexer no index.html)
     ---------------------------------------------------------- */
  _garantirDomChangelog() {
    if ($('#modal-changelog').length) return;
    var html = '' +
      '<div id="modal-changelog" class="amp-modal" style="display:none;">' +
        '<div class="amp-modal-content changelog-modal">' +
          '<div class="amp-modal-header">' +
            '<div>' +
              '<div class="amp-modal-title">✨ Novidades do Sistema</div>' +
              '<div class="amp-modal-sub">Confira as últimas melhorias entregues</div>' +
            '</div>' +
            '<button class="amp-modal-close" onclick="Modal.fechar(\'modal-changelog\')">' +
              '<i class="bi bi-x-lg"></i>' +
            '</button>' +
          '</div>' +
          '<div class="amp-modal-body changelog-body"></div>' +
          '<div class="amp-modal-footer" style="justify-content:flex-end;">' +
            '<button class="btn-beyond btn-primary-amp btn-entendi-changelog" ' +
                    'onclick="Modal.fechar(\'modal-changelog\')">' +
              'Entendi ✓' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    $('body').append(html);
  },
};
