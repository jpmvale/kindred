# 04 — Backlog de produto

Ideias em aberto, sem compromisso de data. Ordenadas por quanto acrescentam hoje.

Nenhum item aberto no momento.

**Concluídos.**

- **BL-17** — recuperar senha esquecida, por `pnpm db:reset-password <email> [senha-nova]`
  (ADR-019), não pela aplicação: sem infraestrutura de e-mail no projeto (e a conta real usa
  `dono@kindred.local`, que não é entregável), a recuperação exige acesso ao servidor — o mesmo nível
  de acesso que hoje resolveria isso com um `UPDATE` na mão, só que sem risco de errar o hash. Derruba
  todas as sessões da conta redefinida.
- **BL-16** — trocar e-mail e senha da própria conta (`PATCH /api/auth/me`, tela `/account`). A senha
  atual é sempre exigida, mesmo para só trocar o e-mail — mesma defesa do login contra uma sessão
  sequestrada assumir a conta de vez. Trocar a senha derruba as outras sessões, mas mantém a atual (RN-025).
- **BL-10** — multiusuário com login: cada conta tem sua própria árvore, isolada — nenhuma pessoa,
  local ou união é visível fora de quem a criou (RN-022 a RN-024, ADR-018). Sessão por cookie
  `httpOnly`, guard global (toda rota exige login por padrão, `@Public()` é a exceção), 404 — nunca
  403 — para dado de outra conta. Quem já tinha base antes do login existir ganhou dono pelo
  `db:backfill-owner`, entre duas migrations (`userId` nasce opcional, só depois vira obrigatório).

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
- **BL-15** — a árvore deixou de ficar vazia ao abrir todos os relacionamentos. O `fitView` era
  chamado por cronômetro, antes de o reactflow medir os nós, e desistia em silêncio deixando a
  viewport no zoom anterior; agora espera o `useNodesInitialized`. Só aparecia em base grande.
- **BL-06** — exportar e importar pela própria tela (`/backup`), reusando exatamente o formato do
  `db:backup`/`db:restore` (ADR-013): baixar gera o arquivo, subir restaura, e restaurar sobre um
  banco ocupado pede confirmação antes de apagar (RN-021, ADR-016). GEDCOM — trocar dados com outros
  programas de genealogia — continua de fora, e é bem mais trabalho.
- **Card de detalhe na árvore** — clicar num nó abre um card à direita com nome, notas, nascimento,
  pai, mãe, filhos e irmãos, e um botão para editar. Clicar num parente listado troca o card para ele
  — a família mostrada é a de verdade (`person-relations.ts`), não só quem está desenhado na árvore
  naquele momento.
- **BL-14** — a chamada sem paginação (árvore, calendário, candidatos de um formulário) parou de
  trazer pai, mãe e local aninhados e o parceiro por extenso de cada união — nenhum dos três lia
  esses campos (ADR-017). O que sobrou do BL-09 fechou.
