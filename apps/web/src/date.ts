/**
 * Datas do domínio são **parciais** (RN-027, ADR-028): dá para saber o ano sem
 * saber o dia, ou o dia e o mês sem o ano. O formato canônico é ISO 8601
 * encurtado, e é o que viaja na API e mora no banco:
 *
 * | valor        | significa                    |
 * |--------------|------------------------------|
 * | `1988-05-30` | 30 de maio de 1988           |
 * | `1988-05`    | maio de 1988                 |
 * | `1988`       | 1988                         |
 * | `--05-30`    | 30 de maio, ano desconhecido |
 * | `--05`       | maio, ano desconhecido       |
 *
 * **Dia exige mês**: dia 30 sem saber de que mês não cai em calendário nenhum. É
 * a única combinação que não existe — no resto, as três informações são
 * independentes.
 */

export interface DateParts {
  year: number | null;
  month: number | null;
  day: number | null;
}

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** Quebra o formato canônico em partes. Valor fora do formato vira `null`. */
export function parsePartialDate(value?: string | null): DateParts | null {
  if (!value) return null;
  const texto = value.trim();

  // Duas formas, e não uma com alternativa no meio: com ano (`1988`, `1988-05`,
  // `1988-05-30`) e sem ano (`--05`, `--05-30`), onde o `--` já é o separador.
  const comAno = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(texto);
  const semAno = /^--(\d{2})(?:-(\d{2}))?$/.exec(texto);

  let parts: DateParts;
  if (comAno) {
    parts = {
      year: Number(comAno[1]),
      month: comAno[2] ? Number(comAno[2]) : null,
      day: comAno[3] ? Number(comAno[3]) : null,
    };
  } else if (semAno) {
    parts = {
      year: null,
      month: Number(semAno[1]),
      day: semAno[2] ? Number(semAno[2]) : null,
    };
  } else {
    // Aceita o ISO completo com hora: é o que a API devolvia antes da migração,
    // e o que um backup antigo ainda traz.
    const legado = /^(\d{4})-(\d{2})-(\d{2})T/.exec(texto);
    if (!legado) return null;
    parts = { year: Number(legado[1]), month: Number(legado[2]), day: Number(legado[3]) };
  }

  if (parts.month !== null && (parts.month < 1 || parts.month > 12)) return null;
  if (parts.day !== null && (parts.day < 1 || parts.day > 31)) return null;
  return parts;
}

/**
 * Monta o formato canônico a partir do que a pessoa preencheu. Devolve `null`
 * quando não sobrou informação nenhuma, e descarta o dia sem mês — não há
 * calendário em que ele signifique alguma coisa.
 */
export function formatPartialDateISO({ year, month, day }: DateParts): string | null {
  if (!year && !month) return null;
  if (!month) return String(year).padStart(4, '0');
  // Sem ano, o `--` já faz as vezes do separador: `--05`, e não `---05`.
  const cabeça = year ? `${String(year).padStart(4, '0')}-` : '--';
  const comMês = `${cabeça}${String(month).padStart(2, '0')}`;
  return day ? `${comMês}-${String(day).padStart(2, '0')}` : comMês;
}

/** `true` só quando dia, mês e ano estão todos ali. */
export function isCompleteDate(value?: string | null): boolean {
  const parts = parsePartialDate(value);
  return Boolean(parts && parts.year && parts.month && parts.day);
}

/**
 * Como a data se lê na tela, em português: `30/05/1988`, `maio de 1988`, `1988`,
 * `30 de maio`. Sem inventar o que não se sabe — é o ponto do campo parcial.
 */
export function formatPartialDate(value?: string | null): string | null {
  const parts = parsePartialDate(value);
  if (!parts) return null;
  const { year, month, day } = parts;

  if (year && month && day) {
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  }
  if (year && month) return `${MONTHS[month - 1]} de ${year}`;
  if (year) return String(year);
  if (month && day) return `${day} de ${MONTHS[month - 1]}`;
  if (month) return MONTHS[month - 1];
  return null;
}

/**
 * A data completa como `Date`, ou `null` quando falta parte. Existe para o que
 * exige dia exato; a idade e o próximo aniversário têm caminhos próprios, que
 * sabem lidar com o que falta.
 *
 * `new Date("1988-05-30")` interpreta a string como UTC meia-noite, que em fuso
 * negativo cai no dia anterior na tela; por isso a data é montada em componentes
 * locais.
 */
export function parseDateOnly(dateStr?: string | null): Date | null {
  const parts = parsePartialDate(dateStr);
  if (!parts || !parts.year || !parts.month || !parts.day) return null;
  return new Date(parts.year, parts.month - 1, parts.day);
}

/** A data completa formatada (`30/05/1988`), ou nada se não estiver completa. */
export function formatDateOnly(dateStr?: string | null): string | null {
  const date = parseDateOnly(dateStr);
  return date ? date.toLocaleDateString('pt-BR') : null;
}

export interface Age {
  years: number;
  /** `true` quando falta dia ou mês: a conta pode errar por um ano. */
  approximate: boolean;
}

/**
 * Anos completos entre nascimento e fim (hoje, se omitido). Com data parcial a
 * conta é feita com o que há — só o ano dá idade **aproximada**, e quem mostra
 * na tela sinaliza com `~`. Negativo não faz sentido aqui, e vira `null`.
 */
export function ageOf(birthDate?: string | null, endDate?: string | null): Age | null {
  const birth = parsePartialDate(birthDate);
  if (!birth?.year) return null;

  const end = endDate ? parsePartialDate(endDate) : partesDeHoje();
  if (!end?.year) return null;

  let years = end.year - birth.year;
  const approximate = !birth.month || !birth.day || !end.month || !end.day;

  // Só desconta o ano em curso quando os dois lados têm mês: sem ele, o desconto
  // seria chute.
  if (birth.month && end.month) {
    const difMês = end.month - birth.month;
    const difDia = (end.day ?? birth.day ?? 1) - (birth.day ?? 1);
    if (difMês < 0 || (difMês === 0 && difDia < 0)) years -= 1;
  }

  return years >= 0 ? { years, approximate } : null;
}

/** A idade em número puro, para quem só precisa ordenar ou comparar. */
export function getAgeInYears(
  birthDate?: string | null,
  endDate?: string | null,
): number | null {
  return ageOf(birthDate, endDate)?.years ?? null;
}

/**
 * Chave de ordenação: `1988-05-30`, `1988-05` e `1988` ficam na mesma escala, e
 * quem não tem ano vai para o fim — é desconhecido, não é antigo.
 */
export function partialDateSortKey(value?: string | null): string {
  const parts = parsePartialDate(value);
  if (!parts?.year) return '9999-99-99';
  return [
    String(parts.year).padStart(4, '0'),
    String(parts.month ?? 0).padStart(2, '0'),
    String(parts.day ?? 0).padStart(2, '0'),
  ].join('-');
}

function partesDeHoje(): DateParts {
  const hoje = new Date();
  return { year: hoje.getFullYear(), month: hoje.getMonth() + 1, day: hoje.getDate() };
}
