/* ============================================================
   BEYOND CRM — js/services/AuthService.js   v3.0
   Login, logout, sessão e criação de usuários via Edge Function.
   Beyond Bits Tecnologia © 2026
   ============================================================ */
'use strict';

class AuthService {

  static currentUser    = null;
  static currentProfile = null;

  /* ── Login ── */
  static async login(email, senha) {
    if (!supa) throw new Error('Supabase não inicializado');
    SLog.load('AUTH login: ' + email);

    var res = await supa.auth.signInWithPassword({ email: email, password: senha });
    if (res.error) { SLog.error('AUTH login falhou: ' + res.error.message); throw res.error; }

    AuthService.currentUser = res.data.user;
    SLog.info('AUTH login OK — UID: ' + res.data.user.id);

    var profile = await AuthService.getProfile(res.data.user.id);
    AuthService.currentProfile = profile;
    if (profile) SLog.info('AUTH perfil: ' + profile.nome + ' (' + profile.perfil + ')');
    else SLog.warn('AUTH perfil não encontrado na tabela profiles');

    /* Bloqueia login de usuários inativos (coluna status='inativo') */
    if (profile && profile.status === 'inativo') {
      SLog.warn('AUTH login bloqueado: usuário inativo');
      await supa.auth.signOut();
      AuthService.currentUser = null;
      AuthService.currentProfile = null;
      throw new Error('Usuário inativo. Contate o gerente.');
    }

    return { user: res.data.user, session: res.data.session, profile: profile };
  }

  /* ── Logout ── */
  static async logout() {
    if (!supa) return;
    SLog.load('AUTH logout...');
    await supa.auth.signOut();
    AuthService.currentUser = null;
    AuthService.currentProfile = null;
    SLog.info('AUTH logout OK');
    window.location.reload();
  }

  /* ── Sessão / Usuário ── */
  static async getSession() {
    if (!supa) return null;
    return (await supa.auth.getSession()).data.session;
  }

  static async getUser() {
    if (!supa) return null;
    return (await supa.auth.getUser()).data.user;
  }

  /* ── Perfil (tabela profiles) ── */
  static async getProfile(userId) {
    if (!supa) return null;
    var res = await supa.from('profiles').select('*, filiais(nome, local)').eq('id', userId).single();
    if (res.error) { SLog.warn('AUTH getProfile: ' + res.error.message); return null; }
    return res.data;
  }

  /* ── Restaurar sessão existente ── */
  static async restaurarSessao() {
    if (!supa) return false;
    SLog.load('AUTH verificando sessão...');

    var session = await AuthService.getSession();
    if (!session) { SLog.warn('AUTH sem sessão ativa'); return false; }

    var user = await AuthService.getUser();
    if (!user) { SLog.warn('AUTH sessão expirada'); return false; }

    AuthService.currentUser = user;
    SLog.info('AUTH sessão restaurada — UID: ' + user.id);

    var profile = await AuthService.getProfile(user.id);
    AuthService.currentProfile = profile;
    if (profile) SLog.info('AUTH perfil: ' + profile.nome + ' (' + profile.perfil + ')');

    /* Sessão restaurada mas usuário foi inativado: forca logout */
    if (profile && profile.status === 'inativo') {
      SLog.warn('AUTH sessão inválida: usuário inativo, forçando logout');
      await supa.auth.signOut();
      AuthService.currentUser = null;
      AuthService.currentProfile = null;
      return false;
    }

    return true;
  }

  /* ── Atualizar header com dados reais ── */
  static atualizarHeader() {
    var p = AuthService.currentProfile;
    if (!p) return;
    var filialNome = p.filiais ? p.filiais.nome : '—';
    var perfilLabel = (PERFIL_CONFIG[p.perfil] || {}).label || p.perfil;
    $('.header-name').text(p.nome);
    $('.header-role').text(perfilLabel + ' · ' + filialNome);
    $('#header-avatar-sigla').text(p.sigla);
  }

  /* ── Admin: criar novo usuário via Edge Function ── */
  static async criarUsuario(dados) {
    if (!supa) throw new Error('Supabase não inicializado');
    if (!AuthService.currentProfile || AuthService.currentProfile.perfil !== 'gerente') {
      throw new Error('Apenas gerentes podem criar usuários');
    }

    SLog.load('AUTH criando usuário via Edge Function: ' + dados.email);

    /* Buscar filial_id pelo nome */
    var filialId = null;
    if (dados.filial && dados.filial !== 'Todas') {
      var filial = store.filiais.find(function(f) { return f.nome === dados.filial; });
      if (filial) filialId = filial.id;
    }

    /* Buscar sessão para enviar o token */
    var session = await AuthService.getSession();
    if (!session) throw new Error('Sessão expirada. Faça login novamente.');

    /* Chamar Edge Function */
    var response = await fetch(SupabaseConfig.URL + '/functions/v1/super-function', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
        'apikey': SupabaseConfig.ANON_KEY,
      },
      body: JSON.stringify({
        email:            dados.email,
        senha:            dados.senha,
        nome:             dados.nome,
        sigla:            dados.sigla,
        perfil:           dados.perfil,
        filial_id:        filialId,
        meta_mensalidade: dados.meta_mensalidade || 0,
        meta_vendas:      dados.meta_vendas || 0,
        /* Chamado #51 — encaminhados também (a Edge Function pode ou não
           persistir; a garantia de persistência vem do UPDATE abaixo). */
        meta_super_vendas:      dados.meta_super_vendas || 0,
        meta_power_vendas:      dados.meta_power_vendas || 0,
        meta_king_vendas:       dados.meta_king_vendas || 0,
        meta_super_mensalidade: dados.meta_super_mensalidade || 0,
        meta_power_mensalidade: dados.meta_power_mensalidade || 0,
        meta_king_mensalidade:  dados.meta_king_mensalidade || 0,
      }),
    });

    var result = await response.json();

    if (!response.ok || result.error) {
      SLog.error('AUTH Edge Function: ' + (result.error || 'Erro desconhecido'));
      throw new Error(result.error || 'Falha ao criar usuário');
    }

    SLog.info('AUTH usuário criado: ' + dados.nome + ' (via Edge Function)');

    /* ================================================================
       Chamado #51 — persistência GARANTIDA de todos os degraus.
       ================================================================
       A Edge Function (super-function) historicamente só gravava
       nome/perfil/filial/meta_mensalidade/meta_vendas — os degraus
       (Super/Power/King, tanto quantidade quanto valor) não ficavam
       persistidos na criação. Aqui, com o userId retornado, aplicamos
       um UPDATE client-side (mesma RLS já usada na edição pelo gerente)
       garantindo que TODOS os campos de meta fiquem gravados,
       independente do que a função server-side trate.
       Best-effort: se falhar, loga e segue (o usuário já foi criado). */
    var novoId = result.userId;
    if (novoId && supa) {
      try {
        var metaUpd = await supa.from('profiles').update({
          meta_vendas:            Number(dados.meta_vendas) || 0,
          meta_mensalidade:       Number(dados.meta_mensalidade) || 0,
          meta_super_vendas:      Number(dados.meta_super_vendas) || 0,
          meta_power_vendas:      Number(dados.meta_power_vendas) || 0,
          meta_king_vendas:       Number(dados.meta_king_vendas) || 0,
          meta_super_mensalidade: Number(dados.meta_super_mensalidade) || 0,
          meta_power_mensalidade: Number(dados.meta_power_mensalidade) || 0,
          meta_king_mensalidade:  Number(dados.meta_king_mensalidade) || 0,
        }).eq('id', novoId);
        if (metaUpd.error) {
          SLog.error('criarUsuario: UPDATE de metas falhou — ' + metaUpd.error.message);
        } else {
          SLog.info('criarUsuario: metas completas (degraus + valores) persistidas ✓');
        }
      } catch (metaErr) {
        SLog.error('criarUsuario: exceção no UPDATE de metas — ' + metaErr.message);
      }
    }

    return { userId: result.userId };
  }

  /* ── Alterar senha (sessão atual, sem revalidar) ── */
  static async alterarSenha(novaSenha) {
    if (!supa) throw new Error('Supabase não inicializado');
    var res = await supa.auth.updateUser({ password: novaSenha });
    if (res.error) throw res.error;
    SLog.info('AUTH senha alterada');
  }

  /* ── Trocar a própria senha COM revalidação (Chamado #62 Parte A) ──
     Auto-serviço: o usuário logado troca a própria senha, mas antes
     precisa provar que sabe a senha ATUAL (D1 do chamado — mais seguro
     do que deixar trocar direto pela sessão).

     Estratégia: revalida a senha atual via signInWithPassword (o
     supabase-js NÃO desloga em caso de falha, então uma senha errada
     apenas rejeita, sem afetar a sessão vigente). Se ok, aplica o
     updateUser({ password }).

     Lança Error('Senha atual incorreta') se a revalidação falhar. */
  static async trocarSenhaComRevalidacao(senhaAtual, novaSenha) {
    if (!supa) throw new Error('Supabase não inicializado');

    var email = (AuthService.currentUser && AuthService.currentUser.email) || null;
    if (!email) throw new Error('Sessão inválida. Faça login novamente.');

    /* 1) Revalida a senha atual */
    var check = await supa.auth.signInWithPassword({ email: email, password: senhaAtual });
    if (check.error) {
      SLog.warn('AUTH trocarSenha: revalidação da senha atual falhou');
      throw new Error('Senha atual incorreta');
    }

    /* 2) Aplica a nova senha */
    var res = await supa.auth.updateUser({ password: novaSenha });
    if (res.error) throw res.error;

    SLog.info('AUTH senha alterada (auto-serviço, revalidada) ✓');
  }

  /* ── Admin: alterar e-mail de LOGIN de um usuário (Chamado #63) ──
     O e-mail de login mora em auth.users e só é alterável com privilégio
     admin (service_role), que nunca pode ir para o browser. Delegamos à
     Edge Function dedicada `admin-update-email`, que valida que o
     chamador é gerente e faz o auth.admin.updateUserById + sincroniza
     profiles.email.

     Mesmo padrão de chamada do criarUsuario (token do gerente no header).
     Lança Error com mensagem tratável em caso de falha. */
  static async atualizarEmailUsuario(userId, novoEmail) {
    if (!supa) throw new Error('Supabase não inicializado');
    if (!AuthService.currentProfile || AuthService.currentProfile.perfil !== 'gerente') {
      throw new Error('Apenas gerentes podem alterar o e-mail de login.');
    }
    if (!userId || !novoEmail) throw new Error('userId e novoEmail são obrigatórios.');

    var session = await AuthService.getSession();
    if (!session) throw new Error('Sessão expirada. Faça login novamente.');

    SLog.load('AUTH atualizando e-mail de login via Edge Function: ' + novoEmail);

    var response = await fetch(SupabaseConfig.URL + '/functions/v1/admin-update-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
        'apikey': SupabaseConfig.ANON_KEY,
      },
      body: JSON.stringify({ userId: userId, newEmail: novoEmail }),
    });

    /* 404 = função ainda não publicada. Damos uma mensagem clara pra
       o wiring do UsuarioModule distinguir do resto. */
    if (response.status === 404) {
      throw new Error('404: função admin-update-email não publicada');
    }

    var result;
    try { result = await response.json(); }
    catch (e) { result = {}; }

    if (!response.ok || result.error) {
      SLog.error('AUTH admin-update-email: ' + (result.error || ('HTTP ' + response.status)));
      throw new Error(result.error || ('Falha ao alterar e-mail (HTTP ' + response.status + ')'));
    }

    SLog.info('AUTH e-mail de login atualizado ✓');
    return { ok: true };
  }

  /* ── Enviar e-mail de recuperação de senha (Chamado #62 Parte B) ──
     Dispara o fluxo "Esqueceu sua senha?". O redirectTo usa a origem
     atual + o marcador ?amp_pw_reset=1, que o SupabaseClient lê no boot
     para forçar a tela de nova senha (detecção robusta, independente do
     formato do link e imune à corrida do detectSessionInUrl).

     IMPORTANTE: a origem atual precisa estar na allowlist de Redirect
     URLs do Supabase. Se não estiver, o Supabase ignora o redirectTo e
     usa o Site URL — por isso, testando na dev, some a URL de preview
     do Vercel na allowlist. */
  static async enviarResetSenha(email) {
    if (!supa) throw new Error('Supabase não inicializado');
    if (!email) throw new Error('Informe o e-mail.');

    var redirect = (typeof window !== 'undefined' && window.location)
      ? (window.location.origin + '/?amp_pw_reset=1')
      : undefined;

    SLog.load('AUTH enviando reset de senha para: ' + email);
    var res = await supa.auth.resetPasswordForEmail(email, redirect ? { redirectTo: redirect } : undefined);
    if (res.error) { SLog.error('AUTH resetPasswordForEmail: ' + res.error.message); throw res.error; }
    SLog.info('AUTH reset de senha solicitado ✓');
  }

  /* ── Definir nova senha no fluxo de recuperação (Chamado #62 Parte B) ──
     Chamado a partir da tela de recovery (usuário chegou pelo link do
     e-mail; supabase-js já montou a sessão de recovery). Aplica a nova
     senha e retorna. O caller cuida do signOut + redirect ao login. */
  static async definirNovaSenhaRecovery(novaSenha) {
    if (!supa) throw new Error('Supabase não inicializado');
    var res = await supa.auth.updateUser({ password: novaSenha });
    if (res.error) throw res.error;
    SLog.info('AUTH senha redefinida via recuperação ✓');
  }
}
