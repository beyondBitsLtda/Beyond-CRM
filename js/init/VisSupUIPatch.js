/* ============================================================
   BEYOND CRM — js/init/VisSupUIPatch.js   v1.1
   VIS-SUP-1: UI de vinculação supervisor <-> especialistas no
   modal de edição de usuário. Patch em runtime.

   Comportamento (v1.1 — Onda 3 pós-testes):
   - Seção "Especialistas sob supervisão" aparece quando o
     usuário sendo cadastrado/editado tem perfil = 'supervisor'
     (antes só aparecia em edição — Ticket #28).
   - Lista mostra especialistas ATIVOS da MESMA FILIAL do supervisor,
     ou de TODAS as filiais quando filial = 'Todas' (Ticket #5),
     agrupados por filial na visualização.
   - Exclui o próprio usuário da lista (Ticket #6 — cenário: user
     era 'especialista', editado pra 'supervisor'; sem esse fix,
     ele mesmo aparecia na lista da própria supervisão).
   - Ao salvar, chama a RPC sincronizar_visibilidade_supervisor()
     — tanto em EDIÇÃO (com editId) quanto em CRIAÇÃO (usa o UUID
     recém-criado buscando por email, mesmo padrão do upload de foto).

   IMPORTANTE: este arquivo DEVE ser carregado APÓS Modules.js
   e APÓS UsuarioModulePatch.js.

   Histórico:
   - v1.0: implementação base (só edição).
   - v1.1 (Onda 3 pós-testes — Tickets #5, #6, #28): criação
     também mostra a seção, filial 'Todas', exclui próprio ID.

   Beyond Bits Tecnologia © 2026
   ============================================================ */
'use strict';

(function() {
  if (typeof UsuarioModule === 'undefined') {
    if (typeof SLog !== 'undefined') SLog.warn('VisSupUIPatch: UsuarioModule não carregado, patch ignorado.');
    return;
  }

  /* ================================================================
     Objeto VisSupUI — expõe o comportamento pra debug no console.
     ================================================================ */
  var VisSupUI = {

    /* Carrega e renderiza a lista de especialistas.
       Onda 3 pós-testes (#5): se filial === 'Todas', traz especialistas
       de TODAS as filiais (agrupados por filial no render pra manter a
       leitura clara). Antes, o código quebrava com "Filial 'Todas' não
       encontrada" porque procurava 'Todas' em store.filiais.
       Onda 3 pós-testes (#6): exclui o próprio usuário da lista via
       .neq('id', supervisorId). Cenário: usuário criado como especialista
       depois promovido a supervisor — durante a edição ele ainda tem
       perfil='especialista' no banco e aparecia na própria lista. */
    async carregarLista(filialNome, supervisorId) {
      var $lista = $('#usr-especialistas-lista');
      $lista.html('<div class="small text-muted p-2"><i class="bi bi-arrow-repeat spin-icon"></i> Carregando especialistas...</div>');

      if (!filialNome || !supa) {
        $lista.html('<div class="small text-muted p-2">Selecione uma filial para listar os especialistas.</div>');
        $('#form-usuario').data('especialistasSelecionados', []);
        return;
      }

      /* Chamado #35 — supervisor pode acompanhar especialistas de
         QUALQUER filial (o cliente confirmou que supervisores atendem
         entre lojas). Forçamos isTodas=true sempre: a query passa a
         não filtrar por filial_id e o render usa o agrupamento por
         filial que já existia. filialId ainda é resolvido pra não
         quebrar callers que possam usá-lo em telemetria futura. */
      var filialId = null;
      var isTodas  = true;   /* antes: (filialNome === 'Todas') */
      var filialInexistente = false;
      var filial = store.filiais.find(function(f) { return f.nome === filialNome; });
      if (filial) filialId = filial.id;
      else if (filialNome && filialNome !== 'Todas') filialInexistente = true;

      if (filialInexistente) {
        SLog.warn('VisSupUI: filial "' + filialNome + '" não encontrada — listando todas mesmo assim');
      }

      /* 2. Consulta especialistas ativos.
         Sempre inclui filiais(nome) — usado no render pra rótulo
         especialmente no modo 'Todas' (agrupamento visual por filial). */
      var query = supa.from('profiles')
        .select('id, nome, sigla, filial_id, filiais(nome)')
        .eq('perfil', 'especialista')
        .or('status.is.null,status.neq.inativo')
        .order('nome', { ascending: true });

      if (!isTodas) query = query.eq('filial_id', filialId);
      /* Onda 3 (#6) — sempre exclui o próprio ID pra não listar o
         supervisor sendo editado como especialista dele mesmo. */
      if (supervisorId) query = query.neq('id', supervisorId);

      var espRes = await query;

      if (espRes.error) {
        SLog.error('VisSupUI.carregarLista: ' + espRes.error.message);
        $lista.html('<div class="small text-danger p-2">Erro ao carregar especialistas: ' + espRes.error.message + '</div>');
        $('#form-usuario').data('especialistasSelecionados', []);
        return;
      }

      var especialistas = espRes.data || [];

      /* 3. Consulta vínculos já existentes desse supervisor */
      var vinculadosIds = [];
      if (supervisorId) {
        var vinRes = await supa.from('supervisor_especialista_vinculo')
          .select('especialista_id')
          .eq('supervisor_id', supervisorId);
        if (vinRes.error) {
          SLog.warn('VisSupUI: não conseguiu ler vínculos atuais: ' + vinRes.error.message);
        } else {
          vinculadosIds = (vinRes.data || []).map(function(r) { return r.especialista_id; });
        }
      }

      /* 4. Renderiza checkboxes.
         Onda 3 (#5): quando modo 'Todas', agrupa por filial pra ficar
         legível quando a lista for grande. */
      if (!especialistas.length) {
        var msgVazio = isTodas
          ? 'Nenhum especialista ativo cadastrado em nenhuma filial.'
          : 'Nenhum especialista ativo nesta filial.';
        $lista.html('<div class="small text-muted p-2">' + msgVazio + '</div>');
        $('#form-usuario').data('especialistasSelecionados', []);
        return;
      }

      var html = '';
      if (isTodas) {
        /* Agrupa por filial pra facilitar leitura */
        var porFilial = {};
        especialistas.forEach(function(esp) {
          var fnome = (esp.filiais && esp.filiais.nome) || '— sem filial —';
          if (!porFilial[fnome]) porFilial[fnome] = [];
          porFilial[fnome].push(esp);
        });
        Object.keys(porFilial).sort().forEach(function(fnome) {
          html += '<div class="fw-semibold small mt-2 mb-1" style="color:var(--d-txt-64748b);">' +
                  '<i class="bi bi-building"></i> ' + Utils.escHtml(fnome) + '</div>';
          porFilial[fnome].forEach(function(esp) {
            var marcado = vinculadosIds.indexOf(esp.id) >= 0 ? 'checked' : '';
            html +=
              '<div class="form-check ms-3">' +
              '  <input class="form-check-input vis-sup-check" type="checkbox" value="' + esp.id + '" id="vis-sup-esp-' + esp.id + '" ' + marcado + '>' +
              '  <label class="form-check-label" for="vis-sup-esp-' + esp.id + '">' +
              '    <strong>' + esp.sigla + '</strong> — ' + Utils.escHtml(esp.nome) +
              '  </label>' +
              '</div>';
          });
        });
      } else {
        html = especialistas.map(function(esp) {
          var marcado = vinculadosIds.indexOf(esp.id) >= 0 ? 'checked' : '';
          return '' +
            '<div class="form-check">' +
            '  <input class="form-check-input vis-sup-check" type="checkbox" value="' + esp.id + '" id="vis-sup-esp-' + esp.id + '" ' + marcado + '>' +
            '  <label class="form-check-label" for="vis-sup-esp-' + esp.id + '">' +
            '    <strong>' + esp.sigla + '</strong> — ' + Utils.escHtml(esp.nome) +
            '  </label>' +
            '</div>';
        }).join('');
      }
      $lista.html(html);

      /* 5. Guarda seleção atual como fonte de verdade */
      $('#form-usuario').data('especialistasSelecionados', vinculadosIds.slice());
      SLog.info('VisSupUI: ' + especialistas.length + ' especialista(s) listado(s)' +
                (isTodas ? ' (modo Todas)' : '') + ', ' + vinculadosIds.length + ' pré-selecionado(s)');
    },

    /* Atualiza estado ao clicar num checkbox */
    onCheckboxChange(e) {
      var $c = $(e.target);
      var espId = $c.val();
      var lista = $('#form-usuario').data('especialistasSelecionados') || [];
      if ($c.is(':checked')) {
        if (lista.indexOf(espId) < 0) lista.push(espId);
      } else {
        lista = lista.filter(function(x) { return x !== espId; });
      }
      $('#form-usuario').data('especialistasSelecionados', lista);
    },

    /* Mostra ou esconde a seção com base no perfil.
       Onda 3 (#28): antes só aparecia em EDIÇÃO (exigia editId).
       Agora aparece também na CRIAÇÃO — quando perfil='supervisor',
       lista os especialistas da filial escolhida SEM pré-selecionar
       nenhum vínculo (o supervisor ainda não existe no banco).
       Após criar, UsuarioModule.salvar captura o UUID novo e chama
       VisSupUI.sincronizarBackend com a lista selecionada. */
    atualizarVisibilidade() {
      var perfil = $('#usr-perfil').val();
      var editId = $('#form-usuario').data('editId');
      var $wrap  = $('#usr-especialistas-wrapper');
      if (perfil === 'supervisor') {
        $wrap.show();
        var filial = $('#usr-filial').val();
        /* editId undefined em criação → não pré-marca vínculos */
        VisSupUI.carregarLista(filial, editId || null);
      } else {
        $wrap.hide();
        $('#form-usuario').removeData('especialistasSelecionados');
      }
    },

    /* Reset de estado — chamado ao (re)abrir o modal */
    reset() {
      $('#usr-especialistas-wrapper').hide();
      $('#usr-especialistas-lista').html('<div class="small text-muted p-2">Carregando especialistas...</div>');
      $('#form-usuario').removeData('especialistasSelecionados');
    },

    /* Chamado após salvar edição de supervisor */
    async sincronizarBackend(supervisorId) {
      var lista = $('#form-usuario').data('especialistasSelecionados');
      if (!supa || !supervisorId || !Array.isArray(lista)) return;

      SLog.load('VisSupUI: sincronizando ' + lista.length + ' vínculo(s) para supervisor ' + supervisorId);
      var res = await supa.rpc('sincronizar_visibilidade_supervisor', {
        p_supervisor_id: supervisorId,
        p_especialistas_ids: lista
      });

      if (res.error) {
        SLog.error('VisSupUI.sincronizar: ' + res.error.message);
        Toast.show('Vínculo de especialistas não pôde ser salvo: ' + res.error.message, 'warning');
        return;
      }
      SLog.info('VisSupUI: sync ok — ' + JSON.stringify(res.data));
    }
  };
  window.VisSupUI = VisSupUI;

  /* ================================================================
     Wrap das funções originais de UsuarioModule
     ================================================================ */

  /* editar(): reset primeiro, roda original, depois atualiza visibilidade */
  var origEditar = UsuarioModule.editar;
  UsuarioModule.editar = async function(sigla) {
    VisSupUI.reset();
    await origEditar.call(UsuarioModule, sigla);
    VisSupUI.atualizarVisibilidade();
  };

  /* abrirNovo(): sempre resetar, mas MANTÉM o listener de perfil pra
     que a seção apareça no momento em que o gerente escolher 'supervisor'.
     Onda 3 (#28) — antes, reset+return e a seção só voltava com editId. */
  var origAbrirNovo = UsuarioModule.abrirNovo;
  if (typeof origAbrirNovo === 'function') {
    UsuarioModule.abrirNovo = async function() {
      VisSupUI.reset();
      var r = await origAbrirNovo.apply(UsuarioModule, arguments);
      /* Se por algum motivo o form abriu já com perfil='supervisor'
         (pouco provável, mas defesa em profundidade), mostra a seção. */
      VisSupUI.atualizarVisibilidade();
      return r;
    };
  }

  /* salvar(): captura estado antes do original, sincroniza depois se aplicável.
     Onda 3 (#28) — cobre AMBOS os fluxos:
     - EDIÇÃO: usa editId capturado antes (comportamento antigo).
     - CRIAÇÃO: após o UsuarioModule.salvar terminar (que já grava
       o profile e recarrega a lista via store.usuarios), busca o
       UUID do usuário recém-criado pelo email do form e chama
       sincronizarBackend com esse UUID. */
  var origSalvar = UsuarioModule.salvar;
  UsuarioModule.salvar = async function() {
    var editIdAntes  = $('#form-usuario').data('editId');
    var perfilAntes  = $('#usr-perfil').val();
    var emailAntes   = ($('#usr-email').val() || '').trim();
    var listaAntes   = $('#form-usuario').data('especialistasSelecionados');
    var isCriacao    = !editIdAntes;

    var resultado = await origSalvar.apply(UsuarioModule, arguments);

    /* EDIÇÃO de supervisor com vínculos */
    if (editIdAntes && perfilAntes === 'supervisor' && Array.isArray(listaAntes)) {
      $('#form-usuario').data('especialistasSelecionados', listaAntes);
      await VisSupUI.sincronizarBackend(editIdAntes);
    }
    /* Onda 3 (#28) — CRIAÇÃO de supervisor com vínculos */
    else if (isCriacao && perfilAntes === 'supervisor' && Array.isArray(listaAntes) && listaAntes.length > 0 && supa) {
      try {
        /* O UsuarioModule.salvar já criou o profile via AuthService.criarUsuario.
           Buscamos o UUID recém-criado pelo email (mesmo padrão que o
           módulo já usa pra upload de foto). */
        var profRes = await supa.from('profiles').select('id').eq('email', emailAntes).single();
        if (profRes && profRes.data && profRes.data.id) {
          var novoUuid = profRes.data.id;
          SLog.info('VisSupUI: sincronizando vínculos do NOVO supervisor ' + novoUuid);
          $('#form-usuario').data('especialistasSelecionados', listaAntes);
          await VisSupUI.sincronizarBackend(novoUuid);
          Toast.show('Supervisor criado com ' + listaAntes.length + ' especialista(s) vinculado(s).', 'success');
        } else {
          SLog.warn('VisSupUI: não localizou UUID do novo supervisor por email ' + emailAntes);
        }
      } catch (e) {
        SLog.error('VisSupUI: falha ao sincronizar vínculos do novo supervisor — ' + e.message);
        Toast.show('Supervisor criado, mas houve erro ao vincular especialistas. Abra o cadastro dele e revincule.', 'warning');
      }
    }

    return resultado;
  };

  /* ================================================================
     Listeners (delegation — sobrevivem ao re-abrir do modal)
     ================================================================ */

  $(document).on('change', '#usr-perfil', function() {
    VisSupUI.atualizarVisibilidade();
  });

  $(document).on('change', '#usr-filial', function() {
    /* Chamado #35 — a lista de especialistas agora é global (todas as
       filiais). Trocar a filial do supervisor NÃO invalida mais os
       vínculos, então não precisamos relistar/reset. Deixamos o
       change como no-op pra preservar o que o gerente já marcou e
       ainda não salvou. */
  });

  $(document).on('change', '.vis-sup-check', VisSupUI.onCheckboxChange);

  if (typeof SLog !== 'undefined') SLog.info('VisSupUIPatch instalado ✓ (vínculo supervisor↔especialistas)');
})();
