/* ============================================================
   BEYOND CRM — js/router.js   v3.2  (+ Wiki + Acesso Config por perfil)
   Beyond Bits Tecnologia © 2026

   Histórico:
   - v3.0: Auth middleware + perfil middleware.
   - v3.1: adiciona rota 'wiki' — a Central de Conhecimento.
     Aberta a todos os perfis (sem restrição). Ao entrar,
     chama WikiModule.render() pra desenhar a tela.
   - v3.2 (Chamado #55): a rota 'configuracoes' passa a aceitar
     TODOS os perfis (especialista incluso). A restrição de acesso
     deixa de ser "tudo ou nada" na rota e passa a ser feita
     SEÇÃO A SEÇÃO por ConfigModule.aplicarVisibilidadePorPerfil():
       • especialista → Minha Performance + Histórico de Alterações
                        (últimos 3 meses, só das próprias alterações)
       • supervisor   → o acima + Usuários + Tags
       • gerente      → tudo (comportamento original preservado)
     O gate de rota some, mas nenhuma seção sensível fica exposta:
     quem controla o que aparece é o helper de visibilidade.
   ============================================================ */
'use strict';

class Router {
  static _navMap = {
    dashboard:'nav-dashboard', funil:'nav-funil', agenda:'nav-agenda',
    historico:'nav-historico', relatorios:'nav-relatorios', curriculos:'nav-curriculos',
    configuracoes:'nav-configuracoes',
    wiki:'nav-wiki',  /* v3.1 */
  };

  /* Páginas que exigem perfil específico */
  static _perfilMinimo = {
    /* Chamado #55 — configuracoes agora aberta a todos os perfis.
       A visibilidade fina (quais seções aparecem) é resolvida em
       ConfigModule.aplicarVisibilidadePorPerfil(), chamado abaixo. */
    configuracoes: ['gerente', 'supervisor', 'especialista'],
    curriculos:    ['gerente', 'supervisor'],
    relatorios:    ['gerente', 'supervisor', 'especialista'],
    /* wiki: sem restrição — aberta a todos */
  };

  static ir(page) {
    /* ── Middleware de sessão ── */
    if (!AuthService.currentUser || !AuthService.currentProfile) {
      SLog.warn('ROUTER: sessão inválida — redirecionando para login');
      $('#app-header, .app-layout, #supa-panel').hide();
      $('#login-screen').css('display', 'flex');
      return;
    }

    /* ── Middleware de perfil ── */
    var perfisPermitidos = Router._perfilMinimo[page];
    if (perfisPermitidos) {
      var perfilAtual = AuthService.currentProfile.perfil;
      if (perfisPermitidos.indexOf(perfilAtual) < 0) {
        Toast.show('Você não tem permissão para acessar esta página.', 'warning');
        SLog.warn('ROUTER: acesso negado a "' + page + '" para perfil "' + perfilAtual + '"');
        return;
      }
    }

    /* ── Navegação normal ── */
    store.currentPage = page;
    $('.amp-page').removeClass('active');
    $('.nav-link').removeClass('active');
    $('#page-'+page).addClass('active');
    var navId = Router._navMap[page];
    if (navId) $('#'+navId).addClass('active');
    SidebarController.fecharMobile();
    window.scrollTo(0,0);

    /* v3.1 — Render preguiçoso da Wiki: desenha só quando entra na página.
       Evita processar 700+ linhas de conteúdo se o usuário nunca abre.
       WikiModule.inicializar() é idempotente — pode chamar quantas vezes. */
    if (page === 'wiki' && typeof WikiModule !== 'undefined') {
      WikiModule.inicializar();
      WikiModule.render();
    }

    /* Chamado #55 — Visibilidade das seções de Configurações por perfil.
       Rodar ANTES do render do Audit e das Metas, pra o especialista/
       supervisor nunca verem (nem por um flash) as seções restritas. */
    if (page === 'configuracoes' && typeof ConfigModule !== 'undefined'
        && ConfigModule.aplicarVisibilidadePorPerfil) {
      ConfigModule.aplicarVisibilidadePorPerfil();
    }

    /* v3.2 (Sprint 7 · 7.5 hotfix) — Re-render do AuditModule ao entrar
       em Configurações. Sem isso, a tabela de Histórico de Alterações
       mostrava o estado do bootstrap e não refletia operações feitas
       em outras telas (ex: novos leads importados no funil).
       Chamado #55 — o próprio AuditModule.render() agora aplica o
       recorte de 3 meses + só-do-próprio-usuário para não-gerentes. */
    if (page === 'configuracoes' && typeof AuditModule !== 'undefined') {
      AuditModule.render();
    }

    /* Chamado #44 — mostra/popula o card de Metas de Conversão
       (só pra gerente) ao entrar em Configurações. */
    if (page === 'configuracoes' && typeof TaxaConversaoModule !== 'undefined'
        && TaxaConversaoModule._prepararConfigMetas) {
      TaxaConversaoModule._prepararConfigMetas();
    }

    /* Chamado #106 — "Taxa de Conversão por Etapa" sempre abre no
       período "Ciclo de comissão (26→25)", toda vez que a página de
       Relatórios é aberta (não lembra a última escolha do usuário
       entre navegações — ele pode trocar à vontade DEPOIS de abrir,
       só o valor inicial é sempre o ciclo). Mesmo problema do #79 no
       dashboard: o <option selected> no HTML não é suficiente sozinho
       porque o navegador pode restaurar o último valor escolhido no
       <select> entre navegações/reload — força aqui, toda vez que a
       rota 'relatorios' é visitada. */
    if (page === 'relatorios' && typeof TaxaConversaoModule !== 'undefined') {
      $('#rel-tc-filtro-periodo').val('ciclo-comissao');
      $('#rel-tc-custom-wrap').hide();
      if (TaxaConversaoModule.renderRelatorio) TaxaConversaoModule.renderRelatorio();
    }
  }

  static inicializar() { Router.ir('dashboard'); }
}
