/* ============================================================
   BEYOND CRM — js/app.js   v4.1  (Realtime enabled)
   Ponto de entrada. Login → Sync → Render → Realtime.
   Beyond Bits Tecnologia © 2026

   Histórico:
   - v4.0: Auth + Supabase base.
   - v4.1 (REALTIME-FIX-1 / Pacote 2):
       O RealtimeService.js foi entregue no Pacote 2 v1.4.0 e o
       script sempre esteve incluso no index.html, mas iniciar()
       nunca era chamado — o serviço existia sem ser ativado.
       Agora RealtimeService.iniciar() é acionado após o bootstrap
       completo (SupabaseSync.carregarTudo + renders iniciais),
       resolvendo T14, T15, T16 e T18. Também aciona parar() no
       logout global via handleLogout, fechando canais educadamente
       antes do reload.
   ============================================================ */
'use strict';

$(document).ready(async function() {

  /* ── 1. Inicializar Store (vazio) ── */
  store.inicializar();
  Modal.inicializarBackdrops();
  _atualizarIconeTema();   /* Chamado #59 — reflete o tema salvo no ícone */

  /* ── Chamado #62 (Parte B) — link de recuperação inválido/expirado ──
     Se o Supabase devolveu erro no link (otp_expired / access_denied —
     link já usado, expirado, ou consumido por scanner de e-mail),
     mostramos a tela de login com uma orientação clara em vez de um
     estado confuso. Limpamos a URL para o erro não reaparecer no F5. */
  if (window.__ampAuthLinkError) {
    $('#login-screen').css('display', 'flex');
    $('#app-header, .app-layout, #supa-panel').hide();
    SLog.renderAll();
    try { window.history.replaceState({}, document.title, window.location.pathname); }
    catch (e) { /* silent */ }
    try {
      $('#login-error')
        .css({ background: '#FEF3C7', color: '#92400E', borderColor: '#FDE68A' })
        .text('O link de recuperação expirou ou já tinha sido usado. Solicite um novo em "Esqueceu sua senha?".')
        .show();
    } catch (e) { /* silent */ }
    return;
  }

  /* ── Chamado #62 (Parte B) — fluxo de recuperação de senha ──
     Se o usuário chegou pelo link de "Esqueceu sua senha?" (flag
     capturada em SupabaseClient.js antes do hash ser limpo), exibimos
     a tela de definição de nova senha e NÃO entramos no app — mesmo
     que exista uma sessão de recovery ativa. */
  if (window.__ampRecoveryMode) {
    $('#login-screen').css('display', 'flex');
    $('#app-header, .app-layout, #supa-panel').hide();
    SLog.renderAll();
    RecoveryFlow.abrir();
    return;
  }
  /* Reforço: alguns fluxos emitem o evento em vez de deixar o hash.
     Se PASSWORD_RECOVERY chegar depois, ainda abrimos a tela. */
  if (supa) {
    supa.auth.onAuthStateChange(function(event) {
      if (event === 'PASSWORD_RECOVERY' && !window.__ampRecoveryHandled) {
        window.__ampRecoveryMode = true;
        $('#login-screen').css('display', 'flex');
        $('#app-header, .app-layout, #supa-panel').hide();
        RecoveryFlow.abrir();
      }
    });
  }

  /* ── 2. Verificar autenticação ── */
  var autenticado = await AuthService.restaurarSessao();

  if (!autenticado) {
    /* Mostrar tela de login, esconder app */
    $('#login-screen').css('display', 'flex');
    $('#app-header, .app-layout, #supa-panel').hide();
    SLog.renderAll();
    return; /* Para aqui — o resto roda após login */
  }

  /* ── 3. Autenticado → Iniciar app ── */
  await iniciarApp();
});

/* ── Função que inicia o app após login ── */
async function iniciarApp() {

  $('#login-screen').hide();
  /* Patch v1.1.0 — #supa-panel agora é controlado pelo AppVersion
     (mostrado só para devs autorizados). Não mais incluso aqui. */
  $('#app-header, .app-layout').show();

  /* Atualizar header com dados reais do usuário */
  AuthService.atualizarHeader();
  if (AuthService.currentProfile) {
    $('#perf-usuario-nome').text(AuthService.currentProfile.nome);
    /* Carregar avatar no header */
    AvatarService.carregarNoHeader(AuthService.currentUser.id);
    /* Carregar avatar no preview da seção Performance */
    AvatarService.carregarNoPerformance(AuthService.currentUser.id);
  }

  /* Handler para preview de foto no modal de usuário */
  $(document).on('change', '#usr-foto', function() {
    var file = this.files && this.files[0];
    var $err = $('#usr-foto-error');
    $err.hide();
    if (!file) {
      AvatarService.previewNoInput(null, 'usr-foto-preview');
      return;
    }
    /* Validação rápida client-side */
    if (!file.name.toLowerCase().endsWith('.png')) {
      $err.text('Apenas arquivos .PNG são aceitos.').show();
      AvatarService.previewNoInput(null, 'usr-foto-preview');
      $(this).val('');
      return;
    }
    if (file.type !== 'image/png') {
      $err.text('O arquivo não é um PNG válido.').show();
      AvatarService.previewNoInput(null, 'usr-foto-preview');
      $(this).val('');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      $err.text('Arquivo muito grande (' + (file.size/1024/1024).toFixed(1) + 'MB). Máximo: 2MB.').show();
      AvatarService.previewNoInput(null, 'usr-foto-preview');
      $(this).val('');
      return;
    }
    AvatarService.previewNoInput(file, 'usr-foto-preview');
  });

  /* ── Listener de sessão: detecta expiração/logout ── */
  if (supa) {
    supa.auth.onAuthStateChange(function(event, session) {
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' && !session) {
        SLog.warn('AUTH sessão encerrada — redirecionando para login');
        /* v4.1 (REALTIME-FIX-1) — para os canais antes de esconder a UI */
        if (typeof RealtimeService !== 'undefined') {
          try { RealtimeService.parar(); } catch (e) { /* silent */ }
        }
        AuthService.currentUser = null;
        AuthService.currentProfile = null;
        $('#app-header, .app-layout, #supa-panel').hide();
        $('#login-screen').css('display', 'flex');
        Toast.show('Sua sessão expirou. Faça login novamente.', 'warning');
      }
    });
  }

  DateTimeHelper.inicializar();
  SearchController.init();

  /* Carregar dados do Supabase */
  AmpLoading.show('Carregando dados...');
  var syncOk = await SupabaseSync.carregarTudo();
   if (typeof FunilModule !== 'undefined' && FunilModule.inicializarToolbar) {
  FunilModule.inicializarToolbar();
}
   /* v2.1 (Sprint 6 / Patch 1) — inicializar filtros avançados da
      Agenda e do Histórico. Depende de SupabaseSync.carregarTudo() já
      resolvido (pra ter store.filiais e store.usuarios populados) e do
      AuthService.currentProfile setado (pra decidir se mostra Filial). */
   if (typeof AgendaModule    !== 'undefined' && AgendaModule.inicializarFiltros) {
     AgendaModule.inicializarFiltros();
   }
   if (typeof HistoricoModule !== 'undefined' && HistoricoModule.inicializarFiltros) {
     HistoricoModule.inicializarFiltros();
   }
   /* Sprint 7 · 7.5 — inicializar filtros avançados da tela de auditoria.
      Mesmo padrão de HistoricoModule/AgendaModule. */
   if (typeof AuditModule !== 'undefined' && AuditModule.inicializarFiltros) {
     AuditModule.inicializarFiltros();
   }
   // Após carregarTudo e renderizações iniciais
   if (typeof NotificacaoAgendamentoService !== 'undefined') {
     NotificacaoAgendamentoService.iniciar();
}
  if (!syncOk) SLog.warn('App iniciando SEM dados do Supabase.');
  AmpLoading.hide();

  /* Chamado #28 — antes de pintar, corrige leads em Agendamento cujo
     prazo já venceu (move pra Visita). silent=true: a renderização
     principal logo abaixo já mostra o estado corrigido. */
  if (FunilModule.autoAvancarVisitasVencidas) {
    try { FunilModule.autoAvancarVisitasVencidas(true); }
    catch (e) { SLog.error('AUTO-VISITA boot: ' + e.message); }
  }

  /* Chamado #28 — polling a cada 60s (mesmo padrão do serviço de
     notificação). Guard global evita timer duplicado se o boot rodar
     mais de uma vez. */
  if (typeof window !== 'undefined' && !window.__ampAutoVisitaTimer && FunilModule.autoAvancarVisitasVencidas) {
    window.__ampAutoVisitaTimer = setInterval(function() {
      try { FunilModule.autoAvancarVisitasVencidas(false); }
      catch (e) { SLog.error('AUTO-VISITA tick: ' + e.message); }
    }, 60000);
  }

  /* Ticket #6 (Chamado #79) — o <select id="nm-periodo"> tem
     value="ciclo" marcado como "selected" no HTML, mas navegadores
     restauram o último valor escolhido pelo usuário num reload
     (form/bfcache restore), ignorando o atributo "selected". Isso
     fazia o Dashboard abrir com o filtro do último uso (ex.: "Esta
     semana") em vez do padrão pedido pelo cliente. Força aqui, no
     boot, ANTES da primeira renderização — garante "Ciclo de
     comissão" sempre que o sistema é aberto, independente do que o
     navegador tenha restaurado no <select>. */
  $('#nm-periodo').val('ciclo');

  /* Renderizar interface */
  SLog.load('Renderizando interface...');
  FunilModule.renderKanban();
  FunilModule.renderFunilPreview();
  FunilModule.renderNumeroMagico();
  FunilModule.atualizarKPIs();
  if (typeof MetasModule !== 'undefined') MetasModule.renderAtingimento(); /* PATCH MET-4.6 */
  AgendaModule.renderDashboard();
  AgendaModule.renderFull();
  AtividadeModule.renderFeed();
  HistoricoModule.render();
  RelatoriosModule.render();
  if (typeof TaxaConversaoModule !== 'undefined') {
    TaxaConversaoModule.renderDashboardCard();
    TaxaConversaoModule.renderRelatorio();
  }
  if (typeof AniversariantesModule !== 'undefined') {
    await AniversariantesModule.carregarParabenizacoes();
    AniversariantesModule.renderRelatorio();
  }
  if (typeof PerformanceEspecialistasModule !== 'undefined') {
    PerformanceEspecialistasModule.renderRelatorio();
  }
  /* Chamado #100 (reaberto) — Relatório Analítico (gerente-only). */
  if (typeof RelatorioAnaliticoModule !== 'undefined') {
    RelatorioAnaliticoModule.renderRelatorio();
  }
  if (typeof LigacoesCarteiraModule !== 'undefined') {   /* Chamado #46 */
    LigacoesCarteiraModule.renderRelatorio();
  }
  CurriculoModule.render();
  UsuarioModule.render();
  UsuarioModule.renderMinhaPerformance();
  AuditModule.render();
  ConfigModule.renderFiliais();
  ConfigModule.renderTags();

  /* Atualizar badge de notificações com os dados do banco (RN-04 do DRS v1.2) */
  NotifController.atualizar();

  /* Popular select de filiais */
  var $filtroFilial = $('#funil-filtro-filial');
  if ($filtroFilial.length) {
    $filtroFilial.html('<option value="">Todas as Unidades</option>');
    store.filiais.forEach(function(f) {
      $filtroFilial.append('<option value="' + f.id + '">' + f.nome + ' — ' + f.local + '</option>');
    });
  }

  /* 3B.7: Preenche a data corrente no subtítulo do Dashboard */
  var $subData = $('#dash-resumo-data');
  if ($subData.length) {
    var opts = { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' };
    var dataFormatada = new Date().toLocaleDateString('pt-BR', opts);
    /* Capitaliza dia da semana (toLocaleDateString retorna minúscula) */
    dataFormatada = dataFormatada.charAt(0).toUpperCase() + dataFormatada.slice(1);
    $subData.text('Resumo do dia — ' + dataFormatada);
  }

  /* ── v4.1 (REALTIME-FIX-1 / Pacote 2) — Ativa Realtime ──
     A partir daqui todos os dados já estão carregados e a
     interface renderizada. Habilitar Realtime nesse ponto
     evita conflito com o carregamento inicial (ex.: reload
     duplicado quando o boot ainda está em andamento).
     Guard: só ativa se o serviço estiver disponível.
     v1.1 (REALTIME-FIX-2) — iniciar() virou async (precisa
     buscar sessão e chamar setAuth antes de assinar). Fazemos
     await pra capturar eventuais erros do fluxo async. */
  if (typeof RealtimeService !== 'undefined') {
    try {
      await RealtimeService.iniciar();
    } catch (err) {
      SLog.error('RT: falha ao iniciar — ' + err.message);
    }
  } else {
    SLog.warn('RT: RealtimeService indisponível (script não carregado?)');
  }

  /* Exibir seção de relatórios se gerente */
  if (AuthService.currentProfile && AuthService.currentProfile.perfil === 'gerente') {
    $('#secao-relatorios-gerente').show();
  }

  /* Popular filiais no modal de usuário */
  var $usrFilial = $('#usr-filial');
  if ($usrFilial.length) {
    $usrFilial.html('<option value="">Selecione...</option>');
    store.filiais.forEach(function(f) {
      $usrFilial.append('<option value="' + f.nome + '">' + f.nome + '</option>');
    });
    $usrFilial.append('<option value="Todas">Todas</option>');
  }

  /* ── Eventos ── */
  $('#sidebar-toggle').on('click', function() { SidebarController.alternar(); });
  $('#sidebar-backdrop').on('click', function() { SidebarController.fecharMobile(); });
  $('#notif-btn').on('click', function(e) { e.stopPropagation(); NotifController.toggleDropdown(); });

  $(document).on('click', '.filtros .filtro-btn', function() {
    var $g = $(this).closest('.filtros');
    $g.find('.filtro-btn').removeClass('active');
    $(this).addClass('active');
    var tipo = $(this).data('filter');
    var tgt  = $g.data('target');
    if (tgt==='historico')  HistoricoModule.render(tipo);
    if (tgt==='curriculos') CurriculoModule.render(tipo);
  });

  $(document).on('click', '.res-opt', function() { FunilModule.selecionarRes(this); });
  $(document).on('click', '.vres-btn', function() {
    FunilModule.selecionarVisita(this, $(this).data('tipo'));
  });
  $(document).on('click', '.lead-tab:not(.disabled)', function() {
    Modal.trocarAba($(this).data('tab'), this);
  });
  $(document).on('click', '.check-item', function() { ChecklistItem.alternar(this); });
  $(document).on('change', '.fonte-select', function() { FonteSelect.atualizar(this); });
  $(document).on('click', '.btn-agora', function() { DateTimeHelper.setNow($(this).data('target')); });
  /* Sprint 7 · 7.3 — preview real do arquivo de importação
     (analisa cabeçalho, valida linhas, checa duplicidade). */
  $(document).on('change', '#import-file', function() {
    var file = this.files && this.files[0];
    if (typeof FunilModule !== 'undefined' && FunilModule.previewArquivoImportacao) {
      FunilModule.previewArquivoImportacao(file);
    } else {
      /* Fallback: preview simples se o dispatcher não estiver carregado */
      if (!file) { $('#import-preview').html(''); return; }
      $('#import-preview').html('<i class="bi bi-file-earmark-check text-success"></i> Arquivo selecionado: <strong>' + Utils.escHtml(file.name) + '</strong> (' + (file.size/1024).toFixed(1) + ' KB)');
    }
  });

  Router.inicializar();

  /* Patch UX-1 — máscaras (telefone e valores monetários)
     Funcionam via delegação no document, então valem também
     para inputs criados dinamicamente (ex: blocos de recomendação). */
  Utils.inicializarMascaras();

  /* Patch v1.1.0 — controle de versionamento, painel dev e changelog */
  AppVersion.aplicar();

  SLog.renderAll();
  SLog.info('App pronto!');
}

/* 3B.5: Toggle mostrar/ocultar senha na tela de Login (mesmo padrão do modal de usuário — item 3.4) */
$(document).on('click', '#login-senha-toggle', function() {
  var $input = $('#login-senha');
  var $icon  = $('#login-senha-toggle-icon');
  var isPwd  = $input.attr('type') === 'password';
  $input.attr('type', isPwd ? 'text' : 'password');
  $icon.toggleClass('bi-eye-fill', !isPwd).toggleClass('bi-eye-slash-fill', isPwd);
  $(this).attr('title', isPwd ? 'Ocultar senha' : 'Mostrar senha');
});

/* ── Login handler ── */
window.handleLogin = async function() {
  var email = $('#login-email').val().trim();
  var senha = $('#login-senha').val().trim();
  var $btn  = $('#login-btn');
  var $err  = $('#login-error');

  $err.hide();

  if (!email || !senha) {
    $err.text('Preencha e-mail e senha.').show();
    return;
  }

  $btn.prop('disabled', true).html('<i class="bi bi-arrow-repeat spin-icon"></i> Entrando...');

  try {
    await AuthService.login(email, senha);
    await iniciarApp();
  } catch (err) {
    var msg = 'Erro ao fazer login.';
    if (err.message) {
      if (err.message.includes('Invalid login')) msg = 'E-mail ou senha incorretos.';
      else if (err.message.includes('Email not confirmed')) msg = 'E-mail não confirmado. Contate o administrador.';
      else msg = err.message;
    }
    $err.text(msg).show();
    $btn.prop('disabled', false).html('<i class="bi bi-box-arrow-in-right"></i> Entrar');
  }
};

/* ── Logout handler ── */
window.handleLogout = function() {
  /* v4.1 (REALTIME-FIX-1) — desconecta canais antes de derrubar sessão.
     Educadamente evita mensagens de erro no console e libera recursos
     do lado do servidor. O reload subsequente do AuthService.logout
     também descarregaria tudo, mas parar() explícito é o padrão certo. */
  if (typeof RealtimeService !== 'undefined') {
    try {
      RealtimeService.parar();
    } catch (err) {
      SLog.warn('RT: erro ao parar no logout — ' + err.message);
    }
  }
  AuthService.logout();
};

/* ================================================================
   Chamado #62 (Parte A) — Auto-serviço de troca de senha
   ================================================================ */

/* Toggle mostrar/ocultar em qualquer campo de senha do modal
   (usa data-alvo pra saber qual input alternar). */
$(document).on('click', '.ts-toggle', function() {
  var alvo   = $(this).data('alvo');
  var $input = $('#' + alvo);
  var $icon  = $(this).find('i');
  var isPwd  = $input.attr('type') === 'password';
  $input.attr('type', isPwd ? 'text' : 'password');
  $icon.toggleClass('bi-eye-fill', !isPwd).toggleClass('bi-eye-slash-fill', isPwd);
  $(this).attr('title', isPwd ? 'Ocultar senha' : 'Mostrar senha');
});

/* Abre o modal já limpo. */
window.abrirTrocarSenha = function() {
  $('#ts-atual, #ts-nova, #ts-confirma').val('');
  $('#ts-error').hide().text('');
  /* Reseta todos os campos para type=password e ícone de olho aberto */
  $('#ts-atual, #ts-nova, #ts-confirma').attr('type', 'password');
  $('.ts-toggle i').removeClass('bi-eye-slash-fill').addClass('bi-eye-fill');
  Modal.abrir('modal-trocar-senha');
  setTimeout(function() { $('#ts-atual').focus(); }, 120);
};

window.confirmarTrocarSenha = async function() {
  var atual    = $('#ts-atual').val();
  var nova     = $('#ts-nova').val();
  var confirma = $('#ts-confirma').val();
  var $err     = $('#ts-error');
  $err.hide().text('');

  /* ── Validações (mesmas regras da criação de usuário) ── */
  if (!atual)    { $err.text('Informe a senha atual.').show(); $('#ts-atual').focus(); return; }
  if (!nova)     { $err.text('Informe a nova senha.').show(); $('#ts-nova').focus(); return; }
  if (nova.length < 8)      { $err.text('A nova senha deve ter pelo menos 8 caracteres.').show(); $('#ts-nova').focus(); return; }
  if (!/[A-Z]/.test(nova))  { $err.text('A nova senha deve conter pelo menos 1 letra maiúscula.').show(); $('#ts-nova').focus(); return; }
  if (!/[0-9]/.test(nova))  { $err.text('A nova senha deve conter pelo menos 1 número.').show(); $('#ts-nova').focus(); return; }
  if (nova !== confirma)    { $err.text('A confirmação não confere com a nova senha.').show(); $('#ts-confirma').focus(); return; }
  if (nova === atual)       { $err.text('A nova senha deve ser diferente da atual.').show(); $('#ts-nova').focus(); return; }

  var $btn = $('#btn-trocar-senha');
  var btnHtml = $btn.html();
  $btn.prop('disabled', true).html('<i class="bi bi-arrow-repeat spin-icon"></i> Salvando...');

  try {
    await AuthService.trocarSenhaComRevalidacao(atual, nova);
    Modal.fechar('modal-trocar-senha');
    Toast.show('Senha alterada com sucesso!', 'success');
  } catch (err) {
    var msg = err && err.message ? err.message : 'Falha ao alterar a senha.';
    if (msg.indexOf('Senha atual incorreta') >= 0) {
      msg = 'Senha atual incorreta.';
    } else if (msg.indexOf('should be at least') >= 0 || msg.indexOf('Password should') >= 0) {
      msg = 'A nova senha não atende aos requisitos mínimos do servidor.';
    } else if (msg.indexOf('same') >= 0 && msg.indexOf('password') >= 0) {
      msg = 'A nova senha deve ser diferente da atual.';
    } else if (msg.indexOf('Failed to fetch') >= 0 || msg.indexOf('NetworkError') >= 0) {
      msg = 'Sem conexão com o servidor. Verifique sua internet.';
    }
    $err.text(msg).show();
  } finally {
    $btn.prop('disabled', false).html(btnHtml);
  }
};

/* ================================================================
   Chamado #62 (Parte B) — "Esqueceu sua senha?"
   ================================================================ */

/* Link na tela de login: usa o e-mail já digitado no campo. */
window.esqueciSenha = async function() {
  var email = $('#login-email').val().trim();
  var $err  = $('#login-error');
  $err.hide();

  if (!email) {
    $err.css({ background:'#EEF2FF', color:'#1E2358', borderColor:'#C5C8EC' })
        .text('Digite seu e-mail no campo acima e clique novamente em "Esqueceu sua senha?".').show();
    $('#login-email').focus();
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    $err.css({ background:'#FDF1F4', color:'#A80F2A', borderColor:'#F7B8C4' })
        .text('E-mail inválido.').show();
    $('#login-email').focus();
    return;
  }

  var $link = $('#login-esqueci');
  var linkTxt = $link.text();
  $link.text('Enviando...').css('pointer-events', 'none');

  try {
    await AuthService.enviarResetSenha(email);
    /* Mensagem neutra (não revela se o e-mail existe) — boa prática. */
    $err.css({ background:'#ECFDF5', color:'#065F46', borderColor:'#A7F3D0' })
        .text('Se este e-mail estiver cadastrado, enviamos um link para redefinir a senha. Verifique sua caixa de entrada e o spam.').show();
  } catch (err) {
    var msg = (err && err.message) ? err.message : 'Não foi possível enviar o e-mail.';
    if (msg.indexOf('rate limit') >= 0 || msg.toLowerCase().indexOf('too many') >= 0) {
      msg = 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
    } else if (msg.indexOf('Failed to fetch') >= 0 || msg.indexOf('NetworkError') >= 0) {
      msg = 'Sem conexão com o servidor. Verifique sua internet.';
    }
    $err.css({ background:'#FDF1F4', color:'#A80F2A', borderColor:'#F7B8C4' }).text(msg).show();
  } finally {
    $link.text(linkTxt).css('pointer-events', 'auto');
  }
};

/* Toggle mostrar/ocultar nos campos do modal de recuperação. */
$(document).on('click', '.rec-toggle', function() {
  var alvo   = $(this).data('alvo');
  var $input = $('#' + alvo);
  var $icon  = $(this).find('i');
  var isPwd  = $input.attr('type') === 'password';
  $input.attr('type', isPwd ? 'text' : 'password');
  $icon.toggleClass('bi-eye-fill', !isPwd).toggleClass('bi-eye-slash-fill', isPwd);
  $(this).attr('title', isPwd ? 'Ocultar senha' : 'Mostrar senha');
});

/* Fluxo de definição da nova senha quando o usuário volta pelo link. */
window.RecoveryFlow = {
  abrir: function() {
    window.__ampRecoveryHandled = true;
    $('#rec-nova, #rec-confirma').val('').attr('type', 'password');
    $('#rec-error').hide().text('');
    $('.rec-toggle i').removeClass('bi-eye-slash-fill').addClass('bi-eye-fill');
    /* Trava o fechamento por backdrop/ESC: o usuário PRECISA definir a
       senha (fecharemos programaticamente com forçar=true no sucesso). */
    if (Modal.setGuard) {
      Modal.setGuard('modal-recovery-senha', function() { return true; });
    }
    Modal.abrir('modal-recovery-senha');
    setTimeout(function() { $('#rec-nova').focus(); }, 150);
  },

  confirmar: async function() {
    var nova     = $('#rec-nova').val();
    var confirma = $('#rec-confirma').val();
    var $err     = $('#rec-error');
    $err.hide().text('');

    if (!nova)                { $err.text('Informe a nova senha.').show(); $('#rec-nova').focus(); return; }
    if (nova.length < 8)      { $err.text('A senha deve ter pelo menos 8 caracteres.').show(); $('#rec-nova').focus(); return; }
    if (!/[A-Z]/.test(nova))  { $err.text('A senha deve conter pelo menos 1 letra maiúscula.').show(); $('#rec-nova').focus(); return; }
    if (!/[0-9]/.test(nova))  { $err.text('A senha deve conter pelo menos 1 número.').show(); $('#rec-nova').focus(); return; }
    if (nova !== confirma)    { $err.text('A confirmação não confere.').show(); $('#rec-confirma').focus(); return; }

    var $btn = $('#btn-recovery-senha');
    var btnHtml = $btn.html();
    $btn.prop('disabled', true).html('<i class="bi bi-arrow-repeat spin-icon"></i> Salvando...');

    try {
      await AuthService.definirNovaSenhaRecovery(nova);
      Modal.fechar('modal-recovery-senha', true);
      /* Encerra a sessão de recovery e limpa a URL, mandando o usuário
         para o login limpo com a nova senha. */
      try { await supa.auth.signOut(); } catch (e) { /* silent */ }
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (e) { /* silent */ }
      Toast.show('Senha redefinida! Faça login com a nova senha.', 'success');
      setTimeout(function() { window.location.reload(); }, 900);
    } catch (err) {
      var msg = (err && err.message) ? err.message : 'Falha ao redefinir a senha.';
      if (msg.indexOf('should be at least') >= 0 || msg.indexOf('Password should') >= 0) {
        msg = 'A senha não atende aos requisitos mínimos do servidor.';
      } else if (msg.toLowerCase().indexOf('same') >= 0 && msg.toLowerCase().indexOf('password') >= 0) {
        msg = 'A nova senha deve ser diferente da anterior.';
      } else if (msg.indexOf('expired') >= 0 || msg.indexOf('invalid') >= 0 || msg.toLowerCase().indexOf('session') >= 0) {
        msg = 'O link de recuperação expirou. Solicite um novo em "Esqueceu sua senha?".';
      }
      $err.text(msg).show();
      $btn.prop('disabled', false).html(btnHtml);
    }
  }
};

window.confirmarRecoverySenha = function() { RecoveryFlow.confirmar(); };

/* ================================================================
   Chamado #59 — Modo escuro (alternância + persistência)
   ================================================================ */
function _atualizarIconeTema() {
  var dark = document.documentElement.getAttribute('data-theme') === 'dark';
  var $i = $('#btn-tema i');
  if ($i.length) $i.attr('class', dark ? 'bi bi-sun' : 'bi bi-moon-stars');
  $('#btn-tema').attr('title', dark ? 'Mudar para modo claro' : 'Mudar para modo escuro');
}

window.toggleTema = function() {
  var html = document.documentElement;
  var dark = html.getAttribute('data-theme') === 'dark';
  if (dark) {
    html.removeAttribute('data-theme');
    try { localStorage.setItem('beyond-tema', 'light'); } catch (e) { /* silent */ }
  } else {
    html.setAttribute('data-theme', 'dark');
    try { localStorage.setItem('beyond-tema', 'dark'); } catch (e) { /* silent */ }
  }
  _atualizarIconeTema();
};

/* ── Funções globais ── */
window.navigate          = function(p)    { Router.ir(p); };
window.openModal         = function(id)   { Modal.abrir(id); };
window.closeModal        = function(id)   { Modal.fechar(id); };
window.confirmYes        = function()     { ConfirmDialog.confirmar(); };
window.confirmNo         = function()     { ConfirmDialog.cancelar(); };

window.novoLead          = function()     { FunilModule.novoLead(); };
window.salvarNovoLead    = function()     { FunilModule.salvarNovoLead(); };
window.registrarLigacao  = function()     { FunilModule.registrarLigacao(); };
window.concluirLigacao   = function()     { FunilModule.concluirLigacao(); };
window.confirmarAgendamento = function()  { FunilModule.confirmarAgendamento(); };
window.confirmarVisita   = function()     { FunilModule.confirmarVisita(); };
window.confirmarVenda    = function()     { FunilModule.confirmarVenda(); };
window.criarLeadRec      = function(id)   { FunilModule.criarLeadRec(id); };
window.adicionarTag      = function(id,t) { FunilModule.adicionarTag(id, t); };
window.removerTag        = function(id,t) { FunilModule.removerTag(id, t); };

window.avancarLeadAtual  = function() {
  var lead = store.currentLead;
  if (!lead) return;
  /* Chamado #31 — fonte é obrigatória em Lead antes de avançar */
  if (FunilModule._validarFonteObrigatoria && !FunilModule._validarFonteObrigatoria(lead)) return;
  var idx = STAGE_ORDER.indexOf(lead.etapa);
  if (lead.etapa==='agendamento') FunilModule.confirmarAgendamento();
  else if (lead.etapa==='visita') FunilModule.confirmarVisita();
  else if (lead.etapa==='venda')  FunilModule.confirmarVenda();
  else if (lead.etapa==='carteira') FunilModule.registrarInteracaoCarteira();
  else {
    var prox = STAGE_ORDER[idx+1];
    if (prox) {
      store.avancarEtapa(lead,prox);
      FunilModule.renderKanban();
      Modal.fechar('modal-lead');
      Toast.show('Lead avançou para ' + STAGE_CONFIG[prox].label + '!', 'success');
      setTimeout(function() { FunilModule.abrirDetalhe(lead.id); }, 200);
    }
  }
};

window.abrirNovoCurriculo = function()   { CurriculoModule.abrirNovo(); };
window.salvarCurriculo    = function()   { CurriculoModule.salvar(); };
window.editarCurriculo    = function(id) { CurriculoModule.editar(id); };
window.deletarCurriculo   = function(id) { CurriculoModule.deletar(id); };
window.abrirNovoUsuario   = function()   { UsuarioModule.abrirNovo(); };
window.salvarUsuario      = function()   { UsuarioModule.salvar(); };

window.showToast  = function(m,t) { Toast.show(m,t); };
window.showConfirm = function(i,tt,m,cb) { ConfirmDialog.show(i,tt,m,cb); };
window.copyTel = function(tel) { Utils.copyTel(tel); Toast.show('Número copiado!','success'); };
/* 3B.1: form único de Recomendação — addRecCard virou no-op. Mantido apenas
   para compatibilidade caso algum lugar externo ainda chame por engano. */
window.addRecCard = function() { /* no-op */ };

/* ── Avatar handlers (seção Minha Performance) ── */
$(document).on('change', '#avatar-input', async function() {
  SLog.load('AVATAR input change disparado');
  var file = this.files && this.files[0];
  if (!file) { SLog.warn('AVATAR nenhum arquivo selecionado'); return; }
  SLog.load('AVATAR arquivo: ' + file.name + ' (' + (file.size/1024).toFixed(1) + 'KB, ' + file.type + ')');

  var $status = $('#avatar-status');
  var userId = AuthService.currentUser ? AuthService.currentUser.id : null;
  SLog.load('AVATAR userId: ' + (userId || 'NULO'));
  if (!userId) { $status.html('<span style="color:var(--d-txt-dc2626);">Faça login primeiro.</span>'); return; }

  if (!file.name.toLowerCase().endsWith('.png')) {
    SLog.error('AVATAR rejeitado: extensão não é .png');
    $status.html('<span style="color:var(--d-txt-dc2626);">❌ Apenas arquivos .PNG são aceitos.</span>');
    $(this).val('');
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    SLog.error('AVATAR rejeitado: tamanho ' + (file.size/1024/1024).toFixed(1) + 'MB > 2MB');
    $status.html('<span style="color:var(--d-txt-dc2626);">❌ Máximo 2MB.</span>');
    $(this).val('');
    return;
  }

  $status.html('<span style="color:var(--d-txt-2563eb);"><i class="bi bi-arrow-repeat spin-icon"></i> Validando e enviando...</span>');
  SLog.load('AVATAR chamando AvatarService.upload...');

  try {
    var url = await AvatarService.upload(userId, file);
    SLog.info('AVATAR upload retornou URL: ' + url.substring(0, 80) + '...');
    $('#avatar-preview').html('<img src="' + url + '" style="width:100%;height:100%;object-fit:cover;">');
    $('#btn-remover-avatar').show();
    $('#header-avatar-img').attr('src', url).show();
    $('#header-avatar-sigla').hide();
    $status.html('<span style="color:var(--d-txt-059669);">✅ Foto atualizada!</span>');
    setTimeout(function() { $status.html(''); }, 3000);
  } catch (err) {
    SLog.error('AVATAR upload FALHOU: ' + err.message);
    $status.html('<span style="color:var(--d-txt-dc2626);">❌ ' + err.message + '</span>');
  }
  $(this).val('');
});

$(document).on('click', '#btn-remover-avatar', function() {
  var userId = AuthService.currentUser ? AuthService.currentUser.id : null;
  if (!userId) return;

  ConfirmDialog.show('🗑️', 'Remover Foto', 'Deseja remover sua foto de perfil?', async function() {
    try {
      await AvatarService.remover(userId);
      $('#avatar-preview').html('<span style="font-size:24px;font-weight:700;color:var(--d-txt-6b7280);">' + (AuthService.currentProfile ? AuthService.currentProfile.sigla : '—') + '</span>');
      $('#btn-remover-avatar').hide();
      $('#header-avatar-img').hide();
      $('#header-avatar-sigla').show();
      Toast.show('Foto removida.', 'success');
    } catch (err) {
      Toast.show('Erro ao remover: ' + err.message, 'danger');
    }
  });
});
