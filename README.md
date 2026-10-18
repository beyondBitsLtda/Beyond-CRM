# Beyond CRM — edição de demonstração

É o CRM comercial com visual novo (preto + laranja, Barlow) e **só dados fictícios**: não conecta a nenhum banco e não pede login.

## Como abrir

Qualquer servidor de arquivos estáticos serve. Exemplos:

- Vercel, Netlify ou GitHub Pages apontando para este repositório (sem build).
- Localmente: `python -m http.server 8080` na raiz do projeto e abrir `http://localhost:8080`.

Precisa de internet só para as bibliotecas de CDN (Bootstrap, jQuery, ExcelJS, fonte Barlow).

## Temas

O botão de paleta no cabeçalho alterna entre dois visuais. A escolha fica salva no navegador.

- **Laranja** (padrão): preto + laranja; dashboard com gráfico de área, conversão, coortes e ranking.
- **Violeta**: inspirado em painéis financeiros; saudação com o nome, KPIs com ícone e minigráfico, evolução em barras (7D/30D/12M), insight do período, últimas vendas, origem das vendas (rosca), ligações da semana e barra de navegação inferior no celular.

O insight do período é montado por regras sobre os dados (variação da receita, líder do ciclo, etapa abaixo da meta), não por um modelo de IA.

## Durante a demonstração

- O sistema abre logado como **Ricardo Almeida (Gerente)**.
- Barra **DEMO** no topo (no celular, selo no canto inferior esquerdo):
  - **Ver como**: troca para supervisor ou especialista e mostra o que cada perfil enxerga.
  - **Resetar dados**: descarta o que foi alterado e gera a base de exemplo de novo.
- Tudo funciona: criar e editar leads, avançar etapas, registrar ligação, visita e venda, transferir, cadastrar usuários e currículos, exportar Excel.
- As alterações ficam só naquela aba do navegador. Fechar a aba ou clicar em Resetar volta ao zero.
- As datas da base são calculadas a partir do dia de hoje, então o ciclo de comissão atual sempre tem movimento.

## Onde está cada coisa

| Arquivo | Papel |
|---|---|
| `styles_beyond.css` | Temas Laranja e Violeta (seção 14). Carrega por último e só sobrepõe os CSS originais. |
| `js/beyond/BeyondDashboard.js` | Faixa de KPIs, gráfico de evolução, conversão por etapa, coortes e ranking. |
| `js/beyond/BeyondUI.js` | Troca de tema, cartão do usuário no menu, "dados atualizados", Agenda em visão Dia no celular, barra inferior do Violeta. |
| `js/mock/MockMode.js` | Liga o modo demo (sempre ativo) e desenha a barra DEMO. |
| `js/mock/MockData.js` | Gera a base fictícia (260 leads, equipe de 11 pessoas, 5 filiais). |
| `js/mock/MockSupabase.js` | Cliente Supabase simulado em memória (consultas, RPCs, auth, storage, realtime). |
| `assets/beyond-mark.svg`, `beyond-mark-violeta.svg` | Logo/favicon de cada tema. |
| `assets/wiki-*.png` | Prints da Wiki, regerados a partir desta versão. |

## Limitações conhecidas

- A visibilidade por perfil imita as regras do banco de forma aproximada.
- Fotos de perfil e anexos de currículo enviados durante a demo duram só a sessão.
- A visão "Dia" da Agenda navega de semana em semana (comportamento herdado do sistema original).
