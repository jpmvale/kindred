# 01 — Visão do produto

## O problema

Todo mundo tem uma rede de pessoas na cabeça — quem é tio de quem, de onde vem cada amizade, quando
é o aniversário da avó — e nenhum lugar bom para guardar isso. Agenda de contatos guarda telefone,
não vínculo. Árvore genealógica em papel envelhece e não responde "qual é o meu grau de parentesco
com o Diego?".

## A proposta

O kindred é um cadastro de pessoas **centrado em quem usa**. Existe uma **pessoa central** — você — e
todo o resto é descrito em relação a ela:

- **Vínculo de sangue** modelado do jeito mais simples possível: cada pessoa aponta para **pai** e
  **mãe**. Todo parentesco (irmão, tio, primo, bisneta) é *derivado* disso, não digitado à mão.
- **União conjugal** como vínculo entre duas pessoas, com situação (vigente ou desfeita) e datas — é
  daí que saem sogro, cunhado e genro, e é o que permite dizer "esposa" ou "ex-esposa".
- **Vínculo social** como um rótulo na pessoa: família, amigo, conhecido, outro.
- **Local** (cidade) e datas de **nascimento** e **falecimento**.

Com isso, três leituras da mesma base:

1. **Lista** — quem está cadastrado, com busca, ordenação (nome, nascimento, idade) e o grau de
   parentesco já calculado.
2. **Árvore** — a genealogia navegável, expandindo ancestrais, descendentes, irmãos e primos.
3. **Calendário** — os aniversários do mês e os próximos, com as datas de falecimento junto (RN-020).

## Princípios

- **Não pedir o que dá para calcular.** Grau de parentesco é conta da máquina (RN-004).
- **Uma pessoa central, sempre.** É ela que dá sentido à palavra "tio" (RN-001).
- **Ausência de dado é normal.** Quase todo campo é opcional: dá para cadastrar alguém com só o nome
  e completar depois.
- **Português.** A interface, os rótulos e os graus de parentesco são em pt-BR.
- **Uma árvore por conta, sem compartilhar.** Há login (BL-10) — mas cada conta enxerga só a própria
  base; não existe convite nem família compartilhando a mesma árvore.

## Não-objetivos (por enquanto)

Rede social, compartilhamento de uma árvore entre contas, importação de GEDCOM/FamilySearch. Ver
[`04-backlog.md`](04-backlog.md).
