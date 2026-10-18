/* ============================================================
   BEYOND CRM — js/utils.js   v2.3
   Helpers de formatação, máscaras, validação temporal e
   marcação visual de campos inválidos.

   Histórico de patches incorporados:
   - Patch UX-1 (jun/2026): máscaras, parseValor, validação visual,
     AmpLoading, validarObrigatorios, validarDataNaoFutura.
   - Hotfix VAL-1 (jun/2026): validarDataNaoPassada.
   - Patch UX-3.1 (jun/2026): gerarLeadId agora produz 5 dígitos.

   Beyond Bits Tecnologia © 2026
   ============================================================ */
'use strict';

const Utils = {

  /* ----------------------------------------------------------
     Escape HTML — usado em strings que vão pro DOM via .html()
     ---------------------------------------------------------- */
  escHtml(str) {
    if (typeof str !== 'string') return str || '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },

  /* ----------------------------------------------------------
     Helpers de data/hora
     ---------------------------------------------------------- */
  getNowLocal() {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset()*60000).toISOString().slice(0,16);
  },
  getTodayDate() { return new Date().toISOString().slice(0,10); },
  getHoraAtual() {
    const n = new Date();
    return n.getHours().toString().padStart(2,'0') + ':' + n.getMinutes().toString().padStart(2,'0');
  },
  getDataAtual() { return new Date().toLocaleDateString('pt-BR').replace('/20','/'); },
  formatDate(s) {
    if (!s) return '';
    try { const d=new Date(s); return d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); }
    catch { return s; }
  },
  formatDateShort(s) {
    if (!s) return '';
    try { return new Date(s).toLocaleDateString('pt-BR'); } catch { return s; }
  },

  /* ----------------------------------------------------------
     formatMoney — mantido por compatibilidade com código legado
     ---------------------------------------------------------- */
  formatMoney(v) {
    if (!v) return '';
    const n = parseFloat(v.toString().replace(/[^0-9.,]/g,'').replace(',','.'));
    return isNaN(n) ? v : 'R$ '+n.toLocaleString('pt-BR',{minimumFractionDigits:2});
  },

  /* ----------------------------------------------------------
     formatarValorBR — formata número para exibição BR
     Aceita number ou string numérica. Retorna "R$ 1.234,56".
     ---------------------------------------------------------- */
  formatarValorBR(n) {
    if (n == null || n === '') return '';
    const v = parseFloat(n);
    if (isNaN(v)) return '';
    return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  /* ----------------------------------------------------------
     parseValor — converte string monetária BR para Number
     Aceita: "R$ 1.234,56", "1234,56", "1234.56", "1234".
     Retorna null se vazio ou inválido.
     ---------------------------------------------------------- */
  parseValor(str) {
    if (str == null || str === '') return null;
    if (typeof str === 'number') return isNaN(str) ? null : str;
    let s = String(str).replace(/[^0-9,.-]/g, '');
    /* Se tem vírgula, é o separador decimal BR — remove pontos (milhar). */
    if (s.indexOf(',') >= 0) {
      s = s.replace(/\./g, '').replace(',', '.');
    }
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  },

  /* ----------------------------------------------------------
     copyTel — copia o número limpo pra área de transferência
     ---------------------------------------------------------- */
  copyTel(tel) {
    const num = (tel || '').replace(/\D/g,'');
    if (navigator.clipboard) navigator.clipboard.writeText(num);
    else {
      const e = document.createElement('textarea');
      e.value = num; document.body.appendChild(e); e.select();
      document.execCommand('copy'); document.body.removeChild(e);
    }
  },

  /* ----------------------------------------------------------
     gerarLeadId — gera o código sequencial do lead.
     Patch UX-3.1 (item 3.3): passa de 4 para 5 dígitos
     (BCR-2026-NNNNN) para suportar o volume operacional
     projetado (centenas a milhares de leads/ano por consultor).
     Códigos antigos (4 dígitos) continuam válidos no banco e
     na UI — esta função só afeta IDs gerados a partir daqui.
     ---------------------------------------------------------- */
  gerarLeadId(n) { return 'BCR-2026-' + n.toString().padStart(5,'0'); },

  calcIdade(dataNasc) {
    if (!dataNasc) return '—';
    const hoje=new Date(), nasc=new Date(dataNasc);
    let idade=hoje.getFullYear()-nasc.getFullYear();
    const m=hoje.getMonth()-nasc.getMonth();
    if (m<0||(m===0&&hoje.getDate()<nasc.getDate())) idade--;
    return idade+' anos';
  },

  /* ============================================================
     Patch UX-1 — máscaras e validação visual
     ============================================================ */

  /* ----------------------------------------------------------
     aplicarMascaraTel — formata um input como (XX) XXXXX-XXXX
     ---------------------------------------------------------- */
  _formatarTel(raw) {
    const v = String(raw || '').replace(/\D/g, '').slice(0, 11);
    if (v.length === 0)      return '';
    if (v.length <= 2)       return '(' + v;
    if (v.length <= 6)       return '(' + v.slice(0,2) + ') ' + v.slice(2);
    if (v.length <= 10)      return '(' + v.slice(0,2) + ') ' + v.slice(2,6) + '-' + v.slice(6);
    return '(' + v.slice(0,2) + ') ' + v.slice(2,7) + '-' + v.slice(7);
  },

  /* ----------------------------------------------------------
     _formatarValorBRDigitando — interpreta input como centavos
     Ex: digitar "12345" → "R$ 123,45"
     ---------------------------------------------------------- */
  _formatarValorBRDigitando(raw) {
    const dig = String(raw || '').replace(/\D/g, '');
    if (!dig) return '';
    const n = parseInt(dig, 10) / 100;
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  /* ----------------------------------------------------------
     inicializarMascaras — registra delegações no document
     para todos os inputs com selectors conhecidos.
     Funciona tanto pra inputs estáticos quanto criados
     dinamicamente (ex: blocos de recomendação).
     ---------------------------------------------------------- */
  inicializarMascaras() {
    /* Telefone */
    const SEL_TEL = '#nl-tel, .mask-tel, input[type="tel"]';
    $(document).off('input.maskTel').on('input.maskTel', SEL_TEL, function() {
      this.value = Utils._formatarTel(this.value);
    });

    /* Valor monetário BR */
    const SEL_VAL = [
      '#nl-fipe', '#nl-mensest',
      '#mld-fipe', '#mld-mensest',
      '#venda-adesao', '#venda-mensalidade', '#venda-rastreador',
      /* Onda 5 (#3.a) — meta de mensalidade também aceita máscara BR.
         Antes era type="number" no HTML; virou type="text" com máscara. */
      '#usr-meta-mensal',
      '.mask-valor', '.rec-valor'
    ].join(', ');
    $(document).off('input.maskVal').on('input.maskVal', SEL_VAL, function() {
      this.value = Utils._formatarValorBRDigitando(this.value);
    });
  },

  /* ----------------------------------------------------------
     reformatarValor — reformata o conteúdo atual de um input.
     Usado quando o input é populado programaticamente
     (ex: _popularModal vindo do banco).
     ---------------------------------------------------------- */
  reformatarValor(selector) {
    $(selector).each(function() {
      const v = $(this).val();
      if (v == null || v === '') return;
      /* Se já parece "R$ 1.234,56", reaplica formatação a partir do número */
      const num = Utils.parseValor(v);
      if (num != null) $(this).val(Utils.formatarValorBR(num));
    });
  },

  /* ----------------------------------------------------------
     reformatarTel — reformata o conteúdo atual de um input tel.
     ---------------------------------------------------------- */
  reformatarTel(selector) {
    $(selector).each(function() {
      const v = $(this).val();
      if (v == null || v === '') return;
      $(this).val(Utils._formatarTel(v));
    });
  },

  /* ----------------------------------------------------------
     validarDataNaoFutura — bloqueia data/hora no futuro
     Mostra Toast vermelho e retorna false se for futura.
     Campos vazios passam (validação de obrigatório é separada).
     ---------------------------------------------------------- */
  validarDataNaoFutura(input, label) {
    const val = $(input).val();
    if (!val) return true;
    const d = new Date(val);
    if (isNaN(d.getTime())) return true;
    if (d.getTime() > Date.now()) {
      Toast.show('Não é possível registrar ' + (label || 'data') + ' em data/hora futura', 'warning');
      Utils.marcarInvalido(input, true);
      return false;
    }
    return true;
  },

  /* ----------------------------------------------------------
     validarDataNaoPassada — bloqueia data/hora no passado
     Espelho de validarDataNaoFutura. Usado em campos que
     representam ações futuras: agendamento de visita etc.
     Tolerância de 1 minuto pro caso "marquei agora mas demorei
     um instante pra clicar em salvar".
     (Hotfix VAL-1)
     ---------------------------------------------------------- */
  validarDataNaoPassada(input, label) {
    const val = $(input).val();
    if (!val) return true;
    const d = new Date(val);
    if (isNaN(d.getTime())) return true;
    /* Tolerância de 60s pra evitar falso-positivo quando o
       usuário escolhe "agora" e leva alguns segundos pra clicar. */
    if (d.getTime() < Date.now() - 60000) {
      Toast.show('Não é possível agendar ' + (label || 'visita') + ' em data/hora passada', 'warning');
      Utils.marcarInvalido(input, true);
      return false;
    }
    return true;
  },

  /* ----------------------------------------------------------
     validarTelefone — verifica se o telefone tem 10 ou 11 dígitos
     (fixo XX XXXX-XXXX ou celular XX XXXXX-XXXX).
     Campos vazios passam (validação de obrigatório é separada).
     Mostra Toast vermelho e marca o campo como inválido se for
     incompleto.
     ---------------------------------------------------------- */
  validarTelefone(input, label) {
    const val = $(input).val();
    if (!val) return true;
    const dig = String(val).replace(/\D/g, '');
    if (dig.length < 10 || dig.length > 11) {
      Toast.show((label || 'Telefone') + ' deve ter 10 ou 11 dígitos (DDD + número)', 'warning');
      Utils.marcarInvalido(input, true);
      return false;
    }
    return true;
  },

  /* ----------------------------------------------------------
     marcarInvalido — adiciona/remove classe .is-invalid
     Auto-remove a marca quando o usuário começa a digitar.
     ---------------------------------------------------------- */
  marcarInvalido(input, invalido) {
    const $i = $(input);
    if (!$i.length) return;
    if (invalido) {
      $i.addClass('is-invalid');
      $i.one('input.clearInvalid change.clearInvalid', function() {
        $(this).removeClass('is-invalid');
      });
    } else {
      $i.removeClass('is-invalid').off('input.clearInvalid change.clearInvalid');
    }
  },

  /* ----------------------------------------------------------
     limparInvalidos — remove .is-invalid de todos os inputs
     dentro de um container. Útil ao reabrir modal.
     ---------------------------------------------------------- */
  limparInvalidos(containerSelector) {
    $(containerSelector + ' .is-invalid').removeClass('is-invalid');
  },

  /* ----------------------------------------------------------
     validarObrigatorios — valida lista de campos obrigatórios
     campos: [{ sel, label }]
     Retorna true se todos preenchidos; senão marca todos os
     vazios em vermelho e mostra Toast com o primeiro.
     ---------------------------------------------------------- */
  validarObrigatorios(campos) {
    let primeiroVazio = null;
    campos.forEach(c => {
      const $i = $(c.sel);
      const v  = ($i.val() || '').toString().trim();
      if (!v) {
        Utils.marcarInvalido(c.sel, true);
        if (!primeiroVazio) primeiroVazio = c;
      } else {
        Utils.marcarInvalido(c.sel, false);
      }
    });
    if (primeiroVazio) {
      Toast.show((primeiroVazio.label || 'Campo') + ' é obrigatório', 'warning');
      $(primeiroVazio.sel).focus();
      return false;
    }
    return true;
  },
};


/* ============================================================
   AmpLoading — overlay global de carregamento

   v2 (Onda 5 pós-testes — Ticket #12): visual redesenhado.
   Antes: card branco pequeno com spinner de 30px.
   Agora: overlay escuro com blur mais forte, spinner de 64px
   centralizado, mensagem em fonte branca abaixo — sem card.
   Estilo "cinema" pra indicar operação de peso ao usuário.

   Uso: AmpLoading.show('Carregando...'); AmpLoading.hide();
   ============================================================ */
const AmpLoading = {
  _ensureDom() {
    if ($('#amp-loading').length) return;
    /* v2 — HTML novo sem .amp-loading-card. Spinner grande
       centralizado + mensagem branca embaixo. */
    const html = ''
      + '<div id="amp-loading" class="amp-loading">'
      +   '<div class="amp-loading-wrap">'
      +     '<div class="amp-spinner-lg"></div>'
      +     '<div class="amp-loading-msg">Carregando...</div>'
      +   '</div>'
      + '</div>';
    $('body').append(html);
  },
  show(msg) {
    this._ensureDom();
    $('#amp-loading .amp-loading-msg').text(msg || 'Carregando...');
    $('#amp-loading').addClass('show');
  },
  hide() {
    $('#amp-loading').removeClass('show');
  },
};

/* ============================================================
   window.baixarLogFalhas — Ticket #31 (Onda 5 pós-testes)
   ============================================================
   Gera arquivo .txt a partir de SLog.exportarFalhas e força
   download. Chamado pelo botão em Configurações (gerente) e
   também disponível como comando de console pro suporte.
   ============================================================ */
window.baixarLogFalhas = function() {
  if (typeof SLog === 'undefined' || !SLog.exportarFalhas) {
    console.error('SLog.exportarFalhas indisponível');
    return;
  }
  var conteudo = SLog.exportarFalhas();
  var timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  var nome = 'beyondcrm-log-falhas-' + timestamp + '.txt';
  var blob = new Blob([conteudo], { type: 'text/plain;charset=utf-8' });
  var url  = URL.createObjectURL(blob);
  var $a = $('<a>').attr({ href: url, download: nome }).css('display', 'none');
  $('body').append($a);
  $a[0].click();
  setTimeout(function() { $a.remove(); URL.revokeObjectURL(url); }, 100);
  if (typeof Toast !== 'undefined') Toast.show('Log de falhas baixado: ' + nome, 'success');
};
