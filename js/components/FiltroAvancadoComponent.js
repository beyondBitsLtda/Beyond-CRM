/* ============================================================
   BEYOND CRM — js/components/FiltroAvancadoComponent.js   v1.2
   Componente reutilizável de filtros avançados (drawer lateral).
   Beyond Bits Tecnologia © 2026

   Usado por:
   - FunilModule (feature 4.10 do Pacote 2 v1.4.0)
   - DashboardModule (feature 4.11 — próxima release)
   - HistoricoModule (Sprint 6 / Patch 1 v1.5.0)
   - AuditModule (Sprint 7 / 7.5)

   ARQUITETURA:
   - Configuração declarativa: passa um objeto de config no construtor
     descrevendo os campos, e o componente cuida do resto (render,
     estado, persistência, aplicação).
   - Semântica AND entre campos: um lead precisa passar em TODOS os
     filtros ativos pra aparecer.
   - Semântica DENTRO de cada multi-select: OR por padrão (qualquer
     opção marcada bate). Campos podem pedir `permitirAndOr: true`
     no config pra habilitar toggle "Qualquer / Todas" (v1.2).
   - Persistência: localStorage sob a chave definida em storageKey.
     Filtros aplicados sobrevivem a F5 e à volta do usuário no dia seguinte.
   - Rendering: drawer lateral (slide from right), não bloqueia a
     visualização do consumidor. Botão + badge de contagem na toolbar
     do consumidor.

   TIPOS DE CAMPO SUPORTADOS:
   - 'text'           : busca por substring case-insensitive
   - 'multi-select'   : lista de opções, aceita várias marcadas.
                        v1.2: se campo tem permitirAndOr:true, mostra
                        toggle "Qualquer marcada | Todas marcadas" e
                        permite AND. Sem esse toggle → OR (default).
   - 'daterange'      : campo de/até (ambos opcionais)
   - 'faixa-numerica' : min/max + toggle "incluir vazias"
   - 'checkbox'       : (v1.1) toggle simples — filtro sim/não com
                        semântica delegada ao consumidor via getValor
                        ou passaSeMarcado. Usado no Funil pra
                        "Incluir arquivados" (T23).

   USO:
     var filtros = new FiltroAvancadoComponent({
       key:        'funil',
       storageKey: 'beyond-filtros-funil',
       container:  '#filtro-drawer-body',
       onChange:   function() { FunilModule.renderKanban(); },
       campos:     [ ...ver config abaixo... ]
     });
     filtros.montar();
     filtros.abrir();
     filtros.contarAtivos();  // pra atualizar badge
     filtros.filtrar(leads, { agendamentos: [...], visitas: [...] });
     filtros.getValor('incluirArquivados');  // (v1.1) valor atual do campo

   Histórico:
   - v1.0: implementação inicial (Pacote 2 v1.4.0).
   - v1.1 (Pacote 4 pós-homologação — T21, T23):
     • Novo tipo 'checkbox' — pra filtros sim/não como
       "Incluir arquivados" (T23). Semântica declarativa:
       quando marcado, invoca `passaSeMarcado(lead)` do
       consumidor. Quando desmarcado, o campo é ignorado
       (equivalente a "sem filtro").
     • Ajuste no faixa-numerica com toggle "vazias":
       agora zero (0) também é considerado vazio quando
       o toggle está marcado. Resolve T21 — leads salvos
       com mensalidade=0 no banco não eram encontrados
       pelo filtro "incluir vazias".
     • Nova API pública: getValor(campoId) — permite
       ao consumidor consultar o valor atual de qualquer
       filtro (útil pra checkbox que afeta lógica externa).
   - v1.2 (Onda 6 pós-testes — Ticket #14):
     • Multi-select ganha modo AND/OR opcional. Campos que
       declararem `permitirAndOr: true` no config exibem um
       segmented control acima das opções: "Qualquer marcada"
       vs "Todas marcadas". Estado default = 'or' (preserva
       comportamento antigo). Persiste em localStorage junto
       com o resto do filtro sob a chave `<campoId>__modo`.
       Aplicado no filtro de tags do Funil (E2E-17 do plano de
       testes pediu essa opção pra caso de leads com múltiplas
       tags).
   ============================================================ */
'use strict';

class FiltroAvancadoComponent {

  constructor(config) {
    this.config = config || {};
    /* Estado atual dos filtros — { campoId: valor } */
    this.filtros = {};
    /* Restaura estado do localStorage antes de qualquer render */
    this._loadFromStorage();
  }

  /* ============================================================
     PERSISTÊNCIA
     ============================================================ */

  _loadFromStorage() {
    if (!this.config.storageKey) return;
    try {
      var raw = window.localStorage.getItem(this.config.storageKey);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.filtros = parsed;
        }
      }
    } catch (e) {
      SLog.warn('FiltroAvancado: falha ao ler storage — ' + e.message);
    }
  }

  _saveToStorage() {
    if (!this.config.storageKey) return;
    try {
      window.localStorage.setItem(
        this.config.storageKey,
        JSON.stringify(this.filtros)
      );
    } catch (e) {
      SLog.warn('FiltroAvancado: falha ao salvar storage — ' + e.message);
    }
  }

  /* ============================================================
     RENDER — monta a UI no container
     ============================================================ */

  montar() {
    var $c = $(this.config.container);
    if (!$c.length) {
      SLog.warn('FiltroAvancado: container não encontrado — ' + this.config.container);
      return;
    }

    var self = this;
    var html = '';

    (this.config.campos || []).forEach(function(campo) {
      html += self._renderCampo(campo);
    });

    $c.html(html);

    /* Popula valores atuais (restaurados do storage) na UI */
    this._popularUIcomEstado();

    /* Bind de listeners: cada mudança atualiza this.filtros e persiste,
       mas SÓ chama onChange quando o usuário aperta "Aplicar filtros".
       Isso evita flicker de re-render em cada tecla digitada. */
    this._bindListeners();
  }

  _renderCampo(campo) {
    switch (campo.tipo) {
      case 'text':           return this._renderText(campo);
      case 'multi-select':   return this._renderMultiSelect(campo);
      case 'daterange':      return this._renderDateRange(campo);
      case 'faixa-numerica': return this._renderFaixaNumerica(campo);
      case 'checkbox':       return this._renderCheckbox(campo);  /* v1.1 (T23) */
      default:
        SLog.warn('FiltroAvancado: tipo de campo desconhecido — ' + campo.tipo);
        return '';
    }
  }

  _renderText(campo) {
    return (
      '<div class="fa-campo" data-campo="' + campo.id + '" data-tipo="text">' +
        '<label class="fa-label">' + Utils.escHtml(campo.label) + '</label>' +
        '<input type="text" class="form-control form-control-sm fa-input" ' +
               'data-campo-input="' + campo.id + '" ' +
               'placeholder="' + Utils.escHtml(campo.placeholder || '') + '">' +
      '</div>'
    );
  }

  _renderMultiSelect(campo) {
    var opcoes = this._resolverOpcoes(campo);
    /* Onda 6 (#14) — se campo tem permitirAndOr:true, renderiza
       segmented control acima das opções pra escolher o modo. */
    var htmlToggle = '';
    if (campo.permitirAndOr) {
      var modoAtual = this.filtros[campo.id + '__modo'] || 'or';
      htmlToggle =
        '<div class="fa-modo-toggle" data-campo="' + campo.id + '">' +
          '<button type="button" class="fa-modo-opt' + (modoAtual === 'or'  ? ' selected' : '') + '" data-modo="or">' +
            'Qualquer marcada' +
          '</button>' +
          '<button type="button" class="fa-modo-opt' + (modoAtual === 'and' ? ' selected' : '') + '" data-modo="and">' +
            'Todas marcadas' +
          '</button>' +
        '</div>';
    }
    var html =
      '<div class="fa-campo" data-campo="' + campo.id + '" data-tipo="multi-select">' +
        '<label class="fa-label">' + Utils.escHtml(campo.label) + '</label>' +
        htmlToggle +
        '<div class="fa-multi-select">';
    opcoes.forEach(function(opt) {
      html +=
        '<label class="fa-chip">' +
          '<input type="checkbox" data-campo-input="' + campo.id + '" ' +
                 'value="' + Utils.escHtml(opt.val) + '">' +
          '<span>' + Utils.escHtml(opt.label) + '</span>' +
        '</label>';
    });
    if (!opcoes.length) {
      html += '<div class="text-muted small">Nenhuma opção disponível.</div>';
    }
    html += '</div></div>';
    return html;
  }

  _renderDateRange(campo) {
    return (
      '<div class="fa-campo" data-campo="' + campo.id + '" data-tipo="daterange">' +
        '<label class="fa-label">' + Utils.escHtml(campo.label) + '</label>' +
        '<div class="fa-range">' +
          '<input type="date" class="form-control form-control-sm" ' +
                 'data-campo-input="' + campo.id + '" data-parte="de" ' +
                 'title="De"> ' +
          '<span class="fa-range-sep">até</span>' +
          '<input type="date" class="form-control form-control-sm" ' +
                 'data-campo-input="' + campo.id + '" data-parte="ate" ' +
                 'title="Até">' +
        '</div>' +
      '</div>'
    );
  }

  _renderFaixaNumerica(campo) {
    var htmlVazias = '';
    if (campo.vazias) {
      htmlVazias =
        '<label class="fa-chk-vazias mt-1">' +
          '<input type="checkbox" data-campo-input="' + campo.id + '" data-parte="vazias">' +
          '<span>Incluir vazios/sem valor</span>' +
        '</label>';
    }
    return (
      '<div class="fa-campo" data-campo="' + campo.id + '" data-tipo="faixa-numerica">' +
        '<label class="fa-label">' + Utils.escHtml(campo.label) + '</label>' +
        '<div class="fa-range">' +
          '<input type="number" step="0.01" class="form-control form-control-sm" ' +
                 'data-campo-input="' + campo.id + '" data-parte="min" ' +
                 'placeholder="Mínimo"> ' +
          '<span class="fa-range-sep">até</span>' +
          '<input type="number" step="0.01" class="form-control form-control-sm" ' +
                 'data-campo-input="' + campo.id + '" data-parte="max" ' +
                 'placeholder="Máximo">' +
        '</div>' +
        htmlVazias +
      '</div>'
    );
  }

  /* v1.1 (T23) — Checkbox simples: filtro sim/não.
     Quando marcado, o filtro é considerado "ativo" e o consumidor
     define o efeito via passaSeMarcado(lead) ou getValor(campoId).
     Quando desmarcado, é como se o filtro não existisse. */
  _renderCheckbox(campo) {
    return (
      '<div class="fa-campo" data-campo="' + campo.id + '" data-tipo="checkbox">' +
        '<label class="fa-chk-vazias">' +
          '<input type="checkbox" data-campo-input="' + campo.id + '">' +
          '<span>' + Utils.escHtml(campo.label) + '</span>' +
        '</label>' +
        (campo.hint
          ? '<div class="text-muted small mt-1">' + Utils.escHtml(campo.hint) + '</div>'
          : '') +
      '</div>'
    );
  }

  /* ============================================================
     Resolve opções de multi-select (podem vir estáticas ou de função)
     ============================================================ */
  _resolverOpcoes(campo) {
    var raw = campo.opcoes || (campo.opcoesFn ? campo.opcoesFn() : []);
    if (!raw || !raw.length) return [];
    /* Normaliza formato: aceita array de strings OU array de {val, label} */
    return raw.map(function(o) {
      if (typeof o === 'string') return { val: o, label: o };
      return { val: o.val, label: o.label || o.val };
    });
  }

  /* ============================================================
     Preenche a UI com o estado atual (após restaurar do storage)
     ============================================================ */
  _popularUIcomEstado() {
    var self = this;
    var $c = $(this.config.container);

    (this.config.campos || []).forEach(function(campo) {
      var v = self.filtros[campo.id];
      if (v === undefined || v === null) return;

      if (campo.tipo === 'text') {
        $c.find('[data-campo-input="' + campo.id + '"]').val(v);
      } else if (campo.tipo === 'multi-select') {
        var lista = Array.isArray(v) ? v : [];
        $c.find('[data-campo-input="' + campo.id + '"]').each(function() {
          $(this).prop('checked', lista.indexOf($(this).val()) >= 0);
        });
      } else if (campo.tipo === 'daterange') {
        $c.find('[data-campo-input="' + campo.id + '"][data-parte="de"]' ).val(v.de  || '');
        $c.find('[data-campo-input="' + campo.id + '"][data-parte="ate"]').val(v.ate || '');
      } else if (campo.tipo === 'faixa-numerica') {
        $c.find('[data-campo-input="' + campo.id + '"][data-parte="min"]').val(v.min != null ? v.min : '');
        $c.find('[data-campo-input="' + campo.id + '"][data-parte="max"]').val(v.max != null ? v.max : '');
        $c.find('[data-campo-input="' + campo.id + '"][data-parte="vazias"]').prop('checked', !!v.vazias);
      } else if (campo.tipo === 'checkbox') {
        /* v1.1 (T23) — restaura estado do checkbox simples */
        $c.find('[data-campo-input="' + campo.id + '"]').prop('checked', !!v);
      }
    });
  }

  /* ============================================================
     Bind — lê UI, atualiza this.filtros (sem chamar onChange).
     onChange só é disparado por aplicar().
     ============================================================ */
  _bindListeners() {
    var self = this;
    var $c = $(this.config.container);

    /* Namespace fa1 para permitir off sem afetar outros listeners */
    $c.off('.fa1');
    $c.on('input.fa1 change.fa1', '[data-campo-input]', function() {
      self._lerUI();
    });

    /* Onda 6 (#14) — toggle AND/OR do multi-select.
       Ao clicar, atualiza o modo, marca visualmente e re-executa
       _lerUI pra que o valor persista via aplicar(). */
    $c.on('click.fa1', '.fa-modo-opt', function() {
      var $btn   = $(this);
      var $wrap  = $btn.closest('.fa-modo-toggle');
      var campo  = $wrap.attr('data-campo');
      var modo   = $btn.attr('data-modo');
      if (!campo || !modo) return;
      $wrap.find('.fa-modo-opt').removeClass('selected');
      $btn.addClass('selected');
      self.filtros[campo + '__modo'] = modo;
    });
  }

  _lerUI() {
    var self = this;
    var $c = $(this.config.container);

    (this.config.campos || []).forEach(function(campo) {
      if (campo.tipo === 'text') {
        var v = ($c.find('[data-campo-input="' + campo.id + '"]').val() || '').trim();
        if (v) self.filtros[campo.id] = v;
        else delete self.filtros[campo.id];

      } else if (campo.tipo === 'multi-select') {
        var arr = [];
        $c.find('[data-campo-input="' + campo.id + '"]:checked').each(function() {
          arr.push($(this).val());
        });
        if (arr.length) self.filtros[campo.id] = arr;
        else delete self.filtros[campo.id];

      } else if (campo.tipo === 'daterange') {
        var de  = $c.find('[data-campo-input="' + campo.id + '"][data-parte="de"]' ).val() || '';
        var ate = $c.find('[data-campo-input="' + campo.id + '"][data-parte="ate"]').val() || '';
        if (de || ate) self.filtros[campo.id] = { de: de, ate: ate };
        else delete self.filtros[campo.id];

      } else if (campo.tipo === 'faixa-numerica') {
        var min    = $c.find('[data-campo-input="' + campo.id + '"][data-parte="min"]').val();
        var max    = $c.find('[data-campo-input="' + campo.id + '"][data-parte="max"]').val();
        var vazias = $c.find('[data-campo-input="' + campo.id + '"][data-parte="vazias"]').is(':checked');
        min = (min !== '' && min != null) ? Number(min) : null;
        max = (max !== '' && max != null) ? Number(max) : null;
        if (min !== null || max !== null || vazias) {
          self.filtros[campo.id] = { min: min, max: max, vazias: vazias };
        } else {
          delete self.filtros[campo.id];
        }

      } else if (campo.tipo === 'checkbox') {
        /* v1.1 (T23) — checkbox só ocupa espaço no state quando marcado.
           Se desmarcado, remove do state (fica igual a "sem filtro"). */
        var checked = $c.find('[data-campo-input="' + campo.id + '"]').is(':checked');
        if (checked) self.filtros[campo.id] = true;
        else delete self.filtros[campo.id];
      }
    });
  }

  /* ============================================================
     API PÚBLICA
     ============================================================ */

  /* Aplica os filtros: persiste e dispara onChange do consumidor. */
  aplicar() {
    this._lerUI();
    this._saveToStorage();
    if (typeof this.config.onChange === 'function') {
      this.config.onChange();
    }
    this.fechar();
    var qtd = this.contarAtivos();
    if (qtd > 0) {
      Toast.show(qtd + ' filtro(s) aplicado(s).', 'success');
    } else {
      Toast.show('Filtros removidos.', 'info');
    }
  }

  /* Limpa todos os filtros. */
  limpar() {
    this.filtros = {};
    this._saveToStorage();
    var $c = $(this.config.container);
    $c.find('input[type="text"], input[type="date"], input[type="number"]').val('');
    $c.find('input[type="checkbox"]').prop('checked', false);
    if (typeof this.config.onChange === 'function') {
      this.config.onChange();
    }
    Toast.show('Filtros limpos.', 'info');
  }

  /* Conta filtros ativos (útil pra badge da toolbar). */
  contarAtivos() {
    return Object.keys(this.filtros).length;
  }

  /* v1.1 (T23) — Retorna o valor atual de um filtro específico.
     Usado quando o consumidor precisa saber o estado de um filtro
     pra alterar lógica externa (ex.: "Incluir arquivados" muda a
     fonte dos dados no Funil, não o filtro passa-a-passa).
     Retorna undefined se o filtro não está ativo. */
  getValor(campoId) {
    return this.filtros[campoId];
  }

  /* Abre/fecha o drawer. Espera-se que o drawer wrapper tenha o
     ID definido em this.config.drawerId. */
  abrir() {
    if (!this.config.drawerId) return;
    $('#' + this.config.drawerId).addClass('fa-drawer-open');
    $('body').addClass('fa-drawer-body-lock');
  }
  fechar() {
    if (!this.config.drawerId) return;
    $('#' + this.config.drawerId).removeClass('fa-drawer-open');
    $('body').removeClass('fa-drawer-body-lock');
  }
  alternar() {
    if (!this.config.drawerId) return;
    if ($('#' + this.config.drawerId).hasClass('fa-drawer-open')) this.fechar();
    else this.abrir();
  }

  /* ============================================================
     FILTRO — aplica os filtros ativos sobre uma lista de leads.
     aux = { agendamentos, visitas } — necessário para filtros
     que dependem de dados relacionados (categoria veículo,
     resultado de visita).
     ============================================================ */
  filtrar(leads, aux) {
    if (!leads || !leads.length) return leads || [];
    var self = this;
    var campos = this.config.campos || [];
    aux = aux || {};

    /* Se não há filtros ativos, retorna a lista original — evita
       trabalho desnecessário. */
    if (this.contarAtivos() === 0) return leads;

    /* Pré-computa índices para filtros que dependem de dados relacionados.
       Isso evita O(n×m) durante o filter. */
    var indexCategoriaLead = null;
    if (this.filtros['categoriaVeiculo'] && aux.agendamentos) {
      indexCategoriaLead = {};
      aux.agendamentos.forEach(function(ag) {
        if (!ag._lead_uuid || !ag.categoria) return;
        if (!indexCategoriaLead[ag._lead_uuid]) {
          indexCategoriaLead[ag._lead_uuid] = new Set();
        }
        indexCategoriaLead[ag._lead_uuid].add(ag.categoria);
      });
    }

    var indexResultadoLead = null;
    if (this.filtros['resultadoVisita'] && aux.visitas) {
      indexResultadoLead = {};
      aux.visitas.forEach(function(v) {
        if (!v._lead_uuid || !v.tipoResultado) return;
        if (!indexResultadoLead[v._lead_uuid]) {
          indexResultadoLead[v._lead_uuid] = new Set();
        }
        indexResultadoLead[v._lead_uuid].add(v.tipoResultado);
      });
    }

    return leads.filter(function(lead) {
      /* Semântica AND: precisa passar em TODOS os filtros ativos */
      for (var i = 0; i < campos.length; i++) {
        var campo = campos[i];
        var val   = self.filtros[campo.id];
        if (val === undefined) continue;

        if (!self._passaFiltro(campo, val, lead, {
          indexCategoriaLead:  indexCategoriaLead,
          indexResultadoLead:  indexResultadoLead,
        })) {
          return false;
        }
      }
      return true;
    });
  }

  _passaFiltro(campo, valorFiltro, lead, idx) {
    /* Rota por tipo E por campo — alguns campos têm lógica custom
       via campo.getValor (função definida pelo consumidor). */
    var getValor = campo.getValor;

    if (campo.tipo === 'text') {
      /* Match por substring case-insensitive em campo.get(lead) */
      var valLead = getValor ? getValor(lead) : (lead[campo.propriedade] || '');
      return String(valLead || '').toLowerCase().indexOf(String(valorFiltro).toLowerCase()) >= 0;
    }

    if (campo.tipo === 'multi-select') {
      /* Onda 6 (#14) — modo de match configurável:
         - 'or' (default): qualquer valor da lista bate
         - 'and': TODOS os valores da lista precisam bater
         Só habilitado quando o campo tem permitirAndOr:true.
         O modo é lido de this.filtros[campo.id + '__modo']. */
      var lista = Array.isArray(valorFiltro) ? valorFiltro : [valorFiltro];
      if (!lista.length) return true;
      var modoMatch = (campo.permitirAndOr && this.filtros[campo.id + '__modo']) || 'or';

      /* Modo relacionado — via índice pré-computado por _lead_uuid */
      if (campo.id === 'categoriaVeiculo') {
        var setCat = idx.indexCategoriaLead && idx.indexCategoriaLead[lead._uuid];
        if (!setCat) return false;
        if (modoMatch === 'and') {
          for (var iA = 0; iA < lista.length; iA++) {
            if (!setCat.has(lista[iA])) return false;
          }
          return true;
        }
        for (var i = 0; i < lista.length; i++) {
          if (setCat.has(lista[i])) return true;
        }
        return false;
      }
      if (campo.id === 'resultadoVisita') {
        var setRes = idx.indexResultadoLead && idx.indexResultadoLead[lead._uuid];
        if (!setRes) return false;
        if (modoMatch === 'and') {
          for (var jA = 0; jA < lista.length; jA++) {
            if (!setRes.has(lista[jA])) return false;
          }
          return true;
        }
        for (var j = 0; j < lista.length; j++) {
          if (setRes.has(lista[j])) return true;
        }
        return false;
      }

      /* Modo escalar ou array na propriedade */
      var valSc = getValor ? getValor(lead) : lead[campo.propriedade];
      if (Array.isArray(valSc)) {
        if (modoMatch === 'and') {
          for (var kA = 0; kA < lista.length; kA++) {
            if (valSc.indexOf(lista[kA]) < 0) return false;
          }
          return true;
        }
        for (var k = 0; k < lista.length; k++) {
          if (valSc.indexOf(lista[k]) >= 0) return true;
        }
        return false;
      }
      /* Escalar não faz sentido combinar em AND (um lead tem uma fonte só).
         Nesses casos usa OR mesmo com modoMatch=='and'. */
      return lista.indexOf(valSc) >= 0;
    }

    if (campo.tipo === 'daterange') {
      var iso = getValor ? getValor(lead) : lead[campo.propriedade];
      if (!iso) return false; /* Sem data, não passa */
      var data = new Date(iso);
      if (isNaN(data.getTime())) return false;
      if (valorFiltro.de) {
        var dDe = new Date(valorFiltro.de + 'T00:00:00');
        if (data < dDe) return false;
      }
      if (valorFiltro.ate) {
        var dAte = new Date(valorFiltro.ate + 'T23:59:59');
        if (data > dAte) return false;
      }
      return true;
    }

    if (campo.tipo === 'faixa-numerica') {
      var raw = getValor ? getValor(lead) : lead[campo.propriedade];
      var num = FiltroAvancadoComponent._parseNumero(raw);

      /* v1.1 (T21) — quando o toggle "vazias" está marcado, além de
         valores null/undefined/'', considera também num === 0 como
         "vazio". Motivo: leads salvos com mensalidade=0 no banco
         (default de INSERT antigo) eram invisíveis pro filtro. */
      var ehVazio = (num == null) ||
                    (valorFiltro.vazias === true && num === 0);

      if (ehVazio) {
        return valorFiltro.vazias === true;
      }
      if (valorFiltro.min !== null && valorFiltro.min !== undefined && num < valorFiltro.min) return false;
      if (valorFiltro.max !== null && valorFiltro.max !== undefined && num > valorFiltro.max) return false;
      return true;
    }

    /* v1.1 (T23) — checkbox: delega ao consumidor via passaSeMarcado.
       Se não for informado, marca como filtro pass-through (não
       exclui nenhum lead). O efeito real fica a cargo do consumidor
       via getValor(campoId) e lógica externa (ex.: no Funil,
       "Incluir arquivados" muda a fonte dos dados, não o filtro). */
    if (campo.tipo === 'checkbox') {
      if (typeof campo.passaSeMarcado === 'function') {
        return campo.passaSeMarcado(lead);
      }
      return true;
    }

    return true;
  }

  /* Parse robusto: aceita number, string "1234.56" ou string BR "1.234,56". */
  static _parseNumero(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isNaN(v) ? null : v;
    var s = String(v).trim();
    if (!s) return null;
    /* Se tem vírgula E ponto, assume formato BR (ponto = milhar, vírgula = decimal) */
    if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.indexOf(',') >= 0) {
      s = s.replace(',', '.');
    }
    /* Remove tudo que não é dígito, ponto, sinal */
    s = s.replace(/[^\d.\-]/g, '');
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }
}
