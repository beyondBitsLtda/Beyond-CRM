/* ============================================================
   BEYOND CRM — js/components/KanbanCard.js   v2.8
   Componente de card do Kanban.
   Beyond Bits Tecnologia © 2026

   Histórico:
   - v2.8 (VIS-DATE-2 — Chamados de agendamento/remarcação):
     O badge de agendamento passa a consumir a fonte ÚNICA
     `FunilModule._agendamentoVigente(lead)` — o agendamento criado
     mais recentemente (passado OU futuro). Antes, este componente
     tinha lógica própria ("prefere futuro, senão último criado"),
     que podia divergir da ordenação da coluna e do auto-avanço. Com
     a unificação, badge, posição do card na coluna e decisão de
     auto-avanço nunca mais discordam. Mantém um fallback local
     idêntico caso o FunilModule ainda não esteja carregado (não
     ocorre em runtime normal, mas preserva o componente autônomo).
   - v2.0 → v2.5: ver commits anteriores.
   - v2.6 (Pacote 8 pós-homologação — T4):
     Truncamento de texto longo nos cards do Kanban + tooltip.
     Antes, nomes longos, telefones formatados extensos ou nomes
     de fonte grandes estouravam a largura do card (ou quebravam
     linha, dependendo do CSS). Agora:
       • Aplica atributo `title` em nome, tel e fonte com o
         conteúdo completo — o browser mostra o tooltip nativo
         no hover, sem depender de biblioteca.
       • Marca `data-truncable="true"` quando o texto tem chance
         de ser truncado (heurística por tamanho) — o CSS usa
         isso pra cursor: help, indicando que existe conteúdo
         escondido.
       • O truncamento visual em si (text-overflow: ellipsis)
         fica no styles_base.css, entregue no bloco do
         Pacote 8.
   - v2.7 (Onda 4 pós-testes — Ticket #25):
     Badge de criador agora reflete o RESPONSÁVEL ATUAL do lead
     (l.responsavel_nome), não mais o captador original. Após
     uma transferência, o card passa a mostrar as iniciais/cor
     de quem está trabalhando o lead agora — coerente com o
     que a Onda 1 já persistia (responsavel_id) e com a RLS
     ajustada na Onda 3.
     Quando houve transferência (responsavel_id !== captador_id),
     o tooltip destaca ambos: "Responsável: X · Criado por: Y".
     Sem transferência, tooltip mostra apenas o nome (comportamento
     anterior). Relatórios/dashboards continuam usando l.captador
     — serão migrados em onda dedicada.
   ============================================================ */
'use strict';

class KanbanCard {
  constructor(lead, color) {
    this.lead  = lead;
    this.color = color;
  }

  /* ----------------------------------------------------------
     _iniciais — extrai iniciais de um nome completo.
     "Maria Silva"          → "MS"
     "Maria Clara Souza"    → "MS"  (primeiro + último)
     "Maria"                → "MA"  (duas primeiras letras)
     "" / null              → "—"
     ---------------------------------------------------------- */
  static _iniciais(nome) {
    if (!nome || typeof nome !== 'string') return '—';
    var partes = nome.trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '—';
    if (partes.length === 1) {
      var p = partes[0];
      return (p.length >= 2 ? p.substr(0, 2) : p).toUpperCase();
    }
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }

  /* ----------------------------------------------------------
     _corDoNome — escolhe uma cor da paleta a partir do nome.
     Hash simples sobre os char codes → índice da paleta.
     Garante que o mesmo nome sempre tenha a mesma cor.
     ---------------------------------------------------------- */
  static _PALETA_CRIADOR = [
    { bg: '#FEE2E2', fg: '#DC2626' }, /* vermelho */
    { bg: '#FED7AA', fg: '#EA580C' }, /* laranja */
    { bg: '#FEF3C7', fg: '#D97706' }, /* amarelo */
    { bg: '#D1FAE5', fg: '#059669' }, /* verde */
    { bg: '#DBEAFE', fg: '#2563EB' }, /* azul */
    { bg: '#E9D5FF', fg: '#7C3AED' }, /* roxo */
    { bg: '#FCE7F3', fg: '#DB2777' }, /* rosa */
    { bg: '#CFFAFE', fg: '#0891B2' }, /* ciano */
  ];

  static _corDoNome(nome) {
    if (!nome) return { bg: '#F3F4F6', fg: '#6B7280' }; /* cinza neutro */
    var hash = 0;
    for (var i = 0; i < nome.length; i++) {
      hash = (hash * 31 + nome.charCodeAt(i)) & 0xffff;
    }
    return KanbanCard._PALETA_CRIADOR[hash % KanbanCard._PALETA_CRIADOR.length];
  }

  /* ==========================================================
     VIS-DATE-1 — helpers do badge de agendamento
     ========================================================== */

  /* Encontra o agendamento relevante do lead:
     v2.5 (Pacote 1.3) — Semântica atualizada:
       1) Entre os agendamentos FUTUROS do lead, escolhe o mais
          recentemente CRIADO (_created_at DESC). Isso reflete a
          intenção do especialista: quando registra C2 remarcando,
          o novo agendamento supera o antigo, mesmo que a data
          nova seja mais distante que a antiga.
       2) Se não houver agendamento futuro, cai no fallback: o
          último por _created_at (usado pra pintar badge de
          "Atrasado" com base no último compromisso registrado).
     Retorna { data, _created_at, ... } ou null.

     v2.4 — Faz match por _lead_uuid E ag.lead._uuid como fallback.
     Isso cobre agendamentos criados em versões antigas do
     store.adicionarAgendamento, que não populavam _lead_uuid. */
  static _encontrarAgendamento(lead) {
    /* v2.8 (VIS-DATE-2) — fonte única. Delega para o FunilModule para
       que badge, ordenação da coluna Visita e auto-avanço usem
       exatamente o mesmo critério de "agendamento vigente". */
    if (typeof FunilModule !== 'undefined' &&
        typeof FunilModule._agendamentoVigente === 'function') {
      return FunilModule._agendamentoVigente(lead);
    }

    /* Fallback local IDÊNTICO ao _agendamentoVigente — só usado se o
       FunilModule ainda não tiver carregado (edge case; em runtime o
       card só é renderizado depois que ambos os scripts existem). */
    if (!lead || !lead._uuid) return null;
    if (typeof store === 'undefined' || !store.agendamentos) return null;

    var uuid = lead._uuid;
    var candidatos = [];

    for (var i = 0; i < store.agendamentos.length; i++) {
      var ag = store.agendamentos[i];
      if (!ag || !ag.data) continue;

      var uuidAg = ag._lead_uuid || (ag.lead && ag.lead._uuid) || null;
      if (uuidAg !== uuid) continue;

      if (ag._status === 'cancelado' || ag._status === 'realizado') continue;

      candidatos.push(ag);
    }

    if (!candidatos.length) return null;

    candidatos.sort(function(a, b) {
      var ca = a._created_at || '';
      var cb = b._created_at || '';
      if (cb !== ca) return cb.localeCompare(ca);
      return (new Date(b.data).getTime() || 0) - (new Date(a.data).getTime() || 0);
    });

    return candidatos[0];
  }

  /* Determina classe/label do badge conforme proximidade.
     Retorna { cls, label, icon } ou null se não for pra exibir. */
  static _classificarAgendamento(dataIso) {
    if (!dataIso) return null;
    var d = new Date(dataIso);
    if (isNaN(d.getTime())) return null;

    var agora = new Date();
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    var hora = hh + ':' + mm;

    /* Chaves YYYY-MM-DD pra comparar dias ignorando timezone/hora */
    var chaveAg    = d.toISOString().slice(0, 10);
    var chaveHoje  = agora.toISOString().slice(0, 10);

    var amanha = new Date(agora);
    amanha.setDate(amanha.getDate() + 1);
    var chaveAmanha = amanha.toISOString().slice(0, 10);

    /* Passado (dias anteriores OU mesmo dia mas horário já passou) */
    if (d.getTime() < agora.getTime() && chaveAg !== chaveHoje) {
      var diaPassado = String(d.getDate()).padStart(2, '0') + '/' +
                       String(d.getMonth() + 1).padStart(2, '0');
      return {
        cls:   'k-agenda-atrasado',
        label: 'Atrasado ' + diaPassado + ' ' + hora,
        icon:  'bi-exclamation-triangle-fill',
      };
    }

    /* Hoje */
    if (chaveAg === chaveHoje) {
      /* Se o horário já passou mas ainda é hoje, marca como atrasado */
      if (d.getTime() < agora.getTime()) {
        return {
          cls:   'k-agenda-atrasado',
          label: 'Atrasado hoje ' + hora,
          icon:  'bi-exclamation-triangle-fill',
        };
      }
      return {
        cls:   'k-agenda-hoje',
        label: 'Hoje ' + hora,
        icon:  'bi-calendar-event-fill',
      };
    }

    /* Amanhã */
    if (chaveAg === chaveAmanha) {
      return {
        cls:   'k-agenda-amanha',
        label: 'Amanhã ' + hora,
        icon:  'bi-calendar-event',
      };
    }

    /* Outro dia futuro */
    var dia = String(d.getDate()).padStart(2, '0') + '/' +
              String(d.getMonth() + 1).padStart(2, '0');
    return {
      cls:   'k-agenda-futuro',
      label: dia + ' ' + hora,
      icon:  'bi-calendar-event',
    };
  }

  /* Monta o HTML do badge — retorna '' se não aplicável. */
  static _renderAgendaBadge(lead) {
    /* Só faz sentido nas etapas com agendamento associado */
    if (!lead || (lead.etapa !== 'agendamento' && lead.etapa !== 'visita')) {
      return '';
    }
    var ag = KanbanCard._encontrarAgendamento(lead);
    if (!ag) return '';
    var info = KanbanCard._classificarAgendamento(ag.data);
    if (!info) return '';

    var titulo = 'Agendamento em ' + (Utils.formatDate ? Utils.formatDate(ag.data) : ag.data);
    return '<span class="k-card-agenda-badge ' + info.cls + '" title="' + titulo + '">' +
             '<i class="bi ' + info.icon + '"></i> ' + info.label +
           '</span>';
  }

  render() {
    const l = this.lead;
    const tagsHtml = (l.tags || []).map(t => {
      const c = TAG_CONFIG[t] || { cls: '', label: t };
      return `<span class="amp-tag ${c.cls}">${c.label}</span>`;
    }).join('');

    const tentBadge = (l.etapa === 'ligacao' || l.tentativas > 0)
      ? `<span class="tent-badge${l.tentativas >= 25 ? ' tent-warn' : ''}">${l.tentativas}</span>`
      : '';

    /* Badge do criador — iniciais + cor consistente por usuário.
       Onda 4 pós-testes (Ticket #25) — passa a refletir o
       RESPONSÁVEL ATUAL do lead. Quando houve transferência
       (l.responsavel_id !== l.captador_id), o tooltip destaca
       "Responsável: X · Criado por: Y" pra o gerente/supervisor
       ver rapidamente que houve mudança de dono. Se não houve
       transferência, o tooltip mostra só o nome (comportamento
       anterior — evita ruído visual). */
    var nomeResponsavel = l.responsavel_nome || l.captador || '';
    var nomeCriador     = l.captador || '';
    var houveTransfer   = !!(l.responsavel_id && l.captador_id && l.responsavel_id !== l.captador_id);

    const iniciais  = KanbanCard._iniciais(nomeResponsavel);
    const corBadge  = KanbanCard._corDoNome(nomeResponsavel);
    var tituloBg;
    if (!nomeResponsavel) {
      tituloBg = 'Sem responsável';
    } else if (houveTransfer && nomeCriador && nomeCriador !== nomeResponsavel) {
      tituloBg = 'Responsável: ' + Utils.escHtml(nomeResponsavel) +
                 ' · Criado por: ' + Utils.escHtml(nomeCriador);
    } else {
      tituloBg = Utils.escHtml(nomeResponsavel);
    }
    const criadorBadge = `<span class="k-card-creator-badge" title="${tituloBg}" ` +
                         `style="background:${corBadge.bg};color:${corBadge.fg};">` +
                         `${Utils.escHtml(iniciais)}</span>`;

    /* v2.2 — Badge visual de arquivado (RN-21). Aparece quando o toggle
       "ver arquivados" está ativo no funil e o lead está com
       arquivado=true (sem toggle o card nem é renderizado). */
    const arquivadoBadge = (l.arquivado === true)
      ? '<span class="k-card-arquivado-badge" title="Lead arquivado">' +
        '<i class="bi bi-archive-fill"></i> arquivado</span>'
      : '';

    /* v2.3 (VIS-DATE-1) — Badge visual do próximo agendamento.
       Só é renderizado nas etapas 'agendamento' e 'visita'. */
    const agendaBadge = KanbanCard._renderAgendaBadge(l);

    /* v2.2 — Checkbox de seleção múltipla. Fica escondido por CSS
       exceto quando a coluna tem a classe `.k-selection-mode`.
       O input NÃO tem name/id — a seleção é lida pelo FunilModule
       através de `.k-card.k-card-selected` no DOM. */
    const checkboxHtml =
      '<span class="k-card-checkbox" onclick="event.stopPropagation();">' +
        '<i class="bi bi-square k-check-off"></i>' +
        '<i class="bi bi-check-square-fill k-check-on"></i>' +
      '</span>';

    /* Classes extras */
    var classesExtras = '';
    if (l.arquivado === true) classesExtras += ' k-card-arquivado';

    /* v2.6 (T4) — Prepara valores truncáveis:
       nome, telefone e fonte podem estourar a largura do card.
       Marca data-truncable a partir de ~22 caracteres pro nome,
       ~18 pra telefone e ~14 pra fonte (heurística baseada na
       largura padrão do card). O CSS aplica text-overflow: ellipsis
       nesses elementos, e o title HTML nativo dispara o tooltip. */
    var nomeStr  = String(l.nome || '');
    var telStr   = String(l.tel  || '');
    var fonteStr = String(l.fonte || '—');
    var nomeTrunc  = nomeStr.length  > 22 ? 'true' : 'false';
    var telTrunc   = telStr.length   > 18 ? 'true' : 'false';
    var fonteTrunc = fonteStr.length > 14 ? 'true' : 'false';

    /* Data attribute pra o FunilModule identificar em modo seleção */
    var $card = $('<div>')
      .addClass('k-card' + classesExtras)
      .attr('data-lead-id', Utils.escHtml(l.id))
      .attr('data-lead-uuid', l._uuid || '')
      .css('border-left-color', this.color)
      .html(`
        ${checkboxHtml}
        <div class="k-card-head">
          <span class="k-card-id">${Utils.escHtml(l.id)}</span>
          ${tentBadge}
        </div>
        <div class="k-card-nome" data-truncable="${nomeTrunc}" title="${Utils.escHtml(nomeStr)}">${Utils.escHtml(nomeStr)}</div>
        <div class="k-card-tel" data-truncable="${telTrunc}" title="${Utils.escHtml(telStr)}"><i class="bi bi-telephone-fill"></i> ${Utils.escHtml(telStr)}</div>
        ${agendaBadge}
        ${arquivadoBadge}
        ${tagsHtml ? `<div class="k-card-tags">${tagsHtml}</div>` : ''}
        <div class="k-card-foot">
          <span class="k-fonte" data-truncable="${fonteTrunc}" title="${Utils.escHtml(fonteStr)}">${Utils.escHtml(fonteStr)}</span>
          ${criadorBadge}
        </div>
      `);

    /* v2.2 — Click roteia entre "abrir detalhe" e "alternar seleção".
       Se o Kanban estiver em modo seleção (classe no board),
       toca só na seleção; senão abre o modal como sempre. */
    $card.on('click', function(e) {
      /* Ignora clicks vindos do próprio checkbox (têm stopPropagation) */
      var $board = $('#kanban-board');
      if ($board.hasClass('k-selection-mode')) {
        $card.toggleClass('k-card-selected');
        /* Notifica o FunilModule sobre a mudança pra atualizar a barra
           de ações de lote. Se FunilModule ainda não existir ou não
           tiver o método, cai silenciosamente. */
        if (typeof FunilModule !== 'undefined' &&
            typeof FunilModule.onSelecaoAlterada === 'function') {
          FunilModule.onSelecaoAlterada();
        }
        return;
      }
      /* Modo normal — abre detalhe */
      FunilModule.abrirDetalhe(l.id);
    });

    return $card;
  }
}
