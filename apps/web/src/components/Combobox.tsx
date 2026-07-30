import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Linha secundária, em cinza — datas, parentesco, o que ajude a escolher. */
  hint?: string;
}

/**
 * Select digitável (combobox de escolha única), no mesmo espírito do
 * `multi-select` do coda: um campo que abre uma lista com busca, fecha no Esc ou
 * no clique fora, e se navega pelo teclado.
 *
 * O campo **é** a busca — não há caixa de texto separada dentro do popover. Com
 * 150 pessoas cadastradas, procurar o pai numa lista rolável era o gargalo; aqui
 * digitar duas letras já resolve. A comparação ignora acento e caixa: "jose"
 * acha "José" (ADR-024).
 */
export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder = 'Selecione...',
  emptyLabel = 'Nada encontrado.',
  disabled = false,
  ariaLabel,
  footer,
}: {
  id?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: ComboboxOption[];
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  ariaLabel?: string;
  /** Rodapé do popover — usado para "mostrar quem o filtro escondeu". */
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return options;
    return options.filter((option) => normalize(`${option.label} ${option.hint ?? ''}`).includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDocument = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close();
    };
    document.addEventListener('mousedown', onDocument);
    return () => document.removeEventListener('mousedown', onDocument);
  });

  function close() {
    setOpen(false);
    setQuery('');
  }

  function pick(option: ComboboxOption | null) {
    onChange(option ? option.value : null);
    close();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => {
        if (filtered.length === 0) return 0;
        return (current + step + filtered.length) % filtered.length;
      });
      return;
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault();
      pick(filtered[activeIndex] ?? null);
      return;
    }
    if (event.key === 'Tab') close();
  }

  return (
    <div className="combobox" ref={rootRef}>
      <input
        id={id}
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        disabled={disabled}
        placeholder={selected ? selected.label : placeholder}
        className={selected && !open ? 'combobox-input has-value' : 'combobox-input'}
        value={open ? query : (selected?.label ?? '')}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />

      {selected && !disabled && (
        <button
          type="button"
          className="combobox-clear"
          aria-label={`Limpar ${ariaLabel ?? 'seleção'}`}
          onClick={() => {
            pick(null);
            inputRef.current?.focus();
          }}
        >
          ×
        </button>
      )}

      {open && (
        <div className="combobox-popover">
          <ul className="combobox-list" id={listId} role="listbox">
            {filtered.length === 0 ? (
              <li className="combobox-empty">{emptyLabel}</li>
            ) : (
              filtered.map((option, index) => (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    className={index === activeIndex ? 'combobox-option active' : 'combobox-option'}
                    onMouseEnter={() => setActiveIndex(index)}
                    // `onMouseDown` e não `onClick`: o clique fora fecha o popover
                    // no `mousedown`, e a opção sumia antes do clique completar.
                    onMouseDown={(event) => {
                      event.preventDefault();
                      pick(option);
                    }}
                  >
                    <span className="combobox-option-label">{option.label}</span>
                    {option.hint && <span className="combobox-option-hint">{option.hint}</span>}
                  </button>
                </li>
              ))
            )}
          </ul>
          {footer && <div className="combobox-footer">{footer}</div>}
        </div>
      )}
    </div>
  );
}

/** Sem acento e sem caixa: numa base em português, buscar "jose" tem de achar "José". */
function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
