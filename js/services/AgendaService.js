/* ============================================================
   BEYOND CRM — js/services/AgendaService.js   v1.1
   Serviço de Agendamentos — ponte entre Store e Supabase.
   Beyond Bits Tecnologia © 2026

   ESCOPO:
   - Centraliza CRUD da tabela 'agendamentos' do Supabase.
   - Centraliza leitura/escrita do 'agendamento_checklist'.
   - Substitui o INSERT direto que existia no
     store.adicionarAgendamento().

   USO:
   - AgendaService.criar(dados)                       → grava agendamento
   - AgendaService.atualizar(id, dados)               → remarcação (UPDATE)
   - AgendaService.listar(filtros)                    → lista geral
   - AgendaService.ultimoDoLead(leadUuid)             → último ag. do lead
   - AgendaService.porPeriodo(inicio, fim)            → janela temporal
   - AgendaService.porEspecialista(espId)             → filtro por user
   - AgendaService.cancelar(id)                       → muda status
   - AgendaService.marcarRealizado(id)                → muda status

   CHECKLIST DE CONFIRMAÇÃO (DRS 4.2.3):
   - AgendaService.checklistDoAgendamento(agendamentoId)   → itens
   - AgendaService.marcarItemChecklist(itemId, feito)      → toggle
   - Os itens padrão são criados automaticamente pelo
     trigger 'trg_criar_checklist_agendamento' do banco.

   ARQUITETURA:
   - Cumpre Tarefa 4A do board (estrutura backend).
   - A UI persistente do checklist vem na Tarefa 4B.

   HISTÓRICO:
   - v1.0: CRUD inicial (criar/listar/status/checklist).
   - v1.1 (Chamado #88): adicionado o método `atualizar(id, dados)`.
     O store.atualizarAgendamento() (rota de REMARCAÇÃO / reagendamento)
     já chamava AgendaService.atualizar(), mas o método NÃO existia neste
     arquivo — o reagendamento dava "atualizar is not a function" e não
     era gravado no banco. Este método faz o UPDATE parcial na mesma
     linha, no mesmo padrão de criar() (retorna o registro ou null,
     nunca lança). Sem isso, a remarcação só valia em memória e sumia
     no reload.
   ============================================================ */
'use strict';

class AgendaService {

  /* ================================================================
     CRIAR um agendamento
     ================================================================
     Parâmetros (dados):
       lead_id           — UUID do lead (obrigatório)
       especialista_id   — UUID do user (obrigatório)
       filial_id         — UUID da filial (opcional)
       data_hora         — ISO string ou Date (obrigatório)
       local_tipo        — 'interno' | 'externo' | 'online' (obrigatório)
       local_descricao   — string livre
       categoria_veiculo — categoria oficial do veículo (ver nota abaixo)
       obs               — string livre

     NOTA (Chamado #88): categoria_veiculo tem CHECK no banco com as
     6 categorias oficiais (Nacional Particular, Importado/Diesel,
     Nacional Trabalho, Motocicleta, Caminhão, Não sei). Valores fora
     dessa lista fazem o INSERT falhar. Quem chama deve enviar uma
     categoria válida (ou ''), nunca um marcador tipo 'C2'.
     ================================================================ */
  static async criar(dados) {
    if (!supa) {
      SLog.warn('AgendaService.criar: Supabase offline, só local');
      return null;
    }
    if (!dados || !dados.lead_id || !dados.especialista_id) {
      SLog.warn('AgendaService.criar: lead_id ou especialista_id ausente, ignorando');
      return null;
    }

    /* Defaults sanos */
    var insertData = {
      lead_id:           dados.lead_id,
      especialista_id:   dados.especialista_id,
      filial_id:         dados.filial_id || null,
      data_hora:         dados.data_hora || new Date().toISOString(),
      local_tipo:        (dados.local_tipo || 'interno').toLowerCase(),
      local_descricao:   dados.local_descricao || '',
      categoria_veiculo: dados.categoria_veiculo || '',
    };
    if (dados.obs && dados.obs.trim()) insertData.obs = dados.obs.trim();

    /* Patch PERS-1 — data em que o agendamento foi feito (ponto 3.b/3.c).
       Se não vier no payload, o banco aplica o DEFAULT CURRENT_DATE. */
    if (dados.data_realizacao) {
      insertData.data_realizacao = dados.data_realizacao;
    }

    try {
      var res = await supa
        .from('agendamentos')
        .insert(insertData)
        .select()
        .single();

      if (res.error) {
        SLog.error('AgendaService.criar: ' + res.error.message);
        return null;
      }

      SLog.info('AgendaService.criar OK ✓ (id: ' + res.data.id + ')');
      return res.data;
    } catch (err) {
      SLog.error('AgendaService.criar exceção: ' + err.message);
      return null;
    }
  }

  /* ================================================================
     ATUALIZAR um agendamento (Chamado #88) — REMARCAÇÃO
     ================================================================
     UPDATE parcial na MESMA linha (não cria linha nova). Consumido por
     store.atualizarAgendamento() no fluxo de reagendamento.

     Parâmetros:
       id    — UUID do agendamento (obrigatório)
       dados — quaisquer dos campos abaixo (só os presentes são gravados):
                 data_hora, local_tipo, local_descricao,
                 categoria_veiculo, obs, status, data_realizacao

     Retorna o registro atualizado (com data_hora autoritativa do banco)
     ou null em erro — mesmo contrato de criar() (nunca lança). O store
     usa o data_hora retornado pra reconciliar o objeto local.

     NOTA (#88): categoria_veiculo segue o mesmo CHECK do criar() — envie
     uma das 6 categorias oficiais ou ''.
     ================================================================ */
  static async atualizar(id, dados) {
    if (!supa) {
      SLog.warn('AgendaService.atualizar: Supabase offline, só local');
      return null;
    }
    if (!id) {
      SLog.warn('AgendaService.atualizar: id ausente, ignorando');
      return null;
    }

    dados = dados || {};

    /* UPDATE parcial: só monta os campos que vieram no payload, pra
       não sobrescrever colunas não enviadas com valores vazios. */
    var updateData = {};
    if (dados.data_hora !== undefined) {
      updateData.data_hora = dados.data_hora || new Date().toISOString();
    }
    if (dados.local_tipo !== undefined) {
      updateData.local_tipo = (dados.local_tipo || 'interno').toLowerCase();
    }
    if (dados.local_descricao !== undefined) {
      updateData.local_descricao = dados.local_descricao || '';
    }
    if (dados.categoria_veiculo !== undefined) {
      updateData.categoria_veiculo = dados.categoria_veiculo || '';
    }
    if (dados.obs !== undefined) {
      updateData.obs = (dados.obs || '').trim();
    }
    if (dados.status !== undefined) {
      updateData.status = dados.status;
    }
    if (dados.data_realizacao !== undefined) {
      updateData.data_realizacao = dados.data_realizacao;
    }

    if (Object.keys(updateData).length === 0) {
      SLog.warn('AgendaService.atualizar: nenhum campo para atualizar');
      return null;
    }

    try {
      var res = await supa
        .from('agendamentos')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (res.error) {
        SLog.error('AgendaService.atualizar: ' + res.error.message);
        return null;
      }

      SLog.info('AgendaService.atualizar OK ✓ (id: ' + id + ')');
      return res.data;
    } catch (err) {
      SLog.error('AgendaService.atualizar exceção: ' + err.message);
      return null;
    }
  }

  /* ================================================================
     LISTAR agendamentos com filtros opcionais
     ================================================================ */
  static async listar(filtros) {
    if (!supa) return [];
    filtros = filtros || {};

    var query = supa
      .from('agendamentos')
      .select(
        '*, ' +
        'lead:leads!lead_id(id, codigo, nome, tel, etapa), ' +
        'especialista:profiles!especialista_id(id, nome, sigla), ' +
        'filial:filiais(id, nome)'
      )
      .order('data_hora', { ascending: true })
      .limit(filtros.limit || 500);

    if (filtros.especialista_id) query = query.eq('especialista_id', filtros.especialista_id);
    if (filtros.lead_id)         query = query.eq('lead_id', filtros.lead_id);
    if (filtros.filial_id)       query = query.eq('filial_id', filtros.filial_id);
    if (filtros.status)          query = query.eq('status', filtros.status);
    if (filtros.data_inicio)     query = query.gte('data_hora', filtros.data_inicio);
    if (filtros.data_fim)        query = query.lte('data_hora', filtros.data_fim);

    var res = await query;
    if (res.error) {
      SLog.error('AgendaService.listar: ' + res.error.message);
      return [];
    }
    return res.data || [];
  }

  /* ================================================================
     ÚLTIMO agendamento de um lead — útil para abrir a aba
     agendamento já com os dados certos preenchidos.
     ================================================================ */
  static async ultimoDoLead(leadUuid) {
    if (!supa || !leadUuid) return null;

    var res = await supa
      .from('agendamentos')
      .select('*')
      .eq('lead_id', leadUuid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (res.error) {
      SLog.error('AgendaService.ultimoDoLead: ' + res.error.message);
      return null;
    }
    return res.data;
  }

  /* ================================================================
     POR PERÍODO — útil para AgendaModule
     ================================================================ */
  static async porPeriodo(inicio, fim) {
    return await AgendaService.listar({ data_inicio: inicio, data_fim: fim });
  }

  /* ================================================================
     POR ESPECIALISTA
     ================================================================ */
  static async porEspecialista(espId) {
    return await AgendaService.listar({ especialista_id: espId });
  }

  /* ================================================================
     STATUS — cancelar / marcar realizado
     ================================================================ */
  static async cancelar(id) {
    if (!supa || !id) return false;
    var res = await supa.from('agendamentos')
      .update({ status: 'cancelado' })
      .eq('id', id);
    if (res.error) { SLog.error('AgendaService.cancelar: ' + res.error.message); return false; }
    SLog.info('AgendaService.cancelar OK ✓');
    return true;
  }

  static async marcarRealizado(id) {
    if (!supa || !id) return false;
    var res = await supa.from('agendamentos')
      .update({ status: 'realizado' })
      .eq('id', id);
    if (res.error) { SLog.error('AgendaService.marcarRealizado: ' + res.error.message); return false; }
    SLog.info('AgendaService.marcarRealizado OK ✓');
    return true;
  }

  /* ================================================================
     CHECKLIST DE CONFIRMAÇÃO
     ================================================================
     Os itens são criados automaticamente pelo trigger do banco
     ao inserir um agendamento. Este service apenas lê e marca.
     ================================================================ */

  /* Listar itens do checklist de um agendamento (ordem ascendente) */
  static async checklistDoAgendamento(agendamentoId) {
    if (!supa || !agendamentoId) return [];

    var res = await supa
      .from('agendamento_checklist')
      .select('*, feito_por_user:profiles!feito_por(nome, sigla)')
      .eq('agendamento_id', agendamentoId)
      .order('ordem', { ascending: true });

    if (res.error) {
      SLog.error('AgendaService.checklistDoAgendamento: ' + res.error.message);
      return [];
    }
    return res.data || [];
  }

  /* Marcar / desmarcar um item do checklist */
  static async marcarItemChecklist(itemId, feito) {
    if (!supa || !itemId) return null;

    var userId = (AuthService.currentUser && AuthService.currentUser.id) || null;
    var update = {
      feito:     !!feito,
      feito_em:  feito ? new Date().toISOString() : null,
      feito_por: feito ? userId : null,
    };

    var res = await supa
      .from('agendamento_checklist')
      .update(update)
      .eq('id', itemId)
      .select()
      .single();

    if (res.error) {
      SLog.error('AgendaService.marcarItemChecklist: ' + res.error.message);
      return null;
    }

    SLog.info('AgendaService.marcarItemChecklist OK ✓ (' + (feito ? 'feito' : 'desmarcado') + ')');
    return res.data;
  }

  /* Forçar criação dos itens (útil em caso de agendamento sem checklist) */
  static async garantirChecklist(agendamentoId) {
    if (!supa || !agendamentoId) return false;
    var res = await supa.rpc('criar_checklist_agendamento', {
      p_agendamento_id: agendamentoId,
    });
    if (res.error) {
      SLog.error('AgendaService.garantirChecklist: ' + res.error.message);
      return false;
    }
    return true;
  }
}
