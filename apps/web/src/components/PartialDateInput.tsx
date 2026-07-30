import { useRef, useState } from 'react';
import { formatPartialDateISO, parsePartialDate } from '../date';

interface Campos {
  day: string;
  month: string;
  year: string;
}

function camposDe(value?: string | null): Campos {
  const parts = parsePartialDate(value);
  return {
    day: parts?.day ? String(parts.day).padStart(2, '0') : '',
    month: parts?.month ? String(parts.month).padStart(2, '0') : '',
    year: parts?.year ? String(parts.year) : '',
  };
}

function canônico({ day, month, year }: Campos): string | null {
  return formatPartialDateISO({
    year: year ? Number(year) : null,
    month: month ? Number(month) : null,
    day: day ? Number(day) : null,
  });
}

/**
 * Três caixas — dia, mês e ano —, cada uma opcional (RN-027). Substitui o
 * `<input type="date">`, que exigia a data inteira e obrigava a inventar 1º de
 * janeiro para quem só sabe o ano.
 *
 * **O caminho de sempre continua sendo digitar direto**: as caixas avançam
 * sozinhas quando enchem, então `30`, `05`, `1988` sai num sopro, sem tocar no
 * mouse nem em tecla de navegação — é o que 95% dos cadastros fazem (ADR-028).
 * Backspace em caixa vazia volta para a anterior, pelo mesmo motivo.
 *
 * O que está digitado é **estado do campo**, não do formulário: quem digita o dia
 * antes do mês veria o dia sumir, porque dia sem mês não entra no formato
 * canônico. Aqui ele fica na tela, esperando o mês, e só então vira valor.
 */
export default function PartialDateInput({
  id,
  label,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  /** Vira o rótulo acessível de cada caixa: "Dia do nascimento". */
  label: string;
  value?: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const [campos, setCampos] = useState<Campos>(() => camposDe(value));
  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  // Quando o valor de fora muda — trocar de pessoa, o formulário carregar —, as
  // caixas se realinham a ele. Ajuste durante o render, e não efeito: é o padrão
  // do React para estado derivado de prop, e não custa um segundo render pintado.
  // Comparar com o que a tela produziria evita desfazer o que está sendo digitado.
  const [valorVisto, setValorVisto] = useState(value ?? null);
  if ((value ?? null) !== valorVisto) {
    setValorVisto(value ?? null);
    if (canônico(campos) !== (value ?? null)) setCampos(camposDe(value));
  }

  function troca(campo: keyof Campos, bruto: string, tamanho: number, próxima?: typeof dayRef) {
    const limpo = bruto.replace(/\D/g, '').slice(0, tamanho);
    const novos = { ...campos, [campo]: limpo };
    setCampos(novos);
    onChange(canônico(novos));
    if (limpo.length >= tamanho) próxima?.current?.focus();
  }

  function voltaNoBackspace(
    event: React.KeyboardEvent<HTMLInputElement>,
    anterior: typeof dayRef,
  ) {
    if (event.key === 'Backspace' && event.currentTarget.value === '') anterior.current?.focus();
  }

  const diaSemMês = Boolean(campos.day) && !campos.month;

  return (
    <div className="partial-date">
      <div className="partial-date-fields">
        <input
          id={id}
          ref={dayRef}
          className="partial-date-field is-day"
          inputMode="numeric"
          maxLength={2}
          placeholder="dd"
          aria-label={`Dia do ${label}`}
          disabled={disabled}
          value={campos.day}
          onChange={(e) => troca('day', e.target.value, 2, monthRef)}
        />
        <span className="partial-date-sep" aria-hidden>
          /
        </span>
        <input
          ref={monthRef}
          className="partial-date-field is-month"
          inputMode="numeric"
          maxLength={2}
          placeholder="mm"
          aria-label={`Mês do ${label}`}
          disabled={disabled}
          value={campos.month}
          onChange={(e) => troca('month', e.target.value, 2, yearRef)}
          onKeyDown={(e) => voltaNoBackspace(e, dayRef)}
        />
        <span className="partial-date-sep" aria-hidden>
          /
        </span>
        <input
          ref={yearRef}
          className="partial-date-field is-year"
          inputMode="numeric"
          maxLength={4}
          placeholder="aaaa"
          aria-label={`Ano do ${label}`}
          disabled={disabled}
          value={campos.year}
          onChange={(e) => troca('year', e.target.value, 4)}
          onKeyDown={(e) => voltaNoBackspace(e, monthRef)}
        />
      </div>
      {diaSemMês && (
        <span className="field-hint partial-date-warn">
          Só o dia não diz nada: informe o mês também, ou deixe só o ano.
        </span>
      )}
    </div>
  );
}
