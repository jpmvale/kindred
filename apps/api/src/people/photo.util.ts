/*
 * Regras da foto de perfil que não dependem do banco (RN-017, ADR-011).
 *
 * O tipo da imagem chega declarado pelo cliente, e é o tipo que a API vai devolver
 * no `Content-Type` quando alguém pedir a foto. Declaração não é prova: aqui os
 * primeiros bytes do arquivo são conferidos contra a assinatura do formato, para
 * não guardar um arquivo dizendo ser outra coisa.
 */

/** Os únicos tipos aceitos. GIF e SVG ficam de fora — SVG é documento, não imagem. */
export const PHOTO_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type PhotoMimeType = (typeof PHOTO_MIME_TYPES)[number];

/** Teto do que entra no banco, já decodificado. O web manda bem menos que isso. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

function começaCom(bytes: Buffer, assinatura: number[]): boolean {
  if (bytes.length < assinatura.length) return false;
  return assinatura.every((byte, i) => bytes[i] === byte);
}

/** WebP é um contêiner RIFF: "RIFF" + 4 bytes de tamanho + "WEBP". */
function éWebp(bytes: Buffer): boolean {
  if (bytes.length < 12) return false;
  return (
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  );
}

export function matchesMimeType(bytes: Buffer, mimeType: string): boolean {
  switch (mimeType) {
    case 'image/png':
      return começaCom(bytes, PNG);
    case 'image/jpeg':
      return começaCom(bytes, JPEG);
    case 'image/webp':
      return éWebp(bytes);
    default:
      return false;
  }
}
