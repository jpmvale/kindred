import { normalizeForSearch } from './search.util';

describe('normalizeForSearch', () => {
  it('baixa a caixa', () => {
    expect(normalizeForSearch('JOSÉ')).toBe('jose');
  });

  it('tira o acento agudo, o circunflexo e o til', () => {
    expect(normalizeForSearch('José')).toBe('jose');
    expect(normalizeForSearch('Antônio')).toBe('antonio');
    expect(normalizeForSearch('João')).toBe('joao');
  });

  it('tira a cedilha sem comer o "c"', () => {
    expect(normalizeForSearch('Conceição')).toBe('conceicao');
  });

  it('deixa quem não tem acento como está', () => {
    expect(normalizeForSearch('Marcos')).toBe('marcos');
  });

  it('normaliza os dois lados para o mesmo texto', () => {
    // O ponto da RN-016: digitar com ou sem acento chega no mesmo lugar.
    expect(normalizeForSearch('jose')).toBe(normalizeForSearch('José'));
    expect(normalizeForSearch('AVÔ')).toBe(normalizeForSearch('avo'));
  });

  it('não mexe no espaço nem no traço do nome composto', () => {
    expect(normalizeForSearch('Maria de Fátima Sá-Pereira')).toBe(
      'maria de fatima sa-pereira',
    );
  });
});
