# 02 — Modelo de dados

Fonte da verdade: [`packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma).
PostgreSQL 16, Prisma 5. Ids são `uuid` gerados pela aplicação; `createdAt`/`updatedAt` em toda tabela.

## `users`

Uma conta (BL-10, ADR-018).

| Coluna | Tipo | Nulo? | Nota |
| --- | --- | --- | --- |
| `id` | uuid | não | PK |
| `name` | text | não | |
| `email` | text | não | único |
| `passwordHash` | text | não | bcrypt, custo 12 — nunca sai da API |

`onDelete: Cascade` a partir daqui para `people`, `locations` e `sessions`: apagar a conta apaga a
árvore inteira, sem deixar órfão.

## `sessions`

| Coluna | Tipo | Nulo? | Nota |
| --- | --- | --- | --- |
| `id` | text | não | PK — é o **hash SHA-256** (hex) do token que vai no cookie, não um id à parte |
| `userId` | uuid | não | FK → `users.id`, `onDelete: Cascade` |
| `expiresAt` | timestamp | não | 30 dias após o login, fixo — sem renovação deslizante |

Guardar o hash, e não o token cru, é defesa em profundidade: um backup ou dump do banco não dá sessão
de graça — só quem tem o cookie original consegue logar como alguém (RN-024). Sem cron de limpeza:
sessão vencida é apagada na próxima vez que alguém tenta usá-la (`AuthService.validateSession`).

## `people`

| Coluna | Tipo | Nulo? | Nota |
| --- | --- | --- | --- |
| `id` | uuid | não | PK |
| `userId` | uuid | não | FK → `users.id`, `onDelete: Cascade` — dona da linha (RN-022) |
| `name` | text | não | |
| `sex` | enum `Sex` | sim | `MALE`, `FEMALE` |
| `birthDate` | timestamp | sim | |
| `deathDate` | timestamp | sim | |
| `deceased` | boolean | não | default `false`; derivado de `deathDate` quando ela existe (RN-006) |
| `relationshipType` | enum `RelationshipType` | não | `FAMILY`, `FRIEND`, `ACQUAINTANCE`, `OTHER` — cônjuge **não** está aqui, virou `unions` (ADR-008) |
| `isCentralUser` | boolean | não | default `false`; no máximo um `true` **por conta** (RN-001, garantido na aplicação) |
| `notes` | text | sim | Texto livre, até 2000 caracteres — o teto é do DTO, não do banco (RN-019) |
| `fatherId` | uuid | sim | FK → `people.id` |
| `motherId` | uuid | sim | FK → `people.id` |
| `locationId` | uuid | sim | FK → `locations.id` |

Duas auto-relações nomeadas (`Father`, `Mother`) dão os lados inversos `childrenAsFather` e
`childrenAsMother`. Como são relações **opcionais**, a ação padrão do Prisma ao apagar o pai é
`SetNull`: os filhos sobrevivem sem o vínculo (RN-010).

**Não há constraint de unicidade em `isCentralUser`.** A regra é validada no serviço. Um índice único
parcial (`where isCentralUser`) seria mais forte, mas o Prisma não o modela nativamente — ficaria como
SQL solto na migration. Está no radar, não no schema. O mesmo vale para "no máximo um `true` por
conta" — não há `@@unique([userId, isCentralUser])` porque isso exigiria permitir várias linhas com
`isCentralUser = false`, e um índice único comum não distingue esse caso do violado.

**`fatherId`/`motherId`/`locationId` não referenciam `userId` — a API garante isso na escrita.**
Nada no schema impede um UUID de pessoa de outra conta ali; é `assertPersonIdsOwnedBy`/
`assertLocationOwnedBy` (`people.service.ts`) que recusa antes de gravar (RN-022).

## `unions`

União conjugal entre duas pessoas (ADR-008). É entidade, e não um campo `spouseId`, porque tem dados
próprios e porque uma pessoa pode ter tido mais de uma ao longo da vida — sem isso não dá para
distinguir cônjuge de ex.

| Coluna | Tipo | Nulo? | Nota |
| --- | --- | --- | --- |
| `id` | uuid | não | PK |
| `partnerAId` | uuid | não | FK → `people.id`, `onDelete: Cascade`. Sempre o **menor** dos dois ids (RN-011) |
| `partnerBId` | uuid | não | FK → `people.id`, `onDelete: Cascade` |
| `status` | enum `UnionStatus` | não | `CURRENT` (vigente) ou `ENDED` (desfeita); default `CURRENT` |
| `startDate` | timestamp | sim | |
| `endDate` | timestamp | sim | |

Índice **único** em (`partnerAId`, `partnerBId`) — com a ordem normalizada, ele impede duas linhas
para o mesmo casal. Índice comum em `partnerBId`, porque a busca "as uniões desta pessoa" olha os dois
lados.

Duas auto-relações nomeadas (`PartnerA`, `PartnerB`) dão os lados inversos `unionsAsA` e `unionsAsB`.
Ao contrário de pai/mãe, aqui a relação é **obrigatória**, então apagar uma pessoa apaga as uniões
dela (`Cascade`) — uma união sem um dos lados não significa nada.

**Não há constraint de "no máximo uma união vigente por pessoa"** (RN-014): como `isCentralUser`, a
regra vive no serviço. Um índice único parcial daria a garantia no banco, mas o Prisma não o modela.

## `person_photos`

A foto de perfil (ADR-011). Tabela à parte, e não uma coluna em `people`, porque o Prisma traz todas
as colunas escalares em `findMany` — a lista, a árvore e o calendário carregam todo mundo de uma vez,
e arrastariam junto todas as imagens.

| Coluna | Tipo | Nulo? | Nota |
| --- | --- | --- | --- |
| `personId` | uuid | não | PK **e** FK → `people.id`, `onDelete: Cascade`. Ser a PK é o que garante uma foto por pessoa (RN-017) |
| `bytes` | bytea | não | a imagem já reduzida; o web encolhe para 512px antes de subir |
| `mimeType` | text | não | `image/jpeg`, `image/png` ou `image/webp`, conferido contra a assinatura do arquivo |

O `updatedAt` desta tabela é o que a API expõe como `photoUpdatedAt` na pessoa: diz se existe foto e
serve de versão na URL da imagem, para o navegador não servir a antiga do cache.

## `locations`

| Coluna | Tipo | Nulo? | Nota |
| --- | --- | --- | --- |
| `id` | uuid | não | |
| `userId` | uuid | não | FK → `users.id`, `onDelete: Cascade` — dona da linha (RN-022) |
| `name` | text | não | |

Sem unicidade em `name` — nada impede hoje "Curitiba" e "Curitiba, PR" coexistirem **dentro da mesma
conta**. Contas diferentes nem chegam a colidir: cada uma tem a própria lista.

## Migrations

```bash
pnpm db:migrate:dev            # cria a migration a partir do schema editado
pnpm db:migrate                # aplica (migrate deploy) — é o que o compose roda
pnpm --filter @kindred/db db:reset   # dropa, remigra e reaplica o seed
```

O histórico começa em `0_init`, o baseline gerado do schema (ADR-006). A segunda,
`20260727120000_uniao_conjugal`, cria as uniões e tira o `WIFE` do enum — nela a ordem importa: a
tabela nova e o backfill (quem era `WIFE` vira `FAMILY` **e** ganha uma união vigente com a pessoa
central) rodam **antes** do `ALTER TYPE`, senão a informação se perderia.

A terceira, `20260728001800_foto_de_perfil`, cria `person_photos` e **derruba** `people.profilePhoto`.
Não há backfill: uma URL não vira imagem sem baixá-la, e a coluna estava vazia. A migration traz no
cabeçalho o `SELECT` para salvar as URLs antes, caso algum banco tenha alguma.

A quarta, `20260728120000_notas_por_pessoa`, só acrescenta `people.notes` — aditiva e anulável, sem
backfill: quem já estava cadastrado fica sem nota.

A quinta e a sexta são o BL-10 (multiusuário, ADR-018), e a ordem entre elas — com um passo manual no
meio — é a parte que importa:

1. `20260728203000_usuarios_e_donos` cria `users`/`sessions` e `userId` **nullable** em
   `people`/`locations`. Nullable de propósito: não pode falhar por causa de linha existente.
2. `pnpm db:backfill-owner` roda **entre** as duas migrations — dá dono a quem foi cadastrado antes
   de existir conta, criando (ou reaproveitando) um usuário "dono original". Não é migration porque
   grava dado, não schema; é idempotente (base já migrada, não faz nada).
3. `20260728204500_dono_obrigatorio` torna `userId` `NOT NULL`. Se o passo 2 não tiver rodado, o
   próprio Postgres recusa — a rede de segurança que transforma "esqueceu o backfill" em erro na
   hora, não corrupção silenciosa.

```bash
pnpm db:backfill-owner   # entre as duas migrations acima, num banco que já tinha dado antes do BL-10
```

## Seed

[`packages/db/src/seed.ts`](../packages/db/src/seed.ts) cria uma conta (`seed@kindred.local`, senha
`seed-account` — fictícia, sem risco, é só para desenvolvimento), 4 locais, 23 pessoas fictícias em
quatro gerações e 7 uniões — avós, pais, um tio, a pessoa central (Miguel Souza), irmãos, um primo,
esposa, sogros, um cunhado de cada lado, filhos, amigos e conhecidos, com dois falecidos e datas de
nascimento espalhadas pelo ano. Entre as uniões há uma **desfeita** (a ex-esposa da pessoa central),
para que "Ex-esposa" e o corte da afinidade (RN-013) apareçam sem ninguém precisar montar o caso à
mão. Três pessoas vêm com **nota** (RN-019) — um avô, um amigo e um conhecido —, para o campo não
nascer vazio na tela. É o suficiente para árvore, calendário, busca e ordenação mostrarem algo real
de primeira.

```bash
pnpm db:seed             # exige banco vazio
pnpm db:seed --force     # apaga pessoas, uniões e locais antes
```

## Backup, restauração e o fixture anônimo

O banco de desenvolvimento deixou de ser descartável quando passou a ter uma família de verdade
dentro. O porquê da forma escolhida está no **ADR-013**; o que se usa no dia a dia é isto:

**O CLI é sempre o banco inteiro, todas as contas — é ferramenta de administração, não algo que uma
conta comum roda.** Desde o BL-10 (ADR-018), `buildBackupPayload`/`buildRestoreOperations` recebem um
`BackupScope` (`{kind: 'all'}` ou `{kind: 'user', userId}`) sem valor default — uma chamada que
esqueça de escolher não compila. O CLI sempre passa `'all'`; é a API (`GET /api/backup`,
`POST /api/backup/restore`) quem passa `'user'`, escopado a quem está logado — ver
[`00-visao-tecnica.md`](00-visao-tecnica.md).

```bash
pnpm db:backup                        # copia a base para ../kindred-backups (fora do repo)
pnpm db:restore <arquivo.json>        # devolve a base; exige banco vazio
pnpm db:restore <arquivo.json> --force # apaga antes — e salva um backup do que apagou
pnpm db:anonymize                     # gera packages/db/fixtures/anonimizado.json
```

O backup é **JSON pelo Prisma**, não `pg_dump`: o `pg_dump` mora no container do Postgres, e é
justamente o Docker que se quer sobreviver. O arquivo guarda os ids originais, então restaurar devolve
o mesmo grafo de pai/mãe — não uma cópia parecida. O `KINDRED_BACKUP_DIR` muda o destino.

**O backup se recusa a gravar incompleto.** Ele lê o `Prisma.dmmf` e cobra que todo campo escalar de
cada modelo esteja no arquivo. Mexeu no schema? Se o campo novo não entrar no `backup.ts` **e** no
`restore.ts`, o próximo `pnpm db:backup` falha dizendo qual campo falta. É de propósito: um backup
furado só se revela na restauração, quando o original já não existe.

O `db:anonymize` copia a **forma** de uma base real para um fixture versionado — mesma quantidade,
mesmo grafo de pai/mãe, mesmas uniões, quem faleceu, quem é a pessoa central — trocando nome e cidade
por fictícios, descartando notas e fotos e deslocando as datas de 1 a 10 dias. Como sai no mesmo
formato do backup, carregá-lo é `pnpm db:restore packages/db/fixtures/anonimizado.json --force`. Serve
para desenvolver e medir com volume de base real (BL-09) num repositório que é público.
