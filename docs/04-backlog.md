# 04 — Backlog de produto

Ideias em aberto, sem compromisso de data. Ordenadas por quanto acrescentam hoje.

| # | Item | Por quê |
| --- | --- | --- |
| BL-15 | **A árvore fica vazia ao abrir todos os relacionamentos** | Na base real (143 pessoas), o botão "Abrir todos relacionamentos" some com os nós: sobram fundo, painéis e legenda. Com o seed de 23 não acontece. É defeito, não ideia — anterior ao ADR-015, reproduzido no commit `2b7f25f`. |
| BL-06 | **Exportar / importar** (JSON, e talvez GEDCOM) | Hoje o dado só sai por `pg_dump`. |
| BL-14 | **Enxugar a resposta da árvore e do calendário** | A chamada sem paginação ainda traz a base inteira com pai, mãe e local aninhados — 7,5 MB com 5000 pessoas. A árvore usa `fatherId`/`motherId`, uniões e foto; o calendário, menos ainda. Mexe no contrato da API, por isso ficou fora do BL-09 (ADR-014). |
| BL-10 | **Multiusuário com login** | Mudaria o produto de "base pessoal" para serviço; fora do escopo atual. |

**Concluídos.**

- **BL-01** — cônjuge como vínculo: virou a entidade `Union` (ADR-008), com o parentesco por
  afinidade (RN-011 a RN-014).
- **BL-12** — casais na árvore: o cônjuge aparece encostado no par, com a união vigente em linha
  cheia e a desfeita tracejada (ADR-009).
- **BL-13** — a linha do cônjuge: o "+" e o "↔" do cônjuge abrem sogros, cunhados e a família deles,
  que entram na geração certa e andam junto com ele (ADR-009).
- **BL-03** — busca sem acento: "jose" acha "José" e "José" acha "Jose", nos três campos casados
  (RN-016).
- **BL-11** — os dados vêm de loaders de rota, não de `useEffect`; a lista de pessoas passou a morar
  na URL, e as regras de lint voltaram a ser erro (ADR-010).
- **BL-04** — a pessoa central pode ser trocada pela tela: o posto é transferido numa transação, e
  todos os graus são recalculados a partir de quem assume (RN-018).
- **BL-02** — a foto virou arquivo de verdade: sobe reduzida pelo navegador e fica no Postgres, ao
  lado do resto dos dados (ADR-011, RN-017).
- **BL-08** — as páginas do front ganharam teste: a rota inteira montada com a API dublada, buscando
  os elementos pelo rótulo. Só a árvore fica na fumaça, porque o reactflow não mede nada no jsdom.
- **Parentesco só para quem é parente** — amigo e conhecido não aparecem mais como "Parente
  distante" (RN-015).
- **BL-05** — notas por pessoa: um campo de texto livre de até 2000 caracteres em `people`, fora da
  busca (RN-019). Cobre o `friendshipOrigin` da spec original sem precisar de entidade nova.
- **BL-07** — o calendário deixou de olhar só o nascimento: quem faleceu volta com as duas datas,
  distintas na tela, e há um filtro para desligá-las (RN-020).
- **BL-09** — a listagem parou de arrastar a base inteira com todos os includes: varre linhas
  estreitas e busca os detalhes só da página (ADR-014). Com 5000 pessoas, 202 ms viraram ~35 ms. O
  custo quadrático do parentesco tinha saído antes (ADR-012). O que sobrou virou BL-14.
- **Tema escuro** — claro/escuro/sistema, com toda cor do app saindo de token semântico e o tema
  aplicado antes da pintura (ADR-015). De quebra, os campos de formulário ganharam tratamento de
  verdade: o `<textarea>` não tinha estilo nenhum e os controles de união estavam com a aparência
  crua do navegador.
