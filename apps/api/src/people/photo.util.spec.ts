import { matchesMimeType, MAX_PHOTO_BYTES } from './photo.util';

const png = (resto: number[] = []) =>
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...resto]);
const jpeg = (resto: number[] = []) =>
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...resto]);
const webp = () =>
  Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.from([0x1a, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP', 'ascii'),
  ]);

describe('matchesMimeType', () => {
  it('reconhece os três formatos aceitos', () => {
    expect(matchesMimeType(png(), 'image/png')).toBe(true);
    expect(matchesMimeType(jpeg(), 'image/jpeg')).toBe(true);
    expect(matchesMimeType(webp(), 'image/webp')).toBe(true);
  });

  it('não deixa passar arquivo que mente sobre o próprio tipo', () => {
    // O tipo declarado é o que a API vai devolver no Content-Type; se ninguém
    // conferir, dá para guardar qualquer coisa com etiqueta de imagem.
    expect(matchesMimeType(png(), 'image/jpeg')).toBe(false);
    expect(matchesMimeType(jpeg(), 'image/webp')).toBe(false);
    expect(matchesMimeType(Buffer.from('<html>', 'ascii'), 'image/png')).toBe(
      false,
    );
  });

  it('recusa tipo fora da lista, mesmo com bytes válidos', () => {
    expect(matchesMimeType(png(), 'image/gif')).toBe(false);
    expect(matchesMimeType(png(), 'image/svg+xml')).toBe(false);
    expect(matchesMimeType(png(), 'text/html')).toBe(false);
  });

  it('não estoura com arquivo curto demais para ter assinatura', () => {
    expect(matchesMimeType(Buffer.alloc(0), 'image/png')).toBe(false);
    expect(matchesMimeType(Buffer.from([0x89]), 'image/png')).toBe(false);
    expect(matchesMimeType(Buffer.from('RIFF', 'ascii'), 'image/webp')).toBe(
      false,
    );
  });

  it('um RIFF que não é WEBP não passa por WebP', () => {
    // RIFF também embala .wav e .avi.
    const wav = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x1a, 0x00, 0x00, 0x00]),
      Buffer.from('WAVE', 'ascii'),
    ]);
    expect(matchesMimeType(wav, 'image/webp')).toBe(false);
  });

  it('o teto é de 2 MB', () => {
    expect(MAX_PHOTO_BYTES).toBe(2 * 1024 * 1024);
  });
});
