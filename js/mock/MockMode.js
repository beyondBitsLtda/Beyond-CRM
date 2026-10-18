/* ============================================================
   BEYOND CRM — js/mock/MockMode.js
   Liga o MODO DEMONSTRAÇÃO e desenha a barra "DEMO".
   Beyond Bits Tecnologia © 2026

   Edição Beyond CRM: a demonstração fica SEMPRE ligada. O app nunca
   conversa com o Supabase — MockData.js e MockSupabase.js (carregados
   logo depois deste) trocam o cliente por uma base fictícia em
   memória, com login automático.

   Atalho antigo demo.html continua funcionando (redireciona pra cá).
   ============================================================ */
'use strict';

(function() {
  window.AMP_MOCK = true;

  var ROTULO_PERFIL = { gerente: 'Gerente', supervisor: 'Supervisor', especialista: 'Especialista' };

  function desenharBarra() {
    if (!window.AmpMock || document.getElementById('amp-demo-bar')) return;

    var css = document.createElement('style');
    css.textContent = [
      '#amp-demo-bar{position:fixed;right:84px;bottom:18px;z-index:99999;display:flex;align-items:center;gap:8px;',
      'flex-wrap:wrap;max-width:calc(100vw - 108px);padding:6px 8px;border-radius:12px;background:rgba(18,18,18,.94);color:#F2F2F2;',
      'border:1px solid #2A2A2A;backdrop-filter:blur(8px);',
      "font:500 12.5px/1.2 'Barlow',Inter,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5);}",
      '#amp-demo-bar .amp-demo-tag{background:var(--bx-accent);color:var(--bx-on-accent);font-weight:700;letter-spacing:.08em;padding:3px 8px;border-radius:7px;}',
      '#amp-demo-bar .amp-demo-txt{color:var(--bx-txt-2);}',
      '#amp-demo-bar select{font:inherit;color:var(--bx-txt)!important;background:var(--bx-input)!important;border:1px solid var(--bx-line-2)!important;border-radius:8px!important;padding:5px 8px;max-width:230px;}',
      '#amp-demo-bar button{font:inherit;color:var(--bx-txt);background:var(--bx-elev);border:1px solid var(--bx-line-2);border-radius:8px;padding:5px 10px;cursor:pointer;}',
      '#amp-demo-bar button:hover{border-color:var(--bx-accent-b);color:var(--bx-accent-2);}',
      '#amp-demo-bar .amp-demo-min{background:transparent;border:0;padding:4px 6px;}',
      '#amp-demo-bar.min .amp-demo-full{display:none;}',
      '@media (max-width:768px){#amp-demo-bar{right:auto;left:12px;bottom:14px;max-width:calc(100vw - 92px);}#amp-demo-bar .amp-demo-txt{display:none;}}',
    ].join('');
    document.head.appendChild(css);

    var atual = AmpMock.usuarioAtualId();
    var filiais = {};
    AmpMock.filiais().forEach(function(f) { filiais[f.id] = f.nome; });
    var grupos = { gerente: [], supervisor: [], especialista: [] };
    AmpMock.usuarios().forEach(function(u) { (grupos[u.perfil] || (grupos[u.perfil] = [])).push(u); });

    var opcoes = Object.keys(grupos).map(function(perfil) {
      if (!grupos[perfil].length) return '';
      return '<optgroup label="' + (ROTULO_PERFIL[perfil] || perfil) + '">' + grupos[perfil].map(function(u) {
        var extra = (filiais[u.filial_id] ? ' · ' + filiais[u.filial_id] : '') + (u.status === 'inativo' ? ' (inativo)' : '');
        return '<option value="' + u.id + '"' + (u.id === atual ? ' selected' : '') + '>' + u.nome + extra + '</option>';
      }).join('') + '</optgroup>';
    }).join('');

    var barra = document.createElement('div');
    barra.id = 'amp-demo-bar';
    barra.setAttribute('role', 'region');
    barra.setAttribute('aria-label', 'Modo demonstração');
    barra.innerHTML =
      '<span class="amp-demo-tag" title="Dados fictícios — nada é gravado em servidor">DEMO</span>' +
      '<span class="amp-demo-full amp-demo-txt">Dados fictícios · ver como</span>' +
      '<select class="amp-demo-full" id="amp-demo-user" aria-label="Ver o sistema como">' + opcoes + '</select>' +
      '<button type="button" class="amp-demo-full" id="amp-demo-reset" title="Descarta o que foi alterado nesta aba e gera a base de exemplo de novo">Resetar dados</button>' +
      '<button type="button" class="amp-demo-min" id="amp-demo-min" title="Recolher/expandir" aria-label="Recolher barra">▾</button>';
    /* Desktop: dentro do cabeçalho, ao lado da logo. Celular: o CSS do tema a
       transforma num selo flutuante no canto inferior esquerdo. */
    var header = document.getElementById('app-header');
    var ancora = header && header.querySelector('.header-spacer');
    if (ancora) header.insertBefore(barra, ancora);
    else document.body.appendChild(barra);

    document.getElementById('amp-demo-user').addEventListener('change', function() { AmpMock.entrarComo(this.value); });
    document.getElementById('amp-demo-reset').addEventListener('click', function() {
      if (window.confirm('Descartar as alterações feitas nesta demonstração e gerar a base de exemplo de novo?')) AmpMock.resetar();
    });

    /* No celular a barra começa recolhida (só o selo DEMO) */
    if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
      barra.classList.add('min');
      document.getElementById('amp-demo-min').textContent = '▸';
    }
    document.getElementById('amp-demo-min').addEventListener('click', function() {
      barra.classList.toggle('min');
      this.textContent = barra.classList.contains('min') ? '▸' : '▾';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', desenharBarra);
  else desenharBarra();
})();
