# 04 — Backlog de produto

Ideias em aberto, sem compromisso de data. Ordenadas por quanto acrescentam hoje.

| # | Item | Por quê |
| --- | --- | --- |
| BL-02 | **Upload de foto** (hoje é URL) | O caminho atual depende de a imagem estar hospedada em algum lugar. |
| BL-04 | **Trocar a pessoa central** sem mexer no banco | RN-001 impede a segunda; falta a operação de transferência. |
| BL-05 | **Notas por pessoa** (origem da amizade, histórias) | A spec original tinha `friendshipOrigin`; virou texto livre que ainda não existe. |
| BL-06 | **Exportar / importar** (JSON, e talvez GEDCOM) | Hoje o dado só sai por `pg_dump`. |
| BL-07 | **Aniversário de falecimento** no calendário | O calendário só olha nascimento. |
| BL-08 | **Testes do front** — o resto das páginas | O layout da árvore já tem os seus (`tree-layout.test.ts`); lista, formulário e calendário continuam sem nenhum. |
| BL-09 | **Paginação de verdade no banco** | Hoje a API carrega todas as pessoas e filtra em memória — está ótimo para centenas, não para milhares. Levar a busca para o SQL cobra a RN-016 junto: o Postgres precisaria de `unaccent` (ou coluna normalizada), e o grau de parentesco, que é calculado e não existe como coluna, não tem como ser filtrado lá. |
| BL-10 | **Multiusuário com login** | Mudaria o produto de "base pessoal" para serviço; fora do escopo atual. |
| BL-11 | **Buscar dados fora do `useEffect`** nas páginas | As regras `react-hooks/set-state-in-effect` e `preserve-manual-memoization` estão como *aviso* no ESLint por causa disso (`apps/web/eslint.config.js`); o certo é reescrever o fetch. |

**Concluídos.**

- **BL-01** — cônjuge como vínculo: virou a entidade `Union` (ADR-008), com o parentesco por
  afinidade (RN-011 a RN-014).
- **BL-12** — casais na árvore: o cônjuge aparece encostado no par, com a união vigente em linha
  cheia e a desfeita tracejada (ADR-009).
- **BL-13** — a linha do cônjuge: o "+" e o "↔" do cônjuge abrem sogros, cunhados e a família deles,
  que entram na geração certa e andam junto com ele (ADR-009).
- **BL-03** — busca sem acento: "jose" acha "José" e "José" acha "Jose", nos três campos casados
  (RN-016).
- **Parentesco só para quem é parente** — amigo e conhecido não aparecem mais como "Parente
  distante" (RN-015).
