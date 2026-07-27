# 04 — Backlog de produto

Ideias em aberto, sem compromisso de data. Ordenadas por quanto acrescentam hoje.

| # | Item | Por quê |
| --- | --- | --- |
| BL-12 | **Casais na árvore** — desenhar as uniões no `TreePage` | O vínculo já existe (RN-011, ADR-008), mas a árvore continua só de sangue: cônjuge não aparece ao lado. |
| BL-02 | **Upload de foto** (hoje é URL) | O caminho atual depende de a imagem estar hospedada em algum lugar. |
| BL-03 | **Busca com acento-insensibilidade** ("jose" achar "José") | Hoje a busca normaliza caixa, não acento. |
| BL-04 | **Trocar a pessoa central** sem mexer no banco | RN-001 impede a segunda; falta a operação de transferência. |
| BL-05 | **Notas por pessoa** (origem da amizade, histórias) | A spec original tinha `friendshipOrigin`; virou texto livre que ainda não existe. |
| BL-06 | **Exportar / importar** (JSON, e talvez GEDCOM) | Hoje o dado só sai por `pg_dump`. |
| BL-07 | **Aniversário de falecimento** no calendário | O calendário só olha nascimento. |
| BL-08 | **Testes do front** | Não existe nenhum; a lógica de árvore (`TreePage`) é a parte mais delicada do projeto. |
| BL-09 | **Paginação de verdade no banco** | Hoje a API carrega todas as pessoas e filtra em memória — está ótimo para centenas, não para milhares. |
| BL-10 | **Multiusuário com login** | Mudaria o produto de "base pessoal" para serviço; fora do escopo atual. |
| BL-11 | **Buscar dados fora do `useEffect`** nas páginas | As regras `react-hooks/set-state-in-effect` e `preserve-manual-memoization` estão como *aviso* no ESLint por causa disso (`apps/web/eslint.config.js`); o certo é reescrever o fetch. |

**Concluídos.** BL-01 (cônjuge como vínculo) — virou a entidade `Union` (ADR-008) com o parentesco
por afinidade (RN-011 a RN-014); o que ficou de fora dele, desenhar casais na árvore, seguiu como
BL-12.
