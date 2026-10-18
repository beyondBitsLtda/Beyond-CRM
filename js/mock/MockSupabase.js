/* ============================================================
   BEYOND CRM — js/mock/MockSupabase.js
   Cliente Supabase FALSO, em memória, para o modo demonstração.
   Beyond Bits Tecnologia © 2026

   Substitui window.supabase.createClient: o SupabaseClient.js
   continua igual, mas recebe este cliente em vez do real. Nenhuma
   requisição sai para o Supabase — tudo roda sobre a base gerada
   pelo MockData e persiste só no sessionStorage desta aba.

   Cobre o que o app usa:
   • from(tabela): select (com embeds tipo `lead:leads!lead_id(...)`),
     insert, update, upsert, delete, eq/neq/gt/gte/lt/lte/in/is/
     like/ilike/or/not/filter/match, order, limit, range, single,
     maybeSingle, count/head.
   • rpc(): as funções SQL do projeto (proximo_lead_id, contadores
     do dashboard, transferências, notificações, checklist...).
   • auth: sessão sempre ativa com o usuário escolhido na barra demo.
   • storage: upload/list/URL em memória (blob URLs).
   • channel(): Realtime simulado — escritas disparam eventos
     postgres_changes para os canais assinados.
   • fetch para /functions/v1/* (Edge Functions) interceptado.
   • RLS aproximada: gerente vê tudo; supervisor vê os leads dele e
     dos especialistas vinculados; especialista vê os próprios.
   ============================================================ */
'use strict';

(function() {
  if (!window.AMP_MOCK) return;

  var DB_KEY   = 'bcrm_demo_db_v2';
  var USER_KEY = 'amp_mock_user';
  var LATENCIA = 12; /* ms — simula ida e volta de rede */

  /* ================================================================
     BASE EM MEMÓRIA
     ================================================================ */
  var db = null;
  try {
    var raw = sessionStorage.getItem(DB_KEY);
    if (raw) db = JSON.parse(raw);
  } catch (e) { db = null; }
  if (!db) db = MockData.gerar();

  var _saveTimer = null;
  function salvar() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function() {
      try { sessionStorage.setItem(DB_KEY, JSON.stringify(db)); }
      catch (e) { console.warn('[Beyond CRM DEMO] não foi possível salvar a base no sessionStorage: ' + e.message); }
    }, 300);
  }
  salvar();

  function tabela(nome) {
    if (!db[nome]) db[nome] = [];
    return db[nome];
  }

  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

  function novoId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var v = Math.random() * 16 | 0;
      return (c === 'x' ? v : (v & 0x3 | 0x8)).toString(16);
    });
  }

  /* ================================================================
     USUÁRIO / SESSÃO
     ================================================================ */
  function usuarioAtualId() {
    var id = null;
    try { id = sessionStorage.getItem(USER_KEY); } catch (e) { /* silent */ }
    if (!id || !tabela('profiles').some(function(p) { return p.id === id; })) id = MockData.USUARIO_PADRAO;
    return id;
  }
  function perfilAtual() {
    var id = usuarioAtualId();
    return tabela('profiles').find(function(p) { return p.id === id; }) || null;
  }
  function authUser() {
    var p = perfilAtual();
    if (!p) return null;
    return {
      id: p.id, email: p.email, aud: 'authenticated', role: 'authenticated',
      app_metadata: { provider: 'email' }, user_metadata: { nome: p.nome },
      created_at: p.created_at,
    };
  }
  function sessao() {
    var u = authUser();
    if (!u) return null;
    return {
      access_token: 'demo-token', refresh_token: 'demo-refresh', token_type: 'bearer',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u,
    };
  }

  /* ================================================================
     COMPARAÇÃO / FILTROS
     ================================================================ */
  function dataMs(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
    var t = Date.parse(v.length === 10 ? v + 'T00:00:00' : v);
    return isNaN(t) ? null : t;
  }
  function comparar(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    if (typeof a === 'number' || typeof b === 'number') {
      var x = Number(a), y = Number(b);
      if (!isNaN(x) && !isNaN(y)) return x < y ? -1 : x > y ? 1 : 0;
    }
    var da = dataMs(a), dbb = dataMs(b);
    if (da != null && dbb != null) return da < dbb ? -1 : da > dbb ? 1 : 0;
    a = String(a); b = String(b);
    return a < b ? -1 : a > b ? 1 : 0;
  }
  function igual(a, b) {
    if (a == null || b == null) return a == null && b == null;
    if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b);
    if (String(a) === String(b)) return true;
    if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
    return false;
  }
  function likeRegex(padrao, ci) {
    var esc = String(padrao).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.').replace(/\*/g, '.*');
    return new RegExp('^' + esc + '$', ci ? 'i' : '');
  }
  function valorLiteral(v) {
    if (v === 'null') return null;
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (typeof v === 'string' && /^".*"$/.test(v)) return v.slice(1, -1);
    return v;
  }

  function predicado(col, op, val) {
    switch (op) {
      case 'eq':    return function(r) { return igual(r[col], val); };
      case 'neq':   return function(r) { return r[col] != null && !igual(r[col], val); };
      case 'gt':    return function(r) { return r[col] != null && comparar(r[col], val) > 0; };
      case 'gte':   return function(r) { return r[col] != null && comparar(r[col], val) >= 0; };
      case 'lt':    return function(r) { return r[col] != null && comparar(r[col], val) < 0; };
      case 'lte':   return function(r) { return r[col] != null && comparar(r[col], val) <= 0; };
      case 'is':    return function(r) { return val === null ? r[col] == null : r[col] === val; };
      case 'like':  { var re1 = likeRegex(val, false); return function(r) { return r[col] != null && re1.test(String(r[col])); }; }
      case 'ilike': { var re2 = likeRegex(val, true);  return function(r) { return r[col] != null && re2.test(String(r[col])); }; }
      case 'in': {
        var lista = Array.isArray(val) ? val
          : String(val).replace(/^\(|\)$/g, '').split(',').map(function(s) { return valorLiteral(s.trim()); });
        return function(r) { return lista.some(function(v) { return igual(r[col], v); }); };
      }
      case 'cs': case 'contains':
        return function(r) {
          var arr = r[col] || [];
          var alvo = Array.isArray(val) ? val : [val];
          return alvo.every(function(v) { return arr.indexOf(v) >= 0; });
        };
      default:
        console.warn('[Beyond CRM DEMO] operador de filtro não simulado: ' + op);
        return function() { return true; };
    }
  }

  /* Divide por vírgula respeitando parênteses: "a.eq.1,b.in.(2,3)" */
  function dividirTopo(str) {
    var partes = [], nivel = 0, atual = '';
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      if (ch === '(') nivel++;
      if (ch === ')') nivel--;
      if (ch === ',' && nivel === 0) { partes.push(atual); atual = ''; continue; }
      atual += ch;
    }
    if (atual.trim()) partes.push(atual);
    return partes;
  }

  function predicadoOr(expr) {
    var preds = dividirTopo(expr).map(function(parte) {
      parte = parte.trim();
      var mAnd = parte.match(/^and\((.*)\)$/);
      if (mAnd) {
        var subs = dividirTopo(mAnd[1]).map(function(s) { return predicadoSimples(s.trim()); });
        return function(r) { return subs.every(function(p) { return p(r); }); };
      }
      return predicadoSimples(parte);
    });
    return function(r) { return preds.some(function(p) { return p(r); }); };
  }
  function predicadoSimples(parte) {
    var m = parte.match(/^([\w]+)\.(not\.)?(\w+)\.(.*)$/);
    if (!m) { console.warn('[Beyond CRM DEMO] filtro or() não entendido: ' + parte); return function() { return false; }; }
    var p = predicado(m[1], m[3], m[3] === 'in' ? m[4] : valorLiteral(m[4]));
    return m[2] ? function(r) { return !p(r); } : p;
  }

  /* ================================================================
     SELECT COM EMBEDS
     ================================================================ */
  function parseSelect(str) {
    str = String(str || '*').replace(/\s+/g, ' ').trim();
    return dividirTopo(str).map(function(item) {
      item = item.trim();
      if (!item) return null;
      var m = item.match(/^(?:(\w+)\s*:\s*)?(\w+)\s*(?:!\s*(\w+))?\s*\(([\s\S]*)\)$/);
      if (m) return { embed: true, alias: m[1] || m[2], tabela: m[2], fk: m[3] || null, sub: parseSelect(m[4]) };
      var c = item.match(/^(?:(\w+)\s*:\s*)?([\w*]+)(?:::\w+)?$/);
      if (!c) return { col: item, alias: item };
      return { col: c[2], alias: c[1] || c[2] };
    }).filter(Boolean);
  }

  function singular(nome) {
    if (/ais$/.test(nome)) return nome.replace(/ais$/, 'al');   /* filiais → filial */
    if (/s$/.test(nome))   return nome.slice(0, -1);
    return nome;
  }

  function projetar(nomeTabela, row, nos) {
    var out = {};
    nos.forEach(function(n) {
      if (n.embed) { out[n.alias] = embutir(nomeTabela, row, n); return; }
      if (n.col === '*') { Object.keys(row).forEach(function(k) { out[k] = clone(row[k]); }); return; }
      out[n.alias] = row[n.col] === undefined ? null : clone(row[n.col]);
    });
    return out;
  }

  function embutir(nomeTabela, row, n) {
    var alvo = tabela(n.tabela);
    var fk = (n.fk === 'inner' || n.fk === 'left') ? null : n.fk;
    var col = fk || (singular(n.tabela) + '_id');
    if (col in row) {
      var achado = alvo.find(function(x) { return igual(x.id, row[col]); });
      return achado ? projetar(n.tabela, achado, n.sub) : null;
    }
    var volta = fk || (singular(nomeTabela) + '_id');
    return alvo.filter(function(x) { return igual(x[volta], row.id); })
               .map(function(x) { return projetar(n.tabela, x, n.sub); });
  }

  /* ================================================================
     RLS APROXIMADA
     ================================================================ */
  var TABELAS_POR_LEAD = {
    leads: 'id', ligacoes: 'lead_id', agendamentos: 'lead_id', visitas: 'lead_id',
    vendas: 'lead_id', carteira_interacoes: 'lead_id',
  };

  function idsLeadsVisiveis(me) {
    var donos = {};
    donos[me.id] = true;
    if (me.perfil === 'supervisor') {
      tabela('supervisor_especialista_vinculo').forEach(function(v) {
        if (v.supervisor_id === me.id) donos[v.especialista_id] = true;
      });
      tabela('supervisor_lead_access').forEach(function(a) {
        if (a.supervisor_id === me.id && !a.lead_id && a.usuario_id) donos[a.usuario_id] = true;
      });
    }
    var ids = {};
    tabela('leads').forEach(function(l) {
      if (donos[l.responsavel_id] || donos[l.captador_id]) ids[l.id] = true;
    });
    tabela('lead_visibilidade').forEach(function(v) { if (v.user_id === me.id) ids[v.lead_id] = true; });
    tabela('supervisor_lead_access').forEach(function(a) {
      if (a.supervisor_id === me.id && a.lead_id) ids[a.lead_id] = true;
    });
    return ids;
  }

  function aplicarRls(nomeTabela, rows) {
    var me = perfilAtual();
    if (!me) return rows;
    if (nomeTabela === 'notifications') return rows.filter(function(r) { return r.destinatario_id === me.id; });
    if (me.perfil === 'gerente') return rows;
    var col = TABELAS_POR_LEAD[nomeTabela];
    if (!col) return rows;
    var ids = idsLeadsVisiveis(me);
    return rows.filter(function(r) { return ids[r[col]]; });
  }

  /* ================================================================
     DEFAULTS E "TRIGGERS" DO BANCO
     ================================================================ */
  var DEFAULTS = {
    leads: { etapa: 'lead', tentativas: 0, obs: '', placa: '', fipe: '', mensalidade_est: '', quem_indicou: '',
             categoria_veiculo: '', arquivado: false, arquivado_em: null, arquivado_por: null, deleted_at: null,
             ordem_manual: null, lead_pai_id: null, carteira_em: null, data_venda: null, aniversario: null },
    agendamentos: { status: 'pendente', obs: '', local_descricao: '', categoria_veiculo: '' },
    ligacoes: { obs: '', tentativa_num: 1 },
    notifications: { read: false, lead_codigo: null },
    curriculos: { status: 'recebido', obs: '', anexo_path: null },
    profiles: { status: 'ativo' },
    visitas: { obs: '' },
    vendas: { obs: '', valor_adesao: 0, valor_mensalidade: 0, valor_rastreador: 0 },
  };
  var COLUNAS_AGORA = {
    ligacoes: ['data_hora'], atividades: ['data_hora'], carteira_interacoes: ['data_hora'],
    vendas: ['data_venda'], leads: ['data_chegada'], audit_log: ['datahora'],
    curriculos: ['data_recebimento'], carteira_parabenizacao: ['parabenizado_em'],
  };
  var SEM_TIMESTAMPS = { lead_counter: true, config_metas_conversao: true, audit_log: true };

  function prepararInsert(nomeTabela, dados) {
    var agora = new Date().toISOString();
    var row = Object.assign({}, DEFAULTS[nomeTabela] || {}, clone(dados));
    if (row.id == null) row.id = novoId();
    if (!SEM_TIMESTAMPS[nomeTabela]) {
      if (row.created_at == null) row.created_at = agora;
      if (row.updated_at == null && (nomeTabela in DEFAULTS)) row.updated_at = agora;
    }
    (COLUNAS_AGORA[nomeTabela] || []).forEach(function(c) { if (row[c] == null) row[c] = agora; });
    if (nomeTabela === 'agendamentos' && row.data_realizacao == null) row.data_realizacao = agora.slice(0, 10);
    triggerLead(nomeTabela, row, null);
    return row;
  }

  function triggerLead(nomeTabela, row, antes) {
    if (nomeTabela !== 'leads') return;
    if (row.tel != null) row.tel_normalizado = MockData.soDigitos(row.tel);
    if (row.etapa === 'carteira' && !row.carteira_em && (!antes || antes.etapa !== 'carteira')) {
      row.carteira_em = new Date().toISOString();
    }
  }

  function triggersAposInsert(nomeTabela, row) {
    if (nomeTabela === 'vendas') {
      ['Cadastro no sistema', 'Contrato assinado', 'Vistoria do veículo', 'Pagamento da adesão', 'Rastreador instalado']
        .forEach(function(label, ix) {
          tabela('venda_checklist').push({
            id: novoId(), venda_id: row.id, item_label: label, ordem: ix + 1,
            feito: false, feito_por: null, feito_em: null, created_at: row.created_at,
          });
        });
    }
  }

  /* ================================================================
     REALTIME SIMULADO
     ================================================================ */
  var canais = [];
  function emitir(nomeTabela, evento, novo, velho) {
    canais.forEach(function(c) {
      c._ouvintes.forEach(function(o) {
        if (o.filtro && o.filtro.table && o.filtro.table !== nomeTabela) return;
        if (o.filtro && o.filtro.event && o.filtro.event !== '*' && o.filtro.event !== evento) return;
        setTimeout(function() {
          try {
            o.cb({ schema: 'public', table: nomeTabela, eventType: evento, commit_timestamp: new Date().toISOString(),
                   new: clone(novo) || {}, old: clone(velho) || {}, errors: null });
          } catch (e) { console.error('[Beyond CRM DEMO] erro em listener realtime: ', e); }
        }, 60);
      });
    });
  }

  function criarCanal(nome) {
    var canal = {
      topic: 'realtime:' + nome, _ouvintes: [],
      on: function(tipo, filtro, cb) {
        if (typeof filtro === 'function') { cb = filtro; filtro = null; }
        if (tipo === 'postgres_changes') canal._ouvintes.push({ filtro: filtro, cb: cb });
        return canal;
      },
      subscribe: function(cb) {
        canais.push(canal);
        if (cb) setTimeout(function() { cb('SUBSCRIBED'); }, 20);
        return canal;
      },
      unsubscribe: function() {
        canais = canais.filter(function(c) { return c !== canal; });
        return Promise.resolve('ok');
      },
      send: function() { return Promise.resolve('ok'); },
    };
    return canal;
  }

  /* ================================================================
     QUERY BUILDER
     ================================================================ */
  function erro(msg, code) { return { message: msg, code: code || 'DEMO', details: null, hint: null }; }

  function Query(nomeTabela) {
    this.t = nomeTabela;
    this.op = 'select';
    this.colunas = '*';
    this.retorno = null;       /* colunas do .select() após escrita */
    this.preds = [];
    this.ordens = [];
    this.lim = null;
    this.faixa = null;
    this.modoUnico = null;     /* 'single' | 'maybe' */
    this.contagem = null;
    this.soCabecalho = false;
    this.payload = null;
    this.onConflict = null;
  }
  var Q = Query.prototype;

  Q.select = function(cols, opts) {
    if (this.op === 'select') this.colunas = cols || '*';
    else this.retorno = cols || '*';
    if (opts) { this.contagem = opts.count || null; this.soCabecalho = !!opts.head; }
    return this;
  };
  Q.insert = function(rows) { this.op = 'insert'; this.payload = rows; return this; };
  Q.upsert = function(rows, opts) { this.op = 'upsert'; this.payload = rows; this.onConflict = opts && opts.onConflict; return this; };
  Q.update = function(vals) { this.op = 'update'; this.payload = vals; return this; };
  Q['delete'] = function() { this.op = 'delete'; return this; };

  ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains'].forEach(function(op) {
    Q[op] = function(col, val) { this.preds.push(predicado(col, op, val)); return this; };
  });
  Q.filter = function(col, op, val) { this.preds.push(predicado(col, op, op === 'in' ? val : valorLiteral(val))); return this; };
  Q.not = function(col, op, val) {
    var p = predicado(col, op, op === 'in' ? val : valorLiteral(val));
    this.preds.push(function(r) { return !p(r); });
    return this;
  };
  Q.or = function(expr) { this.preds.push(predicadoOr(expr)); return this; };
  Q.match = function(obj) {
    var self = this;
    Object.keys(obj || {}).forEach(function(k) { self.preds.push(predicado(k, 'eq', obj[k])); });
    return this;
  };
  Q.order = function(col, opts) {
    this.ordens.push({ col: col, asc: !opts || opts.ascending !== false, nullsFirst: opts && opts.nullsFirst });
    return this;
  };
  Q.limit = function(n) { this.lim = n; return this; };
  Q.range = function(de, ate) { this.faixa = [de, ate]; return this; };
  Q.single = function() { this.modoUnico = 'single'; return this; };
  Q.maybeSingle = function() { this.modoUnico = 'maybe'; return this; };
  Q.abortSignal = function() { return this; };
  Q.returns = function() { return this; };
  Q.throwOnError = function() { return this; };

  Q._filtrar = function(rows) {
    var preds = this.preds;
    return rows.filter(function(r) { return preds.every(function(p) { return p(r); }); });
  };
  Q._ordenar = function(rows) {
    var ordens = this.ordens;
    if (!ordens.length) return rows;
    return rows.slice().sort(function(a, b) {
      for (var i = 0; i < ordens.length; i++) {
        var o = ordens[i], va = a[o.col], vb = b[o.col];
        if (va == null || vb == null) {
          if (va == null && vb == null) continue;
          /* Postgres: NULLS LAST no ASC, NULLS FIRST no DESC */
          var nullPrimeiro = o.nullsFirst != null ? o.nullsFirst : !o.asc;
          return (va == null ? -1 : 1) * (nullPrimeiro ? 1 : -1);
        }
        var c = comparar(va, vb);
        if (c !== 0) return o.asc ? c : -c;
      }
      return 0;
    });
  };
  Q._finalizar = function(lista, count) {
    if (this.modoUnico === 'single') {
      if (lista.length !== 1) {
        return { data: null, error: erro('JSON object requested, multiple (or no) rows returned', 'PGRST116'), count: count, status: 406 };
      }
      return { data: lista[0], error: null, count: count, status: 200 };
    }
    if (this.modoUnico === 'maybe') {
      if (lista.length > 1) return { data: null, error: erro('JSON object requested, multiple rows returned', 'PGRST116'), count: count, status: 406 };
      return { data: lista[0] || null, error: null, count: count, status: 200 };
    }
    return { data: lista, error: null, count: count, status: 200 };
  };

  Q._executar = function() {
    var t = this.t, self = this;
    var todas = tabela(t);

    if (this.op === 'select') {
      var rows = this._ordenar(this._filtrar(aplicarRls(t, todas)));
      var total = this.contagem ? rows.length : null;
      if (this.faixa) rows = rows.slice(this.faixa[0], this.faixa[1] + 1);
      if (this.lim != null) rows = rows.slice(0, this.lim);
      if (this.soCabecalho) return { data: null, error: null, count: total, status: 200 };
      var nos = parseSelect(this.colunas);
      return this._finalizar(rows.map(function(r) { return projetar(t, r, nos); }), total);
    }

    var afetadas = [];
    if (this.op === 'insert' || this.op === 'upsert') {
      var lista = Array.isArray(this.payload) ? this.payload : [this.payload];
      var chaves = (this.onConflict || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      lista.forEach(function(dados) {
        if (self.op === 'upsert') {
          var ch = chaves.length ? chaves : (dados.id != null ? ['id'] : []);
          var existente = ch.length && todas.find(function(r) { return ch.every(function(k) { return igual(r[k], dados[k]); }); });
          if (existente) {
            var antes = clone(existente);
            Object.assign(existente, clone(dados));
            if ('updated_at' in existente) existente.updated_at = new Date().toISOString();
            triggerLead(t, existente, antes);
            afetadas.push(existente);
            emitir(t, 'UPDATE', existente, antes);
            return;
          }
        }
        var row = prepararInsert(t, dados);
        todas.push(row);
        triggersAposInsert(t, row);
        afetadas.push(row);
        emitir(t, 'INSERT', row, null);
      });
    } else if (this.op === 'update') {
      this._filtrar(todas).forEach(function(r) {
        var antes = clone(r);
        Object.assign(r, clone(self.payload));
        if ('updated_at' in r && !('updated_at' in (self.payload || {}))) r.updated_at = new Date().toISOString();
        triggerLead(t, r, antes);
        afetadas.push(r);
        emitir(t, 'UPDATE', r, antes);
      });
    } else if (this.op === 'delete') {
      var remover = this._filtrar(todas);
      db[t] = todas.filter(function(r) { return remover.indexOf(r) < 0; });
      remover.forEach(function(r) { emitir(t, 'DELETE', null, r); });
      afetadas = remover;
    }
    salvar();

    if (this.retorno == null) return { data: null, error: null, count: this.contagem ? afetadas.length : null, status: 201 };
    var nosRet = parseSelect(this.retorno);
    return this._finalizar(afetadas.map(function(r) { return projetar(t, r, nosRet); }), null);
  };

  Q.then = function(ok, falha) {
    var self = this;
    return new Promise(function(resolve) {
      setTimeout(function() {
        var res;
        try { res = self._executar(); }
        catch (e) {
          console.error('[Beyond CRM DEMO] erro simulando query em ' + self.t + ':', e);
          res = { data: null, error: erro(e.message), count: null, status: 500 };
        }
        resolve(res);
      }, LATENCIA);
    }).then(ok, falha);
  };
  Q['catch']   = function(f) { return this.then(null, f); };
  Q['finally'] = function(f) { return this.then().finally(f); };

  /* ================================================================
     RPCs (funções SQL do projeto)
     ================================================================ */
  function noPeriodo(ms, ini, fim) {
    if (ini && ms < Date.parse(ini)) return false;
    if (fim && ms > Date.parse(fim)) return false;
    return true;
  }
  function quandoLig(lg) { return Date.parse(lg.data_hora || lg.created_at); }
  function leadPorId() {
    var idx = {};
    tabela('leads').forEach(function(l) { idx[l.id] = l; });
    return idx;
  }
  function ligPosCarteira(lg, l) {
    return l.etapa === 'carteira' && l.carteira_em && quandoLig(lg) > Date.parse(l.carteira_em);
  }
  function porUsuario(users, id) { return !users || users.indexOf(id) >= 0; }
  function contarDistintos(lista, campo) {
    var s = {};
    lista.forEach(function(x) { s[x[campo]] = true; });
    return Object.keys(s).length;
  }

  var RPCS = {
    proximo_lead_id: function() {
      var c = tabela('lead_counter')[0] || (tabela('lead_counter').push({ id: 1, counter: 0 }), tabela('lead_counter')[0]);
      c.counter += 1;
      return 'BCR-2026-' + String(c.counter).padStart(5, '0');
    },

    contar_ligacoes_totais: function(p) {
      var leads = leadPorId();
      return tabela('ligacoes').filter(function(lg) {
        var l = leads[lg.lead_id];
        return l && !l.deleted_at && porUsuario(p.p_users, lg.especialista_id)
          && noPeriodo(quandoLig(lg), p.p_ini, p.p_fim) && !ligPosCarteira(lg, l);
      }).length;
    },

    contar_contatos_efetivos: function(p) {
      return RPCS.nm_totais_reais(p).ligacao;
    },

    nm_totais_reais: function(p) {
      var leads = leadPorId();
      var vendasPorLead = {};
      tabela('vendas').forEach(function(v) {
        var t = Date.parse(v.data_venda);
        if (!vendasPorLead[v.lead_id] || t > vendasPorLead[v.lead_id]) vendasPorLead[v.lead_id] = t;
      });
      var leadsVivos = tabela('leads').filter(function(l) { return !l.deleted_at; });
      var ligs = tabela('ligacoes').filter(function(lg) {
        var l = leads[lg.lead_id];
        return l && !l.deleted_at && porUsuario(p.p_users, lg.especialista_id) && noPeriodo(quandoLig(lg), p.p_ini, p.p_fim);
      });
      function quandoVisita(v) { return (v.tipo_resultado === 'venda' && vendasPorLead[v.lead_id]) || Date.parse(v.created_at); }
      var vis = tabela('visitas').filter(function(v) {
        var l = leads[v.lead_id];
        return l && !l.deleted_at && porUsuario(p.p_users, v.especialista_id) && noPeriodo(quandoVisita(v), p.p_ini, p.p_fim);
      });
      return {
        lead: leadsVivos.filter(function(l) {
          return !l.lead_pai_id && porUsuario(p.p_users, l.responsavel_id) && noPeriodo(Date.parse(l.created_at), p.p_ini, p.p_fim);
        }).length,
        ligacao: contarDistintos(ligs.filter(function(lg) {
          return (lg.resultado === 'Não Agendou' || lg.resultado === '✅ Agendamento') && !ligPosCarteira(lg, leads[lg.lead_id]);
        }), 'lead_id'),
        agendamento: contarDistintos(ligs.filter(function(lg) { return lg.resultado === '✅ Agendamento'; }), 'lead_id'),
        visita: contarDistintos(vis.filter(function(v) { return v.tipo_resultado === 'venda' || v.tipo_resultado === 'nao_fechou'; }), 'lead_id'),
        venda: contarDistintos(vis.filter(function(v) { return v.tipo_resultado === 'venda'; }), 'lead_id'),
        recomendacao: leadsVivos.filter(function(l) {
          return (l.fonte === 'Recomendação Associado' || l.fonte === 'Recomendação Não Associado')
            && porUsuario(p.p_users, l.responsavel_id) && noPeriodo(Date.parse(l.created_at), p.p_ini, p.p_fim);
        }).length,
      };
    },

    dashboard_totais_empresa: function(p) {
      var vendas = tabela('vendas').filter(function(v) {
        return noPeriodo(Date.parse(v.data_venda), p.p_ini, p.p_fim) && Number(v.valor_mensalidade) > 0;
      });
      var soma = vendas.reduce(function(a, v) { return a + Number(v.valor_mensalidade); }, 0);
      return {
        carteira_total: tabela('leads').filter(function(l) { return !l.deleted_at && l.etapa === 'carteira'; }).length,
        ligacoes_total: RPCS.contar_ligacoes_totais({ p_ini: p.p_ini, p_fim: p.p_fim }),
        ticket_medio: vendas.length ? Math.round(soma / vendas.length * 100) / 100 : 0,
        meta_vendas_total: tabela('profiles').filter(function(u) { return u.perfil === 'especialista' && u.status !== 'inativo'; })
          .reduce(function(a, u) { return a + (Number(u.meta_vendas) || 0); }, 0),
      };
    },

    listar_ligacoes_completo: function(p) {
      var leads = leadPorId(), perfis = {};
      tabela('profiles').forEach(function(u) { perfis[u.id] = u; });
      var linhas = tabela('ligacoes').filter(function(lg) {
        var l = leads[lg.lead_id], pr = perfis[lg.especialista_id];
        if (!l || l.deleted_at || ligPosCarteira(lg, l)) return false;
        if (!porUsuario(p.p_users, lg.especialista_id)) return false;
        if (!noPeriodo(quandoLig(lg), p.p_ini, p.p_fim)) return false;
        if (p.p_resultados && p.p_resultados.indexOf(lg.resultado) < 0) return false;
        if (p.p_filiais && (!pr || p.p_filiais.indexOf(pr.filial_id) < 0)) return false;
        if (p.p_lead_codigo && String(l.codigo).toLowerCase().indexOf(String(p.p_lead_codigo).toLowerCase()) < 0) return false;
        return true;
      }).sort(function(a, b) { return quandoLig(b) - quandoLig(a); });
      var total = linhas.length;
      var off = p.p_offset || 0, lim = p.p_limit || 40;
      return linhas.slice(off, off + lim).map(function(lg) {
        var l = leads[lg.lead_id], pr = perfis[lg.especialista_id];
        return {
          id: lg.id, lead_id: lg.lead_id, lead_codigo: l.codigo, lead_nome: l.nome, lead_tel: l.tel,
          resultado: lg.resultado, tentativa_num: lg.tentativa_num, especialista_id: lg.especialista_id,
          especialista_nome: pr ? pr.nome : null, data_hora: lg.data_hora || lg.created_at, obs: lg.obs, total_count: total,
        };
      });
    },

    transferir_lead_seguro: function(p) {
      var l = tabela('leads').find(function(x) { return x.id === p.p_lead_id; });
      var para = tabela('profiles').find(function(u) { return u.id === p.p_para_user_id; });
      if (!l)    return { ok: false, erro: 'Lead não encontrado' };
      if (!para) return { ok: false, erro: 'Usuário de destino não encontrado' };
      var de = tabela('profiles').find(function(u) { return u.id === l.responsavel_id; });
      var antes = clone(l);
      l.responsavel_id = para.id;
      l.updated_at = new Date().toISOString();
      tabela('lead_transferencias').push({
        id: novoId(), lead_id: l.id, de_user_id: antes.responsavel_id, para_user_id: para.id,
        transferido_por: usuarioAtualId(), motivo: p.p_motivo || null, created_at: new Date().toISOString(),
      });
      emitir('leads', 'UPDATE', l, antes);
      return { ok: true, de: de ? de.nome : '—', para: para.nome };
    },

    transferir_leads_em_massa: function(p) {
      var n = 0;
      (p.p_lead_ids || []).forEach(function(id) {
        var r = RPCS.transferir_lead_seguro({ p_lead_id: id, p_para_user_id: p.p_para_usuario, p_motivo: p.p_motivo });
        if (r.ok) n++;
      });
      return n;
    },

    sincronizar_visibilidade_supervisor: function(p) {
      db.supervisor_especialista_vinculo = tabela('supervisor_especialista_vinculo')
        .filter(function(v) { return v.supervisor_id !== p.p_supervisor_id; });
      (p.p_especialistas_ids || []).forEach(function(eid) {
        db.supervisor_especialista_vinculo.push({ id: novoId(), supervisor_id: p.p_supervisor_id, especialista_id: eid, created_at: new Date().toISOString() });
      });
      return { ok: true, vinculados: (p.p_especialistas_ids || []).length };
    },

    notificar_todos: function(p) {
      var ativos = tabela('profiles').filter(function(u) { return u.status !== 'inativo'; });
      ativos.forEach(function(u) {
        var row = prepararInsert('notifications', { destinatario_id: u.id, msg: p.p_msg });
        tabela('notifications').push(row);
        emitir('notifications', 'INSERT', row, null);
      });
      return ativos.length;
    },

    notificar_gerentes_da_filial: function(p) {
      var gerentes = tabela('profiles').filter(function(u) { return u.perfil === 'gerente' && u.status !== 'inativo'; });
      gerentes.forEach(function(u) {
        var row = prepararInsert('notifications', { destinatario_id: u.id, msg: p.p_msg });
        tabela('notifications').push(row);
        emitir('notifications', 'INSERT', row, null);
      });
      return gerentes.length;
    },

    criar_checklist_agendamento: function(p) {
      var existe = tabela('agendamento_checklist').some(function(c) { return c.agendamento_id === p.p_agendamento_id; });
      if (!existe) {
        ['Confirmar presença com o cliente', 'Separar documentação do veículo', 'Preparar simulação de cotação']
          .forEach(function(label, ix) {
            tabela('agendamento_checklist').push({
              id: novoId(), agendamento_id: p.p_agendamento_id, item_label: label, ordem: ix + 1,
              feito: false, feito_por: null, feito_em: null, created_at: new Date().toISOString(),
            });
          });
      }
      return true;
    },
  };

  function rpc(nome, params) {
    var q = new Query('__rpc__');
    q._executar = function() {
      var fn = RPCS[nome];
      if (!fn) {
        console.warn('[Beyond CRM DEMO] RPC não simulada: ' + nome);
        return { data: null, error: erro('Função ' + nome + ' não disponível no modo demonstração', 'PGRST202'), status: 404 };
      }
      var data = fn(params || {});
      salvar();
      if (q.modoUnico) return q._finalizar(Array.isArray(data) ? data : [data], null);
      return { data: data, error: null, status: 200 };
    };
    return q;
  }

  /* ================================================================
     STORAGE EM MEMÓRIA
     ================================================================ */
  var arquivos = {}; /* bucket → { caminho: { url, nome, tamanho } } */
  function bucket(nome) {
    if (!arquivos[nome]) arquivos[nome] = {};
    var b = arquivos[nome];
    var ok = function(data) { return Promise.resolve({ data: data, error: null }); };
    return {
      upload: function(caminho, arquivo) {
        if (b[caminho] && b[caminho].url) { try { URL.revokeObjectURL(b[caminho].url); } catch (e) { /* silent */ } }
        b[caminho] = { url: URL.createObjectURL(arquivo), nome: caminho.split('/').pop(), tamanho: arquivo.size || 0 };
        return ok({ path: caminho, id: novoId(), fullPath: nome + '/' + caminho });
      },
      list: function(prefixo, opts) {
        var busca = opts && opts.search;
        var lista = Object.keys(b).filter(function(k) {
          return (!prefixo || k.indexOf(prefixo) === 0) && (!busca || k.indexOf(busca) >= 0);
        }).map(function(k) {
          return { name: k.split('/').pop(), id: k, metadata: { size: b[k].tamanho }, created_at: new Date().toISOString() };
        });
        return ok(lista);
      },
      getPublicUrl: function(caminho) {
        return { data: { publicUrl: b[caminho] ? b[caminho].url : '' } };
      },
      createSignedUrl: function(caminho) {
        if (!b[caminho]) return Promise.resolve({ data: null, error: erro('Arquivo não encontrado (anexos de exemplo não existem no modo demonstração)') });
        return ok({ signedUrl: b[caminho].url });
      },
      download: function(caminho) {
        if (!b[caminho]) return Promise.resolve({ data: null, error: erro('Arquivo não encontrado') });
        return fetchOriginal(b[caminho].url).then(function(r) { return r.blob(); }).then(function(blob) { return { data: blob, error: null }; });
      },
      remove: function(caminhos) {
        (caminhos || []).forEach(function(c) {
          if (b[c]) { try { URL.revokeObjectURL(b[c].url); } catch (e) { /* silent */ } delete b[c]; }
        });
        return ok([]);
      },
    };
  }

  /* ================================================================
     AUTH
     ================================================================ */
  var ouvintesAuth = [];
  var auth = {
    getSession: function() { return Promise.resolve({ data: { session: sessao() }, error: null }); },
    getUser:    function() { return Promise.resolve({ data: { user: authUser() }, error: null }); },
    signInWithPassword: function(cred) {
      var email = String((cred && cred.email) || '').trim().toLowerCase();
      var p = tabela('profiles').find(function(u) { return String(u.email).toLowerCase() === email; });
      if (!p) return Promise.resolve({ data: { user: null, session: null }, error: erro('Invalid login credentials', 'invalid_credentials') });
      try { sessionStorage.setItem(USER_KEY, p.id); } catch (e) { /* silent */ }
      return Promise.resolve({ data: { user: authUser(), session: sessao() }, error: null });
    },
    /* Sem autenticação no modo demo: sair apenas recarrega e volta logado. */
    signOut: function() { return Promise.resolve({ error: null }); },
    updateUser: function() { return Promise.resolve({ data: { user: authUser() }, error: null }); },
    resetPasswordForEmail: function() { return Promise.resolve({ data: {}, error: null }); },
    refreshSession: function() { return Promise.resolve({ data: { session: sessao(), user: authUser() }, error: null }); },
    onAuthStateChange: function(cb) {
      ouvintesAuth.push(cb);
      return { data: { subscription: { id: novoId(), unsubscribe: function() {
        ouvintesAuth = ouvintesAuth.filter(function(f) { return f !== cb; });
      } } } };
    },
  };

  /* ================================================================
     CLIENTE
     ================================================================ */
  var cliente = {
    __demo: true,
    from: function(nome) { return new Query(nome); },
    rpc: rpc,
    auth: auth,
    storage: { from: bucket },
    channel: criarCanal,
    removeChannel: function(c) { if (c && c.unsubscribe) c.unsubscribe(); return Promise.resolve('ok'); },
    removeAllChannels: function() { canais = []; return Promise.resolve([]); },
    getChannels: function() { return canais.slice(); },
    realtime: { setAuth: function() {} },
  };

  /* O SupabaseClient.js chama window.supabase.createClient(...) — devolvemos
     o cliente falso, mesmo que o CDN real não tenha carregado (offline). */
  window.supabase = Object.assign({}, window.supabase || {}, {
    createClient: function() { return cliente; },
  });

  /* ================================================================
     EDGE FUNCTIONS (fetch para /functions/v1/*)
     ================================================================ */
  var fetchOriginal = window.fetch ? window.fetch.bind(window) : null;
  function respostaJson(obj, status) {
    return Promise.resolve(new Response(JSON.stringify(obj), {
      status: status || 200, headers: { 'Content-Type': 'application/json' },
    }));
  }
  window.fetch = function(input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var m = url.match(/\/functions\/v1\/([\w-]+)/);
    if (!m) return fetchOriginal(input, init);

    var corpo = {};
    try { corpo = JSON.parse((init && init.body) || '{}'); } catch (e) { /* silent */ }
    var agora = new Date().toISOString();

    if (m[1] === 'super-function') {
      var email = String(corpo.email || '').toLowerCase();
      if (tabela('profiles').some(function(u) { return String(u.email).toLowerCase() === email; })) {
        return respostaJson({ error: 'Já existe um usuário com este e-mail.' }, 400);
      }
      var novo = {
        id: novoId(), nome: corpo.nome, sigla: corpo.sigla, email: corpo.email, perfil: corpo.perfil,
        filial_id: corpo.filial_id || null, status: 'ativo',
        meta_vendas: Number(corpo.meta_vendas) || 0, meta_mensalidade: Number(corpo.meta_mensalidade) || 0,
        meta_super_vendas: 0, meta_power_vendas: 0, meta_king_vendas: 0,
        meta_super_mensalidade: 0, meta_power_mensalidade: 0, meta_king_mensalidade: 0,
        created_at: agora, updated_at: agora,
      };
      tabela('profiles').push(novo);
      salvar();
      return respostaJson({ userId: novo.id });
    }
    if (m[1] === 'admin-update-email') {
      var alvo = tabela('profiles').find(function(u) { return u.id === corpo.userId; });
      if (!alvo) return respostaJson({ error: 'Usuário não encontrado' }, 404);
      alvo.email = corpo.newEmail;
      salvar();
      return respostaJson({ ok: true });
    }
    if (m[1] === 'delete-user') {
      db.profiles = tabela('profiles').filter(function(u) { return u.id !== corpo.user_id; });
      salvar();
      return respostaJson({ ok: true });
    }
    return respostaJson({ error: 'Edge Function "' + m[1] + '" não simulada no modo demonstração' }, 404);
  };

  /* ================================================================
     API PARA A BARRA DEMO (MockMode.js)
     ================================================================ */
  window.AmpMock = {
    usuarios: function() { return clone(tabela('profiles')); },
    filiais: function() { return clone(tabela('filiais')); },
    usuarioAtualId: usuarioAtualId,
    entrarComo: function(id) {
      try { sessionStorage.setItem(USER_KEY, id); } catch (e) { /* silent */ }
      window.location.reload();
    },
    resetar: function() {
      try { sessionStorage.removeItem(DB_KEY); } catch (e) { /* silent */ }
      clearTimeout(_saveTimer);
      _saveTimer = null;
      salvar = function() {}; /* evita regravar a base antiga antes do reload */
      window.location.reload();
    },
    db: function() { return db; },
  };

  console.info('[Beyond CRM DEMO] Modo demonstração ativo — cliente Supabase simulado, nenhum dado real é lido ou gravado.');
})();
