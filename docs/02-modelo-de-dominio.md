# 02 — Modelo de domínio

Três entidades: **Pessoa**, **União** e **Local**. O schema que as implementa está em
[`docs-tec/02-modelo-de-dados.md`](../docs-tec/02-modelo-de-dados.md).

## Pessoa

| Conceito | Descrição |
| --- | --- |
| **Nome** | O único campo obrigatório junto do tipo de relacionamento. |
| **Sexo** | `MASCULINO` / `FEMININO`, opcional. Serve para flexionar o grau de parentesco ("Tia", "Neto"). |
| **Nascimento / falecimento** | Datas opcionais. Preencher o falecimento marca a pessoa como falecida (RN-006). |
| **Foto** | Arquivo de imagem enviado pelo usuário, guardado no próprio banco (RN-017). Sem foto, a interface mostra a inicial do nome (RN-007). |
| **Tipo de relacionamento** | Como essa pessoa entra na sua vida: `FAMILY`, `FRIEND`, `ACQUAINTANCE`, `OTHER`. É um rótulo social, não um vínculo de sangue. Cônjuge **não** está aqui: é vínculo, ver União. |
| **Notas** | Texto livre sobre a pessoa — de onde veio a amizade, histórias. Uma nota só, até 2000 caracteres, fora da busca (RN-019). |
| **Pai / mãe** | Referências a outras pessoas. Junto da União, são os vínculos estruturais do modelo. |
| **Local** | Referência opcional a um Local. |
| **Pessoa central** | Marca única: a pessoa a partir de quem o parentesco é calculado (RN-001). |

### Pessoa central

É a origem do sistema de coordenadas. Existe no máximo uma; a interface obriga a cadastrá-la antes de
qualquer outra coisa (tela de setup). Para ela, o grau de parentesco é "Você".

### Grau de parentesco

Não é um campo — é **derivado** do grafo de pai/mãe a cada consulta. O caminho entre a pessoa central
e a outra pessoa é medido em **subidas** (para pai/mãe) e **descidas** (para filhos); o par
(subidas, descidas) nomeia a relação:

| Subidas | Descidas | Relação |
| --- | --- | --- |
| 1 | 0 | Pai / Mãe |
| 0 | 1 | Filho / Filha |
| 1 | 1 | Irmão / Irmã |
| 2 | 0 | Avô / Avó |
| 2 | 1 | Tio / Tia |
| 2 | 2 | Primo / Prima |
| 3 | 1 | Tio-avô / Tia-avó |
| … | … | ver RN-004 |

Não havendo caminho de sangue, o parentesco pode vir por **afinidade**: um salto pela união (sogro,
cunhado, genro, madrasta), e só se a união estiver vigente — ver União e RN-013. Sem nenhum dos dois
caminhos dentro do limite, a pessoa é "Parente distante"; quem não é da família (amigo, conhecido)
simplesmente não tem parentesco — o rótulo social já a descreve.

## União

O casamento — ou qualquer relação conjugal — liga **duas pessoas** e existe por si só, não é um campo
da pessoa. Tem uma **situação**: vigente (são cônjuges hoje) ou desfeita (são ex). Tem datas
opcionais de início e fim.

É entidade por causa da separação. Um campo "cônjuge" na pessoa não teria onde guardar que a união
acabou, nem como registrar um segundo casamento sem apagar o primeiro. Como entidade, a história fica
inteira: uma pessoa pode ter várias uniões desfeitas e no máximo uma vigente (RN-014).

A união não tem lado — dizer "A e B" ou "B e A" é a mesma união (RN-011). E ela é o que carrega a
afinidade: os parentes do cônjuge só são parentes enquanto a união vale.

## Local

Nome de cidade (ex.: "Curitiba, PR"), criado uma vez e reutilizado por várias pessoas. Entidade
própria justamente para não haver dez grafias da mesma cidade.
