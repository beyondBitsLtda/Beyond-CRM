/* ============================================================
   BEYOND CRM — js/services/RealtimeService.js   v1.3
   Sincronização em tempo real via Supabase Realtime (feature 4.9).
   Beyond Bits Tecnologia © 2026

   Cobre RN-29: quando um usuário cria/edita/movimenta um card,
   TODOS os outros usuários conectados veem a mudança automaticamente
   sem precisar recarregar a página.

   ARQUITETURA:
   - Assina 6 canais (leads, ligacoes, agendamentos, visitas, vendas,
     notifications) via postgres_changes com event = '*'.
   - Debounce de 500ms por tabela evita reload excessivo quando vários
     eventos chegam próximos (ex.: import em lote).
   - Ao receber evento, recarrega SOMENTE a tabela afetada e chama
     re-render seletivo dos componentes visíveis.
   - Segurança: RLS do Postgres é respeitado automaticamente pelo
     Realtime — cada usuário só recebe eventos das linhas que
     conseguiria ler via SELECT normal.

   ESCOPO (decisão do arquiteto):
   - Todos os perfis recebem realtime (opção A da definição de escopo).
   - Se a carga do Supabase ficar alta, é fácil restringir depois
     via checagem em iniciar() (return early conforme perfil).

   USO:
     RealtimeService.iniciar();  // chamado no app.js após bootstrap
     RealtimeService.parar();    // chamado no logout
     RealtimeService.estatisticas();  // debug

   Histórico:
   - v1.0: implementação base — assina canais, debounce, re-render.
   - v1.1 (REALTIME-FIX-2 / Pacote 2.1):
     resolve o bug do "canais joined mas eventos: 0". Causa raiz:
     supa.realtime.setAuth(access_token) NUNCA era chamado. Sem
     isso, o servidor Realtime não sabia o JWT do usuário e o RLS
     de SELECT bloqueava silenciosamente todos os eventos que
     deveriam chegar (canal ficava com SUBSCRIBED mas nada emitido).
     Agora iniciar() é async: busca a sessão, chama setAuth ANTES
     de assinar os canais, e re-aplica setAuth em TOKEN_REFRESHED
     pra evitar que o auth expire silenciosamente durante sessões
     longas. Também adiciona telemetria de eventos por tipo
     (INSERT/UPDATE/DELETE) e log verboso opcional pra debug.
   - v1.2 (Sprint 6 / Patch 2 — ticket 6.5):
     • Canal 'notifications' agora entra na lista de tabelas assinadas
       (antes só existia comentário TODO). Reloader: SupabaseSync.
       carregarNotificacoes(). Isso faz o badge do sino subir sem F5
       quando um agendamento cria notificação para gestores (RN-04).
     • Bug latente corrigido em _reRenderVisiveis: chamava
       AgendaModule.render() (método inexistente); agora chama
       AgendaModule.renderFull() e AgendaModule.renderDashboard()
       — ambos são idempotentes e checam existência dos containers.
   - v1.3 (Onda 2 pós-testes — Ticket #8):
     • Canal 'curriculos' entra na lista. Combina com carregarCurriculos
       novo do SupabaseSync v1.7.
     • _reRenderVisiveis chama CurriculoModule.render() (idempotente —
       o próprio módulo checa existência do grid).
   ============================================================ */
'use strict';

class RealtimeService {

  /* ── Estado ── */
  static _canais       = [];        /* canais ativos do Supabase */
  static _debounceMap  = new Map(); /* timers de debounce por tabela */
  static _toastTimer   = null;      /* debounce do toast informativo */
  static _authListener = null;      /* v1.1 — listener de TOKEN_REFRESHED */
  static _stats        = {
    conectado:  false,
    eventos:    0,
    reloads:    0,
    iniciadoEm: null,
    porTabela:  {},               /* v1.1 — contagem por tabela p/ debug */
  };

  /* ── Configuração ── */
  static _DEBOUNCE_MS = 500;   /* agrupa eventos próximos (1 reload por tabela por 500ms) */
  static _TOAST_MS    = 4000;  /* mostra toast "atualizando" no máx a cada 4s */
  static _VERBOSE     = false; /* v1.1 — set true no console pra ver cada evento no log */

  /* ────────────────────────────────────────────────────
     iniciar — cria assinaturas nas 6 tabelas críticas.
     Idempotente: chamar 2x não duplica canais.
     v1.1 — agora é ASYNC porque precisa buscar a sessão
     e chamar setAuth() ANTES de assinar os canais.
     ──────────────────────────────────────────────────── */
  static async iniciar() {
    if (RealtimeService._canais.length > 0) {
      SLog.warn('RT: já rodando — ignorando iniciar()');
      return;
    }
    if (typeof supa === 'undefined' || !supa) {
      SLog.warn('RT: Supabase indisponível');
      return;
    }
    if (!AuthService.currentUser) {
      SLog.warn('RT: usuário não autenticado');
      return;
    }

    SLog.load('RT: iniciando assinaturas...');

    /* ─── v1.1 (REALTIME-FIX-2) — Autentica o Realtime ─────────
       ESSENCIAL: sem setAuth(), os canais até conectam com
       status SUBSCRIBED, mas o servidor Realtime não sabe o
       JWT do usuário. Resultado: RLS de SELECT bloqueia todos
       os eventos silenciosamente e o cliente fica na mão.

       Precisa acontecer ANTES de assinar os canais (senão o
       servidor "cadastra" o canal com auth vazio e ignora os
       eventos até o próximo reconnect). */
    try {
      var sessRes = await supa.auth.getSession();
      var session = sessRes && sessRes.data && sessRes.data.session;
      var token   = session && session.access_token;

      if (!token) {
        SLog.error('RT: sessão sem access_token — Realtime não vai receber eventos');
        return;
      }

      supa.realtime.setAuth(token);
      SLog.info('RT: setAuth aplicado no canal Realtime ✓');
    } catch (err) {
      SLog.error('RT: falha ao aplicar setAuth — ' + err.message);
      return;
    }

    /* ─── v1.1 — Renova o auth automaticamente quando o
       Supabase refresha o token (a cada ~1h por padrão).
       Sem isso, o Realtime começa a bloquear eventos após
       a expiração do JWT, silenciosamente. */
    if (!RealtimeService._authListener) {
      try {
        var sub = supa.auth.onAuthStateChange(function(event, session) {
          if (event === 'TOKEN_REFRESHED' && session && session.access_token) {
            try {
              supa.realtime.setAuth(session.access_token);
              SLog.info('RT: token renovado ✓');
            } catch (e) {
              SLog.warn('RT: falha ao renovar token — ' + e.message);
            }
          }
        });
        RealtimeService._authListener = sub && sub.data ? sub.data.subscription : null;
      } catch (e) {
        SLog.warn('RT: não foi possível registrar listener de refresh — ' + e.message);
      }
    }

    var tabelas = [
      { nome: 'leads',         reload: function() { return SupabaseSync.carregarLeads();        } },
      { nome: 'ligacoes',      reload: function() { return SupabaseSync.carregarLigacoes();     } },
      { nome: 'agendamentos',  reload: function() { return SupabaseSync.carregarAgendamentos(); } },
      { nome: 'visitas',       reload: function() { return SupabaseSync.carregarVisitas();      } },
      { nome: 'vendas',        reload: function() { return SupabaseSync.carregarVendas();       } },
      /* v1.2 (Sprint 6 / Patch 2 — ticket 6.5) — canal de notificações.
         O RLS de notifications já filtra por destinatario_id, então cada
         usuário recebe SOMENTE eventos das suas próprias notificações.
         Após reload, _reRenderVisiveis chama NotifController.atualizar()
         atualizando o badge sem F5. */
      { nome: 'notifications', reload: function() { return SupabaseSync.carregarNotificacoes(); } },
      /* v1.3 (Onda 2 pós-testes — Ticket #8) — canal de currículos.
         Faltava escuta desta tabela; combinado com o carregarCurriculos
         novo (SupabaseSync v1.7), permite atualização em tempo real
         entre sessões e refresh do badge sem F5. */
      { nome: 'curriculos',    reload: function() { return SupabaseSync.carregarCurriculos();   } },
    ];

    tabelas.forEach(function(t) {
      RealtimeService._stats.porTabela[t.nome] = 0;
      var canal = supa
        .channel('rt-' + t.nome)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: t.nome },
          function(payload) {
            RealtimeService._onEvent(t.nome, payload, t.reload);
          }
        )
        .subscribe(function(status) {
          if (status === 'SUBSCRIBED') {
            SLog.info('RT canal ' + t.nome + ' conectado ✓');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            SLog.error('RT canal ' + t.nome + ': ' + status);
          }
        });
      RealtimeService._canais.push(canal);
    });

    RealtimeService._stats.conectado  = true;
    RealtimeService._stats.iniciadoEm = new Date();
    SLog.info('RT: ' + RealtimeService._canais.length + ' canal(is) iniciado(s)');
  }

  /* ────────────────────────────────────────────────────
     _onEvent — dispara reload da tabela afetada com debounce.
     v1.1 — adiciona telemetria por tabela e log verboso.
     ──────────────────────────────────────────────────── */
  static _onEvent(tabela, payload, reloadFn) {
    RealtimeService._stats.eventos++;
    RealtimeService._stats.porTabela[tabela] = (RealtimeService._stats.porTabela[tabela] || 0) + 1;

    if (RealtimeService._VERBOSE) {
      /* Log verboso opcional — set RealtimeService._VERBOSE = true no
         console pra ativar. Útil pra ver o payload cru dos eventos. */
      console.log('[RT verbose]', tabela, payload.eventType, payload);
    }
    SLog.info('RT evento (' + tabela + ' / ' + payload.eventType + ') recebido');

    /* Debounce: se um novo evento chega antes do timer disparar,
       o timer é resetado. Assim, evita 10 reloads em 1 segundo. */
    if (RealtimeService._debounceMap.has(tabela)) {
      clearTimeout(RealtimeService._debounceMap.get(tabela));
    }

    var timer = setTimeout(async function() {
      RealtimeService._debounceMap.delete(tabela);
      try {
        SLog.load('RT recarregando ' + tabela + '...');
        await reloadFn();
        RealtimeService._stats.reloads++;
        RealtimeService._reRenderVisiveis();
        RealtimeService._toastInformativo();
      } catch (err) {
        SLog.error('RT reload ' + tabela + ': ' + err.message);
      }
    }, RealtimeService._DEBOUNCE_MS);

    RealtimeService._debounceMap.set(tabela, timer);
  }

  /* ────────────────────────────────────────────────────
     _reRenderVisiveis — re-renderiza os componentes das
     páginas que estão visíveis no momento.
     ──────────────────────────────────────────────────── */
  static _reRenderVisiveis() {
    if (typeof FunilModule !== 'undefined') {
      FunilModule.renderKanban       && FunilModule.renderKanban();
      FunilModule.renderFunilPreview && FunilModule.renderFunilPreview();
      /* Chamado #102 — pula o fallback local aqui: evita o Número Mágico
         "piscar" entre o valor local (cache, pode estar desatualizado) e
         o valor da RPC toda vez que o Realtime dispara um re-render
         (o que acontece a cada evento de QUALQUER usuário da empresa). */
      FunilModule.renderNumeroMagico && FunilModule.renderNumeroMagico({ pularFallbackLocal: true });
      FunilModule.atualizarKPIs      && FunilModule.atualizarKPIs();
    }
    if (typeof HistoricoModule !== 'undefined' && HistoricoModule.reRender) {
      HistoricoModule.reRender();
    }
    /* v1.2 — corrigido: antes chamava AgendaModule.render() (inexistente).
       Agora chama os dois entry-points reais; cada um checa a existência
       do container antes de fazer qualquer coisa, então é seguro chamar
       mesmo quando a página correspondente não está visível. */
    if (typeof AgendaModule !== 'undefined') {
      if (AgendaModule.renderFull)      AgendaModule.renderFull();
      if (AgendaModule.renderDashboard) AgendaModule.renderDashboard();
    }
    if (typeof NotifController !== 'undefined' && NotifController.atualizar) {
      NotifController.atualizar();
    }
    /* v1.3 (Onda 2 pós-testes — Ticket #8) — re-render dos currículos
       quando a página está visível. O próprio CurriculoModule.render
       checa se o grid existe antes de renderizar, e SEMPRE atualiza
       o badge da sidebar (independente da página ativa). */
    if (typeof CurriculoModule !== 'undefined' && CurriculoModule.render) {
      CurriculoModule.render();
    }
  }

  /* ────────────────────────────────────────────────────
     _toastInformativo — feedback visual leve pro usuário
     saber que dados vieram de fora. Debounce próprio de 4s
     pra não spammar em rajadas.
     ──────────────────────────────────────────────────── */
  static _toastInformativo() {
    if (RealtimeService._toastTimer) return; /* já tem um pendente */
    if (typeof Toast === 'undefined') return;

    Toast.show('🔄 Alterações recebidas em tempo real.', 'info');
    RealtimeService._toastTimer = setTimeout(function() {
      RealtimeService._toastTimer = null;
    }, RealtimeService._TOAST_MS);
  }

  /* ────────────────────────────────────────────────────
     parar — desconecta todos os canais.
     Chamado no logout.
     ──────────────────────────────────────────────────── */
  static parar() {
    if (!RealtimeService._canais.length) return;

    RealtimeService._canais.forEach(function(c) {
      try { supa.removeChannel(c); } catch (e) {
        SLog.warn('RT: erro ao remover canal — ' + e.message);
      }
    });
    RealtimeService._canais = [];

    RealtimeService._debounceMap.forEach(function(timer) { clearTimeout(timer); });
    RealtimeService._debounceMap.clear();

    if (RealtimeService._toastTimer) {
      clearTimeout(RealtimeService._toastTimer);
      RealtimeService._toastTimer = null;
    }

    /* v1.1 — remove listener de refresh de token */
    if (RealtimeService._authListener) {
      try { RealtimeService._authListener.unsubscribe(); } catch (e) { /* silent */ }
      RealtimeService._authListener = null;
    }

    RealtimeService._stats.conectado = false;
    RealtimeService._stats.porTabela = {};
    SLog.info('RT: todos os canais desconectados');
  }

  /* ────────────────────────────────────────────────────
     estatisticas — retorna resumo pra debug/console.
     ──────────────────────────────────────────────────── */
  static estatisticas() {
    return {
      conectado:  RealtimeService._stats.conectado,
      canais:     RealtimeService._canais.length,
      eventos:    RealtimeService._stats.eventos,
      reloads:    RealtimeService._stats.reloads,
      porTabela:  Object.assign({}, RealtimeService._stats.porTabela),
      iniciadoEm: RealtimeService._stats.iniciadoEm,
      uptimeSeg:  RealtimeService._stats.iniciadoEm
        ? Math.round((Date.now() - RealtimeService._stats.iniciadoEm.getTime()) / 1000)
        : 0,
    };
  }
}
