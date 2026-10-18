/* ============================================================
   BEYOND CRM — js/services/NotificacaoAgendamentoService.js   v1.0
   Notificação prévia de agendamentos (RN-24).
   Beyond Bits Tecnologia © 2026

   Feature 4.7 do Pacote 1 v1.3.0: quando falta 30 minutos para
   um agendamento, o especialista recebe:
     1) Toast visual imediato
     2) Notificação persistente no sino (via store.adicionarNotificacao)

   ARQUITETURA:
   - Polling client-side: setInterval a cada 60 segundos.
   - Fonte de verdade: store.agendamentos (já carregado por
     SupabaseSync.carregarAgendamentos, se refresca em cada F5).
   - Escopo: só notifica agendamentos do usuário LOGADO
     (agendamento._esp_id === auth.uid()). Gerentes e
     supervisores NÃO recebem notificação prévia dos
     agendamentos alheios — evita spam.
   - Anti-duplicata: Set em memória com IDs já notificados
     na sessão atual. Um F5 reseta o Set, mas a janela de
     detecção (-32 a -28min) impede o mesmo agendamento
     de disparar 2x no mesmo minuto.

   USO:
     NotificacaoAgendamentoService.iniciar();   // chamado no app.js
     NotificacaoAgendamentoService.parar();     // opcional (logout)
     NotificacaoAgendamentoService.verificarAgora();  // para debug/teste
   ============================================================ */
'use strict';

class NotificacaoAgendamentoService {

  /* Antecedência da notificação (minutos) */
  static _MINUTOS_ANTES = 30;

  /* Janela de detecção — margem de tolerância antes/depois do alvo.
     Como o polling é a cada 60s, a janela precisa cobrir pelo menos
     um ciclo completo pra não perder o alarme. Usamos ±2 minutos
     em volta do "T-30" para segurança. */
  static _MARGEM_MIN = 2;

  /* Intervalo de polling (ms) */
  static _INTERVALO_MS = 60 * 1000;

  /* Handle do setInterval — permite parar */
  static _handle = null;

  /* Set de UUIDs de agendamentos já notificados nesta sessão */
  static _notificadosNestaSessao = new Set();

  /* ────────────────────────────────────────────────────
     iniciar — arranca o polling.
     Idempotente: chamar duas vezes não cria dois timers.
     ──────────────────────────────────────────────────── */
  static iniciar() {
    if (NotificacaoAgendamentoService._handle) {
      SLog.warn('NotifAgend: já estava rodando — ignorando iniciar()');
      return;
    }
    SLog.info('NotifAgend: iniciando polling (' +
              (NotificacaoAgendamentoService._INTERVALO_MS / 1000) + 's)');

    /* Primeira verificação imediata pra pegar agendamentos que já
       estão na janela quando o app abre. */
    setTimeout(function() {
      NotificacaoAgendamentoService.verificarAgora();
    }, 3000); /* 3s após iniciar dá tempo do store carregar */

    NotificacaoAgendamentoService._handle = setInterval(function() {
      NotificacaoAgendamentoService.verificarAgora();
    }, NotificacaoAgendamentoService._INTERVALO_MS);
  }

  /* ────────────────────────────────────────────────────
     parar — encerra o polling e limpa estado.
     Chamar em logout, por exemplo.
     ──────────────────────────────────────────────────── */
  static parar() {
    if (NotificacaoAgendamentoService._handle) {
      clearInterval(NotificacaoAgendamentoService._handle);
      NotificacaoAgendamentoService._handle = null;
      NotificacaoAgendamentoService._notificadosNestaSessao.clear();
      SLog.info('NotifAgend: polling parado e cache limpo');
    }
  }

  /* ────────────────────────────────────────────────────
     verificarAgora — checa se algum agendamento cai na
     janela [alvo - margem, alvo + margem] onde
     alvo = agora + 30min.
     ──────────────────────────────────────────────────── */
  static verificarAgora() {
    if (!store || !store.agendamentos || !store.agendamentos.length) return;

    var meuId = NotificacaoAgendamentoService._userIdAtual();
    if (!meuId) return; /* sem usuário logado, sai */

    var agora = new Date();
    var alvoInicio = new Date(agora.getTime() +
      (NotificacaoAgendamentoService._MINUTOS_ANTES - NotificacaoAgendamentoService._MARGEM_MIN) * 60 * 1000);
    var alvoFim = new Date(agora.getTime() +
      (NotificacaoAgendamentoService._MINUTOS_ANTES + NotificacaoAgendamentoService._MARGEM_MIN) * 60 * 1000);

    var candidatos = 0;

    store.agendamentos.forEach(function(ag) {
      /* Filtro 1 — só agendamentos do usuário logado */
      if (ag._esp_id !== meuId) return;

      /* Filtro 2 — precisa ter data válida */
      if (!ag.data) return;

      var dataAg = new Date(ag.data);
      if (isNaN(dataAg.getTime())) return;

      /* Filtro 3 — só agendamentos futuros dentro da janela */
      if (dataAg < alvoInicio || dataAg > alvoFim) return;

      /* Filtro 4 — status não cancelado/realizado (se disponível) */
      if (ag._status === 'cancelado' || ag._status === 'realizado') return;

      /* Filtro 5 — anti-duplicata (mesmo agendamento não notifica
         duas vezes na sessão) */
      var key = ag._uuid || (ag.data + '|' + (ag.lead && ag.lead.id));
      if (NotificacaoAgendamentoService._notificadosNestaSessao.has(key)) return;

      /* Passou em tudo — dispara */
      NotificacaoAgendamentoService._disparar(ag, dataAg);
      NotificacaoAgendamentoService._notificadosNestaSessao.add(key);
      candidatos++;
    });

    if (candidatos > 0) {
      SLog.info('NotifAgend: ' + candidatos + ' notificação(ões) disparada(s)');
    }
  }

  /* ────────────────────────────────────────────────────
     _disparar — dispara Toast + notificação no sino.
     ──────────────────────────────────────────────────── */
  static _disparar(agendamento, dataAg) {
    var nomeLead = (agendamento.lead && agendamento.lead.nome) ||
                   agendamento.nome ||
                   'lead';
    var horaFmt = dataAg.toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit',
    });

    var msg = '⏰ Em 30 minutos: agendamento com ' + nomeLead + ' às ' + horaFmt;

    /* Toast visual imediato — 6s de duração pra dar tempo de ler */
    if (typeof Toast !== 'undefined') {
      Toast.show(msg, 'warning');
    }

    /* Persiste no sino (via store) */
    if (typeof store !== 'undefined' && store.adicionarNotificacao) {
      store.adicionarNotificacao(msg);
      if (typeof NotifController !== 'undefined' && NotifController.atualizar) {
        NotifController.atualizar();
      }
    }

    SLog.info('NotifAgend: alertado agendamento ' +
              (agendamento._uuid || '?') + ' — ' + nomeLead + ' às ' + horaFmt);
  }

  /* ────────────────────────────────────────────────────
     Helper — id do usuário logado
     ──────────────────────────────────────────────────── */
  static _userIdAtual() {
    return (typeof AuthService !== 'undefined' &&
            AuthService.currentUser &&
            AuthService.currentUser.id) || null;
  }
}
