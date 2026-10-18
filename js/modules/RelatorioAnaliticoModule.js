/* ============================================================
   BEYOND CRM — js/modules/RelatorioAnaliticoModule.js   v1.0
   Chamado #100 (reaberto) — Relatório Analítico (gerente-only)

   Objetivo: o cliente (gerente) estranhou o "Leads" do dashboard
   não bater com o total do Processo de Vendas para duas especialistas.
   Investigamos e a causa é uma diferença de DEFINIÇÃO entre as duas
   telas (não é bug de dado):

     - "Leads" do Número Mágico (dashboard) conta CLIENTES DISTINTOS:
       usa o RESPONSÁVEL ATUAL (responsavel_id) e EXCLUI lead-filho
       (o duplicado criado quando o cliente compra um 2º veículo).

     - Processo de Vendas (kanban) mostra UM CARD POR PROCESSO DE
       VENDA: usa responsavel_id (ou captador_id se ainda não
       atribuído) e INCLUI lead-filho — cada veículo tem seu card.

   Este relatório existe pra deixar essa conta TRANSPARENTE: mostra,
   especialista por especialista, os dois números lado a lado, o que
   explica a diferença (veículos adicionais, arquivados) e sinaliza
   ⚠️ quando a diferença NÃO é explicada só por isso — nesse caso é
   sinal de bug de verdade, não de definição.

   Visível SÓ pra gerente (mesmo padrão de
   TaxaConversaoModule._prepararConfigMetas).

   Beyond Bits Tecnologia © 2026
   ============================================================ */
'use strict';

class RelatorioAnaliticoModule {

  /* ================================================================
     RENDER PRINCIPAL
     ================================================================ */
  static renderRelatorio() {
    const $wrap = $('#rel-analitico');
    if (!$wrap.length) return;

    const ehGerente = (typeof AuthService !== 'undefined' &&
                        AuthService.currentProfile &&
                        AuthService.currentProfile.perfil === 'gerente');
    if (!ehGerente) { $wrap.hide(); return; }
    $wrap.show();

    RelatorioAnaliticoModule._popularFiltros();

    const filtros = RelatorioAnaliticoModule._lerFiltros();
    const linhas  = RelatorioAnaliticoModule._calcular(filtros);

    /* ── Resumo agregado ── */
    const $resumo = $('#rel-analitico-resumo');
    if ($resumo.length) {
      const totalDash    = linhas.reduce((a, l) => a + l.dashboardLeads, 0);
      const totalKanban   = linhas.reduce((a, l) => a + l.kanbanTotal, 0);
      const totalVeiculos = linhas.reduce((a, l) => a + l.veiculosAdicionais, 0);
      const totalArquiv   = linhas.reduce((a, l) => a + l.arquivadosNoKanban, 0);
      const divergentes   = linhas.filter(l => !l.bate).length;

      $resumo.html(`
        <div class="row g-3">
          <div class="col-md-3 col-6">
            <div style="padding:12px;background:var(--d-bgc-dbeafe);border-radius:8px;text-align:center;border:1px solid var(--d-brd-bfdbfe);">
              <div style="font-size:11px;color:var(--d-txt-1e40af);text-transform:uppercase;letter-spacing:.5px;">Leads (Dashboard)</div>
              <div style="font-weight:800;color:var(--d-txt-1e40af);margin-top:4px;font-size:22px;">${totalDash}</div>
            </div>
          </div>
          <div class="col-md-3 col-6">
            <div style="padding:12px;background:var(--d-bgc-ede9fe);border-radius:8px;text-align:center;border:1px solid var(--d-brd-ddd6fe);">
              <div style="font-size:11px;color:var(--d-txt-5b21b6);text-transform:uppercase;letter-spacing:.5px;">Processo de Vendas</div>
              <div style="font-weight:800;color:var(--d-txt-5b21b6);margin-top:4px;font-size:22px;">${totalKanban}</div>
            </div>
          </div>
          <div class="col-md-3 col-6">
            <div style="padding:12px;background:var(--d-bgc-fef3c7);border-radius:8px;text-align:center;border:1px solid var(--d-brd-fde68a);">
              <div style="font-size:11px;color:var(--d-txt-92400e);text-transform:uppercase;letter-spacing:.5px;">🚗 Veículos adicionais</div>
              <div style="font-weight:800;color:var(--d-txt-92400e);margin-top:4px;font-size:22px;">${totalVeiculos}</div>
              <div style="font-size:10px;color:var(--d-txt-92400e);">explica a diferença acima</div>
            </div>
          </div>
          <div class="col-md-3 col-6">
            <div style="padding:12px;background:${divergentes > 0 ? 'var(--d-bgc-fee2e2)' : 'var(--d-bgc-d1fae5)'};border-radius:8px;text-align:center;border:1px solid ${divergentes > 0 ? 'var(--d-brd-fecaca)' : 'var(--d-brd-a7f3d0)'};">
              <div style="font-size:11px;color:${divergentes > 0 ? 'var(--d-txt-991b1b)' : 'var(--d-txt-065f46)'};text-transform:uppercase;letter-spacing:.5px;">${divergentes > 0 ? '⚠️ Divergências não explicadas' : '✅ Tudo explicado'}</div>
              <div style="font-weight:800;color:${divergentes > 0 ? 'var(--d-txt-991b1b)' : 'var(--d-txt-065f46)'};margin-top:4px;font-size:22px;">${divergentes}</div>
              <div style="font-size:10px;color:${divergentes > 0 ? 'var(--d-txt-991b1b)' : 'var(--d-txt-065f46)'};">${totalArquiv} arquivado(s) incluso(s) no total</div>
            </div>
          </div>
        </div>`);
    }

    /* ── Tabela ── */
    const $tbody = $('#rel-analitico-tbody');
    if (!$tbody.length) return;

    if (!linhas.length) {
      $tbody.html('<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--d-txt-6b7280);">Nenhum usuário encontrado com os filtros selecionados.</td></tr>');
      return;
    }

    $tbody.html(linhas.map(l => RelatorioAnaliticoModule._linhaTabela(l)).join(''));
  }

  /* ================================================================
     CÁLCULO — reproduz, em JS, exatamente as duas fontes de verdade:
       • "Leads" do dashboard  → FunilModule.renderNumeroMagico()
         (responsavel_id, exclui lead-filho, inclui arquivado)
       • Processo de Vendas    → filtro "Usuário responsável" do
         kanban (FunilModule.js ~5398: responsavel_id||captador_id,
         inclui lead-filho e arquivado)
     ================================================================ */
  static _calcular(filtros) {
    const todosLeads = store.leads || [];

    let usuarios = (store.usuarios || [])
      .filter(u => ['especialista', 'supervisor', 'gerente'].includes(u.perfil))
      .filter(u => filtros.incluirInativos || u.status !== 'inativo')
      .filter(u => !filtros.filial || u.filial === filtros.filial);

    const [inicio, fim] = (typeof TaxaConversaoModule !== 'undefined')
      ? TaxaConversaoModule._resolverPeriodo(filtros.periodo, filtros.dtIni, filtros.dtFim)
      : [null, null];

    function dentroPeriodo(l) {
      if (!inicio) return true;
      if (!l._createdAt) return false;
      const d = new Date(l._createdAt);
      if (d < inicio) return false;
      if (fim && d > fim) return false;
      return true;
    }

    const linhas = usuarios.map(function(u) {
      const uid = u._id || u.id;

      /* Igual ao card "Leads" do Número Mágico: só responsavel_id,
         raiz (sem lead-filho), arquivado INCLUSO. */
      const leadsDash = todosLeads.filter(function(l) {
        return l.responsavel_id === uid && !l.lead_pai_id && dentroPeriodo(l);
      });

      /* Igual ao filtro "Usuário responsável" do Processo de Vendas:
         responsavel_id com fallback pra captador_id, TUDO incluso
         (lead-filho e arquivado). */
      const leadsKanban = todosLeads.filter(function(l) {
        return (l.responsavel_id || l.captador_id) === uid && dentroPeriodo(l);
      });

      const veiculosAdicionais = leadsKanban.filter(function(l) { return !!l.lead_pai_id; }).length;
      const arquivadosNoDashboard = leadsDash.filter(function(l) { return !!l.arquivado; }).length;
      const arquivadosNoKanban    = leadsKanban.filter(function(l) { return !!l.arquivado; }).length;

      const dashboardLeads = leadsDash.length;
      const kanbanTotal     = leadsKanban.length;
      const diferenca       = kanbanTotal - dashboardLeads;

      return {
        userId: uid,
        nome: u.nome,
        sigla: u.sigla,
        perfil: u.perfil,
        status: u.status,
        dashboardLeads: dashboardLeads,
        kanbanTotal: kanbanTotal,
        veiculosAdicionais: veiculosAdicionais,
        arquivadosNoDashboard: arquivadosNoDashboard,
        arquivadosNoKanban: arquivadosNoKanban,
        diferenca: diferenca,
        /* "bate" = a diferença entre as duas telas é 100% explicada
           por veículo adicional. Se não bater, é sinal de que sobrou
           alguma outra causa (transferência, RLS, etc.) — merece
           investigar igual fizemos nos casos reportados. */
        bate: diferenca === veiculosAdicionais,
      };
    });

    const ordem = filtros.ordem || 'nome';
    if (ordem === 'diferenca') linhas.sort((a, b) => b.diferenca - a.diferenca);
    else if (ordem === 'kanban') linhas.sort((a, b) => b.kanbanTotal - a.kanbanTotal);
    else linhas.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));

    /* Divergências não explicadas sempre sobem pro topo, pra chamar atenção. */
    linhas.sort((a, b) => (a.bate === b.bate) ? 0 : (a.bate ? 1 : -1));

    return linhas;
  }

  static _perfilBadge(perfil) {
    if (perfil === 'gerente')    return '<span style="display:inline-block;padding:1px 7px;border-radius:8px;font-size:9px;font-weight:700;background:#7C3AED18;color:#7C3AED;text-transform:uppercase;letter-spacing:.03em;margin-left:6px;">Gerente</span>';
    if (perfil === 'supervisor') return '<span style="display:inline-block;padding:1px 7px;border-radius:8px;font-size:9px;font-weight:700;background:#0284C718;color:#0284C7;text-transform:uppercase;letter-spacing:.03em;margin-left:6px;">Supervisor</span>';
    return '';
  }

  static _linhaTabela(l) {
    const inativoBadge = (l.status === 'inativo')
      ? ' <span style="font-size:10px;color:var(--d-txt-9ca3af);">(inativo)</span>'
      : '';
    const statusCel = l.bate
      ? '<span style="color:var(--d-txt-059669);font-weight:700;">✅ Bate</span>'
      : '<span style="color:var(--d-txt-dc2626);font-weight:700;">⚠️ Investigar</span>';
    const rowBg = l.bate ? '' : 'background:var(--d-bgc-fee2e2);';

    return `
      <tr style="${rowBg}">
        <td style="padding:8px 10px;">${Utils.escHtml(l.nome || '')}${RelatorioAnaliticoModule._perfilBadge(l.perfil)}${inativoBadge}</td>
        <td style="padding:8px 10px;text-align:center;font-weight:700;">${l.dashboardLeads}</td>
        <td style="padding:8px 10px;text-align:center;font-weight:700;">${l.kanbanTotal}</td>
        <td style="padding:8px 10px;text-align:center;">${l.diferenca > 0 ? '+' + l.diferenca : l.diferenca}</td>
        <td style="padding:8px 10px;text-align:center;">${l.veiculosAdicionais > 0 ? '🚗 ' + l.veiculosAdicionais : '—'}</td>
        <td style="padding:8px 10px;text-align:center;">${l.arquivadosNoKanban > 0 ? l.arquivadosNoKanban : '—'}</td>
        <td style="padding:8px 10px;text-align:center;">${statusCel}</td>
      </tr>`;
  }

  /* ================================================================
     FILTROS
     ================================================================ */
  static _popularFiltros() {
    const $fil = $('#rel-an-filtro-filial');
    if ($fil.length && !$fil.data('populado')) {
      $fil.html('<option value="">Todas as filiais</option>');
      (store.filiais || []).forEach(f => {
        $fil.append('<option value="' + f.nome + '">' + f.nome + '</option>');
      });
      $fil.data('populado', true);
    }
  }

  static _lerFiltros() {
    return {
      periodo:         $('#rel-an-periodo').val() || 'todos',
      dtIni:            $('#rel-an-dt-inicio').val(),
      dtFim:            $('#rel-an-dt-fim').val(),
      filial:           $('#rel-an-filtro-filial').val() || '',
      incluirInativos:  $('#rel-an-inativos').is(':checked'),
      ordem:            $('#rel-an-ordem').val() || 'nome',
    };
  }

  static onFiltroChange() {
    const periodo = $('#rel-an-periodo').val();
    if (periodo === 'custom') $('#rel-an-custom-wrap').show();
    else                      $('#rel-an-custom-wrap').hide();
    RelatorioAnaliticoModule.renderRelatorio();
  }

  /* ================================================================
     EXPORTAÇÃO EXCEL
     ================================================================ */
  static async exportarExcel() {
    if (typeof ExcelJS === 'undefined') {
      Toast.show('Biblioteca ExcelJS não carregada.', 'danger');
      return;
    }

    const filtros = RelatorioAnaliticoModule._lerFiltros();
    const linhas  = RelatorioAnaliticoModule._calcular(filtros);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Beyond CRM';
    wb.created = new Date();

    const ws = wb.addWorksheet('Analítico — Leads vs Processo');
    ws.columns = [
      { header: 'Usuário',                key: 'nome',     width: 32 },
      { header: 'Perfil',                 key: 'perfil',   width: 14 },
      { header: 'Leads (Dashboard)',      key: 'dash',     width: 18 },
      { header: 'Processo de Vendas',     key: 'kanban',   width: 18 },
      { header: 'Diferença',              key: 'dif',      width: 12 },
      { header: 'Veículos adicionais',    key: 'veic',     width: 18 },
      { header: 'Arquivados (inclusos)',  key: 'arq',      width: 20 },
      { header: 'Status',                 key: 'status',   width: 16 },
    ];
    ws.getRow(1).font   = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
    ws.getRow(1).height = 20;

    linhas.forEach(l => {
      const row = ws.addRow({
        nome:   l.nome,
        perfil: l.perfil,
        dash:   l.dashboardLeads,
        kanban: l.kanbanTotal,
        dif:    l.diferenca,
        veic:   l.veiculosAdicionais,
        arq:    l.arquivadosNoKanban,
        status: l.bate ? 'OK — diferença explicada' : 'INVESTIGAR — diferença não explicada',
      });
      if (!l.bate) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      }
    });

    const wsInfo = wb.addWorksheet('Como ler este relatório');
    wsInfo.getColumn('A').width = 100;
    [
      'Relatório Analítico — Leads (Dashboard) vs Processo de Vendas',
      '',
      '"Leads (Dashboard)" conta CLIENTES DISTINTOS: usa o responsável atual e',
      'exclui o lead-filho (o duplicado criado quando o cliente compra um 2º veículo).',
      '',
      '"Processo de Vendas" mostra um CARD por PROCESSO DE VENDA: usa o responsável',
      'atual (ou o cadastrador, se ainda não atribuído) e INCLUI o lead-filho — cada',
      'veículo adicional aparece como seu próprio card no funil.',
      '',
      'Por isso os dois números podem diferir — e a diferença deve ser igual à',
      'quantidade de "Veículos adicionais" daquele usuário. Quando a linha aparece',
      'marcada como "INVESTIGAR", a diferença NÃO é só isso, e vale olhar caso a caso.',
      '',
      'Gerado em: ' + new Date().toLocaleString('pt-BR'),
    ].forEach(txt => wsInfo.addRow([txt]));

    const buffer = await wb.xlsx.writeBuffer();
    const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const nome   = 'BeyondCRM_Analitico_LeadsVsProcesso_' + new Date().toISOString().slice(0, 10) + '.xlsx';

    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    Toast.show('Relatório exportado: ' + nome, 'success');
  }
}

/* Expõe global (mesmo padrão dos outros Modules) */
if (typeof window !== 'undefined') window.RelatorioAnaliticoModule = RelatorioAnaliticoModule;
