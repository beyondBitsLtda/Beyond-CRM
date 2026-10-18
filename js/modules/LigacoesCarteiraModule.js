/* ================================================================
   LigacoesCarteiraModule — Chamado #46
   ================================================================
   Relatório de ligações da CARTEIRA por especialista:
     • Recomendação   → carteira_interacoes.tipo === 'recomendacao'
     • Cuidar da Base → carteira_interacoes.tipo === 'cuidar_base'
   Fonte: store.carteiraInteracoes (já carregado no boot).

   Filtros: período (rápido/custom), usuário (todos os cargos, com
   toggle inativos, padrão do #47) e filial. Tabela por especialista
   + cards de resumo + exportação Excel.
   ================================================================ */
class LigacoesCarteiraModule {

  static TIPOS = {
    recomendacao: { label: 'Recomendação',  icone: '📞', cor: '#7C3AED' },
    cuidar_base:  { label: 'Cuidar da Base', icone: '🌱', cor: '#059669' },
  };

  /* -------- Filtros -------- */

  static onFiltroChange() {
    const custom = $('#rel-lc-periodo').val() === 'custom';
    $('#rel-lc-custom-wrap').toggle(custom);
    LigacoesCarteiraModule.renderRelatorio();
  }

  /* Resolve [ini, fim] a partir do filtro de período. */
  static _intervalo() {
    const p = $('#rel-lc-periodo').val() || '30';
    const fim = new Date(); fim.setHours(23, 59, 59, 999);
    let ini = new Date(); ini.setHours(0, 0, 0, 0);

    if (p === 'custom') {
      const di = $('#rel-lc-dt-inicio').val();
      const df = $('#rel-lc-dt-fim').val();
      ini = di ? new Date(di + 'T00:00:00') : new Date(0);
      const f = df ? new Date(df + 'T23:59:59') : new Date();
      return { ini, fim: f };
    }
    if (p === 'tudo') return { ini: new Date(0), fim };
    if (p === 'mes') { ini = new Date(fim.getFullYear(), fim.getMonth(), 1); return { ini, fim }; }

    const dias = parseInt(p, 10) || 30;
    ini = new Date(fim.getTime() - dias * 24 * 60 * 60 * 1000);
    ini.setHours(0, 0, 0, 0);
    return { ini, fim };
  }

  static _popularFiltros() {
    /* Dropdown custom de usuário (padrão #47) */
    const $lista = $('#rel-lc-esp-lista');
    if ($lista.length && !$lista.data('populado')) {
      LigacoesCarteiraModule._popularListaEsp();
      $lista.data('populado', true);
      $(document).on('click.relLcEspDropdown', function(e) {
        const $t = $(e.target);
        if (!$t.closest('#rel-lc-esp-dropdown').length && !$t.closest('#rel-lc-esp-btn').length) {
          $('#rel-lc-esp-dropdown').hide();
        }
      });
    }

    /* Filiais */
    const $fil = $('#rel-lc-filial');
    if ($fil.length && !$fil.data('populado')) {
      $fil.html('<option value="">Todas as filiais</option>');
      (store.filiais || []).forEach(f => {
        $fil.append('<option value="' + f.nome + '">' + f.nome + '</option>');
      });
      $fil.data('populado', true);
    }
  }

  static _popularListaEsp() {
    const $lista = $('#rel-lc-esp-lista');
    if (!$lista.length) return;
    const incluirInativos = $('#rel-lc-inativos').is(':checked');
    const idSelecionado = $('#rel-lc-filtro-esp').val() || '';
    const LBL_PERFIL = { especialista: 'E', supervisor: 'S', gerente: 'G' };

    const usuarios = (store.usuarios || [])
      .filter(u => ['especialista', 'supervisor', 'gerente'].includes(u.perfil))
      .filter(u => incluirInativos || u.status !== 'inativo')
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    let html = `
      <div class="rel-lc-esp-item" data-id="" data-label="Todos os usuários"
           style="padding:6px 10px;cursor:pointer;font-size:13px;${idSelecionado === '' ? 'background:var(--d-bgc-eef2ff);font-weight:600;' : ''}">
        Todos os usuários
      </div>`;
    html += usuarios.map(u => {
      const id = u._id || u.id;
      if (!id) return '';
      const tag = LBL_PERFIL[u.perfil] || '?';
      const badge = (u.status === 'inativo') ? ' <span style="font-size:10px;color:var(--d-txt-9ca3af);">(inativo)</span>' : '';
      const marcado = (idSelecionado === id) ? 'background:#EEF2FF;font-weight:600;' : '';
      const labelPlano = '[' + tag + '] ' + (u.nome || '') + (u.status === 'inativo' ? ' (inativo)' : '');
      return `
        <div class="rel-lc-esp-item" data-id="${Utils.escHtml(id)}" data-label="${Utils.escHtml(labelPlano)}"
             style="padding:6px 10px;cursor:pointer;font-size:13px;${marcado}">
          <strong>[${tag}]</strong> ${Utils.escHtml(u.nome || '')}${badge}
        </div>`;
    }).join('');

    $lista.html(html);
    $lista.off('click.selEsp').on('click.selEsp', '.rel-lc-esp-item', function() {
      const id = $(this).attr('data-id') || '';
      const label = $(this).attr('data-label') || 'Todos os usuários';
      LigacoesCarteiraModule.selecionarEsp(id, label);
    });
  }

  static toggleDropdownEsp() {
    const $dd = $('#rel-lc-esp-dropdown');
    if ($dd.is(':visible')) $dd.hide(); else $dd.show();
  }

  static selecionarEsp(id, label) {
    $('#rel-lc-filtro-esp').val(id);
    $('#rel-lc-esp-btn-label').text(label);
    $('#rel-lc-esp-dropdown').hide();
    LigacoesCarteiraModule.renderRelatorio();
  }

  /* -------- Agregação -------- */

  /* Retorna { porEsp: [{id, nome, sigla, filial, recomendacao, cuidar_base, total}],
               totais: {recomendacao, cuidar_base, total, especialistas} }
     Chamado #112 — aceita `interacoesOverride` opcional: quando passado
     (export Excel busca o histórico completo direto do banco), usa esse
     array em vez de store.carteiraInteracoes (que no boot é capado às
     500 interações mais recentes da empresa). Sem o parâmetro, o
     comportamento em tela continua idêntico. */
  static _agregar(interacoesOverride) {
    const { ini, fim } = LigacoesCarteiraModule._intervalo();
    const espFiltro = $('#rel-lc-filtro-esp').val() || '';
    const filialFiltro = $('#rel-lc-filial').val() || '';

    /* mapa esp_id -> usuário (pra nome/sigla/filial) */
    const mapaUser = {};
    (store.usuarios || []).forEach(u => { mapaUser[u._id || u.id] = u; });

    const acc = {};   /* esp_id -> {recomendacao, cuidar_base} */
    (interacoesOverride || store.carteiraInteracoes || []).forEach(c => {
      if (c.tipo !== 'recomendacao' && c.tipo !== 'cuidar_base') return;
      const dt = c.dataHora ? new Date(c.dataHora) : null;
      if (!dt || isNaN(dt.getTime())) return;
      if (dt < ini || dt > fim) return;

      const espId = c._esp_id;
      if (!espId) return;
      if (espFiltro && espId !== espFiltro) return;

      const u = mapaUser[espId];
      if (filialFiltro && (!u || u.filial !== filialFiltro)) return;

      if (!acc[espId]) acc[espId] = { recomendacao: 0, cuidar_base: 0 };
      acc[espId][c.tipo]++;
    });

    const porEsp = Object.keys(acc).map(espId => {
      const u = mapaUser[espId] || {};
      const rec = acc[espId].recomendacao;
      const cb  = acc[espId].cuidar_base;
      return {
        id: espId,
        nome: u.nome || '—',
        sigla: u.sigla || '?',
        filial: u.filial || '—',
        recomendacao: rec,
        cuidar_base: cb,
        total: rec + cb,
      };
    }).sort((a, b) => b.total - a.total);

    const totais = porEsp.reduce((s, e) => {
      s.recomendacao += e.recomendacao;
      s.cuidar_base  += e.cuidar_base;
      s.total        += e.total;
      return s;
    }, { recomendacao: 0, cuidar_base: 0, total: 0 });
    totais.especialistas = porEsp.length;

    return { porEsp, totais, ini, fim };
  }

  /* -------- Render -------- */

  static renderRelatorio() {
    LigacoesCarteiraModule._popularFiltros();
    const { porEsp, totais } = LigacoesCarteiraModule._agregar();

    /* Cards de resumo */
    const card = (lbl, val, cor) => `
      <div style="flex:1;min-width:130px;background:var(--d-bgc-ffffff);border:1px solid var(--d-brd-e5e7eb);border-radius:10px;padding:14px 16px;">
        <div style="font-size:11px;color:var(--d-txt-6b7280);text-transform:uppercase;letter-spacing:.4px;">${lbl}</div>
        <div style="font-size:26px;font-weight:700;color:${cor};line-height:1.1;">${val}</div>
      </div>`;
    $('#rel-lc-resumo').html(`
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin:14px 0;">
        ${card('Recomendações', totais.recomendacao, '#7C3AED')}
        ${card('Cuidar da Base', totais.cuidar_base, '#059669')}
        ${card('Total de ligações', totais.total, BX_COR.accent2)}
        ${card('Especialistas ativos', totais.especialistas, '#2563EB')}
      </div>`);

    /* Tabela por especialista */
    if (!porEsp.length) {
      $('#rel-lc-grid').html('<p class="text-muted small text-center py-4">Nenhuma ligação de carteira no período/filtros selecionados.</p>');
      return;
    }
    const linhas = porEsp.map((e, i) => `
      <tr>
        <td style="text-align:center;color:var(--d-txt-6b7280);">${i + 1}</td>
        <td><strong>${Utils.escHtml(e.nome)}</strong> <span style="font-size:11px;color:var(--d-txt-9ca3af);">${Utils.escHtml(e.sigla)}</span></td>
        <td style="font-size:12px;color:var(--d-txt-6b7280);">${Utils.escHtml(e.filial)}</td>
        <td style="text-align:center;color:var(--d-txt-7c3aed);font-weight:600;">${e.recomendacao}</td>
        <td style="text-align:center;color:var(--d-txt-059669);font-weight:600;">${e.cuidar_base}</td>
        <td style="text-align:center;font-weight:700;">${e.total}</td>
      </tr>`).join('');

    $('#rel-lc-grid').html(`
      <div class="table-wrap">
        <table class="amp-table">
          <thead>
            <tr>
              <th style="width:40px;text-align:center;">#</th>
              <th>Especialista</th>
              <th>Filial</th>
              <th style="text-align:center;">📞 Recomendação</th>
              <th style="text-align:center;">🌱 Cuidar da Base</th>
              <th style="text-align:center;">Total</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>`);
  }

  /* -------- Exportação Excel -------- */

  static async exportarExcel() {
    if (typeof ExcelJS === 'undefined') { Toast.show('Biblioteca ExcelJS não carregada.', 'danger'); return; }

    /* Chamado #112 — busca o histórico completo de interações direto do
       banco (sem o limit(500) do cache de boot), pra que "Período: Tudo"
       realmente traga tudo desde o início da operação. */
    const interacoesCompleto = (typeof SupabaseSync !== 'undefined' && SupabaseSync.buscarCarteiraInteracoesCompleto)
      ? await SupabaseSync.buscarCarteiraInteracoesCompleto()
      : (store.carteiraInteracoes || []);

    const { porEsp, totais, ini, fim } = LigacoesCarteiraModule._agregar(interacoesCompleto);
    if (!porEsp.length) { Toast.show('Nenhuma ligação de carteira no período.', 'warning'); return; }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Ligações da Carteira');
    ws.columns = [
      { header: 'Pos.',           key: 'pos',  width: 6 },
      { header: 'Especialista',   key: 'nome', width: 28 },
      { header: 'Sigla',          key: 'sig',  width: 10 },
      { header: 'Filial',         key: 'fil',  width: 20 },
      { header: 'Recomendação',   key: 'rec',  width: 16 },
      { header: 'Cuidar da Base', key: 'cb',   width: 16 },
      { header: 'Total',          key: 'tot',  width: 12 },
    ];
    /* Cabeçalho estilizado */
    const hr = ws.getRow(1);
    hr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
    hr.alignment = { vertical: 'middle', horizontal: 'center' };

    porEsp.forEach((e, i) => {
      ws.addRow({ pos: i + 1, nome: e.nome, sig: e.sigla, fil: e.filial, rec: e.recomendacao, cb: e.cuidar_base, tot: e.total });
    });
    /* Linha total */
    const tr = ws.addRow({ pos: '', nome: 'TOTAL', sig: '', fil: '', rec: totais.recomendacao, cb: totais.cuidar_base, tot: totais.total });
    tr.font = { bold: true };
    tr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };

    /* Aba de info */
    const wsi = wb.addWorksheet('Informações');
    wsi.columns = [{ header: 'Campo', key: 'k', width: 24 }, { header: 'Valor', key: 'v', width: 40 }];
    wsi.getRow(1).font = { bold: true };
    const fmt = d => d.toLocaleDateString('pt-BR');
    wsi.addRow({ k: 'Relatório', v: 'Ligações da Carteira por Especialista' });
    wsi.addRow({ k: 'Período', v: fmt(ini) + ' até ' + fmt(fim) });
    wsi.addRow({ k: 'Gerado em', v: new Date().toLocaleString('pt-BR') });
    wsi.addRow({ k: 'Total de ligações', v: totais.total });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ligacoes-carteira-' + new Date().toISOString().slice(0, 10) + '.xlsx';
    a.click();
    URL.revokeObjectURL(url);
    Toast.show('Relatório exportado!', 'success');
  }
}

if (typeof window !== 'undefined') window.LigacoesCarteiraModule = LigacoesCarteiraModule;
