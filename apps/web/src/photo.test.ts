import { describe, expect, it } from 'vitest';
import {
  checkPhotoFile,
  computeScaledSize,
  MAX_UPLOAD_BYTES,
  photoUrl,
} from './photo';

const arquivo = (type: string, size: number) =>
  ({ type, size, name: 'foto' }) as File;

describe('computeScaledSize', () => {
  it('deixa quieta a imagem que já cabe', () => {
    // Ampliar só inventaria pixel.
    expect(computeScaledSize(300, 200, 512)).toEqual({ width: 300, height: 200 });
    expect(computeScaledSize(512, 512, 512)).toEqual({ width: 512, height: 512 });
  });

  it('encolhe pelo maior lado, mantendo a proporção', () => {
    expect(computeScaledSize(2000, 1000, 512)).toEqual({ width: 512, height: 256 });
    expect(computeScaledSize(1000, 2000, 512)).toEqual({ width: 256, height: 512 });
    expect(computeScaledSize(1024, 1024, 512)).toEqual({ width: 512, height: 512 });
  });

  it('não deixa o lado menor virar zero numa imagem muito comprida', () => {
    // 4000x3 reduzido daria 0.38px de altura; canvas de altura zero não desenha.
    expect(computeScaledSize(4000, 3, 512)).toEqual({ width: 512, height: 1 });
  });
});

describe('checkPhotoFile', () => {
  it('aceita os três formatos', () => {
    expect(checkPhotoFile(arquivo('image/jpeg', 1000))).toBeNull();
    expect(checkPhotoFile(arquivo('image/png', 1000))).toBeNull();
    expect(checkPhotoFile(arquivo('image/webp', 1000))).toBeNull();
  });

  it('recusa o que não é imagem aceita', () => {
    expect(checkPhotoFile(arquivo('application/pdf', 1000))).toMatch(/JPEG/);
    expect(checkPhotoFile(arquivo('image/gif', 1000))).toMatch(/JPEG/);
  });

  it('recusa arquivo acima do teto, antes de decodificar', () => {
    expect(checkPhotoFile(arquivo('image/jpeg', MAX_UPLOAD_BYTES + 1))).toMatch(
      /2 MB/,
    );
    expect(checkPhotoFile(arquivo('image/jpeg', MAX_UPLOAD_BYTES))).toBeNull();
  });
});

describe('photoUrl', () => {
  it('é nulo para quem não tem foto', () => {
    expect(photoUrl({ id: 'p1', photoUpdatedAt: null })).toBeNull();
    expect(photoUrl({ id: 'p1' })).toBeNull();
  });

  it('pendura a data do upload para o navegador não servir a foto velha', () => {
    expect(photoUrl({ id: 'p1', photoUpdatedAt: '2026-07-28T00:00:00.000Z' })).toBe(
      '/api/people/p1/photo?v=2026-07-28T00%3A00%3A00.000Z',
    );
  });

  it('trocar a foto troca a URL', () => {
    const antes = photoUrl({ id: 'p1', photoUpdatedAt: '2026-07-28T00:00:00.000Z' });
    const depois = photoUrl({ id: 'p1', photoUpdatedAt: '2026-07-28T10:00:00.000Z' });
    expect(antes).not.toBe(depois);
  });
});
