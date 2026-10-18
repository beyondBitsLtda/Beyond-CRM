/* ============================================================
   BEYOND CRM — js/constants.js   v3.0  (Supabase)
   Beyond Bits Tecnologia © 2026
   
   LIMPEZA: Todos os dados mock (INITIAL_LEADS, INITIAL_CURRICULOS,
   INITIAL_USUARIOS, INITIAL_ATIVIDADES, AUDIT_LOG) foram removidos.
   Esses dados agora vêm do Supabase via SupabaseSync.
   ============================================================ */
'use strict';

const STAGE_ORDER = ['lead','ligacao','agendamento','visita','venda','carteira'];

const STAGE_CONFIG = {
  lead:        { label: 'Lead',         icon: '🌱', color: BX_COR.etapas.lead, addLabel: '+ Novo Lead' },
  ligacao:     { label: 'Ligação',      icon: '📞', color: BX_COR.etapas.ligacao, addLabel: '+ Registrar' },
  agendamento: { label: 'Agendamento',  icon: '📅', color: BX_COR.etapas.agendamento, addLabel: '+ Agendar'  },
  visita:      { label: 'Visita',       icon: '🏠', color: BX_COR.etapas.visita, addLabel: '+ Visita'   },
  venda:       { label: 'Venda',        icon: '💰', color: BX_COR.etapas.venda, addLabel: '+ Venda'    },
  carteira:    { label: 'Carteira',     icon: '👛', color: BX_COR.etapas.carteira, addLabel: ''            },
};

/* TAG_CONFIG é populado dinamicamente pelo SupabaseSync a partir da tabela tags.
   Mantemos o objeto vazio como fallback para evitar erros antes do sync. */
const TAG_CONFIG = {};

const CURRICULO_STATUS = {
  recebido:   { bg: '#F3F4F6', color: '#6B7280', label: '📥 Recebido'           },
  em_analise: { bg: '#FEF3C7', color: '#D97706', label: '⏳ Em Análise'         },
  entrevista: { bg: '#DBEAFE', color: '#2563EB', label: '📋 Entrevista Agendada' },
  aprovado:   { bg: '#D1FAE5', color: '#059669', label: '✅ Aprovado'            },
  reprovado:  { bg: '#FEE2E2', color: '#DC2626', label: '❌ Reprovado'           },
};

const PERFIL_CONFIG = {
  especialista: { cls: 'badge-especialista', label: 'Especialista' },
  supervisor:   { cls: 'badge-supervisor',   label: 'Supervisor'   },
  gerente:      { cls: 'badge-gerente',      label: 'Gerente'      },
};

const FONTES_LEAD = [
  { value: 'Carteira Própria',            desc: 'Leads provenientes da carteira inativa da empresa'          },
  { value: 'Inativo',                     desc: 'Clientes inativos que podem ser reativados'                 },
  { value: 'Associado Novo Veículo',      desc: 'Associado que adquiriu novo veículo'                        },
  { value: 'Cliente Potencial',           desc: 'Contato identificado como potencial cliente'                 },
  { value: 'Consultor que Saiu',          desc: 'Leads deixados por consultor que saiu da empresa'           },
  { value: 'Recomendação Associado',      desc: 'Indicação feita por associado ativo'                        },
  { value: 'Recomendação Não Associado',  desc: 'Indicação feita por não associado'                          },
  { value: 'Troca de Titularidade',       desc: 'Cliente que trocou a titularidade do veículo'               },
  { value: 'Projeto 150 X',               desc: 'Leads do Projeto 150 linha X'                               },
  { value: 'Projeto 150 Y',               desc: 'Leads do Projeto 150 linha Y'                               },
  { value: 'Internos',                    desc: 'Leads gerados internamente pela equipe'                      },
  { value: 'Site',                        desc: 'Leads captados pelo site da empresa'                        },
  { value: 'Terceiros',                   desc: 'Leads originados de parceiros e terceiros'                   },
  { value: 'Redes Sociais',               desc: 'Captados via Instagram, Facebook, etc.'                     },
  { value: 'Externos',                    desc: 'Prospecção externa em eventos, ruas, etc.'                  },
  { value: 'Reciclagem',                  desc: 'Leads que voltaram ao funil após período sem contato'        },
  { value: 'Minha Carteira',              desc: 'Contatos da carteira pessoal do especialista'               },
];

/* FILIAIS agora vem do Supabase — fallback vazio */
const FILIAIS = [];

const CATEGORIAS_VEICULO = [
  'Nacional Particular','Importado/Diesel','Nacional Trabalho','Motocicleta','Caminhão','Não sei'
];

const RESULTADO_LIGACAO_SEM_CONTATO = ['Não Atendeu','Número Errado','Pediu para Retornar'];
const RESULTADO_LIGACAO_CONTATO     = ['Não Agendou','Agendamento'];

/* ── DADOS MOCK REMOVIDOS ──
   Os arrays abaixo estão vazios. Os dados reais são carregados
   do Supabase pelo SupabaseSync no app.js.
   ============================== */
const INITIAL_LEADS       = [];
const INITIAL_CURRICULOS  = [];
const INITIAL_USUARIOS    = [];
const INITIAL_ATIVIDADES  = [];
const AUDIT_LOG           = [];

/* ============================================================
   NÚMERO MÁGICO — Taxas de conversão do funil (DRS 4.1.1)
   Proporção base: 20-12-4-2-1-3
   Metas por etapa derivadas reversamente de profile.meta_vendas:
     - 60% lead → contato        (20 leads ⇒ 12 contatos)
     - 33% contato → agendamento (12 contatos ⇒ 4 agendamentos)
     - 50% agendamento → visita  (4 agend ⇒ 2 visitas)
     - 50% visita → venda        (2 visitas ⇒ 1 venda)
     - 3 recomendações por venda
   ============================================================ */
const META_CONVERSAO = {
  lead:        20,
  ligacao:     12,
  agendamento: 4,
  visita:      2,
  venda:       1,
  carteira:    3,
};

const AGENDA_DATA = {
  'Seg':{ '08:00':[], '09:00':[], '10:00':[], '11:00':[], '12:00':[], '13:00':[], '14:00':[], '15:00':[], '16:00':[], '17:00':[], '18:00':[], '19:00':[] },
  'Ter':{ '08:00':[], '09:00':[], '10:00':[], '11:00':[], '12:00':[], '13:00':[], '14:00':[], '15:00':[], '16:00':[], '17:00':[], '18:00':[], '19:00':[] },
  'Qua':{ '08:00':[], '09:00':[], '10:00':[], '11:00':[], '12:00':[], '13:00':[], '14:00':[], '15:00':[], '16:00':[], '17:00':[], '18:00':[], '19:00':[] },
  'Qui':{ '08:00':[], '09:00':[], '10:00':[], '11:00':[], '12:00':[], '13:00':[], '14:00':[], '15:00':[], '16:00':[], '17:00':[], '18:00':[], '19:00':[] },
  'Sex':{ '08:00':[], '09:00':[], '10:00':[], '11:00':[], '12:00':[], '13:00':[], '14:00':[], '15:00':[], '16:00':[], '17:00':[], '18:00':[], '19:00':[] },
  'Sáb':{ '08:00':[], '09:00':[], '10:00':[], '11:00':[], '12:00':[], '13:00':[], '14:00':[], '15:00':[], '16:00':[], '17:00':[], '18:00':[], '19:00':[] },
  'Dom':{ '08:00':[], '09:00':[], '10:00':[], '11:00':[], '12:00':[], '13:00':[], '14:00':[], '15:00':[], '16:00':[], '17:00':[], '18:00':[], '19:00':[] },
};
