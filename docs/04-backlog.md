# 04 — Backlog de produto

Ideias em aberto, sem compromisso de data. Ordenadas por quanto acrescentam hoje.

| # | Item | Por quê |
| --- | --- | --- |
| BL-06 | **Exportar / importar** (JSON, e talvez GEDCOM) | Hoje o dado só sai por `pg_dump`. |
| BL-07 | **Aniversário de falecimento** no calendário | O calendário só olha nascimento. |
| BL-09 | **Paginação de verdade no banco** | Hoje a API carrega todas as pessoas e filtra em memória — está ótimo para centenas, não para milhares. Levar a busca para o SQL cobra a RN-016 junto: o Postgres precisaria de `unaccent` (ou coluna normalizada), e o grau de parentesco, que é calculado e não existe como coluna, não tem como ser filtrado lá. |
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
