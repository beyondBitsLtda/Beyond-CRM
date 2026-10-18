/* ============================================================
   BEYOND CRM — js/modules/AniversariantesModule.js   v1.0
   Feature 5.1 — Aniversariantes do mês (associados na carteira)
   Requisitos: DRS 4.6 (relatório completo, gerente)

   Ações de fidelização por linha:
   - Ligar (link tel:)
   - WhatsApp (https://wa.me/ com mensagem pré-preenchida)
   - Marcar/Desmarcar como parabenizado (persiste em carteira_parabenizacao)

   Beyond Bits Tecnologia © 2026
   ============================================================ */
'use strict';

class AniversariantesModule {

  /* ── Config ─────────────────────────────────────────────── */
  static MESES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  /* Template do WhatsApp (editar aqui pra mudar) */
  static WHATSAPP_TEMPLATE =
    'Feliz aniversário, {PRIMEIRO_NOME}! 🎉 A equipe Beyond te deseja um dia repleto de alegrias e conquistas.';

  /* Cache local de parabenizações (populado por carregarParabenizacoes) */
  static _parabenizacoes = [];  /* [{lead_id, ano, mes, parabenizado_em, parabenizado_por}] */

  /* ================================================================
     CARGA INICIAL
     ================================================================ */
  static async carregarParabenizacoes() {
    if (!supa) {
      SLog.warn('AniversariantesModule: supa não disponível');
      AniversariantesModule._parabenizacoes = [];
      return;
    }
    try {
      const { data, error } = await supa.from('carteira_parabenizacao')
        .select('lead_id, ano, mes, parabenizado_em, parabenizado_por');
      if (error) {
        SLog.error('carregarParabenizacoes: ' + error.message);
        AniversariantesModule._parabenizacoes = [];
        return;
      }
      AniversariantesModule._parabenizacoes = data || [];
      SLog.info('AniversariantesModule: ' + (data || []).length + ' parabenizações carregadas');
    } catch (err) {
      SLog.error('carregarParabenizacoes exception: ' + err.message);
      AniversariantesModule._parabenizacoes = [];
    }
  }

  /* ================================================================
     RENDER PRINCIPAL
     ================================================================ */
  static async renderRelatorio() {
    const $wrap = $('#rel-aniversariantes');
    if (!$wrap.length) return;

    /* Popular selects na primeira vez */
    AniversariantesModule._popularFiltros();

    /* Garantir que temos as parabenizações carregadas */
    if (!AniversariantesModule._parabenizacoes.length) {
      await AniversariantesModule.carregarParabenizacoes();
    }

    /* Filtros ativos */
    const mes  = parseInt($('#rel-aniv-mes').val()  || (new Date().getMonth() + 1), 10);
    const ano  = parseInt($('#rel-aniv-ano').val()  || new Date().getFullYear(), 10);
    const espId  = $('#rel-aniv-esp').val()    || '';
    const filial = $('#rel-aniv-filial').val() || '';
    const ordem  = $('#rel-aniv-ordem').val()  || 'dia';

    /* Calcular */
    const anivs = AniversariantesModule._calcularAniversariantes(mes, ano, espId, filial, ordem);

    /* Contador */
    const parabenizados = anivs.filter(a => a.parabenizado).length;
    const total = anivs.length;

    /* Header: total + contador */
    const $contador = $('#rel-aniv-contador');
    if ($contador.length) {
      const pct = total ? Math.round((parabenizados / total) * 100) : 0;
      $contador.html(`
        <div style="display:flex;align-items:center;gap:16px;">
          <div>
            <strong>${total}</strong> aniversariantes em ${AniversariantesModule.MESES[mes - 1]} de ${ano}
          </div>
          <div style="padding:6px 12px;background:${parabenizados === total && total ? 'var(--d-bgc-d1fae5)' : 'var(--d-bgc-fef3c7)'};color:${parabenizados === total && total ? 'var(--d-txt-065f46)' : 'var(--d-txt-92400e)'};border-radius:14px;font-size:12px;font-weight:600;">
            ${parabenizados} de ${total} parabenizados (${pct}%)
          </div>
        </div>`);
    }

    /* Grid de linhas */
    const $grid = $('#rel-aniv-grid');
    if (!$grid.length) return;

    if (!total) {
      $grid.html(`
        <div style="padding:32px;text-align:center;color:var(--d-txt-6b7280);">
          Nenhum aniversariante encontrado em <strong>${AniversariantesModule.MESES[mes - 1]}/${ano}</strong> com os filtros selecionados.
        </div>`);
      return;
    }

    $grid.html(anivs.map(a => AniversariantesModule._linhaLead(a, mes, ano)).join(''));
  }

  /* ================================================================
     CÁLCULO DA LISTA
     ================================================================ */
  static _calcularAniversariantes(mes, ano, espIdFiltro, filialFiltro, ordem) {
    const hoje = new Date();
    const carteira = (store.leads || []).filter(l =>
      l.etapa === 'carteira' && l.aniversario
    );

    const parabMap = {};  /* lead_id → parabenizacao do (ano, mes) */
    AniversariantesModule._parabenizacoes
      .filter(p => p.ano === ano && p.mes === mes)
      .forEach(p => { parabMap[p.lead_id] = p; });

    const resultado = carteira.map(l => {
      /* Extrai mês/dia do aniversário (formato YYYY-MM-DD) */
      const partes = String(l.aniversario).slice(0, 10).split('-');
      if (partes.length < 3) return null;
      const anivMes = parseInt(partes[1], 10);
      const anivDia = parseInt(partes[2], 10);
      if (anivMes !== mes) return null;

      /* Filtros: especialista + filial (via captador) */
      if (espIdFiltro && l.captador_id !== espIdFiltro) return null;
      if (filialFiltro) {
        const cap = (store.usuarios || []).find(u => (u._id || u.id) === l.captador_id);
        if (!cap || cap.filial !== filialFiltro) return null;
      }

      const cap = (store.usuarios || []).find(u => (u._id || u.id) === l.captador_id);
      const parab = parabMap[l._uuid];

      return {
        _uuid:         l._uuid,
        codigo:        l.codigo || l.id || '',
        nome:          l.nome || '',
        tel:           l.tel || '',
        anivDia,
        anivMes,
        anivStr:       AniversariantesModule._formatarAniversario(anivDia, anivMes),
        captadorSigla: cap ? cap.sigla : '—',
        captadorNome:  cap ? cap.nome  : '—',
        filial:        cap ? cap.filial : '—',
        tempoCasa:     AniversariantesModule._formatarTempoCasa(l.dataVenda, hoje),
        parabenizado:  !!parab,
        parabInfo:     parab || null,
      };
    }).filter(Boolean);

    /* Ordenação */
    if (ordem === 'dia') {
      resultado.sort((a, b) => a.anivDia - b.anivDia);
    } else if (ordem === 'pendentes') {
      resultado.sort((a, b) => {
        if (a.parabenizado !== b.parabenizado) return a.parabenizado ? 1 : -1;
        return a.anivDia - b.anivDia;
      });
    } else if (ordem === 'parabenizados') {
      resultado.sort((a, b) => {
        if (a.parabenizado !== b.parabenizado) return a.parabenizado ? -1 : 1;
        return a.anivDia - b.anivDia;
      });
    }

    return resultado;
  }

  /* ================================================================
     RENDER DE UMA LINHA
     ================================================================ */
  static _linhaLead(a, mes, ano) {
    const iniciais = (a.nome || '').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    const telClean = String(a.tel || '').replace(/\D/g, '');
    const iconParab = a.parabenizado
      ? '<i class="bi bi-check-circle-fill" style="color:var(--d-txt-10a64a);"></i>'
      : '<i class="bi bi-circle" style="color:var(--d-txt-9ca3af);"></i>';
    const btnParabLabel = a.parabenizado ? 'Desmarcar' : 'Marcar parabenizado';
    const btnParabClass = a.parabenizado ? 'btn-secondary-amp' : 'btn-primary-amp';
    const btnParabAction = a.parabenizado
      ? `AniversariantesModule.desmarcarParabenizado('${a._uuid}', ${mes}, ${ano})`
      : `AniversariantesModule.marcarParabenizado('${a._uuid}', ${mes}, ${ano})`;

    const bgLinha = a.parabenizado ? 'rgba(61,220,132,.08)' : 'var(--bg-card)';   /* Beyond: cores do tema escuro */

    /* Verifica se aniversário é hoje */
    const hoje = new Date();
    const ehHoje = hoje.getDate() === a.anivDia && (hoje.getMonth() + 1) === a.anivMes;
    const badgeHoje = ehHoje ? '<span style="background:var(--d-bgc-fee2e2);color:var(--d-txt-991b1b);padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;margin-left:6px;">🎉 HOJE</span>' : '';

    return `
      <div class="aniv-row" style="display:grid;grid-template-columns:44px 1fr auto;gap:12px;align-items:center;padding:12px 14px;background:${bgLinha};border-radius:8px;margin-bottom:8px;border:1px solid var(--d-brd-e5e7eb);">

        <!-- Avatar -->
        <div style="width:44px;height:44px;border-radius:50%;background:var(--d-bgc-eef2ff);color:var(--d-txt-3730a3);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">
          ${Utils.escHtml(iniciais)}
        </div>

        <!-- Info principal -->
        <div>
          <div style="font-weight:600;font-size:14px;color:var(--d-txt-111827);">
            ${iconParab} ${Utils.escHtml(a.nome)} ${badgeHoje}
          </div>
          <div style="font-size:12px;color:var(--d-txt-6b7280);margin-top:2px;">
            🎂 ${a.anivStr} · 📱 ${Utils.escHtml(a.tel)} · 
            <span title="Especialista responsável">${Utils.escHtml(a.captadorSigla)}</span> · 
            <span title="Filial">${Utils.escHtml(a.filial)}</span> · 
            <span title="Tempo de casa">📅 ${a.tempoCasa}</span>
          </div>
        </div>

        <!-- Ações -->
        <div class="aniv-acoes" style="display:flex;gap:6px;flex-wrap:wrap;">
          <a href="tel:${telClean}" class="btn-beyond btn-secondary-amp btn-sm-amp" title="Ligar para ${Utils.escHtml(a.nome)}">
            <i class="bi bi-telephone-fill"></i>
          </a>
          <button class="btn-beyond btn-sm-amp" style="background:var(--d-bgc-25d366);color:var(--d-txt-ffffff);border:none;"
                  onclick="AniversariantesModule.abrirWhatsApp('${telClean}', ${JSON.stringify(a.nome).replace(/"/g,'&quot;')})"
                  title="WhatsApp com mensagem de aniversário">
            <i class="bi bi-whatsapp"></i>
          </button>
          <button class="btn-beyond ${btnParabClass} btn-sm-amp"
                  onclick="${btnParabAction}"
                  title="${btnParabLabel}">
            <i class="bi bi-${a.parabenizado ? 'x-circle' : 'check-circle'}"></i> ${btnParabLabel}
          </button>
        </div>
      </div>`;
  }

  /* ================================================================
     AÇÕES DE FIDELIZAÇÃO
     ================================================================ */
  static async marcarParabenizado(leadUuid, mes, ano) {
    if (!supa) { Toast.show('Supabase indisponível.', 'danger'); return; }
    if (!AuthService.currentProfile) { Toast.show('Sessão inválida.', 'danger'); return; }

    try {
      const { data, error } = await supa.from('carteira_parabenizacao').insert({
        lead_id:          leadUuid,
        ano:              ano,
        mes:              mes,
        parabenizado_por: AuthService.currentProfile.id,
      }).select();

      if (error) {
        SLog.error('marcarParabenizado: ' + error.message);
        Toast.show('Erro ao marcar: ' + error.message, 'danger');
        return;
      }

      /* Atualiza cache local */
      AniversariantesModule._parabenizacoes.push({
        lead_id:          leadUuid,
        ano:              ano,
        mes:              mes,
        parabenizado_em:  (data && data[0]) ? data[0].parabenizado_em : new Date().toISOString(),
        parabenizado_por: AuthService.currentProfile.id,
      });

      Toast.show('Marcado como parabenizado! 🎉', 'success');
      AniversariantesModule.renderRelatorio();
    } catch (err) {
      SLog.error('marcarParabenizado exception: ' + err.message);
      Toast.show('Erro inesperado: ' + err.message, 'danger');
    }
  }

  static async desmarcarParabenizado(leadUuid, mes, ano) {
    if (!supa) { Toast.show('Supabase indisponível.', 'danger'); return; }

    try {
      const { error } = await supa.from('carteira_parabenizacao')
        .delete()
        .eq('lead_id', leadUuid)
        .eq('ano', ano)
        .eq('mes', mes);

      if (error) {
        SLog.error('desmarcarParabenizado: ' + error.message);
        Toast.show('Erro ao desmarcar: ' + error.message, 'danger');
        return;
      }

      /* Atualiza cache local */
      AniversariantesModule._parabenizacoes = AniversariantesModule._parabenizacoes.filter(p =>
        !(p.lead_id === leadUuid && p.ano === ano && p.mes === mes)
      );

      Toast.show('Desmarcado.', 'info');
      AniversariantesModule.renderRelatorio();
    } catch (err) {
      SLog.error('desmarcarParabenizado exception: ' + err.message);
      Toast.show('Erro inesperado: ' + err.message, 'danger');
    }
  }

  static abrirWhatsApp(telClean, nomeCompleto) {
    if (!telClean) { Toast.show('Telefone não informado.', 'warning'); return; }

    /* Adiciona 55 (Brasil) se não vier prefixo internacional */
    const tel = telClean.length >= 12 ? telClean : ('55' + telClean);

    const primeiroNome = String(nomeCompleto || '').trim().split(/\s+/)[0] || 'Associado';
    const msg = AniversariantesModule.WHATSAPP_TEMPLATE.replace('{PRIMEIRO_NOME}', primeiroNome);

    const url = 'https://wa.me/' + tel + '?text=' + encodeURIComponent(msg);
    window.open(url, '_blank');
  }

  /* ================================================================
     UTILIDADES DE FORMATO
     ================================================================ */
  static _formatarAniversario(dia, mes) {
    return String(dia).padStart(2, '0') + ' de ' + AniversariantesModule.MESES[mes - 1];
  }

  static _formatarTempoCasa(dataVenda, hoje) {
    if (!dataVenda) return '—';
    const dt = new Date(String(dataVenda).slice(0, 10) + 'T00:00:00');
    if (isNaN(dt.getTime())) return '—';

    const diffMs = hoje - dt;
    const dias   = Math.floor(diffMs / 86400000);

    if (dias < 0)   return 'futuro';
    if (dias < 30)  return dias + (dias === 1 ? ' dia' : ' dias');
    if (dias < 365) {
      const meses = Math.floor(dias / 30);
      return meses + (meses === 1 ? ' mês' : ' meses');
    }
    const anos  = Math.floor(dias / 365);
    const meses = Math.floor((dias % 365) / 30);
    if (meses === 0) return anos + (anos === 1 ? ' ano' : ' anos');
    return anos + (anos === 1 ? ' ano' : ' anos') + ' e ' + meses + (meses === 1 ? ' mês' : ' meses');
  }

  /* ================================================================
     FILTROS — POPULAR SELECTS
     ================================================================ */
  static _popularFiltros(forcarRepopular) {
    /* Mês */
    const $mes = $('#rel-aniv-mes');
    if ($mes.length && !$mes.data('populado')) {
      const atual = new Date().getMonth() + 1;
      $mes.html(AniversariantesModule.MESES.map((nome, i) =>
        `<option value="${i + 1}" ${(i + 1) === atual ? 'selected' : ''}>${nome}</option>`
      ).join(''));
      $mes.data('populado', true);
    }

    /* Ano — janela de -2 a +1 */
    const $ano = $('#rel-aniv-ano');
    if ($ano.length && !$ano.data('populado')) {
      const atual = new Date().getFullYear();
      let opts = '';
      for (let y = atual - 2; y <= atual + 1; y++) {
        opts += `<option value="${y}" ${y === atual ? 'selected' : ''}>${y}</option>`;
      }
      $ano.html(opts);
      $ano.data('populado', true);
    }

    /* Usuários — Chamado #47 (revisão v2):
       - Convertido de <select> pra dropdown custom (botão + lista)
       - Toggle "Incluir inativos" agora dentro do dropdown, seguindo
         o mesmo padrão do PerformanceEspecialistasModule
       - A seleção é gravada num <input type="hidden" id="rel-aniv-esp">
         pra que o resto do código do módulo (que lê $('#rel-aniv-esp').val())
         continue funcionando sem alterações. */
    const $lista = $('#rel-aniv-esp-lista');
    if ($lista.length && !$lista.data('populado')) {
      AniversariantesModule._popularListaEsp();
      $lista.data('populado', true);

      /* Fecha dropdown ao clicar fora */
      $(document).on('click.relAnivEspDropdown', function(e) {
        const $target = $(e.target);
        if (!$target.closest('#rel-aniv-esp-dropdown').length &&
            !$target.closest('#rel-aniv-esp-btn').length) {
          $('#rel-aniv-esp-dropdown').hide();
        }
      });
    }

    /* Filiais */
    const $fil = $('#rel-aniv-filial');
    if ($fil.length && !$fil.data('populado')) {
      $fil.html('<option value="">Todas as filiais</option>');
      (store.filiais || []).forEach(f => {
        $fil.append('<option value="' + f.nome + '">' + f.nome + '</option>');
      });
      $fil.data('populado', true);
    }
  }

  /* ================================================================
     DROPDOWN CUSTOM DE USUÁRIO (Chamado #47 v2)
     ================================================================
     UI escolhida pra manter o toggle "Incluir inativos" DENTRO do
     dropdown, seguindo o mesmo padrão do PerformanceEspecialistas.
     A seleção é gravada num <input hidden> pra preservar a API antiga
     (o resto do código continua lendo $('#rel-aniv-esp').val()). */

  /* Popula a lista de opções clicáveis. Chamado no boot e sempre que
     o toggle "Incluir inativos" é ligado/desligado.
     Usa data-attributes em vez de passar args no onclick pra evitar
     bugs de escape com aspas em nomes de usuários. */
  static _popularListaEsp() {
    const $lista = $('#rel-aniv-esp-lista');
    if (!$lista.length) return;
    const incluirInativos = $('#rel-aniv-inativos').is(':checked');
    const idSelecionado = $('#rel-aniv-esp').val() || '';
    const LBL_PERFIL = { especialista: 'E', supervisor: 'S', gerente: 'G' };

    const usuarios = (store.usuarios || [])
      .filter(u => ['especialista', 'supervisor', 'gerente'].includes(u.perfil))
      .filter(u => incluirInativos || u.status !== 'inativo')
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    /* Item "Todos os usuários" no topo + lista */
    let html = `
      <div class="rel-aniv-esp-item" data-id="" data-label="Todos os usuários"
           style="padding:6px 10px;cursor:pointer;font-size:13px;${idSelecionado === '' ? 'background:var(--d-bgc-eef2ff);font-weight:600;' : ''}">
        Todos os usuários
      </div>`;
    html += usuarios.map(u => {
      const id = u._id || u.id;
      if (!id) return '';
      const tag = LBL_PERFIL[u.perfil] || '?';
      const inativoBadge = (u.status === 'inativo')
        ? ' <span style="font-size:10px;color:var(--d-txt-9ca3af);">(inativo)</span>'
        : '';
      const marcado = (idSelecionado === id) ? 'background:#EEF2FF;font-weight:600;' : '';
      const labelPlano = '[' + tag + '] ' + (u.nome || '') + (u.status === 'inativo' ? ' (inativo)' : '');
      return `
        <div class="rel-aniv-esp-item"
             data-id="${Utils.escHtml(id)}"
             data-label="${Utils.escHtml(labelPlano)}"
             style="padding:6px 10px;cursor:pointer;font-size:13px;${marcado}">
          <strong>[${tag}]</strong> ${Utils.escHtml(u.nome || '')}${inativoBadge}
        </div>`;
    }).join('');

    $lista.html(html);

    /* Handler delegado — pega id/label direto dos data-attributes.
       .off antes de .on pra evitar handlers duplicados quando a lista é
       repopulada (ao ligar/desligar o toggle "Incluir inativos"). */
    $lista.off('click.selEsp').on('click.selEsp', '.rel-aniv-esp-item', function() {
      const id    = $(this).attr('data-id') || '';
      const label = $(this).attr('data-label') || 'Todos os usuários';
      AniversariantesModule.selecionarEsp(id, label);
    });
  }

  static toggleDropdownEsp() {
    const $dd = $('#rel-aniv-esp-dropdown');
    if ($dd.is(':visible')) $dd.hide();
    else                    $dd.show();
  }

  /* Marca a opção como selecionada, atualiza o label do botão, fecha o
     dropdown e dispara re-render. */
  static selecionarEsp(id, label) {
    $('#rel-aniv-esp').val(id);
    $('#rel-aniv-esp-btn-label').text(label);
    $('#rel-aniv-esp-dropdown').hide();
    AniversariantesModule.renderRelatorio();
  }

  /* ================================================================
     EXPORTAÇÃO EXCEL
     ================================================================ */
  static async exportarExcel() {
    if (typeof ExcelJS === 'undefined') {
      Toast.show('Biblioteca ExcelJS não carregada.', 'danger');
      return;
    }

    const mes = parseInt($('#rel-aniv-mes').val() || (new Date().getMonth() + 1), 10);
    const ano = parseInt($('#rel-aniv-ano').val() || new Date().getFullYear(), 10);
    const espId  = $('#rel-aniv-esp').val()    || '';
    const filial = $('#rel-aniv-filial').val() || '';
    const anivs = AniversariantesModule._calcularAniversariantes(mes, ano, espId, filial, 'dia');

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Beyond CRM';
    wb.created = new Date();

    /* Aba 1: Aniversariantes */
    const ws = wb.addWorksheet('Aniversariantes');
    ws.columns = [
      { header: 'Código',        key: 'codigo',        width: 16 },
      { header: 'Nome',          key: 'nome',          width: 32 },
      { header: 'Aniversário',   key: 'aniv',          width: 20 },
      { header: 'Telefone',      key: 'tel',           width: 18 },
      { header: 'Especialista',  key: 'esp',           width: 28 },
      { header: 'Filial',        key: 'filial',        width: 16 },
      { header: 'Tempo de casa', key: 'tempoCasa',     width: 20 },
      { header: 'Parabenizado?', key: 'parabenizado',  width: 16 },
      { header: 'Data parabéns', key: 'dtParabens',    width: 20 },
    ];
    const header = ws.getRow(1);
    header.font   = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
    header.height = 20;

    anivs.forEach(a => {
      const row = ws.addRow({
        codigo:        a.codigo,
        nome:          a.nome,
        aniv:          a.anivStr,
        tel:           a.tel,
        esp:           a.captadorSigla + ' — ' + a.captadorNome,
        filial:        a.filial,
        tempoCasa:     a.tempoCasa,
        parabenizado:  a.parabenizado ? '✅ Sim' : '⭕ Não',
        dtParabens:    a.parabInfo ? new Date(a.parabInfo.parabenizado_em).toLocaleString('pt-BR') : '',
      });
      if (a.parabenizado) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      }
    });

    /* Aba 2: Informações */
    const wsInfo = wb.addWorksheet('Informações');
    wsInfo.getColumn('A').width = 32;
    wsInfo.getColumn('B').width = 46;
    const parabCount = anivs.filter(a => a.parabenizado).length;
    const infoRows = [
      ['Relatório',                 'Aniversariantes do mês'],
      ['Data de geração',           new Date().toLocaleString('pt-BR')],
      ['Mês/Ano',                   AniversariantesModule.MESES[mes - 1] + '/' + ano],
      ['Total de aniversariantes',  anivs.length],
      ['Parabenizados',             parabCount + ' de ' + anivs.length + ' (' + (anivs.length ? Math.round(parabCount / anivs.length * 100) : 0) + '%)'],
      ['Especialista filtrado',     $('#rel-aniv-esp option:selected').text()],
      ['Filial filtrada',           $('#rel-aniv-filial option:selected').text()],
    ];
    infoRows.forEach(([k, v]) => {
      const r = wsInfo.addRow([k, v]);
      r.getCell(1).font = { bold: true };
    });

    /* Download */
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const nome = 'BeyondCRM_Aniversariantes_' + AniversariantesModule.MESES[mes - 1] + '_' + ano + '.xlsx';

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    Toast.show('Relatório exportado: ' + nome, 'success');
  }
}

/* Expõe global */
if (typeof window !== 'undefined') window.AniversariantesModule = AniversariantesModule;
