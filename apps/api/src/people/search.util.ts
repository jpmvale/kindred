/*
 * Normalização do texto da busca (RN-016).
 *
 * Quem digita "jose" quer achar o José, e quem digita "José" quer achar o Jose
 * cadastrado sem acento. Por isso os dois lados — o termo e o campo — passam
 * pela mesma normalização: caixa baixa em pt-BR e diacríticos removidos.
 *
 * O NFD separa a letra do acento ("é" vira "e" + U+0301) e a faixa `\p{Diacritic}`
 * apaga só a marca, preservando a letra. Vale para cedilha e til também: "conceicao"
 * acha "Conceição".
 */

export function normalizeForSearch(value: string): string {
  return value
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}
