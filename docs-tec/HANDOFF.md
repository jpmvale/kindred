# HANDOFF — estado atual

_Atualizado em 29/07/2026._

## Onde o projeto está

O MVP funciona de ponta a ponta: cadastro de pessoas e locais, cálculo de parentesco, lista com
busca/ordenação/paginação, árvore genealógica — agora com **famílias agrupadas, gerações alinhadas
(pai em cima, filho embaixo) e nenhum cartão sobre outro** — e
calendário de aniversários — em tema claro ou escuro, e **com conta e login** (BL-10): cada pessoa que
usa o kindred tem sua própria árvore, isolada das demais. A conta também já pode trocar o próprio
e-mail e senha pela tela (BL-16), e quem tem acesso ao servidor consegue redefinir a senha de qualquer
conta por linha de comando (BL-17, ADR-019) — **o backlog de produto está vazio**.

**Marco de retomada — 29/07/2026, fim da janela.** Nada pela metade. Conferido:
`pnpm typecheck`, `pnpm lint` (sem um aviso sequer) e `pnpm test` — **267 testes** (84 na API, 176 no
web, 7 no `@kindred/db`) mais **15 e2e** (rodam à parte, com banco). A árvore é a frente de trabalho
aberta, sem item de backlog formal: o usuário está olhando o desenho na base real e pedindo ajuste a
cada rodada (ADR-021, ADR-022, ADR-023). Falta commitar a chave genealógica (ADR-023:
`tree-layout.ts`, `TreePage.tsx`, o teste e estes documentos).

**Para subir tudo e olhar a árvore:** `docker compose up -d postgres`, um `.env` na raiz (copiado do
`.env.example`, com `PORT=3005` para casar com o `API_URL` do
[`.claude/launch.json`](../.claude/launch.json), que agora tem as duas entradas — `kindred-api` na
3005 e `kindred-web` na 5174) e os dois dev servers. O `.env` não vai para o git e não existia no
começo desta janela.

> 🔑 **A senha da conta com os dados reais foi trocada nesta janela, a pedido de quem é dono dela.**
> Para verificar o agrupamento de famílias (ver seção própria abaixo) contra a árvore de verdade, era
> preciso entrar na conta real — e a senha gerada por script (ver o aviso que existia aqui antes) não
> estava à mão nesta sessão. O dono da conta pediu, no próprio chat, para redefini-la com
> `pnpm db:reset-password dono@kindred.local <senha-nova>` (BL-17, ADR-019) e usá-la para entrar. A
> senha em si **não fica registrada aqui** — este repositório é público — e não é mais a gerada por
> script: é a que o dono escolheu na hora.
>
> **Os dois caminhos de sempre continuam valendo para trocar de novo.** Pela aplicação, sabendo a
> atual: tela `/account` (BL-16, `PATCH /api/auth/me`). Sem saber a atual, com acesso ao servidor:
> `pnpm db:reset-password dono@kindred.local` (BL-17, ADR-019).

> ⚠️ **O banco de dev tem dados reais.** Deixou de ser o seed de 23 pessoas fictícias: são ~150
> pessoas da família de quem usa o kindred, com fotos e notas — agora todas na conta acima. Antes de
> qualquer coisa destrutiva (`db:seed --force`, `db:reset`, `docker compose down -v`), rode
> **`pnpm db:backup`**. Precisa de dados de teste? Use um banco descartável (`createdb` +
> `DATABASE_URL=...`) ou o fixture anônimo — ver a sessão de backup mais abaixo.

## Onde a última sessão parou

**A árvore passou a empacotar por família, medindo distância por contorno** (ADR-022). Vendo o
resultado do ADR-021 na base real, o usuário apontou sobreposição por todo lado — "o fundo sutil fica
quase invisível" — e parentes de primeiro grau longe, com um caso nomeado (o Levi longe dos pais),
lembrando que o canvas é infinito e que a distância entre famílias é **piso, não teto**. Medindo:
244 pares de caixas sobrepostas, dois cartões a **19 px** um do outro e filhos a 3771 px do pai.

Duas causas, uma delas maior que o sintoma: o espaçamento trabalhava **um rank por vez**, sem saber a
largura da descendência; e **todas** as 54 pessoas com pai e mãe cadastrados têm os pais **sem união
registrada**, então o mecanismo de casal nunca disparava na base real — pai e mãe eram duas famílias
independentes (7163 px separavam os pais da pessoa central). Agora co-parentalidade é casal para o
layout (sem virar linha desenhada), cada família é um corpo rígido e a separação sai do contorno de
toda a descendência. Depois de tudo, uma passada separa árvores inteiras — uma família sem pais
visíveis é raiz no meio do desenho e o rank de cima não a vê. Medido depois: vizinho mais próximo em
**232 px exatos** (nenhum cartão sobre outro), caixas sobrepostas de 244 para 101 — 59 delas por
aninhamento inevitável —, Levi a 116 px do pai **e** da mãe. Detalhes, com o beco sem saída do
"satélite para cima" registrado para não repetir, no ADR-022.

**Como foi verificado, e o que dá para reaproveitar:** dá para rodar o layout contra a base real sem
entrar na conta — `psql` no container despeja as pessoas em JSON, um teste descartável roda
`computeLayout` com tudo expandido (o mesmo que "Abrir todos relacionamentos") e mede sobreposição,
distância pai-filho e largura por geração, além de renderizar a árvore em SVG. Foi assim que os números
acima saíram; o script era descartável, mas o caminho vale para a próxima mudança de layout.

**E a marca de família virou a chave genealógica** (ADR-023), fechando o "fundo sutil quase
invisível": a caixa agora envolve **só a fileira de irmãos**, com o casal fora dela e um traço
descendo do meio do casal até a marca. Como cada pessoa é filha de exatamente uma família, as caixas
**particionam** a árvore — sobreposição entre elas ficou impossível por construção, e não só rara: de
55 caixas com 101 pares sobrepostos para **20 caixas, zero sobreposição**, com um teste novo guardando
a propriedade.

Continua verdade (e não é defeito): a fileira de sete irmãos que têm, cada um, família grande embaixo
fica larga — é o preço de manter irmãos próximos e subárvores sem colisão.

Antes disso, na mesma janela: **as gerações da árvore passaram a ficar alinhadas** (ADR-021), continuação direta do agrupamento de
famílias: o usuário apontou que juntar irmãos não faz sentido sem os pais em cima deles e os filhos
embaixo. A resposta foi uma passada final de alinhamento (`alignGenerations`) sobre o que o
`spreadRanks` já fazia — quatro varreduras alternadas (cada bloco vai para o meio dos pais, descendo;
para o meio dos filhos, subindo), com o posicionamento de cada rank resolvido exatamente por
regressão isotônica (`packRank`) para respeitar `MIN_GAP`/`FAMILY_GAP` sem empurrar a família toda
para um lado. Duas coisas só apareceram verificando o desenho: sem **peso** nos destinos, um primo
sem filhos disputava o mesmo ponto com um casal e o tirava um `MIN_GAP` inteiro de cima dos próprios
filhos (daí `LOOSE_WEIGHT`); e reordenar o rank **subindo** jogava uma tia de primeiro grau para fora
de um ramo mais distante (daí a ordem se decidir só na descida). Detalhes no ADR-021.

A verificação foi por geometria, não pela base real: renderizei o layout em SVG antes e depois numa
família sintética de 28 pessoas e conferi número por número (menor distância no rank = `MIN_GAP`
exato; todo pai/mãe a meio passo do centro dos filhos). Conferir contra a árvore de verdade exigiria
a senha da conta do dono, e ninguém pediu para trocá-la nesta janela — o que estava em questão era a
geometria.

Antes disso, na mesma janela: **agrupamento de famílias na árvore fechou** (ADR-020), pedido direto do usuário fora do backlog —
ver a seção própria logo abaixo, com o antes-e-depois e o defeito achado no meio do caminho.

Antes disso, na mesma janela: **BL-17 fechou** (recuperar senha esquecida) — o último item do
backlog, e o backlog **zerou**. Sem
infraestrutura de e-mail no projeto, e com a conta real usando um domínio (`kindred.local`) que não é
entregável, o fluxo clássico de "link por e-mail" não era viável — a decisão foi um comando de CLI
(`pnpm db:reset-password <email> [senha-nova]`, ADR-019) que redefine a senha de uma conta existente e
derruba todas as sessões dela. Verificado contra um banco descartável: e-mail sem conta recusa com
mensagem clara, senha antiga passa a dar `401`, nova passa a dar `200`, sessões anteriores morrem
todas (sem "sessão de quem pediu" para preservar, diferente do BL-16 — aqui quem redefine está sempre
fora da conta, agindo pelo servidor). **A conta real não foi tocada.**

Antes do BL-17, na mesma janela: **BL-16 fechou** (trocar e-mail e senha da própria conta) — o item
que o incidente de credencial do BL-10 deixou urgente. `PATCH /api/auth/me` sempre exige a senha
atual (mesmo só para trocar o e-mail) e, ao trocar a senha, derruba as **outras** sessões da conta
mas preserva a que fez a troca
(RN-025). A tela `/account` chega pelo nome/e-mail no rodapé da sidebar, que virou link. Verificado
de ponta a ponta contra um **banco descartável** (nunca o real): unit tests, e2e com dois agentes
logados na mesma conta (um troca a senha, o outro perde a sessão), e pelo navegador de verdade — ver
a seção própria abaixo. **A conta real (`dono@kindred.local`) não foi tocada**: a troca da senha
gerada por script é do dono da conta, não desta sessão.

Antes do BL-16, na mesma janela: **BL-10 fechou** (multiusuário com login, ADR-018) — conta, sessão
por cookie, e toda `Person`/`Location`/`Union` isolada por dono. **A sessão que fechou o BL-10 não o
implementou** — ela **encontrou pronto**, sem commit, um BL-10 inteiro (código, migrations já
aplicadas no banco real, 245+13 testes passando) deixado por uma sessão anterior que encerrou sem
fechar: nem commit, nem handoff, nem a documentação (ADR, RN) que o próprio `CLAUDE.md` pede para
toda decisão de arquitetura. O trabalho daquela sessão foi conferir que nada estava quebrado ou meio
pronto, revisar o código linha a linha, testar de ponta a ponta contra a base real (só leitura) e
escrever a documentação que faltava — ver a seção própria abaixo, incluindo o incidente da senha.

Antes do BL-10, na mesma data: **BL-14** fechou — a isenção que o próprio ADR-014 tinha deixado em
aberto ("não há o que enxugar [na chamada sem paginação] sem mudar o contrato"). Uma conferência
campo a campo mostrou que árvore, calendário e os candidatos de um formulário nunca liam os objetos
aninhados de pai/mãe/local nem o parceiro por extenso de cada união — só os ids. O contrato mudou
(ADR-017): `PersonUnion.partner` virou opcional, e a chamada sem paginação passou a mandar `select`
em vez de `include`.

`pnpm typecheck`, `pnpm lint` e `pnpm test` verdes (**245 testes**: 79 na API, 161 no web e 5 no
`@kindred/db`), mais os **13 e2e** que rodam à parte, com banco.

### Coisas do ambiente que custaram tempo

- **A porta 3000 vive ocupada por outro projeto** nesta máquina (já foi o `coda`, já foi o
  `expense-analyzer`), e a 5173 também. A API do kindred foi rodada com
  `PORT=3005 pnpm --filter @kindred/api dev`, e o web com
  `API_URL=http://localhost:3005 pnpm --filter @kindred/web dev` para o proxy do Vite achá-la (o
  `--port` do Vite resolve o outro lado). Se o `docker compose up` reclamar de porta, é isso.
- **Encerrar os servidores por caminho do projeto, nunca por processo.** Um `pkill -f vite` numa
  destas sessões derrubou junto o dev server do projeto irmão que estava na 5173. O certo é
  `pkill -f "kindred/apps/web"` e `pkill -f "kindred/apps/api"`.
- O `pnpm` tem de ser chamado **direto**, nunca por `corepack` — já está no `CLAUDE.md`, mas foi o
  primeiro tropeço da sessão.
- **Um script que só imprime um segredo uma vez não pode rodar sem ninguém olhando.** É a lição do
  `db:backfill-owner` — ver o aviso de credencial no topo deste arquivo, e a seção "BL-10" abaixo.

## Sessão de 29/07 — agrupamento de famílias na árvore (ADR-020)

Pedido direto do usuário, com uma imagem de referência: agrupar visualmente cada família nuclear
(casal + filhos) na árvore, com distância maior e equidistante entre uma família e a próxima, em
qualquer geração — e parente de grau mais próximo (primo de primeiro grau) mais perto da pessoa
central que um de grau maior. O algoritmo de layout (`tree-layout.ts`, ADR-009) já separava os dois
ramos de sangue e mantinha irmãos juntos, mas o passo final de espaçamento tratava qualquer vizinho no
mesmo rank do mesmo jeito — sem noção de "família" nenhuma.

**Antes de escrever código**, três perguntas de escopo foram levadas ao usuário: a regra vale na
árvore inteira ou só no nível de tios/primos do mockup (**a árvore inteira**), o gap entre famílias é
quanto maior que o intrafamília (**~1,5×**), e além do espaçamento tem indicador visual (**sim, um
contorno sutil por família**). Dado o tamanho da mudança — o arquivo mais delicado do projeto, com
~20 testes de posição em pixel exato —, o trabalho passou por um plano escrito e aprovado antes da
primeira linha de código.

**O que entrou, todo em cima do algoritmo existente, sem reescrever nada:** `personalFamilyKey`
(a chave `fatherId|motherId`, promovida de dentro de `siblingGroups` para função reaproveitável),
`FAMILY_GAP` (`MIN_GAP × 1,5`, exportado), `buildStructuralDistances` (BFS a partir do central sobre
filiação e união, para saber quem está estruturalmente mais perto), `collectDependents` (a mesma forma
de `collectBranch` do ADR-009, só que descendo e lateral por `blockOf`) e `buildFamilyGroups` (a
bounding box de cada família, novo campo `familyGroups` no retorno de `computeLayout`). O detalhamento
completo, incluindo o porquê de cada peça, está no **ADR-020**.

**O defeito achado no meio do caminho, e por que a correção não foi óbvia.** A primeira versão também
juntava sogro/sogra/cunhado no mesmo `blockOf` do casal, achando que precisava disso para a cascata —
e isso quebrou justamente o teste que garante que ninguém se sobrepõe (`não deixa dois nós se
sobreporem em nenhuma geração`, do BL-13). Com o cunhado deixando de ser um bloco independente aos
olhos de `spreadRanks`, o deslocamento em bloco da família do cônjuge (mecanismo do ADR-009) passou a
poder pousar um cunhado exatamente em cima da pessoa central — porque o offset de irmãos e o
deslocamento do casal são ambos múltiplos exatos de `MIN_GAP`, e as duas coincidências se cancelavam
com frequência, não só nesse teste. A correção: reverter `blockOf` ao que já era (só o par
cônjuge-âncora) e resolver "é a mesma família" por comparação par a par (`sameFamily`, olhando irmandade
de sangue **ou** casamento entre qualquer membro de um bloco e qualquer membro do outro) em vez de uma
chave única por bloco — sogro e sogra nunca ganham a mesma `personalFamilyKey` (a união deles nunca
passa pelo laço âncora/convidado do `placeCouples`), mas continuam sendo reconhecidos como a mesma
família por estarem casados.

**Verificado em camadas.** Os 20 testes antigos de `tree-layout.test.ts` continuam exatamente como
estavam (nenhuma expectativa mudou); 5 novos cobrem fronteira de família (`FAMILY_GAP` exato), gap
intrafamília (`MIN_GAP`/`PASSO` exato), a cascata não distorcendo a forma interna de um ramo, a
ordenação por distância estrutural (com um cenário construído a propósito: primo de sangue mais perto
que um parente alcançado só por casamento, mais distante em saltos) e a bounding box de
`familyGroups`. Contra a **base real** (~150 pessoas): sem senha da conta guardada nesta sessão (ver
aviso no topo deste arquivo), o dono da conta pediu para redefini-la e testar de verdade — tios e
primos aparecem em caixas distintas, com o gap maior entre famílias visível a olho, checado em tema
claro e escuro, "Abrir todos relacionamentos" ligado, sem erro no console. Clicar ou passar o mouse no
contorno de uma família (decorativo, sem `NodeData`) não abre o card de detalhe nem quebra o hover de
ninguém — as guardas `node.type === 'person'` em `TreePage.tsx` cobrem exatamente isso.

## Sessão de 29/07 — recuperar senha esquecida (BL-17, ADR-019)

Continuação direta da sessão do BL-16, ainda na mesma janela: com a troca de senha pela aplicação
fechada, sobrava o outro lado do mesmo buraco — o que fazer se a senha se perder de vez, sem nem saber
a atual. Antes de escrever qualquer linha, uma pergunta de design que não tinha resposta óbvia:
recuperação por e-mail (o padrão do mercado) simplesmente não se sustenta aqui — o projeto não tem
nenhuma infraestrutura de envio, e a conta real usa `dono@kindred.local`, um domínio que não existe de
verdade. Construir a recuperação em cima de e-mail teria significado resolver um problema maior e não
pedido (deploy de e-mail transacional) para uma conta que nem teria como recebê-lo. A pergunta foi
levada ao usuário antes de decidir: três caminhos possíveis (código de recuperação gerado no cadastro,
comando de CLI, ou infraestrutura de e-mail de verdade) — a escolha foi **comando de CLI**, formalizar
o que já seria feito na mão.

**`pnpm db:reset-password <email> [senha-nova]`** (`packages/db/src/reset-password.ts`, ADR-019): acha
a conta pelo e-mail, grava um hash bcrypt novo, derruba **todas** as sessões da conta. Sem senha no
segundo argumento, uma é gerada e impressa uma vez só — mesmo padrão do `db:backfill-owner`. Recusa
com mensagem clara (e sai com código de erro) se o e-mail não corresponder a nenhuma conta — nunca
cria conta nova por engano. A lógica em si (`resetPassword`, exportada) ficou separada do `main()` da
CLI, para poder ter teste de unidade com um dublê de Prisma na mesma linha dos demais — sem isso, seria
mais um script como o `backfill-owner`, sem teste nenhum além de rodar na mão.

**Por que não é assunto de dentro da aplicação, e não só falta de tempo:** um endpoint de "esqueci
minha senha" sem e-mail de verdade por trás só teria duas formas de provar identidade — pergunta de
segurança (fraca, mais uma coisa para esquecer) ou nenhuma prova nenhuma. Nenhuma das duas bate o nível
de confiança que já existe em quem tem acesso ao servidor onde o Postgres roda. A decisão está por
escrito no ADR-019, incluindo a condição que a torna obsoleta: se um dia o kindred ganhar múltiplos
usuários reais com e-mail de verdade, aí sim é hora de e-mail transacional.

**Verificado contra um banco descartável** (`kindred_bl17`, criado e derrubado na hora, nunca a base
real): registro de uma conta de teste pela API, `db:reset-password` com senha explícita — login com a
antiga passa a dar `401`, com a nova, `200` — depois sem senha explícita, confirmando que uma é gerada
e impressa; e-mail sem conta correspondente recusa com mensagem e código de saída diferente de zero,
sem criar nada. Dois testes de unidade cobrem `resetPassword` isolado (e-mail sem conta, e a troca em
si só derrubando as sessões da conta redefinida, não de outras). **A conta real não foi tocada** —
nem para ler, desta vez: BL-17 não precisou abrir a base de produção em nenhum momento.

Com o BL-17 fechado, **o backlog de produto zerou** pela primeira vez desde que este arquivo existe.

## Sessão de 29/07 — trocar e-mail e senha da própria conta (BL-16)

Continuação direta da sessão do BL-10: o incidente da senha quase perdida (seção abaixo) deixou claro
que não dava para fechar a janela sem um jeito de trocá-la pela aplicação. O pedido foi explícito —
"implementa o BL-16 primeiro, depois eu troco a senha" — ou seja, construir e verificar a feature, mas
**nunca usá-la contra a conta real**: quem troca a senha de `dono@kindred.local` é o dono dela.

**Backend:** `UpdateMeDto` (e-mail e/ou senha nova, ambos opcionais, mas `currentPassword` sempre
obrigatória) e `AuthService.updateMe`, exposto em `PATCH /api/auth/me`. Duas decisões de segurança,
as duas já antecipadas pelo ADR-018 como lacuna:

- **A senha atual é conferida sempre**, mesmo trocando só o e-mail — a mesma defesa do `login`,
  reaplicada aqui: uma sessão sequestrada (XSS, computador compartilhado) não deveria conseguir
  assumir a conta de vez sem saber a senha.
- **Trocar a senha derruba as outras sessões, mas mantém a atual.** `session.deleteMany` com
  `{ userId, id: { not: hashToken(currentToken) } }` — o próprio token da sessão que pediu a troca é
  quem decide qual sessão sobrevive. Sem isso, trocar a própria senha se auto-deslogaria, o que não
  faz sentido nenhum para quem acabou de provar que sabe a senha nova.

**Testado em três camadas, nenhuma contra o banco real:**

- Unit (`auth.service.spec.ts`): senha atual errada (`401`), nem e-mail nem senha nova (`400`),
  e-mail já usado por outra conta (`409`), troca só de e-mail sem derrubar sessão, troca de senha
  mantendo a atual e derrubando as outras.
- E2e (`auth.e2e-spec.ts`), contra um banco descartável criado e derrubado na hora
  (`kindred_bl16`/`kindred_bl16_ui`): dois agentes logados na mesma conta, um troca a senha, o outro
  perde a sessão (`401` na próxima chamada) enquanto quem trocou continua autenticado; a senha antiga
  para de logar e a nova passa a logar.
- Navegador de verdade, API e web apontando para um terceiro banco descartável (nunca a porta 3000,
  que na máquina de dev já está ocupada por outro processo alheio a este projeto): cadastro → `/setup`
  → `/account` pelo link que virou o nome/e-mail no rodapé da sidebar → confirmação visual de cada
  validação (confirmação de senha que não bate, senha atual errada, sucesso) → confirmado por `curl`
  que a senha antiga passou a dar `401` no login e a nova, `200`.

**Frontend:** `UpdateMeData` em `@kindred/types` (faltava reexportar `auth.ts` inteiro em
`index.ts` — só `AuthUser`/`LoginData`/`RegisterData` estavam saindo, um esquecimento de quando o
BL-10 foi documentado), `authApi.updateMe`, `accountLoader` (mesmo padrão dos demais: independente,
busca `/auth/me` de novo em vez de reaproveitar o que o `layoutLoader` já buscou — nenhuma outra
página do app reaproveita loader de outra), rota `/account` dentro do `AppLayout`, e a página em si:
nome fixo, e-mail editável, senha nova opcional com campo de confirmação que só aparece quando há algo
para confirmar, senha atual sempre obrigatória.

## Sessão de 28/07 — multiusuário com login (BL-10, ADR-018), retomado de uma sessão que sumiu

Esta sessão começou com `git status` mostrando **27 arquivos modificados e 17 novos, nada staged** —
sem nenhuma lembrança de como chegaram lá. A notificação de tarefas em segundo plano dizia que 3
processos de shell da sessão anterior "podem ter sido encerrados quando o processo do Claude Code
anterior saiu" — ou seja, uma sessão (não commitada aqui, então sem transcript nesta conversa) tinha
implementado o BL-10 inteiro e morreu no meio, antes de fechar com cuidado.

**O primeiro trabalho não foi escrever código — foi descobrir o que já existia, com cautela.** Regra
de ouro deste tipo de situação: não presumir, não sobrescrever, investigar antes de agir. Nesta
ordem:

1. `git log`/`git status`/`git diff` para entender o tamanho e a forma da mudança.
2. Ler `_prisma_migrations` do banco **real** (só leitura) para saber se as migrations novas —
   `usuarios_e_donos` e `dono_obrigatorio` — já tinham sido **aplicadas de verdade**, não só
   escritas em arquivo. Tinham: `userId` já `NOT NULL` em `people`/`locations`, uma linha em `users`.
3. Ler o `backfill-owner.ts` para entender o que ele faz antes de assumir qualquer coisa sobre o
   estado dos dados.
4. Confirmar que a conta "dono original" (`dono@kindred.local`) existia de fato no banco real, e só
   então ir atrás da senha — que o script imprime **uma vez**, em texto puro, e nunca mais.

**A senha não estava em nenhum log de processo desta sessão** (todos vazios ou de outros comandos).
Foi achada com `grep` no **transcript bruto** das duas sessões anteriores
(`~/.claude/projects/.../*.jsonl`), na linha que o script imprime uma vez só: `senha gerada (guarde
agora, não é mostrada de novo): ...`. Sem esse grep, a conta "dono original" — com as ~150 pessoas
reais dentro — ficaria inacessível pela aplicação, porque **não existe recuperação de senha nem troca
de credencial ainda** (viraram BL-16 e BL-17 no backlog). A senha em si **não foi escrita neste
arquivo** — este repositório é público; foi passada direto no chat de quem estava na sessão. Ficou só
o aviso, no topo deste arquivo.

**Depois de recuperar a senha, a verificação do código em si — e ele estava sólido.** Revisão
linha a linha de `auth.service.ts`/`auth.controller.ts`/`session.guard.ts` e do escopo por `userId`
em `people.service.ts`/`unions.service.ts`/`locations.service.ts`, mais:

- `pnpm typecheck` e `pnpm test` limpos de primeira: 245 testes (79 API, 161 web, 5 `@kindred/db`).
- `pnpm lint`: só 3 avisos, todos `req.cookies` (tipado `Record<string, any>` pelo
  `@types/cookie-parser` — não tem como saber o formato de um cookie sem parsear) e um `let user`
  sem anotação. Corrigidos: um `sessionToken(req)` central em `cookie.ts` no lugar do cast repetido
  três vezes, e `let user: AuthenticatedUser`. Lint voltou a zero.
- **13 e2e**, rodados contra um banco descartável (nunca o real): o ciclo
  registro→`/me`→logout→`/me` com cookie `httpOnly` de verdade, `/api/health` público mesmo com o
  guard global, e principalmente **"duas contas nunca enxergam a pessoa uma da outra"** — cria pessoa
  na conta A, confere que a conta B não a lista **nem consegue acessá-la pelo id** (`404`, não
  `403`). Reaplicados depois da correção do lint, para confirmar que o refactor do cookie não mudou
  comportamento.
- Round-trip completo **contra a base real**, só leitura: login via `curl` com a senha recuperada →
  `200` e cookie de sessão → `GET /api/people` com esse cookie devolve as ~150 pessoas, com
  parentesco calculado certo. Depois, o mesmo pelo **navegador de verdade**: tela de login, e-mail e
  senha recuperados, `/people` carrega a lista inteira, sidebar mostra "Dono original" e o botão de
  sair.

**O que a sessão anterior tinha deixado pronto e testado, mas não documentado, nem commitado — nada
disso.** Nenhum ADR, nenhuma RN, `docs-tec/00-visao-tecnica.md` ainda dizia "não há autenticação",
`docs/01-visao-do-produto.md` listava "múltiplos usuários" como não-objetivo. Escrito nesta sessão:
**ADR-018** (o modelo de isolamento, sessão por cookie, o porquê de guard global com `@Public()` como
exceção, e a migração em três passos — nullable → backfill → `NOT NULL`), **RN-022 a RN-024**
(isolamento por conta, 404 nunca 403, sessão de 30 dias fixos), e a atualização de
`00-visao-tecnica.md` (rotas `/api/auth/*`, toda rota exige sessão por padrão),
`02-modelo-de-dados.md` (`users`/`sessions`, `userId` em `people`/`locations`, os três passos da
migração), `01-visao-do-produto.md` e `README.md`.

## Sessão de 28/07 — enxugar a chamada sem paginação (BL-14, ADR-017)

O ADR-014 já tinha resolvido a listagem paginada (varredura enxuta + includes só da página) e deixado
escrito que a chamada **sem paginação** (`GET /api/people` sem query params) continuava trazendo pai,
mãe, local e o parceiro de cada união por extenso, "sem o que enxugar ali sem mudar o contrato". BL-14
era essa conferência: será que os três consumidores dessa chamada — `TreePage`, `CalendarPage` e os
candidatos a pai/mãe/cônjuge do `PersonFormPage` — realmente leem esses campos?

**Não liam.** `tree-layout.ts` e `person-relations.ts` (o card de detalhe) resolvem pai/mãe/irmãos
pelo `fatherId`/`motherId` na própria lista, e o cônjuge pelo `partnerId` de cada união — nunca pelos
objetos aninhados que o `include` do Prisma vinha trazendo. `PersonFormPage` usa a lista só para
`id`/`name` dos candidatos. O único lugar que lê `union.partner.name` por extenso é o próprio
`PersonFormPage`, mas para a pessoa que está **editando** — e essa vem de `GET /people/:id`
(`findOne`), uma chamada diferente, que ficou como estava.

A troca: `include: INCLUDE` virou `select: LIST_SELECT` (os mesmos campos da varredura do ADR-014,
mais notas, foto e uniões — mas as uniões com `select`, só o id do parceiro). Uma segunda função,
`withUnionRefs`, faz a mesma normalização de lado do par que `withUnions` (RN-011), sem montar
`partner`.

**O contrato mudou de propósito, sem rota nova.** `PersonUnion.partner` virou opcional no
`@kindred/types` — marcar a ausência é mais honesto que continuar prometendo um campo que a metade
das chamadas não manda mais. Isso quebrou o typecheck em exatamente um lugar
(`PersonFormPage.tsx`, que lê `union.partner.name` na tela de uniões), corrigido com um cast local
comentado — não um `!`, que apagaria o aviso se esse componente um dia passasse a ler uniões de outra
fonte.

**Verificado rodando:** criada uma união temporária entre duas pessoas de teste para comparar os dois
formatos lado a lado — a lista sem paginação devolveu `{id, status, startDate, endDate, partnerId}`;
o `GET /people/:id` da mesma pessoa devolveu o parceiro por extenso, como sempre devolveu. Árvore,
calendário e o card de detalhe seguiram funcionando sem nenhuma mudança de código no lado do web — a
prova de que o corte não tirou nada que alguém usasse. A base real (143 pessoas, sem nenhuma união
cadastrada ainda) voltou exatamente como estava depois do teste.

## Sessão de 28/07 — card de detalhe ao clicar num nó da árvore

Pedido direto do usuário, sem passar pelo backlog: "clicar numa pessoa na árvore" abre um painel à
direita com nome, notas, nascimento, pai, mãe, filhos e irmãos, e um botão que leva para
`/people/:id/edit`.

**A família mostrada é a de verdade, não só quem está desenhado.** `relationsOf` (novo
`person-relations.ts`) busca pai/mãe/filhos/irmãos na lista **inteira** de pessoas do loader, não nos
nós visíveis da árvore — então clicar em alguém cujos pais nunca foram expandidos ainda mostra quem
são. É módulo puro, sem reactflow, seguindo o mesmo caminho que `tree-layout.ts` (ADR-009) e
`calendar-entries.ts` já tinham aberto: lógica que pode ser testada sem jsdom sai da página.

**Clicar num parente listado troca o card para ele**, sem sair da árvore nem navegar — foi além do
pedido original (que só falava em mostrar informação), mas é o tipo de interação óbvia para um card
de família: ver o pai leva a querer ver os pais *dele*. `PersonDetailPanel` é só apresentação —
recebe `relations` prontas e dispara `onSelectPerson`, `onClose`.

**Verificado que `elementsSelectable={false}` não bloqueia `onNodeClick`** — a suspeita óbvia antes de
mexer, já que aquela prop está lá desde sempre para desligar a seleção visual do reactflow. Não
bloqueia; são coisas independentes. Testado contra a **base real** (só leitura): abrir o card do
usuário central mostra pai, mãe, 0 filhos e 2 irmãos certos; clicar no pai troca para o card dele,
com os avós e o tio dele carregados na hora — pessoas que não estavam desenhadas na árvore; fechar
funciona pelo ×, e pelo clique no fundo (`onPaneClick`). Tema claro e escuro conferidos.

**Duas datas duplicadas viraram um módulo (`date.ts`).** `parseDateOnly`/`formatDate`/`getAgeInYears`
já existiam soltos dentro do `PeopleListPage`; o card ia precisar dos dois primeiros de novo. Em vez
de copiar pela segunda vez, os três saíram para `apps/web/src/date.ts` — inclusive `getAgeInYears`,
que ninguém mais usava ainda, mas ia crescer para três cópias assim que o card mostrasse idade. O
`parseDateOnly` existe porque `new Date("2026-01-01")` sozinho cai um dia antes num fuso negativo; o
teste novo (`date.test.ts`) prende exatamente esse caso.

## Sessão de 28/07 — exportar e importar pela tela (BL-06, ADR-016)

O que faltava do BL-06 era só a exposição: o formato do arquivo, coletar cada modelo e restaurar já
existiam desde o backup (ADR-013). `GET /api/backup` e `POST /api/backup/restore` **são** o mesmo
`buildBackupPayload`/`buildRestoreOperations` do `@kindred/db`, sem passar por disco — baixar pelo
navegador e rodar `pnpm db:backup` produzem o mesmo arquivo, e um serve para restaurar o outro.

A diferença real que a API precisava e o CLI nunca teve: **restaurar virou transação** (RN-021). O
CLI apagava e recriava com `await` sequencial — tolerável quando quem confirma `--force` escreveu o
arquivo minutos antes. Pela web, o arquivo pode vir de qualquer lugar, então a saída foi trocar o
laço por um array de `PrismaPromise` que vai inteiro para `$transaction([...])` — a mesma forma batch
que `setCentral` já usa, sem precisar do tipo de cliente de transação interativa, porque nenhuma
operação depende do resultado de outra (os ids já vêm prontos do arquivo).

Na tela: `/backup`, com duas seções. Exportar baixa o arquivo. Importar lê o arquivo **no navegador**
antes de mandar (mostra "141 pessoa(s), 4 local(is)..." de cara), tenta restaurar sem `force`, e se o
banco já tem gente, mostra a mensagem que a API devolveu — a mesma RN-021 — com um botão vermelho
"Apagar e restaurar" e um "Cancelar". Depois de restaurar, a página redireciona de verdade (não é
`useRevalidator`): central, pais, fotos, tudo pode ter mudado, e uma navegação real garante que todo
loader da rota roda de novo.

**Um defeito achado escrevendo o teste automatizado, antes de qualquer coisa manual:** o `/backup`
estava dentro do mesmo layout que redireciona para `/setup` quando não há pessoa central — e é
justamente sem pessoa central que alguém mais precisaria restaurar um backup. O `layoutLoader`
ganhou uma exceção de uma linha para esse caminho, e o `/setup` ganhou um link "Restaurar em vez de
cadastrar" para quem chega lá sem saber que `/backup` existe.

**A prova de que "tudo ou nada" funciona de verdade**, não só na intenção: um arquivo com uma união
apontando para gente inexistente, mandado com `force=true` contra uma base de 141 pessoas (banco de
teste, nunca o real), derrubou a transação com 500 — e a base **continuou com as 141 pessoas
originais**, nem vazia nem pela metade. É a garantia que a versão sequencial do CLI nunca teve como
dar, e não dá para provar com um Prisma dublê (ele não sabe fazer rollback de verdade); só rodando
contra um Postgres de teste.

## Sessão de 28/07 — a árvore vazia ao abrir tudo (BL-15, fechado)

O botão **"Abrir todos relacionamentos"** deixava a árvore vazia na base real (143 pessoas): fundo,
painéis e legenda no lugar, e nenhum nó. Com o seed de 23 pessoas nunca aconteceu.

**Medir antes de mexer valeu de novo, e a primeira suspeita estava errada.** O palpite era o `fitView`
pedindo um zoom abaixo do `minZoom={0.04}`. Rodando o `computeLayout` **fora do navegador** com os
dados reais: 117 nós, **nenhuma posição não-finita**, caixa de 11551×1408, e o zoom necessário seria
**0.082** — bem acima do piso. O layout estava são; a culpa era de outro lugar.

No navegador, a resposta em uma linha: os 117 nós **estavam lá**, nas posições certas, e a viewport
continuava em `matrix(2.5, …, 217.5, 215)` — o zoom e o deslocamento de quando havia **um nó só**. A
2,5×, um nó em x=4638 cai em x≈11812 na tela. O `fitView` nunca pegou.

**Por quê:** ele era chamado por cronômetro (`setTimeout(…, 20)` no efeito e `(…, 50)` no botão), e o
reactflow só sabe calcular os limites do desenho **depois de medir** os nós. Sem largura e altura ele
desiste **em silêncio** e deixa a viewport como estava. Com 23 pessoas o prazo dava; com 143, não —
era uma aposta no tamanho da base.

A correção troca o palpite pelo sinal: `useNodesInitialized()` do próprio reactflow, que vira `true`
quando a medição termina. Sem prazo a chutar, e os dois `setTimeout` saíram.

**O que ficou provado rodando**, contra a base real: os 117 nós enquadrados, zoom final **0.0866** (o
cálculo sem navegador previa 0.082) e **117 de 117 dentro da viewport**.

**Uma armadilha do ambiente, não do código:** no painel de navegador embutido a aba fica
`visibilityState: "hidden"` entre uma captura e outra, e aí o `requestAnimationFrame` não roda — a
animação do `fitView` (`duration: 350`) congela no meio e a tela parece vazia mesmo com a correção
aplicada. Foi o que quase mandou a investigação para o buraco errado. O jeito de ler a medição é
tirar uma captura **antes** de medir: é ela que traz a aba de volta.

## Sessão de 28/07 — tema escuro e a reforma dos campos (ADR-015)

O pedido foi tema escuro "seguindo a referência do **coda**", o projeto irmão. Duas coisas foram
decididas com o usuário antes de escrever:

| Decisão | Escolha |
| --- | --- |
| quanto da estética do coda vem junto | **só a mecânica** — o claro continua o cinza-e-índigo de sempre, e o escuro nasce dessa família. O "papel quente" e a serif do coda ficaram de fora |
| onde fica o seletor | **rodapé da sidebar**, segmentado claro/escuro/sistema; recolhida, vira um botão que alterna |

O trabalho de verdade não foi o escuro, foi o **antes dele**: havia 80 hex no `index.css` e mais 86
espalhados por `style={{}}` nos componentes. Todos viraram token semântico
(`--surface`, `--muted`, `--danger-soft`), e o tema escuro é um segundo bloco que redefine os mesmos
nomes. Nenhuma regra ficou escrita duas vezes.

Como funciona, em uma frase cada: a preferência (claro/escuro/**sistema**) mora no `localStorage`; o
valor **aplicado** é sempre `light`/`dark`, resolvido em JS (`theme.ts`) e escrito em `data-theme` no
`<html>`; **não há media query de paleta no CSS** — se houvesse, "escolhi claro num SO escuro"
precisaria vencê-la a cada regra nova; e um script inline no `index.html` aplica tudo **antes da
pintura**, senão a tela pisca clara até o bundle carregar.

**Os campos ganharam mais do que cor**, que era a outra metade do pedido:

- a regra passou a valer no **app inteiro**, não só dentro de `.form-group` — os controles de união
  vivem soltos num `fieldset` e estavam com a aparência crua do navegador ao lado dos outros;
- o **`<textarea>` das notas nunca teve estilo nenhum**: a regra antiga cobria só `input` e `select`;
- a seta do `<select>` passou a ser nossa (`appearance: none`), porque a nativa não muda de cor;
- foco com anel, `:disabled` com opacidade, `input[type=file]` com botão estilizado — nada disso
  existia;
- `color-scheme` acompanha o tema, então seletor de data, checkbox e barra de rolagem vêm escuros sem
  uma linha de CSS.

**O reactflow precisou de dois caminhos, e a diferença é o que morde aqui:** as arestas recebem
`style` **inline**, e estilo inline resolve `var(...)` normalmente — então `EDGE_COLORS` virou
`var(--tree-edge-*)`. Já o pontilhado do fundo é o `color` do `<Background/>`, que o reactflow põe
como **atributo de apresentação** no SVG, e atributo **não** entende `var(...)`; esse foi para o CSS,
que vence o atributo.

**A única mudança visível no tema claro:** o `.card` ganhou borda. No claro é quase invisível; no
escuro é o que separa o cartão do fundo, porque sombra sobre fundo escuro não separa nada.

**A armadilha que isto deixa:** cor nova escrita direto no componente funciona — e só quebra no outro
tema, que ninguém abre no mesmo minuto. Não há lint que pegue; o que pega é
`grep -rE '#[0-9a-fA-F]{6}' apps/web/src --include='*.tsx'` não devolver nada. A única exceção
legítima é o `photo.ts`, que pinta de branco o fundo do JPEG ao achatar um PNG transparente — isso é
conteúdo gravado no banco, não cor de tela.

**Um defeito meu, achado ao escrever teste:** o dublê do `prefers-color-scheme` aceitava
`removeEventListener` sem remover nada, e por isso reprovou um componente correto. O dublê agora
remove de verdade — e é justamente isso que faz o teste "escolha explícita não acompanha o SO"
afirmar alguma coisa.

## Sessão de 28/07 — a listagem parou de arrastar a base inteira (BL-09, fechado)

A metade que faltava do BL-09. O `GET /api/people` carregava **todas** as pessoas com pai, mãe,
local, uniões e foto para devolver dez — e a página 250 custava o mesmo que a primeira, porque o
custo não dependia da página.

Agora são duas consultas (ADR-014): uma **enxuta** varre a base com só o que o parentesco, a busca e
a ordenação precisam (sem nenhum join), e a segunda busca os `include` **só dos ids da página**.

| requisição | antes | depois |
| --- | --- | --- |
| página 1 | 202 ms | **39 ms** |
| página 250 | 202 ms | **36 ms** |
| busca por nome | 206 ms | **31 ms** |
| ordenar por idade | 201 ms | **35 ms** |
| lista inteira (árvore) | 250 ms | 252 ms — de propósito |

Medido numa base de bench de **5000 pessoas**, criada e derrubada na hora — a base real não foi
tocada. As cinco respostas foram capturadas antes e depois e conferidas **byte a byte**: idênticas.

**A armadilha que a mudança introduz**, e que tem teste: `where: { id: { in } }` não promete ordem. A
ordenação é decidida sobre as linhas enxutas, então a segunda consulta precisa ser remontada contra
ela — esquecer devolve a página embaralhada, sem erro nenhum. O teste entrega as linhas na ordem
inversa de propósito. É o primeiro teste do `people.service` (6 casos, com um Prisma dublê).

O que sobrou — a árvore e o calendário ainda recebem 7,5 MB — virou **BL-14**: mexe no contrato da
API, então não cabia emendar aqui.

## Sessão de 28/07 — backup, restauração e fixture anônimo (ADR-013)

O pedido chegou como "salve meus dados atuais no seed, mas não quero minha família num repo público".
São **dois problemas com respostas diferentes**, e juntá-los num só lugar falha nos dois: o seed vive
no repositório (público) e é reescrito quando o schema muda, então não serve de backup; e dado real
não serve de fixture, porque expõe pessoas e envelhece. O medo declarado era concreto: **perder o
volume do Docker** e ir junto o progresso da árvore.

| Comando | O que faz | Onde grava |
| --- | --- | --- |
| `pnpm db:backup` | copia a base inteira | `../kindred-backups` (fora do repo; `KINDRED_BACKUP_DIR` muda) |
| `pnpm db:restore <arquivo>` | devolve a base | no banco do `DATABASE_URL` |
| `pnpm db:anonymize` | copia só a **forma** | `packages/db/fixtures/anonimizado.json`, versionado |

Backup é **JSON pelo Prisma**, não `pg_dump` — o `pg_dump` mora no container, e é o container que se
quer sobreviver. Guarda os ids originais, então restaurar devolve o mesmo grafo, não algo parecido.

**Três travas, e cada uma existe por um motivo:**

1. O backup **se recusa a gravar incompleto**: lê o `Prisma.dmmf` e cobra todo campo escalar de cada
   modelo. Campo novo no schema que ninguém exportou derruba o backup na hora — em vez de sumir em
   silêncio e aparecer só na restauração, quando o original já não existe. É o único teste do
   `@kindred/db` (5 casos).
2. `db:restore --force` **faz backup antes** de apagar.
3. O `.gitignore` barra `kindred-*.json` na raiz, com exceção de `packages/db/fixtures/` — testado
   com um arquivo real solto no repo.

**O que ficou provado rodando, não presumido:** backup da base real → restore num banco descartável →
backup de novo → **JSON byte a byte idêntico**, incluindo ids, carimbos, filiação e os bytes das
fotos. A base real não foi tocada em momento nenhum.

O fixture anônimo saiu **no mesmo formato do backup**, então carregar é o `db:restore` — não há um
segundo caminho de importação para manter. Auditoria do arquivo contra a base real: nenhum nome,
nenhuma nota, nenhuma foto, nenhuma cidade e nenhum id em comum, e nenhuma data de nascimento
intacta; a estrutura bate em tudo (141 pessoas, 71 com pai, 79 com mãe, 42 falecidas, 1 central).

**Dois defeitos meus, achados na conferência:** o jitter das datas ia de −10 a +10 e portanto era
**zero** para uma pessoa em cada 21 — data de nascimento exata passaria intacta ao lado de um nome
falso; agora o deslocamento nunca é zero. E o `db:restore` com caminho **relativo** não achava o
arquivo, porque o `pnpm --filter` executa em `packages/db`; passou a resolver contra o `INIT_CWD`, que
é de onde o comando foi chamado — o tipo de detalhe que só apareceria na hora de recuperar algo.

## Sessão de 28/07 — o parentesco deixou de ser quadrático (BL-09, parcial)

O BL-09 estava escrito culpando a consulta. **Medindo antes de mexer, a culpa estava no lugar
errado** — com 5023 pessoas, o `computeKinship` para a lista toda levava **2280 ms** e o `findMany`
com todos os includes, 167 ms. A consulta era 7% do custo.

O motivo: `computeKinship` chamava `buildGraph(allPeople)` **a cada pessoa** e fazia uma busca em
largura por pessoa, quando uma única busca a partir da pessoa central já visita todo mundo. Havia um
segundo custo quadrático escondido — a fila da busca andava com `queue.shift()`, O(n) em array.

Entrou o `createKinshipResolver` (ADR-012): prepara o grafo e as travessias uma vez, devolve uma
função que responde por consulta a mapa. **2280 ms viraram 1 ms** (1708×), com resposta idêntica nas
5023 pessoas. O `GET /api/people` dessa base responde em ~190 ms.

**Isto foi decidido com o usuário: só o custo quadrático nesta rodada.** A consulta pesada (os ~170 ms
que sobram) continua no backlog, com o caminho já medido — consulta enxuta 21 ms + página com
includes 2 ms.

Dois testes guardam a otimização: um compara o resolver com o cálculo pessoa a pessoa para **todas**
as pessoas do cenário, e outro conta as leituras do grafo para garantir que responder não volta a
percorrê-lo. Cronômetro em teste seria instável; contar leitura, não.

## Sessão de 28/07 — falecimento no calendário (BL-07)

O calendário só olhava nascimento, e filtrava quem morreu **inteiramente** — nem a data de nascimento
deles aparecia. Agora são **três** datas distintas (RN-020): aniversário de vivo (🎂 índigo),
aniversário de quem já se foi (🎂 lilás dessaturado) e falecimento (🕯️ cinza quente). Uma legenda
embaixo da grade diz qual é qual.

Três decisões foram tomadas com o usuário antes de escrever:

| Decisão | Escolha |
| --- | --- |
| o que mostrar de quem faleceu | **as duas datas** — o "hoje ele faria X anos" é o tipo de lembrança que justifica o produto |
| o rodapé | **duas listas** — próximos aniversários e próximas datas de falecimento, porque respondem a perguntas diferentes |
| filtro | **sim, ligado por padrão** — desligar devolve o calendário ao que ele era |

A conta saiu da página para [`calendar-entries.ts`](../apps/web/src/pages/calendar-entries.ts) —
módulo puro, mesmo caminho que o `tree-layout.ts` seguiu no BL-12 — e ganhou **18 casos** sem precisar
de jsdom. A página ficou só com o desenho.

**O que morde aqui:** quem tem `deceased: true` mas nenhuma data de falecimento (RN-006) entra só
pelo nascimento; e quem tem data de morte mas não de nascimento entra só pelo falecimento. As duas
pontas têm teste, porque é o tipo de caso que um `if` mal escrito engole em silêncio.

**Um teste antigo mudou de lado, de propósito:** `quem morreu sai do calendário e da lista` descrevia
exatamente o comportamento que o BL-07 veio derrubar, e foi substituído. Outro precisou passar a
procurar **dentro da grade** — o `title` agora existe também nas células do rodapé, e a busca na
página inteira achava as duas.

## Sessão de 28/07 — notas por pessoa (BL-05)

Cada pessoa ganhou um campo de **texto livre** — de onde veio a amizade, histórias — cobrindo o
`friendshipOrigin` que a spec original pedia e nunca chegou ao schema.

Três decisões foram tomadas com o usuário antes de escrever código, e são o que explica a forma:

| Decisão | Escolha | Por quê |
| --- | --- | --- |
| campo ou entidade | **campo `notes` em `people`** | uma nota por pessoa basta para uma base pessoal; notas datadas virariam um diário e mudariam a tela |
| busca casa a nota? | **não** | resultado que casa por um trecho de texto longo não se explica sozinho; a RN-016 segue com nome, grau e rótulo social |
| viaja na listagem? | **sim, com teto de 2000** | é o teto que torna isso seguro — sem ele, cai no problema que tirou a foto de lá (ADR-011) |

| Camada | O que entrou |
| --- | --- |
| `packages/db` | `notes String?` em `Person`; migration `20260728120000_notas_por_pessoa` (aditiva, sem backfill); três notas no seed |
| `packages/types` | `notes` na `Person` e na `PersonFormData` |
| `apps/api` | `NOTES_MAX_LENGTH` + `@MaxLength` no `CreatePersonDto`; `notes` no `create` e no `update` |
| `apps/web` | `<textarea>` com contador de caracteres no `PersonFormPage`, e três casos de teste |

**O teto de 2000 mora em dois lugares de propósito**, e não no `@kindred/types`: aquele pacote é só
tipos, sem valor em runtime (ADR-005). A API valida; o web tem a própria cópia só para avisar antes.
Mexeu num, mexa no outro.

**Detalhe que se repete do resto do formulário:** campo em branco vira `null`, não `""` (RN-009) — o
`Transform` do DTO e o `trim()` do submit fazem isso dos dois lados, então "apagar a nota" e "não
mandar nota" acabam no mesmo lugar.

## Sessão de 27/07 — união conjugal (BL-01)

Cônjuge deixou de ser rótulo e virou vínculo. O valor `WIFE` saiu do `RelationshipType` e entrou a
tabela `unions` (`partnerA`/`partnerB`, `status`, `startDate`, `endDate`) — o porquê está no
**ADR-008**, e o resumo é que um `spouseId` não teria onde guardar que a união acabou.

| Camada | O que entrou |
| --- | --- |
| `packages/db` | modelo `Union` + enum `UnionStatus`; migration `20260727120000_uniao_conjugal` (backfill do `WIFE` → `FAMILY` + união com a pessoa central, **antes** de remover o valor do enum); seed com três uniões, uma delas desfeita |
| `packages/types` | `union.ts` — `UnionDto`, `UnionStatus`, payloads de criação/atualização |
| `apps/api` | módulo `unions/` (CRUD + validações RN-011/RN-014); `people.service` carrega as uniões e as passa ao cálculo |
| `apps/api` | `kinship.util.ts` reescrito: BFS de sangue separada da rotulagem, com um salto de afinidade por cima (RN-012/RN-013) |
| `apps/web` | `api/unions.ts` e a seção **Uniões** no `PersonFormPage` (recurso próprio, age na hora — não espera o submit da pessoa) |

Afinidade **só atravessa união vigente**: ao marcar a união como desfeita, a esposa vira "Ex-esposa"
e o sogro volta a ser "Parente distante". Foi verificado rodando, ponta a ponta.

## Sessão de 27/07 — casais na árvore (BL-12)

A outra metade: a árvore passou a desenhar as uniões. O layout saiu do `TreePage` para
[`tree-layout.ts`](../apps/web/src/pages/tree-layout.ts) — módulo puro, sem React nem reactflow em
runtime — e virou o **primeiro teste de front do projeto** (`tree-layout.test.ts`, 10 casos no
Vitest). O porquê das duas escolhas de layout está no **ADR-009**:

- o cônjuge é encostado no par **depois** do dagre (união não é geração);
- havendo duas uniões, os lados alternam — a vigente para fora, a ex para o outro lado, com o par no
  meio. Empilhadas, a linha da ex passava por trás do card da atual;
- o passe de espaçamento de cada geração trata o casal como **um bloco**, senão enfia um irmão entre
  marido e mulher.

Há um filtro **Com cônjuges** ao lado do "Com irmãos", e a legenda ganhou união vigente (linha cheia)
e desfeita (tracejada).

## Sessão de 27/07 — a linha do cônjuge (BL-13)

O cônjuge deixou de ser folha: ganhou os mesmos botões de todo mundo, e o "+" abre sogro e sogra, o
"↔" traz os cunhados. A família dele **só entra quando é pedida** — a árvore continua de sangue por
padrão.

O problema real era o rank. O dagre não sabe que uma união liga duas pessoas, então o cônjuge sem
filhos na árvore fica solto e vai para o topo, levando o sogro junto — ele apareceria acima dos
próprios avós da pessoa central. Resolver dentro do dagre não dá: `minlen: 0` (aresta de mesmo rank)
**quebra o layout**, verificado à parte antes de escolher o caminho. A saída foi deixar o dagre
arrumar a família do cônjuge entre si e deslocar esse **grupo inteiro**, em x e em y, junto com o
cônjuge (ADR-009).

## Sessão de 27/07 — busca sem acento (BL-03)

A busca já ignorava caixa; agora ignora acento também, nos dois sentidos (RN-016). A normalização
virou [`search.util.ts`](../apps/api/src/people/search.util.ts) — `NFD` para separar a letra do
acento e `\p{Diacritic}` para apagar só a marca — e o `people.service` passa **os dois lados** pela
mesma função: o termo digitado e cada um dos três campos casados (nome, grau, rótulo social).

Normalizar só o termo não bastaria: um "Jose" cadastrado sem acento ficaria invisível para quem
digita "José". Como o filtro é em memória (BL-09), a mudança não tocou o banco — quando a busca for
para o SQL, ela cobra `unaccent` junto.

## Sessão de 27/07 — dados por loader de rota (BL-11)

O front deixou de buscar dados em `useEffect`. O router virou *data router*
(`createBrowserRouter`), cada rota ganhou um loader em [`loaders.ts`](../apps/web/src/loaders.ts), e
a página só lê o resultado com `useLoaderData`. Depois de uma escrita, quem recarrega é
`useRevalidator()`. O porquê e os três desdobramentos estão no **ADR-010**.

| Arquivo | O que mudou |
| --- | --- |
| `main.tsx`, `routes.tsx` | `RouterProvider` + `createBrowserRouter`; o `/setup` fora do layout |
| `App.tsx` | virou só a moldura (`AppLayout` com `<Outlet/>`); o desvio para o `/setup` é o loader do layout |
| `PeopleListPage` | busca, ordenação e página passaram a morar na **URL**; `people-list-query.ts` lê e valida |
| `PersonFormPage` | só o formulário continua em estado local; as uniões vêm do loader |
| `TreePage` | o desenho virou `useMemo` (o `computeLayout` é puro), e "árvore vazia" virou coisa derivada |
| `CalendarPage` | o mês navegado deixou de ser um `Date` em estado e virou par de números |
| `eslint.config.js` | as duas regras rebaixadas a aviso **saíram**: o padrão do plugin é erro, e não há exceção no código |

Também saiu `@types/react-router-dom` (v5), que sobrava desde o começo — o v7 traz os próprios tipos.

**O defeito que apareceu no caminho:** o campo de busca corre à frente da URL até o debounce
alcançar, e precisa se realinhar quando a URL muda por fora. Comparar o campo com a URL não basta —
a resposta do próprio debounce conta como mudança e apaga o que foi digitado enquanto a busca ia e
voltava. A página guarda o último termo **enviado** e só se realinha quando a URL discorda dele.

## Sessão de 27/07 — testes das páginas (BL-08)

O front saiu de 2 arquivos de teste para 9, e de 16 casos para 68. Entraram `jsdom`,
`@testing-library/react` e `user-event`; o Vitest passou a ter `environment: 'jsdom'` e um
`test-setup.ts` (limpeza entre testes e um `ResizeObserver` de mentira, que o reactflow pede).

Montar uma página é montar uma **rota**: `createMemoryRouter` com o loader de verdade e o módulo de
API trocado por `vi.mock`. Isso só é possível porque os dados vêm de loaders (ADR-010) — antes, a
página buscava sozinha e não havia costura por onde entrar. O detalhe está em
[`03-testes-e-ci.md`](03-testes-e-ci.md).

**Dois achados, e nenhum deles era sobre teste:**

1. **O defeito do BL-11 não estava corrigido.** A correção da sessão comparava o campo de busca com a
   URL a cada render; entre mandar a busca e o loader responder, a URL ainda mostra o termo velho, e
   essa comparação apagava o que tinha sido digitado nesse intervalo. Foi o teste de regressão — que
   segura a resposta da API no ar de propósito — que mostrou. Agora a página detecta a **mudança** de
   URL contra o render anterior, e só realinha o campo quando o termo novo não é o que ela mesma
   pediu.
2. **Os rótulos não estavam ligados aos campos.** Nenhum `<label>` tinha `htmlFor`, e os selects das
   uniões não tinham nome nenhum — clicar no rótulo não focava o campo e um leitor de tela não sabia
   dizer o que era cada um. Procurar elemento pelo rótulo no teste é o que fez isso aparecer.

## Sessão de 27/07 — foto de perfil de verdade (BL-02)

A foto era uma URL para uma imagem hospedada em outro lugar. Agora é arquivo, e o arquivo fica no
Postgres — o porquê (backup, tabela à parte, base64 no JSON) está no **ADR-011**.

| Camada | O que entrou |
| --- | --- |
| `packages/db` | modelo `PersonPhoto` (`bytes`, `mimeType`, PK = `personId`, cascata); migration `20260728001800_foto_de_perfil`, que derruba `people.profilePhoto` |
| `packages/types` | `photoUpdatedAt` na `Person`; `PhotoUploadData` e `PhotoMimeType` |
| `apps/api` | `GET/PUT/DELETE /api/people/:id/photo`; `photo.util.ts` confere a assinatura do arquivo contra o tipo declarado; limite do corpo JSON em 3 MB |
| `apps/web` | `photo.ts` — reduz no `<canvas>` para 512px, achata em JPEG, e monta a URL versionada; seletor de arquivo com prévia no formulário e no `/setup` |

**O número que justifica reduzir no navegador:** um PNG de 1,8 MB e 1600×1200, escolhido na tela,
chegou ao banco com **5,5 KB**.

Duas coisas para saber ao mexer aqui:

- A **pessoa nunca carrega os bytes**. O `include` do Prisma pega só o `updatedAt` da foto, que vira
  `photoUpdatedAt`. Se algum dia a foto voltar a ser coluna de `people`, a lista, a árvore e o
  calendário passam a baixar o álbum inteiro.
- A URL da foto não muda quando a foto muda, então ela leva o `photoUpdatedAt` na query. Tirar isso
  faz o navegador mostrar a foto antiga depois de trocar.

## Sessão de 27/07 — trocar a pessoa central (BL-04)

Dava para cadastrar a pessoa central e nunca mais mudar de ideia: a RN-001 barra a segunda, e não
havia operação de transferência. Agora há `PUT /api/people/central`, e um botão na tela de edição de
quem ainda não é.

É **transferência, não criação**: as duas escritas vão na mesma transação e nesta ordem — tirar de
quem tem, depois dar a quem recebe. Um instante com dois centrais quebraria o cálculo de parentesco,
que procura um só. O `PATCH` de pessoa continua ignorando `isCentralUser` de propósito (RN-018).

O efeito é o produto inteiro girando: passando o posto do Miguel para a Fernanda, ele vira "Marido",
o pai dela vira "Pai", o pai dele vira "Sogro" e a irmã dele vira "Cunhada" — verificado rodando.

**De quebra, o e2e voltou a funcionar.** Ele montava o `AppModule` direto, sem chamar `loadRootEnv()`,
então o Prisma subia sem `DATABASE_URL` e **nenhum** e2e passava — inclusive o de health, que estava
assim havia tempo. Agora o `jest-e2e.json` tem um `setupFiles` que carrega o `.env` da raiz.

## Sessão de 26/07 — monorepo

O que estava em dois diretórios soltos (`kindred-api`, `kindred-web`), com um repositório git de um
commit em cada, virou um monorepo pnpm + Turborepo (ADR-001). O que mudou de estrutura:

| Antes | Agora |
| --- | --- |
| `kindred-api/`, `kindred-web/` (npm, dois repos git) | `apps/api`, `apps/web` (pnpm workspaces, um repo) |
| `kindred-api/prisma/` | `packages/db` (`@kindred/db`) — schema, migrations, seed, client |
| tipos duplicados no front | `packages/types` (`@kindred/types`) — contrato da API, só tipos (ADR-005) |
| `.env` dentro da API | `.env` na raiz, carregado por `loadRootEnv()` (ADR-002) |
| `docker-compose` com api+web em container e bind-mount | compose com postgres + migrate + api; web no host (ADR-004) |
| READMEs boilerplate do Nest e do Vite | um README na raiz + `docs/` e `docs-tec/` |
| sem CI | `.github/workflows/ci.yml` (build, typecheck, lint, testes) |
| sem seed | `pnpm db:seed` — 4 locais e 18 pessoas em quatro gerações |
| migrations sem baseline (o schema vinha de `db push`) | migration `0_init` gerada do schema (ADR-006) |

Também nesta sessão: `GET /api/health` substituiu o controller "Hello World"; os DTOs passaram a
validar com os enums do schema Prisma em vez de listas próprias; testes de unidade de verdade
(`computeKinship`, health) no lugar do teste de exemplo; e um erro de tipos que já existia no
`TreePage` (mudanças não commitadas) foi corrigido.

## Sessão de 27/07 — sem parentesco para quem não é família (RN-015)

O "Parente distante" que sobrava na lista era o fallback do `computeKinship` para quem não tem
caminho nenhum. Faz sentido para família (*é* parente, só não se sabe como); para amigo e conhecido
era ruído. Agora o fallback é só para `FAMILY`; os outros vêm com `kinshipDegree: null` e a tela
mostra só o rótulo social — a UI já tratava o nulo, a mudança é da API.

**Ter caminho vale mais que o rótulo social:** o primo cadastrado como amigo continua "Primo", e a
Tereza do seed, que é `OTHER`, continua "Ex-esposa" pela união. A regra só decide o que fazer quando
não há resposta.

## O que foi verificado rodando

Na sessão do BL-17 (detalhe completo na seção própria, acima) — resumo:

- Contra um banco descartável (`kindred_bl17`, criado e derrubado na hora): conta de teste registrada
  pela API, `db:reset-password <email> <senha>` — login com a antiga passa a `401`, com a nova, `200`
  — depois `db:reset-password <email>` sem senha, confirmando a geração e impressão única; e-mail sem
  conta correspondente recusa com mensagem clara e código de saída ≠ 0, sem criar nada.
- Dois testes de unidade cobrindo `resetPassword` isolado com um dublê de Prisma.
- A conta real não foi tocada em nenhum momento.

Na sessão do BL-16 (detalhe completo na seção própria, acima) — resumo:

- Unit e e2e (6 + 2 novos) contra bancos descartáveis, nenhum tocando a base real.
- Pelo **navegador de verdade**, mas com API e web apontando para um banco descartável à parte
  (nunca a base real): cadastro → `/account` → confirmação visual de cada validação (senha atual
  errada, confirmação que não bate, e-mail duplicado) → troca de senha bem-sucedida, com a sessão do
  navegador continuando autenticada → confirmado por `curl` que a senha antiga passa a dar `401` no
  login e a nova, `200`.
- A conta real (`dono@kindred.local`) não foi tocada em nenhum momento — nem para ler, desta vez.

Na sessão do BL-10 (detalhe completo na seção própria, acima) — resumo:

- Migrations do BL-10 conferidas como **já aplicadas** no banco real (`_prisma_migrations`, só
  leitura), nunca reaplicadas.
- 245 testes de unidade + **13 e2e** (banco descartável, criado e derrubado na hora) — o e2e de
  isolamento entre contas (404, não 403, para pessoa de outra conta) é o que mais importa aqui.
- Login com a senha recuperada, via `curl` e depois pelo **navegador de verdade** contra a base
  real: cookie de sessão, `GET /api/people` devolvendo as ~150 pessoas com parentesco calculado,
  sidebar mostrando "Dono original".
- A base real não foi alterada em nenhum momento desta sessão — só lida.

Na sessão do card de detalhe, direto contra a **base real** (só leitura, nada escrito), pelo
navegador de verdade:

- Clicar no nó do usuário central abriu o card com pai, mãe, 0 filhos e 2 irmãos certos, nascimento
  com idade calculada.
- Clicar no nome do pai (link dentro do card) trocou o card inteiro para ele — mostrando os avós e o
  tio do usuário, **nenhum dos quais estava desenhado na árvore** naquele momento, confirmando que a
  família vem da lista inteira, não só dos nós visíveis.
- Fechar funcionou pelos dois caminhos: o × e o clique no fundo da árvore (`onPaneClick`).
- `elementsSelectable={false}` (que desliga a seleção visual do reactflow) **não** bloqueou
  `onNodeClick` — verificado antes de assumir, era a dúvida óbvia da mudança.
- Tema claro e escuro, os dois com contraste correto (badge, links do card, botão de editar).

Na sessão de 28/07 (BL-06, ADR-016), tudo num **banco `kindred_bl06` descartável** (populado com o
fixture anônimo, 141 pessoas) — a base real nunca entrou nesta bancada:

- **API pelo curl**: `GET /api/backup` devolve `Content-Disposition` correto e o mesmo formato do
  CLI; `POST /api/backup/restore` sem `force` contra banco ocupado devolve 409 com a mensagem que a
  tela usa; com `force=true` apaga e recria, confirmado no banco (141 → 141); arquivo sem `formato`
  devolve 400; **um arquivo com FK inválida e `force=true` devolve 500 e deixa as 141 pessoas
  originais intactas** — a prova de que a transação reverte de verdade.
- **Pelo navegador de verdade** (não só jsdom): banco vazio → upload → resumo do arquivo → clique em
  "Restaurar" → redireciona para `/people` com as pessoas do arquivo. Banco ocupado → mesmo caminho
  mostra a caixa de confirmação vermelha com a mensagem da API → "Apagar e restaurar" → as pessoas
  antigas somem e entram as do arquivo novo. `/setup` com banco vazio mostra o link "Restaurar em vez
  de cadastrar", e ele chega em `/backup` sem cair de volta no `/setup` (o defeito do `layoutLoader`
  corrigido antes de qualquer teste manual).
- **Depois**: bancada derrubada (API, web, banco `kindred_bl06`), e a base real conferida — **143
  pessoas**, do jeito que estava antes de começar.

Na sessão de 28/07 (tema escuro, ADR-015), web em `:5174` contra a **base real** com a API na
`:3005` — só leitura, nada foi escrito:

- **Claro está idêntico ao que o app era**: lista, cartões, campos e sidebar sem diferença visível
  além da borda do cartão.
- **Escuro em todas as telas**: lista, calendário (as três marcas da RN-020 continuam distintas entre
  si), formulário de pessoa (campos, `fieldset`, controles de união, `input[type=file]`, textarea) e
  árvore (nós, pontilhado do fundo, painéis, legenda e os controles de zoom do reactflow).
- O seletor responde nos três estados, e **recolhida** a barra mostra o botão que alterna, com o
  ícone certo para o tema em vigor.
- O seletor de data e o checkbox vêm escuros pelo `color-scheme`, sem CSS para isso.
- Nenhum erro de console (os dois que aparecem no log são do HMR do Vite durante um `git stash`, com
  o arquivo do seletor temporariamente fora do disco).

Na sessão de 28/07 (BL-09 e ADR-013):

- **Bancada de 5000 pessoas**, num banco `kindred_bench` criado e derrubado na hora. As cinco
  requisições (página 1, página 250, busca, ordenação por idade, lista inteira) foram capturadas
  antes e depois da mudança e comparadas: **JSON idêntico**, e o tempo caiu de ~202 ms para ~35 ms
  nas paginadas. A base real não foi tocada.
- Depois, contra a **base real** (143 pessoas, com a API na `:3005`): a listagem devolve nome dos
  pais, local, foto e grau; na tela, `?search=santos&sortBy=age&sortDirection=desc` mostra "Tia-avó",
  "Avó" e "Tio-avô" com os pais embaixo de cada nome.
- Backup: base real → restore em banco descartável → backup de novo → **JSON byte a byte idêntico**.
  Fixture anônimo auditado contra a base real: nenhum nome, nota, foto, cidade ou id em comum, e
  nenhuma data de nascimento intacta, com a estrutura batendo em tudo.

Na sessão de 28/07 (BL-07), web em `:5173` contra o seed, que tem dois falecidos (Antônio, nascido
em 18/01 e falecido em 12/03; Maria, nascida em 04/07 e falecida em 02/11):

- Julho de 2026: a Maria aparece no dia 4 com a marca de falecida (`is-memorial`, "faria 91 anos"),
  ao lado do Bruno vivo no dia 19 (`is-birthday`, "faz 39 anos") — duas marcas visualmente distintas
  no mesmo mês.
- Novembro de 2026: a Maria reaparece no dia 2, agora como falecimento (`is-death`, "8 anos de
  falecimento"), com a Fernanda viva no mesmo mês.
- As duas tabelas do rodapé não se misturam: aniversários traz 5 vivos, falecimentos traz Maria
  (02/11, 98 dias) e Antônio (12/03/2027, 228 dias).
- Desmarcar **Mostrar falecimentos** deixa só `is-birthday` na grade, some com a segunda tabela e
  com a legenda — o calendário volta a ser o de antes.

Na sessão de 28/07 (BL-05), com a API em `:3005` contra o seed:

- As três notas do seed chegam na listagem, e o JSON das 23 pessoas ficou em **33,8 KB** — o texto
  praticamente não pesou, que era a aposta do teto.
- As cinco bordas do campo respondem certo: 2001 caracteres é recusado com `400`, 2000 salva, `""` e
  `null` limpam a nota, e um `PATCH` **sem** o campo não apaga a nota de quem tem.
- A busca **não** casa as notas: "intercambio", "Diamantina", "Coimbra" e "ferroviario" devolvem 0,
  enquanto "antonio" (1), "familia" (18), "primo" (1) e "amigo" (2) seguem como antes.
- Na tela (web em `:5174`): o rótulo "Notas" está ligado ao campo, o contador acompanha, o texto do
  seed aparece ao abrir, e editar e salvar chega no banco.

Na sessão de 27/07:

- BL-04 na tela e pela API: passar o posto para a Fernanda faz o Miguel virar "Marido", o Heitor
  "Pai", o Carlos "Sogro" e a Beatriz "Cunhada"; passar para o Carlos faz o Miguel virar "Filho" e a
  Fernanda "Nora". Sempre **um** central. O botão some de quem já é, e aparece o selo. Os 6 testes
  e2e passam contra o Postgres de dev e devolvem o banco como estava — 23 pessoas, Miguel central.
- BL-02 ponta a ponta, com a API no ar: um PNG de 111 KB subido pela API volta **byte a byte igual**,
  com `Content-Type: image/png` e `ETag`; a listagem das 23 pessoas ocupa 35 KB de JSON **sem
  nenhum byte de imagem**. As recusas respondem certo — arquivo que mente sobre o tipo, tipo fora da
  lista, pessoa inexistente, pessoa sem foto. Na tela: um PNG de 1,8 MB e 1600×1200 escolhido no
  formulário virou 512×384 e 5,5 KB no banco, apareceu na lista e no nó da árvore, e o "Remover foto"
  apagou a linha. Apagar uma pessoa com foto leva a foto junto pela cascata. O seed ficou intacto
  (23 pessoas, nenhuma foto).
- Depois do BL-08, com a API no ar de novo: a busca emendada (`mari` → `maria` antes de a primeira
  voltar) mantém o que foi digitado **e** a URL chega em `?search=maria`; o calendário desenha julho
  de 2026 com o aniversário do dia 19; o rótulo "Busca" está de fato ligado ao campo.
- BL-11 na tela, contra o seed: `/people?search=sonia&sortBy=age&sortDirection=desc` reconstrói
  campo, os dois selects e o resultado; `?page=0&sortBy=altura&sortDirection=cima` cai no padrão em
  vez de erro; o voltar do navegador realinha o campo de busca; digitar mais **durante** a ida da
  busca anterior não perde o que foi digitado (era o defeito). Calendário navega os meses e lista os
  5 próximos aniversários; a árvore abre em 5 nós e vai a 19 em 4 gerações a 148px, como antes;
  criar/remover local e remover pessoa recarregam a lista pelo `useRevalidator`; a segunda união
  vigente ainda barra na tela com a mensagem da RN-014, e o select volta ao que o servidor diz.
  Nenhum erro no console; o seed ficou intacto (23 pessoas, 4 locais).
- BL-03 com a API no ar, contra o seed: "antonio" e "Antônio" acham o mesmo Antônio Souza; "jose",
  "sonia", "lucia" e "sergio" acham José Lima, Sônia Alves, Lúcia Prado e Sérgio Menezes; "familia"
  traz as 10 pessoas com o rótulo "Família"; "avo" traz os 4 avós, "Avô" e "Avó" juntos.
- BL-13 na tela, contra o seed: o "+" da Fernanda traz Heitor e Sônia **exatamente uma linha acima**
  (148px, a distância entre gerações) e do lado dela, não sobre o Miguel; o "↔" traz o Marcos
  (Cunhado) na mesma linha. Com tudo aberto: 19 nós em 4 gerações, **nenhuma colisão** e as 7 linhas
  de união medindo 14px — o vão de um casal encostado.
- RN-015 contra o seed, com a API no ar: os três amigos/conhecidos e a `OTHER` sem união vêm com
  `kinshipDegree` nulo, todo o resto mantém o grau, e a lista na tela mostra "Amigo(a) · Masculino ·
  19/07/1987" sem parentesco nenhum. A busca continua achando por rótulo social ("amigo" → 2) e por
  grau ("primo" → 1).

- `pnpm typecheck`, `pnpm lint` e `pnpm test` (**121 testes**: 36 na API e 85 no web, entre módulos
  puros, loaders e páginas) — verdes, mais 6 de e2e que rodam à parte, com banco. O lint passa **sem
  aviso nenhum**.
- Árvore no navegador contra o seed, colapsada e com tudo aberto: **nenhum par mais perto que o
  espaçamento mínimo** (era o defeito que apareceu no meio do caminho — dois cards sobrepostos) e as
  linhas de união todas no vão de um casal encostado. Desligar "Com cônjuges" tira os nós e as
  linhas; o hover realça as duas uniões do Miguel, a vigente e a desfeita.
- A migration foi testada num **banco descartável** antes de tocar o de dev: `0_init` + linhas com
  `WIFE` + a migration nova, conferindo que a pessoa virou `FAMILY`, que a união nasceu vigente com o
  par normalizado e que o enum ficou com 4 valores. Também o caminho sem pessoa central.
- API em `:3001` contra o seed: as quatro validações de união respondem certo (mesma pessoa, par
  repetido em qualquer ordem, segunda união vigente) e o ciclo separar → "Ex-esposa" → sogro volta a
  "Parente distante" acontece de fato.
- Web em `:5174`: o select de relacionamento já não tem "Esposa", a seção **Uniões** lista e adiciona,
  a lista de candidatos exclui quem já tem união, e o erro de segunda união vigente chega na tela.

Na sessão de 26/07 (monorepo):

- `pnpm install`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (7 testes) — verdes.
- `docker compose up -d postgres` + `pnpm db:migrate` (aplica `0_init` num banco novo) + `pnpm db:seed`.
- `pnpm dev`: API em `:3000/api` e web em `:5173`, com `/api/health` OK, parentesco correto para as
  18 pessoas do seed (Pai, Mãe, Avô, Avó, Irmã, Irmão, Tio, Primo, Filha, Filho, Você) e
  busca/paginação/ordenação funcionando através do proxy do Vite.
- `docker compose up -d --build`: imagem do backend, `migrate` aplicando as migrations e a API
  respondendo em container (healthcheck verde).
- O repositório foi publicado em [github.com/jpmvale/kindred](https://github.com/jpmvale/kindred) e o
  CI passou no primeiro push.

## Pontos de atenção

- **Portas.** Outros projetos desta máquina usam 3000, 5173 e 5432. Rodar dois ao mesmo tempo exige
  mudar as portas de um deles — ver "Coisas do ambiente que custaram tempo", acima.
- **O grupo de afinidade se desloca como bloco, mas o espaçamento é linha a linha.** Num caso
  extremo (muitos cônjuges com família aberta na mesma geração) o grupo pode sair torto — nunca
  sobreposto, mas desalinhado do cônjuge. Não apareceu com o seed.
- **`isCentralUser` não tem unicidade no banco** — a garantia é só na aplicação (doc 02). O mesmo
  vale para "no máximo uma união vigente por pessoa" (RN-014).
- **O teto das notas está escrito em dois arquivos** (DTO da API e `PersonFormPage`), por causa do
  ADR-005. Mudar um sem o outro faz a tela deixar digitar o que o servidor recusa.
- **Cor nova vai em token, nunca no componente** (ADR-015). Hex escrito direto funciona e só quebra
  no outro tema, que ninguém abre no mesmo minuto. Não há lint que pegue: o que pega é
  `grep -rE '#[0-9a-fA-F]{6}' apps/web/src --include='*.tsx'` não devolver nada.
- **A chave do tema está em dois lugares de propósito**: `theme.ts` e o script inline do
  `index.html`. O script existe para aplicar o tema antes da pintura, e por isso não pode importar
  nada. Mexeu num, mexa no outro.
- **Enquadrar a árvore espera o `useNodesInitialized`, não um cronômetro** (BL-15). Voltar a chamar
  `fitView` por `setTimeout` refaz o defeito, e ele só aparece em base grande: o reactflow desiste em
  silêncio enquanto os nós não têm tamanho medido.
- **Mexeu no schema? O backup também precisa saber.** Um campo escalar novo tem de entrar no
  `backup.ts` **e** no `restore.ts` — o `pnpm db:backup` falha dizendo qual falta, mas quem só roda
  migration e testa a tela não descobre até precisar restaurar (ADR-013).
- **O backup é manual — mas agora também é um botão.** `/backup` faz o mesmo que `pnpm db:backup`;
  não há agendamento em nenhum dos dois. Vale exportar antes de fechar a sessão em que se cadastrou
  gente.
- **Restaurar pela web é sempre transação; pelo CLI, não.** `POST /api/backup/restore` reverte
  inteiro se algo falhar no meio (RN-021); `pnpm db:restore` continua com o `await` sequencial de
  antes — aceitável porque quem roda o CLI é quem escreveu o arquivo minutos antes. Se um dia o CLI
  também precisar dessa garantia, `buildRestoreOperations` já monta as operações prontas para
  `$transaction`, só falta trocar o laço em `restore.ts`.
- **Toda rota nasce protegida — `@Public()` é a exceção, e precisa ser lembrada.** Um controller novo
  sem pensar em auth já funciona certo (exige sessão, escopo por si só não existe ainda). Uma rota que
  *deveria* ser pública e esquece o `@Public()` falha alto (401 sempre) — o oposto de vazar dado. Mas
  um `Person`/`Location` novo que esqueça o `userId` no `where` de alguma consulta **compila e roda**,
  só vaza entre contas — não há teste de tipo que pegue isso, só revisão e os e2e de isolamento.
- **Mexeu no schema, de novo: o backup também precisa saber — e agora tem escopo.** `BackupScope`
  (`{kind:'all'}` para o CLI, `{kind:'user', userId}` para a API) não tem default de propósito: uma
  chamada nova que esqueça de escolher não compila (ADR-018).
- **Um script que só imprime uma senha uma vez pede um operador olhando.** `db:backfill-owner` é
  interativo por natureza — rodar em background ou sem supervisão é como a senha quase se perdeu
  nesta sessão. Ver o aviso fixo no topo deste arquivo.
- **Trocar a senha (BL-16) derruba as outras sessões, não a atual.** É de propósito (RN-025) — mas
  quem for testar manualmente e esperar ser deslogado ao trocar a própria senha vai estranhar que não
  foi. É a sessão que fez a troca que sobrevive; qualquer *outro* dispositivo logado na conta é que
  perde acesso e precisa entrar de novo.
- **`db:reset-password` não pede confirmação nenhuma antes de agir** (BL-17, ADR-019) — diferente do
  `db:restore --force`, que pelo menos guarda um backup antes de apagar. É de propósito: é uma
  ferramenta de operador, não de usuário final, e o e-mail já é o único dado que identifica a conta —
  mas rodar contra o `DATABASE_URL` errado redefine a senha de alguém na base errada sem aviso nenhum.
  Conferir qual banco o `DATABASE_URL` aponta antes de rodar, sempre.

## Próximo passo sugerido

O backlog de produto **zerou** — BL-16 e BL-17 fecharam na mesma janela, e não sobrou item de escolha
de rumo. Nada travado, nada pela metade. Ainda assim, há uma pendência operacional real, não técnica:
a senha da conta com os dados reais ainda é a string gerada por script pelo `db:backfill-owner`
(comunicada só por chat, nunca escrita em arquivo deste repositório — ver o aviso no topo). Agora há
dois jeitos de resolver isso, e nenhum foi usado contra a conta real por uma sessão do Claude Code —
quem decide qual usar, e quando, é quem é dono da conta:

1. **Tela `/account`, sabendo a senha atual** (BL-16) — `PATCH /api/auth/me`.
2. **`pnpm db:reset-password dono@kindred.local`, sem precisar da atual** (BL-17, ADR-019) — exige
   acesso ao servidor, não à aplicação.

Sem item de backlog para puxar, o próximo passo é esperar um pedido novo.

Fora do backlog: **GEDCOM** ficou de fora do BL-06 de propósito (trocar dados com outros programas de
genealogia é bem mais trabalho que o JSON que já existe), e não tem número — só entra se alguém
pedir. **Compartilhar uma árvore entre contas** (a alternativa ao isolamento total do BL-10) também
ficou de fora de propósito — ver ADR-018 — e também não tem número: é modelo de permissão novo, não
uma extensão pequena.

**Uma lição que já se repetiu quatro vezes:** medir/investigar antes de agir. Na primeira metade do
BL-09 o backlog culpava a consulta, e o gargalo era o cálculo — 14× maior do que o apontado. Na
segunda, o ganho real só apareceu porque havia uma base de 5000 pessoas para medir. No BL-15 a
suspeita escrita era o `minZoom`, e bastou rodar o layout fora do navegador para ver que o problema
era outro. Nesta sessão, "27 arquivos modificados do nada" pedia a mesma disciplina, só que sobre o
próprio estado do repositório: ler `_prisma_migrations` do banco real antes de presumir se uma
migration tinha rodado, e vasculhar transcript antes de assumir que uma senha estava perdida — em vez
de, por exemplo, resetá-la sem necessidade.
