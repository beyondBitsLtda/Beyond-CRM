/* ============================================================
   BEYOND CRM — js/modules/Modules.js   v2.7
   Atividade, Histórico, Agenda, Relatórios, Currículos, Usuários
   Beyond Bits Tecnologia © 2026

   Histórico recente:
   - v2.7 (Chamado #51 / #34 — Metas por valor de mensalidade):
     Cada degrau (Meta, Super, Power, King) passa a poder ser
     atingido por DOIS caminhos: quantidade de vendas OU valor de
     mensalidade acumulada no ciclo. Antes só a quantidade contava.
       • renderMinhaPerformance: `bateuX` agora é OR entre
         (qtdVendas >= meta_X_vendas) e (somaMensal >= meta_X_mensalidade).
         Guarda inicial relaxada (aceita usuário só com meta por valor).
         Badges dos degraus e linha "faltam X" mostram os dois caminhos.
         Histórico dos 3 meses recalculado com a mesma regra OR.
       • _metasVigentes: versiona também os 3 novos campos de valor.
       • UsuarioModule.salvar / editar: lê, persiste (profiles +
         meta_versoes) e pré-preenche os 3 campos de valor.
       • Depende da migração migracao_51_metas_por_valor.sql (novas
         colunas meta_super/power/king_mensalidade em profiles e
         meta_versoes) e do patch de AuthService.criarUsuario /
         SupabaseSync.
   - v2.6 (Chamados #48 / #52 — Tooltips do Relatório):
     Inclui textos de ajuda (tooltips nativos via atributo `title`)
     nos campos do painel de Relatórios pedidos pelo cliente:
       • Card "Conversão por Etapa" — explica o que a lista e a
         coluna de conversão representam e onde ver a perda de leads.
       • Card "Saúde do Funil" — explica o score 0–100, as faixas de
         cor (Saudável / Atenção / Crítico) e os três fatores.
       • As três barrinhas abaixo do score (Conversão, Efic.
         Ligações, Metas atingidas) — cada uma ganha o seu tooltip
         com o significado e o peso no cálculo do score.
     Implementação por `title` nativo + ícone bi-info-circle, mesmo
     padrão já usado no KanbanCard (sem lib externa). `_miniBar` ganha
     um 4º parâmetro opcional `help` — os demais chamadores seguem
     funcionando sem mudança.
   - v2.4 (Sprint 6 / Hotfix rodada 2): pipeline reestruturado.
   - v2.5 (Sprint 6 / Hotfix rodada 3):
     Pistas do log da rodada anterior mostraram DOIS problemas
     distintos:

     PROBLEMA A — Filtro por semana quebrado:
       Log mostrou `total=4 offset=1` (semana 20-26 tinha 4 events
       do banco na semana 13-19). Isso significa que _getBaseSemana
       NÃO estava filtrando por range de data corretamente OU o
       inicioSemana chegou errado.
       Fix: log adicional lista as datas ISO dos agendamentos +
       inicioSemana/fim usados no comparativo. Também garante que
       inicioSemana é Date válido (defesa).

     PROBLEMA B — Cards não renderizam apesar de "eventos recebidos=4":
       Log mostrou `renderGCalCom: eventos recebidos=4` mas grade
       vazia. Isso significa que $col.length === 0 no forEach
       (elemento não encontrado no DOM) OU evtsDia foi zerado
       antes do append.
       Fix: usar $wrap.find() ao invés de $() global (scope local).
       Adiciona atributo data-di redundante no HTML pra permitir
       seleção alternativa. Log por dia mostra $col found e evtsDia.

     Ambas as correções são não-destrutivas — se a hipótese estiver
     errada, apenas ganhamos mais logs. Se estiver certa, resolve.
   ============================================================ */
'use strict';

/* ============================================================  AtividadeModule */
class AtividadeModule {
  static adicionar(icon, nome, det, extra, bg, color, tipo) {
    store.adicionarAtividade(icon, nome, det, extra, bg, color, tipo);
    AtividadeModule.renderFeed();
    HistoricoModule.render();
  }
  static renderFeed() {
    const $c = $('#atividades-feed');
    if (!$c.length) return;
    /* RF-06 do DRS: feed cronológico com horário, nome do lead e especialista.
       Limite fixo em 8 (mais antigo fica no histórico completo). */
    const items = store.atividades.slice(0, 8);
    if (!items.length) { $c.html('<div class="empty-msg">Nenhuma atividade.</div>'); return; }
    $c.html(items.map(a => {
      const partes = (a.det || '').split('•');
      const titulo = (partes[0] || '').trim();
      const detalhe = partes.slice(1).join('•').trim();
      /* Especialista: usa a.esp (populado pelo SupabaseSync a partir de especialista_id) */
      const esp = a.esp ? '<span class="ativ-esp" style="font-size:11px;color:var(--d-txt-6b7280);margin-left:6px;"><i class="bi bi-person-circle"></i> ' + Utils.escHtml(a.esp) + '</span>' : '';
      return `<div class="ativ-item">
        <div class="ativ-dot" style="background:${a.color};"></div>
        <div class="ativ-body flex-grow-1">
          <div class="ativ-nome">${Utils.escHtml(a.nome)} <span class="text-muted">— ${Utils.escHtml(titulo)}</span>${esp}</div>
          <div class="ativ-desc text-muted">${Utils.escHtml(detalhe)}</div>
        </div>
        <div class="ativ-hora">${a.hora}</div>
      </div>`;
    }).join(''));
  }
}

/* ============================================================  HistoricoModule */
class HistoricoModule {

  /* ============================================================
     v2.1 (Sprint 6 / Patch 1 — ticket 6.4) — Filtros avançados
     ============================================================
     Composição de filtros aplicados em ordem:
       1) Filtro por tipo (botões inline data-target="historico") — antigo.
       2) Filtro por código do card (input #hist-filtro-codigo)     — antigo.
       3) Filtros do drawer (novo, via FiltroAvancadoComponent):
            - período (daterange sobre _data_hora)
            - especialista (multi-select sobre _esp_id)
            - resultado (multi-select sobre `resultado` — só ligações)
            - filial (multi-select sobre filial derivada do _esp_id;
                      visível apenas para gerente/supervisor)
     Persistência dos filtros do drawer: localStorage sob
     `beyond-filtros-historico` — padrão do sistema (Funil/Dashboard).
     ============================================================ */

  /* ============================================================
     Chamado #104 — Histórico buscando direto do banco, paginado
     ============================================================
     Antes, a lista vinha de store.ligacoes (capado nas 200 mais
     recentes DA EMPRESA INTEIRA — mesma causa-raiz do #83) e
     store.atividades (capado em 50, também da empresa inteira),
     e ainda cortava o resultado final em 40 itens sem paginação.
     Resultado: o histórico de um usuário específico (ex.: Melissa)
     mostrava um pedaço truncado e incompleto, divergindo do KPI
     "Ligações" do dashboard (que já vem direto do banco via RPC,
     desde o #83) — e não dava pra ver o histórico completo desde
     o início do uso, como o cliente pediu.

     Fix: HistoricoModule agora busca as páginas direto do Supabase,
     já com os filtros aplicados no WHERE (não mais filtrando um
     array pré-carregado e truncado):
       - Ligações → RPC listar_ligacoes_completo (irmã da
         contar_ligacoes_totais do #83 — MESMO WHERE, incluindo o
         recorte de carteira e a exclusão de leads excluídos —
         então lista e contagem nunca mais divergem).
       - Demais tipos (agendamento/visita/venda/carteira) → query
         direta na tabela `atividades`, paginada via .range().
     "Carregar mais" busca a próxima página de cada fonte ativa e
     acrescenta à lista (nunca reordena o que já foi mostrado),
     permitindo rolar até o início do uso do usuário.
     ============================================================ */
  static PAGE_SIZE = 40;

  /* Estado da paginação atual — resetado a cada render() novo
     (troca de tipo/código/filtro), acrescentado por carregarMais(). */
  static _pag = {
    tipo: 'todas', codigo: '',
    offsetLig: 0, offsetAtiv: 0,
    temMaisLig: true, temMaisAtiv: true,
    itens: [], carregando: false,
  };

  /* Instância do componente — populada por _montarFiltroAvancado. */
  static _filtroAvancado = null;

  /* ────────────────────────────────────────────────────────────
     Monta o FiltroAvancadoComponent com campos declarativos.
     Deve ser chamado uma vez no init da app (app.js expõe via
     HistoricoModule.inicializarFiltros()).
     ──────────────────────────────────────────────────────────── */
  static inicializarFiltros() {
    if (typeof FiltroAvancadoComponent === 'undefined') {
      SLog.warn('HistoricoModule: FiltroAvancadoComponent indisponível');
      return;
    }
    if (HistoricoModule._filtroAvancado) return; /* idempotente */

    var perfilAtual = (typeof AuthService !== 'undefined' &&
                       AuthService.currentProfile &&
                       AuthService.currentProfile.perfil) || '';
    var _ehGerente = (perfilAtual === 'gerente');

    /* Campos base — sempre visíveis */
    var campos = [
      {
        tipo: 'daterange',
        id: 'periodo',
        label: 'Período',
        /* Consumido via getValor (_data_hora está na atividade e na ligação) */
        getValor: function(item) { return item._data_hora || null; },
      },
    ];

    /* ── Chamado #54 — Campo "Usuário" só faz sentido para o GERENTE ──
       Como especialista e supervisor agora só enxergam o próprio
       histórico (recorte em HistoricoModule.render), oferecer um seletor
       de "outro usuário" seria inútil e confuso. Então o campo de
       Usuário e o de Filial passam a existir SOMENTE para gerente.
       (Antes: Usuário era sempre visível; Filial era gerente+supervisor.)
       Regra travada por perfil — não há como o front listar terceiros
       para quem não é gerente. */
    if (_ehGerente) {
      campos.push({
        tipo: 'multi-select',
        id: 'especialistas',
        /* Onda 6 (#27) — inclui supervisores e gerentes além de
           especialistas (todos geram atividades). Label "Usuário".
           Mantido o id 'especialistas' por compat com o localStorage. */
        label: 'Usuário',
        getValor: function(item) { return item._esp_id || null; },
        opcoesFn: function() {
          var PERFIL_LABEL = {
            'especialista': 'Especialista',
            'supervisor':   'Supervisor',
            'gerente':      'Gerente',
          };
          return (store.usuarios || [])
            .filter(function(u) { return u.status !== 'inativo'; })
            .slice()
            .sort(function(a, b) {
              /* Ordena por perfil (gerente > supervisor > especialista)
                 e depois por nome — bloco visualmente coerente. */
              var ordemPerfil = { gerente: 0, supervisor: 1, especialista: 2 };
              var pa = ordemPerfil[a.perfil] != null ? ordemPerfil[a.perfil] : 3;
              var pb = ordemPerfil[b.perfil] != null ? ordemPerfil[b.perfil] : 3;
              if (pa !== pb) return pa - pb;
              return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
            })
            .map(function(u) {
              var perfilTag = PERFIL_LABEL[u.perfil] || u.perfil || '';
              return {
                val: u._id,
                label: u.nome + (perfilTag ? ' (' + perfilTag + ')' : ''),
              };
            });
        },
      });
    }

    campos.push({
      tipo: 'multi-select',
      id: 'resultados',
      label: 'Resultado (ligações)',
      getValor: function(item) { return item.resultado || null; },
      opcoesFn: function() {
        /* Deriva de store.ligacoes — resultados reais que aparecem no banco. */
        var s = new Set();
        (store.ligacoes || []).forEach(function(l) {
          if (l.resultado && String(l.resultado).trim()) {
            s.add(String(l.resultado).trim());
          }
        });
        return Array.from(s).sort();
      },
    });

    /* Campo "Filial" — Chamado #54: agora só para gerente
       (antes era gerente+supervisor; supervisor perdeu porque só vê o
       próprio histórico, então filtrar por filial não teria efeito). */
    if (_ehGerente) {
      campos.push({
        tipo: 'multi-select',
        id: 'filiais',
        label: 'Filial',
        /* Deriva filial do especialista via lookup em store.usuarios */
        getValor: function(item) {
          if (!item._esp_id) return null;
          var u = (store.usuarios || []).find(function(x) { return x._id === item._esp_id; });
          return u ? u._filial_id : null;
        },
        opcoesFn: function() {
          return (store.filiais || []).map(function(f) {
            return { val: f.id, label: f.nome };
          });
        },
      });
    }

    HistoricoModule._filtroAvancado = new FiltroAvancadoComponent({
      key:        'historico',
      storageKey: 'beyond-filtros-historico',
      container:  '#filtro-historico-body',
      drawerId:   'filtro-historico-drawer',
      onChange:   function() {
        HistoricoModule.reRender();
        HistoricoModule._atualizarBadgeFiltro();
      },
      campos: campos,
    });

    HistoricoModule._filtroAvancado.montar();
    HistoricoModule._atualizarBadgeFiltro();
  }

  /* Abre o drawer — invocado pelo botão "Filtros" no index.html. */
  static abrirFiltroAvancado() {
    if (!HistoricoModule._filtroAvancado) HistoricoModule.inicializarFiltros();
    if (!HistoricoModule._filtroAvancado) return;
    HistoricoModule._filtroAvancado.montar();
    HistoricoModule._filtroAvancado.abrir();
  }
  static aplicarFiltroAvancado() {
    if (HistoricoModule._filtroAvancado) HistoricoModule._filtroAvancado.aplicar();
    HistoricoModule._atualizarBadgeFiltro();
  }
  static limparFiltroAvancado() {
    if (HistoricoModule._filtroAvancado) HistoricoModule._filtroAvancado.limpar();
    HistoricoModule._atualizarBadgeFiltro();
  }
  static fecharFiltroAvancado() {
    if (HistoricoModule._filtroAvancado) HistoricoModule._filtroAvancado.fechar();
  }

  static _atualizarBadgeFiltro() {
    var $b = $('#btn-filtro-historico-count');
    if (!$b.length || !HistoricoModule._filtroAvancado) return;
    var n = HistoricoModule._filtroAvancado.contarAtivos();
    if (n > 0) { $b.text(n).show(); } else { $b.hide(); }
  }

  /* ────────────────────────────────────────────────────────────
     Render principal — (re)inicia a paginação do zero e busca a
     primeira página.
     filtro — 'todas' | 'ligacao' | 'agendamento' | 'visita' | 'venda' | 'carteira'
     codigo — string opcional (código do lead ou parte dele)
     ──────────────────────────────────────────────────────────── */
  static render(filtro, codigo) {
    const $list = $('#historico-list');
    if (!$list.length) return;

    HistoricoModule._pag = {
      tipo: filtro || 'todas',
      codigo: (codigo || '').trim(),
      offsetLig: 0, offsetAtiv: 0,
      temMaisLig: true, temMaisAtiv: true,
      totalLig: 0, totalAtiv: 0,
      itens: [], carregando: false, _erroLig: null,
    };

    /* Feedback imediato — a busca é assíncrona agora (vai no banco). */
    $list.html('<div class="empty-state"><div class="empty-icon"><i class="bi bi-arrow-repeat spin-icon"></i></div><p>Carregando histórico...</p></div>');

    HistoricoModule._carregarPagina();
  }

  /* Re-renderiza aplicando os filtros vigentes lidos do DOM.
     Chamado por: listener do input de código, botões de tipo, e onChange
     do drawer. */
  static reRender() {
    var filtroAtivo = $('.filtros[data-target="historico"] .filtro-btn.active').data('filter') || 'todas';
    var codigo = ($('#hist-filtro-codigo').val() || '').trim();
    HistoricoModule.render(filtroAtivo, codigo);
  }

  /* Botão "Carregar mais" — busca a página seguinte e ACRESCENTA
     (nunca reordena o que já está na tela). */
  static carregarMais() {
    if (HistoricoModule._pag.carregando) return;
    HistoricoModule._carregarPagina();
  }

  /* ────────────────────────────────────────────────────────────
     Busca uma página (ligações via RPC + atividades via query direta,
     conforme o tipo ativo) e acrescenta ao acumulado.
     ──────────────────────────────────────────────────────────── */
  static async _carregarPagina() {
    var p = HistoricoModule._pag;
    if (p.carregando) return;
    p.carregando = true;
    HistoricoModule._atualizarRodape(true);
    HistoricoModule._atualizarTotalizador();

    var filtrosAv = (HistoricoModule._filtroAvancado && HistoricoModule._filtroAvancado.filtros) || {};

    /* "Relevante" = essa fonte faz parte do tipo selecionado (mesmo já
       tendo esgotado). Guardado em p pra _atualizarRodape saber qual
       temMais* olhar — senão a fonte que nunca é buscada (ex.: atividades
       quando tipo='ligacao') fica com o flag inicial (true) pra sempre e
       o "Carregar mais" nunca some. */
    p._ligRelevante  = (p.tipo === 'todas' || p.tipo === 'ligacao');
    p._ativRelevante = (p.tipo === 'todas' || p.tipo !== 'ligacao');
    /* "Resultado" só existe em ligações — com esse filtro ativo em
       'todas', nenhuma atividade bateria mesmo (comportamento já era
       esse antes, via FiltroAvancadoComponent.filtrar). Evita query
       inútil e também tira "atividades" da relevância do rodapé. */
    if (p.tipo === 'todas' && Array.isArray(filtrosAv.resultados) && filtrosAv.resultados.length) {
      p._ativRelevante = false;
    }

    var buscarLig  = p._ligRelevante  && p.temMaisLig;
    var buscarAtiv = p._ativRelevante && p.temMaisAtiv;

    var tarefas = [
      buscarLig  ? HistoricoModule._buscarLigacoes(p, filtrosAv)  : Promise.resolve([]),
      buscarAtiv ? HistoricoModule._buscarAtividades(p, filtrosAv) : Promise.resolve([]),
    ];

    var resultados;
    try {
      resultados = await Promise.all(tarefas);
    } catch (e) {
      SLog.error('HistoricoModule._carregarPagina: ' + e.message);
      Toast.show('Erro ao carregar histórico: ' + e.message, 'danger');
      p.carregando = false;
      HistoricoModule._atualizarRodape(false);
      HistoricoModule._atualizarTotalizador();
      return;
    }

    p.itens = p.itens.concat(resultados[0] || [], resultados[1] || []);
    /* Reordena o acumulado inteiro (nunca trunca) — mais recente primeiro. */
    p.itens.sort(function(a, b) { return (b._ts || 0) - (a._ts || 0); });

    p.carregando = false;
    HistoricoModule._renderLista();
    HistoricoModule._atualizarRodape(false);
    HistoricoModule._atualizarTotalizador();
  }

  /* Monta os parâmetros comuns da RPC a partir do perfil logado +
     filtros do drawer. Reaproveitado por _buscarLigacoes. */
  static _montarParamsLigacoes(codigo, filtrosAv) {
    var _prof = (typeof AuthService !== 'undefined') ? AuthService.currentProfile : null;

    var pUsers = null;
    if (_prof && _prof.perfil !== 'gerente') {
      /* Chamado #54 — não-gerente só vê o próprio histórico. */
      pUsers = _prof.id ? [_prof.id] : [];
    } else if (Array.isArray(filtrosAv.especialistas) && filtrosAv.especialistas.length) {
      pUsers = filtrosAv.especialistas;
    }

    var pIni = null, pFim = null;
    if (filtrosAv.periodo && (filtrosAv.periodo.de || filtrosAv.periodo.ate)) {
      if (filtrosAv.periodo.de)  pIni = new Date(filtrosAv.periodo.de  + 'T00:00:00').toISOString();
      if (filtrosAv.periodo.ate) pFim = new Date(filtrosAv.periodo.ate + 'T23:59:59').toISOString();
    }

    return {
      p_users:       pUsers,
      p_ini:         pIni,
      p_fim:         pFim,
      p_resultados:  (Array.isArray(filtrosAv.resultados) && filtrosAv.resultados.length) ? filtrosAv.resultados : null,
      p_filiais:     (Array.isArray(filtrosAv.filiais)    && filtrosAv.filiais.length)    ? filtrosAv.filiais    : null,
      p_lead_codigo: codigo ? codigo : null,
    };
  }

  /* Chamado #104 — busca uma página de ligações via RPC
     listar_ligacoes_completo (mesmo WHERE da contar_ligacoes_totais
     do #83 — lista e KPI nunca mais divergem). */
  static async _buscarLigacoes(p, filtrosAv) {
    if (typeof supa === 'undefined' || !supa) { p.temMaisLig = false; return []; }

    var params = HistoricoModule._montarParamsLigacoes(p.codigo, filtrosAv);
    if (Array.isArray(params.p_users) && !params.p_users.length) { p.temMaisLig = false; return []; }
    params.p_limit  = HistoricoModule.PAGE_SIZE;
    params.p_offset = p.offsetLig;

    var res = await supa.rpc('listar_ligacoes_completo', params);
    if (res.error) {
      SLog.error('listar_ligacoes_completo: ' + res.error.message);
      p.temMaisLig = false;
      /* Chamado #104 — antes esse erro só ia pro log e a tela mostrava
         "0" igual a uma busca sem resultado — indistinguível de "não
         tem dado". Se a RPC ainda não existe no banco (migração 025
         não rodada) ou algum outro erro acontece, avisa explicitamente
         em vez de fingir que deu zero. */
      p._erroLig = res.error.message || 'erro desconhecido';
      Toast.show('Erro ao buscar ligações do histórico: ' + p._erroLig, 'danger');
      return [];
    }
    p._erroLig = null;

    var rows = res.data || [];
    p.offsetLig += rows.length;
    var total = rows.length ? Number(rows[0].total_count) : 0;
    p.temMaisLig = p.offsetLig < total;
    p.totalLig = total;

    return rows.map(HistoricoModule._formatarLigacaoRPC);
  }

  static _formatarLigacaoRPC(row) {
    var dt = row.data_hora ? new Date(row.data_hora) : null;
    return {
      icon: '📞', bg: '#D1FAE5', color: '#059669',
      nome: row.lead_nome || '—',
      det:  'Ligação • ' + (row.resultado || '—') + ' • Tentativa #' + (row.tentativa_num || 0),
      hora: dt ? dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—',
      data: dt ? dt.toLocaleDateString('pt-BR').replace('/20', '/') : '—',
      esp:  row.especialista_nome || '—',
      tipo: 'ligacao',
      _lead_codigo: row.lead_codigo || '',
      _ts: dt ? dt.getTime() : 0,
    };
  }

  /* Chamado #104 — busca uma página de agendamento/visita/venda/
     carteira direto da tabela `atividades`, paginada. Resolve o
     mesmo recorte de visibilidade (#54) e os filtros do drawer que
     antes eram aplicados sobre o array pré-carregado. */
  static async _buscarAtividades(p, filtrosAv) {
    if (typeof supa === 'undefined' || !supa) { p.temMaisAtiv = false; return []; }

    var _prof = (typeof AuthService !== 'undefined') ? AuthService.currentProfile : null;

    var idsFiltro = null;
    if (_prof && _prof.perfil !== 'gerente') {
      idsFiltro = _prof.id ? [_prof.id] : [];
    } else if (Array.isArray(filtrosAv.especialistas) && filtrosAv.especialistas.length) {
      idsFiltro = filtrosAv.especialistas.slice();
    }

    if (Array.isArray(filtrosAv.filiais) && filtrosAv.filiais.length) {
      var idsFilial = (store.usuarios || [])
        .filter(function(u) { return filtrosAv.filiais.indexOf(u._filial_id) >= 0; })
        .map(function(u) { return u._id; });
      idsFiltro = idsFiltro ? idsFiltro.filter(function(id) { return idsFilial.indexOf(id) >= 0; }) : idsFilial;
    }

    if (idsFiltro && !idsFiltro.length) { p.temMaisAtiv = false; return []; }

    var query = supa.from('atividades').select('*', { count: 'exact' });
    if (p.tipo !== 'todas') query = query.eq('tipo', p.tipo);
    if (idsFiltro) query = query.in('especialista_id', idsFiltro);

    if (filtrosAv.periodo && (filtrosAv.periodo.de || filtrosAv.periodo.ate)) {
      if (filtrosAv.periodo.de)  query = query.gte('data_hora', filtrosAv.periodo.de  + 'T00:00:00');
      if (filtrosAv.periodo.ate) query = query.lte('data_hora', filtrosAv.periodo.ate + 'T23:59:59');
    }

    if (p.codigo) {
      var nomes = HistoricoModule._resolverNomesPorCodigo(p.codigo);
      if (!nomes.length) { p.temMaisAtiv = false; return []; }
      query = query.in('lead_nome', nomes);
    }

    query = query
      .order('data_hora', { ascending: false })
      .range(p.offsetAtiv, p.offsetAtiv + HistoricoModule.PAGE_SIZE - 1);

    var res = await query;
    if (res.error) {
      SLog.error('atividades (histórico #104): ' + res.error.message);
      p.temMaisAtiv = false;
      return [];
    }

    var rows = res.data || [];
    p.offsetAtiv += rows.length;
    var total = (typeof res.count === 'number') ? res.count : p.offsetAtiv;
    p.temMaisAtiv = p.offsetAtiv < total;
    p.totalAtiv = total;

    return rows.map(HistoricoModule._formatarAtividadeRaw);
  }

  static _formatarAtividadeRaw(a) {
    var dt = a.data_hora ? new Date(a.data_hora) : null;
    var u = (store.usuarios || []).find(function(x) { return x._id === a.especialista_id; });
    return {
      icon: a.icon || '', bg: a.bg || '', color: a.color || '',
      nome: a.lead_nome || '',
      det:  a.detalhes || '',
      hora: dt ? dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—',
      data: dt ? dt.toLocaleDateString('pt-BR').replace('/20', '/') : '—',
      esp:  u ? u.nome : '—',
      tipo: a.tipo,
      _esp_id: a.especialista_id,
      _ts: dt ? dt.getTime() : 0,
    };
  }

  /* Mesma lógica que já existia (código do lead → nomes candidatos),
     agora reaproveitada pela query de atividades (que só tem lead_nome,
     não o código, num campo próprio). */
  static _resolverNomesPorCodigo(codigo) {
    var codLower = codigo.trim().toLowerCase();
    var nomes = new Set();
    (store.leads || []).forEach(function(l) {
      if (!l.id) return;
      if (String(l.id).toLowerCase().indexOf(codLower) >= 0) nomes.add(l.nome);
    });
    return Array.from(nomes);
  }

  static _renderLista() {
    var $list = $('#historico-list');
    if (!$list.length) return;
    var p = HistoricoModule._pag;

    if (!p.itens.length) {
      $list.html('<div class="empty-state"><div class="empty-icon">📋</div><p>Nenhum registro encontrado</p></div>');
      return;
    }

    $list.html(p.itens.map(a => `
      <div class="hist-item">
        <div class="hist-icon" style="background:${a.bg};color:${a.color};">${a.icon}</div>
        <div class="hist-body flex-grow-1">
          <div class="hist-nome fw-semibold">${Utils.escHtml(a.nome)}</div>
          <div class="hist-det text-muted small">${Utils.escHtml(a.det)}</div>
        </div>
        <div class="hist-meta text-end small text-muted">
          <div class="fw-semibold">${a.hora}</div>
          <div>${a.data}</div>
          <div>${Utils.escHtml(a.esp)}</div>
        </div>
      </div>`).join(''));
  }

  /* Chamado #104 — totalizador no topo da aba, respeitando TODOS os
     filtros ativos (tipo, período, usuário, resultado, filial, código).
     Vem do total_count/count da própria busca (banco), não de quanto já
     foi carregado/paginado na tela — por isso fica certo mesmo antes de
     clicar em "Carregar mais". */
  static _atualizarTotalizador() {
    var $sub = $('#historico-total-sub');
    if (!$sub.length) return;
    var p = HistoricoModule._pag;

    if (p.carregando && !p.itens.length) { $sub.text(''); return; }

    /* Chamado #104 — se a busca de ligações deu erro (ex.: RPC
       listar_ligacoes_completo ainda não existe no banco), mostra isso
       explicitamente em vez de "Total: 0" — que pareceria "sem dados". */
    if (p._ligRelevante && p._erroLig) {
      $sub.html('<span style="color:var(--d-txt-dc2626);"><i class="bi bi-exclamation-triangle-fill"></i> Erro ao buscar ligações — rode as migrações 024/025 no banco (veja o console/Toast)</span>');
      return;
    }

    var total = (p._ligRelevante ? (p.totalLig || 0) : 0) + (p._ativRelevante ? (p.totalAtiv || 0) : 0);
    var rotuloTipo = {
      todas: 'registro(s)', ligacao: 'ligação(ões)', agendamento: 'agendamento(s)',
      visita: 'visita(s)', venda: 'venda(s)', carteira: 'entrada(s) na carteira',
    }[p.tipo] || 'registro(s)';

    $sub.text('Total: ' + total.toLocaleString('pt-BR') + ' ' + rotuloTipo + ' com os filtros atuais');
  }

  /* Rodapé — contador + botão "Carregar mais" (some quando as fontes
     ativas já esgotaram). */
  static _atualizarRodape(carregando) {
    var $rod = $('#historico-rodape');
    if (!$rod.length) return;
    var p = HistoricoModule._pag;
    var temMais = (p._ligRelevante && p.temMaisLig) || (p._ativRelevante && p.temMaisAtiv);

    var texto = p.itens.length === 1 ? '1 carregado nesta tela' : (p.itens.length + ' carregados nesta tela');
    var html = '<span class="text-muted small">' + texto + '</span>';

    if (carregando) {
      html += ' <button class="btn-beyond btn-secondary-amp btn-sm-amp" disabled><i class="bi bi-arrow-repeat spin-icon"></i> Carregando...</button>';
    } else if (temMais) {
      html += ' <button class="btn-beyond btn-secondary-amp btn-sm-amp" onclick="HistoricoModule.carregarMais()"><i class="bi bi-arrow-down-circle"></i> Carregar mais</button>';
    } else if (p.itens.length > 0) {
      html += ' <span class="text-muted small">— início do histórico</span>';
    }

    $rod.html(html);
  }
}

/* ============================================================  AgendaModule */
class AgendaModule {

  /* ---- CONFIG ---- */
  static _offset    = 0;   // semanas relativas a hoje
  static _view      = 'semana';
  static _HORAS_INI = 8;   // 08:00 (v2.2 — DRS)
  static _HORAS_FIM = 20;  // 20:00 (exclusive) (v2.2 — DRS)
  static _PX_HORA   = 48;  // altura de cada hora em px

  /* Paleta de cores por índice de especialista */
  static _COR_ESP   = ['gcal-ev-0','gcal-ev-1','gcal-ev-2','gcal-ev-3','gcal-ev-4'];

  /* Mapeamento sigla → { nome, cor } — v2.2: populado de store.usuarios
     pra garantir consistência de cor por especialista (mesma pessoa,
     mesma cor sempre — o índice dela em store.usuarios % 5). */
  static _ESP_MAP = {};

  /* Mapeamento _esp_id (UUID) → { sigla, nome, cor } — v2.2, resolve
     eventos vindos de store.agendamentos que carregam _esp_id direto. */
  static _ESP_BY_ID = {};

  /* Carrega o mapa de especialistas a partir de store.usuarios.
     Idempotente e barato — pode ser chamado no início de cada render.

     Chamado "Filtros da Agenda" — inclui supervisor/gerente também
     (eles têm agendamento próprio, #74/#93/#98), não só especialista.
     Sem isso, um evento de supervisor/gerente na Agenda não achava
     entrada no mapa (sigla/cor ficavam sem correspondência). */
  static _carregarESPMap() {
    var byId = {};
    var bySigla = {};
    var especialistas = (store.usuarios || []).filter(function(u) {
      return u.perfil === 'especialista' || u.perfil === 'supervisor' || u.perfil === 'gerente';
    });
    especialistas.forEach(function(u, i) {
      var sigla = u.sigla ||
                  (u.nome ? u.nome.split(' ').map(function(x){return x[0];}).join('').slice(0,2).toUpperCase() : '??');
      var entry = { sigla: sigla, nome: u.nome || sigla, cor: i % 5 };
      if (u._id) byId[u._id] = entry;
      /* sigla pode colidir entre especialistas — a última vence, mas o
         path prioritário é o byId (mais preciso). */
      bySigla[sigla] = entry;
    });
    AgendaModule._ESP_MAP    = bySigla;
    AgendaModule._ESP_BY_ID  = byId;
  }

  /* ============================================================
     v2.1 (Sprint 6 / Patch 1 — ticket 6.2 / RF-37)
     Filtros avançados: período, especialista, filial
     ============================================================
     - Persistência em localStorage sob `beyond-filtros-agenda`.
     - Navegação semanal (setas, Hoje, Semana/Dia) preservada; os
       filtros apenas restringem quais eventos aparecem.
     - Aplicados em _getEventosStore antes da montagem da grade.
     - Filial só visível para gerente/supervisor (regra travada).
     ============================================================ */
  static _filtroAvancado = null;

  /* Monta o FiltroAvancadoComponent — chamado uma vez no init da app. */
  static inicializarFiltros() {
    if (typeof FiltroAvancadoComponent === 'undefined') {
      SLog.warn('AgendaModule: FiltroAvancadoComponent indisponível');
      return;
    }
    if (AgendaModule._filtroAvancado) return; /* idempotente */

    var campos = [
      {
        tipo: 'daterange',
        id: 'periodo',
        label: 'Período',
        /* Consumido via getValor — a.data é ISO string vinda do banco. */
        getValor: function(item) { return item && item.data ? item.data : null; },
      },
      {
        tipo: 'multi-select',
        id: 'especialistas',
        label: 'Especialista',
        /* v2.3 (BUG 003) — getValor explícito. Antes usávamos apenas
           campo.propriedade='_esp_id', mas em agendamentos legados o
           campo pode estar undefined em vez de null, e o multi-select
           do FiltroAvancadoComponent trata undefined como "não passa".
           Coerção para '' garante comparação previsível. */
        getValor: function(item) { return (item && item._esp_id) || ''; },
        /* Chamado "Filtros da Agenda" — 2 correções:
             1) faltava excluir usuários inativos (apareciam na lista);
             2) só incluía perfil='especialista', então supervisor e
                gerente ativos (que também têm agendamento próprio,
                #74) nunca apareciam pra selecionar — pareciam estar
                "faltando" mesmo estando ativos. */
        opcoesFn: function() {
          return (store.usuarios || [])
            .filter(function(u) { return u.status !== 'inativo'; })
            .filter(function(u) { return u.perfil === 'especialista' || u.perfil === 'supervisor' || u.perfil === 'gerente'; })
            .sort(function(a, b) { return (a.nome || '').localeCompare(b.nome || '', 'pt-BR'); })
            .map(function(u) { return { val: u._id, label: u.nome }; });
        },
      },
    ];

    /* Filial só para gerente/supervisor */
    var perfilAtual = (typeof AuthService !== 'undefined' &&
                       AuthService.currentProfile &&
                       AuthService.currentProfile.perfil) || '';
    if (perfilAtual === 'gerente' || perfilAtual === 'supervisor') {
      campos.push({
        tipo: 'multi-select',
        id: 'filiais',
        label: 'Filial',
        /* v2.3 (BUG 003) — idem: getValor explícito com coerção */
        getValor: function(item) { return (item && item._filial_id) || ''; },
        opcoesFn: function() {
          return (store.filiais || []).map(function(f) {
            return { val: f.id, label: f.nome };
          });
        },
      });
    }

    AgendaModule._filtroAvancado = new FiltroAvancadoComponent({
      key:        'agenda',
      storageKey: 'beyond-filtros-agenda',
      container:  '#filtro-agenda-body',
      drawerId:   'filtro-agenda-drawer',
      onChange:   function() {
        /* v2.4 — renderFull orquestra tudo (grade + dash + badges). */
        AgendaModule.renderFull();
        AgendaModule._atualizarBadgeFiltro();
      },
      campos: campos,
    });

    AgendaModule._filtroAvancado.montar();
    AgendaModule._atualizarBadgeFiltro();
  }

  static abrirFiltroAvancado() {
    if (!AgendaModule._filtroAvancado) AgendaModule.inicializarFiltros();
    if (!AgendaModule._filtroAvancado) return;
    AgendaModule._filtroAvancado.montar();
    AgendaModule._filtroAvancado.abrir();
  }
  static aplicarFiltroAvancado() {
    if (AgendaModule._filtroAvancado) AgendaModule._filtroAvancado.aplicar();
    AgendaModule._atualizarBadgeFiltro();
  }
  static limparFiltroAvancado() {
    if (AgendaModule._filtroAvancado) AgendaModule._filtroAvancado.limpar();
    AgendaModule._atualizarBadgeFiltro();
  }
  static fecharFiltroAvancado() {
    if (AgendaModule._filtroAvancado) AgendaModule._filtroAvancado.fechar();
  }

  static _atualizarBadgeFiltro() {
    var $b = $('#btn-filtro-agenda-count');
    if (!$b.length || !AgendaModule._filtroAvancado) return;
    var n = AgendaModule._filtroAvancado.contarAtivos();
    if (n > 0) { $b.text(n).show(); } else { $b.hide(); }
  }

  /* ---- ALGORITMO DE LAYOUT DE COLISÃO ---- */
  static _calcLayout(evts) {
    /* 
      Percorre os eventos ordenados por startMin.
      Mantém uma lista de "colunas ativas" — cada coluna guarda
      o endMin do último evento alocado nela.
      Ao alocar um evento, usa a primeira coluna livre (endMin <= startMin).
      Ao final de cada cluster, define totalCols = n° de colunas usadas.
    */
    if (!evts.length) return;

    const cols = []; // cols[i] = endMin do último evento na coluna i

    // 1ª passagem: alocar coluna a cada evento
    evts.forEach(ev => {
      let placed = false;
      for (let c = 0; c < cols.length; c++) {
        if (cols[c] <= ev.startMin) {
          ev._col = c;
          cols[c] = ev.endMin;
          placed = true;
          break;
        }
      }
      if (!placed) {
        ev._col = cols.length;
        cols.push(ev.endMin);
      }
    });

    // 2ª passagem: calcular totalCols por cluster (grupo de sobreposição)
    // Um cluster termina quando nenhum evento em andamento se sobrepõe ao próximo
    let clusterStart = 0;
    let maxEnd = evts[0].endMin;

    for (let i = 1; i <= evts.length; i++) {
      const novoCluster = i === evts.length || evts[i].startMin >= maxEnd;
      if (novoCluster) {
        // Descobrir quantas colunas foram usadas neste cluster
        const totalCols = Math.max(...evts.slice(clusterStart, i).map(e => e._col)) + 1;
        for (let j = clusterStart; j < i; j++) {
          evts[j]._totalCols = totalCols;
        }
        clusterStart = i;
        if (i < evts.length) maxEnd = evts[i].endMin;
      } else {
        if (evts[i].endMin > maxEnd) maxEnd = evts[i].endMin;
      }
    }
  }

  /* Eventos estáticos da grade (AGENDA_DATA → eventos reais) */
  static _getEventosEstaticos() {
    const eventos = [];
    const dias = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
    dias.forEach((dia, di) => {
      const dados = AGENDA_DATA[dia] || {};
      Object.entries(dados).forEach(([hora, siglas]) => {
        const [hh] = hora.split(':').map(Number);
        siglas.forEach(sigla => {
          const esp = AgendaModule._ESP_MAP[sigla] || { nome: sigla, cor: 0 };
          eventos.push({
            diaIdx: di, hora: hh, minuto: 0, durMin: 55,
            titulo: `${sigla} — ${esp.nome}`,
            consultor: esp.nome, sigla,
            cliente: '—', tipo: '—', local: '—',
            corCls: AgendaModule._COR_ESP[esp.cor % 5],
          });
        });
      });
    });
    return eventos;
  }

  /* ============================================================
     v2.4 — Pipeline de eventos da Agenda em 3 etapas puras:
       _getBaseSemana(ini)          → agendamentos crus da semana
       _aplicarFiltroDrawer(base)   → aplica FiltroAvancadoComponent
       _mapearEventos(filtrados)    → enriquece com sigla/cor/consultor
     Cada etapa recebe entrada e devolve saída — sem side effects.
     Isso elimina divergência entre chamadas (badge x grade x dash).
     ============================================================ */

  /* Etapa 1: agendamentos crus da semana (sem filtro drawer).
     v2.5 — log defensivo. */
  static _getBaseSemana(inicioSemana) {
    /* Defesa: se por algum motivo inicioSemana não for Date válido,
       loga e retorna array vazio ao invés de comportamento indefinido. */
    if (!(inicioSemana instanceof Date) || isNaN(inicioSemana.getTime())) {
      SLog.warn('AGENDA _getBaseSemana: inicioSemana inválido: ' + inicioSemana);
      return [];
    }

    const iniMs = inicioSemana.getTime();
    const fim = new Date(iniMs);
    fim.setDate(fim.getDate() + 6);
    fim.setHours(23, 59, 59, 999);
    const fimMs = fim.getTime();

    const total = (store.agendamentos || []).length;

    /* v2.5 — comparação por timestamp (ms), não por objeto Date.
       Isso elimina qualquer surpresa de comparação de referência. */
    const matches = [];
    const excluidos = [];
    (store.agendamentos || []).forEach((a) => {
      if (!a || !a.data) { excluidos.push('semData'); return; }
      /* Chamado #86 — não renderiza agendamentos cancelados/excluídos
         nem realizados. A exclusão (FunilModule.excluirAgendamentoAtual)
         marca _status='cancelado' e remove a linha do banco; até o
         próximo reload o objeto pode continuar em memória, então
         filtramos por status aqui pra sumir da agenda na hora. */
      if (a._status === 'cancelado' || a._status === 'realizado') {
        excluidos.push('status:' + a._status); return;
      }
      const d = new Date(a.data);
      const dMs = d.getTime();
      if (isNaN(dMs)) { excluidos.push('dataInválida'); return; }
      if (dMs >= iniMs && dMs <= fimMs) {
        matches.push(a);
      } else {
        excluidos.push(a.data);
      }
    });

    /* Log detalhado: só quando algo interessante — muito baixo custo
       quando há poucos agendamentos (típico caso). */
    SLog.info('AGENDA _getBaseSemana: ini=' +
              inicioSemana.toISOString().slice(0,16) +
              ' fim=' + fim.toISOString().slice(0,16) +
              ' store=' + total +
              ' matches=' + matches.length +
              (excluidos.length > 0 && excluidos.length <= 6
                ? ' excluídos=[' + excluidos.join(', ') + ']'
                : ''));

    return matches;
  }

  /* Etapa 2: aplica filtro do drawer se ativo. */
  static _aplicarFiltroDrawer(base) {
    if (!AgendaModule._filtroAvancado) return base;
    if (AgendaModule._filtroAvancado.contarAtivos() === 0) return base;

    var antes = base.length;
    var depois = AgendaModule._filtroAvancado.filtrar(base);

    /* Se filtro zerou tudo — loga sample pra diagnosticar. */
    if (depois.length === 0 && antes > 0) {
      try {
        var sample = base[0] || {};
        SLog.warn('AGENDA filtro drawer zerou resultado. Ativos: ' +
                  JSON.stringify(AgendaModule._filtroAvancado.filtros || {}));
        SLog.warn('AGENDA sample _esp_id / _filial_id / data: ' +
                  sample._esp_id + ' / ' + sample._filial_id + ' / ' + sample.data);
      } catch (e) { /* silent */ }
    }
    return depois;
  }

  /* Etapa 3: enriquece com sigla/cor/consultor pro render. */
  static _mapearEventos(list) {
    return (list || []).map(a => {
      const d = new Date(a.data);
      const diaIdx = (d.getDay() + 6) % 7;

      var esp = AgendaModule._ESP_BY_ID[a._esp_id];
      var nomeEsp = (esp && esp.nome) ||
                    a._esp_nome ||
                    (a.lead && a.lead.captador) ||
                    (AuthService.currentProfile ? AuthService.currentProfile.nome : '—');
      var sigla = (esp && esp.sigla) ||
                  (nomeEsp || 'CM').split(' ').map(function(x){return x[0];}).join('').slice(0,2).toUpperCase();
      var cor = esp ? esp.cor : 0;

      return {
        diaIdx, hora: d.getHours(), minuto: d.getMinutes(), durMin: 60,
        titulo: (a.lead && a.lead.nome) || 'Agendamento',
        consultor: nomeEsp,
        sigla:     sigla,
        cliente:   (a.lead && a.lead.nome) || '—',
        tipo:      a.categoria || '—',
        local:     a.local || '—',
        corCls:    AgendaModule._COR_ESP[cor % 5],
        _esp_id:   a._esp_id || null,
        _uuid:     a._uuid || null,
      };
    });
  }

  /* Legado: mantém _getEventosStore chamável (compat com callers
     antigos que ainda possam existir). Roda o pipeline completo. */
  static _getEventosStore(inicioSemana) {
    var base = AgendaModule._getBaseSemana(inicioSemana);
    var filt = AgendaModule._aplicarFiltroDrawer(base);
    return AgendaModule._mapearEventos(filt);
  }

  /* ---- CALCULAR INÍCIO DA SEMANA ---- */
  static _inicioSemana() {
    const hoje = new Date();
    const dow = hoje.getDay(); // 0=Dom
    const seg = new Date(hoje);
    seg.setDate(hoje.getDate() - (dow === 0 ? 6 : dow - 1) + AgendaModule._offset * 7);
    seg.setHours(0,0,0,0);
    return seg;
  }

  /* ---- RENDER PRINCIPAL ----
     v2.4 — orquestrador: prepara os eventos UMA vez e distribui.
     Assim badge sidebar, grade completa e mini-agenda do Dashboard
     ficam SEMPRE em sincronia — impossível "3 no badge, 0 na tela". */
  static renderFull() {
    AgendaModule._carregarESPMap();

    var ini = AgendaModule._inicioSemana();

    /* Base sem filtro drawer (usada pelo badge sidebar — mostra
       "quantos existem" independente de filtro). */
    var baseSemana = AgendaModule._getBaseSemana(ini);

    /* Base com filtro drawer aplicado (usada pela grade e Dashboard). */
    var eventosFiltrados = AgendaModule._aplicarFiltroDrawer(baseSemana);

    /* Mapping final: enriquece com sigla/cor/consultor pro render. */
    var eventos = AgendaModule._mapearEventos(eventosFiltrados);

    SLog.info('AGENDA renderFull: total=' + baseSemana.length +
              ' filtrados=' + eventosFiltrados.length +
              ' offset=' + AgendaModule._offset);

    AgendaModule._renderGCalCom(ini, eventos);
    AgendaModule._atualizarBadgeSidebarCom(baseSemana.length);
    /* Dashboard usa os mesmos eventos filtrados (respeita drawer). */
    AgendaModule.renderDashboard(eventos);
  }

  /* ============================================================
     v2.4 (BUG 001) — Badge do menu lateral (nav-agenda)
     ============================================================
     Recebe a contagem já calculada (SEM filtro drawer) pra que o
     badge represente "quantos agendamentos existem essa semana".
     Se você quer que o badge respeite os filtros do drawer, troca
     a chamada em renderFull.
     ============================================================ */
  static _atualizarBadgeSidebarCom(n) {
    var $badge = $('#badge-agenda');
    if (!$badge.length) return;
    $badge.text(String(n));
  }
  /* Legado (mantém compat): chama _atualizarBadgeSidebarCom com valor
     recalculado do zero. Usado por callers antigos, ex.: onChange do
     filtro do drawer. */
  static _atualizarBadgeSidebar() {
    try {
      var ini = AgendaModule._inicioSemana();
      var base = AgendaModule._getBaseSemana(ini);
      AgendaModule._atualizarBadgeSidebarCom(base.length);
    } catch (e) {
      SLog.warn('AGENDA badge sidebar: ' + e.message);
    }
  }

  /* v2.2 — renderDashboard e abrirDetalheSlot definidos uma única vez
     abaixo (existiam duplicados nesta classe até v2.1, sobrescrevendo-se
     sem efeito colateral funcional; consolidado agora). */

  /* ---- RENDER GCAL COMPLETO ----
     v2.4 — assinatura mudou: recebe (ini, todosEvt) prontos.
     Chamador (renderFull) que produz. Isso garante que badge sidebar
     e grade nunca divergem. Legado _renderGCal() (sem args) mantido
     como shim que produz e chama _renderGCalCom. */
  static _renderGCal() {
    AgendaModule._carregarESPMap();
    var ini = AgendaModule._inicioSemana();
    var todos = AgendaModule._getEventosStore(ini);
    AgendaModule._renderGCalCom(ini, todos);
  }

  static _renderGCalCom(ini, todosEvt) {
    const $wrap = $('#gcal-container');
    if (!$wrap.length) return;

    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const dias = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
    const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

    /* Label período */
    const fim = new Date(ini); fim.setDate(ini.getDate() + 6);
    const sameMonth = ini.getMonth() === fim.getMonth();
    const label = sameMonth
      ? `${ini.getDate()} – ${fim.getDate()} de ${meses[fim.getMonth()].charAt(0).toUpperCase()+meses[fim.getMonth()].slice(1)} de ${fim.getFullYear()}`
      : `${ini.getDate()} ${meses[ini.getMonth()]} – ${fim.getDate()} ${meses[fim.getMonth()]} ${fim.getFullYear()}`;
    /* Beyond CRM — visão "Dia" mostra HOJE quando a semana exibida é a
       atual (antes era sempre a segunda-feira), com o rótulo do dia. */
    const idxHoje = Math.round((hoje.getTime() - new Date(ini).setHours(0,0,0,0)) / 864e5);
    const diaSel  = (idxHoje >= 0 && idxHoje <= 6) ? idxHoje : 0;
    if (AgendaModule._view === 'dia') {
      const dSel = new Date(ini); dSel.setDate(ini.getDate() + diaSel);
      const mesSel = meses[dSel.getMonth()];
      $('#gcal-periodo-label').text(`${dias[diaSel]}, ${dSel.getDate()} de ${mesSel.charAt(0).toUpperCase() + mesSel.slice(1)} de ${dSel.getFullYear()}`);
    } else {
      $('#gcal-periodo-label').text(label);
    }

    const HINI = AgendaModule._HORAS_INI;
    const HFIM = AgendaModule._HORAS_FIM;
    const PX   = AgendaModule._PX_HORA;
    const totalH = HFIM - HINI;
    const cols = AgendaModule._view === 'dia' ? 1 : 7;
    const diasVisiveis = AgendaModule._view === 'dia'
      ? [diaSel]
      : [0,1,2,3,4,5,6];

    /* Colunas: gutter + N dias */
    const colTemplate = `52px repeat(${diasVisiveis.length}, 1fr)`;

    /* ---- CABEÇALHO ---- */
    let headerHtml = `<div class="gcal-header-row" style="grid-template-columns:${colTemplate};">
      <div class="gcal-header-gutter"></div>`;
    diasVisiveis.forEach(di => {
      const dt = new Date(ini); dt.setDate(ini.getDate() + di);
      dt.setHours(0,0,0,0);
      const isHoje = dt.getTime() === hoje.getTime();
      headerHtml += `<div class="gcal-header-day${isHoje?' is-today':''}">
        <span class="gcal-day-name">${dias[di]}</span>
        <div class="gcal-day-num">${dt.getDate()}</div>
      </div>`;
    });
    headerHtml += '</div>';

    /* ---- CORPO ---- */
    let bodyHtml = `<div class="gcal-body" style="grid-template-columns:${colTemplate}; position:relative;">`;

    /* Coluna de horas
       v2.3 (BUG 002) — loop até <=HFIM (inclusive) pra renderizar a
       linha das 20:00, permitindo que eventos exatamente às 20:00
       tenham espaço vertical na grade. Antes era `< HFIM` (exclusive)
       e a última linha era 19:00 — eventos das 20h caíam fora do
       cutoff e "sumiam" da renderização. */
    bodyHtml += `<div class="gcal-time-col">`;
    for (let h = HINI; h <= HFIM; h++) {
      const label12 = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h-12} PM`;
      const labelBR = h.toString().padStart(2,'0') + ':00';
      bodyHtml += `<div class="gcal-time-label">${labelBR}</div>`;
    }
    bodyHtml += `</div>`;

    /* Colunas de dias — v2.3 (BUG 002) mesmo motivo do loop de horas.
       v2.5 — adiciona data-di redundante ao id, pra permitir seleção
       via $wrap.find('[data-di=...]') como fallback. */
    diasVisiveis.forEach(di => {
      const dt = new Date(ini); dt.setDate(ini.getDate() + di);
      dt.setHours(0,0,0,0);
      const isHoje = dt.getTime() === hoje.getTime();
      bodyHtml += `<div class="gcal-day-col${isHoje?' is-today':''}" id="gcal-col-${di}" data-di="${di}">`;
      for (let h = HINI; h <= HFIM; h++) {
        bodyHtml += `<div class="gcal-hour-line"><div class="gcal-half-line"></div></div>`;
      }
      bodyHtml += `</div>`;
    });
    bodyHtml += `</div>`;

    $wrap.html(headerHtml + bodyHtml);

    /* ---- EVENTOS ----
       v2.4 — vem via parâmetro do renderFull; NÃO chamamos
       _getEventosStore aqui pra manter invariante de "1 chamada só". */
    SLog.info('AGENDA renderGCalCom: eventos recebidos=' +
              (todosEvt || []).length + ' view=' + AgendaModule._view);

    /* v2.5 — sanity check no DOM antes do loop */
    var $colsCriadas = $wrap.find('.gcal-day-col');
    if ($colsCriadas.length !== diasVisiveis.length) {
      SLog.warn('AGENDA DOM: esperado ' + diasVisiveis.length +
                ' colunas, encontrado ' + $colsCriadas.length);
    }

    diasVisiveis.forEach(di => {
      /* v2.5 — busca escopada no wrap (mais robusto que $(#id) global,
         que pode falhar se o Vercel/router recriar a árvore). Fallback
         em cadeia: id → data-di. */
      let $col = $wrap.find('#gcal-col-' + di);
      if (!$col.length) $col = $wrap.find('.gcal-day-col[data-di="' + di + '"]');
      if (!$col.length) $col = $('#gcal-col-' + di); /* último recurso global */

      const evtsDia = (todosEvt || []).filter(e => e.diaIdx === di);

      /* v2.5 — log por dia quando há eventos, pra fechar o gap
         entre "recebidos N" e "renderizados 0". */
      if (evtsDia.length > 0) {
        SLog.info('AGENDA dia=' + di + ' col=' + ($col.length ? 'OK' : 'MISSING') +
                  ' eventos=' + evtsDia.length +
                  ' horas=[' + evtsDia.map(function(e){return e.hora + ':' + e.minuto;}).join(',') + ']');
      }

      if (!$col.length) return;
      if (!evtsDia.length) return;

      /* --- ALGORITMO DE LAYOUT (Google Calendar style) --- */
      /* v2.3 (BUG 002) — cutoff inclusivo em HFIM */
      const toMin = ev => (ev.hora - HINI) * 60 + ev.minuto;
      const evts = evtsDia
        .filter(ev => ev.hora >= HINI && ev.hora <= HFIM)
        .map(ev => ({
          ...ev,
          startMin: toMin(ev),
          endMin:   toMin(ev) + ev.durMin,
        }))
        .sort((a, b) => a.startMin - b.startMin);

      /* v2.5 — log do resultado após cutoff de hora */
      if (evts.length !== evtsDia.length) {
        SLog.warn('AGENDA dia=' + di + ' cutoff hora removeu ' +
                  (evtsDia.length - evts.length) + ' eventos ' +
                  '(HINI=' + HINI + ' HFIM=' + HFIM + ')');
      }

      if (!evts.length) return;

      /* Atribuir colSlot e totalSlots a cada evento */
      AgendaModule._calcLayout(evts);

      const PADDING = 2; // px entre eventos
      let appended = 0;
      evts.forEach(ev => {
        /* v2.3 (BUG 002) — cutoff idem */
        if (ev.hora < HINI || ev.hora > HFIM) return;
        const topPx  = ev.startMin * PX / 60;
        const hgtPx  = Math.max(ev.durMin / 60 * PX - 1, 18);
        const wPct   = (100 / ev._totalCols) - PADDING;
        const lPct   = (100 / ev._totalCols) * ev._col;
        const evHtml = `<div class="gcal-event ${ev.corCls}"
          style="top:${topPx}px;height:${hgtPx}px;left:calc(${lPct}% + ${PADDING}px);width:calc(${wPct}% - ${PADDING}px);"
          onclick="AgendaModule._abrirEvento(event, ${JSON.stringify(ev).replace(/"/g,'&quot;')})">
          <div class="gcal-event-sigla" title="${Utils.escHtml(ev.consultor)}">${Utils.escHtml(ev.sigla)}</div>
          <div class="gcal-event-title">${Utils.escHtml(ev.titulo)}</div>
          <div class="gcal-event-time">${ev.hora.toString().padStart(2,'0')}:${ev.minuto.toString().padStart(2,'0')}</div>
        </div>`;
        $col.append(evHtml);
        appended++;
      });

      /* v2.5 — reporta o que efetivamente foi apendado nesse dia */
      SLog.info('AGENDA dia=' + di + ' appended=' + appended +
                ' / evts=' + evts.length);
    });

    /* ---- LINHA DO AGORA ---- */
    if (AgendaModule._offset === 0) {
      const agora = new Date();
      const hAtual = agora.getHours() + agora.getMinutes() / 60;
      if (hAtual >= HINI && hAtual < HFIM) {
        const topPx = (hAtual - HINI) * PX;
        const diaAtual = (agora.getDay() + 6) % 7;
        if (diasVisiveis.includes(diaAtual)) {
          $(`#gcal-col-${diaAtual}`).append(
            `<div class="gcal-now-line" style="top:${topPx}px;">
              <div class="gcal-now-dot"></div>
              <div class="gcal-now-bar"></div>
            </div>`
          );
        }
      }
    }

    /* v2.2 — scroll pro topo (08:00 já é o início do grid) */
    setTimeout(() => {
      const $w = $('.gcal-wrapper')[0];
      if ($w) $w.scrollTop = 0;
    }, 50);
  }

  /* ---- NAVEGAÇÃO ---- */
  static navSemana(delta) {
    AgendaModule._offset += delta;
    /* v2.4 — renderFull orquestra grade + dashboard + badge sidebar
       com UM único cálculo de eventos. Nada de chamadas separadas. */
    AgendaModule.renderFull();
  }
  static irHoje() {
    AgendaModule._offset = 0;
    AgendaModule.renderFull();
  }
  static setView(v) {
    AgendaModule._view = v;
    document.querySelectorAll('.gcal-view-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`gcal-btn-${v}`);
    if (btn) btn.classList.add('active');
    /* v2.4 — usa renderFull pra manter sincronia total */
    AgendaModule.renderFull();
  }

  /* ---- POPOVER DE EVENTO ---- */
  static _abrirEvento(ev, evento) {
    ev.stopPropagation();
    const $pop = $('#gcal-popover');
    const hora  = `${evento.hora.toString().padStart(2,'0')}:${evento.minuto.toString().padStart(2,'0')} — ${Math.floor(evento.hora + evento.durMin/60).toString().padStart(2,'0')}:${((evento.minuto + evento.durMin) % 60).toString().padStart(2,'0')}`;
    $('#gcal-pop-titulo').text(evento.titulo);
    $('#gcal-pop-horario').text(hora);
    $('#gcal-pop-consultor').text(evento.consultor);
    $('#gcal-pop-cliente').text(evento.cliente);
    $('#gcal-pop-tipo').text(evento.tipo);
    $('#gcal-pop-local').text(evento.local);
    $('#gcal-pop-cliente-row').toggle(evento.cliente !== '—');
    $('#gcal-pop-tipo-row').toggle(evento.tipo !== '—');
    $('#gcal-pop-local-row').toggle(evento.local !== '—');

    /* Chamado #86 — guarda o _uuid do agendamento no botão de excluir.
       Sem _uuid (evento só-local raro), esconde o botão pra não dar
       falsa sensação de ação. */
    var $btnExcluir = $('#gcal-pop-excluir');
    if (evento._uuid) {
      $btnExcluir.attr('data-uuid', evento._uuid).show();
    } else {
      $btnExcluir.removeAttr('data-uuid').hide();
    }

    $pop.show();
    // Posicionar próximo ao clique
    const x = Math.min(ev.clientX + 12, window.innerWidth  - 340);
    const y = Math.min(ev.clientY - 10, window.innerHeight - 250);
    $pop.css({ left: x, top: y });

    // Fechar ao clicar fora
    setTimeout(() => {
      $(document).one('click.gcalpop', () => $pop.hide());
    }, 10);
  }

  static fecharPopover() {
    $('#gcal-popover').hide();
  }

  /* ════════════════════════════════════════════════════════════
     Chamado #86 — Excluir agendamento a partir do popover da Agenda
     ════════════════════════════════════════════════════════════
     Aciona a exclusão do agendamento cujo _uuid está no botão (setado
     por _abrirEvento). Localiza o objeto em store.agendamentos pelo
     _uuid, pede confirmação e delega ao store.excluirAgendamento
     (remove de memória + banco). Re-renderiza a agenda pra sumir na
     hora. É a mesma exclusão do modal do lead — aqui só oferecida no
     lugar mais natural: o próprio evento na grade.
     ──────────────────────────────────────────────────────────── */
  static excluirEventoPopover() {
    var uuid = $('#gcal-pop-excluir').attr('data-uuid');
    if (!uuid) {
      Toast.show('Não foi possível identificar o agendamento.', 'warning');
      return;
    }
    var ag = (store.agendamentos || []).find(function(a) { return a._uuid === uuid; });
    if (!ag) {
      Toast.show('Agendamento não encontrado.', 'warning');
      return;
    }

    /* Fecha o popover antes de abrir o diálogo (evita sobreposição). */
    AgendaModule.fecharPopover();

    ConfirmDialog.show(
      '🗑️',
      'Excluir Agendamento',
      'Deseja remover este agendamento da agenda? Esta ação não pode ser desfeita.',
      function() {
        store.excluirAgendamento(ag).then(function(ok) {
          if (ok) Toast.show('Agendamento excluído da agenda.', 'success');
          else    Toast.show('Agendamento removido localmente (verifique a conexão).', 'warning');
          try { AgendaModule.renderFull(); } catch (e) { SLog.warn('excluirEventoPopover render: ' + e.message); }
          if (typeof FunilModule !== 'undefined' && FunilModule.renderKanban) {
            try { FunilModule.renderKanban(); } catch (e) {}
          }
        });
      }
    );
  }

  /* AJUSTE 5: detalhe slot (manter compatibilidade dashboard) */
  static abrirDetalheSlot(dia, hora, sigla) {
    const esp = AgendaModule._ESP_MAP[sigla];
    Toast.show(`📅 ${sigla}${esp ? ' — '+esp.nome : ''} | ${dia} às ${hora}`, 'info');
  }

  static novoAgendamento() {
    Toast.show('Abra um lead no funil para agendar uma visita.', 'info');
  }

  /* ============================================================
     v2.2 — renderDashboard (mini-grade compacta 08–20h)
     ============================================================
     Fonte de dados: store.agendamentos (via _getEventosStore) — não
     mais AGENDA_DATA (mock morto). Respeita:
       - RLS do backend (já aplicada em store.agendamentos).
       - Filtro de usuário do Dashboard, se existir (id opcional):
         window._dashFiltroUserId, ou attr data-user do container
         (#agenda-week-dash[data-user]).
     Cada agendamento vira uma bolinha colorida (cor coerente com a
     agenda full) com tooltip mostrando sigla, hora e lead.
     ============================================================ */
  static renderDashboard(eventosPre) {
    const $c = $('#agenda-week-dash');
    if (!$c.length) return;

    AgendaModule._carregarESPMap();

    const dias  = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
    const HINI  = AgendaModule._HORAS_INI;
    const HFIM  = AgendaModule._HORAS_FIM;

    /* Semana da grade compacta segue o mesmo offset da agenda full. */
    const ini = AgendaModule._inicioSemana();

    /* v2.4 — se orquestrador (renderFull) passou eventos, usa direto.
       Caso contrário, produz internamente (chamada standalone). */
    let eventos = Array.isArray(eventosPre)
      ? eventosPre.slice()
      : AgendaModule._getEventosStore(ini);

    /* Filtro opcional do Dashboard (por usuário selecionado). Consumido
       de forma tolerante — se nada estiver setado, não filtra. */
    var userSelId = null;
    try {
      userSelId = window._dashFiltroUserId ||
                  $c.attr('data-user') ||
                  null;
    } catch (e) { /* silent */ }
    if (userSelId) {
      eventos = eventos.filter(function(ev) { return ev._esp_id === userSelId; });
    }

    /* Índice para lookup rápido: eventos[diaIdx][hora] = [ev, ev, ...] */
    var idx = {};
    eventos.forEach(function(ev) {
      if (ev.hora < HINI || ev.hora >= HFIM) return;
      idx[ev.diaIdx] = idx[ev.diaIdx] || {};
      idx[ev.diaIdx][ev.hora] = idx[ev.diaIdx][ev.hora] || [];
      idx[ev.diaIdx][ev.hora].push(ev);
    });

    /* Dia da semana atual (Seg=0…Dom=6) — só destaca se offset=0. */
    var diaAtual = -1;
    if (AgendaModule._offset === 0) {
      diaAtual = (new Date().getDay() + 6) % 7;
    }

    let html = `<div class="agenda-grid">
      <div class="ag-header-cell"></div>
      ${dias.map(function(d, i) {
        return `<div class="ag-header-cell${i === diaAtual ? ' ag-today' : ''}">${d}</div>`;
      }).join('')}`;

    for (var h = HINI; h < HFIM; h++) {
      var hLabel = h.toString().padStart(2,'0') + ':00';
      html += `<div class="ag-time">${hLabel}</div>`;
      for (var di = 0; di < 7; di++) {
        var slots = (idx[di] && idx[di][h]) || [];
        var slotsHtml = slots.map(function(ev) {
          var tip = ev.sigla + ' — ' + ev.consultor +
                    ' | ' + ev.hora.toString().padStart(2,'0') + ':' +
                    ev.minuto.toString().padStart(2,'0') +
                    ' | ' + ev.cliente;
          /* Reutiliza a paleta gcal-ev-N pra dot mini — CSS transforma
             em círculo colorido. */
          return `<span class="ag-slot ${ev.corCls}" title="${Utils.escHtml(tip)}"
                        onclick="AgendaModule._abrirEventoDash(event, ${JSON.stringify(ev).replace(/"/g,'&quot;')})">${Utils.escHtml(ev.sigla)}</span>`;
        }).join('');
        html += `<div class="ag-cell${di === diaAtual ? ' ag-today-col' : ''}">${slotsHtml}</div>`;
      }
    }
    html += '</div>';
    $c.html(html);
  }

  /* v2.2 — clique em bolinha da mini-agenda: reutiliza o popover da
     agenda full. Mantém abrirDetalheSlot (Toast) como fallback para
     chamadas legadas. */
  static _abrirEventoDash(ev, evento) {
    if (typeof AgendaModule._abrirEvento === 'function') {
      AgendaModule._abrirEvento(ev, evento);
    } else {
      AgendaModule.abrirDetalheSlot('—', evento.hora + ':' + evento.minuto, evento.sigla);
    }
  }

}

/* ============================================================  RelatoriosModule */
class RelatoriosModule {

  /* Chamado #70 — data da venda para os relatórios de carteira. A data mora
     no registro da VENDA (store.vendas.dataVenda), não no lead (leads.data_venda
     fica vazio). Formata YYYY-MM-DD -> DD/MM/YYYY sem new Date() (sem drift). */
  /* Chamado #70 — valor de ADESÃO para os relatórios de carteira. Mora no
     registro da VENDA (store.vendas.valorAdesao), não no lead. Retorna número. */
  /* Chamado #112 — `vendasArr` opcional: quando passado (exportarCarteira/
     exportarCompleto buscam o histórico completo de vendas direto do
     banco), usa esse array em vez de store.vendas (capado a 500 no
     cache de boot — uma venda mais antiga cairia fora e o helper
     voltaria pro fallback do campo do lead, geralmente vazio). */
  static _adesaoLead(l, vendasArr) {
    var uuid = l && l._uuid;
    var v = uuid ? (vendasArr || store.vendas || []).find(function(x) { return x._lead_uuid === uuid; }) : null;
    if (v && v.valorAdesao != null) return Number(v.valorAdesao) || 0;
    return parseFloat(String((l && l.adesao) || '0').replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
  }

  static _dataVendaLead(l, vendasArr) {
    var uuid = l && l._uuid;
    var v = uuid ? (vendasArr || store.vendas || []).find(function(x) { return x._lead_uuid === uuid; }) : null;
    var raw = (v && v.dataVenda) ? v.dataVenda : ((l && l.dataVenda) || '');
    if (!raw) return '';
    var str = String(raw).slice(0, 10);
    var m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? (m[3] + '/' + m[2] + '/' + m[1]) : String(raw);
  }

  /* Chamado #117 — coluna "Mensalidade" do relatório Completo (aba
     Vendas/Carteira) lia l.mensalidade||l.mensalidadeEst direto do LEAD.
     Mesmo bug já corrigido várias vezes (#105/#87/#101): o valor real
     fechado na venda mora em store.vendas.valorMensalidade — o campo do
     lead é só a estimativa do cadastro/negociação, quase sempre vazia ou
     diferente do que fechou. Mesmo padrão de `_adesaoLead`/`_dataVendaLead`
     (aceita `vendasArr` opcional pro histórico completo). */
  static _mensalLead(l, vendasArr) {
    var uuid = l && l._uuid;
    var v = uuid ? (vendasArr || store.vendas || []).find(function(x) { return x._lead_uuid === uuid; }) : null;
    if (v && v.valorMensalidade != null) return Number(v.valorMensalidade) || 0;
    return parseFloat(String((l && (l.mensalidade || l.mensalidadeEst)) || '0').replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
  }

  /* Chamado #115 — colunas "Adesão no Ciclo" e "Comissão Prevista" do
     relatório Desempenho por Especialista. Reaproveita EXATAMENTE a
     regra RN-16/RN-17 já usada em UsuarioModule.renderMinhaPerformance
     (Minha Performance) e MetasModule (Atingimento de Metas):
       - Antes de bater a meta: 10% de comissão sobre a adesão do ciclo
       - Depois de bater a meta: 50% sobre TODA a adesão do ciclo
         (recálculo retroativo)
       - Bônus fixo por degrau (não acumula, usa o maior atingido):
         Super +200 / Power +800 / King +1800
       - Cada degrau é atingido por QUANTIDADE de vendas OU por VALOR de
         mensalidade acumulada no ciclo (o que ocorrer primeiro).
     `vendasCicloEsp` já deve vir filtrado pro ciclo de comissão vigente
     e pro especialista (ver exportarDesempenho). `u` é o registro do
     usuário (store.usuarios), de onde vêm os degraus configurados. */
  /* Chamado #124 — `fimCiclo` (opcional) faz a comissão ser calculada
     com as metas VIGENTES naquele ciclo. Sem o parâmetro, mantém o
     comportamento antigo (metas atuais do cadastro), o que preserva
     qualquer chamador que ainda não tenha a data em mãos.
     Isso importa porque a meta é que define se a adesão rende 10 % ou
     50 % e qual bônus de degrau entra — usar a meta de hoje para pagar
     um ciclo fechado produz o valor errado. */
  static _comissaoCicloEsp(vendasCicloEsp, u, fimCiclo) {
    u = u || {};
    /* Chamado #128 — uma venda por cliente. Sem isso, um lead com duas
       linhas de venda contava 2 na quantidade e somava adesão e
       mensalidade em dobro — e adesão em dobro significa comissão em
       dobro. Mesma dedup do _agregarEsp, pra tela e pagamento nunca
       divergirem. */
    const _vendasUnicas = (typeof MetasModule !== 'undefined' && MetasModule._dedupVendasPorLead)
      ? MetasModule._dedupVendasPorLead(vendasCicloEsp)
      : (vendasCicloEsp || []);
    const qtdVendas  = _vendasUnicas.length;
    const somaAdesao = _vendasUnicas.reduce((s, v) => s + Number(v.valorAdesao || 0), 0);
    const somaMensal = _vendasUnicas.reduce((s, v) => s + Number(v.valorMensalidade || 0), 0);

    const _mv = (fimCiclo && typeof MetasModule !== 'undefined' && MetasModule._metasDoCiclo)
      ? MetasModule._metasDoCiclo(u, fimCiclo)
      : null;
    const metaBase  = _mv ? _mv.meta_vendas       : (Number(u.meta_vendas)       || 0);
    const metaSuper = _mv ? _mv.meta_super_vendas : (Number(u.meta_super_vendas) || 0);
    const metaPower = _mv ? _mv.meta_power_vendas : (Number(u.meta_power_vendas) || 0);
    const metaKing  = _mv ? _mv.meta_king_vendas  : (Number(u.meta_king_vendas)  || 0);
    const metaMens      = _mv ? _mv.meta_mensalidade       : (Number(u.meta_mensalidade)       || 0);
    const metaSuperVal  = _mv ? _mv.meta_super_mensalidade : (Number(u.meta_super_mensalidade) || 0);
    const metaPowerVal  = _mv ? _mv.meta_power_mensalidade : (Number(u.meta_power_mensalidade) || 0);
    const metaKingVal   = _mv ? _mv.meta_king_mensalidade  : (Number(u.meta_king_mensalidade)  || 0);

    const bateuMeta  = (metaBase  > 0 && qtdVendas >= metaBase)  || (metaMens     > 0 && somaMensal >= metaMens);
    const bateuSuper = (metaSuper > 0 && qtdVendas >= metaSuper) || (metaSuperVal > 0 && somaMensal >= metaSuperVal);
    const bateuPower = (metaPower > 0 && qtdVendas >= metaPower) || (metaPowerVal > 0 && somaMensal >= metaPowerVal);
    const bateuKing  = (metaKing  > 0 && qtdVendas >= metaKing)  || (metaKingVal  > 0 && somaMensal >= metaKingVal);

    const percentualAdesao = bateuMeta ? 0.50 : 0.10;
    let bonus = 0;
    if (bateuKing) bonus = 1800; else if (bateuPower) bonus = 800; else if (bateuSuper) bonus = 200;

    /* Chamado #107 — expõe qtdVendas e os degraus atingidos também
       (além de somaAdesao/somaMensal/comissao), pra que
       UsuarioModule._linhaComissaoEquipe (visão do gerente) monte a
       barra de progresso e o badge do degrau sem recalcular a regra. */
    return {
      qtdVendas, somaAdesao, somaMensal,
      comissao: (somaAdesao * percentualAdesao) + bonus,
      bateuMeta, bateuSuper, bateuPower, bateuKing,
    };
  }

  /* Chamado #113 — coluna "Rastreador" do relatório "Carteira de
     Associados" lia l.rastreador direto do LEAD. Mesmo bug de sempre
     (#105/#87/#101/#117): o valor real é o que foi preenchido no
     formulário da etapa Venda (campo "Valor Rastreador"), que vai pra
     vendas.valorRastreador — o campo do lead é só o que foi digitado
     antes de fechar (estimativa/negociação), quase sempre vazio ou
     diferente do valor final. Mesmo padrão de `_adesaoLead`/`_mensalLead`
     (aceita `vendasArr` opcional pro histórico completo). */
  static _rastreadorLead(l, vendasArr) {
    var uuid = l && l._uuid;
    var v = uuid ? (vendasArr || store.vendas || []).find(function(x) { return x._lead_uuid === uuid; }) : null;
    if (v && v.valorRastreador != null) return Number(v.valorRastreador) || 0;
    return parseFloat(String((l && l.rastreador) || '0').replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
  }

  /* Chamado #65 — filtro "Ocultar inativos" nos cards Ranking de Vendas
     e Atingimento de Metas. É um toggle que o gerente liga/desliga.
     Default: LIGADO (oculta inativos), que é o comportamento pedido no
     #76 (ranking não deve puxar inativos). O usuário pode desligar pra
     ver todos. */
  static _ocultarInativos = true;

  static toggleInativos(valor) {
    RelatoriosModule._ocultarInativos = !!valor;
    RelatoriosModule._renderDashboard();
  }

  static render() {
    RelatoriosModule._renderDashboard();
  }

  /* ================================================================
     PAINEL PRINCIPAL — renderiza tudo em #rel-dashboard
     ================================================================ */
  static _renderDashboard() {
    const $c = $('#rel-dashboard');
    if (!$c.length) return;

    /* ── Calcular todos os dados ── */
    const leads     = store.leads;
    const total     = leads.length || 1;
    const carteira  = leads.filter(l => l.etapa === 'carteira');
    const ligacoes  = store.ligacoes;
    /* ── Chamados #65 e #76 — base de usuários do Ranking de Vendas e
       Atingimento de Metas ──
         • #76: INCLUIR supervisores além de especialistas (supervisores
           também vendem e devem constar no ranking/atingimento).
         • #65/#76: ocultar inativos — controlado pelo toggle
           _ocultarInativos (default LIGADO). Quando ligado, remove
           status='inativo'. Status: null ou ≠ 'inativo' = ativo. */
    const usuarios  = store.usuarios.filter(u => {
      var perfilVende = (u.perfil === 'especialista' || u.perfil === 'supervisor');
      if (!perfilVende) return false;
      if (RelatoriosModule._ocultarInativos) {
        return u.status == null || u.status !== 'inativo';
      }
      return true;
    });

    /* Totais por etapa */
    const porEtapa = {};
    STAGE_ORDER.forEach(e => { porEtapa[e] = leads.filter(l => l.etapa === e).length; });

    /* Score de saúde do funil (0-100) */
    const taxaConv = carteira.length / total;
    const eficLig  = ligacoes.length > 0 ? Math.min(ligacoes.filter(l => l.resultado?.includes('Agendamento')).length / ligacoes.length, 1) : 0;
    const cobMeta  = usuarios.length ? usuarios.filter(u => (porEtapa['carteira']||0) >= u.meta_vendas && u.meta_vendas > 0).length / usuarios.length : 0;
    const score    = Math.round((taxaConv * 40 + eficLig * 35 + cobMeta * 25) * 100);
    const scoreColor = score >= 70 ? '#10A64A' : score >= 40 ? '#F59E0B' : BX_COR.accent;
    const scoreLabel = score >= 70 ? 'Saudável' : score >= 40 ? 'Atenção' : 'Crítico';

    /* Métricas por especialista */
    const espStats = {};
    usuarios.forEach(u => {
      espStats[u.nome] = { nome: u.nome, sigla: u.sigla, filial: u.filial, metaV: u.meta_vendas||0, metaM: u.meta_mensalidade||0, metaSuperV: u.meta_super_vendas||0, metaPowerV: u.meta_power_vendas||0, metaKingV: u.meta_king_vendas||0, metaSuperM: u.meta_super_mensalidade||0, metaPowerM: u.meta_power_mensalidade||0, metaKingM: u.meta_king_mensalidade||0, lig: 0, agend: 0, visitas: 0, vendas: 0, mensal: 0, _id: u._id || u.id }; /* #89 degraus */
    });
    ligacoes.forEach(l => { if (espStats[l.esp]) espStats[l.esp].lig++; });
    leads.forEach(l => {
      /* Chamado #69 — atribui o lead ao RESPONSÁVEL ATUAL
         (responsavel_nome), não ao criador (captador). Assim, após uma
         transferência, o lead conta no Ranking/Atingimento do usuário que
         está tratando o card agora, não de quem o cadastrou. Fallback pro
         captador se o responsável não estiver resolvido (dado legado). */
      const e = espStats[l.responsavel_nome || l.captador]; if (!e) return;
      if (['agendamento','visita','venda','carteira'].includes(l.etapa)) e.agend++;
      if (['visita','venda','carteira'].includes(l.etapa)) e.visitas++;
      if (l.etapa === 'carteira') e.vendas++;
    });
    /* Chamado #105 — mensalidade real vem de store.vendas.valorMensalidade
       (o valor de verdade registrado no formulário de venda), não de
       l.mensalidade — campo que NUNCA é mapeado pelo SupabaseSync (só
       l.mensalidadeEst existe), então a soma sempre dava zero, sempre,
       pra todo mundo. Mesmo bug de fundo do #87/#101, terceiro lugar
       onde ele apareceu. Sem filtro de período aqui — este card já é
       "estado atual" (todos os leads em carteira), sem recorte de ciclo. */
    const espStatsPorId = {};
    Object.values(espStats).forEach(e => { if (e._id) espStatsPorId[e._id] = e; });
    (store.vendas || []).forEach(v => {
      const e = v._esp_id ? espStatsPorId[v._esp_id] : null;
      if (!e) return;
      e.mensal += Number(v.valorMensalidade || 0);
    });
    const espArr = Object.values(espStats).sort((a,b) => b.vendas - a.vendas);

    /* Por fonte */
    const porFonte = {};
    leads.forEach(l => { porFonte[l.fonte||'—'] = (porFonte[l.fonte||'—']||0)+1; });
    const fontesArr = Object.entries(porFonte).sort((a,b)=>b[1]-a[1]).slice(0,8);

    /* Leads quentes (tags quente ou muitas tentativas) */
    const quentes = leads
      .filter(l => l.tags?.includes('quente') || l.tentativas >= 3)
      .sort((a,b) => b.tentativas - a.tentativas)
      .slice(0,8);

    /* Alertas automáticos */
    const alertas = RelatoriosModule._gerarAlertas(leads, espArr, ligacoes);

    /* Aniversariantes */
    const hoje = new Date();
    const anivs = carteira.filter(l => l.aniversario).map(l => {
      const d = new Date(l.aniversario);
      const prox = new Date(hoje.getFullYear(), d.getMonth(), d.getDate());
      if (prox < hoje) prox.setFullYear(hoje.getFullYear()+1);
      const dias = Math.ceil((prox - hoje) / 86400000);
      return { ...l, diasRestantes: dias, dataFmt: d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}) };
    }).sort((a,b)=>a.diasRestantes-b.diasRestantes).slice(0,6);

    /* Cores do funil */
    const etapaConf = {
      lead:        { label:'Lead',        icon:'🌱', cor:BX_COR.etapas.lead },
      ligacao:     { label:'Ligação',     icon:'📞', cor:BX_COR.etapas.ligacao },
      agendamento: { label:'Agendamento', icon:'📅', cor:BX_COR.etapas.agendamento },
      visita:      { label:'Visita',      icon:'🏠', cor:BX_COR.etapas.visita },
      venda:       { label:'Venda',       icon:'💰', cor:BX_COR.etapas.venda },
      carteira:    { label:'Carteira',    icon:'👛', cor:BX_COR.etapas.carteira },
    };
    const maxEtapa = Math.max(...STAGE_ORDER.map(e=>porEtapa[e]), 1);

    /* ── Montar HTML ── */
    let html = '';

    /* ---- SEÇÃO 1: KPIs HERO ---- */
    html += `<div class="rdash-section">
      <div class="rdash-section-title"><i class="bi bi-speedometer2"></i> Indicadores Principais</div>
      <div class="rdash-kpi-grid">
        ${RelatoriosModule._kpi('#3B82F6','🌱', total, 'Total de Leads','','neu')}
        ${RelatoriosModule._kpi('#10B981','📞', ligacoes.length, 'Ligações Realizadas', '—', 'neu')}
        ${RelatoriosModule._kpi('#8B5CF6','📅', porEtapa.agendamento, 'Agendamentos Ativos','','neu')}
        ${RelatoriosModule._kpi('#F59E0B','🏠', porEtapa.visita, 'Visitas Realizadas','','neu')}
        ${RelatoriosModule._kpi('#1B6B3A','💰', carteira.length, 'Vendas Concluídas', carteira.length > 0 ? '+'+carteira.length : '—', carteira.length>0?'up':'neu')}
        ${RelatoriosModule._kpi(BX_COR.accent,'🎂', anivs.filter(a=>a.diasRestantes<=30).length, 'Aniversários em 30d','','info')}
      </div>
    </div>`;

    /* ---- SEÇÃO 2: FUNIL + SCORE + ALERTAS ---- */
    html += `<div class="rdash-section">
      <div class="rdash-section-title"><i class="bi bi-funnel-fill"></i> Funil de Vendas</div>
      <div class="rdash-3col">

        <!-- Funil visual -->
        <div class="rdash-card" style="grid-column:span 2;">
          <div class="rdash-card-hd">
            <div class="rdash-card-title"><i class="bi bi-funnel-fill"></i> Conversão por Etapa <i class="bi bi-info-circle rdash-help" style="font-size:12px;color:var(--text-muted);cursor:help;" title="Mostra quantos leads estão em cada etapa do funil e o quanto se converte de uma etapa para a próxima. A porcentagem à esquerda é sobre o total de leads; a da direita (última coluna) é a conversão em relação à etapa anterior — onde esse número cai muito é onde há maior perda de leads."></i></div>
          </div>
          <div class="rdash-card-body">
            ${STAGE_ORDER.map((e,i) => {
              const n = porEtapa[e]; const prev = i>0 ? porEtapa[STAGE_ORDER[i-1]]||1 : total;
              const pctTotal = Math.round(n/total*100);
              const pctConv  = i===0 ? '100%' : Math.round(n/prev*100)+'%';
              const w = Math.round(n/maxEtapa*100);
              const cfg = etapaConf[e];
              return `<div class="rfunil-row">
                <div class="rfunil-icon">${cfg.icon}</div>
                <div class="rfunil-lbl">${cfg.label}</div>
                <div class="rfunil-track"><div class="rfunil-fill" style="width:${w}%;background:${cfg.cor};"></div></div>
                <div class="rfunil-n">${n}</div>
                <div class="rfunil-pct">${pctTotal}%</div>
                <div class="rfunil-conv" title="Conversão da etapa anterior">${i===0?'base':pctConv}</div>
              </div>`;
            }).join('')}
            <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);display:flex;gap:20px;flex-wrap:wrap;">
              <div class="small text-muted">Taxa de conversão total: <strong style="color:var(--verde);">${(carteira.length/total*100).toFixed(1)}%</strong></div>
              <div class="small text-muted">Lead → Carteira média do setor: <strong>~15%</strong></div>
              <div class="small text-muted">Ticket médio estimado: <strong style="color:var(--marinho);">R$ ${RelatoriosModule._ticketMedio(leads)}</strong></div>
            </div>
          </div>
        </div>

        <!-- Score de saúde -->
        <div class="rdash-card">
          <div class="rdash-card-hd">
            <div class="rdash-card-title"><i class="bi bi-heart-pulse-fill"></i> Saúde do Funil <i class="bi bi-info-circle rdash-help" style="font-size:12px;color:var(--text-muted);cursor:help;" title="Placar único de 0 a 100 que resume a saúde geral do funil, combinando três fatores: conversão total (peso 40%), eficiência das ligações (peso 35%) e cumprimento de metas (peso 25%). Faixas: 70 ou mais = Saudável (verde), 40 a 69 = Atenção (amarelo), abaixo de 40 = Crítico (vermelho). As três barrinhas abaixo mostram cada fator individualmente."></i></div>
          </div>
          <div class="rdash-card-body rhealthscore">
            <div class="rhs-circle" style="border-color:${scoreColor}22;">
              <div class="rhs-val" style="color:${scoreColor};">${score}</div>
            </div>
            <div class="rhs-lbl">Score geral</div>
            <div class="rhs-status" style="background:${scoreColor}18;color:${scoreColor};">${scoreLabel}</div>
            <div style="margin-top:14px;width:100%;">
              ${RelatoriosModule._miniBar('Conversão', Math.round(taxaConv*100), '#10A64A', 'Percentual de leads que chegaram até a Carteira (venda concluída) sobre o total de leads. É o fator de maior peso no score (40%).')}
              ${RelatoriosModule._miniBar('Efic. Ligações', Math.round(eficLig*100), '#3B82F6', 'Percentual de ligações que resultaram em agendamento — mede a qualidade da abordagem no telefone. Peso de 35% no score.')}
              ${RelatoriosModule._miniBar('Metas atingidas', Math.round(cobMeta*100), '#8B5CF6', 'Percentual de especialistas que já bateram a meta de vendas configurada. Peso de 25% no score.')}
            </div>
          </div>
        </div>

      </div>
    </div>`;

    /* ---- SEÇÃO 3: ESPECIALISTAS + METAS ---- */
    html += `<div class="rdash-section">
      <div class="rdash-section-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <span><i class="bi bi-people-fill"></i> Desempenho dos Especialistas</span>
        <!-- Chamados #65/#76 — filtro para ocultar usuários inativos nos
             cards Ranking de Vendas e Atingimento de Metas. -->
        <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:500;cursor:pointer;color:var(--d-txt-6b7280);">
          <input type="checkbox" id="rel-ocultar-inativos"
                 ${RelatoriosModule._ocultarInativos ? 'checked' : ''}
                 onchange="RelatoriosModule.toggleInativos(this.checked)">
          Ocultar inativos
        </label>
      </div>
      <div class="rdash-2col">

        <!-- Ranking -->
        <div class="rdash-card">
          <div class="rdash-card-hd">
            <div class="rdash-card-title"><i class="bi bi-trophy-fill"></i> Ranking de Vendas</div>
          </div>
          <div class="rdash-card-body">
            ${espArr.map((e,i) => {
              const rankCls = i===0?'gold':i===1?'silver':i===2?'bronze':'';
              const medalha  = i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
              return `<div class="resp-row">
                <div class="resp-rank ${rankCls}">${medalha||i+1}</div>
                <div class="resp-avatar" style="background:${['var(--d-bgc-dbeafe)','var(--d-bgc-d1fae5)','var(--d-bgc-ede9fe)'][i%3]};color:${['var(--d-txt-1d4ed8)','var(--d-txt-059669)','var(--d-txt-7c3aed)'][i%3]};">${e.sigla}</div>
                <div class="resp-info">
                  <div class="resp-nome">${Utils.escHtml(e.nome)}</div>
                  <div class="resp-detalhe">${Utils.escHtml(e.filial)}</div>
                </div>
                <div class="resp-stats">
                  <div class="resp-stat"><div class="resp-stat-val">${e.lig}</div><div class="resp-stat-lbl">Lig.</div></div>
                  <div class="resp-stat"><div class="resp-stat-val">${e.agend}</div><div class="resp-stat-lbl">Agend.</div></div>
                  <div class="resp-stat"><div class="resp-stat-val" style="color:var(--verde);">${e.vendas}</div><div class="resp-stat-lbl">Vendas</div></div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Metas -->
        <div class="rdash-card">
          <div class="rdash-card-hd">
            <div class="rdash-card-title"><i class="bi bi-bullseye"></i> Atingimento de Metas</div>
          </div>
          <div class="rdash-card-body">
            ${espArr.filter(e=>e.metaV>0).map(e => {
              const pctV = Math.min(Math.round(e.vendas/e.metaV*100), 100);
              const pctM = e.metaM ? Math.min(Math.round(e.mensal/e.metaM*100), 100) : 0;
              const corV = pctV>=100?BX_COR.up:pctV>=60?BX_COR.accent3:BX_COR.accent;
              const corM = pctM>=100?BX_COR.up:pctM>=60?BX_COR.accent3:BX_COR.accent;
              return `<div class="rmeta-row">
                <div class="rmeta-head">
                  <span class="rmeta-nome">${Utils.escHtml(e.nome)}</span>
                  <span class="rmeta-vals">${e.vendas}/${e.metaV} vendas</span>
                </div>
                <div class="rmeta-track"><div class="rmeta-fill" style="width:${pctV}%;background:${corV};"></div></div>
                <div style="display:flex;justify-content:space-between;margin-top:3px;">
                  ${(() => { const s = MetasModule._seloMeta(pctV);
                    return `<span class="rmeta-badge" style="background:${s.cor}18;color:${s.cor};">${s.texto}</span>`; })()}
                  ${e.metaM?`<span style="font-size:10px;color:var(--text-muted);">R$${e.mensal.toFixed(0)} / R$${e.metaM.toLocaleString('pt-BR')}</span>`:''}
                </div>
                ${(() => {
                  /* Chamado #89 — quanto falta para cada degrau (Super/Power/King)
                     por especialista. "atingido" quando batido por vendas OU mensalidade.
                     Só mostra degraus configurados. */
                  var ff = function(mq, mv, emoji, rot) {
                    mq = Number(mq) || 0; mv = Number(mv) || 0;
                    if (mq <= 0 && mv <= 0) return '';
                    var bateu = (mq > 0 && e.vendas >= mq) || (mv > 0 && e.mensal >= mv);
                    if (bateu) return emoji + ' ' + rot + ': <span style="color:#10A64A;">atingido ✅</span>';
                    var ps = [];
                    if (mq > 0 && e.vendas < mq) ps.push((mq - e.vendas) + ' venda(s)');
                    if (mv > 0 && e.mensal < mv) ps.push('R$' + (mv - e.mensal).toLocaleString('pt-BR'));
                    return emoji + ' ' + rot + ': faltam ' + ps.join(' ou ');
                  };
                  var d = [
                    ff(e.metaSuperV, e.metaSuperM, '⭐', 'Super'),
                    ff(e.metaPowerV, e.metaPowerM, '⚡', 'Power'),
                    ff(e.metaKingV,  e.metaKingM,  '👑', 'King')
                  ].filter(Boolean).join(' &nbsp;·&nbsp; ');
                  return d ? '<div style="font-size:10px;color:var(--text-muted);margin-top:4px;line-height:1.6;">' + d + '</div>' : '';
                })()}
              </div>`;
            }).join('')}
          </div>
        </div>

      </div>
    </div>`;

    /* ---- SEÇÃO 4: FONTES + LEADS QUENTES ---- */
    html += `<div class="rdash-section">
      <div class="rdash-section-title"><i class="bi bi-bar-chart-fill"></i> Origem & Oportunidades</div>
      <div class="rdash-2col">

        <!-- Fonte dos leads -->
        <div class="rdash-card">
          <div class="rdash-card-hd">
            <div class="rdash-card-title"><i class="bi bi-pin-map-fill"></i> Fonte dos Leads</div>
          </div>
          <div class="rdash-card-body rchart-wrap">
            ${fontesArr.map(([f,n]) => {
              const w = Math.round(n/fontesArr[0][1]*100);
              const hue = Math.abs(f.split('').reduce((a,c)=>a+c.charCodeAt(0),0)) % 360;
              const cor = `hsl(${hue},60%,42%)`;
              return `<div class="rchart-bar-row">
                <div class="rchart-bar-lbl" title="${Utils.escHtml(f)}">${Utils.escHtml(f)}</div>
                <div class="rchart-bar-track">
                  <div class="rchart-bar-fill" style="width:${w}%;background:${cor};">${n}</div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Leads quentes -->
        <div class="rdash-card">
          <div class="rdash-card-hd">
            <div class="rdash-card-title"><i class="bi bi-fire"></i> Leads com Alta Prioridade</div>
            <span style="font-size:10px;color:var(--text-muted);">tag quente ou ≥3 tentativas</span>
          </div>
          <div class="rdash-card-body">
            ${quentes.length ? quentes.map(l => {
              const cfg = etapaConf[l.etapa];
              return `<div class="rleads-row" style="cursor:pointer;" onclick="FunilModule.abrirDetalhe('${l.id}');navigate('funil');">
                <div class="rleads-dot" style="background:${cfg.cor};"></div>
                <div class="rleads-nome">${Utils.escHtml(l.nome)}<br><span style="font-size:10px;color:var(--text-muted);">${l.id} · ${Utils.escHtml(l.captador)}</span></div>
                <span class="rleads-etapa" style="background:${cfg.cor}18;color:${cfg.cor};">${cfg.icon} ${cfg.label}</span>
                <span class="rleads-tent" title="Tentativas">${l.tentativas}</span>
              </div>`;
            }).join('') : '<p class="text-muted small text-center py-3">Nenhum lead prioritário no momento.</p>'}
          </div>
        </div>

      </div>
    </div>`;

    /* ---- SEÇÃO 5: ALERTAS + ANIVERSARIANTES ---- */
    html += `<div class="rdash-section">
      <div class="rdash-section-title"><i class="bi bi-bell-fill"></i> Alertas & Ações Recomendadas</div>
      <div class="rdash-2col">

        <div class="rdash-card">
          <div class="rdash-card-hd">
            <div class="rdash-card-title"><i class="bi bi-exclamation-triangle-fill"></i> Alertas Automáticos</div>
          </div>
          <div class="rdash-card-body">
            ${alertas.length ? alertas.map(a=>`<div class="ralerta ${a.tipo}"><div class="ralerta-icon">${a.icon}</div><div class="ralerta-txt">${a.msg}</div></div>`).join('') : '<div class="ralerta success"><div class="ralerta-icon">✅</div><div class="ralerta-txt"><strong>Tudo em ordem!</strong> Nenhum alerta no momento.</div></div>'}
          </div>
        </div>

        <div class="rdash-card">
          <div class="rdash-card-hd">
            <div class="rdash-card-title"><i class="bi bi-cake2-fill"></i> Aniversariantes (próximos 30 dias)</div>
          </div>
          <div class="rdash-card-body">
            ${anivs.length ? anivs.map(l => {
              const isHoje = l.diasRestantes === 0;
              const isSemana = l.diasRestantes <= 7;
              const cor = isHoje?'var(--vermelho)':isSemana?'var(--amarelo)':'var(--verde)';
              const bg  = isHoje?'var(--vermelho-s)':isSemana?'var(--amarelo-s)':'var(--verde-s)';
              const txt = isHoje?'🎉 Hoje!':isSemana?`em ${l.diasRestantes}d`:`em ${l.diasRestantes}d`;
              return `<div class="raniv-row">
                <div class="raniv-avatar">${l.nome.split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
                <div class="raniv-info">
                  <div class="raniv-nome">${Utils.escHtml(l.nome)}</div>
                  <div class="raniv-data">🎂 ${l.dataFmt} · 📱 ${Utils.escHtml(l.tel)}</div>
                </div>
                <span class="raniv-dias" style="background:${bg};color:${cor};">${txt}</span>
              </div>`;
            }).join('') : '<p class="text-muted small text-center py-3">Nenhum aniversário nos próximos 30 dias.</p>'}
          </div>
        </div>

      </div>
    </div>`;

    /* ---- SEÇÃO 6: TABELA GERAL DE LEADS ---- */
    html += `<div class="rdash-section">
      <div class="rdash-section-title"><i class="bi bi-table"></i> Visão Geral — Todos os Leads</div>
      <div class="rdash-card">
        <div class="rdash-card-hd">
          <div class="rdash-card-title"><i class="bi bi-list-ul"></i> Leads Ativos no Sistema</div>
          <span style="font-size:11px;color:var(--text-muted);">${leads.length} registros</span>
        </div>
        <div style="overflow-x:auto;">
          <table class="amp-table w-100">
            <thead><tr>
              <th>ID</th><th>Nome</th><th>Etapa</th><th>Fonte</th><th>Captador</th>
              <th>Tentativas</th><th>Tags</th><th>Mensalidade Est.</th><th>Ação</th>
            </tr></thead>
            <tbody>
              ${leads.map(l => {
                const cfg = etapaConf[l.etapa]||{label:l.etapa,cor:'#6B7280',icon:''};
                const tagsHtml = (l.tags||[]).map(t=>{const c=TAG_CONFIG[t]||{cls:'',label:t};return`<span class="amp-tag ${c.cls}" style="font-size:10px;">${c.label}</span>`;}).join('');
                return `<tr>
                  <td><code style="font-size:10px;">${l.id}</code></td>
                  <td><strong>${Utils.escHtml(l.nome)}</strong><br><small class="text-muted">${Utils.escHtml(l.tel)}</small></td>
                  <td><span style="background:${cfg.cor}18;color:${cfg.cor};padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;">${cfg.icon} ${cfg.label}</span></td>
                  <td style="font-size:11px;">${Utils.escHtml(l.fonte||'—')}</td>
                  <td style="font-size:11px;">${Utils.escHtml(l.captador||'—')}</td>
                  <td style="text-align:center;font-family:'JetBrains Mono';font-size:12px;"><span class="${l.tentativas>=25?'tent-warn':''}">${l.tentativas}</span></td>
                  <td>${tagsHtml||'<span style="color:var(--text-light);font-size:11px;">—</span>'}</td>
                  <td style="font-size:11px;font-family:'JetBrains Mono';">${Utils.escHtml(l.mensalidadeEst||l.mensalidade||'—')}</td>
                  <td><button class="btn btn-sm btn-outline-secondary" style="font-size:10px;padding:2px 8px;" onclick="FunilModule.abrirDetalhe('${l.id}');navigate('funil');">Abrir</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

    $c.html(html);

    /* Animar barras após render */
    setTimeout(() => {
      $c.find('.rfunil-fill, .rmeta-fill, .rchart-bar-fill').each(function() {
        const w = $(this).css('width'); $(this).css('width','0').animate({width:w},600);
      });
    }, 50);
  }

  /* ── Helpers ── */
  static _kpi(cor, icon, val, lbl, delta, deltaTipo) {
    return `<div class="rdash-kpi">
      <div class="rdash-kpi-accent" style="background:${cor};"></div>
      <div class="rdash-kpi-icon">${icon}</div>
      <div class="rdash-kpi-val" style="color:${cor};">${val}</div>
      <div class="rdash-kpi-lbl">${lbl}</div>
      ${delta ? `<div class="rdash-kpi-delta ${deltaTipo}">${delta}</div>` : ''}
    </div>`;
  }

  static _miniBar(lbl, pct, cor, help) {
    /* Chamados #48/#52 — `help` opcional: quando presente, adiciona um
       ícone de info com tooltip nativo ao lado do rótulo da barrinha.
       Chamadores antigos (sem o 4º parâmetro) seguem inalterados. */
    const helpIcon = help
      ? ` <i class="bi bi-info-circle rdash-help" style="font-size:10px;color:var(--text-muted);cursor:help;" title="${Utils.escHtml(help)}"></i>`
      : '';
    return `<div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px;">
        <span style="color:var(--text-muted);">${lbl}${helpIcon}</span>
        <span style="font-weight:700;color:${cor};font-family:'JetBrains Mono';">${pct}%</span>
      </div>
      <div style="background:var(--bg);border-radius:99px;height:5px;">
        <div style="width:${Math.min(pct,100)}%;background:${cor};height:5px;border-radius:99px;transition:width .6s;"></div>
      </div>
    </div>`;
  }

  static _ticketMedio(leads) {
    const vals = leads.map(l => parseFloat((l.mensalidadeEst||l.mensalidade||'0').replace(/[^0-9.,]/g,'').replace(',','.'))).filter(v=>v>0);
    if (!vals.length) return '—';
    return (vals.reduce((a,b)=>a+b,0)/vals.length).toLocaleString('pt-BR',{minimumFractionDigits:2});
  }

  static _gerarAlertas(leads, espArr, ligacoes) {
    const alertas = [];
    /* Leads em delay */
    const delay = leads.filter(l=>l.tags?.includes('delay'));
    if (delay.length) alertas.push({ tipo:'warning', icon:'⏳', msg: `<strong>${delay.length} lead(s) em Delay</strong> — revisão necessária para reengajamento.` });
    /* Leads sem contato há mais de 5 tentativas */
    const sem = leads.filter(l=>l.tentativas>=5 && l.etapa==='ligacao');
    if (sem.length) alertas.push({ tipo:'danger', icon:'🔴', msg: `<strong>${sem.length} lead(s)</strong> na Ligação com 5+ tentativas sem conversão.` });
    /* Chamado #40 — alertas por faixa de progresso (< 50 / 50-80 / 80-100 / ≥100).
       Cada especialista com meta > 0 gera exatamente UM alerta por período,
       na faixa em que ele estiver. */
    espArr.forEach(e => {
      if (!(e.metaV > 0)) return;
      const pct = Math.round((e.vendas / e.metaV) * 100);
      if (pct >= 100) {
        alertas.push({ tipo:'success', icon:'🎉', msg: `<strong>${e.nome}</strong> atingiu 100% da meta de vendas este mês!` });
      } else if (pct >= 80) {
        alertas.push({ tipo:'info',    icon:'🚀', msg: `<strong>${e.nome}</strong> passou de 80% da meta (${pct}%) — quase lá!` });
      } else if (pct >= 50) {
        alertas.push({ tipo:'info',    icon:'🎯', msg: `<strong>${e.nome}</strong> passou de 50% da meta de vendas (${pct}%).` });
      } else {
        alertas.push({ tipo:'warning', icon:'⚠️', msg: `<strong>${e.nome}</strong> está em ${pct}% da meta de vendas.` });
      }
    });
    /* Sem ligações */
    if (!ligacoes.length) alertas.push({ tipo:'info', icon:'📞', msg: '<strong>Nenhuma ligação registrada</strong> ainda. Comece a registrar pelo Funil.' });
    /* Agendamentos pendentes */
    const agend = leads.filter(l=>l.etapa==='agendamento').length;
    if (agend>0) alertas.push({ tipo:'info', icon:'📅', msg: `<strong>${agend} agendamento(s)</strong> pendente(s) de visita esta semana.` });
    return alertas.slice(0,6);
  }

  /* renderFunil e renderAniversariantes mantidos para compatibilidade interna */
  static renderFunil() { /* incorporado em _renderDashboard */ }
  static renderAniversariantes() { /* incorporado em _renderDashboard */ }

  /* ================================================================
     EXPORTAÇÃO EXCEL — ExcelJS com identidade visual Beyond CRM
     Cores: Laranja #FF6B05 | Preto #111111 | Branco #FFFFFF
     Usa window.ExcelJS (carregado via CDN no index.html)
     ================================================================ */

  /* ── Paleta Beyond CRM ── */
  static get _COR() {
    return {
      vermelho:  BX_COR.accent.slice(1).toUpperCase(), vermelhoClaro: BX_COR.excelClaro, vermelhoMed: BX_COR.excelMedio,
      marinho:   '111111', marinhoClaro:  'F2F2F2', marinhoMed:  'D4D4D4',
      verde:     '10A64A', verdeClaro:    'E8F8EE',
      amarelo:   'F59E0B', amareloClaro:  'FEF3C7',
      roxo:      '8B5CF6', roxoClaro:     'EDE9FE',
      azul:      '3B82F6', azulClaro:     'DBEAFE',
      cinza:     '6B7095', cinzaClaro:    'F5F6FA',
      branco:    'FFFFFF', texto:         '0E1023',
      borda:     'E5E7F0',
    };
  }

  /* ── Criar workbook novo com configurações base ── */
  static _wb() {
    const wb = new ExcelJS.Workbook();
    wb.creator    = 'Beyond CRM — Beyond Bits Tecnologia';
    wb.created    = new Date();
    wb.properties = { date1904: false };
    return wb;
  }

  /* ── Estilos reutilizáveis ── */
  static _estilos() {
    const C = RelatoriosModule._COR;
    return {
      /* Título principal da aba (linha 1) */
      titulo: {
        font:      { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF'+C.branco } },
        fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF'+C.marinho } },
        alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
        border:    {},
      },
      /* Subtítulo (gerado em / usuário) */
      subtitulo: {
        font:      { name: 'Calibri', size: 10, color: { argb: 'FF'+C.cinza } },
        fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF'+C.cinzaClaro } },
        alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
      },
      /* Cabeçalho de tabela */
      header: {
        font:      { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF'+C.branco } },
        fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF'+C.vermelho } },
        alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
        border: {
          top:    { style: 'thin', color: { argb: 'FF'+C.vermelhoMed } },
          bottom: { style: 'thin', color: { argb: 'FF'+C.vermelhoMed } },
          left:   { style: 'thin', color: { argb: 'FF'+C.vermelhoMed } },
          right:  { style: 'thin', color: { argb: 'FF'+C.vermelhoMed } },
        },
      },
      /* Cabeçalho secundário (tabelas menores, seções) */
      headerSec: {
        font:      { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF'+C.branco } },
        fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF'+C.marinho } },
        alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
        border: {
          top:    { style: 'thin', color: { argb: 'FF'+C.marinhoMed } },
          bottom: { style: 'thin', color: { argb: 'FF'+C.marinhoMed } },
          left:   { style: 'thin', color: { argb: 'FF'+C.marinhoMed } },
          right:  { style: 'thin', color: { argb: 'FF'+C.marinhoMed } },
        },
      },
      /* Linha par (zebrada) */
      rowPar: {
        font: { name: 'Calibri', size: 10, color: { argb: 'FF'+C.texto } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF'+C.branco } },
        border: {
          bottom: { style: 'hair', color: { argb: 'FF'+C.borda } },
          left:   { style: 'hair', color: { argb: 'FF'+C.borda } },
          right:  { style: 'hair', color: { argb: 'FF'+C.borda } },
        },
        alignment: { vertical: 'middle', wrapText: false },
      },
      /* Linha ímpar (zebrada) */
      rowImpar: {
        font: { name: 'Calibri', size: 10, color: { argb: 'FF'+C.texto } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF'+C.marinhoClaro } },
        border: {
          bottom: { style: 'hair', color: { argb: 'FF'+C.borda } },
          left:   { style: 'hair', color: { argb: 'FF'+C.borda } },
          right:  { style: 'hair', color: { argb: 'FF'+C.borda } },
        },
        alignment: { vertical: 'middle', wrapText: false },
      },
      /* Número / valor */
      numero: {
        font:      { name: 'Calibri', size: 10, color: { argb: 'FF'+C.texto } },
        alignment: { vertical: 'middle', horizontal: 'center' },
        numFmt:    '#,##0',
      },
      /* Moeda */
      moeda: {
        font:      { name: 'Calibri', size: 10, color: { argb: 'FF'+C.texto } },
        alignment: { vertical: 'middle', horizontal: 'right' },
        numFmt:    '"R$"#,##0.00',
      },
      /* Percentual */
      pct: {
        font:      { name: 'Calibri', size: 10, color: { argb: 'FF'+C.texto } },
        alignment: { vertical: 'middle', horizontal: 'center' },
        numFmt:    '0.0"%"',
      },
      /* Destaque verde (meta atingida) */
      verde: {
        font: { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF'+C.verde } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF'+C.verdeClaro } },
        alignment: { vertical: 'middle', horizontal: 'center' },
      },
      /* Destaque vermelho (alerta) */
      alerta: {
        font: { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF'+C.vermelho } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF'+C.vermelhoClaro } },
        alignment: { vertical: 'middle', horizontal: 'center' },
      },
      /* Destaque amarelo (atenção) */
      atencao: {
        font: { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF'+C.amarelo } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF'+C.amareloClaro } },
        alignment: { vertical: 'middle', horizontal: 'center' },
      },
      /* Célula de seção (label de agrupamento) */
      secao: {
        font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF'+C.marinho } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF'+C.marinhoClaro } },
        alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
        border: { left: { style: 'medium', color: { argb: 'FF'+C.vermelho } } },
      },
    };
  }

  /* ── Helper: aplicar estilo a uma célula ── */
  static _estilo(cell, estilo) {
    if (estilo.font)      cell.font      = estilo.font;
    if (estilo.fill)      cell.fill      = estilo.fill;
    if (estilo.alignment) cell.alignment = estilo.alignment;
    if (estilo.border)    cell.border    = estilo.border;
    if (estilo.numFmt)    cell.numFmt    = estilo.numFmt;
  }

  /* ── Helper: linha de título da aba ── */
  static _addTitulo(ws, titulo, ncols) {
    const C = RelatoriosModule._COR;
    const E = RelatoriosModule._estilos();
    const agora = new Date().toLocaleString('pt-BR');
    const usuario = (AuthService.currentProfile ? AuthService.currentProfile.nome : '—');

    // Linha 1: título
    ws.addRow([titulo]);
    const r1 = ws.lastRow;
    r1.height = 36;
    ws.mergeCells(r1.number, 1, r1.number, ncols);
    RelatoriosModule._estilo(r1.getCell(1), E.titulo);

    // Linha 2: meta info
    ws.addRow([`Gerado em ${agora}  |  Usuário: ${usuario}  |  Beyond CRM © 2026`]);
    const r2 = ws.lastRow;
    r2.height = 18;
    ws.mergeCells(r2.number, 1, r2.number, ncols);
    RelatoriosModule._estilo(r2.getCell(1), E.subtitulo);

    // Linha 3: separador vazio
    ws.addRow([]);
    ws.lastRow.height = 6;
  }

  /* ── Helper: adicionar tabela com header + rows + zebra ── */
  static _addTabela(ws, headers, rows, estiloHeader = 'header', ncols = null) {
    const E = RelatoriosModule._estilos();
    const nc = ncols || headers.length;

    // Header
    ws.addRow(headers);
    const rh = ws.lastRow;
    rh.height = 22;
    headers.forEach((_, i) => RelatoriosModule._estilo(rh.getCell(i+1), E[estiloHeader]));

    // Dados
    rows.forEach((row, ri) => {
      ws.addRow(row);
      const rd = ws.lastRow;
      rd.height = 18;
      const estiloBase = ri % 2 === 0 ? E.rowPar : E.rowImpar;
      row.forEach((val, ci) => {
        const cell = rd.getCell(ci+1);
        RelatoriosModule._estilo(cell, estiloBase);
        // Aplicar formato especial por tipo de dado
        if (typeof val === 'number') {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
      });
    });

    // Linha final de fechamento
    ws.addRow([]);
    ws.lastRow.height = 8;
  }

  /* ── Helper: larguras automáticas ── */
  static _autoWidth(ws, headers, rows, min = 8, max = 40) {
    const allRows = [headers, ...rows];
    const widths = [];
    allRows.forEach(row => {
      row.forEach((cell, i) => {
        const len = cell != null ? String(cell).length : 0;
        widths[i] = Math.max(widths[i] || min, Math.min(len + 3, max));
      });
    });
    ws.columns = widths.map((w, i) => ({ key: String(i), width: w }));
  }

  /* ── Helper: download ── */
  static async _baixarExcelJS(wb, nome) {
    try {
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = nome; a.click();
      URL.revokeObjectURL(url);
      Toast.show(`✅ "${nome}" exportado com sucesso!`, 'success');
    } catch(err) {
      console.error(err);
      Toast.show('Erro ao gerar o arquivo. Verifique o console.', 'danger');
    }
  }

  /* ── Helper: adicionar gráfico de barras nativo ── */
  static _addGrafico(wb, ws, titulo, categorias, series, startRow, startCol, endRow, endCol) {
    try {
      // ExcelJS suporta gráficos via addChart
      const chart = wb.addChart({ type: 'bar', series });
      // Posicionar na planilha (nota: suporte limitado do ExcelJS, mas funciona no xlsx)
    } catch(e) { /* silencioso se não suportar */ }
  }

  /* ── Helper: total de ligações desde o início da operação (chamado #110) ──
     store.ligacoes é só o CACHE local carregado no boot (Supabase-
     Sync.carregarLigacoes tem .limit(200) — as 200 mais recentes),
     então store.ligacoes.length nunca reflete o histórico completo.
     Usa a mesma RPC contar_ligacoes_totais que alimenta o KPI
     "Ligações totais" do Dashboard (chamados #83/#104): SECURITY
     DEFINER, conta a tabela inteira no banco. Sem parâmetros (todos
     null) = sem filtro de usuário/período = total desde sempre.
     Cai no cache local só se a RPC falhar (ex.: offline). */
  static async _totalLigacoesGlobal() {
    try {
      if (typeof supa !== 'undefined' && supa) {
        const res = await supa.rpc('contar_ligacoes_totais', { p_users: null, p_ini: null, p_fim: null });
        if (!res.error && res.data != null) return Number(res.data);
        if (res.error) SLog.warn('_totalLigacoesGlobal RPC: ' + res.error.message);
      }
    } catch (e) {
      SLog.warn('_totalLigacoesGlobal exceção: ' + e.message);
    }
    return store.ligacoes.length; /* fallback — pode estar limitado às 200 mais recentes */
  }

  /* ── Helper: transições do funil pelas MESMAS regras do card
     "Visão do Funil — Conversão entre etapas" do Dashboard ──
     Chamado #110/#114/#117 (reabertos) — o cliente pediu que a coluna
     "Conversão p/ Próxima" (e equivalentes: "Conversão Etapa Anterior"
     no relatório de Funil, "Conversão" no Resumo Geral do Completo)
     usasse exatamente o cálculo do card do dashboard, em vez das
     várias tentativas anteriores.

     O card (TaxaConversaoModule.calcularDashboard) devolve 5 transições:
       [0] Lead → Ligação        (cumulativo: leads em ligação+ ÷ leads em lead+)
       [1] Ligação → Agendamento (cumulativo: leads em agend.+ ÷ leads em ligação+)
       [2] Agendamento → Visita  (POR EVENTO: visitas 'nao_fechou'/'venda' ÷ nº agendamentos)
       [3] Visita → Venda        (POR EVENTO: nº vendas ÷ visitas presenciais)
       [4] Venda → Carteira      (cumulativo: leads em carteira ÷ leads em venda+)

     Aqui montamos as bases com HISTÓRICO COMPLETO (sem filtro de
     período/usuário — o relatório é "desde o início") e chamamos a
     mesma função. Retorna o array de 5 transições (cada uma com
     `.taxa`, `.qtdDe`, `.qtdPara`). Os números podem não bater
     exatamente com o card do dashboard porque o card respeita o
     filtro de período/usuário ativo lá; a REGRA de cálculo é a mesma. */
  static async _transicoesFunilVisaoCard() {
    if (typeof TaxaConversaoModule === 'undefined' || !TaxaConversaoModule.calcularDashboard) return [];
    const _SS = (typeof SupabaseSync !== 'undefined') ? SupabaseSync : null;

    /* Etapas de TODOS os leads (não-excluídos, arquivados inclusos),
       paginado — o cálculo de conversão fica certo mesmo se store.leads
       bater no teto de 1000 do PostgREST. */
    const leadsEtapas = (_SS && _SS.buscarLeadsEtapasCompleto) ? await _SS.buscarLeadsEtapasCompleto() : null;

    const bases = {
      leads:        leadsEtapas || (store.leads || []),
      agendamentos: (_SS && _SS.buscarAgendamentosCompleto) ? await _SS.buscarAgendamentosCompleto() : (store.agendamentos || []),
      visitas:      (_SS && _SS.buscarVisitasCompleto)      ? await _SS.buscarVisitasCompleto()      : (store.visitas || []),
      vendas:       (_SS && _SS.buscarVendasCompleto)       ? await _SS.buscarVendasCompleto()       : (store.vendas || []),
    };
    return TaxaConversaoModule.calcularDashboard(bases);
  }

  /* ================================================================
     1. LEADS POR ETAPA
     ================================================================ */
  static async exportarLeads() {
    const C = RelatoriosModule._COR;
    const E = RelatoriosModule._estilos();
    const wb = RelatoriosModule._wb();
    const etapas = { lead:'Lead', ligacao:'Ligação', agendamento:'Agendamento', visita:'Visita', venda:'Venda', carteira:'Carteira' };

    /* Chamado #110 — total de leads (e todas as contagens abaixo) passa
       a incluir os ARQUIVADOS (leadsPorEtapa(etapa, true)), com uma
       coluna "Arquivado" nas abas por etapa pra identificá-los. Antes
       usava o default incluirArquivados=false, que os escondia. */
    const total = store.leads.length || 1;

    /* Chamado #110 — "Ligações Registradas" via RPC (fonte única, sem
       o limit(200) do cache local). Ver _totalLigacoesGlobal. */
    const totalLigacoes = await RelatoriosModule._totalLigacoesGlobal();

    /* ── ABA 1: PAINEL RESUMO ── */
    const ws1 = wb.addWorksheet('📊 Resumo', { properties: { tabColor: { argb: 'FF'+C.vermelho } } });
    ws1.views = [{ showGridLines: false }];
    RelatoriosModule._addTitulo(ws1, '📊 BEYOND CRM — Leads por Etapa — Painel Resumo', 6);

    // Seção métricas principais
    ws1.addRow(['MÉTRICAS PRINCIPAIS']);
    const rs = ws1.lastRow; rs.height = 20;
    ws1.mergeCells(rs.number, 1, rs.number, 6);
    RelatoriosModule._estilo(rs.getCell(1), E.secao);

    ws1.addRow(['Total de Leads', total, '', 'Carteira (convertidos)', store.leadsPorEtapa('carteira', true).length, '']);
    ws1.addRow(['Taxa de Conversão', (store.leadsPorEtapa('carteira', true).length/total*100).toFixed(1)+'%', '', 'Ligações Registradas', totalLigacoes, '']);
    ws1.addRow([]);

    // Tabela funil
    ws1.addRow(['FUNIL DE CONVERSÃO']);
    const rf = ws1.lastRow; rf.height = 20;
    ws1.mergeCells(rf.number, 1, rf.number, 6);
    RelatoriosModule._estilo(rf.getCell(1), E.secao);

    /* "Número Mágico" (20-12-4-2-1-3) — meta absoluta de cada etapa. */
    const numeroMagico = { lead:20, ligacao:12, agendamento:4, visita:2, venda:1, carteira:3 };

    /* Contagem crua de cada etapa (com arquivados). */
    const contagens = STAGE_ORDER.map(e => store.leadsPorEtapa(e, true).length);

    /* Chamado #110 (reaberto) — "Conversão p/ Próxima" passa a usar
       EXATAMENTE as regras do card "Visão do Funil" do dashboard (ver
       _transicoesFunilVisaoCard). Cada linha (a partir de Ligação)
       mostra a conversão da etapa ANTERIOR para esta:
         Ligação      = Lead → Ligação
         Agendamento  = Ligação → Agendamento
         Visita       = Agendamento → Visita   (por evento)
         Venda        = Visita → Venda          (por evento)
         Carteira     = Venda → Carteira
       Lead continua "100% (base)" (não tem etapa anterior). */
    const trans = await RelatoriosModule._transicoesFunilVisaoCard();

    const funilHeaders = ['Etapa', 'Total', '% do Total', 'Conversão p/ Próxima', 'Status', 'Meta'];
    const funilRows = STAGE_ORDER.map((e, i) => {
      const n = contagens[i];
      const t = i > 0 ? trans[i - 1] : null;
      const convTaxa = i === 0 ? 100 : (t ? t.taxa : 0);

      /* Chamado #110 — Meta como % (razão entre o número-alvo desta
         etapa e o da anterior): Lead 100% (base), Ligação 12/20=60%,
         Agendamento 4/12=33,3%, Visita 2/4=50%, Venda 1/2=50%,
         Carteira 3/1=300%. */
      const metaAtual    = numeroMagico[e];
      const metaAnterior = i > 0 ? numeroMagico[STAGE_ORDER[i-1]] : null;
      const metaPct      = i === 0 ? 100 : Math.round((metaAtual / metaAnterior) * 1000) / 10;

      /* Status compara Conversão p/ Próxima (%) com Meta (%). */
      const atingiu = convTaxa >= metaPct;

      return [
        etapas[e], n, (n/total*100).toFixed(1)+'%',
        i === 0 ? '100% (base)' : convTaxa.toFixed(1)+'%',
        atingiu ? '✅ Atingido' : '⚠️ Abaixo',
        metaPct+'%',
      ];
    });
    RelatoriosModule._addTabela(ws1, funilHeaders, funilRows);

    // Colorir coluna Status
    const statusRowStart = ws1.rowCount - funilRows.length;
    funilRows.forEach((row, i) => {
      const cell = ws1.getRow(statusRowStart + i).getCell(5);
      if (row[4].includes('✅')) RelatoriosModule._estilo(cell, E.verde);
      else RelatoriosModule._estilo(cell, E.atencao);
    });

    ws1.columns = [{width:18},{width:10},{width:14},{width:22},{width:16},{width:10}];

    /* ── ABAS POR ETAPA ── */
    const coresEtapa = { lead:'3B82F6', ligacao:'10B981', agendamento:'8B5CF6', visita:'F59E0B', venda:'1B6B3A', carteira:'4A5568' };
    STAGE_ORDER.forEach(etapa => {
      /* Chamado #110 — inclui arquivados também nas abas por etapa. */
      const leads = store.leadsPorEtapa(etapa, true);
      if (!leads.length) return;
      const wsE = wb.addWorksheet(etapas[etapa], { properties: { tabColor: { argb: 'FF'+coresEtapa[etapa] } } });
      wsE.views = [{ showGridLines: false }];
      RelatoriosModule._addTitulo(wsE, `${etapas[etapa].toUpperCase()} — ${leads.length} leads`, 12);

      const headers = ['ID', 'Nome', 'Telefone', 'Fonte', 'Captador', 'Tentativas', 'Tags', 'Placa', 'FIPE', 'Mensalidade Est.', 'Arquivado', 'Observações'];
      const rows = leads.map(l => [
        l.id, l.nome, l.tel, l.fonte||'', l.captador||'',
        l.tentativas||0, (l.tags||[]).join(', '),
        l.placa||'', l.fipe||'', l.mensalidadeEst||'',
        l.arquivado === true ? 'Sim' : 'Não',
        l.obs||'',
      ]);
      RelatoriosModule._addTabela(wsE, headers, rows);
      wsE.columns = [{width:16},{width:20},{width:16},{width:22},{width:18},{width:12},{width:16},{width:10},{width:12},{width:16},{width:12},{width:30}];

      // Congelar primeira linha de dados
      wsE.views = [{ showGridLines: false, state: 'frozen', ySplit: 4 }];
    });

    await RelatoriosModule._baixarExcelJS(wb, 'BeyondCRM_Leads.xlsx');
  }

  /* ================================================================
     2. HISTÓRICO DE LIGAÇÕES
     ================================================================ */
  static async exportarLigacoes() {
    /* Chamado #112 — busca o histórico completo de ligações direto do
       banco (sem o limit(200) do cache de boot), pra que este relatório
       traga tudo desde o início da operação, não só as mais recentes. */
    const ligacoes = (typeof SupabaseSync !== 'undefined' && SupabaseSync.buscarLigacoesCompleto)
      ? await SupabaseSync.buscarLigacoesCompleto()
      : (store.ligacoes || []);
    if (!ligacoes.length) { Toast.show('Nenhuma ligação registrada ainda.', 'warning'); return; }
    const C = RelatoriosModule._COR;
    const E = RelatoriosModule._estilos();
    const wb = RelatoriosModule._wb();

    /* ── ABA 1: LIGAÇÕES DETALHADAS ── */
    const ws1 = wb.addWorksheet('📞 Ligações', { properties: { tabColor: { argb: 'FF'+C.verde } } });
    ws1.views = [{ showGridLines: false, state: 'frozen', ySplit: 4 }];
    RelatoriosModule._addTitulo(ws1, `📞 HISTÓRICO DE LIGAÇÕES — ${ligacoes.length} registros`, 7);
    const headers = ['Lead', 'Telefone', 'Resultado', 'Nº Tentativa', 'Especialista', 'Hora', 'Data'];
    const rows = ligacoes.map(l => [l.lead, l.tel, l.resultado||'', l.tentativa||0, l.esp||'', l.hora||'', l.data||'']);
    RelatoriosModule._addTabela(ws1, headers, rows);
    // Colorir resultado
    const dataStart = 5;
    rows.forEach((row, i) => {
      const cell = ws1.getRow(dataStart + i).getCell(3);
      if ((row[2]||'').includes('Agendamento')) RelatoriosModule._estilo(cell, E.verde);
      else if ((row[2]||'').includes('Errado') || (row[2]||'').includes('Não Atendeu')) RelatoriosModule._estilo(cell, E.alerta);
    });
    ws1.columns = [{width:22},{width:16},{width:22},{width:14},{width:20},{width:8},{width:12}];

    /* ── ABA 2: RESUMO POR RESULTADO ── */
    const ws2 = wb.addWorksheet('📊 Por Resultado', { properties: { tabColor: { argb: 'FF'+C.marinho } } });
    ws2.views = [{ showGridLines: false }];
    RelatoriosModule._addTitulo(ws2, '📊 RESUMO POR RESULTADO', 4);
    const contagem = {};
    ligacoes.forEach(l => { contagem[l.resultado||'—'] = (contagem[l.resultado||'—']||0)+1; });
    const total = ligacoes.length || 1;
    const resRows = Object.entries(contagem).sort((a,b)=>b[1]-a[1]).map(([r,n]) => [r, n, (n/total*100).toFixed(1)+'%', n > total*0.3 ? '⬆️ Alto' : '➡️ Normal']);
    RelatoriosModule._addTabela(ws2, ['Resultado', 'Qtd', '% do Total', 'Destaque'], resRows);
    ws2.columns = [{width:26},{width:10},{width:14},{width:14}];

    /* ── ABA 3: POR ESPECIALISTA ── */
    const ws3 = wb.addWorksheet('👤 Por Especialista', { properties: { tabColor: { argb: 'FF'+C.roxo } } });
    ws3.views = [{ showGridLines: false }];
    RelatoriosModule._addTitulo(ws3, '👤 LIGAÇÕES POR ESPECIALISTA', 4);
    const porEsp = {};
    ligacoes.forEach(l => {
      if (!porEsp[l.esp]) porEsp[l.esp] = { total: 0, agend: 0 };
      porEsp[l.esp].total++;
      if ((l.resultado||'').includes('Agendamento')) porEsp[l.esp].agend++;
    });
    const espRows = Object.entries(porEsp).sort((a,b)=>b[1].total-a[1].total).map(([e,v]) => [
      e, v.total, v.agend, (v.agend/v.total*100).toFixed(1)+'%'
    ]);
    RelatoriosModule._addTabela(ws3, ['Especialista', 'Total Ligações', 'Agendamentos', 'Taxa Conv.'], espRows, 'headerSec');
    ws3.columns = [{width:24},{width:16},{width:16},{width:14}];

    await RelatoriosModule._baixarExcelJS(wb, 'BeyondCRM_Ligacoes.xlsx');
  }

  /* ================================================================
     3. VENDAS
     ================================================================ */
  static async exportarVendas() {
    const C = RelatoriosModule._COR;
    const E = RelatoriosModule._estilos();
    const wb = RelatoriosModule._wb();
    const carteira = store.leads.filter(l => l.etapa === 'carteira');
    if (!carteira.length) { Toast.show('Nenhuma venda registrada ainda.', 'warning'); return; }

    /* Chamado #112 — busca o histórico completo de vendas direto do
       banco (sem o limit(500) do cache de boot), pra que os valores de
       adesão/mensalidade/rastreador/data batam mesmo pra associados
       antigos que caíram fora do cache local. */
    const vendasCompleto = (typeof SupabaseSync !== 'undefined' && SupabaseSync.buscarVendasCompleto)
      ? await SupabaseSync.buscarVendasCompleto()
      : (store.vendas || []);

    /* ════════════════════════════════════════════════════════════
       Chamado "Relatório vendas por mês não puxa valor de adesão"
       ════════════════════════════════════════════════════════════
       Bug: as colunas de Adesão/Mensalidade/Rastreador liam l.adesao /
       l.mensalidade / l.rastreador do objeto LEAD. Esses campos são
       preenchidos só no objeto local de quem faz a venda na sessão —
       NÃO vêm do banco no sync de leads. Após um F5, ficam undefined e
       o relatório mostrava 0 (adesão zerada, era a queixa do cliente).

       O valor real da venda mora em store.vendas (valorAdesao,
       valorMensalidade, valorRastreador). Aqui montamos um índice por
       lead_uuid e puxamos de lá; caímos no campo do lead só como
       fallback (venda ainda não sincronizada na sessão atual).
       Mesma raiz do Chamado #87 (ticket médio). */
    var vendaPorLead = {};
    (vendasCompleto || []).forEach(function(v) {
      if (v._lead_uuid) vendaPorLead[v._lead_uuid] = v;
    });
    /* Helpers: valor da venda (banco) com fallback pro campo do lead. */
    function _adesaoDe(l) {
      var v = vendaPorLead[l._uuid];
      if (v && v.valorAdesao != null) return Number(v.valorAdesao) || 0;
      return parseFloat((l.adesao||'0').replace(/[^0-9.,]/g,'').replace(',','.')) || 0;
    }
    function _mensalDe(l) {
      var v = vendaPorLead[l._uuid];
      if (v && v.valorMensalidade != null) return Number(v.valorMensalidade) || 0;
      return parseFloat((l.mensalidade||l.mensalidadeEst||'0').replace(/[^0-9.,]/g,'').replace(',','.')) || 0;
    }
    function _rastrDe(l) {
      var v = vendaPorLead[l._uuid];
      if (v && v.valorRastreador != null) return Number(v.valorRastreador) || 0;
      return parseFloat((l.rastreador||'0').replace(/[^0-9.,]/g,'').replace(',','.')) || 0;
    }
    /* Chamado #70 (reabertura) — coluna 'Data Venda' lia l.dataVenda, que
       vem de leads.data_venda (vazio) e some após F5. A data real está no
       registro da venda (store.vendas -> data_venda). Mesma raiz da adesão.
       Formata YYYY-MM-DD -> DD/MM/YYYY sem new Date() (evita drift de fuso
       em data-only). */
    function _dataVendaDe(l) {
      var v = vendaPorLead[l._uuid];
      var raw = (v && v.dataVenda) ? v.dataVenda : (l.dataVenda || '');
      if (!raw) return '';
      var s = String(raw).slice(0, 10);
      var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return m ? (m[3] + '/' + m[2] + '/' + m[1]) : String(raw);
    }

    /* ── ABA 1: VENDAS DETALHADAS ── */
    const ws1 = wb.addWorksheet('💰 Vendas', { properties: { tabColor: { argb: 'FF'+C.verde } } });
    ws1.views = [{ showGridLines: false, state: 'frozen', ySplit: 4 }];
    RelatoriosModule._addTitulo(ws1, `💰 RELATÓRIO DE VENDAS — ${carteira.length} associados`, 13);
    /* Chamado #43 — coluna de pessoa passou de "Captador" (quem captou
       o lead) para "Especialista" (quem FECHOU a venda). A fonte é
       lead.responsavel_nome, que na Opção B é o dono atual do lead =
       quem fechou. Resolve o pedido do cliente. */
    const headers = ['ID', 'Nome', 'Telefone', 'Fonte', 'Especialista', 'Data Venda', 'Adesão (R$)', 'Mensalidade (R$)', 'Rastreador (R$)', 'Placa', 'FIPE', 'Aniversário', 'Obs.'];
    const rows = carteira.map(l => [
      l.id, l.nome, l.tel, l.fonte||'', l.responsavel_nome || l.captador || '',
      _dataVendaDe(l),
      _adesaoDe(l),
      _mensalDe(l),
      _rastrDe(l),
      l.placa||'', l.fipe||'', l.aniversario||'', l.obs||'',
    ]);
    RelatoriosModule._addTabela(ws1, headers, rows);
    // Formatar colunas de moeda
    const dataRowStart = 5;
    rows.forEach((_, i) => {
      [7, 8, 9].forEach(col => {
        const cell = ws1.getRow(dataRowStart + i).getCell(col);
        cell.numFmt = '"R$"#,##0.00';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      });
    });
    // Linha de TOTAL
    const totalRow = ws1.addRow(['', 'TOTAL', '', '', '', '',
      carteira.reduce((s,l) => s + _adesaoDe(l), 0),
      carteira.reduce((s,l) => s + _mensalDe(l), 0),
      carteira.reduce((s,l) => s + _rastrDe(l), 0),
    ]);
    totalRow.height = 22;
    for (let c = 1; c <= 13; c++) RelatoriosModule._estilo(totalRow.getCell(c), E.headerSec);
    [7, 8, 9].forEach(col => { totalRow.getCell(col).numFmt = '"R$"#,##0.00'; });
    ws1.columns = [{width:16},{width:22},{width:16},{width:22},{width:18},{width:14},{width:14},{width:16},{width:14},{width:10},{width:12},{width:14},{width:28}];

    /* ── ABA 2: RESUMO POR ESPECIALISTA (chamado #43) ── */
    const ws2 = wb.addWorksheet('👤 Por Especialista', { properties: { tabColor: { argb: 'FF'+C.marinho } } });
    ws2.views = [{ showGridLines: false }];
    RelatoriosModule._addTitulo(ws2, '👤 VENDAS POR ESPECIALISTA', 5);
    const porCap = {};
    carteira.forEach(l => {
      /* Chamado #43 — agrupa por quem FECHOU (responsavel_nome), não
         por quem captou. Fallback pro captador se não houver dono. */
      const esp = l.responsavel_nome || l.captador || '—';
      if (!porCap[esp]) porCap[esp] = { vendas:0, adesao:0, mensal:0 };
      porCap[esp].vendas++;
      porCap[esp].adesao  += _adesaoDe(l);
      porCap[esp].mensal  += _mensalDe(l);
    });
    const capRows = Object.entries(porCap).sort((a,b)=>b[1].vendas-a[1].vendas).map(([c,v], i) => [
      i+1, c, v.vendas, v.adesao, v.mensal
    ]);
    RelatoriosModule._addTabela(ws2, ['Pos.','Especialista','Vendas','Total Adesão (R$)','Total Mensalidade (R$)'], capRows, 'headerSec');
    const cr = 5;
    capRows.forEach((_, i) => {
      ws2.getRow(cr+i).getCell(4).numFmt = '"R$"#,##0.00';
      ws2.getRow(cr+i).getCell(5).numFmt = '"R$"#,##0.00';
    });
    ws2.columns = [{width:6},{width:24},{width:12},{width:20},{width:24}];

    /* ── ABA 3: POR FONTE ── */
    const ws3 = wb.addWorksheet('📌 Por Fonte', { properties: { tabColor: { argb: 'FF'+C.azul } } });
    ws3.views = [{ showGridLines: false }];
    RelatoriosModule._addTitulo(ws3, '📌 VENDAS POR FONTE DE LEAD', 4);
    const porFonte = {};
    carteira.forEach(l => { porFonte[l.fonte||'—'] = (porFonte[l.fonte||'—']||0)+1; });
    const totalC = carteira.length || 1;
    const fonteRows = Object.entries(porFonte).sort((a,b)=>b[1]-a[1]).map(([f,n]) => [f, n, (n/totalC*100).toFixed(1)+'%']);
    RelatoriosModule._addTabela(ws3, ['Fonte','Vendas','% do Total'], fonteRows, 'headerSec');
    ws3.columns = [{width:28},{width:12},{width:14}];

    await RelatoriosModule._baixarExcelJS(wb, 'BeyondCRM_Vendas.xlsx');
  }

  /* ================================================================
     3.5 LEADS POR FONTE (Sprint 4 · RF-20)
     3 abas: (1) Consolidado por Fonte, (2) Detalhado, (3) Fonte × Especialista
     ================================================================ */
  static async exportarLeadsPorFonte() {
    if (!store.leads.length) { Toast.show('Nenhum lead cadastrado ainda.', 'warning'); return; }
    const C = RelatoriosModule._COR;
    const E = RelatoriosModule._estilos();
    const wb = RelatoriosModule._wb();

    /* ── ABA 1: CONSOLIDADO POR FONTE ── */
    const ws1 = wb.addWorksheet('📌 Por Fonte', { properties: { tabColor: { argb: 'FF'+C.marinho } } });
    ws1.views = [{ showGridLines: false, state: 'frozen', ySplit: 4 }];
    RelatoriosModule._addTitulo(ws1, `📌 LEADS POR FONTE — ${store.leads.length} leads no total`, 6);

    /* Agrupa leads e vendas por fonte.
       Chamado #116 — "Em Andamento" excluía também a etapa 'lead' (recém
       captado, ainda sem contato), então Em Andamento + Vendas Fechadas
       nunca fechava com o Total daquela fonte (sobrava exatamente a
       quantidade de leads ainda na etapa Lead). "Em Andamento" agora é
       "tudo que não é Carteira" (inclui Lead), o que faz Total = Em
       Andamento + Vendas Fechadas por construção. */
    const porFonte = {};
    store.leads.forEach(l => {
      const f = l.fonte || '— Sem fonte —';
      if (!porFonte[f]) porFonte[f] = { total: 0, ativos: 0, vendas: 0, mensal: 0 };
      porFonte[f].total++;
      if (l.etapa !== 'carteira')  porFonte[f].ativos++;
      if (l.etapa === 'carteira') {
        porFonte[f].vendas++;
        const m = parseFloat(String(l.mensalidade || l.mensalidadeEst || '0').replace(/[^0-9.,]/g,'').replace(/\./g,'').replace(',','.'));
        if (!isNaN(m)) porFonte[f].mensal += m;
      }
    });

    const total = store.leads.length || 1;
    const rows1 = Object.entries(porFonte)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([fonte, v]) => {
        const conv = v.total ? (v.vendas / v.total * 100).toFixed(1) + '%' : '0%';
        return [ fonte, v.total, (v.total/total*100).toFixed(1)+'%', v.ativos, v.vendas, conv ];
      });
    RelatoriosModule._addTabela(ws1, ['Fonte', 'Total Leads', '% do Total', 'Em Andamento', 'Vendas Fechadas', 'Taxa Conversão'], rows1);

    /* Colorir taxa de conversão: verde ≥15%, amarelo 5-15%, vermelho <5% */
    rows1.forEach((r, i) => {
      const cell = ws1.getRow(5 + i).getCell(6);
      const pct = parseFloat(r[5]);
      if (pct >= 15)      RelatoriosModule._estilo(cell, E.verde);
      else if (pct >= 5)  RelatoriosModule._estilo(cell, E.atencao);
      else                RelatoriosModule._estilo(cell, E.alerta);
    });
    ws1.columns = [{width:28},{width:14},{width:14},{width:16},{width:16},{width:18}];

    /* ── ABA 2: DETALHADO — todos os leads com sua fonte ── */
    const ws2 = wb.addWorksheet('📋 Detalhado', { properties: { tabColor: { argb: 'FF'+C.verde } } });
    ws2.views = [{ showGridLines: false, state: 'frozen', ySplit: 4 }];
    RelatoriosModule._addTitulo(ws2, `📋 DETALHAMENTO POR LEAD — ${store.leads.length} registros`, 7);
    const rows2 = store.leads
      .slice()
      .sort((a, b) => (a.fonte || '').localeCompare(b.fonte || ''))
      .map(l => [ l.id || '—', l.nome || '—', l.tel || '—', l.fonte || '—', l.etapa || '—', l.captador || '—', l.quemIndicou || '—' ]);
    RelatoriosModule._addTabela(ws2, ['ID', 'Nome', 'Telefone', 'Fonte', 'Etapa', 'Captador', 'Quem Indicou'], rows2);
    ws2.columns = [{width:16},{width:26},{width:16},{width:26},{width:14},{width:22},{width:22}];

    /* ── ABA 3: CRUZAMENTO FONTE × ESPECIALISTA ── */
    const ws3 = wb.addWorksheet('👥 Fonte × Especialista', { properties: { tabColor: { argb: 'FF'+C.roxo } } });
    ws3.views = [{ showGridLines: false }];
    RelatoriosModule._addTitulo(ws3, '👥 CRUZAMENTO FONTE × ESPECIALISTA', 5);

    const cruz = {};
    store.leads.forEach(l => {
      const f = l.fonte || '— Sem fonte —';
      const e = l.captador || '— Sem captador —';
      const key = f + '|||' + e;
      if (!cruz[key]) cruz[key] = { fonte: f, esp: e, total: 0, vendas: 0 };
      cruz[key].total++;
      if (l.etapa === 'carteira') cruz[key].vendas++;
    });
    const rows3 = Object.values(cruz)
      .sort((a, b) => (a.fonte === b.fonte ? b.total - a.total : a.fonte.localeCompare(b.fonte)))
      .map(x => [ x.fonte, x.esp, x.total, x.vendas, x.total ? (x.vendas/x.total*100).toFixed(1)+'%' : '0%' ]);
    RelatoriosModule._addTabela(ws3, ['Fonte', 'Especialista', 'Leads', 'Vendas', 'Conv.'], rows3);
    ws3.columns = [{width:26},{width:22},{width:12},{width:12},{width:12}];

    await RelatoriosModule._baixarExcelJS(wb, 'BeyondCRM_Leads_por_Fonte.xlsx');
  }

  /* ================================================================
     4. CARTEIRA DE ASSOCIADOS
     ================================================================ */
  static async exportarCarteira() {
    const C = RelatoriosModule._COR;
    const E = RelatoriosModule._estilos();
    const wb = RelatoriosModule._wb();
    const carteira = store.leads.filter(l => l.etapa === 'carteira');
    if (!carteira.length) { Toast.show('Nenhum associado na carteira.', 'warning'); return; }

    /* Chamado #112 — busca o histórico completo de vendas direto do
       banco (sem o limit(500) do cache de boot), pra que Adesão/Data
       Venda batam mesmo pra associados antigos fora do cache local. */
    const vendasCompleto = (typeof SupabaseSync !== 'undefined' && SupabaseSync.buscarVendasCompleto)
      ? await SupabaseSync.buscarVendasCompleto()
      : (store.vendas || []);

    /* ── ABA 1: CARTEIRA COMPLETA ── */
    const ws1 = wb.addWorksheet('👛 Carteira', { properties: { tabColor: { argb: 'FF4A5568' } } });
    ws1.views = [{ showGridLines: false, state: 'frozen', ySplit: 4 }];
    RelatoriosModule._addTitulo(ws1, `👛 CARTEIRA DE ASSOCIADOS — ${carteira.length} registros`, 13);
    const headers = ['ID','Nome','Telefone','Placa','FIPE','Mensalidade (R$)','Adesão (R$)','Rastreador (R$)','Data Venda','Aniversário','Fonte','Captador','Obs.'];
    /* Chamado #113/#117 — Mensalidade e Rastreador liam direto do LEAD
       (l.mensalidade/l.mensalidadeEst, l.rastreador). Mesmo bug de sempre
       (#105/#87/#101): o valor real é o que foi preenchido no formulário
       da etapa Venda, que vai pra vendas.valorMensalidade/valorRastreador
       — o campo do lead é só a estimativa anterior ao fechamento, quase
       sempre vazia ou diferente do valor final. Agora usam _mensalLead/
       _rastreadorLead (valor real da venda, com fallback pro campo do
       lead só se a venda não for encontrada). */
    const rows = carteira.map(l => [
      l.id, l.nome, l.tel, l.placa||'', l.fipe||'',
      RelatoriosModule._mensalLead(l, vendasCompleto),
      RelatoriosModule._adesaoLead(l, vendasCompleto),
      RelatoriosModule._rastreadorLead(l, vendasCompleto),
      RelatoriosModule._dataVendaLead(l, vendasCompleto), l.aniversario||'', l.fonte||'', l.captador||'', l.obs||'',
    ]);
    RelatoriosModule._addTabela(ws1, headers, rows);
    rows.forEach((_, i) => {
      [6,7,8].forEach(c => { const cell = ws1.getRow(5+i).getCell(c); cell.numFmt = '"R$"#,##0.00'; cell.alignment = {horizontal:'right',vertical:'middle'}; });
    });
    ws1.columns = [{width:16},{width:22},{width:16},{width:10},{width:12},{width:16},{width:14},{width:14},{width:14},{width:14},{width:22},{width:18},{width:28}];

    /* ── ABA 2: ANIVERSARIANTES ── */
    const hoje = new Date();
    const anivs = carteira.filter(l => l.aniversario).map(l => {
      const d = new Date(l.aniversario);
      const prox = new Date(hoje.getFullYear(), d.getMonth(), d.getDate());
      if (prox < hoje) prox.setFullYear(hoje.getFullYear()+1);
      return { ...l, diasRestantes: Math.ceil((prox-hoje)/86400000), dataFmt: d.toLocaleDateString('pt-BR') };
    }).sort((a,b) => a.diasRestantes - b.diasRestantes);

    const ws2 = wb.addWorksheet('🎂 Aniversariantes', { properties: { tabColor: { argb: 'FF'+C.vermelho } } });
    ws2.views = [{ showGridLines: false }];
    RelatoriosModule._addTitulo(ws2, '🎂 ANIVERSARIANTES DA CARTEIRA', 5);
    const anivRows = anivs.map(l => [l.nome, l.tel, l.dataFmt, l.diasRestantes, l.diasRestantes===0?'🎉 HOJE!':l.diasRestantes<=7?'Esta semana':'Próximo']);
    RelatoriosModule._addTabela(ws2, ['Nome','Telefone','Data Aniversário','Dias Restantes','Status'], anivRows, 'header');
    // Destacar quem faz aniversário logo
    anivRows.forEach((row, i) => {
      const cell = ws2.getRow(5+i).getCell(5);
      if (row[3] === 0) RelatoriosModule._estilo(cell, E.alerta);
      else if (row[3] <= 7) RelatoriosModule._estilo(cell, E.atencao);
      else RelatoriosModule._estilo(cell, E.verde);
    });
    ws2.columns = [{width:24},{width:16},{width:18},{width:16},{width:16}];

    await RelatoriosModule._baixarExcelJS(wb, 'BeyondCRM_Carteira.xlsx');
  }

  /* ================================================================
     5. CONVERSÃO DO FUNIL
     ================================================================ */
  static async exportarFunil() {
    const C = RelatoriosModule._COR;
    const E = RelatoriosModule._estilos();
    const wb = RelatoriosModule._wb();
    const etapas = { lead:'Lead', ligacao:'Ligação', agendamento:'Agendamento', visita:'Visita', venda:'Venda', carteira:'Carteira' };

    /* Chamado #114 (+ #110 reaberto) — aba "Funil":
       1) inclui arquivados nas contagens.
       2) "Meta" vira % (razão entre o número-alvo desta etapa e o da
          anterior — 100/60/33,3/50/50/300).
       3) "Conversão Etapa Anterior" usa as MESMAS regras do card
          "Visão do Funil" do dashboard (_transicoesFunilVisaoCard).
       4) "Status vs Meta" compara os dois percentuais.
       5) "% do Total" — bug à parte (#114): dividia pelo total de leads
          na etapa "Lead" (`totais[0]`), não pelo total real de leads no
          funil (soma de todas as etapas). Agora usa a soma de todas. */
    const numeroMagico = { lead:20, ligacao:12, agendamento:4, visita:2, venda:1, carteira:3 };
    const contagens = STAGE_ORDER.map(e => store.leadsPorEtapa(e, true).length);
    const totalGeral = contagens.reduce((a, b) => a + b, 0) || 1;
    const trans = await RelatoriosModule._transicoesFunilVisaoCard();

    /* ── ABA 1: FUNIL PRINCIPAL ── */
    const ws1 = wb.addWorksheet('🔻 Funil', { properties: { tabColor: { argb: 'FF'+C.vermelho } } });
    ws1.views = [{ showGridLines: false }];
    RelatoriosModule._addTitulo(ws1, '🔻 ANÁLISE DE CONVERSÃO DO FUNIL', 6);

    const funilHeaders = ['Etapa','Total Leads','% do Total','Conversão Etapa Anterior','Status vs Meta','Meta'];
    const funilRows = STAGE_ORDER.map((e, i) => {
      const n = contagens[i];
      const t = i > 0 ? trans[i - 1] : null;
      const convTaxa = i === 0 ? 100 : (t ? t.taxa : 0);

      const metaAtual    = numeroMagico[e];
      const metaAnterior = i > 0 ? numeroMagico[STAGE_ORDER[i-1]] : null;
      const metaPct      = i === 0 ? 100 : Math.round((metaAtual / metaAnterior) * 1000) / 10;

      const atingiu = convTaxa >= metaPct;

      return [
        etapas[e], n, (n/totalGeral*100).toFixed(1)+'%',
        i === 0 ? '100% (base)' : convTaxa.toFixed(1)+'%',
        atingiu ? '✅ Atingido' : '⚠️ Abaixo',
        metaPct+'%',
      ];
    });
    RelatoriosModule._addTabela(ws1, funilHeaders, funilRows);
    funilRows.forEach((row, i) => {
      const cell = ws1.getRow(5+i).getCell(5);
      if (row[4].includes('✅')) RelatoriosModule._estilo(cell, E.verde);
      else RelatoriosModule._estilo(cell, E.atencao);
    });
    ws1.columns = [{width:18},{width:14},{width:14},{width:24},{width:18},{width:10}];

    /* ── ABA 2: CONVERSÃO POR FONTE ── */
    const ws2 = wb.addWorksheet('📌 Por Fonte', { properties: { tabColor: { argb: 'FF'+C.azul } } });
    ws2.views = [{ showGridLines: false }];
    RelatoriosModule._addTitulo(ws2, '📌 CONVERSÃO POR FONTE DE LEAD', 5);
    const porFonte = {};
    store.leads.forEach(l => {
      const f = l.fonte||'—';
      if (!porFonte[f]) porFonte[f] = { total:0, carteira:0, agend:0 };
      porFonte[f].total++;
      if (l.etapa==='carteira') porFonte[f].carteira++;
      if (['agendamento','visita','venda','carteira'].includes(l.etapa)) porFonte[f].agend++;
    });
    const fonteRows = Object.entries(porFonte).sort((a,b)=>b[1].total-a[1].total).map(([f,v]) => [
      f, v.total, v.agend, v.carteira, v.total>0?(v.carteira/v.total*100).toFixed(1)+'%':'—'
    ]);
    RelatoriosModule._addTabela(ws2, ['Fonte','Total Leads','Chegaram ao Agend.','Convertidos','Taxa Conv.'], fonteRows, 'headerSec');
    ws2.columns = [{width:28},{width:14},{width:22},{width:16},{width:14}];

    /* ── ABA 3: LEADS (detalhado, com data de criação) ──
       Chamado #114 (reaberto) — o relatório não tem filtro e gera tudo
       desde o início; esta aba tem 1 linha por lead com a data de
       criação, pra filtrar/pivotar por período direto no Excel. */
    const ws3 = wb.addWorksheet('📋 Leads', { properties: { tabColor: { argb: 'FF3B82F6' } } });
    ws3.views = [{ showGridLines: false, state: 'frozen', ySplit: 4 }];
    RelatoriosModule._addTitulo(ws3, `📋 LEADS — ${store.leads.length} registros (arquivados inclusos)`, 8);
    const leadsRows = store.leads.slice()
      .sort((a, b) => String(a._createdAt || '').localeCompare(String(b._createdAt || '')))
      .map(l => [
        l.id || '—', l.nome || '—', l.tel || '—',
        etapas[l.etapa] || l.etapa || '—', l.fonte || '—', l.captador || '—',
        l.arquivado ? 'Sim' : 'Não',
        l._createdAt ? new Date(l._createdAt).toLocaleDateString('pt-BR') : '—',
      ]);
    RelatoriosModule._addTabela(ws3, ['Código','Nome','Telefone','Etapa','Fonte','Captador','Arquivado','Data de Criação'], leadsRows);
    ws3.columns = [{width:16},{width:26},{width:16},{width:16},{width:24},{width:22},{width:12},{width:16}];

    await RelatoriosModule._baixarExcelJS(wb, 'BeyondCRM_Funil.xlsx');
  }

  /* ================================================================
     6. DESEMPENHO POR ESPECIALISTA
     ================================================================
     Chamado #115 (reaberto) — passou a ter um seletor de período
     (modal). exportarDesempenho() só abre o modal; _exportarDesempenho()
     gera de fato, com o período escolhido. */
  static exportarDesempenho() {
    $('#desemp-periodo').val('tudo');
    $('#desemp-custom-wrap').hide();
    if (typeof Modal !== 'undefined') Modal.abrir('modal-desemp-periodo');
  }

  static onDesempPeriodoChange() {
    $('#desemp-custom-wrap').toggle($('#desemp-periodo').val() === 'custom');
  }

  static async exportarDesempenhoConfirmar() {
    const preset = $('#desemp-periodo').val() || 'tudo';
    const de  = $('#desemp-de').val();
    const ate = $('#desemp-ate').val();
    if (typeof Modal !== 'undefined') Modal.fechar('modal-desemp-periodo');
    await RelatoriosModule._exportarDesempenho({ preset, de, ate });
  }

  /* Resolve o preset do modal em { ini, fim } (janela dos indicadores
     gerais — null/null = tudo) e { cicloIni, cicloFim } (janela da
     comissão — sempre um intervalo válido). */
  static _resolverPeriodoDesemp(preset, deStr, ateStr) {
    const _ciclo = (typeof MetasModule !== 'undefined' && MetasModule._cicloAtual) ? MetasModule._cicloAtual() : { ini: null, fim: null };
    const hoje = new Date();
    let ini = null, fim = null;

    if (preset === 'ciclo-atual') {
      ini = _ciclo.ini; fim = _ciclo.fim;
    } else if (preset === 'ciclo-anterior') {
      /* Chamado #123 — o ciclo do relatório saia errado (ex.: "26/07 →
         25/09", dois meses). Duas causas, as duas corrigidas:
           1) a raiz estava no MetasModule._cicloAtual (#122), que
              devolvia um ciclo de 2 meses por overflow de setMonth;
           2) aqui o ciclo anterior era derivado com setMonth(-1) em
              cópias soltas — replicando a mesma classe de bug.
         Agora delega pro _cicloPorOffset(-1), fonte ÚNICA de janela de
         ciclo (a mesma que alimenta o seletor de Minha Performance e do
         Atingimento de Metas). Assim relatório e tela nunca divergem. */
      const _ant = (typeof MetasModule !== 'undefined' && MetasModule._cicloPorOffset)
        ? MetasModule._cicloPorOffset(-1)
        : { ini: null, fim: null };
      ini = _ant.ini; fim = _ant.fim;
    } else if (preset === 'mes-atual') {
      ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1, 0, 0, 0, 0);
      fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (preset === 'mes-anterior') {
      ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1, 0, 0, 0, 0);
      fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0, 23, 59, 59, 999);
    } else if (preset === 'custom') {
      ini = deStr  ? new Date(deStr + 'T00:00:00')  : null;
      fim = ateStr ? new Date(ateStr + 'T23:59:59') : null;
    }
    /* 'tudo' → ini/fim ficam null. */

    /* Comissão: pra 'tudo' usa o ciclo vigente; senão a própria janela. */
    const cicloIni = (preset === 'tudo') ? _ciclo.ini : (ini || _ciclo.ini);
    const cicloFim = (preset === 'tudo') ? _ciclo.fim : (fim || _ciclo.fim);
    return { ini, fim, cicloIni, cicloFim };
  }

  static async _exportarDesempenho(opts) {
    opts = opts || {};
    const C = RelatoriosModule._COR;
    const E = RelatoriosModule._estilos();
    const wb = RelatoriosModule._wb();

    const per = RelatoriosModule._resolverPeriodoDesemp(opts.preset || 'tudo', opts.de, opts.ate);
    const emPeriodo = (iso, dataOnly) => {
      if (!per.ini && !per.fim) return true; /* 'tudo' */
      if (!iso) return false;
      const d = dataOnly ? new Date(String(iso).slice(0, 10) + 'T00:00:00') : new Date(iso);
      if (per.ini && d < per.ini) return false;
      if (per.fim && d > per.fim) return false;
      return true;
    };
    const LBL_PERIODO = {
      'tudo': 'Tudo — desde o início da operação',
      'ciclo-atual': 'Ciclo de comissão atual',
      'ciclo-anterior': 'Ciclo de comissão anterior',
      'mes-atual': 'Mês atual', 'mes-anterior': 'Mês anterior', 'custom': 'Período personalizado',
    };
    const fmtD = d => d ? d.toLocaleDateString('pt-BR') : '—';
    const periodoTxt = (LBL_PERIODO[opts.preset || 'tudo'] || '') +
      ((per.ini || per.fim) ? `  (${fmtD(per.ini)} → ${fmtD(per.fim)})` : '');

    /* Chamado #112 — histórico completo direto do banco (paginado, #111). */
    const ligacoesCompleto = (typeof SupabaseSync !== 'undefined' && SupabaseSync.buscarLigacoesCompleto) ? await SupabaseSync.buscarLigacoesCompleto() : (store.ligacoes || []);
    const vendasCompleto   = (typeof SupabaseSync !== 'undefined' && SupabaseSync.buscarVendasCompleto)   ? await SupabaseSync.buscarVendasCompleto()   : (store.vendas || []);
    const visitasCompleto  = (typeof SupabaseSync !== 'undefined' && SupabaseSync.buscarVisitasCompleto)  ? await SupabaseSync.buscarVisitasCompleto()  : (store.visitas || []);

    // Calcular métricas
    /* Chamado #115/#117 (reaberto) — só ativos: especialista/supervisor
       COM meta configurada (sem meta = usuário de teste, regra do
       cliente no #117) + gerente ativo (gerente não tem meta de vendas,
       mas gerencia — entra sempre). Guarda o usuário (`_usuario`) pros
       degraus de meta na comissão. */
    const esp = {};
    store.usuarios
      .filter(u => u.status !== 'inativo' && (
        u.perfil === 'gerente' ||
        (['especialista', 'supervisor'].includes(u.perfil) && (Number(u.meta_vendas) > 0 || Number(u.meta_mensalidade) > 0))
      ))
      /* Chamado #130 — mesma regra do card Atingimento: quem entrou na
         equipe depois do ciclo do relatório não aparece nele, e a meta
         dessa pessoa não entra no total exportado. */
      .filter(u => !per.cicloFim || MetasModule._fazAlteParteDoCiclo(u, per.cicloFim))
      .forEach(u => {
        /* Chamado #124 — as colunas "Meta Vendas" e "Meta Mensal" seguem o
           ciclo do relatório. Exportar o "ciclo anterior" trazia a meta de
           hoje ao lado da venda de lá, e o "% Meta" saía comparando duas
           épocas diferentes. Ancora em cicloFim, igual às telas. */
        const _mvRel = MetasModule._metasDoCiclo(u, per.cicloFim);
        esp[u.nome] = {
          nome:u.nome, sigla:u.sigla, filial:u.filial,
          metaV:_mvRel.meta_vendas, metaM:_mvRel.meta_mensalidade,
          lig:0, agend:0, visitas:0, vendas:0, mensal:0, adesaoCiclo:0, comissaoCiclo:0,
          _id: u._id || u.id, _usuario: u,
        };
      });
    /* Chamado #126 — a coluna "Ligações" deste relatório somava TODA
       ligação do período, inclusive as feitas na etapa da carteira —
       divergindo do KPI "Ligações" do dashboard, que desconta essas
       desde o #83. Duas telas, o mesmo rótulo, números diferentes.
       Agora aplica o MESMO helper de regra do dashboard, então
       relatório e KPI respondem à mesma definição. */
    const _mapaCartRel = (typeof FunilModule !== 'undefined' && FunilModule._mapaCarteiraEm)
      ? FunilModule._mapaCarteiraEm() : Object.create(null);
    ligacoesCompleto.forEach(l => {
      if (!esp[l.esp]) return;
      if (!emPeriodo(l._data_hora || l._created_at)) return;
      if (typeof FunilModule !== 'undefined' && FunilModule._ligacaoContaNoTotal
          && !FunilModule._ligacaoContaNoTotal(l, _mapaCartRel)) return;
      esp[l.esp].lig++;
    });
    /* Chamado #117 — Agendamentos = ocupação do lead atribuída ao
       RESPONSÁVEL ATUAL (fallback captador), excluindo lead-filho. Com
       período, filtra pela data de criação do lead. */
    store.leads.forEach(l => {
      if (l.lead_pai_id) return;
      if (!emPeriodo(l._createdAt)) return;
      const e = esp[l.responsavel_nome || l.captador]; if (!e) return;
      if (['agendamento','visita','venda','carteira'].includes(l.etapa)) e.agend++;
    });

    const espPorId = {};
    Object.values(esp).forEach(e => { if (e._id) espPorId[e._id] = e; });

    /* Chamado #115 — "Visitas" e "Vendas" passam a usar a MESMA REGRA do
       Número Mágico do dashboard (FunilModule.renderNumeroMagico): conta
       LEADS DISTINTOS (não registros) por especialista, a partir dos
       registros reais de visita (store.visitas.tipoResultado), não mais
       da etapa atual do lead:
         Visitas = leads distintos com visita 'nao_fechou' OU 'venda'
         Vendas  = leads distintos com visita 'venda'
       (C2, delay e "sem resultado ainda" ficam de fora dos dois). */
    /* ════════════════════════════════════════════════════════════
       Chamado #129 — "Visitas" e "Vendas" alinhadas ao Dashboard
       ════════════════════════════════════════════════════════════
       Duas inconsistências internas foram encontradas aqui:

       1) A coluna "Vendas" saía da tabela `visitas` (por quem registrou
          a visita), enquanto a coluna "Mensal", logo ao lado, saía da
          tabela `vendas` (por quem tem o crédito). Duas fontes para a
          mesma coisa, na mesma linha da planilha — dava para o
          especialista ter 3 em "Vendas" e mensalidade de 4 vendas.
          Depois da correção do #127/#128, que passou a creditar a venda
          ao responsável do lead, a divergência ficaria permanente:
          `vendas.especialista_id` é o dono do cliente, mas
          `visitas.especialista_id` continua sendo quem digitou.

       2) O recorte de período usava `visitas.created_at` — quando a
          linha foi inserida. O #121 já corrigiu isso na RPC do Número
          Mágico e no Dashboard: para visita de resultado 'venda', a data
          que vale é a `data_venda`. O relatório ficou de fora, então
          venda retroativa caía no ciclo do cadastro, não no da venda —
          exatamente o defeito do #121 sobrevivendo aqui.

       Agora:
         Vendas  → tabela `vendas`, por data_venda e por quem tem o
                   crédito. Mesma fonte, regra e dedup do Atingimento.
         Visitas → tabela `visitas` (a visita é evento de campo, e quem
                   a registrou é quem esteve lá), mas com a data efetiva:
                   data_venda quando o resultado foi venda. */

    /* data_venda mais recente por lead — data efetiva das visitas 'venda'. */
    const _dataVendaPorLead = {};
    vendasCompleto.forEach(v => {
      if (!v._lead_uuid || !v.dataVenda) return;
      const dv = new Date(String(v.dataVenda).slice(0, 10) + 'T00:00:00');
      if (isNaN(dv.getTime())) return;
      if (!_dataVendaPorLead[v._lead_uuid] || dv > _dataVendaPorLead[v._lead_uuid]) {
        _dataVendaPorLead[v._lead_uuid] = dv;
      }
    });

    const visitasLeadsPorEsp = {}; /* espId -> Set(lead_uuid) */
    visitasCompleto.forEach(v => {
      if (!v._esp_id || !v._lead_uuid) return;
      if (v.tipoResultado !== 'nao_fechou' && v.tipoResultado !== 'venda') return;
      /* Data efetiva: venda usa data_venda; não-fechou usa o registro. */
      const efetiva = (v.tipoResultado === 'venda' && _dataVendaPorLead[v._lead_uuid])
        ? _dataVendaPorLead[v._lead_uuid]
        : (v.created_at ? new Date(v.created_at) : null);
      if (!efetiva || isNaN(efetiva.getTime())) return;
      if (per.ini && efetiva < per.ini) return;
      if (per.fim && efetiva > per.fim) return;
      if (!visitasLeadsPorEsp[v._esp_id]) visitasLeadsPorEsp[v._esp_id] = new Set();
      visitasLeadsPorEsp[v._esp_id].add(v._lead_uuid);
    });

    /* Vendas: mesma fonte e regra do Atingimento de Metas. */
    const vendaLeadsPorEsp = {}; /* espId -> Set(lead_uuid) */
    vendasCompleto.forEach(v => {
      if (!v._esp_id || !v._lead_uuid) return;
      if (!emPeriodo(v.dataVenda || v.created_at, !!v.dataVenda)) return;
      if (!vendaLeadsPorEsp[v._esp_id]) vendaLeadsPorEsp[v._esp_id] = new Set();
      vendaLeadsPorEsp[v._esp_id].add(v._lead_uuid);
    });

    Object.keys(espPorId).forEach(id => {
      espPorId[id].visitas = visitasLeadsPorEsp[id] ? visitasLeadsPorEsp[id].size : 0;
      espPorId[id].vendas  = vendaLeadsPorEsp[id]   ? vendaLeadsPorEsp[id].size   : 0;
    });

    /* Chamado #105 — mensalidade real de vendas.valorMensalidade
       (l.mensalidade nunca é populado no sync). Segue o período. */
    /* Chamado #128 — uma venda por cliente, para a mensalidade não
       dobrar caso exista mais de uma linha para o mesmo lead. */
    const _vendasNoPeriodo = vendasCompleto.filter(v =>
      v._esp_id && espPorId[v._esp_id] && emPeriodo(v.dataVenda || v.created_at, !!v.dataVenda));
    const _vendasMensalUnicas = (typeof MetasModule !== 'undefined' && MetasModule._dedupVendasPorLead)
      ? MetasModule._dedupVendasPorLead(_vendasNoPeriodo)
      : _vendasNoPeriodo;
    _vendasMensalUnicas.forEach(v => {
      const e = espPorId[v._esp_id];
      if (!e) return;
      e.mensal += Number(v.valorMensalidade || 0);
    });

    /* Chamado #115 — "Adesão" e "Comissão Prevista" (RN-16/17). Janela
       da comissão = per.cicloIni/cicloFim:
         - "Tudo"          → ciclo de comissão vigente (26→25);
         - "Ciclo anterior"→ o ciclo fechado (resolve o pedido do #115
                             reaberto: consultar o ciclo pra pagar);
         - demais          → a janela do período escolhido.
       Comissão reinicia a cada ciclo, por isso ela nunca soma "desde o
       início" mesmo quando o resto da planilha soma. */
    const vendasCicloPorId = {};
    if (per.cicloIni && per.cicloFim) {
      vendasCompleto.forEach(v => {
        if (!v._esp_id) return;
        const dt = v.dataVenda ? new Date(String(v.dataVenda).slice(0, 10) + 'T00:00:00') : new Date(v.created_at);
        if (dt < per.cicloIni || dt > per.cicloFim) return;
        if (!vendasCicloPorId[v._esp_id]) vendasCicloPorId[v._esp_id] = [];
        vendasCicloPorId[v._esp_id].push(v);
      });
    }
    Object.values(esp).forEach(e => {
      const cicloVendas = vendasCicloPorId[e._id] || [];
      const com = RelatoriosModule._comissaoCicloEsp(cicloVendas, e._usuario, per.cicloFim);
      e.adesaoCiclo   = com.somaAdesao;
      e.comissaoCiclo = com.comissao;
    });

    /* Chamado #115/#117 — ranking por quantidade de vendas, valor de
       mensalidade como critério de desempate. */
    const espArr = Object.values(esp).sort((a,b)=> b.vendas-a.vendas || b.mensal-a.mensal);

    /* ── ABA 1: DESEMPENHO COMPLETO ── */
    const ws1 = wb.addWorksheet('🏆 Desempenho', { properties: { tabColor: { argb: 'FF'+C.vermelho } } });
    ws1.views = [{ showGridLines: false }];
    /* Chamado #123 — além das datas, nomeia o ciclo ("Setembro de 2026")
       com o MESMO rótulo dos seletores de tela. Era impossível conferir
       se o relatório estava no ciclo certo olhando só duas datas soltas. */
    const cicloTxt = (per.cicloIni && per.cicloFim)
      ? `  |  Adesão/Comissão: ${MetasModule._rotuloCiclo({ ini: per.cicloIni, fim: per.cicloFim })}` +
        `  —  ${per.cicloIni.toLocaleDateString('pt-BR')} → ${per.cicloFim.toLocaleDateString('pt-BR')}`
      : '';
    RelatoriosModule._addTitulo(ws1, `🏆 DESEMPENHO DOS ESPECIALISTAS  ·  ${periodoTxt}${cicloTxt}`, 13);
    const headers = ['Especialista','Filial','Ligações','Agendamentos','Visitas','Vendas','Meta Vendas','% Meta Vendas','Mensal. (R$)','Meta Mensal (R$)','% Meta Mensal','Adesão (R$)','Comissão Prevista (R$)'];
    const rows = espArr.map(e => [
      e.nome, e.filial, e.lig, e.agend, e.visitas, e.vendas,
      e.metaV, e.metaV ? (e.vendas/e.metaV*100).toFixed(1)+'%' : '—',
      e.mensal, e.metaM, e.metaM ? (e.mensal/e.metaM*100).toFixed(1)+'%' : '—',
      e.adesaoCiclo, e.comissaoCiclo,
    ]);
    RelatoriosModule._addTabela(ws1, headers, rows);
    // Colorir % meta vendas
    rows.forEach((row, i) => {
      const pct = parseFloat(row[7]) || 0;
      const cell = ws1.getRow(5+i).getCell(8);
      if (pct >= 100) RelatoriosModule._estilo(cell, E.verde);
      else if (pct >= 60) RelatoriosModule._estilo(cell, E.atencao);
      else if (pct > 0) RelatoriosModule._estilo(cell, E.alerta);
      // Moeda
      ws1.getRow(5+i).getCell(9).numFmt = '"R$"#,##0.00';
      ws1.getRow(5+i).getCell(10).numFmt = '"R$"#,##0.00';
      ws1.getRow(5+i).getCell(12).numFmt = '"R$"#,##0.00';
      ws1.getRow(5+i).getCell(13).numFmt = '"R$"#,##0.00';
    });
    ws1.columns = [{width:24},{width:20},{width:12},{width:16},{width:12},{width:12},{width:14},{width:16},{width:16},{width:18},{width:16},{width:18},{width:20}];

    /* ── ABA 2: RANKING ── */
    const ws2 = wb.addWorksheet('🥇 Ranking', { properties: { tabColor: { argb: 'FF'+C.amarelo } } });
    ws2.views = [{ showGridLines: false }];
    RelatoriosModule._addTitulo(ws2, `🥇 RANKING DE VENDAS  ·  ${periodoTxt}`, 5);
    const rankRows = espArr.map((e, i) => [
      i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1, e.nome, e.filial, e.vendas, e.mensal
    ]);
    RelatoriosModule._addTabela(ws2, ['Pos.','Especialista','Filial','Vendas','Mensalidade Total (R$)'], rankRows, 'header');
    rankRows.forEach((_, i) => {
      ws2.getRow(5+i).getCell(5).numFmt = '"R$"#,##0.00';
      if (i < 3) {
        /* Chamado #115 — bug das "células pretas": o fill concatenava
           'FF' + cor + '22' (10 caracteres — um ARGB válido tem 8),
           o Excel não reconhecia a cor e caía em preto. Corrigido pra
           usar só 'FF'+cor (8 caracteres), mesmo padrão do resto do
           arquivo. */
        const corMedalha = i===0?C.amarelo:i===1?'9CA3AF':'92400E';
        [1,2,3,4,5].forEach(c => {
          ws2.getRow(5+i).getCell(c).fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF'+corMedalha } };
          ws2.getRow(5+i).getCell(c).font = { name:'Calibri', size:10, bold:true };
        });
      }
    });
    ws2.columns = [{width:8},{width:24},{width:20},{width:12},{width:22}];

    await RelatoriosModule._baixarExcelJS(wb, 'BeyondCRM_Desempenho.xlsx');
  }

  /* ================================================================
     7. RELATÓRIO COMPLETO
     ================================================================ */
  static async exportarCompleto() {
    const C = RelatoriosModule._COR;
    const E = RelatoriosModule._estilos();
    const wb = RelatoriosModule._wb();
    const etapas = { lead:'Lead', ligacao:'Ligação', agendamento:'Agendamento', visita:'Visita', venda:'Venda', carteira:'Carteira' };
    const agora = new Date().toLocaleString('pt-BR');

    /* Chamado #112 — busca ligações/vendas completas direto do banco
       (sem os limites 200/500 do cache de boot), pra que este relatório
       reflita tudo desde o início da operação. */
    const ligacoesCompleto = (typeof SupabaseSync !== 'undefined' && SupabaseSync.buscarLigacoesCompleto) ? await SupabaseSync.buscarLigacoesCompleto() : (store.ligacoes || []);
    const vendasCompleto   = (typeof SupabaseSync !== 'undefined' && SupabaseSync.buscarVendasCompleto)   ? await SupabaseSync.buscarVendasCompleto()   : (store.vendas || []);

    /* Chamado #117 (reaberto) — "Ligações Registradas" da capa via RPC
       (contar_ligacoes_totais), fonte única de verdade e sem o teto de
       1000 linhas do PostgREST que ainda limitava ligacoesCompleto.length.
       Mesma fonte usada no relatório "Leads por Etapa". */
    const totalLigacoesCapa = await RelatoriosModule._totalLigacoesGlobal();

    /* ── CAPA ── */
    const wsCapa = wb.addWorksheet('📋 Capa', { properties: { tabColor: { argb: 'FF'+C.marinho } } });
    wsCapa.views = [{ showGridLines: false }];
    wsCapa.columns = [{width:40},{width:30}];

    wsCapa.addRow([]); wsCapa.lastRow.height = 20;
    const rTitle = wsCapa.addRow(['BEYOND CRM']);
    rTitle.height = 50; wsCapa.mergeCells(rTitle.number,1,rTitle.number,2);
    RelatoriosModule._estilo(rTitle.getCell(1), { font:{name:'Calibri',size:28,bold:true,color:{argb:'FF'+C.branco}}, fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FF'+C.marinho}}, alignment:{vertical:'middle',horizontal:'center'} });

    const rSub = wsCapa.addRow(['Relatório Completo — Painel Comercial']);
    rSub.height = 30; wsCapa.mergeCells(rSub.number,1,rSub.number,2);
    RelatoriosModule._estilo(rSub.getCell(1), { font:{name:'Calibri',size:16,bold:false,color:{argb:'FF'+C.branco}}, fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FF'+C.vermelho}}, alignment:{vertical:'middle',horizontal:'center'} });

    wsCapa.addRow([]); wsCapa.lastRow.height = 20;

    const metaInfo = [
      ['Gerado em', agora],
      ['Usuário', (AuthService.currentProfile ? AuthService.currentProfile.nome : '—')],
      ['Total de Leads', store.leads.length],
      ['Ligações Registradas', totalLigacoesCapa],
      ['Associados na Carteira', store.leadsPorEtapa('carteira').length],
      ['Taxa de Conversão', (store.leadsPorEtapa('carteira').length/(store.leads.length||1)*100).toFixed(1)+'%'],
      /* Chamado #117 (reaberto) — soma especialista + supervisor ATIVOS,
         excluindo gerente/outros perfis E os usuários de teste. Regra do
         cliente pra identificar o usuário de teste: não tem meta
         configurada (nem de vendas nem de mensalidade). */
      ['Especialistas e Supervisores Ativos', store.usuarios.filter(u =>
        ['especialista','supervisor'].includes(u.perfil) &&
        u.status !== 'inativo' &&
        (Number(u.meta_vendas) > 0 || Number(u.meta_mensalidade) > 0)
      ).length],
    ];
    metaInfo.forEach(([k,v]) => {
      const row = wsCapa.addRow([k, v]);
      row.height = 22;
      RelatoriosModule._estilo(row.getCell(1), { font:{name:'Calibri',size:11,bold:true,color:{argb:'FF'+C.marinho}}, alignment:{vertical:'middle',horizontal:'left',indent:1} });
      RelatoriosModule._estilo(row.getCell(2), { font:{name:'Calibri',size:11,color:{argb:'FF'+C.texto}}, alignment:{vertical:'middle'} });
    });

    wsCapa.addRow([]); wsCapa.lastRow.height = 20;
    const rConteudo = wsCapa.addRow(['CONTEÚDO DESTE ARQUIVO']);
    rConteudo.height = 24; wsCapa.mergeCells(rConteudo.number,1,rConteudo.number,2);
    RelatoriosModule._estilo(rConteudo.getCell(1), E.secao);
    ['📊 Resumo Geral','📋 Leads','📞 Ligações','💰 Vendas','👛 Carteira','🎂 Aniversariantes','🔻 Funil','🏆 Desempenho'].forEach((s,i) => {
      const row = wsCapa.addRow([`${i+1}. ${s}`, '→ ver aba']);
      row.height = 18;
      row.getCell(1).font = { name:'Calibri', size:10, color:{argb:'FF'+C.texto} };
      row.getCell(2).font = { name:'Calibri', size:10, color:{argb:'FF'+C.cinza}, italic:true };
    });
    wsCapa.addRow(['', 'Beyond Bits Tecnologia © 2026']);
    wsCapa.lastRow.getCell(2).font = { name:'Calibri', size:9, italic:true, color:{argb:'FF'+C.cinza} };

    /* ── RESUMO GERAL ── */
    const wsR = wb.addWorksheet('📊 Resumo Geral', { properties:{ tabColor:{ argb:'FF'+C.marinho } } });
    wsR.views = [{ showGridLines:false }];
    RelatoriosModule._addTitulo(wsR, '📊 RESUMO GERAL DO FUNIL', 6);
    /* Chamado #117 (reaberto):
       - inclui arquivados nas contagens (leadsPorEtapa(e, true)).
       - "% Base" dividia por totais[0] (só a etapa "Lead"); agora divide
         pelo total real de leads no funil (soma de todas as etapas).
       - "Conversão"/"Score" usam as MESMAS regras do card "Visão do
         Funil" do dashboard (_transicoesFunilVisaoCard), como o cliente
         pediu no #110 reaberto. */
    const totais = STAGE_ORDER.map(e => store.leadsPorEtapa(e, true).length);
    const totalGeralR = totais.reduce((a, b) => a + b, 0) || 1;
    const transR = await RelatoriosModule._transicoesFunilVisaoCard();
    const resRows = STAGE_ORDER.map((e,i) => {
      const t = i > 0 ? transR[i - 1] : null;
      const convTaxa = t ? t.taxa : 0;
      return [
        etapas[e], totais[i], (totais[i]/totalGeralR*100).toFixed(1)+'%',
        i===0 ? '—' : convTaxa.toFixed(1)+'%',
        i===0 ? '—' : Number(convTaxa.toFixed(1)),
      ];
    });
    RelatoriosModule._addTabela(wsR, ['Etapa','Total','% Base','Conversão','Score'], resRows);
    wsR.columns = [{width:18},{width:10},{width:12},{width:16},{width:10}];

    /* ── TODOS OS LEADS ── */
    const wsL = wb.addWorksheet('📋 Leads', { properties:{ tabColor:{ argb:'FF3B82F6' } } });
    wsL.views = [{ showGridLines:false, state:'frozen', ySplit:4 }];
    RelatoriosModule._addTitulo(wsL, `📋 TODOS OS LEADS — ${store.leads.length} registros`, 12);
    const lHeaders = ['ID','Nome','Telefone','Etapa','Fonte','Captador','Tentativas','Tags','Placa','FIPE','Mensalidade Est.','Obs.'];
    const lRows = store.leads.map(l => [l.id,l.nome,l.tel,etapas[l.etapa]||l.etapa,l.fonte||'',l.captador||'',l.tentativas,(l.tags||[]).join(', '),l.placa||'',l.fipe||'',l.mensalidadeEst||'',l.obs||'']);
    RelatoriosModule._addTabela(wsL, lHeaders, lRows);
    wsL.columns = [{width:16},{width:22},{width:16},{width:16},{width:22},{width:18},{width:12},{width:16},{width:10},{width:12},{width:16},{width:28}];

    /* ── LIGAÇÕES ── */
    if (ligacoesCompleto.length) {
      const wsLig = wb.addWorksheet('📞 Ligações', { properties:{ tabColor:{ argb:'FF'+C.verde } } });
      wsLig.views = [{ showGridLines:false }];
      RelatoriosModule._addTitulo(wsLig, `📞 LIGAÇÕES — ${ligacoesCompleto.length} registros`, 7);
      const ligRows = ligacoesCompleto.map(l => [l.lead,l.tel,l.resultado||'',l.tentativa||0,l.esp||'',l.hora||'',l.data||'']);
      RelatoriosModule._addTabela(wsLig, ['Lead','Telefone','Resultado','Tentativa','Especialista','Hora','Data'], ligRows);
      wsLig.columns = [{width:22},{width:16},{width:24},{width:12},{width:20},{width:8},{width:12}];
    }

    /* ── VENDAS / CARTEIRA ── */
    const carteira = store.leads.filter(l=>l.etapa==='carteira');
    if (carteira.length) {
      const wsV = wb.addWorksheet('💰 Vendas', { properties:{ tabColor:{ argb:'FF'+C.verde } } });
      wsV.views = [{ showGridLines:false }];
      RelatoriosModule._addTitulo(wsV, `💰 VENDAS / CARTEIRA — ${carteira.length} associados`, 10);
      const vRows = carteira.map(l => [l.id,l.nome,l.tel,l.placa||'',l.fipe||'',RelatoriosModule._mensalLead(l, vendasCompleto),RelatoriosModule._adesaoLead(l, vendasCompleto),RelatoriosModule._dataVendaLead(l, vendasCompleto),l.aniversario||'',l.captador||'']);
      RelatoriosModule._addTabela(wsV, ['ID','Nome','Telefone','Placa','FIPE','Mensalidade','Adesão','Data Venda','Aniversário','Captador'], vRows);
      wsV.columns = [{width:16},{width:22},{width:16},{width:10},{width:12},{width:16},{width:14},{width:14},{width:14},{width:18}];

      /* Aniversariantes */
      const wsA = wb.addWorksheet('🎂 Aniversariantes', { properties:{ tabColor:{ argb:'FF'+C.vermelho } } });
      wsA.views = [{ showGridLines:false }];
      const hoje = new Date();
      const anivs = carteira.filter(l=>l.aniversario).map(l => {
        const d = new Date(l.aniversario);
        const prox = new Date(hoje.getFullYear(), d.getMonth(), d.getDate());
        if (prox < hoje) prox.setFullYear(hoje.getFullYear()+1);
        return { ...l, dias: Math.ceil((prox-hoje)/86400000), fmt: d.toLocaleDateString('pt-BR') };
      }).sort((a,b)=>a.dias-b.dias);
      RelatoriosModule._addTitulo(wsA, '🎂 ANIVERSARIANTES', 4);
      RelatoriosModule._addTabela(wsA, ['Nome','Telefone','Data Aniversário','Dias Restantes'], anivs.map(l=>[l.nome,l.tel,l.fmt,l.dias]));
      wsA.columns = [{width:24},{width:16},{width:18},{width:16}];
    }

    /* ── DESEMPENHO ── */
    /* Chamado #117 — mesmas correções aplicadas em exportarDesempenho:
       (1) só ATIVOS: especialista/supervisor COM meta configurada (sem
       meta = usuário de teste, regra do cliente no #117 reaberto) +
       gerente ativo; (2) agend/vendas atribuídos pelo RESPONSÁVEL ATUAL
       do lead (responsavel_nome, com fallback captador) excluindo
       lead-filho — mesmo critério do Número Mágico real do dashboard;
       (3) ranking por vendas, mensalidade como desempate. */
    const esp = {};
    store.usuarios
      .filter(u => u.status !== 'inativo' && (
        u.perfil === 'gerente' ||
        (['especialista', 'supervisor'].includes(u.perfil) && (Number(u.meta_vendas) > 0 || Number(u.meta_mensalidade) > 0))
      ))
      .forEach(u => { esp[u.nome]={nome:u.nome,filial:u.filial,metaV:u.meta_vendas||0,lig:0,agend:0,vendas:0,mensal:0,_id:u._id||u.id}; });
    ligacoesCompleto.forEach(l => { if(esp[l.esp]) esp[l.esp].lig++; });
    store.leads.forEach(l => {
      if (l.lead_pai_id) return; /* lead-filho — mesmo cliente, não conta de novo */
      const e=esp[l.responsavel_nome || l.captador]; if(!e) return;
      if(['agendamento','visita','venda','carteira'].includes(l.etapa)) e.agend++;
      if(l.etapa==='carteira') e.vendas++;
    });
    /* Chamado #105 — mesmo bug (4ª ocorrência): l.mensalidade nunca é
       populado no sync, soma sempre dava 0. Fonte real: vendas. */
    const espPorIdD = {};
    Object.values(esp).forEach(e => { if (e._id) espPorIdD[e._id] = e; });
    vendasCompleto.forEach(v => {
      const e = v._esp_id ? espPorIdD[v._esp_id] : null;
      if (!e) return;
      e.mensal += Number(v.valorMensalidade || 0);
    });
    const wsD = wb.addWorksheet('🏆 Desempenho', { properties:{ tabColor:{ argb:'FF'+C.amarelo } } });
    wsD.views = [{ showGridLines:false }];
    RelatoriosModule._addTitulo(wsD, '🏆 DESEMPENHO DOS ESPECIALISTAS', 7);
    const dRows = Object.values(esp).sort((a,b)=> b.vendas-a.vendas || b.mensal-a.mensal).map((e,i) => [
      i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1, e.nome, e.filial, e.lig, e.agend, e.vendas, e.mensal
    ]);
    RelatoriosModule._addTabela(wsD, ['Pos.','Especialista','Filial','Ligações','Agendamentos','Vendas','Mensalidade (R$)'], dRows, 'header');
    dRows.forEach((_,i) => { wsD.getRow(5+i).getCell(7).numFmt = '"R$"#,##0.00'; });
    wsD.columns = [{width:8},{width:24},{width:20},{width:12},{width:16},{width:12},{width:18}];

    await RelatoriosModule._baixarExcelJS(wb, 'BeyondCRM_Relatorio_Completo.xlsx');
  }

}

/* ============================================================  CurriculoModule */
class CurriculoModule {
  /* Chamado #118 — anexo (PDF) selecionado/carregado no modal atual.
     null = sem anexo. { path, nomeOriginal, tamanho } quando há um
     (recém-enviado ou já salvo, carregado por editar()). Path já
     aponta pro arquivo no Storage (bucket privado "curriculos") —
     ver CurriculoAnexoService. */
  static _anexoPendente = null;

  static render(filtro) {
    const $g = $('#curriculos-grid');
    if (!$g.length) return;
    /* Chamado #72 — status (abas) + filtro avançado (data/nota/CNH/perfil/busca). */
    CurriculoModule._initFiltro();
    if (filtro !== undefined) CurriculoModule._filtroStatus = filtro;
    const statusAtivo = CurriculoModule._filtroStatus || 'todos';
    let lista = (statusAtivo && statusAtivo !== 'todos')
      ? store.curriculos.filter(c => c.status === statusAtivo)
      : store.curriculos.slice();
    if (CurriculoModule._filtro) lista = CurriculoModule._filtro.filtrar(lista);
    CurriculoModule._atualizarBadgeFiltro();
    if (!lista.length) {
      $g.html('<div class="empty-state col-span-full"><div class="empty-icon">📄</div><p>Nenhum currículo encontrado.<br>Cadastre candidatos clicando em "+ Cadastrar Currículo".</p></div>'); return;
    }
    $g.html(lista.map(c => {
      const s = CURRICULO_STATUS[c.status] || CURRICULO_STATUS.em_analise;
      return `<div class="curriculo-card" style="border-top-color:${s.color};">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <div>
            <div class="fw-bold fs-6">${Utils.escHtml(c.nome)}</div>
            <div class="text-muted small">${Utils.escHtml(c.cargo)}${c.perfil?` · ${Utils.escHtml(c.perfil)}`:''} · ${c.exp} ano(s)</div>
          </div>
          <span class="badge" style="background:${s.bg};color:${s.color};">${s.label}</span>
        </div>
        <div class="small text-muted mb-1">📧 ${Utils.escHtml(c.email)}</div>
        <div class="small text-muted mb-2">📱 ${Utils.escHtml(c.tel)}</div>
        ${c.dataCadastro?`<div class="small text-muted mb-1">📅 Cadastrado: ${CurriculoModule._fmtDataCad(c.dataCadastro)}</div>`:''}
        ${c.nascimento?`<div class="small text-muted mb-1">🎂 ${Utils.formatDateShort(c.nascimento)} · ${Utils.calcIdade(c.nascimento)}</div>`:''}
        ${c.endereco?`<div class="small text-muted mb-1">📍 ${Utils.escHtml(c.endereco)}</div>`:''}
        <div class="small text-muted mb-2">
          ${c.sexo?`🧬 ${c.sexo==='M'?'Masculino':'Feminino'} ·`:''}
          ${c.cnh?'🚗 CNH' : ''}
          ${c.nota!==null&&c.nota!==undefined?`· ⭐ Nota: ${c.nota}/10`:''}
        </div>
        ${c.obs?`<div class="small text-muted border-top pt-2 mt-2">${Utils.escHtml(c.obs)}</div>`:''}
        ${c.anexoPath?`<div class="small mt-2"><a href="#" onclick="CurriculoModule.verAnexo(${c.id});return false;">📎 Ver currículo anexado (PDF)</a></div>`:''}
        <div class="d-flex gap-2 mt-3">
          <button class="btn btn-sm btn-outline-secondary flex-grow-1" onclick="CurriculoModule.editar(${c.id})"><i class="bi bi-pencil"></i> Editar</button>
          <button class="btn btn-sm btn-outline-danger" onclick="CurriculoModule.deletar(${c.id})"><i class="bi bi-trash"></i></button>
        </div>
      </div>`;
    }).join(''));
  }

  static abrirNovo() {
    $('#form-curriculo')[0].reset();
    $('#form-curriculo').removeData('editId');
    /* Chamado #71 — data de cadastro default = hoje (editável). */
    $('#curr-data-cad').val(Utils.getTodayDate ? Utils.getTodayDate() : new Date().toISOString().slice(0,10));
    /* Chamado #118 — limpa qualquer anexo de uma edição anterior. */
    CurriculoModule._anexoPendente = null;
    $('#curr-anexo-input').val('');
    CurriculoModule._renderAnexoStatus();
    $('#modal-curriculo .amp-modal-title').text('Cadastrar Currículo');
    Modal.abrir('modal-curriculo');
  }

  static salvar() {
    const nome   = $('#curr-nome').val().trim();
    const email  = $('#curr-email').val().trim();
    const tel    = $('#curr-tel').val().trim();
    const cargo  = $('#curr-cargo').val().trim();
    const exp    = parseInt($('#curr-exp').val()) || 0;
    const status = $('#curr-status').val() || 'em_analise';
    const obs    = $('#curr-obs').val().trim();
    const nasc   = $('#curr-nasc').val();
    const end    = $('#curr-end').val().trim();
    const sexo   = $('#curr-sexo').val();
    const cnh    = $('#curr-cnh').is(':checked');
    const nota   = $('#curr-nota').val() ? parseInt($('#curr-nota').val()) : null;
    const perfil = $('#curr-perfil').val() || ''; /* Chamado #73 */
    const dataCad = $('#curr-data-cad').val() || (Utils.getTodayDate ? Utils.getTodayDate() : new Date().toISOString().slice(0,10)); /* Chamado #71 */

    if (!nome) { Toast.show('Nome é obrigatório','warning'); return; }

    /* Chamado #118 — o PDF já foi enviado pro Storage no momento em que
       foi selecionado (onSelecionarAnexo); aqui só gravamos a referência
       (path/nome/tamanho) junto com o resto do cadastro. */
    const anexo = CurriculoModule._anexoPendente;
    const dados = {
      nome, email, tel, cargo, exp, status, obs, nascimento: nasc, endereco: end, sexo, cnh, nota, perfil, dataCadastro: dataCad,
      anexoPath:         anexo ? anexo.path         : null,
      anexoNomeOriginal: anexo ? anexo.nomeOriginal  : null,
      anexoTamanho:      anexo ? anexo.tamanho       : null,
    };
    const editId = parseInt($('#form-curriculo').data('editId'));
    if (editId) {
      store.atualizarCurriculo(editId, dados);
      Toast.show('Currículo atualizado!','success');
    } else {
      store.adicionarCurriculo(dados);
      Toast.show('Currículo cadastrado!','success');
    }
    CurriculoModule.render();
    Modal.fechar('modal-curriculo');
  }

  static editar(id) {
    const c = store.buscarCurriculo(id);
    if (!c) return;
    $('#curr-nome').val(c.nome); $('#curr-email').val(c.email); $('#curr-tel').val(c.tel);
    $('#curr-cargo').val(c.cargo); $('#curr-exp').val(c.exp); $('#curr-status').val(c.status);
    $('#curr-obs').val(c.obs); $('#curr-nasc').val(c.nascimento||'');
    $('#curr-end').val(c.endereco||''); $('#curr-sexo').val(c.sexo||'');
    $('#curr-cnh').prop('checked', c.cnh); $('#curr-nota').val(c.nota!==null?c.nota:'');
    $('#curr-perfil').val(c.perfil||''); /* Chamado #73 */
    $('#curr-data-cad').val((c.dataCadastro||'').slice(0,10)); /* Chamado #71 */
    /* Chamado #118 — carrega o anexo já salvo (se houver) no estado do
       modal, pra "Ver"/"Remover" funcionarem sem precisar reenviar. */
    CurriculoModule._anexoPendente = c.anexoPath
      ? { path: c.anexoPath, nomeOriginal: c.anexoNomeOriginal, tamanho: c.anexoTamanho }
      : null;
    $('#curr-anexo-input').val('');
    CurriculoModule._renderAnexoStatus();
    $('#form-curriculo').data('editId', id);
    $('#modal-curriculo .amp-modal-title').text('Editar Currículo');
    Modal.abrir('modal-curriculo');
  }

  static deletar(id) {
    ConfirmDialog.show('🗑️','Remover Currículo','Deseja remover este currículo permanentemente?', () => {
      /* Chamado #118 — remove também o anexo do Storage, se houver,
         pra não deixar arquivo órfão (o registro no banco some, mas o
         PDF continuaria ocupando espaço no bucket pra sempre). */
      const c = store.buscarCurriculo(id);
      if (c && c.anexoPath) CurriculoAnexoService.remover(c.anexoPath);
      store.removerCurriculo(id);
      CurriculoModule.render();
      Toast.show('Currículo removido.','');
    });
  }

  /* ════════════════════════════════════════════════════════════
     Chamado #118 — Anexo de Currículo (PDF)
     ════════════════════════════════════════════════════════════ */

  /* Seleção de arquivo no modal — valida e já envia pro Storage na
     hora (não espera o botão "Salvar"), pra o usuário ver o resultado
     (ok ou erro) imediatamente. Só grava a REFERÊNCIA no banco quando
     o formulário é salvo (CurriculoModule.salvar). */
  static async onSelecionarAnexo(file) {
    if (!file) return;
    const $status = $('#curr-anexo-status');
    $status.html('<span class="text-muted"><i class="bi bi-arrow-repeat"></i> Enviando...</span>');

    try {
      const resultado = await CurriculoAnexoService.upload(file);
      /* Já havia um anexo (pendente desta sessão ou carregado de um
         currículo existente em edição) — remove o antigo do Storage
         pra não acumular arquivo órfão ao trocar o PDF. */
      const anterior = CurriculoModule._anexoPendente;
      if (anterior && anterior.path) CurriculoAnexoService.remover(anterior.path);

      CurriculoModule._anexoPendente = resultado;
      CurriculoModule._renderAnexoStatus();
      Toast.show('Currículo (PDF) anexado!', 'success');
    } catch (e) {
      Toast.show(e.message || 'Erro ao anexar o currículo.', 'danger');
      $('#curr-anexo-input').val('');
      CurriculoModule._renderAnexoStatus();
    }
  }

  /* Reflete CurriculoModule._anexoPendente na área de status do modal. */
  static _renderAnexoStatus() {
    const $status = $('#curr-anexo-status');
    if (!$status.length) return;
    const a = CurriculoModule._anexoPendente;
    if (!a) { $status.html(''); return; }
    const kb = a.tamanho ? ' (' + (a.tamanho / 1024).toFixed(0) + ' KB)' : '';
    $status.html(`
      <span class="text-success">📎 ${Utils.escHtml(a.nomeOriginal || 'curriculo.pdf')}${kb} — anexado</span>
      <button type="button" class="btn btn-link btn-sm p-0 ms-2" onclick="CurriculoModule.verAnexoPendente()">Ver</button>
      <button type="button" class="btn btn-link btn-sm p-0 ms-2 text-danger" onclick="CurriculoModule.removerAnexoPendente()">Remover</button>
    `);
  }

  /* "Ver" no modal (funciona tanto pro recém-enviado quanto pro já
     salvo, carregado por editar()). Gera uma signed URL (bucket
     privado) válida por 1h e abre em nova aba. */
  static async verAnexoPendente() {
    const a = CurriculoModule._anexoPendente;
    if (!a || !a.path) return;
    const url = await CurriculoAnexoService.getSignedUrl(a.path);
    if (url) window.open(url, '_blank');
    else Toast.show('Não foi possível abrir o anexo.', 'danger');
  }

  /* "Remover" no modal — ação imediata (mesmo padrão do botão
     "Remover" da foto de perfil): apaga do Storage na hora. Se o
     currículo já estiver salvo (edição), persiste a remoção no banco
     também na hora, sem esperar o botão "Salvar" do formulário. */
  static removerAnexoPendente() {
    const a = CurriculoModule._anexoPendente;
    if (!a) return;
    ConfirmDialog.show('🗑️', 'Remover anexo', 'Deseja remover o currículo (PDF) anexado?', () => {
      CurriculoAnexoService.remover(a.path);
      CurriculoModule._anexoPendente = null;
      $('#curr-anexo-input').val('');
      CurriculoModule._renderAnexoStatus();

      const editId = parseInt($('#form-curriculo').data('editId'));
      if (editId) {
        store.atualizarCurriculo(editId, { anexoPath: null, anexoNomeOriginal: '', anexoTamanho: 0 });
        CurriculoModule.render();
      }
      Toast.show('Anexo removido.', '');
    });
  }

  /* "Ver currículo anexado" no card do grid (fora do modal). */
  static async verAnexo(id) {
    const c = store.buscarCurriculo(id);
    if (!c || !c.anexoPath) return;
    const url = await CurriculoAnexoService.getSignedUrl(c.anexoPath);
    if (url) window.open(url, '_blank');
    else Toast.show('Não foi possível abrir o anexo.', 'danger');
  }

  /* ═══════════ Chamados #71/#72 — Data de cadastro + Filtro avançado ═══════════ */

  static _filtro = null;
  static _filtroMontado = false;
  static _filtroStatus = 'todos';

  /* YYYY-MM-DD -> DD/MM/YYYY sem new Date() (evita drift de fuso). */
  static _fmtDataCad(s) {
    if (!s) return '';
    var d = String(s).slice(0, 10);
    var m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? (m[3] + '/' + m[2] + '/' + m[1]) : String(s);
  }

  /* Instancia + monta o FiltroAvancadoComponent uma única vez. */
  static _initFiltro() {
    if (CurriculoModule._filtroMontado) return;
    if (typeof FiltroAvancadoComponent === 'undefined') return;
    if (!$('#filtro-curriculo-body').length) return;   /* drawer ainda não no DOM */

    CurriculoModule._filtro = new FiltroAvancadoComponent({
      container:  '#filtro-curriculo-body',
      drawerId:   'filtro-curriculo-drawer',
      storageKey: 'amp_filtro_curriculos',
      onChange:   function() { CurriculoModule.render(); },
      campos: [
        { tipo: 'text', id: 'busca', label: 'Buscar (nome, e-mail, cargo)',
          placeholder: 'Digite para buscar...',
          getValor: function(c) { return (c.nome || '') + ' ' + (c.email || '') + ' ' + (c.cargo || ''); } },
        { tipo: 'multi-select', id: 'perfil', label: 'Perfil',
          getValor: function(c) { return c.perfil || ''; },
          opcoes: ['Comercial','Administrativo','Financeiro','Recepção','Captação','Serviços Gerais','Eventos','Outros'] },
        { tipo: 'daterange', id: 'dataCadastro', label: 'Data de cadastro',
          getValor: function(c) { return c.dataCadastro ? (String(c.dataCadastro).slice(0,10) + 'T12:00:00') : null; } },
        { tipo: 'faixa-numerica', id: 'nota', label: 'Nota da entrevista (0–10)',
          getValor: function(c) { return (c.nota != null ? c.nota : null); } },
        { tipo: 'checkbox', id: 'cnh', label: 'Somente candidatos com CNH',
          passaSeMarcado: function(c) { return c.cnh === true; } },
      ],
    });
    CurriculoModule._filtro.montar();
    CurriculoModule._filtroMontado = true;
  }

  static abrirFiltroAvancado()   { CurriculoModule._initFiltro(); if (CurriculoModule._filtro) CurriculoModule._filtro.abrir(); }
  static fecharFiltroAvancado()  { if (CurriculoModule._filtro) CurriculoModule._filtro.fechar(); }
  static aplicarFiltroAvancado() { if (CurriculoModule._filtro) CurriculoModule._filtro.aplicar(); }
  static limparFiltroAvancado()  { if (CurriculoModule._filtro) CurriculoModule._filtro.limpar(); }

  /* Badge de contagem no botão de filtros. */
  static _atualizarBadgeFiltro() {
    if (!CurriculoModule._filtro) return;
    var n = CurriculoModule._filtro.contarAtivos();
    var $b = $('#curr-filtro-count');
    if (!$b.length) return;
    if (n > 0) { $b.text(n).show(); } else { $b.hide(); }
  }
}

/* ============================================================  UsuarioModule */
class UsuarioModule {
  /* AJUSTE 3 (v2 · Sprint 4): Painel de performance/comissões do usuário logado.
     Bugs corrigidos:
       - antes: store.usuarios[0] pegava o PRIMEIRO usuário, não o logado
       - antes: u.comissoes.mes_atual era hardcoded 0 no sync
     Novidades:
       - Cálculo real de comissão via RN-16 (10% até meta / 50% após meta)
       - RN-17: 4 degraus (Meta, Super, Power, King) com bônus fixos
       - Histórico dos últimos 3 meses calendário (Feature 2.3) */
  static renderMinhaPerformance() {
    const $c = $('#minha-performance-content');
    if (!$c.length) return;

    /* FIX: usa o profile logado, não o [0] do array */
    const u = AuthService.currentProfile;
    if (!u) { $c.html('<p class="text-muted small">Aguardando sessão…</p>'); return; }

    $('#perf-usuario-nome').text(u.nome || '—');

    /* Chamado #120 — seletor de ciclo no topo, pra TODOS os usuários. */
    const seletorCiclo = UsuarioModule._seletorCicloHtml();
    UsuarioModule._garantirVendasCompleto();

    /* Chamado #51 — aceita usuário configurado só pelo caminho de VALOR
       (sem meta por quantidade). Antes exigia meta_vendas e bloqueava
       quem só tivesse meta por valor de mensalidade. */
    if (!u.meta_vendas && !u.meta_mensalidade) {
      /* Chamado #107 — gerente normalmente não tem meta própria (não é
         quem vende), mas quer ver a comissão de toda a equipe aqui
         mesmo, em vez de só a mensagem "sem metas". */
      $c.html(seletorCiclo + (
        u.perfil === 'gerente'
          ? UsuarioModule._renderComissaoEquipe()
          : '<p class="text-muted small">Sem metas configuradas. Peça ao gerente para definir sua meta mensal em Configurações → Usuários.</p>'
      ));
      return;
    }

    /* ── Ciclo de comissão selecionado (RN-16: 26 → 25) ── */
    const { ini, fim } = MetasModule._cicloPorOffset(UsuarioModule._cicloOffset || 0);

    /* Fonte das vendas: histórico completo se já carregado (ciclos
       antigos), senão o cache de boot. */
    const vendasFonte = UsuarioModule._vendasParaComissao();

    /* Agregado do ciclo selecionado — filtra as vendas do usuário logado.
       Chamado #105 — mesmo fix de _agregarEsp (dataVenda é data pura,
       new Date() direto interpretava como UTC e derrubava vendas do
       dia 26 pro fuso errado). */
    const vendasCiclo = vendasFonte.filter(v => {
      if (v._esp_id !== u.id) return false;
      const dt = v.dataVenda
        ? new Date(String(v.dataVenda).slice(0, 10) + 'T00:00:00')
        : new Date(v.created_at);
      return dt >= ini && dt <= fim;
    });
    /* Chamado #128 — uma venda por cliente (ver _dedupVendasPorLead). */
    const vendasCicloUnicas = MetasModule._dedupVendasPorLead(vendasCiclo);
    const qtdVendas   = vendasCicloUnicas.length;
    const somaAdesao  = vendasCicloUnicas.reduce((s, v) => s + Number(v.valorAdesao || 0), 0);
    const somaMensal  = vendasCicloUnicas.reduce((s, v) => s + Number(v.valorMensalidade || 0), 0);

    /* ── Degraus de meta (RN-17 + Chamado #51) ──
       Chamado #124 — as metas seguem o CICLO selecionado no seletor do
       #120, não o cadastro de hoje. Isso vale duplamente aqui: além das
       barras de progresso, estes valores decidem o percentual de adesão
       (10 % ou 50 %) e o bônus de degrau — ou seja, a comissão exibida
       para um ciclo fechado era recalculada com a meta errada sempre que
       o gerente ajustava metas depois do fechamento. */
    const _mvCiclo  = MetasModule._metasDoCiclo(u, fim);
    const metaBase  = _mvCiclo.meta_vendas;
    const metaSuper = _mvCiclo.meta_super_vendas;
    const metaPower = _mvCiclo.meta_power_vendas;
    const metaKing  = _mvCiclo.meta_king_vendas;
    const metaMens  = _mvCiclo.meta_mensalidade;
    /* Chamado #51 — thresholds por VALOR de mensalidade de cada degrau. */
    const metaSuperVal = _mvCiclo.meta_super_mensalidade;
    const metaPowerVal = _mvCiclo.meta_power_mensalidade;
    const metaKingVal  = _mvCiclo.meta_king_mensalidade;

    /* Cálculo da comissão (RN-16):
       - Antes da meta: 10% de cada adesão
       - Após a meta:   50% de TODAS as adesões do período (recalculo retroativo)
       - Bônus: SM +200 (não acumula com PM/King), PM +800, King +1800
       Chamado #51 — cada degrau é atingido por quantidade de vendas OU
       por valor de mensalidade acumulada (o que ocorrer primeiro). */
    const bateuMeta  = (metaBase  > 0 && qtdVendas >= metaBase)  || (metaMens     > 0 && somaMensal >= metaMens);
    const bateuSuper = (metaSuper > 0 && qtdVendas >= metaSuper) || (metaSuperVal  > 0 && somaMensal >= metaSuperVal);
    const bateuPower = (metaPower > 0 && qtdVendas >= metaPower) || (metaPowerVal  > 0 && somaMensal >= metaPowerVal);
    const bateuKing  = (metaKing  > 0 && qtdVendas >= metaKing)  || (metaKingVal   > 0 && somaMensal >= metaKingVal);

    const percentualAdesao = bateuMeta ? 0.50 : 0.10;
    let bonus = 0;
    if (bateuKing)       bonus = 1800;
    else if (bateuPower) bonus = 800;
    else if (bateuSuper) bonus = 200;

    const comissaoCiclo = (somaAdesao * percentualAdesao) + bonus;

    /* Progresso percentual (visual) */
    const pctVendas = metaBase > 0 ? Math.min(Math.round(qtdVendas / metaBase * 100), 100) : 0;
    const pctMensal = metaMens > 0 ? Math.min(Math.round(somaMensal / metaMens * 100), 100) : 0;
    const corV = pctVendas >= 100 ? BX_COR.up : pctVendas >= 60 ? BX_COR.accent3 : BX_COR.accent;
    const corM = pctMensal >= 100 ? BX_COR.up : pctMensal >= 60 ? BX_COR.accent3 : BX_COR.accent;

    /* ── Histórico dos últimos 3 meses calendário (Feature 2.3) ──
       Chamado #34: cada mês agora usa as metas VIGENTES daquele mês
       (via MetasModule._metasVigentes), preservando meses passados
       quando o gerente altera metas. Se não houver versão histórica,
       cai nos campos atuais do profile (fallback retro-compatível). */
    /* Chamado #120 — o histórico dos 3 meses anteriores agora acompanha
       o ciclo SELECIONADO (ancora no fim dele), não sempre "hoje". */
    const hoje = new Date(fim);
    const historico = [];
    for (let i = 3; i >= 1; i--) {
      const ref = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const iniMes = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const fimMes = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999);
      const vs = vendasFonte.filter(v => {
        if (v._esp_id !== u.id) return false;
        const dt = new Date(v.dataVenda || v.created_at);
        return dt >= iniMes && dt <= fimMes;
      });
      const q = vs.length;
      const ad = vs.reduce((s, v) => s + Number(v.valorAdesao || 0), 0);
      const men = vs.reduce((s, v) => s + Number(v.valorMensalidade || 0), 0);

      /* Metas vigentes DAQUELE mês (não as atuais do profile). */
      const mv = MetasModule._metasVigentes(u, ref);
      const metaBaseM  = mv.meta_vendas;
      const metaSuperM = mv.meta_super_vendas;
      const metaPowerM = mv.meta_power_vendas;
      const metaKingM  = mv.meta_king_vendas;
      /* Chamado #51 — thresholds por valor vigentes naquele mês. */
      const metaMensM      = mv.meta_mensalidade;
      const metaSuperValM  = mv.meta_super_mensalidade;
      const metaPowerValM  = mv.meta_power_mensalidade;
      const metaKingValM   = mv.meta_king_mensalidade;

      const bateu = (metaBaseM > 0 && q >= metaBaseM) || (metaMensM > 0 && men >= metaMensM);
      const bAd = bateu ? 0.50 : 0.10;
      let bMes = 0;
      if      ((metaKingM  > 0 && q >= metaKingM)  || (metaKingValM  > 0 && men >= metaKingValM))  bMes = 1800;
      else if ((metaPowerM > 0 && q >= metaPowerM) || (metaPowerValM > 0 && men >= metaPowerValM)) bMes = 800;
      else if ((metaSuperM > 0 && q >= metaSuperM) || (metaSuperValM > 0 && men >= metaSuperValM)) bMes = 200;
      historico.push({
        rotulo: ref.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', ''),
        vendas: q, mensal: men, comissao: (ad * bAd) + bMes,
      });
    }

    const cicloOffsetAtual = UsuarioModule._cicloOffset || 0;
    const cicloLabel = ini.toLocaleDateString('pt-BR') + ' → ' + fim.toLocaleDateString('pt-BR') + (cicloOffsetAtual === 0 ? ' (atual)' : '');

    /* Badge do degrau atingido */
    let degrauLabel = 'Meta ainda não atingida';
    let degrauCor   = '#9CA3AF';
    if (bateuKing)       { degrauLabel = '👑 THE KING'; degrauCor = '#7C3AED'; }
    else if (bateuPower) { degrauLabel = '⚡ POWER META'; degrauCor = BX_COR.accent; }
    else if (bateuSuper) { degrauLabel = '⭐ SUPER META'; degrauCor = '#F59E0B'; }
    else if (bateuMeta)  { degrauLabel = '✅ META BATIDA'; degrauCor = '#10A64A'; }

    const proxDegrauLinha = (function() {
      if (bateuKing) return '<span style="color:var(--d-txt-7c3aed);">👑 King atingido — parabéns!</span>';

      /* Chamado #51 — monta a frase "faltam ..." considerando os dois
         caminhos configurados (vendas e/ou valor). Mostra só os caminhos
         que o gerente habilitou (threshold > 0). */
      var fmtR = function(n){ return 'R$ ' + (Number(n)||0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
      var faltaTxt = function(metaQ, metaV, rotulo, bonusTxt) {
        var partes = [];
        if (metaQ > 0 && qtdVendas < metaQ) partes.push('<strong>' + (metaQ - qtdVendas) + '</strong> vendas');
        if (metaV > 0 && somaMensal < metaV) partes.push('<strong>' + fmtR(metaV - somaMensal) + '</strong> em mensalidade');
        if (!partes.length) return '';
        return 'Faltam ' + partes.join(' ou ') + ' para ' + rotulo + ' (' + bonusTxt + ')';
      };

      var linha;
      if (bateuPower) {
        linha = faltaTxt(metaKing,  metaKingVal,  'The King',   '+R$ 1.800');
        if (linha) return linha;
      }
      if (bateuSuper) {
        linha = faltaTxt(metaPower, metaPowerVal, 'Power Meta', '+R$ 800');
        if (linha) return linha;
      }
      if (bateuMeta) {
        linha = faltaTxt(metaSuper, metaSuperVal, 'Super Meta', '+R$ 200');
        if (linha) return linha;
      }
      /* Ainda não bateu a Meta base */
      linha = faltaTxt(metaBase, metaMens, 'a Meta', '50% adesões');
      return linha || '';
    })();

    /* Chamado #89 — quanto falta para CADA degrau (Meta, Super, Power,
       King), não só o próximo. 'atingido' quando o degrau já foi batido
       (por quantidade OU por valor de mensalidade). */
    var degrausFaltamHtml = (function() {
      var fmtR2 = function(n){ return 'R$ ' + (Number(n)||0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
      var linhaDegrau = function(metaQ, metaV, rotulo, bonusTxt, bateu, emoji) {
        if (metaQ <= 0 && metaV <= 0) return '';   /* degrau não configurado */
        if (bateu) return '<div style="margin-bottom:4px;">' + emoji + ' <strong>' + rotulo + '</strong>: <span style="color:#10A64A;font-weight:600;">atingido ✅</span></div>';
        var partes = [];
        if (metaQ > 0 && qtdVendas  < metaQ) partes.push('<strong>' + (metaQ - qtdVendas) + '</strong> venda(s)');
        if (metaV > 0 && somaMensal < metaV) partes.push('<strong>' + fmtR2(metaV - somaMensal) + '</strong> em mensalidade');
        var falta = partes.length ? ('faltam ' + partes.join(' ou ')) : 'quase lá';
        return '<div style="margin-bottom:4px;">' + emoji + ' <strong>' + rotulo + '</strong>: ' + falta + ' <span style="color:var(--d-txt-9ca3af);">(' + bonusTxt + ')</span></div>';
      };
      return linhaDegrau(metaBase,  metaMens,     'Meta',       '50% adesões', bateuMeta,  '🎯')
           + linhaDegrau(metaSuper, metaSuperVal, 'Super Meta', '+R$ 200',     bateuSuper, '⭐')
           + linhaDegrau(metaPower, metaPowerVal, 'Power Meta', '+R$ 800',     bateuPower, '⚡')
           + linhaDegrau(metaKing,  metaKingVal,  'The King',   '+R$ 1.800',   bateuKing,  '👑');
    })();

    const histHtml = historico.map(h => {
      const pctH = metaMens > 0 ? Math.min(Math.round(h.mensal / metaMens * 100), 100) : 0;
      return `<div class="d-flex align-items-center gap-2 mb-2">
        <span style="width:52px;font-size:11px;color:var(--d-txt-6b7280);text-transform:uppercase;font-weight:600;">${h.rotulo}</span>
        <div style="flex:1;background:var(--d-bgc-f3f4f6);border-radius:99px;height:8px;">
          <div style="width:${pctH}%;background:var(--d-bgc-1b6b3a);height:8px;border-radius:99px;"></div>
        </div>
        <span style="font-size:11px;color:var(--d-txt-6b7280);width:90px;text-align:right;">${h.vendas} vendas</span>
        <span style="font-size:11px;font-weight:600;width:110px;text-align:right;color:var(--d-txt-1b6b3a);">R$ ${h.comissao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>`;
    }).join('');

    $c.html(seletorCiclo + `
      <div class="small text-muted mb-2">Ciclo: <strong>${cicloLabel}</strong> · <span style="color:${degrauCor};font-weight:700;">${degrauLabel}</span></div>

      <div class="row g-3">
        <div class="col-md-4">
          <div class="kpi-card flex-column align-items-start gap-1">
            <div class="kpi-lbl fw-semibold">🏆 Vendas do Ciclo</div>
            <div style="font-size:28px;font-weight:800;color:${corV};font-family:'JetBrains Mono';">${qtdVendas} <span style="font-size:14px;color:var(--d-txt-9ca3af);">/ ${metaBase}</span></div>
            <div style="width:100%;background:var(--d-bgc-f3f4f6);border-radius:99px;height:8px;">
              <div style="width:${pctVendas}%;background:${corV};height:8px;border-radius:99px;transition:width .5s;"></div>
            </div>
            <div style="font-size:12px;color:${corV};">${pctVendas}% da meta${pctVendas>=100?' ✅':''}</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="kpi-card flex-column align-items-start gap-1">
            <div class="kpi-lbl fw-semibold">💰 Mensalidade do Ciclo</div>
            <div style="font-size:22px;font-weight:800;color:${corM};font-family:'JetBrains Mono';">R$ ${somaMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            <div style="width:100%;background:var(--d-bgc-f3f4f6);border-radius:99px;height:8px;">
              <div style="width:${pctMensal}%;background:${corM};height:8px;border-radius:99px;transition:width .5s;"></div>
            </div>
            <div style="font-size:12px;color:${corM};">Meta: R$ ${metaMens.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${pctMensal}%)</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="kpi-card flex-column align-items-start gap-1" style="border-left:4px solid ${degrauCor};">
            <div class="kpi-lbl fw-semibold">💸 Comissão Estimada</div>
            <div style="font-size:26px;font-weight:800;color:var(--d-txt-1b6b3a);font-family:'JetBrains Mono';">R$ ${comissaoCiclo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            <div style="font-size:11px;color:var(--d-txt-6b7280);">${bateuMeta ? '50% adesões' : '10% adesões'}${bonus > 0 ? ` + bônus R$ ${bonus.toLocaleString('pt-BR')}` : ''}</div>
            <div style="font-size:11px;color:var(--d-txt-6b7280);">${proxDegrauLinha}</div>
          </div>
        </div>

        <div class="col-12">
          <div class="kpi-card flex-column align-items-start gap-2">
            <div class="kpi-lbl fw-semibold">🎯 Degraus configurados</div>
            <div class="d-flex flex-wrap gap-2" style="font-size:11px;">
              ${(() => {
                /* Chamado #51 — rótulo mostra os dois caminhos configurados. */
                const rBRL = n => 'R$ ' + (Number(n)||0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const alvo = (q, v) => {
                  const p = [];
                  if (q > 0) p.push(q + ' vendas');
                  if (v > 0) p.push(rBRL(v));
                  return p.length ? p.join(' ou ') : '—';
                };
                return `
              <span class="badge" style="background:${bateuMeta ?'var(--d-bgc-10a64a)':'var(--d-bgc-e5e7eb)'};color:${bateuMeta ?'var(--d-txt-ffffff)':'var(--d-txt-374151)'};padding:6px 10px;font-weight:600;">Meta: ${alvo(metaBase, metaMens)}</span>
              <span class="badge" style="background:${bateuSuper?'var(--d-bgc-f59e0b)':'var(--d-bgc-e5e7eb)'};color:${bateuSuper?'var(--d-txt-ffffff)':'var(--d-txt-374151)'};padding:6px 10px;font-weight:600;">⭐ Super: ${alvo(metaSuper, metaSuperVal)} <small>+R$200</small></span>
              <span class="badge" style="background:${bateuPower?'var(--d-bgc-d91a3c)':'var(--d-bgc-e5e7eb)'};color:${bateuPower?'var(--d-txt-ffffff)':'var(--d-txt-374151)'};padding:6px 10px;font-weight:600;">⚡ Power: ${alvo(metaPower, metaPowerVal)} <small>+R$800</small></span>
              <span class="badge" style="background:${bateuKing ?'var(--d-bgc-7c3aed)':'var(--d-bgc-e5e7eb)'};color:${bateuKing ?'var(--d-txt-ffffff)':'var(--d-txt-374151)'};padding:6px 10px;font-weight:600;">👑 King: ${alvo(metaKing, metaKingVal)} <small>+R$1.800</small></span>`;
              })()}
            </div>
          </div>
        </div>

        <div class="col-12">
          <div class="kpi-card flex-column align-items-start gap-2">
            <div class="kpi-lbl fw-semibold">📊 Quanto falta para cada degrau</div>
            <div style="font-size:12px;line-height:1.5;">${degrausFaltamHtml || '<span class="text-muted">Nenhum degrau configurado.</span>'}</div>
          </div>
        </div>

        ${histHtml ? `<div class="col-12">
          <div class="kpi-card flex-column align-items-start gap-2">
            <div class="kpi-lbl fw-semibold">📊 Histórico dos últimos 3 meses</div>
            ${histHtml}
          </div>
        </div>` : ''}
      </div>
      ${u.perfil === 'gerente' ? UsuarioModule._renderComissaoEquipe() : ''}`);
  }

  /* ════════════════════════════════════════════════════════════
     Chamado #107 — Comissão da equipe, visível pro GERENTE
     ════════════════════════════════════════════════════════════
     O gerente normalmente não tem meta/comissão própria (não é quem
     vende), mas quer ver a comissão prevista de todos os especialistas
     e supervisores ativos, no mesmo lugar (Configurações → Minha
     Performance). Reaproveita a regra RN-16/17 já existente
     (RelatoriosModule._comissaoCicloEsp, mesma usada no relatório
     "Desempenho por Especialista" — chamado #115), só que aqui pra
     todo mundo, não só pra 1 especialista. */
  /* Chamado #107/#120 (reabertos) — ciclo de comissão exibido em TODA a
     seção "Minha Performance" (card individual + bloco da equipe do
     gerente): 0 = atual, -1 = anterior, etc. Um único seletor no topo
     controla tudo. Persistido na sessão. */
  static _cicloOffset = 0;
  static _vendasCompletoCache = null;   /* histórico completo de vendas (pra ciclos antigos) */
  static _vendasCompletoFetching = false;

  /* store.vendas é só o cache de boot (500 mais recentes) — cobre o
     ciclo atual e o anterior com folga, mas ciclos mais antigos podem
     faltar. Busca o histórico completo uma vez (paginado) e reusa. */
  static _vendasParaComissao() {
    return UsuarioModule._vendasCompletoCache || store.vendas || [];
  }

  static _garantirVendasCompleto() {
    if (UsuarioModule._vendasCompletoCache || UsuarioModule._vendasCompletoFetching) return;
    if (typeof SupabaseSync === 'undefined' || !SupabaseSync.buscarVendasCompleto) return;
    UsuarioModule._vendasCompletoFetching = true;
    SupabaseSync.buscarVendasCompleto()
      .then(v => { UsuarioModule._vendasCompletoCache = v || store.vendas || []; })
      .catch(() => {})
      .then(() => { UsuarioModule._vendasCompletoFetching = false; });
  }

  /* Chamado #120 — seletor de ciclo (dropdown) no topo de "Minha
     Performance". Rótulo = mês do fim do ciclo (dia 25) + o intervalo,
     como o cliente pediu: "Setembro/2026 (26/08 a 25/09)". */
  static _seletorCicloHtml() {
    const atual = UsuarioModule._cicloOffset || 0;
    let opts = '';
    for (let o = 0; o >= -18; o--) {
      const c = MetasModule._cicloPorOffset(o);
      /* Chamado #122 — rótulo vem do helper único (era duplicado aqui). */
      opts += `<option value="${o}" ${o === atual ? 'selected' : ''}>${MetasModule._rotuloCiclo(c)}${o === 0 ? ' — atual' : ''}</option>`;
    }
    return `
      <div class="d-flex align-items-center gap-2 mb-3" style="flex-wrap:wrap;">
        <label class="small text-muted mb-0" style="white-space:nowrap;font-weight:600;">Ciclo de comissão:</label>
        <select class="form-select form-select-sm" style="max-width:340px;" onchange="UsuarioModule.mudarCicloPerformance(this.value)">
          ${opts}
        </select>
      </div>`;
  }

  static async mudarCicloPerformance(offset) {
    let next = parseInt(offset, 10) || 0;
    if (next > 0) next = 0;
    if (next < -60) next = -60;
    UsuarioModule._cicloOffset = next;
    /* pra ciclos antigos, garante o histórico completo antes de renderizar */
    if (next <= -1 && !UsuarioModule._vendasCompletoCache
        && typeof SupabaseSync !== 'undefined' && SupabaseSync.buscarVendasCompleto) {
      try { UsuarioModule._vendasCompletoCache = await SupabaseSync.buscarVendasCompleto(); } catch (e) {}
    }
    UsuarioModule.renderMinhaPerformance();
  }

  static _renderComissaoEquipe() {
    const offset = UsuarioModule._cicloOffset || 0;
    const { ini, fim } = MetasModule._cicloPorOffset(offset);
    UsuarioModule._garantirVendasCompleto(); /* fire-and-forget: deixa pronto pra navegação */
    const vendasBase = UsuarioModule._vendasParaComissao();

    /* Dentro do ciclo mostrado? (mesma normalização de fuso do #105). */
    const vendaNoCiclo = (v) => {
      const dt = v.dataVenda
        ? new Date(String(v.dataVenda).slice(0, 10) + 'T00:00:00')
        : new Date(v.created_at);
      return dt >= ini && dt <= fim;
    };

    const membros = (store.usuarios || [])
      .filter(u => ['especialista', 'supervisor'].includes(u.perfil) && u.status !== 'inativo')
      /* Chamado #130 — quem entrou depois do ciclo mostrado não tem
         comissão a receber dele, então não aparece na lista. */
      .filter(u => MetasModule._fazAlteParteDoCiclo(u, fim))
      /* Chamado #117/#107 — esconde o usuário de teste: especialista/
         supervisor SEM meta configurada E sem nenhuma venda no ciclo
         mostrado (assim um especialista real sem meta que vendeu ainda
         aparece — não some ninguém que tenha comissão a receber). */
      .filter(u => {
        if (Number(u.meta_vendas) > 0 || Number(u.meta_mensalidade) > 0) return true;
        const uid = u._id || u.id;
        return vendasBase.some(v => v._esp_id === uid && vendaNoCiclo(v));
      })
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));

    const fmtD = d => d.toLocaleDateString('pt-BR');
    const linhas = membros.length
      ? membros.map(u => UsuarioModule._linhaComissaoEquipe(u, ini, fim, vendasBase)).join('')
      : '<p class="text-muted small mb-0">Sem dados de comissão neste ciclo.</p>';
    return `
      <div style="padding:14px 4px 4px;border-top:1px solid var(--border);margin-top:14px;">
        <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px;">
          <i class="bi bi-people-fill me-1"></i> Comissão da Equipe${membros.length ? ` (${membros.length} membro${membros.length === 1 ? '' : 's'})` : ''}
          <span style="font-weight:500;text-transform:none;letter-spacing:0;">· Ciclo ${fmtD(ini)} → ${fmtD(fim)}</span>
        </div>
        ${linhas}
      </div>`;
  }

  /* Uma linha da equipe: nome/perfil, barras de vendas e mensalidade
     (mesmo padrão visual de MetasModule.renderAtingimento — classes
     .rmeta-row/.rmeta-track/.rmeta-fill já existentes), e a comissão
     prevista do ciclo. */
  static _linhaComissaoEquipe(u, ini, fim, vendasBase) {
    const uid = u._id || u.id;
    const vendasCiclo = (vendasBase || store.vendas || []).filter(v => {
      if (v._esp_id !== uid) return false;
      const dt = v.dataVenda
        ? new Date(String(v.dataVenda).slice(0, 10) + 'T00:00:00')
        : new Date(v.created_at);
      return dt >= ini && dt <= fim;
    });
    /* Chamado #124 — comissão e barras pelas metas do ciclo mostrado. */
    const com = RelatoriosModule._comissaoCicloEsp(vendasCiclo, u, fim);
    const _mvLin = MetasModule._metasDoCiclo(u, fim);

    const metaBase = _mvLin.meta_vendas;
    const metaMens = _mvLin.meta_mensalidade;
    const pctVendas = metaBase > 0 ? Math.min(Math.round(com.qtdVendas / metaBase * 100), 100) : 0;
    const pctMensal = metaMens > 0 ? Math.min(Math.round(com.somaMensal / metaMens * 100), 100) : 0;
    const corV = pctVendas >= 100 ? BX_COR.up : pctVendas >= 60 ? BX_COR.accent3 : BX_COR.accent;
    const corM = pctMensal >= 100 ? BX_COR.up : pctMensal >= 60 ? BX_COR.accent3 : BX_COR.accent;

    let degrauLabel = 'Sem meta configurada', degrauCor = '#9CA3AF';
    if (metaBase > 0 || metaMens > 0) {
      degrauLabel = 'Meta ainda não atingida'; degrauCor = '#9CA3AF';
      if (com.bateuKing)       { degrauLabel = '👑 King';   degrauCor = '#7C3AED'; }
      else if (com.bateuPower) { degrauLabel = '⚡ Power';  degrauCor = BX_COR.accent; }
      else if (com.bateuSuper) { degrauLabel = '⭐ Super';  degrauCor = '#F59E0B'; }
      else if (com.bateuMeta)  { degrauLabel = '✅ Meta batida'; degrauCor = '#10A64A'; }
    }

    const perfilLabel = u.perfil === 'supervisor' ? 'Supervisor' : 'Especialista';
    const perfilCor   = u.perfil === 'supervisor' ? '#0284C7' : '#6B7280';
    const perfilBadge = `<span style="display:inline-block;padding:1px 7px;border-radius:8px;font-size:9px;font-weight:700;background:${perfilCor}18;color:${perfilCor};text-transform:uppercase;letter-spacing:.03em;margin-left:6px;">${perfilLabel}</span>`;

    return `
      <div class="rmeta-row">
        <div class="rmeta-head" style="display:flex;justify-content:space-between;align-items:center;">
          <span class="rmeta-nome">${Utils.escHtml(u.nome)}${u.sigla ? ' <span style="color:var(--text-muted);font-weight:500;">· ' + Utils.escHtml(u.sigla) + '</span>' : ''}${perfilBadge}</span>
          <span style="font-size:11px;font-weight:700;color:${degrauCor};">${degrauLabel}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:4px;align-items:end;">
          <div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:3px;">
              <span>🏆 Vendas</span><span>${com.qtdVendas}/${metaBase || '—'}</span>
            </div>
            <div class="rmeta-track"><div class="rmeta-fill" style="width:${pctVendas}%;background:${corV};"></div></div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:3px;">
              <span>💰 Mensalidade</span><span>R$ ${com.somaMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="rmeta-track"><div class="rmeta-fill" style="width:${pctMensal}%;background:${corM};"></div></div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:var(--text-muted);">💸 Comissão prevista</div>
            <div style="font-size:16px;font-weight:800;color:var(--d-txt-1b6b3a);font-family:'JetBrains Mono';">R$ ${com.comissao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>
      </div>`;
  }
  static render() {
    const $tb = $('#usuarios-tbody');
    if (!$tb.length) return;
    const isGerente = AuthService.currentProfile && AuthService.currentProfile.perfil === 'gerente';
    $tb.html(store.usuarios.map(u => {
      const p = PERFIL_CONFIG[u.perfil] || PERFIL_CONFIG.especialista;
      const statusAtivo = u.status !== 'inativo';
      const statusBadge = statusAtivo
        ? '<span class="badge text-bg-success">● Ativo</span>'
        : '<span class="badge text-bg-secondary">● Inativo</span>';
      
      var acoes = '<button class="btn btn-sm btn-outline-secondary" onclick="UsuarioModule.editar(\'' + u.sigla + '\')" title="Editar"><i class="bi bi-pencil"></i></button>';
      
      if (isGerente) {
        if (statusAtivo) {
          acoes += ' <button class="btn btn-sm btn-outline-warning" onclick="UsuarioModule.inativar(\'' + u.sigla + '\')" title="Inativar"><i class="bi bi-pause-circle"></i></button>';
        } else {
          acoes += ' <button class="btn btn-sm btn-outline-success" onclick="UsuarioModule.ativar(\'' + u.sigla + '\')" title="Reativar"><i class="bi bi-play-circle"></i></button>';
        }
        acoes += ' <button class="btn btn-sm btn-outline-danger" onclick="UsuarioModule.excluir(\'' + u.sigla + '\')" title="Excluir"><i class="bi bi-trash"></i></button>';
      }

      return `<tr style="${!statusAtivo ? 'opacity:0.5;' : ''}">
        <td>
          <div class="d-flex align-items-center gap-2">
            ${u.avatar_url ? '<img src="'+u.avatar_url+'" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">' : '<div class="avatar-circle">'+u.sigla+'</div>'}
            <div>
              <div class="fw-semibold">${Utils.escHtml(u.nome)}</div>
              <div class="small text-muted">${Utils.escHtml(u.email||'')}</div>
            </div>
          </div>
        </td>
        <td><code>${u.sigla}</code></td>
        <td>${Utils.escHtml(u.filial || '—')}</td>
        <td><span class="badge ${p.cls}">${p.label}</span></td>
        <td>${u.meta_vendas?u.meta_vendas+' vendas / R$'+(u.meta_mensalidade||0).toLocaleString('pt-BR',{minimumFractionDigits:2}):'—'}</td>
        <td>${statusBadge}</td>
        <td>${acoes}</td>
      </tr>`;
    }).join(''));
  }

  /* ── Inativar usuário ── */
  static inativar(sigla) {
    var u = store.usuarios.find(function(x) { return x.sigla === sigla; });
    if (!u) return;
    ConfirmDialog.show('⏸️', 'Inativar Usuário', 'Deseja inativar "' + u.nome + '"? O usuário não poderá mais fazer login.', async function() {
      u.status = 'inativo';
      SLog.load('Inativando usuário: ' + u.nome);

      if (u._id && supa) {
        var res = await supa.from('profiles').update({ status: 'inativo' }).eq('id', u._id);
        if (res.error) {
          SLog.error('DB UPDATE profiles: ' + res.error.message);
          Toast.show('Erro ao inativar: ' + res.error.message, 'danger');
          u.status = 'ativo';
          return;
        }
        SLog.info('DB UPDATE profiles: inativado ✓');
      }

      UsuarioModule.render();
      Toast.show('Usuário "' + u.nome + '" inativado.', 'warning');
    });
  }

  /* ── Reativar usuário ──
     Onda 3 pós-testes (#11): se o usuário reativado é supervisor,
     avisar o gerente que os vínculos com especialistas foram
     removidos na inativação (InativacaoUsuarioModule v1.1) e é
     necessário editar o cadastro pra revincular a equipe. */
  static ativar(sigla) {
    var u = store.usuarios.find(function(x) { return x.sigla === sigla; });
    if (!u) return;
    ConfirmDialog.show('▶️', 'Reativar Usuário', 'Deseja reativar "' + u.nome + '"?', async function() {
      u.status = 'ativo';
      SLog.load('Reativando usuário: ' + u.nome);

      if (u._id && supa) {
        var res = await supa.from('profiles').update({ status: 'ativo' }).eq('id', u._id);
        if (res.error) {
          SLog.error('DB UPDATE profiles: ' + res.error.message);
          Toast.show('Erro ao reativar: ' + res.error.message, 'danger');
          u.status = 'inativo';
          return;
        }
        SLog.info('DB UPDATE profiles: reativado ✓');
      }

      UsuarioModule.render();
      Toast.show('Usuário "' + u.nome + '" reativado!', 'success');

      /* Onda 3 (#11) — aviso extra pra supervisor */
      if (u.perfil === 'supervisor') {
        setTimeout(function() {
          ConfirmDialog.show(
            '⚠️',
            'Supervisor sem equipe',
            'Este supervisor voltou SEM equipe vinculada (a lista de especialistas foi limpa na inativação). ' +
            'Deseja abrir o cadastro dele agora para revincular a equipe?',
            function() {
              UsuarioModule.editar(u.sigla);
            }
          );
        }, 300);
      }
    });
  }

  /* ── Excluir usuário via Edge Function ── */
  static excluir(sigla) {
    var u = store.usuarios.find(function(x) { return x.sigla === sigla; });
    if (!u) return;

    if (AuthService.currentUser && u._id === AuthService.currentUser.id) {
      Toast.show('Você não pode excluir seu próprio usuário.', 'danger');
      return;
    }

    ConfirmDialog.show('🗑️', 'Excluir Usuário', 'Deseja excluir permanentemente "' + u.nome + '"? Esta ação não pode ser desfeita.', async function() {
      SLog.load('Excluindo usuário via Edge Function: ' + u.nome);

      try {
        var session = await AuthService.getSession();
        if (!session) { Toast.show('Sessão expirada. Faça login novamente.', 'danger'); return; }

        var response = await fetch(SupabaseConfig.URL + '/functions/v1/delete-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + session.access_token,
            'apikey': SupabaseConfig.ANON_KEY,
          },
          body: JSON.stringify({ user_id: u._id }),
        });

        var result = await response.json();

        if (!response.ok || result.error) {
          SLog.error('AUTH Edge Function delete: ' + (result.error || 'Erro desconhecido'));
          Toast.show(result.error || 'Falha ao excluir usuário', 'danger');
          return;
        }

        SLog.info('AUTH usuário excluído via Edge Function ✓');
        store.usuarios = store.usuarios.filter(function(x) { return x.sigla !== sigla; });
        UsuarioModule.render();
        Toast.show('Usuário "' + u.nome + '" excluído.', 'warning');
      } catch (err) {
        var msg = err.message || 'Falha ao excluir';
        if (msg.includes('Failed to fetch')) msg = 'Sem conexão com o servidor.';
        Toast.show(msg, 'danger');
      }
    });
  }

  static async abrirNovo() {
    $('#form-usuario')[0].reset();
    $('#form-usuario').removeData('editSigla');
    $('#form-usuario').removeData('editId');
    $('#usr-senha').val('');
    $('#usr-foto').val('');
    $('#usr-foto-error').hide();
    $('#usr-foto-preview').html('<i class="bi bi-person-fill" style="font-size:28px;color:var(--d-txt-9ca3af);"></i>');
    
    /* Mostrar campo de senha (escondido na edição) */
    $('#usr-senha').closest('.col-12').show();
    
    /* Trocar texto do botão */
    $('#btn-salvar-usuario').html('<i class="bi bi-check-lg"></i> Cadastrar Usuário');
    
    /* Se filiais ainda não carregaram, buscar do banco */
    if (!store.filiais.length && supa) {
      SLog.load('Filiais vazias no store, buscando do banco...');
      var res = await supa.from('filiais').select('*');
      if (res.data && res.data.length) {
        store.filiais = res.data.map(function(f) { return { id: f.id, nome: f.nome, local: f.local }; });
        SLog.info('filiais: ' + res.data.length + ' carregadas sob demanda');
      } else {
        SLog.warn('filiais: tabela vazia ou erro — ' + (res.error ? res.error.message : 'sem dados'));
      }
    }
    
    /* Popular select de filiais */
    var $usrFilial = $('#usr-filial');
    $usrFilial.html('<option value="">Selecione...</option>');
    store.filiais.forEach(function(f) {
      $usrFilial.append('<option value="' + f.nome + '">' + f.nome + ' — ' + (f.local || '') + '</option>');
    });
    $usrFilial.append('<option value="Todas">Todas</option>');
    
    SLog.info('Modal usuário: ' + store.filiais.length + ' filiais no select');
    Modal.abrir('modal-usuario');
  }

  static async salvar() {
    const nome    = $('#usr-nome').val().trim();
    const sigla   = $('#usr-sigla').val().trim().toUpperCase();
    const filial  = $('#usr-filial').val();
    const perfil  = $('#usr-perfil').val();
    const email   = $('#usr-email').val().trim();
    const senha   = $('#usr-senha').val();
    const metaV     = parseFloat($('#usr-meta-vendas').val()) || 0;
    /* Onda 5 fix (bug 1) — campo agora aceita máscara BR ("R$ 2.448,60").
       parseFloat não sabia extrair; Utils.parseValor faz o trabalho. */
    const metaM     = Utils.parseValor($('#usr-meta-mensal').val()) || 0;
    const metaSuper = parseInt($('#usr-meta-super').val(), 10) || 0;   /* RN-17 */
    const metaPower = parseInt($('#usr-meta-power').val(), 10) || 0;   /* RN-17 */
    const metaKing  = parseInt($('#usr-meta-king').val(),  10) || 0;   /* RN-17 */
    /* Chamado #51 — valor de mensalidade de cada degrau (máscara BR). */
    const metaSuperVal = Utils.parseValor($('#usr-meta-super-mensal').val()) || 0;
    const metaPowerVal = Utils.parseValor($('#usr-meta-power-mensal').val()) || 0;
    const metaKingVal  = Utils.parseValor($('#usr-meta-king-mensal').val())  || 0;

    const editSigla = $('#form-usuario').data('editSigla');
    const editId    = $('#form-usuario').data('editId');
    const isEdicao  = !!editSigla;

    /* ── Validações front-end ── */
    if (!nome) { Toast.show('Preencha o nome completo.', 'warning'); $('#usr-nome').focus(); return; }
    if (nome.length < 3) { Toast.show('Nome deve ter pelo menos 3 caracteres.', 'warning'); $('#usr-nome').focus(); return; }

    if (!sigla) { Toast.show('Preencha a sigla (2 letras).', 'warning'); $('#usr-sigla').focus(); return; }
    if (sigla.length !== 2) { Toast.show('Sigla deve ter exatamente 2 letras.', 'warning'); $('#usr-sigla').focus(); return; }
    if (!/^[A-Z]{2}$/.test(sigla)) { Toast.show('Sigla deve conter apenas letras (A-Z).', 'warning'); $('#usr-sigla').focus(); return; }

    if (!email) { Toast.show('Preencha o e-mail.', 'warning'); $('#usr-email').focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { Toast.show('E-mail inválido.', 'warning'); $('#usr-email').focus(); return; }

    /* Senha obrigatória apenas na criação */
    if (!isEdicao) {
      if (!senha) { Toast.show('Defina uma senha inicial.', 'warning'); $('#usr-senha').focus(); return; }
      if (senha.length < 8) { Toast.show('Senha deve ter pelo menos 8 caracteres.', 'warning'); $('#usr-senha').focus(); return; }
      if (!/[A-Z]/.test(senha)) { Toast.show('Senha deve conter pelo menos 1 letra maiúscula.', 'warning'); $('#usr-senha').focus(); return; }
      if (!/[0-9]/.test(senha)) { Toast.show('Senha deve conter pelo menos 1 número.', 'warning'); $('#usr-senha').focus(); return; }
    }

    if (!filial) { Toast.show('Selecione uma filial.', 'warning'); $('#usr-filial').focus(); return; }
    if (!perfil) { Toast.show('Selecione um perfil.', 'warning'); $('#usr-perfil').focus(); return; }

    /* Verificar duplicatas (excluindo o próprio na edição) */
    var emailExiste = store.usuarios.find(function(u) { return u.email === email && u.sigla !== editSigla; });
    if (emailExiste) { Toast.show('Já existe um usuário com este e-mail.', 'warning'); return; }

    var siglaExiste = store.usuarios.find(function(u) { return u.sigla === sigla && u.sigla !== editSigla; });
    if (siglaExiste) { Toast.show('Já existe um usuário com a sigla "' + sigla + '".', 'warning'); return; }

    var $btn = $('#btn-salvar-usuario');
    var btnOriginal = $btn.html();
    $btn.prop('disabled', true).html('<i class="bi bi-arrow-repeat spin-icon"></i> Salvando...');

    try {
      if (isEdicao) {
        /* ── EDIÇÃO ── */
        SLog.load('Atualizando usuário: ' + nome);
        
        /* Atualizar no store local */
        var usuario = store.usuarios.find(function(u) { return u.sigla === editSigla; });
        /* Chamado #34 — captura metas ANTES pra detectar mudança */
        var metasAntes = usuario ? {
          v: Number(usuario.meta_vendas)       || 0,
          m: Number(usuario.meta_mensalidade)  || 0,
          s: Number(usuario.meta_super_vendas) || 0,
          p: Number(usuario.meta_power_vendas) || 0,
          k: Number(usuario.meta_king_vendas)  || 0,
          /* Chamado #51 — valores por degrau */
          sv: Number(usuario.meta_super_mensalidade) || 0,
          pv: Number(usuario.meta_power_mensalidade) || 0,
          kv: Number(usuario.meta_king_mensalidade)  || 0,
        } : null;
        /* Chamado #63 (camada 2) — captura o e-mail ANTES pra detectar
           se mudou e, se mudou, sincronizar também o e-mail de LOGIN
           (auth.users) via Edge Function admin-update-email. */
        var emailAntes = usuario ? (usuario.email || '') : '';
        if (usuario) {
          usuario.nome = nome;
          usuario.sigla = sigla;
          usuario.filial = filial;
          usuario.perfil = perfil;
          usuario.email = email;
          usuario.meta_vendas = metaV;
          usuario.meta_mensalidade = metaM;
          usuario.meta_super_vendas = metaSuper;   /* RN-17 */
          usuario.meta_power_vendas = metaPower;   /* RN-17 */
          usuario.meta_king_vendas  = metaKing;    /* RN-17 */
          /* Chamado #51 — valores por degrau */
          usuario.meta_super_mensalidade = metaSuperVal;
          usuario.meta_power_mensalidade = metaPowerVal;
          usuario.meta_king_mensalidade  = metaKingVal;
        }
        
        /* Persistir no Supabase */
        if (editId && supa) {
          var filialId = null;
          if (filial && filial !== 'Todas') {
            var f = store.filiais.find(function(x) { return x.nome === filial; });
            if (f) filialId = f.id;
          }
          
          var updateRes = await supa.from('profiles').update({
            nome: nome,
            sigla: sigla,
            perfil: perfil,
            /* Chamado #63 — o email NUNCA era incluído neste UPDATE, então
               a correção de e-mail no cadastro se perdia (o objeto local
               era atualizado mas o banco não, e no reload voltava o antigo).
               Agora o profiles.email é persistido de fato.
               OBS: isto atualiza APENAS o e-mail cadastral (tabela profiles).
               O e-mail de LOGIN (auth.users) é uma segunda camada tratada
               na rodada de infra (Edge Function admin). */
            email: email,
            filial_id: filialId,
            meta_mensalidade: metaM,
            meta_vendas: metaV,
            meta_super_vendas: metaSuper,   /* RN-17 */
            meta_power_vendas: metaPower,   /* RN-17 */
            meta_king_vendas:  metaKing,    /* RN-17 */
            /* Chamado #51 — valor de mensalidade por degrau */
            meta_super_mensalidade: metaSuperVal,
            meta_power_mensalidade: metaPowerVal,
            meta_king_mensalidade:  metaKingVal,
          }).eq('id', editId);
          
          if (updateRes.error) {
            SLog.error('DB UPDATE profiles: ' + updateRes.error.message);
            Toast.show('Erro ao salvar no banco: ' + updateRes.error.message, 'danger');
          } else {
            SLog.info('DB UPDATE profiles: salvo no banco ✓');

            /* ================================================================
               Chamado #34 — versionamento mensal das metas
               ================================================================
               Se alguma das 5 metas mudou, grava (upsert) uma versão em
               meta_versoes carimbada com o mês atual. Meses anteriores
               ficam preservados; o ciclo em andamento passa a usar
               esses valores automaticamente (E3).
               Idempotente: 2 edições no mesmo mês atualizam a mesma linha
               (unique profile_id + ano_mes).
               ================================================================ */
            var mudou = !metasAntes ||
              metasAntes.v !== metaV     || metasAntes.m !== metaM     ||
              metasAntes.s !== metaSuper || metasAntes.p !== metaPower ||
              metasAntes.k !== metaKing  ||
              metasAntes.sv !== metaSuperVal || metasAntes.pv !== metaPowerVal ||
              metasAntes.kv !== metaKingVal;

            if (mudou) {
              var hoje = new Date();
              var anoMes = hoje.getFullYear() + '-' +
                           String(hoje.getMonth() + 1).padStart(2, '0') + '-01';
              var meuUid = (AuthService.currentProfile && AuthService.currentProfile.id) || null;
              try {
                var upRes = await supa.from('meta_versoes').upsert({
                  profile_id:        editId,
                  ano_mes:           anoMes,
                  meta_vendas:       metaV,
                  meta_mensalidade:  metaM,
                  meta_super_vendas: metaSuper,
                  meta_power_vendas: metaPower,
                  meta_king_vendas:  metaKing,
                  /* Chamado #51 — valores por degrau versionados */
                  meta_super_mensalidade: metaSuperVal,
                  meta_power_mensalidade: metaPowerVal,
                  meta_king_mensalidade:  metaKingVal,
                  created_by:        meuUid,
                }, { onConflict: 'profile_id,ano_mes' }).select().single();

                if (upRes.error) {
                  SLog.error('meta_versoes upsert: ' + upRes.error.message);
                  Toast.show('Metas salvas, mas o histórico do mês não foi versionado. Veja o log.', 'warning');
                } else if (upRes.data) {
                  /* Reflete localmente pra Minha Performance atualizar sem F5 */
                  if (!Array.isArray(store.metaVersoes)) store.metaVersoes = [];
                  var novo = {
                    _uuid: upRes.data.id,
                    profile_id: upRes.data.profile_id,
                    ano_mes: upRes.data.ano_mes,
                    meta_vendas:       Number(upRes.data.meta_vendas || 0),
                    meta_mensalidade:  Number(upRes.data.meta_mensalidade || 0),
                    meta_super_vendas: Number(upRes.data.meta_super_vendas || 0),
                    meta_power_vendas: Number(upRes.data.meta_power_vendas || 0),
                    meta_king_vendas:  Number(upRes.data.meta_king_vendas  || 0),
                    /* Chamado #51 — valores por degrau */
                    meta_super_mensalidade: Number(upRes.data.meta_super_mensalidade || 0),
                    meta_power_mensalidade: Number(upRes.data.meta_power_mensalidade || 0),
                    meta_king_mensalidade:  Number(upRes.data.meta_king_mensalidade  || 0),
                  };
                  /* Remove versão anterior deste (profile, mes), se estiver em memória */
                  store.metaVersoes = store.metaVersoes.filter(function(v) {
                    return !(v.profile_id === novo.profile_id && v.ano_mes === novo.ano_mes);
                  });
                  store.metaVersoes.unshift(novo);
                  /* Reordena DESC por ano_mes (a busca depende disso) */
                  store.metaVersoes.sort(function(a, b) {
                    return (a.ano_mes < b.ano_mes) ? 1 : ((a.ano_mes > b.ano_mes) ? -1 : 0);
                  });
                  SLog.info('meta_versoes: versão de ' + anoMes + ' gravada ✓');
                }
              } catch (verErr) {
                SLog.error('meta_versoes upsert exceção: ' + verErr.message);
              }
            }
          }
        }
        
        /* ================================================================
           Chamado #63 (camada 2) — sincronizar e-mail de LOGIN (auth.users)
           ================================================================
           O UPDATE de profiles acima corrige o e-mail CADASTRAL. Mas o
           e-mail de login mora em auth.users e só pode ser alterado com
           privilégio admin — por isso delegamos à Edge Function dedicada
           admin-update-email (valida que o chamador é gerente e usa
           service_role).

           Best-effort: se o e-mail não mudou, nem chama. Se a função
           ainda não estiver publicada (ou falhar), o cadastral já foi
           salvo — apenas avisamos que o login não sincronizou, sem
           travar o resto da edição. */
        var emailMudou = editId && (String(email).toLowerCase() !== String(emailAntes).toLowerCase());
        if (emailMudou) {
          try {
            await AuthService.atualizarEmailUsuario(editId, email);
            SLog.info('Chamado #63: e-mail de login sincronizado ✓');
            Toast.show('E-mail de login atualizado.', 'success');
          } catch (emailErr) {
            var em = (emailErr && emailErr.message) ? emailErr.message : 'falha desconhecida';
            SLog.warn('Chamado #63: e-mail de login NÃO sincronizado — ' + em);
            if (em.indexOf('404') >= 0 || em.toLowerCase().indexOf('not found') >= 0 || em.toLowerCase().indexOf('failed to fetch') >= 0) {
              Toast.show('Cadastro salvo, mas o e-mail de LOGIN não foi alterado (função admin ainda não publicada).', 'warning');
            } else {
              Toast.show('Cadastro salvo, mas o e-mail de LOGIN não foi alterado: ' + em, 'warning');
            }
          }
        }

        /* Upload de avatar se novo arquivo selecionado */
        var fotoFile = $('#usr-foto')[0].files && $('#usr-foto')[0].files[0];
        if (fotoFile && editId) {
          try {
            await AvatarService.upload(editId, fotoFile);
            Toast.show('Foto atualizada!', 'success');
            /* Onda 5 (#3.c) — se está editando o PRÓPRIO usuário
               logado, atualiza o header na hora. Antes só aparecia
               após F5 porque AvatarService.carregarNoHeader só rodava
               no boot. */
            var meuId = AuthService.currentProfile && (AuthService.currentProfile.id || AuthService.currentProfile._id);
            if (editId === meuId && AvatarService.carregarNoHeader) {
              try { await AvatarService.carregarNoHeader(editId); }
              catch (headerErr) { SLog.warn('AVATAR header refresh: ' + headerErr.message); }
            }
          } catch (fotoErr) {
            Toast.show('Dados salvos, mas erro na foto: ' + fotoErr.message, 'warning');
          }
        }
        
        UsuarioModule.render();
        Modal.fechar('modal-usuario');
        Toast.show('Usuário "' + nome + '" atualizado!', 'success');
        
      } else {
        /* ── CRIAÇÃO ── */
        if (!AuthService.currentProfile || AuthService.currentProfile.perfil !== 'gerente') {
          Toast.show('Apenas gerentes podem criar usuários.', 'danger');
          return;
        }
        
        await AuthService.criarUsuario({
          nome: nome, sigla: sigla, filial: filial, perfil: perfil,
          email: email, senha: senha,
          meta_mensalidade: metaM, meta_vendas: metaV,
          meta_super_vendas: metaSuper,   /* RN-17 */
          meta_power_vendas: metaPower,   /* RN-17 */
          meta_king_vendas:  metaKing,    /* RN-17 */
          /* Chamado #51 — valor de mensalidade por degrau */
          meta_super_mensalidade: metaSuperVal,
          meta_power_mensalidade: metaPowerVal,
          meta_king_mensalidade:  metaKingVal,
        });

        /* Upload de avatar se selecionado */
        var fotoFile = $('#usr-foto')[0].files && $('#usr-foto')[0].files[0];
        if (fotoFile) {
          try {
            /* O criarUsuario retorna userId, buscar do último usuário criado */
            var novoUser = store.usuarios[store.usuarios.length]; /* será adicionado abaixo */
            /* Buscar o userId recém-criado via email */
            if (supa) {
              var profRes = await supa.from('profiles').select('id').eq('email', email).single();
              if (profRes.data) {
                await AvatarService.upload(profRes.data.id, fotoFile);
                Toast.show('Foto de perfil enviada!', 'success');
              }
            }
          } catch (fotoErr) {
            Toast.show('Usuário criado, mas erro na foto: ' + fotoErr.message, 'warning');
          }
        }

        store.adicionarUsuario({ nome, sigla, filial, perfil, email, status:'ativo',
          meta_vendas: metaV, meta_mensalidade: metaM,
          meta_super_vendas: metaSuper, meta_power_vendas: metaPower, meta_king_vendas: metaKing,
          meta_super_mensalidade: metaSuperVal, meta_power_mensalidade: metaPowerVal, meta_king_mensalidade: metaKingVal });
        UsuarioModule.render();
        Modal.fechar('modal-usuario');
        Toast.show('Usuário "' + nome + '" criado com sucesso!', 'success');
      }

    } catch (err) {
      var msg = err.message || 'Falha na operação';
      if (msg.includes('User already registered') || msg.includes('already been registered')) {
        msg = 'Este e-mail já está cadastrado no sistema.';
      } else if (msg.includes('Password should be at least')) {
        msg = 'Senha não atende aos requisitos mínimos do servidor.';
      } else if (msg.includes('rate limit') || msg.includes('too many')) {
        msg = 'Muitas tentativas. Aguarde alguns minutos.';
      } else if (msg.includes('not authorized') || msg.includes('403')) {
        msg = 'Sem permissão. Apenas gerentes podem criar usuários.';
      } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        msg = 'Sem conexão com o servidor. Verifique sua internet.';
      } else if (msg.includes('Token ausente') || msg.includes('Não autenticado')) {
        msg = 'Sua sessão expirou. Faça login novamente.';
      }
      Toast.show(msg, 'danger');
    } finally {
      $btn.prop('disabled', false).html(btnOriginal);
    }
  }

  static async editar(sigla) {
    const u = store.usuarios.find(x => x.sigla === sigla);
    if (!u) return;
    
    /* Popular filiais */
    var $usrFilial = $('#usr-filial');
    if (!store.filiais.length && supa) {
      var res = await supa.from('filiais').select('*');
      if (res.data && res.data.length) {
        store.filiais = res.data.map(function(f) { return { id: f.id, nome: f.nome, local: f.local }; });
      }
    }
    $usrFilial.html('<option value="">Selecione...</option>');
    store.filiais.forEach(function(f) {
      $usrFilial.append('<option value="' + f.nome + '">' + f.nome + ' — ' + (f.local || '') + '</option>');
    });
    $usrFilial.append('<option value="Todas">Todas</option>');
    
    /* Preencher dados */
    $('#usr-nome').val(u.nome);
    $('#usr-sigla').val(u.sigla);
    $('#usr-filial').val(u.filial);
    $('#usr-perfil').val(u.perfil);
    $('#usr-email').val(u.email||'');
    $('#usr-senha').val('');
    $('#usr-meta-vendas').val(u.meta_vendas||0);
    /* Onda 5 fix (bug 1) — grava valor cru e reformata pra "R$ 2.448,60".
       A máscara BR do utils só reage a input do usuário; ao popular via
       código precisamos chamar reformatarValor explicitamente. */
    $('#usr-meta-mensal').val(u.meta_mensalidade||0);
    if (Utils.reformatarValor) Utils.reformatarValor('#usr-meta-mensal');
    $('#usr-meta-super').val(u.meta_super_vendas||0);   /* RN-17 */
    $('#usr-meta-power').val(u.meta_power_vendas||0);   /* RN-17 */
    $('#usr-meta-king').val(u.meta_king_vendas||0);     /* RN-17 */
    /* Chamado #51 — valores por degrau (máscara BR) */
    $('#usr-meta-super-mensal').val(u.meta_super_mensalidade||0);
    $('#usr-meta-power-mensal').val(u.meta_power_mensalidade||0);
    $('#usr-meta-king-mensal').val(u.meta_king_mensalidade||0);
    if (Utils.reformatarValor) {
      Utils.reformatarValor('#usr-meta-super-mensal');
      Utils.reformatarValor('#usr-meta-power-mensal');
      Utils.reformatarValor('#usr-meta-king-mensal');
    }
    
    /* Marcar como edição */
    $('#form-usuario').data('editSigla', sigla);
    $('#form-usuario').data('editId', u._id || null);
    
    /* Esconder campo de senha na edição */
    $('#usr-senha').closest('.col-12').hide();
    
    /* Trocar texto do botão */
    $('#btn-salvar-usuario').html('<i class="bi bi-check-lg"></i> Salvar Alterações');
    
    /* Reset e preview da foto */
    $('#usr-foto').val('');
    $('#usr-foto-error').hide();
    if (u._id && supa) {
      try {
        var avatarRes = await supa.storage.from('avatars').list('', { search: u._id + '.png' });
        if (avatarRes.data && avatarRes.data.length > 0) {
          var url = AvatarService.getUrl(u._id);
          $('#usr-foto-preview').html('<img src="' + url + '" style="width:64px;height:64px;border-radius:50%;object-fit:cover;">');
        } else {
          $('#usr-foto-preview').html('<i class="bi bi-person-fill" style="font-size:28px;color:var(--d-txt-9ca3af);"></i>');
        }
      } catch(e) {
        $('#usr-foto-preview').html('<i class="bi bi-person-fill" style="font-size:28px;color:var(--d-txt-9ca3af);"></i>');
      }
    }
    
    Modal.abrir('modal-usuario');
  }
}

/* ============================================================
   AuditModule — v2.0 (Sprint 7 · 7.5)
   ============================================================
   v1.0: render simples, slice(0,30), sem filtros.
   v2.0:
     - FiltroAvancadoComponent (drawer lateral): período, usuário,
       campo (tipo de operação) — mesma UX de Histórico/Agenda
     - Paginação simples via _paginaAtual + _porPagina (default 30)
     - Botão "Carregar mais" quando há mais registros
     - Limite ampliado de 50 → 200 (via SupabaseSync.carregarAuditLog)
     - Persistência de filtros em localStorage
       (chave 'beyond-filtros-auditoria')
     - APIs públicas preservadas: render(), limpar()
       (mesma assinatura — ConfigModule não precisa mudar)

   REGRA DE NEGÓCIO: atende RNF-07 do DRS v1.2
   ("Todas as alterações registradas em log com usuário e timestamp").
   ============================================================ */
class AuditModule {

  /* Instância do FiltroAvancadoComponent — populada por
     inicializarFiltros() no bootstrap do app. */
  static _filtroAvancado = null;

  /* Paginação */
  static _paginaAtual = 1;
  static _porPagina   = 30;

  /* ────────────────────────────────────────────────────────────
     Monta o FiltroAvancadoComponent. Chamado uma vez em app.js
     após SupabaseSync.carregarTudo().
     ──────────────────────────────────────────────────────────── */
  static inicializarFiltros() {
    if (typeof FiltroAvancadoComponent === 'undefined') {
      SLog.warn('AuditModule: FiltroAvancadoComponent indisponível');
      return;
    }
    if (AuditModule._filtroAvancado) return; /* idempotente */

    var campos = [
      {
        tipo: 'daterange',
        id: 'periodo',
        label: 'Período',
        /* datahora vem formatada 'dd/mm/aaaa, hh:mm:ss' (pt-BR) ou ISO —
           parseamos com _parseDataHora abaixo antes de comparar. */
        getValor: function(item) { return AuditModule._parseDataHora(item.datahora); },
      },
      {
        tipo: 'multi-select',
        id: 'usuarios',
        label: 'Usuário',
        getValor: function(item) { return item.usuario || null; },
        opcoesFn: function() {
          /* Deriva usuários distintos do próprio auditLog carregado. */
          var s = new Set();
          (store.auditLog || []).forEach(function(a) {
            if (a.usuario && String(a.usuario).trim()) {
              s.add(String(a.usuario).trim());
            }
          });
          return Array.from(s).sort().map(function(u) { return { val: u, label: u }; });
        },
      },
      {
        tipo: 'multi-select',
        id: 'operacoes',
        label: 'Tipo de operação',
        /* Extrai o "tipo" do campo — que segue o padrão
           "Novo Lead (X)", "Etapa (X)", "Tag (X)", etc.
           Pegamos só o começo antes do parêntese.
           Chamado #42: colapsamos retroativamente os logs antigos
           "Dados do lead AMP-XXXX-YYYYY" (que criavam uma categoria
           por lead) na única categoria "Dados do Lead". Os logs
           novos já gravam assim; os antigos passam a ser filtrados
           corretamente sem migração de banco. */
        getValor: function(item) {
          if (!item.campo) return null;
          var s = String(item.campo);
          if (/^Dados do lead\s+AMP/i.test(s)) return 'Dados do Lead';
          var m = s.match(/^([^\(]+?)(\s*\(|$)/);
          return m ? m[1].trim() : s.trim();
        },
        opcoesFn: function() {
          var s = new Set();
          (store.auditLog || []).forEach(function(a) {
            if (!a.campo) return;
            var raw = String(a.campo);
            var tipo;
            if (/^Dados do lead\s+AMP/i.test(raw)) {
              tipo = 'Dados do Lead';
            } else {
              var m = raw.match(/^([^\(]+?)(\s*\(|$)/);
              tipo = m ? m[1].trim() : raw.trim();
            }
            if (tipo) s.add(tipo);
          });
          return Array.from(s).sort().map(function(t) { return { val: t, label: t }; });
        },
      },
      {
        tipo: 'text',
        id: 'busca',
        label: 'Busca livre (campo/anterior/novo)',
        /* Consumido via getValor customizado — busca em 3 propriedades */
        getValor: function(item) {
          return (item.campo || '') + ' | ' + (item.anterior || '') + ' | ' + (item.novo || '');
        },
        placeholder: 'Ex: código do lead, nome, valor',
      },
    ];

    AuditModule._filtroAvancado = new FiltroAvancadoComponent({
      key:        'auditoria',
      storageKey: 'beyond-filtros-auditoria',
      container:  '#filtro-auditoria-body',
      drawerId:   'filtro-auditoria-drawer',
      onChange:   function() {
        AuditModule._paginaAtual = 1; /* reset paginação ao aplicar filtro */
        AuditModule.render();
        AuditModule._atualizarBadgeFiltro();
      },
      campos: campos,
    });

    AuditModule._filtroAvancado.montar();
    AuditModule._atualizarBadgeFiltro();
  }

  /* Handlers do drawer (chamados pelo HTML). */
  static abrirFiltroAvancado() {
    if (!AuditModule._filtroAvancado) AuditModule.inicializarFiltros();
    if (!AuditModule._filtroAvancado) return;
    AuditModule._filtroAvancado.montar();
    AuditModule._filtroAvancado.abrir();
  }
  static aplicarFiltroAvancado() {
    if (AuditModule._filtroAvancado) AuditModule._filtroAvancado.aplicar();
    AuditModule._atualizarBadgeFiltro();
  }
  static limparFiltroAvancado() {
    if (AuditModule._filtroAvancado) AuditModule._filtroAvancado.limpar();
    AuditModule._paginaAtual = 1;
    AuditModule._atualizarBadgeFiltro();
    AuditModule.render();
  }
  static fecharFiltroAvancado() {
    if (AuditModule._filtroAvancado) AuditModule._filtroAvancado.fechar();
  }

  static _atualizarBadgeFiltro() {
    var $b = $('#btn-filtro-auditoria-count');
    if (!$b.length || !AuditModule._filtroAvancado) return;
    var qtd = AuditModule._filtroAvancado.contarAtivos();
    if (qtd > 0) $b.text(qtd).show();
    else $b.hide();
  }

  /* Parser tolerante de datahora — aceita 'dd/mm/aaaa hh:mm[:ss]',
     'dd/mm/aaaa, hh:mm[:ss]' (pt-BR do toLocaleString) e ISO 8601.
     Retorna Date ou null. Usado pelo filtro de período. */
  static _parseDataHora(txt) {
    if (!txt) return null;
    if (txt instanceof Date) return txt;
    var s = String(txt).trim();

    /* ISO 8601 */
    if (/^\d{4}-\d{2}-\d{2}[T\s]/.test(s)) {
      var d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    }

    /* pt-BR: dd/mm/aaaa[,] hh:mm[:ss] */
    var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})[,\s]+(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      var dt = new Date(
        parseInt(m[3], 10),
        parseInt(m[2], 10) - 1,
        parseInt(m[1], 10),
        parseInt(m[4], 10),
        parseInt(m[5], 10),
        parseInt(m[6] || '0', 10)
      );
      return isNaN(dt.getTime()) ? null : dt;
    }
    return null;
  }

  /* Chamado #55 — Recorte por perfil ANTES de qualquer filtro do drawer.
     Regra do cliente:
       • Gerente        → histórico completo (nada é recortado).
       • Especialista/  → apenas as próprias alterações E apenas dos
         Supervisor        últimos 3 meses.
     O recorte é por _usuario_id (UUID) quando disponível; se algum
     registro antigo não tiver _usuario_id (dado legado), caímos no
     nome como fallback pra não vazar registro de terceiros.
     A janela de 3 meses usa _datahora_iso quando presente; sem ISO,
     tentamos o parser tolerante existente (_parseDataHora). */
  static _recortarPorPerfil(lista) {
    var prof = (typeof AuthService !== 'undefined') ? AuthService.currentProfile : null;
    var perfil = (prof && prof.perfil) || '';
    if (perfil === 'gerente') return lista;          /* gerente vê tudo */
    if (!prof) return [];                             /* sem sessão → nada */

    var meuId   = prof.id || null;
    var meuNome = prof.nome || null;

    /* Janela: início = agora - 3 meses (calendário). */
    var corte = new Date();
    corte.setMonth(corte.getMonth() - 3);

    return lista.filter(function(a) {
      /* 1) Dono do registro */
      var meu;
      if (a._usuario_id && meuId) {
        meu = (a._usuario_id === meuId);
      } else {
        /* Fallback por nome (registros legados sem usuario_id) */
        meu = (a.usuario && meuNome && String(a.usuario) === String(meuNome));
      }
      if (!meu) return false;

      /* 2) Janela de 3 meses */
      var dt = null;
      if (a._datahora_iso) {
        var d = new Date(a._datahora_iso);
        if (!isNaN(d.getTime())) dt = d;
      }
      if (!dt) dt = AuditModule._parseDataHora(a.datahora);
      /* Sem data confiável: por segurança mantém (não esconde o próprio
         registro do usuário só por falha de parse). */
      if (!dt) return true;
      return dt >= corte;
    });
  }

  /* Aplica os filtros ativos (se houver) sobre store.auditLog.
     Preserva ordem de chegada.
     Chamado #55 — sempre aplica primeiro o recorte por perfil; os
     filtros do drawer operam sobre o conjunto já recortado. */
  static _aplicarFiltros() {
    var base = AuditModule._recortarPorPerfil(store.auditLog || []);
    if (!AuditModule._filtroAvancado || AuditModule._filtroAvancado.contarAtivos() === 0) {
      return base;
    }
    /* FiltroAvancadoComponent.filtrar espera "leads" mas o método é
       genérico — aceita qualquer array de objetos. Sem contexto extra
       aqui (2º parâmetro não usado pelos campos declarados). */
    return AuditModule._filtroAvancado.filtrar(base, {});
  }

  /* ────────────────────────────────────────────────────────────
     Renderiza a tabela com paginação.
     Assinatura preservada (só render(), sem parâmetros) —
     ConfigModule e SupabaseSync não precisam ser tocados.
     ──────────────────────────────────────────────────────────── */
  static render() {
    var $tb = $('#audit-tbody');
    if (!$tb.length) return;

    var filtrados = AuditModule._aplicarFiltros();

    if (!filtrados.length) {
      $tb.html('<tr><td colspan="5" class="text-center text-muted py-3">Nenhum registro de alteração.</td></tr>');
      AuditModule._renderRodape(0, 0);
      return;
    }

    var limite = AuditModule._paginaAtual * AuditModule._porPagina;
    var exibindo = filtrados.slice(0, limite);

    $tb.html(exibindo.map(function(a) {
      /* Onda 5 fix (bug 3) — formatação humana em vez de JSON cru.
         Antes: coluna "Novo Valor" mostrava
           {"obs":"...","captador_id":"uuid...","fonte":"..."}
         Agora: mostra
           obs: ... • captador_id: uuid... • fonte: ...
         E UUIDs longos são truncados com ellipsis. */
      var anteriorFmt = AuditModule._formatarValor(a.anterior);
      var novoFmt     = AuditModule._formatarValor(a.novo);
      var campoFmt    = AuditModule._formatarCampo(a.campo);
      return '<tr>' +
        '<td>' + Utils.escHtml(a.usuario || '—') + '</td>' +
        '<td>' + campoFmt + '</td>' +
        '<td class="text-muted small">' + anteriorFmt + '</td>' +
        '<td class="fw-semibold small">' + novoFmt + '</td>' +
        '<td><code class="small">' + Utils.escHtml(a.datahora || '') + '</code></td>' +
        '</tr>';
    }).join(''));

    AuditModule._renderRodape(exibindo.length, filtrados.length);
  }

  /* ============================================================
     Onda 5 fix (bug 3) — formatação humana pros valores do audit
     ============================================================
     Casos tratados:
     - JSON: {"a":"b","c":"d"} → "a: b • c: d"
     - UUID longo: 550e8400-e29b-41d4-a716-446655440000 → "550e8400…"
     - Data ISO: 2026-07-27T14:30:00Z → "27/07/2026 14:30"
     - Traço/vazio: preserva "—"
     ============================================================ */
  static _formatarValor(v) {
    if (v == null || v === '' || v === '—') return '<span class="text-muted">—</span>';
    var s = String(v).trim();

    /* Tenta parsear como JSON — se conseguir, humaniza como "chave: valor • chave: valor" */
    if (s.length > 2 && (s.charAt(0) === '{' || s.charAt(0) === '[')) {
      try {
        var obj = JSON.parse(s);
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          var pares = Object.keys(obj).map(function(k) {
            var val = obj[k];
            var valStr;
            if (val == null) valStr = '(vazio)';
            else if (typeof val === 'object') valStr = JSON.stringify(val);
            else valStr = String(val);
            /* Trunca UUIDs longos internos */
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valStr)) {
              valStr = valStr.slice(0, 8) + '…';
            }
            /* Trunca strings muito longas */
            if (valStr.length > 40) valStr = valStr.slice(0, 40) + '…';
            return '<span class="audit-key">' + Utils.escHtml(k) + ':</span> ' + Utils.escHtml(valStr);
          });
          return pares.join(' <span class="audit-sep">•</span> ');
        }
      } catch (e) { /* não é JSON válido — segue como texto normal */ }
    }

    /* UUID solto */
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
      return '<code>' + Utils.escHtml(s.slice(0, 8)) + '…</code>';
    }

    /* Data ISO → dd/mm/aaaa hh:mm */
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
      try {
        var d = new Date(s);
        if (!isNaN(d.getTime())) {
          var pad2 = function(n) { return String(n).padStart(2, '0'); };
          return pad2(d.getDate()) + '/' + pad2(d.getMonth()+1) + '/' + d.getFullYear() +
                 ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
        }
      } catch (e) { /* mantém raw */ }
    }

    /* Texto normal — trunca se muito longo */
    if (s.length > 80) return Utils.escHtml(s.slice(0, 80)) + '…';
    return Utils.escHtml(s);
  }

  /* Formata a coluna "Campo" destacando o código do lead quando presente. */
  static _formatarCampo(campo) {
    if (!campo) return '<span class="text-muted">—</span>';
    var s = String(campo);
    /* Detecta padrão "Nome (LD-XXX)" — separa em ação + código */
    var m = s.match(/^(.+?)\s*\((.+?)\)\s*$/);
    if (m) {
      return '<span>' + Utils.escHtml(m[1]) + '</span> ' +
             '<code class="audit-cod">' + Utils.escHtml(m[2]) + '</code>';
    }
    return Utils.escHtml(s);
  }

  /* Rodapé com contagem "X de Y" e botão "Carregar mais". */
  static _renderRodape(exibindo, total) {
    var $r = $('#audit-rodape');
    if (!$r.length) return;
    if (!total) {
      $r.html('');
      return;
    }
    var restante = total - exibindo;
    var html = '<div class="d-flex justify-content-between align-items-center small text-muted mt-2">';
    html += '<span>Exibindo <strong>' + exibindo + '</strong> de <strong>' + total + '</strong> registros</span>';
    if (restante > 0) {
      html += '<button class="btn btn-sm btn-outline-secondary" onclick="AuditModule.carregarMais()">';
      html += '<i class="bi bi-arrow-down-circle"></i> Carregar mais (' + Math.min(restante, AuditModule._porPagina) + ')';
      html += '</button>';
    }
    html += '</div>';
    $r.html(html);
  }

  /* Incrementa página e re-renderiza. */
  static carregarMais() {
    AuditModule._paginaAtual++;
    AuditModule.render();
  }

  /* Limpar todo o histórico (gerente) — API preservada de v1.0 */
  static limpar() {
    if (!AuthService.currentProfile || AuthService.currentProfile.perfil !== 'gerente') {
      Toast.show('Apenas gerentes podem limpar o histórico.', 'warning');
      return;
    }
    ConfirmDialog.show('🗑️', 'Limpar Histórico', 'Deseja apagar todos os registros de alteração? Esta ação não pode ser desfeita.', async function() {
      SLog.load('Limpando audit_log...');
      if (supa) {
        var res = await supa.from('audit_log').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (res.error) {
          SLog.error('DB DELETE audit_log: ' + res.error.message);
          Toast.show('Erro ao limpar: ' + res.error.message, 'danger');
          return;
        }
        SLog.info('DB DELETE audit_log: limpo ✓');
      }
      store.auditLog = [];
      AuditModule._paginaAtual = 1;
      AuditModule.render();
      Toast.show('Histórico de alterações limpo.', 'success');
    });
  }
}

/* ============================================================  ConfigModule */
class ConfigModule {
  static _cores = ['#059669','#2563EB','#7C3AED','#D97706','#6B7280','#DC2626','#0891B2','#4F46E5'];
  static _icons = ['🏢','🏬','🏪','🏘️','🌿','🏗️','🏠','📍'];
  static _bgs   = ['#D1FAE5','#DBEAFE','#EDE9FE','#FEF3C7','#F3F4F6','#FEE2E2','#CFFAFE','#E0E7FF'];

  /* ════════════════════════════════════════════════════════════
     Chamado #55 — Acesso a Configuração por perfil.
     ════════════════════════════════════════════════════════════
     Regra de negócio (do cliente):
       • Especialista → Minha Performance + Histórico de Alterações
                        (últimos 3 meses, só das próprias alterações)
       • Supervisor   → o acima + Usuários (cadastro) + Tags (criar)
       • Gerente      → tudo (comportamento original, nada muda)

     Este método é a ÚNICA fonte de verdade da visibilidade das
     seções. É idempotente: sempre reseta tudo (remove flags) e
     depois esconde só o que o perfil não pode ver. Assim, trocar
     de usuário na mesma aba (ou reentrar na página) nunca deixa
     resquício de um perfil anterior.

     IMPORTANTE (segurança em profundidade): esconder no front é UX,
     não autorização. As tabelas continuam protegidas por RLS no
     Supabase. Este método só evita expor controles/dados que o
     perfil não deve manipular pela UI.
     ──────────────────────────────────────────────────────────── */
  static aplicarVisibilidadePorPerfil() {
    var perfil = (AuthService.currentProfile && AuthService.currentProfile.perfil) || '';

    /* Mapa: seção → perfis que PODEM vê-la.
       'painel-minha-performance' e Suporte são de todos → não entram aqui. */
    var regras = {
      'cfg-sec-usuarios':      ['gerente', 'supervisor'],
      'cfg-sec-tags':          ['gerente', 'supervisor'],
      'cfg-sec-filiais':       ['gerente'],
      'config-metas-conversao':['gerente'],   /* já era só-gerente (via #44) */
      'cfg-sec-historico-alt': ['gerente', 'supervisor', 'especialista'],
    };

    Object.keys(regras).forEach(function(secId) {
      var $sec = $('#' + secId);
      if (!$sec.length) return;
      var permitido = regras[secId].indexOf(perfil) >= 0;
      /* config-metas-conversao é mostrado dinamicamente pelo
         TaxaConversaoModule só quando gerente; aqui garantimos que,
         para não-gerente, ele fique escondido de qualquer forma. */
      if (permitido) {
        /* Não forçamos "show" no metas-conversao — quem liga ele é o
           TaxaConversaoModule (evita mostrar antes de popular). Para as
           demais, mostramos. */
        if (secId !== 'config-metas-conversao') $sec.show();
      } else {
        $sec.hide();
      }
    });

    /* Botão "Limpar histórico" só pra gerente (o método já bloqueia,
       mas escondemos o controle pra não confundir). */
    var $btnLimpar = $('#btn-audit-limpar');
    if ($btnLimpar.length) {
      if (perfil === 'gerente') $btnLimpar.show();
      else $btnLimpar.hide();
    }

    /* Nota "(seus últimos 3 meses)" ao lado do título do Histórico —
       só faz sentido pra quem tem a visão recortada (não-gerente). */
    var $nota = $('#cfg-hist-alt-nota');
    if ($nota.length) {
      if (perfil === 'gerente') $nota.hide();
      else $nota.show();
    }
  }

  /* ── Renderizar Filiais ── */
  static renderFiliais() {
    var $grid = $('#filiais-grid');
    if (!$grid.length) return;
    var isGerente = AuthService.currentProfile && AuthService.currentProfile.perfil === 'gerente';
    $grid.empty();
    store.filiais.forEach(function(f, i) {
      var cor = ConfigModule._cores[i % ConfigModule._cores.length];
      var icon = ConfigModule._icons[i % ConfigModule._icons.length];
      var bg = ConfigModule._bgs[i % ConfigModule._bgs.length];
      var btnDel = isGerente ? '<button class="btn btn-sm btn-outline-danger ms-auto" onclick="ConfigModule.excluirFilial(\x27' + f.id + '\x27)" title="Excluir" style="flex-shrink:0;"><i class="bi bi-trash"></i></button>' : '';
      $grid.append(
        '<div class="col-md-4"><div class="kpi-card"><div class="kpi-icon" style="background:'+bg+';font-size:22px;">'+icon+'</div><div class="kpi-info flex-grow-1"><div style="font-size:15px;font-weight:800;color:'+cor+';">'+Utils.escHtml(f.nome)+'</div><div class="kpi-lbl">'+Utils.escHtml(f.local)+'</div></div>'+btnDel+'</div></div>'
      );
    });
    if (!store.filiais.length) {
      $grid.append('<div class="col-12 text-muted">Nenhuma filial cadastrada.</div>');
    }
  }

  /* ── Excluir Filial (verifica vínculos) ── */
  static excluirFilial(filialId) {
    var filial = store.filiais.find(function(f) { return f.id === filialId; });
    if (!filial) return;

    /* Verificar se tem usuários vinculados */
    var usrVinculados = store.usuarios.filter(function(u) { return u.filial === filial.nome; });
    if (usrVinculados.length > 0) {
      var nomes = usrVinculados.map(function(u) { return u.nome; }).join(', ');
      Toast.show('Não é possível excluir. Usuários vinculados: ' + nomes, 'danger');
      return;
    }

    ConfirmDialog.show('🗑️', 'Excluir Filial', 'Deseja excluir a filial "' + filial.nome + '"?', async function() {
      SLog.load('Excluindo filial: ' + filial.nome);
      if (supa) {
        var res = await supa.from('filiais').delete().eq('id', filialId);
        if (res.error) {
          SLog.error('DB DELETE filiais: ' + res.error.message);
          Toast.show('Erro ao excluir: ' + res.error.message, 'danger');
          return;
        }
        SLog.info('DB DELETE filiais: excluído ✓');
      }
      store.filiais = store.filiais.filter(function(f) { return f.id !== filialId; });
      /* Onda 4 pós-testes (#2) — registro no histórico */
      if (typeof store !== 'undefined' && store._logAudit) {
        store._logAudit('Excluir Filial', filial.nome + ' • ' + (filial.local || ''), '—');
      }
      ConfigModule.renderFiliais();
      Toast.show('Filial "' + filial.nome + '" excluída.', 'warning');
    });
  }

  /* ── Renderizar Tags ── */
  static renderTags() {
    var $grid = $('#tags-grid');
    if (!$grid.length) return;
    var isGerente = AuthService.currentProfile && AuthService.currentProfile.perfil === 'gerente';
    $grid.empty();
    store.tags.forEach(function(slug) {
      var cfg = TAG_CONFIG[slug] || { cls: '', label: slug };
      var delBtn = isGerente ? ' <button onclick="ConfigModule.excluirTag(\x27' + slug + '\x27)" style="background:none;border:none;color:inherit;cursor:pointer;opacity:.6;font-size:11px;padding:0 2px;" title="Excluir">✕</button>' : '';
      $grid.append('<span class="amp-tag '+cfg.cls+'" style="font-size:12px;padding:5px 12px;">'+cfg.label+delBtn+'</span>');
    });
    if (!store.tags.length) {
      $grid.append('<span class="text-muted">Nenhuma tag cadastrada.</span>');
    }
  }

  /* ── Excluir Tag (verifica vínculos com leads) ── */
  static excluirTag(slug) {
    var cfg = TAG_CONFIG[slug];
    if (!cfg) return;

    /* Verificar se tem leads com essa tag */
    var leadsComTag = store.leads.filter(function(l) { return (l.tags || []).indexOf(slug) >= 0; });
    if (leadsComTag.length > 0) {
      Toast.show('Não é possível excluir. ' + leadsComTag.length + ' lead(s) usam esta tag. Remova a tag dos leads primeiro.', 'danger');
      return;
    }

    ConfirmDialog.show('🗑️', 'Excluir Tag', 'Deseja excluir a tag "' + cfg.label + '"?', async function() {
      SLog.load('Excluindo tag: ' + cfg.label);
      if (supa) {
        var res = await supa.from('tags').delete().eq('slug', slug);
        if (res.error) {
          SLog.error('DB DELETE tags: ' + res.error.message);
          Toast.show('Erro ao excluir: ' + res.error.message, 'danger');
          return;
        }
        SLog.info('DB DELETE tags: excluído ✓');
      }
      delete TAG_CONFIG[slug];
      store.tags = store.tags.filter(function(t) { return t !== slug; });
      /* Onda 4 pós-testes (#2 — coerência) — registro no histórico */
      if (typeof store !== 'undefined' && store._logAudit) {
        store._logAudit('Excluir Tag', cfg.label + ' (' + slug + ')', '—');
      }
      ConfigModule.renderTags();
      Toast.show('Tag excluída.', 'warning');
    });
  }

  /* ── Nova Filial ── */
  static abrirNovaFilial() {
    $('#filial-nome').val('');
    $('#filial-local').val('');
    Modal.abrir('modal-nova-filial');
  }

  static async salvarFilial() {
    var nome = $('#filial-nome').val().trim();
    var local = $('#filial-local').val().trim();
    if (!nome) { Toast.show('Preencha o nome da filial.', 'warning'); return; }
    if (!local) { Toast.show('Preencha o local.', 'warning'); return; }
    var existe = store.filiais.find(function(f) { return f.nome.toLowerCase() === nome.toLowerCase(); });
    if (existe) { Toast.show('Já existe uma filial com este nome.', 'warning'); return; }
    SLog.load('Criando filial: ' + nome);
    if (supa) {
      var res = await supa.from('filiais').insert({ nome: nome, local: local }).select().single();
      if (res.error) {
        SLog.error('DB INSERT filiais: ' + res.error.message);
        Toast.show('Erro ao salvar: ' + res.error.message, 'danger');
        return;
      }
      store.filiais.push({ id: res.data.id, nome: res.data.nome, local: res.data.local });
      SLog.info('DB INSERT filiais: salvo no banco ✓');
    } else {
      store.filiais.push({ id: 'local-' + Date.now(), nome: nome, local: local });
    }
    /* Onda 4 pós-testes (#2) — Histórico de alterações da filial.
       Antes não gravava — o cliente registrou como bug (a criação
       de filial precisa aparecer no Histórico de Alterações como
       qualquer outro CRUD relevante do sistema). */
    if (typeof store !== 'undefined' && store._logAudit) {
      store._logAudit('Nova Filial', '—', nome + ' • ' + local);
    }
    ConfigModule.renderFiliais();
    Modal.fechar('modal-nova-filial');
    Toast.show('Filial "' + nome + '" criada!', 'success');
  }

  /* ── Nova Tag ── */
  static abrirNovaTag() {
    $('#tag-label').val('');
    $('#tag-slug').val('');
    Modal.abrir('modal-nova-tag');
  }

  static async salvarTag() {
    var label = $('#tag-label').val().trim();
    var slug = $('#tag-slug').val().trim().toLowerCase().replace(/\s+/g, '_');
    if (!label) { Toast.show('Preencha o texto da tag.', 'warning'); return; }
    if (!slug) { Toast.show('Preencha o slug.', 'warning'); return; }
    if (!/^[a-z0-9_]+$/.test(slug)) { Toast.show('Slug deve conter apenas letras minúsculas, números e underline.', 'warning'); return; }
    if (TAG_CONFIG[slug]) { Toast.show('Já existe uma tag com o slug "' + slug + '".', 'warning'); return; }
    SLog.load('Criando tag: ' + label);
    var cls = 'tag-' + slug;
    if (supa) {
      var res = await supa.from('tags').insert({ slug: slug, label: label, cls: cls }).select().single();
      if (res.error) {
        SLog.error('DB INSERT tags: ' + res.error.message);
        Toast.show('Erro ao salvar: ' + res.error.message, 'danger');
        return;
      }
      SLog.info('DB INSERT tags: salvo no banco ✓');
    }
    TAG_CONFIG[slug] = { cls: cls, label: label };
    store.tags.push(slug);
    /* Onda 4 pós-testes (#2 — coerência) — registro no histórico
       da nova tag. Antes só filial estava mencionada no ticket,
       mas por coerência arquitetural cadastro de tag também
       deve aparecer no Histórico de Alterações. */
    if (typeof store !== 'undefined' && store._logAudit) {
      store._logAudit('Nova Tag', '—', label + ' (' + slug + ')');
    }
    ConfigModule.renderTags();
    Modal.fechar('modal-nova-tag');
    Toast.show('Tag "' + label + '" criada!', 'success');
  }
}

/* ============================================================
   BEYOND CRM — PATCH UX-3.1 (appendix do Modules.js)
   Beyond Bits Tecnologia © 2026
   Versão: UX-3.1.b (com paleta de cores nas tags)

   INSTRUÇÃO: cole este bloco INTEIRO no FINAL do arquivo
   js/modules/Modules.js (depois da última chave de fechamento).
   Se você já colou uma versão anterior do appendix UX-3.1,
   substitua aquele bloco por este.

   Conteúdo:
   - Item 3.4: toggle "mostrar senha" no modal de usuário
   - Item 3.8: auto-slug + paleta de cores na criação de tags
                (slug agora é hidden — não aparece pro usuário)
   - Injeção dinâmica de CSS para tags coloridas (funciona em
     Kanban, modal lead e Configurações sem mexer nesses arquivos)
   ============================================================ */


/* ============================================================
   Item 3.4 — Toggle "mostrar senha" no modal usuário
   ============================================================ */
$(document).on('click', '#usr-senha-toggle', function() {
  var $input = $('#usr-senha');
  var $icon  = $('#usr-senha-toggle-icon');
  var isPwd  = $input.attr('type') === 'password';
  $input.attr('type', isPwd ? 'text' : 'password');
  $icon.toggleClass('bi-eye-fill', !isPwd).toggleClass('bi-eye-slash-fill', isPwd);
});


/* ============================================================
   MetasModule — PATCH MET-4.6
   Atingimento de Metas no Dashboard (RF-02 / RN-16)
   - Bloco "Minha Meta": vendas + mensalidade do usuário logado
   - Bloco "Equipe": lista de especialistas no escopo (supervisor/gerente)
   - Período: ciclo de comissão fixo (dia 26 → dia 25)
   ============================================================ */
class MetasModule {

  /* ============================================================
     Ciclo de comissão atual (RN-16: dia 26 → dia 25)
     ============================================================
     Chamado #122 — os ciclos estavam com 2 MESES de largura e com o
     rótulo deslocado (ex.: "Outubro de 2026 (26/08 a 25/10)"). Causa:
     o código antigo montava o fim a partir de `new Date(agora)` e só
     depois chamava setMonth(+1)/setDate(25). Quando `agora` cai num dia
     que não existe no mês seguinte (31/08 → "31/09"), o JS NORMALIZA a
     data pra 01/10 e o setDate(25) posterior aterrissa em 25/10 — um
     mês a mais. O mesmo overflow acontecia no ramo do else
     (ini.setMonth(-1) partindo de um dia 29/30/31), o que explica o
     defeito aparecer e sumir sozinho: ele SÓ se manifesta quando a tela
     é aberta num dia 29, 30 ou 31 — o print do cliente é de 31/08.

     Correção: montar as duas pontas pelo CONSTRUTOR
     `new Date(ano, mes, dia)`, que nunca depende do dia corrente. O mês
     de referência é o do início do ciclo: se hoje >= 26, o ciclo começou
     dia 26 deste mês; senão começou dia 26 do mês passado. O construtor
     também resolve virada de ano sozinho (mês -1 em janeiro → dezembro
     do ano anterior).

     Tabela conferida com o cliente (#122):
       Janeiro   26/12 → 25/01     Julho     26/06 → 25/07
       Fevereiro 26/01 → 25/02     Agosto    26/07 → 25/08
       Março     26/02 → 25/03     Setembro  26/08 → 25/09
       Abril     26/03 → 25/04     Outubro   26/09 → 25/10
       Maio      26/04 → 25/05     Novembro  26/10 → 25/11
       Junho     26/05 → 25/06     Dezembro  26/11 → 25/12
     O ciclo é SEMPRE nomeado pelo mês em que TERMINA. */
  static _cicloAtual() {
    const agora  = new Date();
    /* Mês de referência = mês em que o ciclo COMEÇOU (dia 26). */
    const mesIni = (agora.getDate() >= 26) ? agora.getMonth() : agora.getMonth() - 1;
    const ini = new Date(agora.getFullYear(), mesIni,     26,  0,  0,  0,   0);
    const fim = new Date(agora.getFullYear(), mesIni + 1, 25, 23, 59, 59, 999);
    return { ini, fim };
  }

  /* Chamado #107 (reaberto) — ciclo de comissão deslocado por N meses.
     offset 0 = ciclo atual, -1 = ciclo anterior, etc. ini é sempre dia
     26 e fim sempre dia 25, então setMonth é seguro (26/25 existem em
     todo mês). */
  static _cicloPorOffset(offset) {
    const c = MetasModule._cicloAtual();
    if (!offset) return c;
    /* Chamado #122 — mesma blindagem do _cicloAtual: reconstrói pelo
       construtor em vez de mutar com setMonth. Aqui o risco de overflow
       já era menor (26 e 25 existem em todo mês), mas manter as duas
       funções na MESMA forma evita que um ajuste futuro numa delas
       reintroduza o bug na outra. */
    const ini = new Date(c.ini.getFullYear(), c.ini.getMonth() + offset, 26,  0,  0,  0,   0);
    const fim = new Date(c.fim.getFullYear(), c.fim.getMonth() + offset, 25, 23, 59, 59, 999);
    return { ini, fim };
  }

  /* ============================================================
     Chamado #122/#123 — rótulo canônico de um ciclo
     ============================================================
     "Setembro de 2026 (26/08 a 25/09)". O ciclo é SEMPRE nomeado
     pelo mês em que TERMINA (é o mês em que a comissão é paga).

     Existia como código copiado em dois seletores (Minha Performance
     e Atingimento de Metas) e o relatório de desempenho nem mostrava
     o nome do ciclo — só as datas. Com o rótulo centralizado aqui,
     tela e relatório dizem exatamente a mesma coisa, que é o que o
     cliente precisa pra conferir antes de pagar comissão. */
  static _rotuloCiclo(c) {
    if (!c || !c.ini || !c.fim) return '—';
    const pad = n => String(n).padStart(2, '0');
    let mesAno = c.fim.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    mesAno = mesAno.charAt(0).toUpperCase() + mesAno.slice(1);
    const intervalo = pad(c.ini.getDate()) + '/' + pad(c.ini.getMonth() + 1) +
                      ' a ' + pad(c.fim.getDate()) + '/' + pad(c.fim.getMonth() + 1);
    return mesAno + ' (' + intervalo + ')';
  }

  /* ════════════════════════════════════════════════════════════
     Chamado #119 — navegar entre ciclos no card "Atingimento de
     Metas" do Dashboard. Mesmo padrão do #120 (Minha Performance):
     um seletor de ciclo no topo do card; 0 = atual, -1 = anterior.
     Persistido na sessão. ════════════════════════════════════════ */
  static _cicloOffsetAtingimento = 0;
  static _vendasHistCache = null;
  static _vendasHistFetching = false;

  /* store.vendas é só o cache de boot (500 mais recentes) — cobre o
     ciclo atual/anterior com folga, mas ciclos antigos podem faltar.
     Reusa o cache do UsuarioModule (#120) se já tiver sido buscado. */
  static _vendasParaAtingimento() {
    return MetasModule._vendasHistCache
      || (typeof UsuarioModule !== 'undefined' && UsuarioModule._vendasCompletoCache)
      || store.vendas || [];
  }

  static _garantirVendasHist() {
    if (MetasModule._vendasHistCache || MetasModule._vendasHistFetching) return;
    if (typeof SupabaseSync === 'undefined' || !SupabaseSync.buscarVendasCompleto) return;
    MetasModule._vendasHistFetching = true;
    SupabaseSync.buscarVendasCompleto()
      .then(v => { MetasModule._vendasHistCache = v || null; })
      .catch(() => {})
      .then(() => {
        MetasModule._vendasHistFetching = false;
        if (MetasModule._vendasHistCache && (MetasModule._cicloOffsetAtingimento || 0) < 0) {
          MetasModule.renderAtingimento();
        }
      });
  }

  static async mudarCicloAtingimento(offset) {
    let next = parseInt(offset, 10) || 0;
    if (next > 0) next = 0;
    if (next < -60) next = -60;
    MetasModule._cicloOffsetAtingimento = next;
    if (next <= -1 && !MetasModule._vendasHistCache
        && typeof SupabaseSync !== 'undefined' && SupabaseSync.buscarVendasCompleto) {
      try { MetasModule._vendasHistCache = await SupabaseSync.buscarVendasCompleto(); } catch (e) {}
    }
    MetasModule.renderAtingimento();
  }

  /* Seletor (dropdown) dos ~18 ciclos mais recentes. Rótulo no formato
     que o cliente pediu no #120: "Setembro de 2026 (26/08 a 25/09)". */
  static _seletorCicloAtingimentoHtml() {
    const atual = MetasModule._cicloOffsetAtingimento || 0;
    let opts = '';
    for (let o = 0; o >= -18; o--) {
      const c = MetasModule._cicloPorOffset(o);
      /* Chamado #122 — rótulo vem do helper único (era duplicado aqui). */
      opts += `<option value="${o}" ${o === atual ? 'selected' : ''}>${MetasModule._rotuloCiclo(c)}${o === 0 ? ' — atual' : ''}</option>`;
    }
    return `
      <div class="d-flex align-items-center gap-2" style="flex-wrap:wrap;padding:12px 4px 2px;">
        <label class="small text-muted mb-0" style="white-space:nowrap;font-weight:600;">Ciclo:</label>
        <select class="form-select form-select-sm" style="max-width:340px;" onchange="MetasModule.mudarCicloAtingimento(this.value)">
          ${opts}
        </select>
      </div>`;
  }

  /* ================================================================
     Chamado #34 — Metas vigentes num mês específico.
     ================================================================
     Recebe o profile e uma data de referência (qualquer dia dentro
     do mês alvo). Retorna as metas que estavam em vigor naquele
     mês, buscando em store.metaVersoes a versão mais recente com
     ano_mes <= mes_alvo. Se nenhuma versão for encontrada
     (usuário sem histórico ainda), cai nos campos atuais do
     profile — 100% retro-compatível.

     Retorna: { meta_vendas, meta_mensalidade, meta_super_vendas,
                meta_power_vendas, meta_king_vendas, fonte }
       fonte: 'versao' (veio da tabela) ou 'profile' (fallback).
     ================================================================ */
  static _metasVigentes(profile, dataRef) {
    var fallback = {
      meta_vendas:       Number(profile && profile.meta_vendas)       || 0,
      meta_mensalidade:  Number(profile && profile.meta_mensalidade)  || 0,
      meta_super_vendas: Number(profile && profile.meta_super_vendas) || 0,
      meta_power_vendas: Number(profile && profile.meta_power_vendas) || 0,
      meta_king_vendas:  Number(profile && profile.meta_king_vendas)  || 0,
      /* Chamado #51 — thresholds por valor de mensalidade dos degraus. */
      meta_super_mensalidade: Number(profile && profile.meta_super_mensalidade) || 0,
      meta_power_mensalidade: Number(profile && profile.meta_power_mensalidade) || 0,
      meta_king_mensalidade:  Number(profile && profile.meta_king_mensalidade)  || 0,
      fonte: 'profile',
    };
    if (!profile || !profile.id || !Array.isArray(store.metaVersoes) || !store.metaVersoes.length) {
      return fallback;
    }
    var d = (dataRef instanceof Date) ? dataRef : new Date(dataRef);
    if (isNaN(d.getTime())) return fallback;

    /* Primeiro dia do mês alvo em ISO (YYYY-MM-01) — comparação
       lexicográfica é segura porque ano_mes vem como YYYY-MM-DD. */
    var mesAlvo = d.getFullYear() + '-' +
                  String(d.getMonth() + 1).padStart(2, '0') + '-01';

    /* store.metaVersoes já vem ordenada DESC por ano_mes; pega a
       primeira com ano_mes <= mesAlvo. */
    var achado = null;
    for (var i = 0; i < store.metaVersoes.length; i++) {
      var v = store.metaVersoes[i];
      if (v.profile_id !== profile.id) continue;
      if (v.ano_mes <= mesAlvo) { achado = v; break; }
    }
    if (!achado) return fallback;
    return {
      meta_vendas:       Number(achado.meta_vendas       || 0),
      meta_mensalidade:  Number(achado.meta_mensalidade  || 0),
      meta_super_vendas: Number(achado.meta_super_vendas || 0),
      meta_power_vendas: Number(achado.meta_power_vendas || 0),
      meta_king_vendas:  Number(achado.meta_king_vendas  || 0),
      /* Chamado #51 — thresholds por valor versionados. */
      meta_super_mensalidade: Number(achado.meta_super_mensalidade || 0),
      meta_power_mensalidade: Number(achado.meta_power_mensalidade || 0),
      meta_king_mensalidade:  Number(achado.meta_king_mensalidade  || 0),
      fonte: 'versao',
    };
  }

  /* ================================================================
     Chamado #124 — metas vigentes no CICLO selecionado
     ================================================================
     O #119 e o #120 puseram um seletor de ciclo no "Atingimento de
     Metas" e no "Minha Performance". Os REALIZADOS passaram a
     acompanhar o filtro, mas as METAS continuavam sendo as atuais do
     cadastro — então, ao consultar um ciclo fechado, o sistema
     comparava a venda daquele ciclo com a meta de hoje. Se o gerente
     tivesse mexido na meta no intervalo, o percentual, o degrau
     (Super/Power/King) e até a comissão prevista saíam errados — e
     comissão de ciclo fechado é justamente o que se consulta depois.

     Este helper resolve a meta que ESTAVA em vigor no ciclo. Dois
     detalhes que ele encapsula:

       1. Âncora temporal. `_metasVigentes` resolve por mês calendário,
          e um ciclo 26/07 → 25/08 é o ciclo de AGOSTO. Ancoramos no mês
          do FIM — mesma âncora que o #120 já usava no histórico dos 3
          meses, então as duas telas concordam por construção.

       2. Normalização do id. `store.usuarios` expõe `_id`, enquanto
          `AuthService.currentProfile` expõe `id`, e `_metasVigentes`
          casa por `profile.id`. Sem normalizar, todo membro da equipe
          cairia no fallback silenciosamente — sem erro, só com o
          número errado, que é a pior forma de falhar.

     Sem histórico de metas para o período (o versionamento começou no
     #34), cai nas metas atuais do cadastro — retro-compatível, e a
     tela sinaliza isso ao usuário. */
  static _metasDoCiclo(u, fimCiclo) {
    if (!u) return MetasModule._metasVigentes(null, fimCiclo);
    var alvo = u.id ? u : Object.assign({}, u, { id: u._id || null });
    return MetasModule._metasVigentes(alvo, fimCiclo);
  }

  /* ════════════════════════════════════════════════════════════
     Chamado #130 — só soma a meta de quem existia no ciclo
     ════════════════════════════════════════════════════════════
     O #124 fez as metas seguirem o ciclo selecionado, mas ficou um furo:
     a LISTA de membros continuou sendo a de hoje. Especialista admitido
     depois do ciclo consultado entrava na soma — e, como não tem meta
     versionada para aquele período, entrava justamente pelo fallback da
     meta ATUAL. Foi o que o cliente viu: Agosto somando 87 quando a meta
     real do ciclo era 66. Os 21 a mais eram três admissões posteriores
     (7 + 7 + 7).

     Critério: `profiles.created_at` — a data em que a pessoa entrou na
     equipe. Se ela foi criada DEPOIS do fim do ciclo, não fazia parte
     dele e não entra na soma da meta nem na contagem de membros.

     Por que não usar "não tem meta versionada" como critério: porque
     isso confundiria duas coisas diferentes. Quem é da casa desde antes
     do versionamento de metas (#34) também não tem versão histórica, e
     zerar a meta dessa pessoa seria um erro novo. `created_at` separa
     "não existia" de "existia sem histórico registrado".

     Sem `_created_at` no objeto (cache antigo, sessão não recarregada),
     devolve true — mantém o comportamento anterior em vez de esconder
     gente por falta de dado. */
  static _fazAlteParteDoCiclo(u, fimCiclo) {
    if (!u) return false;
    var criadoEm = u._created_at || u.created_at || null;
    if (!criadoEm || !(fimCiclo instanceof Date)) return true;
    var d = new Date(criadoEm);
    if (isNaN(d.getTime())) return true;
    return d <= fimCiclo;
  }

  /* ================================================================
     Chamado #40 — Selo de progresso de meta (4 faixas)
     ================================================================
     Recebe a porcentagem atingida (0-N) e devolve:
       { texto, corBg, corFg, corBadgeBg }
     Faixas:
       < 50%          → laranja  ⏳ X% da meta
       ≥ 50% e < 80%  → amarelo  🎯 50% da meta atingida
       ≥ 80% e <100%  → azul     🚀 80% da meta atingida
       ≥ 100%         → verde    ✅ Meta atingida
     Uso em cards de ranking e no painel de alertas.
     ================================================================ */
  static _seloMeta(pct) {
    var p = Math.max(0, Math.round(Number(pct) || 0));
    if (p >= 100) return { texto: '✅ Meta atingida',          cor: '#10A64A', marco: 100 };
    if (p >= 80)  return { texto: '🚀 80% da meta atingida',   cor: '#2563EB', marco: 80  };
    if (p >= 50)  return { texto: '🎯 50% da meta atingida',   cor: '#F59E0B', marco: 50  };
    return          { texto: '⏳ ' + p + '% da meta',          cor: '#EA580C', marco: 0   };
  }

  /* Soma vendas + mensalidade de um especialista no intervalo.
     Chamado #105 (retorno do #89) — dataVenda vem do banco como data
     PURA ("2026-08-26", sem hora). new Date("2026-08-26") interpreta
     isso como meia-noite UTC, que em horário de Brasília (UTC-3) já é
     25/08 21h — uma venda registrada bem no dia 26 (início do ciclo)
     caía FORA do intervalo por 3h de diferença de fuso, sumindo da
     soma logo nos primeiros dias de cada ciclo. Fix: força meia-noite
     LOCAL anexando "T00:00:00" (mesmo padrão já usado em
     AniversariantesModule.js:332 pro mesmo tipo de campo). */
  /* ════════════════════════════════════════════════════════════
     Chamado #128 — uma venda por CLIENTE, não por linha
     ════════════════════════════════════════════════════════════
     A contagem somava LINHAS da tabela `vendas`. O funil, do outro
     lado, conta CARDS — ou seja, leads. Enquanto houver exatamente
     uma linha por lead, os dois números batem; com duas linhas para o
     mesmo cliente, o Dashboard passa a mostrar um a mais (foi o
     "17 em vez de 16" da supervisora Vivian).

     A tabela `vendas` NÃO tem restrição UNIQUE em lead_id — o
     comentário do VendaService afirma que tem, mas o schema não cria.
     O tratamento de erro de chave duplicada lá nunca dispara, então
     duas linhas para o mesmo lead entram sem resistência (um duplo
     clique, ou dois registros em sessões diferentes, bastam).

     Duas frentes, porque uma só não resolve:
       • aqui, a contagem passa a ser por lead distinto, e a
         mensalidade considera apenas a venda mais recente de cada
         cliente — antes o valor era somado duas vezes, inflando
         também a mensalidade acumulada e a comissão;
       • no banco, o script sql/040 cria a restrição UNIQUE que
         impede a duplicidade de aparecer de novo.

     Mesma unidade da RPC nm_totais_reais, que já usa
     count(DISTINCT lead_id) — as duas fontes passam a concordar. */
  static _dataDaVenda(v) {
    if (!v) return null;
    const dt = v.dataVenda
      ? new Date(String(v.dataVenda).slice(0, 10) + 'T00:00:00')
      : new Date(v.created_at);
    return isNaN(dt.getTime()) ? null : dt;
  }

  /* Uma venda por lead: mantém a mais recente de cada cliente.
     Vendas sem lead vinculado passam intactas (caso defensivo — o
     schema exige lead_id NOT NULL, mas um registro local criado
     offline pode chegar aqui sem o vínculo resolvido). */
  static _dedupVendasPorLead(vendas) {
    const porLead = Object.create(null);
    const soltas = [];
    (vendas || []).forEach(v => {
      if (!v) return;
      if (!v._lead_uuid) { soltas.push(v); return; }
      const dt = MetasModule._dataDaVenda(v);
      const atual = porLead[v._lead_uuid];
      if (!atual || (dt && atual._dtCmp && dt > atual._dtCmp) || !atual._dtCmp) {
        porLead[v._lead_uuid] = Object.assign({ _dtCmp: dt }, v);
      }
    });
    return Object.keys(porLead).map(k => porLead[k]).concat(soltas);
  }

  static _agregarEsp(espId, ini, fim, vendasArr) {
    const noCiclo = (vendasArr || store.vendas || []).filter(v => {
      if (!v || v._esp_id !== espId) return false;
      const dt = MetasModule._dataDaVenda(v);
      return !!dt && dt >= ini && dt <= fim;
    });
    const unicas = MetasModule._dedupVendasPorLead(noCiclo);
    return {
      vendas: unicas.length,
      mensal: unicas.reduce((soma, v) => soma + Number(v.valorMensalidade || 0), 0),
    };
  }

  /* Determina quais especialistas estão visíveis pro perfil logado */
  static _especialistasVisiveis(p) {
    return (store.usuarios || []).filter(u => {
      if (u.perfil !== 'especialista') return false;
      if (u.status === 'inativo') return false;
      if (p.perfil === 'gerente') return true;
      if (p.perfil === 'supervisor') {
        const acessos = (store._supervisorAccess && store._supervisorAccess.usuarios) || [];
        return u._id === p.id || acessos.indexOf(u._id) >= 0;
      }
      return false;
    });
  }

  /* 3B.9: inclui supervisores e gerentes ATIVOS no bloco "Toda a Equipe"
     (eles também vendem — o cliente pediu na homologação da v1.2.0).
     Regras:
       - Gerente vê todos os membros ativos da equipe (especialista, supervisor, gerente)
       - Supervisor vê seus especialistas + a si mesmo
       - Especialista: chamada não é feita (Bloco 2 é só para supervisor/gerente)
     Membros sem meta_vendas configurada aparecem com indicação "— sem meta". */
  static _membrosEquipeVisiveis(p) {
    return (store.usuarios || []).filter(u => {
      if (u.status === 'inativo') return false;
      if (p.perfil === 'gerente') {
        return ['especialista', 'supervisor', 'gerente'].includes(u.perfil);
      }
      if (p.perfil === 'supervisor') {
        if (u._id === p.id) return true;  /* o próprio supervisor */
        if (u.perfil !== 'especialista') return false;
        const acessos = (store._supervisorAccess && store._supervisorAccess.usuarios) || [];
        return acessos.indexOf(u._id) >= 0;
      }
      return false;
    });
  }

  /* Render principal */
  static renderAtingimento() {
    const $c = $('#atingimento-metas-content');
    if (!$c.length) return;

    const p = AuthService.currentProfile;
    if (!p) { $c.html('<p class="text-muted small text-center py-3">Aguardando sessão…</p>'); return; }

    /* Chamado #119 — ciclo escolhido no seletor (0 = atual). */
    const _offAtm = MetasModule._cicloOffsetAtingimento || 0;
    const { ini, fim } = MetasModule._cicloPorOffset(_offAtm);
    if (_offAtm < 0) MetasModule._garantirVendasHist();  /* deixa o histórico pronto */
    const vendasFonteAtm = _offAtm < 0 ? MetasModule._vendasParaAtingimento() : (store.vendas || []);
    $('#atm-ciclo-label').text('Ciclo ' + ini.toLocaleDateString('pt-BR') + ' → ' + fim.toLocaleDateString('pt-BR') + (_offAtm === 0 ? ' (atual)' : ''));

    const fmtBRL = n => 'R$ ' + (Number(n)||0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    /* ── Agregação da equipe ──────────────────────────────────
       Chamado #98 — movida pra ANTES do Bloco 1: pro gerente, o
       Bloco 1 agora usa esses totais em vez dos pessoais (ver abaixo).
       3B.9: _membrosEquipeVisiveis já inclui supervisores/gerente
       ativos, não só especialistas — pro gerente, a soma abaixo já
       contempla o que ele mesmo vendeu (RN pedida no #98). */
    const ehSupervisorOuGerente = p.perfil === 'supervisor' || p.perfil === 'gerente';
    let totVendas = 0, totMensal = 0, totMetaV = 0, totMetaM = 0, especInfo = [], especialistas = [];
    /* Chamado #124 — quantos membros não têm meta versionada para este
       ciclo (caem na meta atual). Vira aviso na tela quando > 0. */
    let _metasSemHistorico = 0;
    /* Chamado #130 — quantos membros da equipe atual ficaram de fora
       porque foram admitidos depois do ciclo consultado. */
    let _membrosForaDoCiclo = 0;
    /* Ciclo anterior a todos os cadastros: não dá pra recortar a equipe. */
    let _equipeSemRecorte = false;
    if (ehSupervisorOuGerente) {
      /* Chamado #130 — a equipe do ciclo, não a equipe de hoje. Quem foi
         admitido depois do fim do ciclo não entra: nem na soma da meta,
         nem na contagem de membros, nem na lista. */
      const _equipeHoje = MetasModule._membrosEquipeVisiveis(p);
      especialistas = _equipeHoje.filter(u => MetasModule._fazAlteParteDoCiclo(u, fim));
      _membrosForaDoCiclo = _equipeHoje.length - especialistas.length;

      /* Salvaguarda: consultando um ciclo anterior à implantação do
         sistema, TODOS os cadastros são posteriores ao fim do ciclo e o
         filtro esvaziaria a equipe — o card apareceria vazio, com meta
         zero, o que é pior do que o defeito que estamos corrigindo.
         Nesse caso, volta à equipe completa e sinaliza na tela. */
      if (!especialistas.length && _equipeHoje.length) {
        especialistas = _equipeHoje;
        _membrosForaDoCiclo = 0;
        _equipeSemRecorte = true;
        SLog.info('METAS-CICLO (#130): ciclo anterior a todos os cadastros — ' +
                  'usando a equipe completa como fallback');
      }
      especInfo = especialistas.map(u => {
        const ag = MetasModule._agregarEsp(u._id, ini, fim, vendasFonteAtm);
        /* Chamado #124 — meta vigente NO CICLO, não a meta de hoje. */
        const mv = MetasModule._metasDoCiclo(u, fim);
        if (mv.fonte === 'profile') _metasSemHistorico++;
        totVendas += ag.vendas;
        totMensal += ag.mensal;
        totMetaV  += mv.meta_vendas;
        totMetaM  += mv.meta_mensalidade;
        return Object.assign({ u: u, mv: mv }, ag);
      });
    }
    const pctTotV = totMetaV ? Math.min(Math.round(totVendas / totMetaV * 100), 100) : 0;
    const pctTotM = totMetaM ? Math.min(Math.round(totMensal / totMetaM * 100), 100) : 0;
    const corTotV = pctTotV >= 100 ? BX_COR.up : pctTotV >= 60 ? BX_COR.accent3 : BX_COR.accent;
    const corTotM = pctTotM >= 100 ? BX_COR.up : pctTotM >= 60 ? BX_COR.accent3 : BX_COR.accent;

    /* ── BLOCO 1: MINHA META (especialista/supervisor) ou
                  META DA EQUIPE (gerente) ────────────────────
       Chamado #98 — o gerente pediu pra trocar "Minha Meta" por
       "Meta da Equipe" aqui: soma de tudo que a equipe já fez
       (INCLUINDO o próprio gerente) contra a soma de todas as metas,
       nos mesmos dois cartões lado a lado (Vendas + Mensalidade) que
       já existiam. Especialista e supervisor continuam vendo a
       própria meta, como antes. */
    const ehGerente = p.perfil === 'gerente';
    /* Chamado #124 — a própria meta também segue o ciclo selecionado. */
    const minhasMetas = MetasModule._metasDoCiclo(p, fim);
    const minhaMetaV = minhasMetas.meta_vendas;
    const minhaMetaM = minhasMetas.meta_mensalidade;
    if (!ehSupervisorOuGerente && minhasMetas.fonte === 'profile') _metasSemHistorico++;
    const meu = MetasModule._agregarEsp(p.id, ini, fim, vendasFonteAtm);
    const pctMeuV = minhaMetaV ? Math.min(Math.round(meu.vendas / minhaMetaV * 100), 100) : 0;
    const pctMeuM = minhaMetaM ? Math.min(Math.round(meu.mensal / minhaMetaM * 100), 100) : 0;
    const corMeuV = pctMeuV >= 100 ? BX_COR.up : pctMeuV >= 60 ? BX_COR.accent3 : BX_COR.accent;
    const corMeuM = pctMeuM >= 100 ? BX_COR.up : pctMeuM >= 60 ? BX_COR.accent3 : BX_COR.accent;

    const b1Titulo   = ehGerente ? '<i class="bi bi-people-fill me-1"></i> Meta da Equipe' : '<i class="bi bi-person-fill me-1"></i> Minha Meta';
    const b1VReal     = ehGerente ? totVendas  : meu.vendas;
    const b1VMeta     = ehGerente ? totMetaV   : minhaMetaV;
    const b1VPct      = ehGerente ? pctTotV    : pctMeuV;
    const b1VCor      = ehGerente ? corTotV    : corMeuV;
    const b1MReal     = ehGerente ? totMensal  : meu.mensal;
    const b1MMeta     = ehGerente ? totMetaM   : minhaMetaM;
    const b1MPct      = ehGerente ? pctTotM    : pctMeuM;
    const b1MCor      = ehGerente ? corTotM    : corMeuM;

    /* Chamado #124 — deixa explícito de que ciclo são as metas exibidas.
       Sem isso o gerente não tem como saber, olhando a tela, se está vendo
       a meta histórica ou a de hoje — e essa dúvida é exatamente o que
       originou o chamado. Quando alguém não tem meta versionada para o
       período, avisamos que ali vale a meta atual. */
    let avisoMetas = '';
    if (_offAtm < 0) {
      /* Chamado #130 — explica as duas coisas que mudam num ciclo
         fechado: as metas são as da época, e a equipe é a da época.
         O segundo ponto é o que faltava: sem ele, o gerente vê a soma
         cair e não entende por quê. */
      const _partes = ['Metas e degraus são os que estavam vigentes neste ciclo.'];
      if (_equipeSemRecorte) {
        _partes.push('Este ciclo é anterior ao cadastro de toda a equipe, ' +
                     'então a lista mostra a equipe atual — os números de meta ' +
                     'deste período devem ser conferidos manualmente.');
      }
      if (_membrosForaDoCiclo > 0) {
        _partes.push(
          `<strong>${_membrosForaDoCiclo}</strong> pessoa${_membrosForaDoCiclo === 1 ? '' : 's'} ` +
          `da equipe atual não aparece${_membrosForaDoCiclo === 1 ? '' : 'm'} aqui porque ` +
          `entr${_membrosForaDoCiclo === 1 ? 'ou' : 'aram'} depois deste ciclo — ` +
          `a meta d${_membrosForaDoCiclo === 1 ? 'ela' : 'elas'} não é somada.`
        );
      }
      if (_metasSemHistorico > 0) {
        _partes.push(
          `<strong>${_metasSemHistorico}</strong> membro${_metasSemHistorico === 1 ? '' : 's'} ` +
          `sem meta registrada no período — nesse${_metasSemHistorico === 1 ? '' : 's'} ` +
          `caso${_metasSemHistorico === 1 ? '' : 's'}, vale a meta atual do cadastro.`
        );
      }
      avisoMetas = `
        <div style="display:flex;align-items:flex-start;gap:6px;padding:8px 10px;margin:0 4px 4px;
                    border-left:3px solid #0284C7;background:#0284C712;border-radius:0 4px 4px 0;
                    font-size:11px;line-height:1.5;color:var(--text-muted);">
          <i class="bi bi-clock-history" style="color:#0284C7;"></i>
          <span>${_partes.join(' ')}</span>
        </div>`;
    }

    let html = MetasModule._seletorCicloAtingimentoHtml() + avisoMetas + `
      <div style="padding:14px 4px 4px;">
        <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px;">
          ${b1Titulo}
        </div>
        <div class="row g-3">
          <div class="col-md-6">
            <div class="kpi-card flex-column align-items-start gap-1" style="padding:14px;">
              <div class="kpi-lbl fw-semibold">🏆 Vendas no Ciclo</div>
              <div style="font-size:26px;font-weight:800;color:${b1VCor};font-family:'JetBrains Mono';line-height:1;">
                ${b1VReal} <span style="font-size:14px;color:var(--d-txt-9ca3af);font-weight:600;">/ ${b1VMeta || '—'}</span>
              </div>
              <div style="width:100%;background:var(--d-bgc-f3f4f6);border-radius:99px;height:8px;margin-top:4px;">
                <div style="width:${b1VPct}%;background:${b1VCor};height:8px;border-radius:99px;transition:width .5s;"></div>
              </div>
              <div style="font-size:12px;color:${b1VCor};">
                ${b1VMeta ? b1VPct + '% da meta' + (b1VPct >= 100 ? ' ✅' : '') : 'Sem meta configurada'}
              </div>
            </div>
          </div>
          <div class="col-md-6">
            <div class="kpi-card flex-column align-items-start gap-1" style="padding:14px;">
              <div class="kpi-lbl fw-semibold">💰 Mensalidade Acumulada</div>
              <div style="font-size:22px;font-weight:800;color:${b1MCor};font-family:'JetBrains Mono';line-height:1;">
                ${fmtBRL(b1MReal)} <span style="font-size:12px;color:var(--d-txt-9ca3af);font-weight:600;">/ ${fmtBRL(b1MMeta)}</span>
              </div>
              <div style="width:100%;background:var(--d-bgc-f3f4f6);border-radius:99px;height:8px;margin-top:4px;">
                <div style="width:${b1MPct}%;background:${b1MCor};height:8px;border-radius:99px;transition:width .5s;"></div>
              </div>
              <div style="font-size:12px;color:${b1MCor};">
                ${b1MMeta ? b1MPct + '% da meta' + (b1MPct >= 100 ? ' ✅' : '') : 'Sem meta configurada'}
              </div>
            </div>
          </div>
        </div>
      </div>`;

    /* ── BLOCO 2: EQUIPE (supervisor + gerente) ────────────── */
    if (ehSupervisorOuGerente) {

      /* Ordena por % de meta atingida (desc). Membros sem meta ficam por último. */
      especInfo.sort((a, b) => {
        /* Chamado #124 — ordena pelo % contra a meta DAQUELE ciclo. */
        const pa = a.mv.meta_vendas ? a.vendas / a.mv.meta_vendas : -1;
        const pb = b.mv.meta_vendas ? b.vendas / b.mv.meta_vendas : -1;
        return pb - pa;
      });

      const equipeLabel = p.perfil === 'gerente' ? 'Toda a Equipe' : 'Minha Equipe';

      html += `
        <div style="padding:14px 4px 4px;border-top:1px solid var(--border);margin-top:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;">
              <i class="bi bi-people-fill me-1"></i> ${equipeLabel} (${especialistas.length} membro${especialistas.length === 1 ? '' : 's'})
            </div>
            <div style="font-size:12px;color:var(--text-muted);">
              <strong style="color:${corTotV};">${totVendas} / ${totMetaV || '—'}</strong> vendas
              · <strong>${fmtBRL(totMensal)}</strong> / ${fmtBRL(totMetaM)}
              ${totMetaV ? ' · ' + pctTotV + '%' : ''}
            </div>
          </div>
          ${especInfo.length ? especInfo.map(e => {
            /* Chamado #124 — metas do ciclo consultado (e.mv), não as atuais. */
            const metaV = e.mv.meta_vendas || 0;
            const metaM = e.mv.meta_mensalidade || 0;
            const pctV = metaV ? Math.min(Math.round(e.vendas / metaV * 100), 100) : 0;
            const pctM = metaM ? Math.min(Math.round(e.mensal / metaM * 100), 100) : 0;
            const corV = pctV >= 100 ? BX_COR.up : pctV >= 60 ? BX_COR.accent3 : BX_COR.accent;
            /* Chamado #98 — cor da barra de mensalidade (a barra de vendas
               já tinha corV; mensalidade só existia como texto, sem barra
               própria). */
            const corM = pctM >= 100 ? BX_COR.up : pctM >= 60 ? BX_COR.accent3 : BX_COR.accent;
            /* 3B.9: badge com o perfil (Especialista/Supervisor/Gerente) */
            const perfilLabel = e.u.perfil === 'gerente' ? 'Gerente' : e.u.perfil === 'supervisor' ? 'Supervisor' : 'Especialista';
            const perfilCor   = e.u.perfil === 'gerente' ? '#7C3AED' : e.u.perfil === 'supervisor' ? '#0284C7' : '#6B7280';
            const perfilBadge = `<span style="display:inline-block;padding:1px 7px;border-radius:8px;font-size:9px;font-weight:700;background:${perfilCor}18;color:${perfilCor};text-transform:uppercase;letter-spacing:.03em;margin-left:6px;">${perfilLabel}</span>`;
            return `<div class="rmeta-row">
              <div class="rmeta-head">
                <span class="rmeta-nome">${Utils.escHtml(e.u.nome)}${e.u.sigla ? ' <span style="color:var(--text-muted);font-weight:500;">· ' + Utils.escHtml(e.u.sigla) + '</span>' : ''}${perfilBadge}</span>
              </div>
              <!-- Chamado #98 — duas barras lado a lado (vendas + mensalidade),
                   em vez de 1 barra (vendas) + mensalidade só em texto. Mesmo
                   padrão de PerformanceEspecialistasModule._barraMeta. -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:4px;">
                <div>
                  <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:3px;">
                    <span>🏆 Vendas</span><span>${e.vendas}/${metaV || '—'}</span>
                  </div>
                  <div class="rmeta-track"><div class="rmeta-fill" style="width:${pctV}%;background:${corV};"></div></div>
                </div>
                <div>
                  <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:3px;">
                    <span>💰 Mensalidade</span><span>${fmtBRL(e.mensal)}</span>
                  </div>
                  <div class="rmeta-track"><div class="rmeta-fill" style="width:${pctM}%;background:${corM};"></div></div>
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;margin-top:4px;">
                ${(() => {
                  if (!metaV) return '<span class="rmeta-badge" style="background:var(--d-bgc-f3f4f6)18;color:var(--d-txt-6b7280);">— sem meta de vendas</span>';
                  const s = MetasModule._seloMeta(pctV);
                  return `<span class="rmeta-badge" style="background:${s.cor}18;color:${s.cor};">${s.texto}</span>`;
                })()}
                ${metaM ? `<span style="font-size:10px;color:${corM};">${pctM}% da mensalidade${pctM >= 100 ? ' ✅' : ''}</span>` : ''}
              </div>
              ${(() => {
                /* Chamado #89 — quanto falta para cada degrau (Super/Power/King)
                   por membro. 'atingido' quando batido por vendas OU mensalidade. */
                var fmtFalta = function(metaQ, metaVv, emoji, rot) {
                  metaQ = Number(metaQ) || 0; metaVv = Number(metaVv) || 0;
                  if (metaQ <= 0 && metaVv <= 0) return '';
                  var bateu = (metaQ > 0 && e.vendas >= metaQ) || (metaVv > 0 && e.mensal >= metaVv);
                  if (bateu) return emoji + ' ' + rot + ': <span style="color:#3DDC84;">atingido ✅</span>';
                  var ps = [];
                  if (metaQ > 0 && e.vendas < metaQ) ps.push((metaQ - e.vendas) + ' venda(s)');
                  if (metaVv > 0 && e.mensal < metaVv) ps.push(fmtBRL(metaVv - e.mensal));
                  return emoji + ' ' + rot + ': faltam ' + ps.join(' ou ');
                };
                /* Chamado #124 — degraus também pelos thresholds do ciclo. */
                var degs = [
                  fmtFalta(e.mv.meta_super_vendas, e.mv.meta_super_mensalidade, '⭐', 'Super'),
                  fmtFalta(e.mv.meta_power_vendas, e.mv.meta_power_mensalidade, '⚡', 'Power'),
                  fmtFalta(e.mv.meta_king_vendas,  e.mv.meta_king_mensalidade,  '👑', 'King')
                ].filter(Boolean).join(' &nbsp;·&nbsp; ');
                return degs ? '<div style="font-size:10px;color:var(--text-muted);margin-top:4px;line-height:1.6;">' + degs + '</div>' : '';
              })()}
            </div>`;
          }).join('') : '<p class="text-muted small text-center py-3">Nenhum membro no escopo.</p>'}
        </div>`;
    }

    $c.html(html);
  }
}


/* ============================================================
   Item 3.8 — Tags com paleta de cores + auto-slug invisível
   ============================================================ */
(function() {

  /* ── Paleta predefinida ─────────────────────────────────── */
  var PALETA_TAGS = [
    { nome: 'Vermelho', bg: 'rgba(255,90,78,.16)', texto: '#FF8A80' },
    { nome: 'Laranja',  bg: 'rgba(255,107,5,.16)', texto: '#FF9A52' },
    { nome: 'Amarelo',  bg: 'rgba(245,165,36,.16)', texto: '#FBC46A' },
    { nome: 'Verde',    bg: 'rgba(61,220,132,.14)', texto: '#86EFAC' },
    { nome: 'Azul',     bg: 'rgba(96,165,250,.16)', texto: '#93C5FD' },
    { nome: 'Roxo',     bg: 'rgba(167,139,250,.16)', texto: '#C4B5FD' },
    { nome: 'Rosa',     bg: 'rgba(244,114,182,.16)', texto: '#F9A8D4' },
    { nome: 'Ciano',    bg: 'rgba(34,211,238,.14)', texto: '#67E8F9' },
    { nome: 'Marrom',   bg: 'rgba(180,120,60,.22)', texto: '#E7B98A' },
    { nome: 'Cinza',    bg: 'rgba(163,163,163,.14)', texto: '#D4D4D4' },
  ];

  /* Flag de auto-slug (mesma lógica de antes — agora o campo é hidden) */
  var slugManualEditado = false;

  /* ── Slugify ────────────────────────────────────────────── */
  function _slugify(texto) {
    if (!texto) return '';
    return String(texto)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}]/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s_]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_');
  }

  /* ── Render da paleta dentro do modal ────────────────────── */
  function _renderPaleta() {
    var $p = $('#tag-cor-palette');
    if (!$p.length) return;
    var html = PALETA_TAGS.map(function(c) {
      return '<button type="button" class="tag-cor-chip" ' +
             'data-bg="' + c.bg + '" data-texto="' + c.texto + '" ' +
             'title="' + c.nome + '" ' +
             'style="background:' + c.bg + ';color:' + c.texto + ';">Aa</button>';
    }).join('');
    $p.html(html);
  }

  /* ── Atualiza a pré-visualização ─────────────────────────── */
  function _atualizarPreview() {
    var label = $('#tag-label').val() || 'Preview';
    var bg    = $('#tag-cor-bg').val();
    var texto = $('#tag-cor-texto').val();
    if (!bg) { $('#tag-preview-container').hide(); return; }
    $('#tag-preview').text(label).css({ 'background': bg, 'color': texto });
    $('#tag-preview-container').show();
  }

  /* ── Injeta uma regra CSS para uma tag colorida ─────────── */
  function _injetarCssTag(slug, bg, texto) {
    if (!slug || !bg || !texto) return;
    var $style = $('#tag-cores-dinamicas');
    if (!$style.length) {
      $style = $('<style id="tag-cores-dinamicas"></style>').appendTo('head');
    }
    var regra = '.tag-' + slug + ' { background: ' + bg + ' !important; color: ' + texto + ' !important; }\n';
    $style.append(document.createTextNode(regra));
  }

  /* ── Carga inicial: lê tags do banco e injeta o CSS ──────── */
  function _carregarCssTagsExistentes() {
    if (typeof supa === 'undefined' || !supa) return;
    supa.from('tags').select('slug, cor_bg, cor_texto').then(function(res) {
      if (res.error) {
        SLog.warn('UX-3.1b carga tags coloridas: ' + res.error.message);
        return;
      }
      var contador = 0;
      (res.data || []).forEach(function(t) {
        if (t.cor_bg && t.cor_texto) {
          _injetarCssTag(t.slug, t.cor_bg, t.cor_texto);
          if (typeof TAG_CONFIG !== 'undefined' && TAG_CONFIG[t.slug]) {
            TAG_CONFIG[t.slug].cor_bg    = t.cor_bg;
            TAG_CONFIG[t.slug].cor_texto = t.cor_texto;
          }
          contador++;
        }
      });
      if (contador > 0) SLog.info('UX-3.1b: ' + contador + ' tag(s) colorida(s) carregada(s)');
    });
  }


  /* ── Eventos: digitar label → atualiza slug + preview ───── */
  $(document).on('input', '#tag-label', function() {
    if (!slugManualEditado) {
      $('#tag-slug').val(_slugify($(this).val()));
    }
    _atualizarPreview();
  });

  /* ── Click numa cor da paleta ────────────────────────────── */
  $(document).on('click', '.tag-cor-chip', function() {
    $('.tag-cor-chip').removeClass('selecionada');
    $(this).addClass('selecionada');
    $('#tag-cor-bg').val($(this).data('bg'));
    $('#tag-cor-texto').val($(this).data('texto'));
    _atualizarPreview();
  });

  /* ── Reset ao abrir o modal Nova Tag ─────────────────────── */
  $(document).on('click', '[onclick*="abrirNovaTag"]', function() {
    slugManualEditado = false;
    $('#tag-cor-bg').val('');
    $('#tag-cor-texto').val('');
    $('#tag-slug').val('');
    $('#tag-preview-container').hide();
    _renderPaleta();
  });


  /* ============================================================
     Override de ConfigModule.salvarTag — inclui cor + injeta CSS
     ============================================================ */
  if (typeof ConfigModule !== 'undefined') {
    ConfigModule.salvarTag = async function() {
      var label    = $('#tag-label').val().trim();
      var slug     = $('#tag-slug').val().trim().toLowerCase().replace(/\s+/g, '_');
      var corBg    = $('#tag-cor-bg').val();
      var corTexto = $('#tag-cor-texto').val();

      if (!label) {
        Toast.show('Preencha o texto da tag.', 'warning');
        return;
      }
      if (!slug) {
        Toast.show('Não foi possível gerar identificador. Use letras no nome.', 'warning');
        return;
      }
      if (!/^[a-z0-9_]+$/.test(slug)) {
        Toast.show('Identificador inválido. Use apenas letras minúsculas, números e _.', 'warning');
        return;
      }
      if (TAG_CONFIG[slug]) {
        Toast.show('Já existe uma tag parecida (' + slug + '). Mude o nome.', 'warning');
        return;
      }
      if (!corBg || !corTexto) {
        Toast.show('Selecione uma cor para a tag.', 'warning');
        return;
      }

      SLog.load('Criando tag colorida: ' + label + ' (' + slug + ', ' + corBg + ')');
      var cls = 'tag-' + slug;

      if (typeof supa !== 'undefined' && supa) {
        var res = await supa.from('tags').insert({
          slug:      slug,
          label:     label,
          cls:       cls,
          cor_bg:    corBg,
          cor_texto: corTexto,
        }).select().single();

        if (res.error) {
          SLog.error('DB INSERT tags: ' + res.error.message);
          Toast.show('Erro ao salvar: ' + res.error.message, 'danger');
          return;
        }
        SLog.info('DB INSERT tags: salvo no banco ✓');
      }

      TAG_CONFIG[slug] = { cls: cls, label: label, cor_bg: corBg, cor_texto: corTexto };
      store.tags.push(slug);

      /* Injeta CSS imediatamente — vale pro Config, Kanban e modal-lead */
      _injetarCssTag(slug, corBg, corTexto);

      ConfigModule.renderTags();
      Modal.fechar('modal-nova-tag');
      Toast.show('Tag "' + label + '" criada!', 'success');
    };
  }


  /* ============================================================
     Inicialização: carrega cores das tags já existentes
     ============================================================
     Roda 2s após o DOM ready pra dar tempo do Supabase autenticar
     e do SupabaseSync popular o TAG_CONFIG. */
  $(document).ready(function() {
    setTimeout(_carregarCssTagsExistentes, 2000);
  });

})();
