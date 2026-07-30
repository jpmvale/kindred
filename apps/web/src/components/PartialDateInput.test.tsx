import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PartialDateInput from './PartialDateInput';

function montar(value: string | null = null) {
  const onChange = vi.fn();
  render(
    <PartialDateInput id="d" label="nascimento" value={value} onChange={onChange} />,
  );
  return {
    onChange,
    dia: screen.getByLabelText('Dia do nascimento'),
    mês: screen.getByLabelText('Mês do nascimento'),
    ano: screen.getByLabelText('Ano do nascimento'),
  };
}

describe('PartialDateInput', () => {
  it('digitar dia, mês e ano seguido monta a data inteira — o caminho de 95% dos casos', async () => {
    const user = userEvent.setup();
    const { onChange, dia } = montar();

    // Sem clicar nas outras caixas: elas recebem o foco sozinhas quando enchem.
    await user.type(dia, '30051988');

    expect(onChange).toHaveBeenLastCalledWith('1988-05-30');
  });

  it('só o ano vale como data', async () => {
    const user = userEvent.setup();
    const { onChange, ano } = montar();

    await user.type(ano, '1942');

    expect(onChange).toHaveBeenLastCalledWith('1942');
  });

  it('dia e mês sem ano viram a data que se repete todo ano', async () => {
    const user = userEvent.setup();
    const { onChange, dia } = montar();

    await user.type(dia, '3005');

    expect(onChange).toHaveBeenLastCalledWith('--05-30');
  });

  it('o dia digitado sem mês fica na tela, avisando — não some', async () => {
    const user = userEvent.setup();
    const { onChange, dia } = montar();

    await user.type(dia, '30');

    // O valor ainda não existe (dia sozinho não é data), mas o que foi digitado
    // continua ali: some seria pior que esperar o mês.
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(dia).toHaveValue('30');
    expect(screen.getByText(/Só o dia não diz nada/)).toBeInTheDocument();
  });

  it('mostra a data que veio de fora, quebrada nas três caixas', () => {
    const { dia, mês, ano } = montar('1988-05-30');

    expect(dia).toHaveValue('30');
    expect(mês).toHaveValue('05');
    expect(ano).toHaveValue('1988');
  });

  it('apagar o ano deixa a data parcial em vez de zerar tudo', async () => {
    const user = userEvent.setup();
    const { onChange, ano } = montar('1988-05-30');

    await user.clear(ano);

    expect(onChange).toHaveBeenLastCalledWith('--05-30');
  });

  it('backspace em caixa vazia volta para a anterior', async () => {
    const user = userEvent.setup();
    const { mês, dia } = montar();

    mês.focus();
    await user.keyboard('{Backspace}');

    expect(dia).toHaveFocus();
  });

  it('ignora o que não é número', async () => {
    const user = userEvent.setup();
    const { onChange, ano } = montar();

    await user.type(ano, '19a8b8');

    expect(onChange).toHaveBeenLastCalledWith('1988');
  });
});
