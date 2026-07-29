# 03 — Regras de negócio

Regras implementadas hoje. O identificador (**RN-\***) é o que o código e os commits citam.

## Contas

- **RN-022** — Cada conta (`User`) tem sua **própria árvore, isolada**: nenhuma `Person`, `Location`
  ou `Union` é visível, editável ou referenciável por outra conta (BL-10, ADR-018). Pai, mãe, local e
  parceiro de união informados numa escrita precisam pertencer à mesma conta de quem está pedindo —
  senão a API recusa (`400`), em vez de aceitar o vínculo com o dado de outra conta.
- **RN-023** — Buscar um id que existe, mas é de outra conta, devolve **404**, a mesma resposta de "não
  existe" — nunca `403`. A diferença entre as duas coisas não pode ser observável por quem não tem a
  sessão certa.
- **RN-024** — A sessão vive num cookie `httpOnly`, sem renovação deslizante: expira 30 dias após o
  login, independente de uso. Toda rota exige sessão válida por padrão; as exceções (`/auth/*`,
  `/health`) são explícitas, não o contrário.

## Pessoa central

- **RN-001** — Existe **no máximo uma** pessoa central **por conta**. A API rejeita a criação de uma
  segunda dentro da mesma conta (`400`, "Já existe uma pessoa central cadastrada").
- **RN-002** — Enquanto não houver pessoa central, o web redireciona para a tela de setup; a pessoa
  cadastrada ali nasce com `relationshipType = FAMILY` e `isCentralUser = true`.
- **RN-018** — O posto de pessoa central pode ser **transferido** para outra pessoa já cadastrada
  (`PUT /api/people/central`). Não é criar uma segunda: quem era central vira pessoa comum no mesmo
  movimento, e passa a ter grau de parentesco como todo mundo. Todos os graus são recalculados a
  partir da nova referência — quem era "Pai" pode virar "Avô", e o cônjuge de quem assume vira
  "Marido" ou "Esposa".

  Trocar para quem já é central não faz nada. A criação continua barrando uma segunda (RN-001), e o
  `PATCH` de pessoa **ignora** `isCentralUser` de propósito: essa mudança mexe em duas pessoas, então
  tem operação própria.

## Cadastro

- **RN-003** — `name` e `relationshipType` são obrigatórios; todo o resto é opcional. O
  `relationshipType` é normalizado (trim + maiúsculas) antes de validar. Os valores são `FAMILY`,
  `FRIEND`, `ACQUAINTANCE` e `OTHER` — **cônjuge não é um deles**: virou vínculo próprio (RN-011).
- **RN-006** — Data de falecimento preenchida ⇒ `deceased = true`; limpar a data ⇒ `deceased = false`.
  A flag existe para o caso "sabe-se que faleceu, não se sabe quando".
- **RN-007** — Pessoa sem foto é exibida com a inicial do nome.
- **RN-008** — Local é opcional e vem do cadastro de Locais; a pessoa guarda a referência, não o
  texto.
- **RN-009** — Campos de referência vazios (`""`) chegando do formulário são tratados como ausência
  (`null`), não como erro de validação.
- **RN-019** — Cada pessoa tem um campo de **notas**: texto livre, opcional, de até **2000
  caracteres** — de onde veio a amizade, histórias, o que não se quer esquecer. É uma nota só, sem
  data: salvar substitui o que estava lá. Campo em branco é ausência de nota (`null`), pela mesma
  lógica da RN-009.

  **A busca não olha as notas** (RN-016 segue casando nome, grau de parentesco e rótulo social). A
  nota é para ser lida na pessoa, não para trazer resultado que o usuário não entende de onde veio.

  O teto de 2000 caracteres é o que permite a nota **viajar na listagem** junto com o resto da
  pessoa. Foi o mesmo raciocínio que tirou a foto de lá (ADR-011), com resposta oposta: a lista, a
  árvore e o calendário carregam todo mundo de uma vez, então o que viaja precisa ter tamanho
  conhecido. Se um dia a nota crescer sem limite, ela sai do `findMany` como a foto saiu.

## União conjugal

- **RN-011** — Uma união liga **duas pessoas distintas** e o par é **único**: não existem duas uniões
  para o mesmo casal, e tanto faz a ordem em que as duas pessoas são informadas. A união tem uma
  situação — **vigente** (cônjuge) ou **desfeita** (ex) — e datas opcionais de início e fim.
- **RN-014** — Uma pessoa tem **no máximo uma união vigente** por vez. Para registrar outra, a
  anterior precisa ser marcada como desfeita primeiro. Uniões desfeitas não têm limite: é assim que
  se guarda mais de um casamento ao longo da vida.
- Apagar uma pessoa apaga as uniões dela — ao contrário de pai/mãe (RN-010), uma união sem um dos
  lados não significa nada.

## Foto de perfil

- **RN-017** — Cada pessoa tem **no máximo uma** foto, enviada como arquivo: JPEG, PNG ou WebP, de
  até 2 MB. A imagem é **reduzida antes de subir** — 512 pixels no maior lado —, porque o que a tela
  mostra é um avatar, não um retrato em tamanho real. Enviar de novo substitui a anterior; não há
  histórico de fotos.

  Um arquivo cujo conteúdo não corresponde ao tipo declarado é recusado. GIF e SVG ficam de fora:
  SVG é documento que pode carregar script, não imagem.

  Remover a pessoa remove a foto junto.

## Parentesco

- **RN-004** — O grau de parentesco de cada pessoa é **calculado** em relação à pessoa central,
  percorrendo o grafo de pai/mãe em largura (subidas e descidas), com no máximo **8 passos**:
  - a própria pessoa central é "Você";
  - o rótulo é flexionado pelo sexo quando conhecido, e neutro quando não ("Filho(a)");
  - pares sem nome na tabela viram "Parente de Nº grau"; sem caminho, "Parente distante" (RN-015);
  - a subida só acontece antes de qualquer descida — o caminho é sempre "sobe até o ancestral comum,
    depois desce", o que evita rotular sogros e cunhados como consanguíneos.
- **RN-012** — Quem tem união com a pessoa central é "Esposa"/"Marido" se ela é vigente, e
  "Ex-esposa"/"Ex-marido" se foi desfeita (neutro: "Cônjuge"/"Ex-cônjuge"). Esse rótulo vem **antes**
  do sangue: quem se casou com um primo distante aparece como cônjuge, não como primo.
- **RN-013** — Não havendo laço de sangue, o parentesco pode vir por **afinidade** — um único salto
  conjugal, em qualquer das duas direções:
  - parentes do cônjuge: **Sogro/Sogra**, **Cunhado/Cunhada**, **Enteado/Enteada**;
  - cônjuges dos parentes: **Cunhado/Cunhada**, **Genro/Nora**, **Padrasto/Madrasta**;
  - sem nome próprio em pt-BR, o rótulo é descritivo: "Avó do cônjuge", "Cônjuge de Primo".

  **A afinidade só atravessa união vigente.** Terminada a união, o ex continua sendo "Ex-esposa", mas
  os parentes dele deixam de ser parentes — o sogro volta a ser "Parente distante". É o que se espera
  de uma separação, e é o motivo de a união ser entidade e não um campo.
- **RN-015** — "Parente distante" é resposta só para quem é **família**. Não havendo caminho nenhum —
  nem sangue, nem união, nem afinidade —, quem está cadastrado como amigo, conhecido ou outro fica
  **sem grau de parentesco** (`null`), e a tela mostra só o rótulo social. Dizer que um amigo é
  "parente distante" é ruído: ele não é parente, e não há o que descobrir.

  Ter caminho **vale mais que o rótulo social**: o primo cadastrado como amigo continua sendo "Primo".
  A regra só decide o que fazer quando não há resposta.

## Listagem

- **RN-005** — `GET /api/people` devolve a lista inteira, já com o parentesco calculado. Se vier
  qualquer parâmetro de paginação/busca/ordenação, a resposta passa a ser paginada
  (`data`, `total`, `page`, `limit`, `totalPages`):
  - **busca** casa nome, grau de parentesco ou tipo de relacionamento, ignorando caixa e acento
    (RN-016);
  - **ordenação** por `name`, `birthDate` ou `age`, `asc`/`desc`, com limite de 100 por página;
  - **falecidos vão para o fim**, independente da ordenação escolhida;
  - quem não tem data de nascimento vai depois de quem tem, ao ordenar por nascimento ou idade.

  Na tela, esses quatro parâmetros ficam na **URL**: recarregar a página mantém a busca, o voltar do
  navegador desfaz o último filtro e um link leva outra pessoa exatamente à mesma lista.
- **RN-016** — A busca **ignora acento nos dois sentidos**: "jose" acha "José", e "José" acha um
  "Jose" cadastrado sem acento. Vale para todos os diacríticos do português — agudo, circunflexo,
  crase, til e cedilha ("conceicao" acha "Conceição") — e para os três campos casados, então
  "familia" acha o rótulo "Família" e "avo" acha tanto "Avô" quanto "Avó".

  Quem digita numa busca não está soletrando: exigir o acento certo é cobrar do usuário um trabalho
  que a máquina faz melhor. A normalização é a mesma dos dois lados — termo e campo passam pela
  mesma função —, senão o cadastro sem acento ficaria invisível para quem digita com acento.

## Calendário

- **RN-020** — O calendário mostra **três** datas, distintas na tela:
  - **aniversário** de quem está vivo;
  - **aniversário de quem já faleceu** — o "hoje ele faria X anos";
  - **data do falecimento**.

  Quem faleceu rende as duas últimas. Sabendo-se que faleceu mas não quando (RN-006), entra só pelo
  nascimento. Quem não tem data nenhuma não entra.

  As datas de falecimento podem ser **desligadas** por um filtro, ligado por padrão: é assunto que
  nem todo dia se quer ter na frente. Desligado, o calendário volta a ser só o aniversário de quem
  está vivo.

  No rodapé são **duas listas**: os próximos 5 aniversários (com os de falecidos marcados) e as
  próximas 5 datas de falecimento. Separadas porque respondem a perguntas diferentes — a quem dar
  parabéns, e de quem lembrar.

## Backup e restauração

- **RN-021** — Restaurar um backup é **tudo ou nada** (BL-06, ADR-016): as escritas acontecem numa
  única transação, então um arquivo malformado ou com referência para gente que não existe deixa o
  banco exatamente como estava, nunca vazio ou pela metade. Sem confirmação explícita
  (`force`), restaurar sobre um banco que já tem gente é recusado — quem decide apagar é quem está do
  outro lado da tela, não a operação sozinha.

## Remoção

- **RN-010** — Remover uma pessoa que é pai ou mãe de outra **limpa a referência nos filhos**
  (`fatherId`/`motherId` viram nulos — é o comportamento padrão do Prisma para relação opcional).
  Os filhos continuam cadastrados, só perdem aquele vínculo, e o parentesco deles é recalculado na
  consulta seguinte.
