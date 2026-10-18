/* ============================================================
   BEYOND CRM — js/infra/SupabaseClient.js   v2.2
   Conexão segura com o Supabase + logs de diagnóstico.
   Beyond Bits Tecnologia © 2026

   Histórico:
   - v2.1: persistSession via localStorage (auto-login)
   - v2.2 (PATCH AUTH-3.3): troca para sessionStorage —
     login obrigatório a cada nova aba/fechamento do navegador.
     F5 dentro da mesma aba continua mantendo a sessão.
   ============================================================ */

/* NOTA: Sem 'use strict' neste arquivo porque o CDN do Supabase
   cria uma global "supabase" que precisamos sobrescrever. */

/* As credenciais vêm do arquivo js/infra/env.js (que NÃO vai pro Git).
   Se env.js não foi carregado, SupabaseEnv será undefined e o log avisa. */
var SupabaseConfig = {
  URL:      (typeof SupabaseEnv !== 'undefined' && SupabaseEnv.URL)      || '',
  ANON_KEY: (typeof SupabaseEnv !== 'undefined' && SupabaseEnv.ANON_KEY) || '',
};

/* ── Logger centralizado ── */
var SLog = {
  _el: null,
  _msgs: [],
  _getEl: function() {
    if (!this._el) this._el = document.getElementById('supa-log');
    return this._el;
  },
  _append: function(cls, icon, msg) {
    var ts = new Date().toLocaleTimeString('pt-BR');
    this._msgs.push({ cls: cls, icon: icon, msg: msg, ts: ts });
    var el = this._getEl();
    if (el) {
      el.innerHTML += '<div class="slog-line ' + cls + '"><span class="slog-ts">' + ts + '</span><span class="slog-icon">' + icon + '</span>' + msg + '</div>';
      el.scrollTop = el.scrollHeight;
    }
    var method = cls === 'slog-err' ? 'error' : cls === 'slog-warn' ? 'warn' : 'log';
    console[method]('[Beyond CRM] ' + icon + ' ' + msg);
  },
  info: function(msg)  { this._append('slog-ok',   '✅', msg); },
  warn: function(msg)  { this._append('slog-warn', '⚠️', msg); },
  error: function(msg) { this._append('slog-err',  '❌', msg); },
  load: function(msg)  { this._append('slog-load', '⏳', msg); },
  renderAll: function() {
    var el = this._getEl();
    if (el) el.innerHTML = this._msgs.map(function(m) {
      return '<div class="slog-line ' + m.cls + '"><span class="slog-ts">' + m.ts + '</span><span class="slog-icon">' + m.icon + '</span>' + m.msg + '</div>';
    }).join('');
  },
  /* ============================================================
     exportarFalhas — Ticket #31 (Onda 5 pós-testes, revisado)
     ============================================================
     Retorna string TXT com todo o histórico de warns + errors
     desde o boot da sessão atual. Útil pra suporte: usuário
     baixa e envia.

     Cada evento pode ser MULTI-LINHA (Toast.showError registra 3-4
     linhas: contexto, situação, detalhe técnico, origem). Aqui
     preservamos as quebras de linha, mas a numeração sequencial
     considera 1 por evento — não por linha.
     ============================================================ */
  exportarFalhas: function() {
    var falhas = this._msgs.filter(function(m) {
      return m.cls === 'slog-err' || m.cls === 'slog-warn';
    });
    var header = '';
    header += '=======================================================\n';
    header += ' BEYOND CRM — Log de Falhas da Sessão\n';
    header += ' Gerado em: ' + new Date().toLocaleString('pt-BR') + '\n';
    header += ' Total: ' + falhas.length + ' evento(s)\n';
    try {
      if (typeof AuthService !== 'undefined' && AuthService.currentProfile) {
        header += ' Usuário: ' + (AuthService.currentProfile.nome || '?') +
                  ' (' + (AuthService.currentProfile.perfil || '?') + ')\n';
      }
      if (typeof AppVersion !== 'undefined' && AppVersion.NUMERO) {
        header += ' Versão do sistema: ' + AppVersion.NUMERO + '\n';
      }
    } catch (e) { /* silencioso */ }
    header += ' User agent: ' + navigator.userAgent + '\n';
    header += '=======================================================\n\n';
    header += 'Legenda dos eventos:\n';
    header += '  • ERRO  — algo falhou de forma bloqueante\n';
    header += '  • AVISO — comportamento inesperado, mas não bloqueante\n';
    header += '  Quando um evento tem várias linhas, elas descrevem:\n';
    header += '    ↳ SITUAÇÃO       — o que o usuário viu ou tentou fazer\n';
    header += '    ↳ DETALHE TÉCNICO — a mensagem crua do sistema\n';
    header += '    ↳ ORIGEM         — arquivo/linha onde ocorreu\n\n';

    if (falhas.length === 0) return header + '(nenhuma falha registrada nesta sessão)\n';

    var body = falhas.map(function(m, i) {
      var tipo = (m.cls === 'slog-err') ? 'ERRO ' : 'AVISO';
      var numero = '[' + (i + 1).toString().padStart(3, '0') + ']';
      /* Se a mensagem já é multi-linha (do Toast.showError), preserva
         estrutura visual; se é single-line (SLog.error direto), fica
         numa linha só. */
      if (m.msg.indexOf('\n') > -1) {
        var linhas = m.msg.split('\n');
        var primeira = linhas[0];
        var demais   = linhas.slice(1).join('\n');
        return numero + ' ' + m.ts + ' ' + tipo + ' — ' + primeira + '\n' + demais;
      }
      return numero + ' ' + m.ts + ' ' + tipo + ' — ' + m.msg;
    }).join('\n\n');

    return header + body + '\n';
  }
};

/* ── Criar cliente ── */
/* O CDN do Supabase cria window.supabase como a biblioteca.
   Usamos ela para criar o client e salvamos em window.supa.
   A variável global "supa" é usada em todo o projeto. */
var supa = null;

if (!SupabaseConfig.URL || !SupabaseConfig.ANON_KEY) {
  SLog.warn('Credenciais ausentes — crie o arquivo js/infra/env.js (veja env.example.js)');
} else if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
  SLog.error('Biblioteca supabase-js não carregada (CDN ausente)');
} else {
  try {
    /* ============================================================
       Chamado #62 (Parte B) — captura do modo RECUPERAÇÃO de senha
       ============================================================
       Quando o usuário volta pelo link de "Esqueceu sua senha?", nós
       anexamos um marcador PRÓPRIO à URL de retorno (?amp_pw_reset=1 —
       ver AuthService.enviarResetSenha). Esse marcador é a fonte de
       verdade porque:
         • independe do formato do link (fluxo implicit com #type=recovery
           OU PKCE com ?code=) — o Supabase preserva os query params que
           colocamos no redirectTo;
         • é síncrono e imune à corrida de tempo do detectSessionInUrl,
           que pode limpar o hash e emitir o evento PASSWORD_RECOVERY
           ANTES do app.js registrar seus listeners.
       Mantemos `type=recovery` no hash apenas como fallback de
       compatibilidade. O app.js lê window.__ampRecoveryMode no boot. */
    try {
      var _q = String(window.location.search || '');
      var _h = String(window.location.hash || '');
      window.__ampRecoveryMode =
        (typeof window !== 'undefined' &&
         typeof window.location !== 'undefined' &&
         (_q.indexOf('amp_pw_reset=1') >= 0 || _h.indexOf('type=recovery') >= 0));

      /* Captura também o caso de o Supabase devolver ERRO no link
         (ex.: #error=access_denied&error_code=otp_expired) — link
         inválido/expirado/já consumido. Capturamos aqui porque o
         detectSessionInUrl pode limpar o hash antes do app.js. */
      var _err = _q + _h;
      window.__ampAuthLinkError =
        (_err.indexOf('otp_expired') >= 0 ||
         _err.indexOf('access_denied') >= 0 ||
         _err.indexOf('error_code=') >= 0);
    } catch (recErr) {
      window.__ampRecoveryMode = false;
      window.__ampAuthLinkError = false;
    }

    supa = window.supabase.createClient(SupabaseConfig.URL, SupabaseConfig.ANON_KEY, {
      auth: {
        autoRefreshToken:   true,
        persistSession:     true,
        detectSessionInUrl: true,
        /* ============================================================
           PATCH AUTH-3.3 — Login obrigatório por aba
           ============================================================
           Trocamos o storage padrão (localStorage) por sessionStorage.
           Efeito prático:
           - F5 / recarregar: sessão sobrevive (uso normal)
           - Fechar a aba: sessão é descartada
           - Reabrir app: pede login mesmo com senha salva no Chrome
           - Estações compartilhadas: cada usuário precisa logar
           ============================================================ */
        storage: window.sessionStorage,
      },
    });
    SLog.info('Supabase Client criado → ' + SupabaseConfig.URL);
    SLog.info('AUTH storage: sessionStorage (login obrigatório por aba)');
  } catch (e) {
    SLog.error('Falha ao criar Supabase Client: ' + e.message);
  }
}
