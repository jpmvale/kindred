# 02 — Modelo de domínio

Duas entidades: **Pessoa** e **Local**. O schema que as implementa está em
[`docs-tec/02-modelo-de-dados.md`](../docs-tec/02-modelo-de-dados.md).

## Pessoa

| Conceito | Descrição |
| --- | --- |
| **Nome** | O único campo obrigatório junto do tipo de relacionamento. |
| **Sexo** | `MASCULINO` / `FEMININO`, opcional. Serve para flexionar o grau de parentesco ("Tia", "Neto"). |
| **Nascimento / falecimento** | Datas opcionais. Preencher o falecimento marca a pessoa como falecida (RN-006). |
| **Foto** | URL de imagem. Sem foto, a interface mostra a inicial do nome (RN-007). |
| **Tipo de relacionamento** | Como essa pessoa entra na sua vida: `FAMILY`, `WIFE`, `FRIEND`, `ACQUAINTANCE`, `OTHER`. É um rótulo social, não um vínculo de sangue. |
| **Pai / mãe** | Referências a outras pessoas. São o **único** vínculo estrutural do modelo. |
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

Sem caminho conhecido dentro do limite, a pessoa é "Parente distante". Quem não é da família (amigo,
conhecido) simplesmente não tem parentesco — o rótulo social já a descreve.

## Local

Nome de cidade (ex.: "Curitiba, PR"), criado uma vez e reutilizado por várias pessoas. Entidade
própria justamente para não haver dez grafias da mesma cidade.
