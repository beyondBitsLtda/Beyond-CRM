/* ============================================================
   BEYOND CRM — js/modules/WikiModule.js   v1.3
   Wiki nativa do sistema — Central de Conhecimento.
   Beyond Bits Tecnologia © 2026

   Histórico:
   - v1.3 (Wiki — correção do player de vídeo):
     O placeholder do vídeo estava sendo pintado ACIMA do <video>
     (diferente da imagem, o vídeo não tinha regra pra esconder o
     placeholder), então o player ficava sempre tampado — mesmo com
     o arquivo já em /assets/. Correções:
       • O <video> agora fica na frente do placeholder (z-index),
         com object-fit:contain (vídeo inteiro, sem esticar/cortar).
       • preload "metadata" (mostra o 1º quadro em vez de preto) e
         suporte opcional a `poster` (capa) via bloco.poster.
     Regra injetada junto com o CSS do lightbox (v1.2), sem tocar
     no styles_base.css.
   - v1.2 (Wiki — modo de visualização de imagem / lightbox):
     Clicar em qualquer imagem da wiki agora abre ela ampliada em
     tela cheia (fundo escurecido), com fecho por clique no fundo,
     botão × ou tecla Esc. Autocontido: o CSS e o overlay são
     injetados uma única vez no body pelo próprio módulo (não
     depende de edição no styles_base.css). Imagens ainda não
     enviadas não abrem o lightbox (checagem prévia de carga).
   - v1.1 (Revisão pós-chamados — sincronia com o código):
     Atualiza a documentação para refletir o comportamento REAL
     do sistema após os ajustes dos chamados:
       • Agendamento: documenta o auto-avanço (Agendamento → Visita
         quando a data/hora chega) e como remarcar/corrigir a data
         (o sistema passa a considerar o agendamento salvo mais
         recente — vale pra frente OU pra trás).
       • Visita: ordenação cronológica pela data do agendamento,
         com os ATRASADOS no topo; o card se reposiciona sozinho
         ao remarcar (C2, Delay ou correção).
       • Relatórios: inclui os cards "Conversão por Etapa" e
         "Saúde do Funil" e os ícones (i) com textos de ajuda.
       • Metas/Degraus: cada degrau (Meta, Super, Power, King) pode
         ser atingido por QUANTIDADE de vendas OU por VALOR de
         mensalidade; o bônus é o do maior degrau atingido e não
         acumula. Campos do cadastro atualizados.
       • RN-23 reescrita pra refletir a ordem cronológica.

   Objetivo:
     Documentação viva do Beyond CRM acessível dentro do
     próprio sistema. Cobre todas as funcionalidades, regras
     de negócio, dicas e explicações passo a passo. Aberta a
     todos os perfis (especialista, supervisor e gerente).

   ARQUITETURA:
   - Conteúdo declarativo: array WIKI_CONTENT com seções e
     subseções. Adicionar tópicos = mexer só nesse array.
   - Sumário à esquerda navegável, conteúdo à direita.
   - Busca por texto que casa em títulos e corpo.
   - Placeholders visuais pra imagens e vídeos: se o arquivo
     existir em /assets/, aparece; se não, aparece placeholder
     cinza com o nome do arquivo esperado.

   USO:
     WikiModule.inicializar();  // chamado uma vez no boot
     WikiModule.render();       // chamado ao entrar na página
     WikiModule.abrirSecao(id); // navegação programática

   API PÚBLICA:
     WikiModule.inicializar()
     WikiModule.render()
     WikiModule.abrirSecao(secaoId, subsecaoId?)
     WikiModule.buscar(termo)
     WikiModule.limparBusca()
   ============================================================ */
'use strict';


/* ============================================================
   CONTEÚDO DA WIKI — estrutura declarativa
   ============================================================
   Cada seção tem:
     - id:       identificador único (usado na URL e navegação)
     - titulo:   nome que aparece no sumário e cabeçalho
     - icone:    classe do Bootstrap Icons
     - subsecoes: array de tópicos dentro da seção
   Cada subseção tem:
     - id, titulo
     - corpo: array de blocos (paragrafo, lista, imagem, video,
              destaque, passos, tabela, rn)
   ============================================================ */
const WIKI_CONTENT = [

  /* ─────────────────────────────────────────────────────────
     1. INTRODUÇÃO
     ───────────────────────────────────────────────────────── */
  {
    id: 'introducao',
    titulo: 'Introdução',
    icone: 'bi-book-fill',
    subsecoes: [
      {
        id: 'boas-vindas',
        titulo: 'Bem-vindo ao Beyond CRM',
        corpo: [
          { tipo: 'paragrafo', texto: 'O <strong>Beyond CRM</strong> é o sistema de gestão comercial da sua equipe de vendas. Ele centraliza toda a jornada do cliente: desde a captação do lead até a manutenção da carteira ativa, passando por ligações, agendamentos, visitas e vendas.' },
          { tipo: 'imagem', arquivo: 'wiki-introducao-visao-geral.png', legenda: 'Visão geral do sistema em uso' },
          { tipo: 'paragrafo', texto: 'Nesta wiki você encontra <strong>como usar</strong> cada função do sistema e <strong>as regras de negócio</strong> que estão por trás das automações. Se ficar em dúvida sobre alguma coisa, provavelmente a resposta tá aqui.' },
          { tipo: 'destaque', tipo_destaque: 'dica', texto: 'Use a busca no topo da wiki (🔍) pra achar rapidamente qualquer tópico. A busca procura em títulos e corpo de texto.' },
        ]
      },
      {
        id: 'fluxo-geral',
        titulo: 'Como funciona o fluxo geral',
        corpo: [
          { tipo: 'paragrafo', texto: 'Todo cliente passa por 6 etapas no processo de vendas. Cada etapa fica em uma coluna do Kanban do "Processo de Vendas".' },
          { tipo: 'imagem', arquivo: 'wiki-fluxo-6-etapas.png', legenda: 'As 6 etapas do funil' },
          { tipo: 'passos', passos: [
            { titulo: 'Lead',        texto: 'O contato acabou de chegar. Você tem os dados básicos (nome, telefone, fonte) e ainda não falou com ele.' },
            { titulo: 'Ligação',     texto: 'Você já começou a tentar contato. Cada tentativa é registrada; se depois de 30 tentativas o cliente ainda não atendeu, o lead vai automaticamente pra "Remarketing" arquivado.' },
            { titulo: 'Agendamento', texto: 'O cliente atendeu e aceitou uma reunião. Você marcou data, hora e local.' },
            { titulo: 'Visita',      texto: 'Chegou o dia da visita. Você conversa com o cliente e apresenta a proposta.' },
            { titulo: 'Venda',       texto: 'Fechou! O cliente vira associado. Aqui você também pode pedir recomendações de outras pessoas.' },
            { titulo: 'Carteira',    texto: 'O cliente virou associado ativo. Aqui você faz manutenção da carteira: cuidar da base (aniversários, feriados) e pedir recomendações.' },
          ]},
          { tipo: 'destaque', tipo_destaque: 'info', texto: 'Cada etapa tem regras próprias, campos obrigatórios e automações. Veja o tópico específico de cada uma no menu à esquerda.' },
        ]
      },
      {
        id: 'perfis',
        titulo: 'Perfis de usuário',
        corpo: [
          { tipo: 'paragrafo', texto: 'O Beyond CRM tem três perfis, cada um com permissões e visibilidade diferentes:' },
          { tipo: 'tabela', cabecalho: ['Perfil', 'O que vê', 'O que pode fazer'], linhas: [
            ['<strong>Especialista</strong>', 'Apenas os leads dos quais é responsável', 'Cadastrar leads, registrar ligações, agendar, visitar, fechar vendas, cuidar da própria carteira'],
            ['<strong>Supervisor</strong>',  'Os leads dos especialistas vinculados a ele', 'Ver o funil dos seus especialistas, transferir leads entre eles, acompanhar performance'],
            ['<strong>Gerente</strong>',     'Todos os leads da operação', 'Tudo do supervisor + criar/editar usuários, configurar vínculos, ver relatórios gerenciais, transferir em lote'],
          ]},
          { tipo: 'destaque', tipo_destaque: 'atencao', texto: 'A visibilidade é aplicada em <strong>tempo real</strong>. Se o gerente vincula um especialista ao supervisor, o supervisor passa a ver os leads dele imediatamente.' },
        ]
      },
      {
        id: 'primeiros-passos',
        titulo: 'Primeiros passos',
        corpo: [
          { tipo: 'paragrafo', texto: 'Se essa é sua primeira vez aqui, sugerimos o seguinte roteiro:' },
          { tipo: 'passos', passos: [
            { titulo: 'Faça login',      texto: 'Use o e-mail e senha que o gerente cadastrou pra você. Se esqueceu a senha, peça pra ele resetar.' },
            { titulo: 'Explore o Dashboard', texto: 'É a primeira tela. Aqui você vê seu Número Mágico, suas metas do mês e KPIs de performance.' },
            { titulo: 'Vá em Processo de Vendas', texto: 'Aqui fica o Kanban dos leads. É onde você trabalha o dia a dia.' },
            { titulo: 'Consulte a Agenda',   texto: 'Todos os seus agendamentos futuros ficam aqui, ordenados por data.' },
            { titulo: 'Volte aqui na Wiki',  texto: 'Sempre que tiver dúvida sobre alguma função, consulte esta central.' },
          ]},
        ]
      },
    ]
  },

  /* ─────────────────────────────────────────────────────────
     2. AUTENTICAÇÃO
     ───────────────────────────────────────────────────────── */
  {
    id: 'autenticacao',
    titulo: 'Login e Sessão',
    icone: 'bi-shield-lock-fill',
    subsecoes: [
      {
        id: 'fazer-login',
        titulo: 'Como fazer login',
        corpo: [
          { tipo: 'imagem', arquivo: 'wiki-login-tela.png', legenda: 'Tela de login do Beyond CRM' },
          { tipo: 'passos', passos: [
            { titulo: 'Abra o sistema',    texto: 'Acesse o endereço do Beyond CRM no navegador (Chrome ou Edge preferencialmente).' },
            { titulo: 'Digite seu e-mail', texto: 'Use o e-mail que o gerente cadastrou pra você.' },
            { titulo: 'Digite sua senha',  texto: 'Se quiser conferir o que digitou, clique no ícone de olhinho no campo.' },
            { titulo: 'Clique em Entrar',  texto: 'Ou aperte Enter direto no campo de senha.' },
          ]},
          { tipo: 'destaque', tipo_destaque: 'dica', texto: 'A sessão fica ativa mesmo se você fechar o navegador — quando voltar, é só reabrir. Só sai forçado depois de muito tempo sem uso ou se o gerente inativar seu usuário.' },
        ]
      },
      {
        id: 'esqueci-senha',
        titulo: 'Esqueci a senha',
        corpo: [
          { tipo: 'paragrafo', texto: 'Se você esqueceu a senha, <strong>peça pra o gerente resetar</strong>. Ele vai em Configurações → Usuários → seu registro e define uma nova senha temporária. Depois disso, você loga com ela e pode alterar.' },
          { tipo: 'destaque', tipo_destaque: 'atencao', texto: 'Por segurança, o sistema não envia e-mail de recuperação automático. A troca de senha passa sempre pelo gerente.' },
        ]
      },
      {
        id: 'sair',
        titulo: 'Sair do sistema',
        corpo: [
          { tipo: 'paragrafo', texto: 'No canto inferior esquerdo da barra lateral, tem o botão "Sair". Ele fecha sua sessão e volta pra tela de login.' },
          { tipo: 'destaque', tipo_destaque: 'info', texto: 'Sempre saia se estiver usando o sistema em um computador compartilhado. Seus leads e dados são pessoais.' },
        ]
      },
    ]
  },

  /* ─────────────────────────────────────────────────────────
     3. DASHBOARD
     ───────────────────────────────────────────────────────── */
  {
    id: 'dashboard',
    titulo: 'Dashboard',
    icone: 'bi-speedometer2',
    subsecoes: [
      {
        id: 'visao-geral-dash',
        titulo: 'O que é o Dashboard',
        corpo: [
          { tipo: 'paragrafo', texto: 'O Dashboard é a <strong>tela inicial</strong> do sistema. É onde você acompanha o "termômetro" da sua performance no dia, na semana e no ciclo.' },
          { tipo: 'imagem', arquivo: 'wiki-dashboard-completo.png', legenda: 'Dashboard completo' },
          { tipo: 'paragrafo', texto: 'A tela tem 4 blocos principais, de cima pra baixo:' },
          { tipo: 'lista', itens: [
            '<strong>Número Mágico</strong> — quantos leads/ligações/agendamentos/etc. você precisa pra bater a meta',
            '<strong>KPIs rápidos</strong> — Ligações do dia, Ticket Médio e Associados na Carteira',
            '<strong>Atingimento de Metas</strong> — barra de progresso de vendas e mensalidade acumulada',
            '<strong>Toda a Equipe</strong> — como está o pessoal do time (só supervisor e gerente veem)',
          ]},
        ]
      },
      {
        id: 'numero-magico',
        titulo: 'Número Mágico — O que é e como funciona',
        corpo: [
          { tipo: 'paragrafo', texto: 'O <strong>Número Mágico</strong> é a matemática por trás da sua meta. A ideia é simples: pra vender X, você precisa de tantos leads, tantos contatos e tantas visitas.' },
          { tipo: 'imagem', arquivo: 'wiki-numero-magico.png', legenda: 'Cards do Número Mágico' },
          { tipo: 'paragrafo', texto: 'A regra usada é a proporção <strong>20-12-4-2-1-3</strong>:' },
          { tipo: 'tabela', cabecalho: ['Etapa', 'Quantidade por venda', 'Explicação'], linhas: [
            ['Leads',        '20', 'A cada 20 leads captados, 1 vira venda'],
            ['Contatos',     '12', 'Desses 20, 12 você consegue contato efetivo'],
            ['Agendamentos', '4',  'Desses 12, 4 aceitam agendar'],
            ['Visitas',      '2',  'Desses 4, 2 comparecem à visita'],
            ['Vendas',       '1',  'Dessas 2 visitas, 1 fecha'],
            ['Recomendações','3',  'A cada 1 venda, 3 recomendações no pós',],
          ]},
          { tipo: 'paragrafo', texto: 'Cada card do NM mostra dois números:' },
          { tipo: 'lista', itens: [
            '<strong>Número grande</strong> — é a META, calculada como <code>meta_vendas × fator</code>',
            '<strong>Real: X</strong> — quantos você já tem na etapa (respeitando o filtro de período selecionado)',
          ]},
          { tipo: 'destaque', tipo_destaque: 'info', texto: 'Se você é <strong>gerente ou supervisor</strong>, a meta é a <strong>soma</strong> das metas dos especialistas visíveis. Ao aplicar filtro por usuário, a meta recalcula considerando apenas quem foi selecionado.' },
        ]
      },
      {
        id: 'kpis',
        titulo: 'Indicadores e gráficos do Dashboard',
        corpo: [
          { tipo: 'paragrafo', texto: 'No topo do Dashboard ficam os indicadores do período selecionado, cada um comparado ao período anterior de mesmo tamanho (seta verde = melhorou, vermelha = piorou):' },
          { tipo: 'tabela', cabecalho: ['KPI', 'O que mede', 'Sensível ao filtro?'], linhas: [
            ['<strong>Receita mensal nova</strong>', 'Soma das mensalidades das vendas fechadas no período (com minigráfico das últimas 8 semanas)', 'Sim — período e filtro de usuário'],
            ['<strong>Vendas</strong>', 'Quantidade de vendas no período, com o ticket médio', 'Sim — período e filtro de usuário'],
            ['<strong>Leads</strong>', 'Leads que entraram no período', 'Sim — período e filtro de usuário'],
            ['<strong>Conversão</strong>', 'Vendas ÷ leads do período (variação em pontos percentuais)', 'Sim — período e filtro de usuário'],
            ['<strong>Associados</strong>', 'Total de clientes na carteira e quantos entraram no período', 'O total só filtra por usuário (é cumulativo)'],
          ]},
          { tipo: 'imagem', arquivo: 'wiki-kpis-dashboard.png', legenda: 'Faixa de indicadores do Dashboard' },
          { tipo: 'paragrafo', texto: 'Logo abaixo: <strong>Evolução</strong> (receita, vendas, leads ou ligações em 7, 30 ou 90 dias — passe o mouse ou o dedo para ver cada dia), <strong>Conversão por Etapa</strong> (quantos % avançam de uma etapa para a outra, com o traço da meta), <strong>Coortes de Leads</strong> (cada semana de entrada e até onde chegou no funil) e <strong>Ranking da Equipe</strong> (vendas do ciclo contra a meta de cada especialista).' },
        ]
      },
      {
        id: 'periodo-dropdown',
        titulo: 'Dropdown de período',
        corpo: [
          { tipo: 'paragrafo', texto: 'No canto superior direito do Dashboard, tem o seletor de período. Ele afeta o Número Mágico (números "Real"), Ligações e Ticket Médio.' },
          { tipo: 'imagem', arquivo: 'wiki-dashboard-dropdown-periodo.png', legenda: 'Dropdown de período' },
          { tipo: 'paragrafo', texto: 'Opções disponíveis:' },
          { tipo: 'lista', itens: [
            '<strong>Hoje</strong> — só o dia corrente',
            '<strong>Esta semana</strong> — últimos 7 dias corridos',
            '<strong>Este mês</strong> — últimos 30 dias corridos',
            '<strong>Últimos 90 dias</strong> — para tendências trimestrais',
            '<strong>Trimestre atual</strong> — desde o primeiro dia do trimestre (Q1: jan-mar, Q2: abr-jun, etc.)',
            '<strong>Ano atual</strong> — desde 1º de janeiro',
            '<strong>Ciclo de comissão (26→25)</strong> — o ciclo de fechamento da empresa (dia 26 do mês anterior ao 25 do atual)',
            '<strong>📅 Data personalizada...</strong> — abre o drawer de filtros pra escolher datas específicas',
          ]},
        ]
      },
      {
        id: 'filtros-dashboard',
        titulo: 'Filtros avançados do Dashboard',
        corpo: [
          { tipo: 'paragrafo', texto: 'Clique no botão <strong>"Filtros"</strong> do canto superior direito pra abrir o drawer. Você pode filtrar por:' },
          { tipo: 'imagem', arquivo: 'wiki-dashboard-filtros-drawer.png', legenda: 'Drawer de filtros do Dashboard' },
          { tipo: 'lista', itens: [
            '<strong>Usuários responsáveis</strong> — marca 1 ou mais especialistas pra ver a performance deles',
            '<strong>Fonte do lead</strong> — filtra por origem (Facebook, Google, Indicação, etc.)',
            '<strong>Data personalizada</strong> — intervalo específico que sobrescreve o dropdown',
          ]},
          { tipo: 'destaque', tipo_destaque: 'dica', texto: 'Os filtros ficam salvos no seu navegador. Se você aplicar hoje e voltar amanhã, eles continuam ativos. Use o botão <strong>Limpar</strong> pra resetar tudo.' },
          { tipo: 'destaque', tipo_destaque: 'info', texto: 'Como gerente, se você filtrar por 1 especialista, o Número Mágico recalcula considerando apenas a meta dele. Muito útil pra analisar caso a caso.' },
        ]
      },
      {
        id: 'atingimento-metas',
        titulo: 'Atingimento de Metas',
        corpo: [
          { tipo: 'paragrafo', texto: 'A seção "Atingimento de Metas" mostra visualmente o quão perto você (ou o time) está de bater as metas do ciclo.' },
          { tipo: 'imagem', arquivo: 'wiki-atingimento-metas.png', legenda: 'Barras de atingimento de metas' },
          { tipo: 'lista', itens: [
            '<strong>Vendas no Ciclo</strong> — quantas vendas você fechou vs a meta',
            '<strong>Mensalidade Acumulada</strong> — soma das mensalidades dos associados do ciclo vs a meta em R$',
          ]},
          { tipo: 'paragrafo', texto: 'Quando você (ou o especialista) atinge 100%, aparece o selo "✅ Meta atingida". Se ultrapassar, ativam os <strong>degraus de comissão</strong> — veja o tópico de Regras de Negócio pra entender.' },
          { tipo: 'destaque', tipo_destaque: 'info', texto: 'Cada degrau pode ser atingido por <strong>quantidade de vendas</strong> ou por <strong>valor de mensalidade</strong> acumulada no ciclo — o que vier primeiro. O detalhe de qual degrau você bateu aparece no painel <strong>Minha Performance</strong>.' },
          { tipo: 'destaque', tipo_destaque: 'info', texto: 'O bloco "Toda a Equipe" só aparece pra <strong>supervisor</strong> e <strong>gerente</strong>. Ele lista todos os especialistas do time com uma linha de progresso cada um.' },
        ]
      },
    ]
  },

  /* ─────────────────────────────────────────────────────────
     4. PROCESSO DE VENDAS
     ───────────────────────────────────────────────────────── */
  {
    id: 'processo-vendas',
    titulo: 'Processo de Vendas',
    icone: 'bi-kanban-fill',
    subsecoes: [
      {
        id: 'visao-kanban',
        titulo: 'Como funciona o Kanban',
        corpo: [
          { tipo: 'paragrafo', texto: 'A tela do Processo de Vendas é um <strong>Kanban de 6 colunas</strong>, uma pra cada etapa. Cada card é um lead.' },
          { tipo: 'imagem', arquivo: 'wiki-kanban-visao-geral.png', legenda: 'Kanban completo com as 6 colunas' },
          { tipo: 'imagem', arquivo: 'wiki-kanban-navegacao.png', legenda: 'Rolando o Kanban até as etapas finais (Venda e Carteira)' },
          { tipo: 'paragrafo', texto: 'No topo da tela você tem 4 ações principais:' },
          { tipo: 'lista', itens: [
            '<strong>Filtro de unidade</strong> — se você atende múltiplas unidades, escolha aqui qual está vendo',
            '<strong>Ver arquivados</strong> — mostra os leads que foram arquivados (com badge de "arquivado")',
            '<strong>Filtros</strong> — abre o drawer de filtros avançados',
            '<strong>Selecionar</strong> — ativa o modo de seleção múltipla (checkboxes nos cards)',
            '<strong>Novo Lead</strong> — abre o modal pra cadastrar um lead novo',
          ]},
        ]
      },
      {
        id: 'cadastrar-lead',
        titulo: 'Cadastrar novo lead',
        corpo: [
          { tipo: 'paragrafo', texto: 'Pra cadastrar um lead novo, clique em <strong>"+ Novo Lead"</strong> no canto superior direito.' },
          { tipo: 'imagem', arquivo: 'wiki-novo-lead-modal.png', legenda: 'Modal de cadastro de novo lead' },
          { tipo: 'passos', passos: [
            { titulo: 'Preencha nome e telefone', texto: 'Ambos são obrigatórios. O código BCR-2026-XXXXX é gerado automaticamente pelo sistema.' },
            { titulo: 'Escolha a fonte',          texto: 'De onde o lead veio (Facebook, Google, Indicação, Recomendação Associado, etc.).' },
            { titulo: 'Preencha dados opcionais', texto: 'Placa, valor FIPE do veículo, mensalidade estimada — quanto mais informação, melhor o funil.' },
            { titulo: 'Adicione tags',            texto: 'Tags como "quente", "atenção", "VIP" ajudam a categorizar. Elas são filtráveis depois.' },
            { titulo: 'Salve',                    texto: 'O lead vai direto pra coluna "Lead" e você já pode começar a trabalhar ele.' },
          ]},
          { tipo: 'destaque', tipo_destaque: 'atencao', texto: 'Se você tentar cadastrar um telefone que <strong>já existe</strong> em outro lead, o sistema abre um alerta mostrando quem já trata esse contato. Você pode <strong>Cancelar</strong> ou <strong>Notificar o Gerente</strong> pra ele decidir o que fazer.' },
        ]
      },
      {
        id: 'etapa-lead',
        titulo: 'Etapa: Lead',
        corpo: [
          { tipo: 'paragrafo', texto: 'A coluna <strong>Lead</strong> é onde ficam os contatos que você ainda não começou a trabalhar. Ao abrir o card:' },
          { tipo: 'imagem', arquivo: 'wiki-etapa-lead.png', legenda: 'Modal do lead na etapa "Lead"' },
          { tipo: 'lista', itens: [
            'Você vê e edita os dados básicos (fonte, veículo, mensalidade estimada, tags)',
            'Pode adicionar <strong>observações acumuladas</strong> (elas ficam salvas em todas as etapas)',
            'Ao clicar em <strong>Avançar: Ligação →</strong>, o lead pula pra próxima etapa',
          ]},
          { tipo: 'destaque', tipo_destaque: 'dica', texto: 'A qualquer momento você pode <strong>Arquivar</strong> o lead (se não fizer sentido continuar) ou, se for gerente, <strong>Excluir</strong>. Só o gerente tem o botão de excluir.' },
        ]
      },
      {
        id: 'etapa-ligacao',
        titulo: 'Etapa: Ligação',
        corpo: [
          { tipo: 'paragrafo', texto: 'Na coluna <strong>Ligação</strong>, você registra cada tentativa de contato. O card mostra um badge com o número de tentativas.' },
          { tipo: 'imagem', arquivo: 'wiki-etapa-ligacao.png', legenda: 'Registro de ligação com resultados' },
          { tipo: 'paragrafo', texto: 'Ao registrar uma ligação, você escolhe um <strong>resultado</strong>:' },
          { tipo: 'lista', itens: [
            '<strong>Atendeu — Interessado</strong> → avança pra Agendamento',
            '<strong>Não Atendeu</strong> → conta como tentativa',
            '<strong>Ocupado / Caixa Postal</strong> → conta como tentativa',
            '<strong>Não Interessado</strong> → arquiva o lead',
            '<strong>Remarketing</strong> → põe o lead em standby',
          ]},
          { tipo: 'destaque', tipo_destaque: 'info', texto: 'Se você chegar em <strong>30 tentativas</strong> e marcar como Remarketing, o sistema arquiva automaticamente. É a RN-22 (auto-arquivamento por Remarketing).' },
          { tipo: 'destaque', tipo_destaque: 'atencao', texto: 'Cards com <strong>25 tentativas ou mais</strong> ganham badge vermelho de alerta. É o sinal pra você redobrar esforço ou aceitar que esse lead é frio.' },
        ]
      },
      {
        id: 'etapa-agendamento',
        titulo: 'Etapa: Agendamento',
        corpo: [
          { tipo: 'paragrafo', texto: 'Na coluna <strong>Agendamento</strong> ficam os leads que aceitaram uma reunião. Cada card mostra a data e hora agendada com badge colorido:' },
          { tipo: 'imagem', arquivo: 'wiki-etapa-agendamento-badges.png', legenda: 'Cards com badges de data coloridos' },
          { tipo: 'tabela', cabecalho: ['Cor do badge', 'Significado'], linhas: [
            ['🟢 Verde',     '<strong>Hoje</strong> — atendimento é hoje, no horário indicado'],
            ['🔵 Azul',      '<strong>Amanhã</strong> — se prepare, é o próximo'],
            ['⚪ Cinza',     '<strong>Futuro</strong> — data mais distante'],
            ['🔴 Vermelho (pulsando)', '<strong>Atrasado</strong> — o horário já passou e não foi registrada visita'],
          ]},
          { tipo: 'paragrafo', texto: 'No card do lead, você preenche:' },
          { tipo: 'lista', itens: [
            'Categoria do veículo (Nacional Particular, Importado/Diesel, Motocicleta, etc.)',
            'Local (Interno na loja, Externo, Online)',
            'Data e hora da visita',
            'Checklist de confirmação (mandar endereço, confirmar horário, etc.)',
          ]},
          { tipo: 'destaque', tipo_destaque: 'dica', texto: 'Você recebe uma notificação <strong>30 minutos antes</strong> de cada agendamento. Assim não corre risco de esquecer.' },
          { tipo: 'paragrafo', texto: '<strong>Avanço automático para Visita:</strong> você não move o card manualmente. Quando a data/hora do agendamento chega, o sistema move o lead de <strong>Agendamento</strong> para <strong>Visita</strong> sozinho (em até 1 minuto). Enquanto a hora não chega, o card fica em Agendamento com o badge da data.' },
          { tipo: 'destaque', tipo_destaque: 'atencao', texto: '<strong>Remarcar ou corrigir a data:</strong> reabra a aba Agendamento do lead e salve a nova data. O sistema passa a considerar sempre o agendamento salvo <strong>mais recente</strong> — funciona tanto para adiar quanto para antecipar, e também para corrigir uma digitação errada. Não é preciso arrastar o card.' },
        ]
      },
      {
        id: 'etapa-visita',
        titulo: 'Etapa: Visita',
        corpo: [
          { tipo: 'paragrafo', texto: 'A coluna <strong>Visita</strong> é a mais importante do dia. Os cards vêm <strong>ordenados pela data/hora do agendamento</strong>, em ordem cronológica: os <strong>atrasados aparecem no topo</strong> (são os mais urgentes), seguidos dos de hoje e depois dos futuros. Assim você bate o olho e sabe quem precisa de ação primeiro.' },
          { tipo: 'imagem', arquivo: 'wiki-etapa-visita-ordenada.png', legenda: 'Coluna Visita ordenada por data' },
          { tipo: 'paragrafo', texto: 'Ao terminar uma visita, você registra o <strong>resultado</strong>:' },
          { tipo: 'tabela', cabecalho: ['Resultado', 'O que acontece'], linhas: [
            ['<strong>Delay</strong>',    'O cliente pediu pra remarcar — você reagenda pra outra data'],
            ['<strong>C2</strong>',       'Segundo contato agendado — o cliente ficou de decidir e voltar'],
            ['<strong>Não Fechou</strong>', 'Perdeu a venda — lead é arquivado com o motivo'],
            ['<strong>Venda!</strong>',   'Fechou! O lead avança pra etapa Venda'],
          ]},
          { tipo: 'destaque', tipo_destaque: 'info', texto: 'Sempre que você registra uma <strong>nova data</strong> (um <strong>C2</strong>, um <strong>Delay</strong> ou uma correção do agendamento), o card se reposiciona automaticamente na fila da Visita conforme a data mais recente. O sistema sempre usa o agendamento salvo por último. Você <strong>não precisa</strong> arrastar manualmente.' },
        ]
      },
      {
        id: 'etapa-venda',
        titulo: 'Etapa: Venda',
        corpo: [
          { tipo: 'paragrafo', texto: 'Parabéns, fechou! Na etapa <strong>Venda</strong>, você formaliza a venda e capta recomendações.' },
          { tipo: 'imagem', arquivo: 'wiki-etapa-venda.png', legenda: 'Formulário da etapa Venda' },
          { tipo: 'paragrafo', texto: 'Campos importantes:' },
          { tipo: 'lista', itens: [
            '<strong>Data da venda</strong>',
            '<strong>Valor da mensalidade</strong> — é o que entra no cálculo do Ticket Médio',
            '<strong>Valor de adesão</strong>',
            '<strong>Formulário de recomendação</strong> — nome + telefone + grau de parentesco + veículo + observações',
          ]},
          { tipo: 'destaque', tipo_destaque: 'dica', texto: 'Após preencher uma recomendação, clique em <strong>"Criar como Lead"</strong>. O sistema cria automaticamente um lead novo com esses dados — não precisa recadastrar. O formulário limpa sozinho pra você preencher a próxima recomendação.' },
        ]
      },
      {
        id: 'etapa-carteira',
        titulo: 'Etapa: Carteira (Cliente ativo)',
        corpo: [
          { tipo: 'paragrafo', texto: 'A <strong>Carteira</strong> é o pós-venda. Aqui você trabalha os associados ativos com duas frentes:' },
          { tipo: 'imagem', arquivo: 'wiki-carteira-visao.png', legenda: 'Visão da carteira ativa' },
          { tipo: 'lista', itens: [
            '<strong>Pedido de Recomendação</strong> — periodicamente você liga pro cliente pra pedir 3 indicações',
            '<strong>Cuidar da Base</strong> — contato de relacionamento (aniversário, feriado, campanhas, relembrar benefícios)',
          ]},
          { tipo: 'destaque', tipo_destaque: 'atencao', texto: 'O botão "Registrar" na seção <strong>Cuidar da Base</strong> grava a interação de forma <strong>independente</strong> do pedido de recomendação. São dois botões separados — não confunda.' },
          { tipo: 'paragrafo', texto: 'Resultados possíveis do Cuidar da Base: <strong>Atendeu</strong>, <strong>Não Atendeu</strong>, <strong>Pediu para Retornar</strong>. Motivos: Aniversários, Férias, Festas, Feriado, Fenômenos da Natureza, Índice de Acidentes, Campanhas Promocionais, Relembrar Benefícios, Outros.' },
        ]
      },
      {
        id: 'filtros-funil',
        titulo: 'Filtros avançados do Funil',
        corpo: [
          { tipo: 'paragrafo', texto: 'Clique em <strong>"Filtros"</strong> no topo do Kanban pra abrir o drawer de filtros avançados.' },
          { tipo: 'imagem', arquivo: 'wiki-filtros-funil-drawer.png', legenda: 'Drawer de filtros do Funil' },
          { tipo: 'paragrafo', texto: 'Você pode filtrar por:' },
          { tipo: 'lista', itens: [
            '<strong>Tags</strong> — leads marcados com tag específica',
            '<strong>Data de criação</strong> — intervalo de datas',
            '<strong>Fonte do lead</strong> — origem específica',
            '<strong>Código do lead</strong> — busca pelo BCR-2026-XXXXX',
            '<strong>Mensalidade estimada</strong> — faixa em R$ (opção "incluir vazios")',
            '<strong>Valor FIPE</strong> — faixa em R$',
            '<strong>Categoria do veículo</strong> — 6 opções fixas (Nacional Particular, Importado/Diesel, etc.)',
            '<strong>Resultado da visita</strong> — Delay, C2, Não Fechou, Venda',
            '<strong>Incluir arquivados</strong> — mostra também os cards arquivados',
          ]},
          { tipo: 'destaque', tipo_destaque: 'info', texto: 'Os filtros são combinados com <strong>lógica AND</strong>: um lead precisa passar em TODOS os filtros ativos pra aparecer. Se marcar "Tag VIP" e "Fonte Google", só aparece quem for os dois ao mesmo tempo.' },
          { tipo: 'destaque', tipo_destaque: 'dica', texto: 'Os filtros ficam salvos no navegador (localStorage). Persistem entre F5 e no dia seguinte. Use o botão <strong>Limpar</strong> pra resetar.' },
        ]
      },
      {
        id: 'arquivamento',
        titulo: 'Arquivar e desarquivar',
        corpo: [
          { tipo: 'paragrafo', texto: 'Arquivar um lead o <strong>tira da visualização padrão</strong>, mas não o exclui. É útil pra "limpar" o Kanban sem perder o histórico.' },
          { tipo: 'imagem', arquivo: 'wiki-arquivar-lead.png', legenda: 'Botão Arquivar no modal do lead' },
          { tipo: 'passos', passos: [
            { titulo: 'Abra o lead',      texto: 'Clique no card na coluna atual.' },
            { titulo: 'Clique em Arquivar', texto: 'No rodapé do modal. Todos os perfis podem arquivar.' },
            { titulo: 'Confirme',         texto: 'O card some da visualização.' },
            { titulo: 'Pra ver arquivados', texto: 'Ative o botão "Ver arquivados" no topo do funil.' },
            { titulo: 'Pra desarquivar',    texto: 'Com "Ver arquivados" ativo, abra o card e clique em Desarquivar.' },
          ]},
          { tipo: 'destaque', tipo_destaque: 'atencao', texto: 'Se um lead é <strong>auto-arquivado por Remarketing</strong> (30 tentativas) e depois desarquivado por um gerente, ele volta pra coluna <strong>Ligação</strong>, não pra coluna original.' },
        ]
      },
      {
        id: 'transferir-lead',
        titulo: 'Transferir lead individual',
        corpo: [
          { tipo: 'paragrafo', texto: 'Apenas <strong>gerentes</strong> podem transferir leads individuais.' },
          { tipo: 'imagem', arquivo: 'wiki-transferir-single.png', legenda: 'Modal de transferência individual' },
          { tipo: 'passos', passos: [
            { titulo: 'Abra o lead',          texto: 'Como gerente, abra qualquer card.' },
            { titulo: 'Clique em Transferir', texto: 'Botão no rodapé do modal.' },
            { titulo: 'Escolha o destinatário', texto: 'O dropdown lista todos os usuários ativos, menos o responsável atual.' },
            { titulo: 'Motivo (opcional)',    texto: 'Registre por que a transferência (ex.: "redistribuição por carga de trabalho").' },
            { titulo: 'Confirme',             texto: 'O lead passa a pertencer ao novo responsável.' },
          ]},
        ]
      },
      {
        id: 'transferir-lote',
        titulo: 'Transferência em lote',
        corpo: [
          { tipo: 'paragrafo', texto: 'Pra transferir <strong>vários leads de uma vez</strong> (útil pra redistribuir carteiras inteiras):' },
          { tipo: 'imagem', arquivo: 'wiki-transferir-lote-modal.png', legenda: 'Modal de transferência em lote' },
          { tipo: 'passos', passos: [
            { titulo: 'Ative o modo seleção',    texto: 'Clique em "Selecionar" no topo do funil. Aparecem checkboxes nos cards.' },
            { titulo: 'Marque os leads',         texto: 'Clique nos cards que você quer transferir. Vai aparecendo contador.' },
            { titulo: 'Clique em Importar Carteira / Transferir Selecionados', texto: 'Abre o modal com a lista completa dos leads selecionados (com scroll interno).' },
            { titulo: 'Escolha o destinatário',  texto: 'Todos os leads vão pro mesmo destinatário.' },
            { titulo: 'Confirme',                texto: 'Overlay de progresso aparece enquanto o sistema processa. Não feche a janela.' },
          ]},
          { tipo: 'destaque', tipo_destaque: 'atencao', texto: 'Se algum lead selecionado <strong>já foi transferido</strong> por outro usuário (via Realtime), aparece um aviso amarelo no topo do modal + badge individual em cada lead afetado. O sistema tenta transferir mesmo assim, mas o banco pode rejeitar essas linhas.' },
          { tipo: 'destaque', tipo_destaque: 'dica', texto: 'Permissão: apenas <strong>supervisor</strong> e <strong>gerente</strong> podem transferir em lote.' },
        ]
      },
      {
        id: 'duplicidade',
        titulo: 'Duplicidade de telefone',
        corpo: [
          { tipo: 'paragrafo', texto: 'Ao cadastrar um lead com telefone que <strong>já existe</strong> na base, o sistema alerta você antes de duplicar:' },
          { tipo: 'imagem', arquivo: 'wiki-modal-duplicidade.png', legenda: 'Modal de alerta de duplicidade' },
          { tipo: 'paragrafo', texto: 'O modal mostra <strong>todos os leads existentes</strong> com o mesmo número, incluindo:' },
          { tipo: 'lista', itens: [
            'Código do lead (BCR-2026-XXXXX)',
            'Nome',
            'Etapa atual (com badge colorido)',
            'Responsável e sigla',
            'Unidade',
            'Marca de "arquivado" se for o caso',
          ]},
          { tipo: 'paragrafo', texto: 'Você tem duas opções:' },
          { tipo: 'lista', itens: [
            '<strong>Cancelar</strong> — não cadastra o novo lead (o original continua com quem está)',
            '<strong>Cadastrar mesmo assim e Notificar Gerente</strong> — cria o novo lead E manda uma notificação pro gerente decidir o que fazer',
          ]},
          { tipo: 'destaque', tipo_destaque: 'info', texto: 'A detecção funciona <strong>ignorando máscara</strong> — "(31) 99999-8888", "31999998888" e "+55 31 99999 8888" são reconhecidos como o mesmo número.' },
        ]
      },
    ]
  },

  /* ─────────────────────────────────────────────────────────
     5. AGENDA
     ───────────────────────────────────────────────────────── */
  {
    id: 'agenda',
    titulo: 'Agenda',
    icone: 'bi-calendar-week-fill',
    subsecoes: [
      {
        id: 'agenda-visao',
        titulo: 'O que é a Agenda',
        corpo: [
          { tipo: 'paragrafo', texto: 'A Agenda é um <strong>calendário</strong> com todos os seus agendamentos e visitas futuros, ordenados por data.' },
          { tipo: 'imagem', arquivo: 'wiki-agenda-calendario.png', legenda: 'Calendário da Agenda' },
          { tipo: 'paragrafo', texto: 'Cada agendamento aparece no dia/hora certos. Clicar em cima abre o card do lead correspondente.' },
        ]
      },
      {
        id: 'notificacao-30min',
        titulo: 'Notificação 30 minutos antes',
        corpo: [
          { tipo: 'paragrafo', texto: 'O sistema envia uma <strong>notificação automática</strong> 30 minutos antes de cada agendamento. Aparece como toast (aviso flutuante) na tela.' },
          { tipo: 'destaque', tipo_destaque: 'dica', texto: 'Pra receber, você precisa estar com o sistema aberto no navegador. Se estiver fechado, a notificação aparece assim que abrir de novo.' },
        ]
      },
    ]
  },

  /* ─────────────────────────────────────────────────────────
     6. HISTÓRICO
     ───────────────────────────────────────────────────────── */
  {
    id: 'historico',
    titulo: 'Histórico',
    icone: 'bi-clock-history',
    subsecoes: [
      {
        id: 'historico-visao',
        titulo: 'O que é o Histórico',
        corpo: [
          { tipo: 'paragrafo', texto: 'O Histórico é a <strong>linha do tempo</strong> de tudo que aconteceu no sistema — ligações, agendamentos, visitas, vendas, transferências, arquivamentos.' },
          { tipo: 'imagem', arquivo: 'wiki-historico-visao.png', legenda: 'Tela do Histórico' },
          { tipo: 'paragrafo', texto: 'Você pode filtrar por:' },
          { tipo: 'lista', itens: [
            '<strong>Código do lead</strong> — mostra o histórico completo de um lead específico',
            '<strong>Tipo de atividade</strong> — só ligações, só vendas, etc.',
            '<strong>Período</strong> — intervalo de datas',
            '<strong>Usuário responsável</strong> — atividades de um especialista específico',
          ]},
        ]
      },
    ]
  },

  /* ─────────────────────────────────────────────────────────
     7. RELATÓRIOS
     ───────────────────────────────────────────────────────── */
  {
    id: 'relatorios',
    titulo: 'Relatórios',
    icone: 'bi-bar-chart-fill',
    subsecoes: [
      {
        id: 'relatorios-visao',
        titulo: 'Tipos de relatório',
        corpo: [
          { tipo: 'paragrafo', texto: 'A tela de Relatórios oferece visões consolidadas pra gerentes e supervisores acompanharem a operação.' },
          { tipo: 'imagem', arquivo: 'wiki-relatorios-visao.png', legenda: 'Tela de Relatórios' },
          { tipo: 'lista', itens: [
            '<strong>Conversão por Etapa</strong> — mostra quantos leads há em cada etapa do funil e quanto se converte de uma etapa para a próxima; a última coluna é a conversão sobre a etapa anterior, indicando onde há maior perda de leads',
            '<strong>Saúde do Funil</strong> — um placar único de 0 a 100 que resume a saúde geral do funil (verde = saudável, amarelo = atenção, vermelho = crítico), combinando conversão total, eficiência das ligações e cumprimento de metas',
            '<strong>Taxa de Conversão</strong> — quanto o funil converte de uma etapa pra próxima',
            '<strong>Performance de Especialistas</strong> — comparação entre membros do time',
            '<strong>Aniversariantes</strong> — clientes fazendo aniversário no mês (útil pro Cuidar da Base)',
          ]},
          { tipo: 'destaque', tipo_destaque: 'dica', texto: 'Ao lado dos títulos de <strong>"Conversão por Etapa"</strong> e <strong>"Saúde do Funil"</strong> (e das três barrinhas abaixo do score) há um ícone <strong>(i)</strong>. Passe o mouse sobre ele para ver o texto de ajuda explicando cada indicador.' },
          { tipo: 'destaque', tipo_destaque: 'info', texto: 'Especialistas veem versões limitadas. Supervisores e gerentes têm acesso total.' },
        ]
      },
    ]
  },

  /* ─────────────────────────────────────────────────────────
     8. CURRÍCULOS
     ───────────────────────────────────────────────────────── */
  {
    id: 'curriculos',
    titulo: 'Currículos',
    icone: 'bi-file-person-fill',
    subsecoes: [
      {
        id: 'curriculos-visao',
        titulo: 'O que é o módulo de Currículos',
        corpo: [
          { tipo: 'paragrafo', texto: 'É onde ficam os currículos de candidatos que se aplicaram pra vagas na empresa. Apenas <strong>gerentes</strong> e <strong>supervisores</strong> têm acesso.' },
          { tipo: 'imagem', arquivo: 'wiki-curriculos-visao.png', legenda: 'Tela de Currículos' },
          { tipo: 'destaque', tipo_destaque: 'info', texto: 'A funcionalidade completa pode evoluir em releases futuros. Se precisar de recursos específicos, fale com o desenvolvedor.' },
        ]
      },
    ]
  },

  /* ─────────────────────────────────────────────────────────
     9. CONFIGURAÇÕES
     ───────────────────────────────────────────────────────── */
  {
    id: 'configuracoes',
    titulo: 'Configurações',
    icone: 'bi-gear-fill',
    subsecoes: [
      {
        id: 'usuarios-cadastro',
        titulo: 'Cadastrar e editar usuários',
        corpo: [
          { tipo: 'paragrafo', texto: 'Apenas <strong>gerentes</strong> podem cadastrar novos usuários. Vá em <strong>Configurações → Usuários</strong>.' },
          { tipo: 'imagem', arquivo: 'wiki-cadastro-usuario.png', legenda: 'Modal de cadastro de usuário' },
          { tipo: 'paragrafo', texto: 'Campos:' },
          { tipo: 'lista', itens: [
            '<strong>Foto de perfil</strong> — PNG, máximo 2MB',
            '<strong>Nome completo</strong>',
            '<strong>Sigla (2 letras)</strong> — aparece no badge do card',
            '<strong>E-mail</strong> — pra login',
            '<strong>Filial</strong> — a unidade a que pertence',
            '<strong>Perfil</strong> — Especialista / Supervisor / Gerente',
            '<strong>Meta valor mensalidade (R$)</strong> — meta financeira',
            '<strong>Meta quantidade de vendas</strong> — meta de vendas do ciclo',
            '<strong>Degraus de comissão</strong> — Super Meta, Power Meta e The King. Cada degrau tem <strong>dois campos</strong>: número de vendas <em>e</em> valor de mensalidade (R$). O especialista atinge o degrau por qualquer um dos dois caminhos. Deixe em zero o caminho que não quiser usar.',
          ]},
          { tipo: 'destaque', tipo_destaque: 'dica', texto: 'As metas ficam versionadas por mês: se você mudar as metas no meio do caminho, os ciclos passados continuam com os valores que estavam vigentes na época.' },
          { tipo: 'destaque', tipo_destaque: 'atencao', texto: 'A senha inicial é definida no cadastro. Repasse pro usuário e peça pra ele trocar depois.' },
        ]
      },
      {
        id: 'vinculo-supervisor',
        titulo: 'Vincular Supervisor a Especialistas',
        corpo: [
          { tipo: 'paragrafo', texto: 'Quando você edita um <strong>Supervisor</strong>, aparece uma seção especial no modal:' },
          { tipo: 'imagem', arquivo: 'wiki-vinculo-supervisor.png', legenda: 'Seção "Especialistas sob supervisão"' },
          { tipo: 'passos', passos: [
            { titulo: 'Abra o supervisor',   texto: 'Em Configurações → Usuários, edite o supervisor.' },
            { titulo: 'Vá até "Especialistas sob supervisão"', texto: 'Aparece uma lista com todos os especialistas ativos da mesma filial.' },
            { titulo: 'Marque quem ele vai supervisionar', texto: 'Pode marcar 1, 2 ou N especialistas.' },
            { titulo: 'Salve',                texto: 'O supervisor passa a ver todos os leads dos especialistas marcados.' },
          ]},
          { tipo: 'destaque', tipo_destaque: 'info', texto: 'Novos leads criados pelos especialistas vinculados aparecem <strong>automaticamente</strong> no funil do supervisor via realtime. Não precisa reabrir o vínculo.' },
          { tipo: 'destaque', tipo_destaque: 'atencao', texto: 'Se você mudar a filial do supervisor, os vínculos precisam ser refeitos (a seção só lista especialistas da mesma filial).' },
        ]
      },
      {
        id: 'tags',
        titulo: 'Gerenciar Tags',
        corpo: [
          { tipo: 'paragrafo', texto: 'Tags são etiquetas coloridas que ajudam a categorizar leads (quente, atenção, VIP, etc.). Você configura o catálogo delas em Configurações.' },
          { tipo: 'imagem', arquivo: 'wiki-tags-configuracao.png', legenda: 'Configuração de tags' },
          { tipo: 'lista', itens: [
            'Nome da tag',
            'Cor (fundo + texto)',
            'Ícone opcional',
          ]},
          { tipo: 'destaque', tipo_destaque: 'dica', texto: 'As tags aparecem nos filtros avançados do Funil. Use-as pra segmentar (ex.: filtrar só quentes na hora da abordagem).' },
        ]
      },
      {
        id: 'unidades',
        titulo: 'Unidades e Filiais',
        corpo: [
          { tipo: 'paragrafo', texto: 'Cada usuário e cada lead pertence a uma <strong>unidade</strong> (filial). O gerente pode cadastrar novas unidades em Configurações.' },
          { tipo: 'destaque', tipo_destaque: 'info', texto: 'O filtro superior do Funil ("Todas as Unidades" / unidade específica) permite ao gerente ver leads de uma unidade só.' },
        ]
      },
    ]
  },

  /* ─────────────────────────────────────────────────────────
     10. REGRAS DE NEGÓCIO
     ───────────────────────────────────────────────────────── */
  {
    id: 'regras-negocio',
    titulo: 'Regras de Negócio',
    icone: 'bi-journal-check',
    subsecoes: [
      {
        id: 'lista-rn',
        titulo: 'Lista das Regras de Negócio (RN)',
        corpo: [
          { tipo: 'paragrafo', texto: 'As "RN" (Regras de Negócio) são as automações que o sistema aplica. Elas garantem que o processo seja padronizado e evita erros manuais.' },
          { tipo: 'tabela', cabecalho: ['Código', 'Regra', 'Onde se aplica'], linhas: [
            ['RN-01', 'Cada lead tem um código único no formato BCR-2026-XXXXX, gerado pelo sistema', 'Cadastro de lead'],
            ['RN-21', 'Todos os perfis podem arquivar leads; só gerente pode excluir', 'Botão Arquivar/Excluir'],
            ['RN-22', 'Lead com 30 tentativas marcado como Remarketing é arquivado automaticamente', 'Coluna Ligação'],
            ['RN-23', 'Coluna Visita ordena cronologicamente pela data/hora do agendamento (atrasados no topo, depois hoje e futuros); o lead avança de Agendamento para Visita automaticamente quando a data chega', 'Kanban'],
            ['RN-24', 'Notificação toast 30 minutos antes de cada agendamento', 'Agenda'],
            ['RN-25', 'Detecção automática de telefone duplicado ao cadastrar novo lead', 'Cadastro de lead'],
            ['RN-26', 'Filtros avançados do Funil combinados com lógica AND', 'Kanban'],
            ['RN-27', 'Filtros avançados do Dashboard aplicam-se ao NM, KPIs e Ticket Médio', 'Dashboard'],
            ['RN-28', 'Drag manual reordena cards dentro da coluna (na Visita cede à data do agendamento)', 'Kanban'],
            ['RN-29', 'Atualizações em tempo real (Realtime) — leads criados/movidos por outros usuários aparecem sem F5', 'Todo o sistema'],
          ]},
          { tipo: 'destaque', tipo_destaque: 'info', texto: 'Há outras RN internas (RN-02 a RN-20) que tratam de detalhes técnicos como validação de campos, ciclo de comissão e integridade referencial.' },
        ]
      },
      {
        id: 'ciclo-comissao',
        titulo: 'Ciclo de comissão (26→25)',
        corpo: [
          { tipo: 'paragrafo', texto: 'O ciclo comercial da empresa vai do <strong>dia 26</strong> de um mês ao <strong>dia 25</strong> do mês seguinte. É esse período que conta pra:' },
          { tipo: 'lista', itens: [
            'Batimento de meta mensal',
            'Cálculo de comissões',
            'Bloco "Atingimento de Metas" do Dashboard',
          ]},
          { tipo: 'destaque', tipo_destaque: 'dica', texto: 'No dropdown de período do Dashboard, escolha "Ciclo de comissão (26→25)" pra ver os números exatos do ciclo atual.' },
        ]
      },
      {
        id: 'degraus-comissao',
        titulo: 'Degraus de comissão',
        corpo: [
          { tipo: 'paragrafo', texto: 'Além da meta, existem <strong>degraus de comissão</strong> que dão bônus fixos ao final do ciclo:' },
          { tipo: 'tabela', cabecalho: ['Degrau', 'Bônus', 'Como se atinge'], linhas: [
            ['<strong>Super Meta</strong>', '+ R$ 200',   'Nº de vendas <strong>ou</strong> valor de mensalidade — configurável por usuário'],
            ['<strong>Power Meta</strong>', '+ R$ 800',   'Nº de vendas <strong>ou</strong> valor de mensalidade — configurável por usuário'],
            ['<strong>The King</strong>',   '+ R$ 1.800', 'Nº de vendas <strong>ou</strong> valor de mensalidade — configurável por usuário'],
          ]},
          { tipo: 'paragrafo', texto: 'Cada degrau tem <strong>dois alvos</strong> configuráveis pelo gerente no cadastro do usuário: uma <strong>quantidade de vendas</strong> e um <strong>valor de mensalidade</strong>. O degrau é atingido quando o especialista alcança <strong>qualquer um dos dois</strong> — o que ocorrer primeiro. Se um dos alvos for deixado em zero, esse caminho fica desativado e vale só o outro.' },
          { tipo: 'destaque', tipo_destaque: 'atencao', texto: 'O bônus é o do <strong>maior degrau atingido</strong> e <strong>não acumula</strong>: quem chega no The King recebe R$ 1.800 (não R$ 200 + R$ 800 + R$ 1.800). Os valores já são finais.' },
          { tipo: 'destaque', tipo_destaque: 'dica', texto: 'O painel <strong>Minha Performance</strong> mostra o degrau atingido, o bônus e quanto falta para o próximo — indicando os dois caminhos (vendas ou valor).' },
        ]
      },
    ]
  },

  /* ─────────────────────────────────────────────────────────
     11. REALTIME
     ───────────────────────────────────────────────────────── */
  {
    id: 'realtime',
    titulo: 'Tempo Real',
    icone: 'bi-broadcast',
    subsecoes: [
      {
        id: 'realtime-visao',
        titulo: 'Como funciona o Realtime',
        corpo: [
          { tipo: 'paragrafo', texto: 'O Beyond CRM tem <strong>sincronização em tempo real</strong>. Isso significa que se outra pessoa (ou você em outra aba) cria/move/edita um lead, você vê a mudança <strong>sem precisar apertar F5</strong>.' },
          { tipo: 'paragrafo', texto: 'Tabelas sincronizadas em tempo real:' },
          { tipo: 'lista', itens: [
            '<strong>Leads</strong> — criação, edição, transferência, arquivamento',
            '<strong>Ligações</strong> — cada tentativa registrada',
            '<strong>Agendamentos</strong> — novos e alterações de data',
            '<strong>Visitas</strong> — resultados',
            '<strong>Vendas</strong> — fechamentos',
          ]},
          { tipo: 'destaque', tipo_destaque: 'info', texto: 'A visibilidade continua respeitando as regras: um especialista <strong>não</strong> recebe eventos de leads de outro especialista sem vínculo. A segurança é aplicada no banco.' },
          { tipo: 'destaque', tipo_destaque: 'dica', texto: 'Quando um evento chega, aparece brevemente um toast "🔄 Alterações recebidas em tempo real" no canto da tela.' },
        ]
      },
    ]
  },

  /* ─────────────────────────────────────────────────────────
     12. DICAS E ATALHOS
     ───────────────────────────────────────────────────────── */
  {
    id: 'dicas',
    titulo: 'Dicas e Atalhos',
    icone: 'bi-lightbulb-fill',
    subsecoes: [
      {
        id: 'busca-lead',
        titulo: 'Busca rápida de lead',
        corpo: [
          { tipo: 'paragrafo', texto: 'No topo do sistema tem uma <strong>barra de busca global</strong>. Digite parte do nome, telefone ou código pra achar o lead rapidamente.' },
          { tipo: 'imagem', arquivo: 'wiki-busca-global.png', legenda: 'Barra de busca no topo' },
          { tipo: 'destaque', tipo_destaque: 'dica', texto: 'A busca ignora acentos, maiúsculas e formatação de telefone. "silva", "SILVA" e "Sílva" retornam os mesmos resultados.' },
        ]
      },
      {
        id: 'notificacoes-sino',
        titulo: 'Notificações (sino)',
        corpo: [
          { tipo: 'paragrafo', texto: 'No canto superior direito, o ícone de <strong>sino</strong> mostra suas notificações não lidas.' },
          { tipo: 'imagem', arquivo: 'wiki-sino-notificacoes.png', legenda: 'Sino de notificações' },
          { tipo: 'paragrafo', texto: 'Você recebe notificação em casos como:' },
          { tipo: 'lista', itens: [
            'Agendamento em 30 minutos (RN-24)',
            'Duplicidade de telefone com outro especialista (RN-25)',
            'Lead transferido pra você',
            'Aviso do gerente',
          ]},
        ]
      },
      {
        id: 'atalhos-teclado',
        titulo: 'Atalhos úteis',
        corpo: [
          { tipo: 'tabela', cabecalho: ['Atalho', 'O que faz'], linhas: [
            ['<code>Enter</code>',                'No campo de senha do login → entra direto'],
            ['<code>Ctrl + F5</code> (Ctrl+Shift+R)',  'Hard refresh — força recarregar tudo sem cache'],
            ['<code>Esc</code>',                  'Fecha o modal aberto'],
          ]},
          { tipo: 'destaque', tipo_destaque: 'dica', texto: 'Nos campos de data/hora, tem sempre o botão <strong>"Agora"</strong> ao lado — clique pra preencher com o horário atual sem precisar digitar.' },
        ]
      },
    ]
  },

  /* ─────────────────────────────────────────────────────────
     13. SOLUÇÃO DE PROBLEMAS
     ───────────────────────────────────────────────────────── */
  {
    id: 'suporte',
    titulo: 'Solução de Problemas',
    icone: 'bi-tools',
    subsecoes: [
      {
        id: 'problemas-comuns',
        titulo: 'Problemas comuns',
        corpo: [
          { tipo: 'destaque', tipo_destaque: 'info', texto: '<strong>"A tela não atualiza depois que criei um lead"</strong><br>Aperte F5 uma vez. Se persistir, dá um Ctrl+Shift+R (limpa cache). Se ainda não funcionar, fale com o desenvolvedor.' },
          { tipo: 'destaque', tipo_destaque: 'info', texto: '<strong>"Não consigo transferir lead — dá erro no dropdown"</strong><br>Alguns navegadores demoram pra carregar a lista de destinatários. Aguarde 5 segundos e tente de novo. Se persistir, avise o gerente.' },
          { tipo: 'destaque', tipo_destaque: 'info', texto: '<strong>"O Realtime parou de funcionar"</strong><br>Faça logout e login novamente. A sessão precisa ser renovada pra reconectar os canais.' },
          { tipo: 'destaque', tipo_destaque: 'info', texto: '<strong>"Esqueci qual etapa o lead estava"</strong><br>Use a busca global (barra no topo) pelo nome ou código. Ela também traz leads arquivados se necessário.' },
        ]
      },
      {
        id: 'pedir-ajuda',
        titulo: 'Como pedir ajuda',
        corpo: [
          { tipo: 'paragrafo', texto: 'Se você encontrou um bug ou tem uma dúvida que não achou aqui:' },
          { tipo: 'passos', passos: [
            { titulo: 'Reproduza o problema',    texto: 'Anote os passos exatos que levaram ao erro.' },
            { titulo: 'Tire um print',           texto: 'Captura da tela mostrando o problema.' },
            { titulo: 'Abra o Console do navegador (F12) e veja se tem erro em vermelho', texto: 'Se tiver, tira print também.' },
            { titulo: 'Fale com o gerente',      texto: 'Ele centraliza os pedidos com o desenvolvedor.' },
          ]},
          { tipo: 'destaque', tipo_destaque: 'dica', texto: 'Quanto mais detalhado o report, mais rápido o desenvolvedor corrige. "Tá dando erro" não ajuda; "Ao clicar em Transferir apareceu uma mensagem X e o console mostrou Y" resolve rápido.' },
        ]
      },
    ]
  },

];


/* ============================================================
   WikiModule — Módulo principal
   ============================================================ */
class WikiModule {

  static _secaoAtiva     = null;
  static _subsecaoAtiva  = null;
  static _termoBusca     = '';
  static _iniciado       = false;

  /* ────────────────────────────────────────────────────
     inicializar — chamada uma vez no boot da aplicação.
     Registra listeners globais e prepara estado.
     ──────────────────────────────────────────────────── */
  static inicializar() {
    if (WikiModule._iniciado) return;
    WikiModule._iniciado = true;

    /* Primeira seção como default */
    if (WIKI_CONTENT.length > 0) {
      WikiModule._secaoAtiva    = WIKI_CONTENT[0].id;
      WikiModule._subsecaoAtiva = WIKI_CONTENT[0].subsecoes[0]?.id || null;
    }

    /* Listener de busca — debounce pra evitar re-render frenético */
    var timer;
    $(document).on('input', '#wiki-busca-input', function() {
      var val = $(this).val().trim();
      clearTimeout(timer);
      timer = setTimeout(function() {
        WikiModule._termoBusca = val.toLowerCase();
        WikiModule.render();
      }, 200);
    });

    /* Botão limpar busca */
    $(document).on('click', '#wiki-busca-limpar', function() {
      $('#wiki-busca-input').val('');
      WikiModule._termoBusca = '';
      WikiModule.render();
    });

    /* Delegação: clique em item de sumário */
    $(document).on('click', '[data-wiki-secao]', function(e) {
      e.preventDefault();
      var secao    = $(this).attr('data-wiki-secao');
      var subsecao = $(this).attr('data-wiki-subsecao') || null;
      WikiModule.abrirSecao(secao, subsecao);
    });

    /* Delegação: toggle de seção no sumário */
    $(document).on('click', '.wiki-toc-secao-header', function() {
      $(this).parent().toggleClass('wiki-toc-expandida');
    });

    SLog.info('WikiModule inicializado.');
  }

  /* ────────────────────────────────────────────────────
     render — desenha a tela completa da wiki.
     Chamada ao entrar na página e após qualquer mudança
     de estado (seção ativa, busca).
     ──────────────────────────────────────────────────── */
  static render() {
    var $page = $('#page-wiki');
    if (!$page.length) {
      SLog.warn('WikiModule.render: #page-wiki não existe no HTML');
      return;
    }

    $page.html(
      '<div class="wiki-layout">' +
        WikiModule._renderHeader() +
        '<div class="wiki-container">' +
          WikiModule._renderSumario() +
          WikiModule._renderConteudo() +
        '</div>' +
      '</div>'
    );

    /* v1.2 — garante o overlay + CSS do lightbox prontos (idempotente),
       para que o cursor "zoom-in" e o ícone de lupa já apareçam nas
       imagens desde o primeiro render. */
    WikiModule._garantirLightbox();
  }

  /* ────────────────────────────────────────────────────
     abrirSecao — navega para uma seção/subseção
     específica. Limpa a busca se estiver ativa.
     ──────────────────────────────────────────────────── */
  static abrirSecao(secaoId, subsecaoId) {
    var secao = WIKI_CONTENT.find(function(s) { return s.id === secaoId; });
    if (!secao) return;

    WikiModule._secaoAtiva = secaoId;
    WikiModule._subsecaoAtiva = subsecaoId || secao.subsecoes[0]?.id || null;
    WikiModule._termoBusca = '';
    $('#wiki-busca-input').val('');
    WikiModule.render();

    /* Scroll pro topo do painel de conteúdo */
    setTimeout(function() {
      var el = document.querySelector('.wiki-conteudo');
      if (el) el.scrollTop = 0;
    }, 50);
  }

  /* ────────────────────────────────────────────────────
     _renderHeader — barra superior com título + busca.
     ──────────────────────────────────────────────────── */
  static _renderHeader() {
    var temBusca = WikiModule._termoBusca && WikiModule._termoBusca.length > 0;
    return (
      '<div class="wiki-header">' +
        '<div class="wiki-header-titulo">' +
          '<i class="bi bi-journal-bookmark-fill"></i> ' +
          '<span>Central de Conhecimento</span>' +
        '</div>' +
        '<div class="wiki-header-busca">' +
          '<i class="bi bi-search wiki-busca-icone"></i>' +
          '<input type="text" id="wiki-busca-input" class="wiki-busca-input" ' +
                 'placeholder="Buscar na wiki..." value="' + WikiModule._escHtml(WikiModule._termoBusca) + '">' +
          (temBusca
            ? '<button class="wiki-busca-limpar" id="wiki-busca-limpar" title="Limpar busca">' +
              '<i class="bi bi-x-lg"></i></button>'
            : '') +
        '</div>' +
      '</div>'
    );
  }

  /* ────────────────────────────────────────────────────
     _renderSumario — árvore lateral.
     ──────────────────────────────────────────────────── */
  static _renderSumario() {
    var html = '<aside class="wiki-sumario"><nav class="wiki-toc">';

    WIKI_CONTENT.forEach(function(secao) {
      var isAtiva = secao.id === WikiModule._secaoAtiva;
      var classe = 'wiki-toc-secao' + (isAtiva ? ' wiki-toc-expandida wiki-toc-ativa' : '');

      html += '<div class="' + classe + '">' +
              '<button class="wiki-toc-secao-header">' +
              '  <i class="bi ' + secao.icone + '"></i>' +
              '  <span class="wiki-toc-secao-titulo">' + WikiModule._escHtml(secao.titulo) + '</span>' +
              '  <i class="bi bi-chevron-down wiki-toc-caret"></i>' +
              '</button>' +
              '<ul class="wiki-toc-subsecoes">';

      secao.subsecoes.forEach(function(sub) {
        var isSubAtiva = isAtiva && sub.id === WikiModule._subsecaoAtiva;
        var classeSub = 'wiki-toc-subitem' + (isSubAtiva ? ' wiki-toc-subativa' : '');
        html += '<li>' +
                '<a href="#" class="' + classeSub + '" ' +
                'data-wiki-secao="' + secao.id + '" ' +
                'data-wiki-subsecao="' + sub.id + '">' +
                WikiModule._escHtml(sub.titulo) +
                '</a></li>';
      });

      html += '</ul></div>';
    });

    html += '</nav></aside>';
    return html;
  }

  /* ────────────────────────────────────────────────────
     _renderConteudo — painel direito.
     Modo busca ativa: mostra resultados combinados.
     Modo normal: mostra a subseção selecionada.
     ──────────────────────────────────────────────────── */
  static _renderConteudo() {
    var html = '<section class="wiki-conteudo">';

    if (WikiModule._termoBusca && WikiModule._termoBusca.length > 0) {
      html += WikiModule._renderResultadosBusca();
    } else {
      html += WikiModule._renderSubsecao();
    }

    html += '</section>';
    return html;
  }

  /* ────────────────────────────────────────────────────
     _renderSubsecao — corpo da subseção atual.
     ──────────────────────────────────────────────────── */
  static _renderSubsecao() {
    var secao = WIKI_CONTENT.find(function(s) { return s.id === WikiModule._secaoAtiva; });
    if (!secao) return '<p class="text-muted">Selecione uma seção no menu.</p>';

    var sub = secao.subsecoes.find(function(s) { return s.id === WikiModule._subsecaoAtiva; })
           || secao.subsecoes[0];
    if (!sub) return '<p class="text-muted">Sem conteúdo disponível.</p>';

    var html = '<div class="wiki-breadcrumb">' +
               '  <i class="bi ' + secao.icone + '"></i> ' +
               '  <span>' + WikiModule._escHtml(secao.titulo) + '</span>' +
               '  <i class="bi bi-chevron-right"></i>' +
               '  <span>' + WikiModule._escHtml(sub.titulo) + '</span>' +
               '</div>';

    html += '<h1 class="wiki-titulo">' + WikiModule._escHtml(sub.titulo) + '</h1>';

    (sub.corpo || []).forEach(function(bloco) {
      html += WikiModule._renderBloco(bloco);
    });

    /* Navegação entre subseções */
    html += WikiModule._renderNavegacaoRodape(secao, sub);

    return html;
  }

  /* ────────────────────────────────────────────────────
     _renderBloco — despacha por tipo.
     ──────────────────────────────────────────────────── */
  static _renderBloco(bloco) {
    switch (bloco.tipo) {
      case 'paragrafo': return '<p class="wiki-p">' + bloco.texto + '</p>';
      case 'lista':     return WikiModule._renderLista(bloco);
      case 'passos':    return WikiModule._renderPassos(bloco);
      case 'imagem':    return WikiModule._renderImagem(bloco);
      case 'video':     return WikiModule._renderVideo(bloco);
      case 'destaque':  return WikiModule._renderDestaque(bloco);
      case 'tabela':    return WikiModule._renderTabela(bloco);
      default:          return '';
    }
  }

  static _renderLista(bloco) {
    var html = '<ul class="wiki-lista">';
    (bloco.itens || []).forEach(function(item) {
      html += '<li>' + item + '</li>';
    });
    return html + '</ul>';
  }

  static _renderPassos(bloco) {
    var html = '<ol class="wiki-passos">';
    (bloco.passos || []).forEach(function(p, i) {
      html += '<li class="wiki-passo">' +
              '  <span class="wiki-passo-num">' + (i + 1) + '</span>' +
              '  <div class="wiki-passo-body">' +
              '    <strong class="wiki-passo-titulo">' + WikiModule._escHtml(p.titulo) + '</strong>' +
              '    <span class="wiki-passo-texto">' + p.texto + '</span>' +
              '  </div>' +
              '</li>';
    });
    return html + '</ol>';
  }

  static _renderImagem(bloco) {
    var arquivo = bloco.arquivo || '';
    var legenda = bloco.legenda || '';
    var src = '/assets/' + arquivo;
    var srcEsc = WikiModule._escHtml(src);
    return (
      '<figure class="wiki-media">' +
      '  <div class="wiki-media-wrap wiki-media-imagem" ' +
             'data-fullsrc="' + srcEsc + '" ' +
             'onclick="WikiModule.abrirLightbox(this)" ' +
             'title="Clique para ampliar" ' +
             'style="background-image:url(\'' + src + '\');">' +
      '    <div class="wiki-placeholder">' +
      '      <i class="bi bi-image"></i>' +
      '      <span class="wiki-placeholder-nome">' + WikiModule._escHtml(arquivo) + '</span>' +
      '      <span class="wiki-placeholder-hint">Imagem — coloque em <code>/assets/</code></span>' +
      '    </div>' +
      '    <span class="wiki-zoom-hint"><i class="bi bi-zoom-in"></i></span>' +
      '  </div>' +
      (legenda ? '<figcaption class="wiki-media-legenda">' + WikiModule._escHtml(legenda) + '</figcaption>' : '') +
      '</figure>'
    );
  }

  static _renderVideo(bloco) {
    var arquivo = bloco.arquivo || '';
    var legenda = bloco.legenda || '';
    var src = '/assets/' + arquivo;
    /* v1.3 — capa opcional: informe bloco.poster (nome do arquivo em
       /assets/) para exibir um quadro de capa antes do play. */
    var posterAttr = bloco.poster
      ? ' poster="' + WikiModule._escHtml('/assets/' + bloco.poster) + '"'
      : '';
    return (
      '<figure class="wiki-media">' +
      '  <div class="wiki-media-wrap wiki-media-video">' +
      '    <video controls preload="metadata"' + posterAttr + ' class="wiki-video">' +
      '      <source src="' + src + '" type="video/mp4">' +
      '      Seu navegador não consegue exibir este vídeo.' +
      '    </video>' +
      '    <div class="wiki-placeholder">' +
      '      <i class="bi bi-play-circle"></i>' +
      '      <span class="wiki-placeholder-nome">' + WikiModule._escHtml(arquivo) + '</span>' +
      '      <span class="wiki-placeholder-hint">Vídeo — coloque em <code>/assets/</code></span>' +
      '    </div>' +
      '  </div>' +
      (legenda ? '<figcaption class="wiki-media-legenda">' + WikiModule._escHtml(legenda) + '</figcaption>' : '') +
      '</figure>'
    );
  }

  /* ============================================================
     v1.2 — LIGHTBOX (modo de visualização de imagem)
     ============================================================
     Clicar numa imagem da wiki abre ela ampliada em tela cheia.
     Autocontido: injeta CSS + overlay uma única vez no <body>.
     Fecha por clique no fundo, botão × ou Esc. */
  static abrirLightbox(el) {
    if (!el) return;
    var src = el.getAttribute('data-fullsrc');
    if (!src) return;

    /* Só abre se a imagem existir de fato — evita lightbox vazio em
       placeholders de arquivos ainda não enviados para /assets/. */
    var probe = new Image();
    probe.onload = function() { WikiModule._mostrarLightbox(src); };
    probe.onerror = function() {
      if (typeof Toast !== 'undefined') {
        Toast.show('Essa imagem ainda não foi enviada para /assets/.', 'info');
      }
    };
    probe.src = src;
  }

  static _garantirLightbox() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('wiki-lightbox')) return;

    var style = document.createElement('style');
    style.id = 'wiki-lightbox-style';
    style.textContent =
      '.wiki-media-imagem{cursor:zoom-in;}' +
      /* v1.3 — vídeo na frente do placeholder (senão o placeholder
         tampa o player mesmo com o arquivo presente); vídeo inteiro,
         sem esticar. Seletor mais específico p/ vencer o CSS base. */
      '.wiki-media-wrap.wiki-media-video video{position:relative;z-index:1;object-fit:contain;}' +
      '.wiki-zoom-hint{position:absolute;top:10px;right:10px;z-index:2;width:30px;height:30px;' +
      'border-radius:8px;background:rgba(15,23,42,.55);color:#fff;display:flex;align-items:center;' +
      'justify-content:center;font-size:15px;opacity:0;transition:opacity .15s;pointer-events:none;}' +
      '.wiki-media-imagem:hover .wiki-zoom-hint{opacity:1;}' +
      '#wiki-lightbox{position:fixed;inset:0;z-index:2147483000;display:none;' +
      'align-items:center;justify-content:center;background:rgba(15,23,42,.88);' +
      'opacity:0;transition:opacity .18s ease;cursor:zoom-out;padding:24px;}' +
      '#wiki-lightbox.aberto{display:flex;opacity:1;}' +
      '#wiki-lightbox img{max-width:94vw;max-height:90vh;border-radius:10px;' +
      'box-shadow:0 20px 60px rgba(0,0,0,.5);cursor:default;background:#fff;}' +
      '#wiki-lightbox .wiki-lightbox-close{position:absolute;top:18px;right:22px;' +
      'width:42px;height:42px;border:none;border-radius:50%;background:rgba(255,255,255,.14);' +
      'color:#fff;font-size:24px;line-height:1;cursor:pointer;display:flex;align-items:center;' +
      'justify-content:center;transition:background .15s;}' +
      '#wiki-lightbox .wiki-lightbox-close:hover{background:rgba(255,255,255,.28);}';
    document.head.appendChild(style);

    var box = document.createElement('div');
    box.id = 'wiki-lightbox';
    box.innerHTML =
      '<button type="button" class="wiki-lightbox-close" title="Fechar (Esc)">&times;</button>' +
      '<img alt="Visualização ampliada">';
    document.body.appendChild(box);

    /* Fecha ao clicar no fundo (não na própria imagem) ou no ×. */
    box.addEventListener('click', function(ev) {
      if (ev.target === box || (ev.target.classList && ev.target.classList.contains('wiki-lightbox-close'))) {
        WikiModule.fecharLightbox();
      }
    });

    /* Esc fecha (registrado uma única vez, junto com o overlay). */
    document.addEventListener('keydown', function(ev) {
      if (ev.key === 'Escape') WikiModule.fecharLightbox();
    });
  }

  static _mostrarLightbox(src) {
    WikiModule._garantirLightbox();
    var box = document.getElementById('wiki-lightbox');
    if (!box) return;
    var img = box.querySelector('img');
    if (img) img.src = src;
    box.classList.add('aberto');
    document.body.style.overflow = 'hidden';   /* trava o scroll do fundo */
  }

  static fecharLightbox() {
    var box = document.getElementById('wiki-lightbox');
    if (!box) return;
    box.classList.remove('aberto');
    document.body.style.overflow = '';         /* restaura o scroll */
    var img = box.querySelector('img');
    if (img) img.src = '';
  }

  static _renderDestaque(bloco) {
    var tipo = bloco.tipo_destaque || 'info';
    var iconMap = { info: 'bi-info-circle-fill', dica: 'bi-lightbulb-fill', atencao: 'bi-exclamation-triangle-fill' };
    var icone = iconMap[tipo] || 'bi-info-circle-fill';
    return (
      '<div class="wiki-destaque wiki-destaque-' + tipo + '">' +
      '  <i class="bi ' + icone + '"></i>' +
      '  <div class="wiki-destaque-texto">' + bloco.texto + '</div>' +
      '</div>'
    );
  }

  static _renderTabela(bloco) {
    var html = '<div class="wiki-tabela-wrap"><table class="wiki-tabela">';

    if (bloco.cabecalho) {
      html += '<thead><tr>';
      bloco.cabecalho.forEach(function(c) {
        html += '<th>' + c + '</th>';
      });
      html += '</tr></thead>';
    }

    html += '<tbody>';
    (bloco.linhas || []).forEach(function(linha) {
      html += '<tr>';
      linha.forEach(function(c) { html += '<td>' + c + '</td>'; });
      html += '</tr>';
    });
    html += '</tbody></table></div>';

    return html;
  }

  /* ────────────────────────────────────────────────────
     _renderNavegacaoRodape — próximo/anterior.
     ──────────────────────────────────────────────────── */
  static _renderNavegacaoRodape(secao, sub) {
    var idxSub = secao.subsecoes.findIndex(function(s) { return s.id === sub.id; });
    var idxSec = WIKI_CONTENT.findIndex(function(s) { return s.id === secao.id; });

    var anterior = null, proximo = null;

    if (idxSub > 0) {
      anterior = { secao: secao.id, sub: secao.subsecoes[idxSub - 1].id, titulo: secao.subsecoes[idxSub - 1].titulo };
    } else if (idxSec > 0) {
      var secAnt = WIKI_CONTENT[idxSec - 1];
      var subAnt = secAnt.subsecoes[secAnt.subsecoes.length - 1];
      anterior = { secao: secAnt.id, sub: subAnt.id, titulo: subAnt.titulo };
    }

    if (idxSub < secao.subsecoes.length - 1) {
      proximo = { secao: secao.id, sub: secao.subsecoes[idxSub + 1].id, titulo: secao.subsecoes[idxSub + 1].titulo };
    } else if (idxSec < WIKI_CONTENT.length - 1) {
      var secProx = WIKI_CONTENT[idxSec + 1];
      proximo = { secao: secProx.id, sub: secProx.subsecoes[0].id, titulo: secProx.subsecoes[0].titulo };
    }

    var html = '<nav class="wiki-nav-rodape">';
    if (anterior) {
      html += '<a href="#" class="wiki-nav-rodape-item wiki-nav-anterior" ' +
              'data-wiki-secao="' + anterior.secao + '" data-wiki-subsecao="' + anterior.sub + '">' +
              '  <i class="bi bi-arrow-left"></i>' +
              '  <div><span class="wiki-nav-hint">Anterior</span>' +
              '  <strong>' + WikiModule._escHtml(anterior.titulo) + '</strong></div>' +
              '</a>';
    } else {
      html += '<span></span>';
    }
    if (proximo) {
      html += '<a href="#" class="wiki-nav-rodape-item wiki-nav-proximo" ' +
              'data-wiki-secao="' + proximo.secao + '" data-wiki-subsecao="' + proximo.sub + '">' +
              '  <div><span class="wiki-nav-hint">Próximo</span>' +
              '  <strong>' + WikiModule._escHtml(proximo.titulo) + '</strong></div>' +
              '  <i class="bi bi-arrow-right"></i>' +
              '</a>';
    }
    html += '</nav>';
    return html;
  }

  /* ────────────────────────────────────────────────────
     _renderResultadosBusca — procura em títulos e corpo.
     ──────────────────────────────────────────────────── */
  static _renderResultadosBusca() {
    var termo = WikiModule._termoBusca;
    var resultados = [];

    WIKI_CONTENT.forEach(function(secao) {
      secao.subsecoes.forEach(function(sub) {
        var titulo = sub.titulo.toLowerCase();
        var corpoTxt = WikiModule._extrairTextoCorpo(sub.corpo).toLowerCase();
        var pontuacao = 0;
        if (titulo.indexOf(termo) !== -1)   pontuacao += 10;
        if (corpoTxt.indexOf(termo) !== -1) pontuacao += 1;
        if (pontuacao > 0) {
          resultados.push({ secao: secao, sub: sub, pontuacao: pontuacao });
        }
      });
    });

    resultados.sort(function(a, b) { return b.pontuacao - a.pontuacao; });

    if (resultados.length === 0) {
      return (
        '<div class="wiki-busca-vazio">' +
        '  <i class="bi bi-search"></i>' +
        '  <h2>Nenhum resultado para "' + WikiModule._escHtml(termo) + '"</h2>' +
        '  <p>Tente outros termos ou navegue pelo menu à esquerda.</p>' +
        '</div>'
      );
    }

    var html = '<h1 class="wiki-titulo">Resultados para "' + WikiModule._escHtml(termo) + '"</h1>' +
               '<p class="text-muted">' + resultados.length + ' resultado(s) encontrado(s):</p>' +
               '<div class="wiki-busca-resultados">';

    resultados.forEach(function(r) {
      var trecho = WikiModule._extrairTrechoBusca(r.sub.corpo, termo);
      html += '<a href="#" class="wiki-busca-resultado" ' +
              'data-wiki-secao="' + r.secao.id + '" data-wiki-subsecao="' + r.sub.id + '">' +
              '  <div class="wiki-busca-resultado-cabecalho">' +
              '    <i class="bi ' + r.secao.icone + '"></i>' +
              '    <span class="wiki-busca-resultado-caminho">' +
                     WikiModule._escHtml(r.secao.titulo) + ' › ' + WikiModule._escHtml(r.sub.titulo) +
              '    </span>' +
              '  </div>' +
              '  <div class="wiki-busca-resultado-trecho">' + trecho + '</div>' +
              '</a>';
    });

    html += '</div>';
    return html;
  }

  static _extrairTextoCorpo(corpo) {
    if (!corpo || !Array.isArray(corpo)) return '';
    return corpo.map(function(b) {
      if (b.texto)        return b.texto;
      if (b.legenda)      return b.legenda;
      if (b.itens)        return b.itens.join(' ');
      if (b.passos)       return b.passos.map(function(p) { return p.titulo + ' ' + p.texto; }).join(' ');
      if (b.linhas)       return b.linhas.map(function(l) { return l.join(' '); }).join(' ');
      return '';
    }).join(' ').replace(/<[^>]+>/g, ' ');
  }

  static _extrairTrechoBusca(corpo, termo) {
    var texto = WikiModule._extrairTextoCorpo(corpo);
    var idx = texto.toLowerCase().indexOf(termo);
    if (idx === -1) return WikiModule._escHtml(texto.substr(0, 150)) + '...';

    var inicio = Math.max(0, idx - 60);
    var fim    = Math.min(texto.length, idx + termo.length + 60);
    var trecho = (inicio > 0 ? '...' : '') +
                 texto.substring(inicio, fim) +
                 (fim < texto.length ? '...' : '');
    /* Highlight do termo (case-insensitive) */
    var regex = new RegExp('(' + termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return WikiModule._escHtml(trecho).replace(regex, '<mark>$1</mark>');
  }

  /* ────────────────────────────────────────────────────
     _escHtml — escape básico. Reutiliza Utils.escHtml
     se existir, senão implementa localmente.
     ──────────────────────────────────────────────────── */
  static _escHtml(s) {
    if (typeof Utils !== 'undefined' && Utils.escHtml) return Utils.escHtml(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
