/* ============================================================
   BEYOND CRM — js/mock/MockData.js
   Gerador de base FICTÍCIA para o modo demonstração (?mock=1).
   Beyond Bits Tecnologia © 2026

   Produz um "banco" coerente (mesmas tabelas/colunas do Supabase)
   com leads passando por todas as etapas do funil, ligações,
   agendamentos, visitas, vendas, carteira, currículos, metas,
   notificações e auditoria. As datas são relativas a HOJE, então
   o ciclo de comissão atual (26→25) sempre tem movimento.

   PRNG com semente fixa: a mesma data gera sempre a mesma base.
   Nenhum dado aqui é real — nomes e telefones são inventados.
   ============================================================ */
'use strict';

var MockData = (function() {
  if (!window.AMP_MOCK) return null;

  var DIA  = 864e5;
  var HORA = 36e5;

  /* ── PRNG determinístico (mulberry32) ── */
  var _s = 20260926;
  function r() {
    _s |= 0; _s = _s + 0x6D2B79F5 | 0;
    var t = Math.imul(_s ^ _s >>> 15, 1 | _s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  function int(a, b)   { return a + Math.floor(r() * (b - a + 1)); }
  function pick(arr)   { return arr[Math.floor(r() * arr.length)]; }
  function chance(p)   { return r() < p; }
  function pad(n, w)   { return String(n).padStart(w, '0'); }
  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var v = Math.floor(r() * 16);
      return (c === 'x' ? v : (v & 0x3 | 0x8)).toString(16);
    });
  }
  function pesado(pesos) {
    var total = 0, k;
    for (k in pesos) total += pesos[k];
    var x = r() * total;
    for (k in pesos) { x -= pesos[k]; if (x <= 0) return k; }
    return k;
  }
  function iso(ms) { return new Date(ms).toISOString(); }
  function dataISO(ms) {
    var d = new Date(ms);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2);
  }
  /* Ajusta um timestamp para horário comercial (08h–18h, passos de 5 min) */
  function comercial(ms) {
    var d = new Date(ms);
    d.setHours(int(8, 17), int(0, 11) * 5, 0, 0);
    return d.getTime();
  }

  /* ── Catálogos ── */
  var PRIMEIROS = ['João','Maria','José','Ana','Pedro','Luiza','Gabriel','Mariana','Lucas','Camila','Rafael','Beatriz',
    'Felipe','Larissa','Thiago','Fernanda','Gustavo','Aline','Bruno','Juliana','Diego','Letícia','Vinícius','Carolina',
    'André','Patrícia','Leonardo','Renata','Matheus','Débora','Eduardo','Vanessa','Rodrigo','Tatiane','Marcelo','Priscila',
    'Daniel','Simone','Fábio','Cristiane','Henrique','Natália','Igor','Sabrina','Wesley','Elaine','Alex','Jéssica'];
  var SOBRENOMES = ['Silva','Santos','Oliveira','Souza','Rodrigues','Ferreira','Alves','Pereira','Lima','Gomes','Costa',
    'Ribeiro','Martins','Carvalho','Almeida','Lopes','Soares','Fernandes','Vieira','Barbosa','Rocha','Dias','Nascimento',
    'Andrade','Moreira','Nunes','Marques','Machado','Mendes','Freitas','Cardoso','Teixeira','Moura','Batista','Campos'];
  var FONTES = ['Carteira Própria','Inativo','Associado Novo Veículo','Cliente Potencial','Consultor que Saiu',
    'Recomendação Associado','Recomendação Não Associado','Troca de Titularidade','Projeto 150 X','Projeto 150 Y',
    'Internos','Site','Terceiros','Redes Sociais','Externos','Reciclagem','Minha Carteira'];
  var FONTE_PESOS = { 'Recomendação Associado': 14, 'Redes Sociais': 12, 'Site': 10, 'Carteira Própria': 9,
    'Cliente Potencial': 8, 'Minha Carteira': 8, 'Recomendação Não Associado': 7, 'Externos': 5, 'Inativo': 5,
    'Associado Novo Veículo': 4, 'Projeto 150 X': 3, 'Projeto 150 Y': 3, 'Internos': 3, 'Terceiros': 3,
    'Reciclagem': 2, 'Troca de Titularidade': 2, 'Consultor que Saiu': 2 };
  var CATEGORIAS = ['Nacional Particular','Nacional Particular','Nacional Particular','Importado/Diesel',
    'Nacional Trabalho','Motocicleta','Motocicleta','Caminhão'];
  var VEICULOS = ['Onix 1.0','HB20 1.6','Gol 1.0','Strada Freedom','Corolla XEi','Compass Longitude','CG 160 Fan',
    'Kwid Zen','Saveiro Robust','T-Cross','Hilux SRV','Mobi Like','Biz 125','Fiorino','Creta Limited','Polo Track'];
  var MENSALIDADES = [139.9, 159.9, 169.9, 189.9, 199.9, 219.9, 249.9, 289.9];
  var ADESOES      = [0, 99.9, 150, 199.9, 250];
  var RASTREADORES = [0, 0, 49.9, 89.9];
  var MOTIVOS_CUIDAR = ['Aniversários','Férias','Festas','Feriado','Índice de Acidentes','Campanhas Promocionais','Relembrar Benefícios'];
  var RES_SEM_CONTATO = ['Não Atendeu','Não Atendeu','Não Atendeu','Pediu para Retornar','Número Errado'];

  function nomePessoa() { return pick(PRIMEIROS) + ' ' + pick(SOBRENOMES) + (chance(0.4) ? ' ' + pick(SOBRENOMES) : ''); }
  function telefone()   { return '(31) 9' + int(8100, 9999) + '-' + pad(int(0, 9999), 4); }
  function placa() {
    var L = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
    return L[int(0,24)] + L[int(0,24)] + L[int(0,24)] + int(0,9) + L[int(0,24)] + int(0,9) + int(0,9);
  }
  function brl(v) { return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function soDigitos(t) { return String(t || '').replace(/\D/g, ''); }

  /* ================================================================
     GERAR
     ================================================================ */
  function gerar() {
    _s = 20260926;
    var agora = Date.now();
    var db = {};

    /* ── Filiais (mesmas do seed oficial) ── */
    db.filiais = [
      { id: 'f0000001-0000-0000-0000-000000000001', nome: 'Matriz',               local: 'Belo Horizonte (MG)' },
      { id: 'f0000001-0000-0000-0000-000000000002', nome: 'Savassi',              local: 'Belo Horizonte (MG)' },
      { id: 'f0000001-0000-0000-0000-000000000003', nome: 'Contagem',             local: 'Contagem (MG)' },
      { id: 'f0000001-0000-0000-0000-000000000004', nome: 'Betim',                local: 'Betim (MG)' },
      { id: 'f0000001-0000-0000-0000-000000000005', nome: 'Nova Lima',            local: 'Nova Lima (MG)' },
    ].map(function(f) {
      f.endereco = ''; f.created_at = iso(agora - 400 * DIA); f.updated_at = f.created_at; return f;
    });
    var F = db.filiais.map(function(f) { return f.id; });

    /* ── Usuários ── */
    function perfilRow(id, nome, sigla, perfil, filialIdx, metaV, metaM, diasCasa, status) {
      var email = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(' ')[0] + '@demo.beyondcrm.com.br';
      return {
        id: id, nome: nome, sigla: sigla, email: email, perfil: perfil,
        filial_id: F[filialIdx], status: status || 'ativo',
        meta_vendas: metaV, meta_mensalidade: metaM,
        meta_super_vendas: metaV ? metaV + 4 : 0,  meta_super_mensalidade: metaM ? Math.round(metaM * 1.3) : 0,
        meta_power_vendas: metaV ? metaV + 8 : 0,  meta_power_mensalidade: metaM ? Math.round(metaM * 1.6) : 0,
        meta_king_vendas:  metaV ? metaV + 12 : 0, meta_king_mensalidade:  metaM ? Math.round(metaM * 2.0) : 0,
        created_at: iso(agora - diasCasa * DIA), updated_at: iso(agora - 5 * DIA),
      };
    }
    function pid(n) { return 'a0000000-0000-4000-8000-' + pad(n, 12); }
    db.profiles = [
      perfilRow(pid(1),  'Ricardo Almeida',   'RA', 'gerente',      0, 0, 0, 400),
      perfilRow(pid(2),  'Fernanda Costa',    'FC', 'supervisor',   0, 0, 0, 380),
      perfilRow(pid(3),  'Paulo Henrique',    'PH', 'supervisor',   2, 0, 0, 300),
      perfilRow(pid(4),  'Carlos Mendes',     'CM', 'especialista', 0, 14, 2450, 360),
      perfilRow(pid(5),  'Ana Beatriz',       'AB', 'especialista', 2, 14, 2450, 340),
      perfilRow(pid(6),  'Rodrigo Lopes',     'RL', 'especialista', 3, 12, 2000, 320),
      perfilRow(pid(7),  'Juliana Ferreira',  'JF', 'especialista', 1, 12, 2100, 250),
      perfilRow(pid(8),  'Marcos Vinícius',   'MV', 'especialista', 4, 10, 1800, 200),
      perfilRow(pid(9),  'Patrícia Oliveira', 'PO', 'especialista', 0, 12, 2100, 140),
      perfilRow(pid(10), 'Bruno Cardoso',     'BC', 'especialista', 2, 10, 1800, 45),
      perfilRow(pid(11), 'Lucas Martins',     'LM', 'especialista', 1, 10, 1800, 300, 'inativo'),
    ];
    var P = {};
    db.profiles.forEach(function(p) { P[p.id] = p; });
    var especialistas = db.profiles.filter(function(p) { return p.perfil === 'especialista'; });
    var espAtivos     = especialistas.filter(function(p) { return p.status === 'ativo'; });
    /* Peso de produtividade por especialista (deixa o ranking interessante) */
    var produtividade = { };
    produtividade[pid(4)] = 9; produtividade[pid(5)] = 8; produtividade[pid(6)] = 6; produtividade[pid(7)] = 6;
    produtividade[pid(8)] = 4; produtividade[pid(9)] = 5; produtividade[pid(10)] = 3; produtividade[pid(11)] = 2;

    db.supervisor_especialista_vinculo = [];
    [[2, [4, 7, 9, 11]], [3, [5, 6, 8, 10]]].forEach(function(v) {
      v[1].forEach(function(e) {
        db.supervisor_especialista_vinculo.push({ id: uuid(), supervisor_id: pid(v[0]), especialista_id: pid(e), created_at: iso(agora - 200 * DIA) });
      });
    });

    /* ── Tags ── */
    db.tags = [
      ['quente',  '🔥 Quente',  'tag-quente',  'rgba(255,107,5,.16)',  '#FF9A52'],
      ['atencao', '⚠️ Atenção', 'tag-atencao', 'rgba(245,165,36,.16)', '#FBC46A'],
      ['novo',    '🆕 Novo',    'tag-novo',    'rgba(96,165,250,.16)', '#93C5FD'],
      ['delay',   '⏳ Delay',   'tag-delay',   'rgba(167,139,250,.16)', '#C4B5FD'],
      ['vip',     '⭐ VIP',     'tag-vip',     'rgba(250,204,21,.14)', '#FDE68A'],
      ['ativo',   '✅ Ativo',   'tag-ativo',   'rgba(61,220,132,.14)', '#86EFAC'],
    ].map(function(t) {
      return { id: uuid(), slug: t[0], label: t[1], cls: t[2], cor_bg: t[3], cor_texto: t[4], created_at: iso(agora - 400 * DIA) };
    });
    var TAG = {};
    db.tags.forEach(function(t) { TAG[t.slug] = t.id; });

    db.leads = []; db.lead_tags = []; db.ligacoes = []; db.agendamentos = []; db.agendamento_checklist = [];
    db.visitas = []; db.vendas = []; db.venda_checklist = []; db.carteira_interacoes = []; db.atividades = [];
    db.carteira_parabenizacao = []; db.lead_visibilidade = []; db.lead_transferencias = []; db.lead_transfers = [];
    db.supervisor_lead_access = [];

    function atividade(tipo, lead, espId, quando, det) {
      var vis = {
        lead:        ['🌱', '#DBEAFE', '#2563EB'],
        ligacao:     ['📞', '#D1FAE5', '#059669'],
        agendamento: ['📅', '#EDE9FE', '#7C3AED'],
        visita:      ['🏠', '#FEF3C7', '#D97706'],
        venda:       ['💰', '#D1FAE5', '#1B6B3A'],
        carteira:    ['👛', '#F3F4F6', '#4A5568'],
      }[tipo];
      db.atividades.push({
        id: uuid(), tipo: tipo, icon: vis[0], bg: vis[1], color: vis[2],
        lead_nome: lead.nome, lead_id: lead.id, detalhes: det,
        especialista_id: espId, data_hora: iso(quando), created_at: iso(quando),
      });
    }

    function ligacao(lead, espId, quando, resultado, num) {
      var contato = (resultado === 'Não Agendou' || resultado === '✅ Agendamento');
      db.ligacoes.push({
        id: uuid(), lead_id: lead.id, especialista_id: espId, resultado: resultado,
        tipo_contato: contato ? 'contato' : 'sem_contato', tentativa_num: num,
        obs: resultado === 'Pediu para Retornar' ? 'Cliente pediu retorno no fim da tarde.' : '',
        data_hora: iso(quando), created_at: iso(quando),
      });
      /* Ligações NÃO entram em `atividades`: o Histórico já as busca da
         tabela ligacoes (RPC listar_ligacoes_completo) — duplicaria. */
    }

    /* ── Leads ── */
    var ETAPA_PESOS = { lead: 22, ligacao: 26, agendamento: 9, visita: 8, venda: 6, carteira: 29 };
    var ETAPAS = ['lead','ligacao','agendamento','visita','venda','carteira'];
    var DIAS_MIN = { lead: 0, ligacao: 0, agendamento: 0, visita: 4, venda: 4, carteira: 6 };
    var TOTAL_LEADS = 260;
    var espPesos = {};
    especialistas.forEach(function(e) { espPesos[e.id] = produtividade[e.id] || 3; });

    for (var i = 0; i < TOTAL_LEADS; i++) {
      var etapa  = pesado(ETAPA_PESOS);
      var eIdx   = ETAPAS.indexOf(etapa);
      var espId  = pesado(espPesos);
      var esp    = P[espId];
      /* Lucas (inativo) só tem leads antigos */
      var diasAtras = Math.floor(Math.pow(r(), 1.9) * 150);
      if (esp.status === 'inativo') diasAtras = Math.max(diasAtras, 60);
      /* Especialista novo não tem lead anterior à admissão */
      var diasCasa = Math.floor((agora - new Date(esp.created_at).getTime()) / DIA);
      diasAtras = Math.min(diasAtras, Math.max(diasCasa - 1, 0));
      diasAtras = Math.max(diasAtras, DIAS_MIN[etapa]);
      if (diasAtras > diasCasa) { etapa = 'ligacao'; eIdx = 1; diasAtras = Math.max(diasCasa - 1, 0); }

      var criado = comercial(agora - diasAtras * DIA);
      if (criado > agora - HORA) criado = agora - int(1, 6) * HORA;

      var fonte = pesado(FONTE_PESOS);
      var nome  = nomePessoa();
      var tel   = telefone();
      var lead  = {
        id: uuid(), codigo: 'BCR-2026-' + pad(i + 1, 5), nome: nome, tel: tel, tel_normalizado: soDigitos(tel),
        fonte: fonte, captador_id: espId, responsavel_id: espId, filial_id: esp.filial_id,
        etapa: etapa, tentativas: 0, obs: chance(0.25) ? pick(['Prefere contato por WhatsApp.', 'Já teve proteção em outra associação.', 'Ligar após as 17h.', 'Indicação de cliente antigo.']) : '',
        placa: '', fipe: '', mensalidade_est: '', quem_indicou: '', categoria_veiculo: '',
        data_chegada: iso(criado), data_venda: null, aniversario: null,
        arquivado: false, arquivado_em: null, arquivado_por: null, carteira_em: null,
        ordem_manual: null, lead_pai_id: null, deleted_at: null,
        created_at: iso(criado), updated_at: iso(criado),
      };
      db.leads.push(lead);
      atividade('lead', lead, espId, criado, 'Novo lead cadastrado • Fonte: ' + fonte);

      /* Tags */
      var tagsLead = [];
      if (diasAtras <= 3 && chance(0.6)) tagsLead.push('novo');
      if (chance(0.18)) tagsLead.push('quente');
      if (chance(0.08)) tagsLead.push('atencao');
      if (etapa === 'carteira' && chance(0.15)) tagsLead.push('vip');
      tagsLead.forEach(function(slug) {
        db.lead_tags.push({ id: uuid(), lead_id: lead.id, tag_id: TAG[slug], created_at: iso(criado) });
      });

      if (eIdx < 1) continue;

      /* Ligações */
      var t = criado;
      var num = 0;
      var falhas = (eIdx === 1) ? int(1, 4) : int(0, 2);
      for (var k = 0; k < falhas; k++) {
        t += int(2, 12) * HORA;
        if (t > agora - 10 * 60e3) t = agora - int(10, 90) * 60e3;
        num++;
        var res = (eIdx === 1 && k === falhas - 1 && chance(0.3)) ? 'Não Agendou' : pick(RES_SEM_CONTATO);
        ligacao(lead, espId, t, res, num);
      }
      lead.tentativas = num;
      if (eIdx === 1) {
        if (num >= 4 && chance(0.35)) {
          lead.arquivado = true; lead.arquivado_em = iso(t + HORA); lead.arquivado_por = espId;
        }
        lead.updated_at = iso(t);
        continue;
      }

      /* Agendamento */
      t += int(2, 12) * HORA;
      if (t > agora - 30 * 60e3) t = agora - int(30, 120) * 60e3;
      num++;
      ligacao(lead, espId, t, '✅ Agendamento', num);
      lead.tentativas = num;
      lead.categoria_veiculo = pick(CATEGORIAS);
      lead.placa = placa();
      var fipeV = int(18, 160) * 1000;
      lead.fipe = brl(fipeV);
      lead.mensalidade_est = brl(pick(MENSALIDADES));
      if (tagsLead.indexOf('quente') < 0 && chance(0.35)) {
        db.lead_tags.push({ id: uuid(), lead_id: lead.id, tag_id: TAG.quente, created_at: iso(t) });
      }

      var agQuando;
      if (eIdx === 2) {
        /* Agendamento FUTURO (aparece na Agenda e no badge do card) */
        var d = agora + int(0, 9) * DIA;
        agQuando = comercial(d);
        if (agQuando < agora + HORA) agQuando = comercial(agora + DIA);
      } else {
        agQuando = comercial(t + int(1, 2) * DIA);
        if (agQuando > agora - 3 * HORA) agQuando = agora - int(3, 8) * HORA;
      }
      var localTipo = pick(['interno', 'interno', 'externo', 'online']);
      /* Visita ainda sem resultado: o agendamento segue em aberto e aparece na Agenda */
      var tipoV = eIdx === 3 ? pesado({ nenhum: 4, c2: 3, delay: 2, nao_fechou: 2 }) : null;
      var ag = {
        id: uuid(), lead_id: lead.id, especialista_id: espId, filial_id: esp.filial_id,
        data_hora: iso(agQuando), local_tipo: localTipo,
        local_descricao: localTipo === 'interno' ? 'Filial ' + db.filiais[F.indexOf(esp.filial_id)].nome
                       : (localTipo === 'externo' ? 'Residência do cliente' : 'Videochamada (WhatsApp)'),
        categoria_veiculo: lead.categoria_veiculo,
        status: eIdx === 2 ? pick(['pendente', 'pendente', 'confirmado']) : (tipoV === 'nenhum' ? 'confirmado' : 'realizado'),
        obs: chance(0.3) ? 'Cliente vai levar o documento do veículo.' : '',
        data_realizacao: dataISO(t), created_at: iso(t), updated_at: iso(t),
      };
      db.agendamentos.push(ag);
      atividade('agendamento', lead, espId, t, 'Agendamento para ' + new Date(agQuando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' • ' + localTipo);
      ['Confirmar presença com o cliente', 'Separar documentação do veículo', 'Preparar simulação de cotação'].forEach(function(label, ix) {
        var feito = eIdx > 2 || chance(0.4);
        db.agendamento_checklist.push({
          id: uuid(), agendamento_id: ag.id, item_label: label, ordem: ix + 1, feito: feito,
          feito_por: feito ? espId : null, feito_em: feito ? iso(t + HORA) : null, created_at: iso(t),
        });
      });
      lead.updated_at = iso(t);
      if (eIdx === 2) continue;

      /* Visita */
      var vQuando = agQuando + HORA;
      if (eIdx === 3) {
        if (tipoV !== 'nenhum') {
          db.visitas.push({
            id: uuid(), lead_id: lead.id, especialista_id: espId, filial_id: esp.filial_id, agendamento_id: ag.id,
            tipo_resultado: tipoV,
            tentativa_data_hora: (tipoV === 'delay' || tipoV === 'nao_fechou') ? iso(Math.min(vQuando + 2 * DIA, agora - HORA)) : null,
            tentativa_resultado: tipoV === 'delay' ? pick(['nao_atendeu', 'pediu_retorno']) : (tipoV === 'nao_fechou' ? 'nao_reagendou' : null),
            local_tipo: localTipo, tipo_c2: tipoV === 'c2' ? pick(['Cônjuge', 'Sócio', 'Pais']) : null,
            objecao: tipoV === 'nao_fechou' ? pick(['Preço', 'Já possui seguro', 'Vai pensar']) : null,
            obs: tipoV === 'c2' ? 'Vai decidir com a família.' : '',
            created_at: iso(Math.min(vQuando, agora - HORA)),
          });
          if (tipoV === 'delay') db.lead_tags.push({ id: uuid(), lead_id: lead.id, tag_id: TAG.delay, created_at: iso(vQuando) });
          var rot = { c2: 'C2 (decisão com terceiro)', delay: 'Delay', nao_fechou: 'Não fechou' }[tipoV];
          atividade('visita', lead, espId, Math.min(vQuando, agora - HORA), 'Visita • ' + rot);
        }
        continue;
      }

      /* Venda */
      var mens = pick(MENSALIDADES);
      var vendaQuando = Math.min(vQuando + HORA, agora - HORA);
      db.visitas.push({
        id: uuid(), lead_id: lead.id, especialista_id: espId, filial_id: esp.filial_id, agendamento_id: ag.id,
        tipo_resultado: 'venda', tentativa_data_hora: null, tentativa_resultado: null, local_tipo: localTipo,
        tipo_c2: null, objecao: null, obs: '', created_at: iso(Math.min(vQuando, agora - HORA)),
      });
      atividade('visita', lead, espId, Math.min(vQuando, agora - HORA), 'Visita • Venda');
      var aniv = (1960 + int(0, 42)) + '-' + pad(int(1, 12), 2) + '-' + pad(int(1, 28), 2);
      if (chance(0.18)) {
        var hoje = new Date(agora);
        aniv = (1960 + int(0, 42)) + '-' + pad(hoje.getMonth() + 1, 2) + '-' + pad(int(1, 28), 2);
      }
      var venda = {
        id: uuid(), lead_id: lead.id, especialista_id: espId, filial_id: esp.filial_id,
        valor_adesao: pick(ADESOES), valor_mensalidade: mens, valor_rastreador: pick(RASTREADORES),
        fonte_lead: fonte, data_venda: iso(vendaQuando), aniversario: aniv,
        checklist_cadastro: eIdx === 5, checklist_adesao: eIdx === 5 || chance(0.5),
        obs: '', created_at: iso(vendaQuando), updated_at: iso(vendaQuando),
      };
      db.vendas.push(venda);
      lead.data_venda = venda.data_venda;
      lead.aniversario = aniv;
      lead.mensalidade_est = brl(mens);
      atividade('venda', lead, espId, vendaQuando, 'Venda • ' + brl(mens) + '/mês');
      ['Cadastro no sistema', 'Contrato assinado', 'Vistoria do veículo', 'Pagamento da adesão', 'Rastreador instalado'].forEach(function(label, ix) {
        var feito = eIdx === 5 || chance(0.45);
        db.venda_checklist.push({
          id: uuid(), venda_id: venda.id, item_label: label, ordem: ix + 1, feito: feito,
          feito_por: feito ? espId : null, feito_em: feito ? iso(vendaQuando + (ix + 1) * HORA) : null, created_at: iso(vendaQuando),
        });
      });
      lead.updated_at = venda.data_venda;
      if (eIdx === 4) continue;

      /* Carteira */
      var cart = Math.min(vendaQuando + int(1, 4) * DIA, agora - 2 * HORA);
      lead.carteira_em = iso(cart);
      lead.updated_at = lead.carteira_em;
      atividade('carteira', lead, espId, cart, 'Lead entrou na carteira');
      var nInt = int(0, 3);
      var ti = cart;
      for (var j = 0; j < nInt; j++) {
        ti = ti + int(2, 15) * DIA;
        if (ti > agora - HORA) break;
        var rec = chance(0.55);
        db.carteira_interacoes.push({
          id: uuid(), lead_id: lead.id, especialista_id: espId, filial_id: esp.filial_id,
          tipo: rec ? 'recomendacao' : 'cuidar_base',
          motivo: rec ? 'Pedido de Recomendação' : pick(MOTIVOS_CUIDAR),
          resultado: rec ? pick(['✅ Passou Recomendações', '✅ Passou Recomendações', 'Não Passou Recomendações', 'Não Atendeu'])
                         : pick(['✅ Atendeu', '✅ Atendeu', 'Não Atendeu', 'Pediu para Retornar']),
          data_hora: iso(comercial(ti)), obs: '', created_at: iso(comercial(ti)),
        });
        atividade('carteira', lead, espId, comercial(ti), rec ? 'Carteira • Pedido de recomendação' : 'Carteira • Cuidar da base');
      }
    }

    /* "Quem indicou" para leads vindos de recomendação */
    var associados = db.leads.filter(function(l) { return l.etapa === 'carteira'; });
    db.leads.forEach(function(l) {
      if (l.fonte.indexOf('Recomendação') === 0 && associados.length) l.quem_indicou = pick(associados).nome;
    });

    /* Parabenizações já feitas no mês (Aniversariantes) */
    var mesAtual = new Date(agora).getMonth() + 1, anoAtual = new Date(agora).getFullYear();
    associados.forEach(function(l) {
      if (l.aniversario && Number(l.aniversario.slice(5, 7)) === mesAtual && chance(0.4)) {
        db.carteira_parabenizacao.push({
          id: uuid(), lead_id: l.id, ano: anoAtual, mes: mesAtual,
          parabenizado_em: iso(agora - int(1, 2) * DIA), parabenizado_por: l.responsavel_id,
        });
      }
    });

    /* Transferências (leads do especialista inativo repassados) */
    db.leads.filter(function(l) { return l.responsavel_id === pid(11); }).slice(0, 6).forEach(function(l) {
      var para = pick([pid(4), pid(7), pid(9)]);
      l.responsavel_id = para;
      db.lead_transferencias.push({
        id: uuid(), lead_id: l.id, de_user_id: pid(11), para_user_id: para, transferido_por: pid(1),
        motivo: 'Desligamento do especialista', created_at: iso(agora - int(20, 40) * DIA),
      });
    });

    /* Compartilhamento pontual de um lead (lead_visibilidade) */
    db.leads.slice(0, 3).forEach(function(l) {
      db.lead_visibilidade.push({ id: uuid(), lead_id: l.id, user_id: pid(10), concedido_por: pid(1), created_at: iso(agora - 3 * DIA) });
    });

    db.atividades.sort(function(a, b) { return a.data_hora < b.data_hora ? 1 : -1; });

    /* ── Currículos ── */
    var CARGOS = [['Especialista Comercial', 'Comercial'], ['Consultor de Vendas', 'Comercial'], ['Assistente Administrativo', 'Administrativo'],
      ['Analista Financeiro', 'Financeiro'], ['Recepcionista', 'Recepção'], ['Captador de Leads', 'Captação'], ['Auxiliar de Serviços Gerais', 'Serviços Gerais'],
      ['Promotor de Eventos', 'Eventos']];
    var STATUS_CV = ['recebido', 'recebido', 'em_analise', 'em_analise', 'entrevista', 'aprovado', 'reprovado'];
    db.curriculos = [];
    for (var c = 0; c < 18; c++) {
      var cargo = pick(CARGOS);
      var nomeCv = nomePessoa();
      var recebido = agora - int(0, 75) * DIA;
      var st = pick(STATUS_CV);
      db.curriculos.push({
        id: uuid(), nome: nomeCv, cargo: cargo[0], perfil: cargo[1],
        email: nomeCv.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + int(10, 99) + '@email-ficticio.com',
        tel: telefone(), nascimento: (1975 + int(0, 30)) + '-' + pad(int(1, 12), 2) + '-' + pad(int(1, 28), 2),
        endereco: pick(['Centro', 'Savassi', 'Funcionários', 'Pampulha', 'Buritis']) + ', Belo Horizonte - MG',
        sexo: chance(0.5) ? 'M' : 'F', cnh: chance(0.6), experiencia: int(0, 12), status: st,
        nota: (st === 'entrevista' || st === 'aprovado' || st === 'reprovado') ? int(4, 10) : null,
        obs: st === 'aprovado' ? 'Boa comunicação, disponível para início imediato.' : '',
        data_cadastro: dataISO(recebido), data_recebimento: iso(recebido),
        anexo_path: null, anexo_nome_original: '', anexo_tamanho: 0,
        created_at: iso(recebido), updated_at: iso(recebido),
      });
    }

    /* ── Metas versionadas (últimos 5 meses) ── */
    db.meta_versoes = [];
    especialistas.forEach(function(e) {
      for (var m = 4; m >= 0; m--) {
        var dt = new Date(agora); dt.setDate(1); dt.setMonth(dt.getMonth() - m);
        if (dt.getTime() < new Date(e.created_at).getTime() - 31 * DIA) continue;
        var ajuste = m >= 2 ? -2 : 0;
        db.meta_versoes.push({
          id: uuid(), profile_id: e.id, ano_mes: dataISO(dt.getTime()),
          meta_vendas: Math.max(e.meta_vendas + ajuste, 6), meta_mensalidade: e.meta_mensalidade + ajuste * 150,
          meta_super_vendas: e.meta_super_vendas + ajuste, meta_power_vendas: e.meta_power_vendas + ajuste, meta_king_vendas: e.meta_king_vendas + ajuste,
          meta_super_mensalidade: e.meta_super_mensalidade, meta_power_mensalidade: e.meta_power_mensalidade, meta_king_mensalidade: e.meta_king_mensalidade,
          created_by: pid(1), created_at: iso(dt.getTime()),
        });
      }
    });

    db.config_metas_conversao = [{ id: 1, lead_ligacao: 100, ligacao_agendam: 33.3, agendam_visita: 50, visita_venda: 50, venda_carteira: 100, updated_at: iso(agora - 30 * DIA) }];
    db.lead_counter = [{ id: 1, counter: TOTAL_LEADS }];

    /* ── Notificações (para todos os usuários) ── */
    db.notifications = [];
    var proximos = db.agendamentos.filter(function(a) { return a.status !== 'realizado'; });
    db.profiles.forEach(function(p) {
      var meus = db.leads.filter(function(l) { return l.responsavel_id === p.id; });
      var base = meus.length ? meus : db.leads;
      for (var n = 0; n < 7; n++) {
        var l = pick(base);
        var quando = agora - int(0, 96) * HORA - int(0, 59) * 60e3;
        var tipoN = pick(['ag', 'ag', 'venda', 'transf', 'aniv', 'delay']);
        var msg;
        if (tipoN === 'ag' && proximos.length) {
          var a = pick(proximos);
          var la = db.leads.find(function(x) { return x.id === a.lead_id; });
          l = la || l;
          msg = '📅 Agendamento com ' + l.nome + ' em ' + new Date(a.data_hora).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        } else if (tipoN === 'venda') {
          msg = '💰 Nova venda registrada — ' + l.nome;
        } else if (tipoN === 'transf') {
          msg = '🔄 O lead ' + l.nome + ' foi transferido para você';
        } else if (tipoN === 'aniv') {
          msg = '🎂 Aniversário de associado esta semana: ' + l.nome;
        } else {
          msg = '⏳ Lead ' + l.nome + ' está em Delay há mais de 3 dias';
        }
        db.notifications.push({ id: uuid(), destinatario_id: p.id, msg: msg, read: n > 2 && chance(0.7), lead_codigo: l.codigo, created_at: iso(quando) });
      }
    });

    /* ── Auditoria ── */
    db.audit_log = [];
    var CAMPOS = [
      function(l) { return ['Etapa do lead ' + l.codigo, 'Ligação', 'Agendamento']; },
      function(l) { return ['Telefone do lead ' + l.codigo, telefone(), l.tel]; },
      function(l) { return ['Fonte do lead ' + l.codigo, 'Site', l.fonte]; },
      function(l) { return ['Tag adicionada (' + l.codigo + ')', '—', '🔥 Quente']; },
      function(l) { return ['Responsável do lead ' + l.codigo, 'Lucas Martins', 'Carlos Mendes']; },
      function()  { return ['Meta de vendas — Ana Beatriz', '12', '14']; },
      function()  { return ['Status do usuário — Lucas Martins', 'ativo', 'inativo']; },
      function(l) { return ['Lead arquivado ' + l.codigo, 'Ativo', 'Arquivado']; },
    ];
    for (var a2 = 0; a2 < 70; a2++) {
      var autor = pick(db.profiles.filter(function(p) { return p.status === 'ativo'; }));
      var cmp = pick(CAMPOS)(pick(db.leads));
      db.audit_log.push({
        id: uuid(), usuario_id: autor.id, usuario: autor.nome, campo: cmp[0], anterior: cmp[1], novo: cmp[2],
        datahora: iso(agora - int(0, 100) * DIA - int(0, 600) * 60e3),
      });
    }

    return db;
  }

  return {
    gerar: gerar,
    USUARIO_PADRAO: 'a0000000-0000-4000-8000-000000000001',
    soDigitos: soDigitos,
  };
})();
