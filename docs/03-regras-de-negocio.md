# 03 — Regras de negócio

Regras implementadas hoje. O identificador (**RN-\***) é o que o código e os commits citam.

## Pessoa central

- **RN-001** — Existe **no máximo uma** pessoa central. A API rejeita a criação de uma segunda
  (`400`, "Já existe uma pessoa central cadastrada").
- **RN-002** — Enquanto não houver pessoa central, o web redireciona para a tela de setup; a pessoa
  cadastrada ali nasce com `relationshipType = FAMILY` e `isCentralUser = true`.

## Cadastro

- **RN-003** — `name` e `relationshipType` são obrigatórios; todo o resto é opcional. O
  `relationshipType` é normalizado (trim + maiúsculas) antes de validar.
- **RN-006** — Data de falecimento preenchida ⇒ `deceased = true`; limpar a data ⇒ `deceased = false`.
  A flag existe para o caso "sabe-se que faleceu, não se sabe quando".
- **RN-007** — Pessoa sem foto é exibida com a inicial do nome.
- **RN-008** — Local é opcional e vem do cadastro de Locais; a pessoa guarda a referência, não o
  texto.
- **RN-009** — Campos de referência vazios (`""`) chegando do formulário são tratados como ausência
  (`null`), não como erro de validação.

## Parentesco

- **RN-004** — O grau de parentesco de cada pessoa é **calculado** em relação à pessoa central,
  percorrendo o grafo de pai/mãe em largura (subidas e descidas), com no máximo **8 passos**:
  - a própria pessoa central é "Você";
  - o rótulo é flexionado pelo sexo quando conhecido, e neutro quando não ("Filho(a)");
  - pares sem nome na tabela viram "Parente de Nº grau"; sem caminho, "Parente distante";
  - a subida só acontece antes de qualquer descida — o caminho é sempre "sobe até o ancestral comum,
    depois desce", o que evita rotular sogros e cunhados como consanguíneos.

## Listagem

- **RN-005** — `GET /api/people` devolve a lista inteira, já com o parentesco calculado. Se vier
  qualquer parâmetro de paginação/busca/ordenação, a resposta passa a ser paginada
  (`data`, `total`, `page`, `limit`, `totalPages`):
  - **busca** casa nome, grau de parentesco ou tipo de relacionamento, sem acento-sensibilidade de
    caixa (pt-BR);
  - **ordenação** por `name`, `birthDate` ou `age`, `asc`/`desc`, com limite de 100 por página;
  - **falecidos vão para o fim**, independente da ordenação escolhida;
  - quem não tem data de nascimento vai depois de quem tem, ao ordenar por nascimento ou idade.

## Remoção

- **RN-010** — Remover uma pessoa que é pai ou mãe de outra **limpa a referência nos filhos**
  (`fatherId`/`motherId` viram nulos — é o comportamento padrão do Prisma para relação opcional).
  Os filhos continuam cadastrados, só perdem aquele vínculo, e o parentesco deles é recalculado na
  consulta seguinte.
