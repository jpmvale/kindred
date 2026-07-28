/*
 * Preparo da foto de perfil antes de subir (RN-017, ADR-011).
 *
 * A imagem é reduzida **no navegador**, não no servidor: a foto que sai de um
 * celular tem alguns megabytes e vira um avatar de 40 pixels na tela. Reduzir
 * aqui evita subir o arquivo inteiro, evita guardá-lo inteiro no banco e evita
 * uma dependência nativa de processamento de imagem na API.
 */

import type { Person, PhotoUploadData } from '@kindred/types';

/**
 * O endereço da foto de uma pessoa, ou nulo se ela não tem.
 *
 * A URL não muda quando a foto muda, então vai junto a data do upload: é o que
 * faz o navegador buscar a nova em vez de mostrar a antiga do cache. Mora aqui,
 * e não em `api/people.ts`, para o layout da árvore continuar sendo um módulo
 * puro — importar o cliente da API arrastaria o axios para dentro dele.
 */
export function photoUrl(
  person: Pick<Person, 'id' | 'photoUpdatedAt'>,
): string | null {
  if (!person.photoUpdatedAt) return null;
  return `/api/people/${person.id}/photo?v=${encodeURIComponent(person.photoUpdatedAt)}`;
}

/** Maior lado da imagem guardada. O avatar maior da tela tem 64px. */
export const MAX_PHOTO_SIDE = 512;

/** Teto do arquivo escolhido, antes de reduzir. O mesmo da API. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * O tamanho depois de caber num quadrado de `max`, mantendo a proporção.
 * Imagem menor que o limite fica como está — ampliar só inventaria pixel.
 */
export function computeScaledSize(
  width: number,
  height: number,
  max = MAX_PHOTO_SIDE,
): { width: number; height: number } {
  const maiorLado = Math.max(width, height);
  if (maiorLado <= max) return { width, height };

  const fator = max / maiorLado;
  return {
    width: Math.max(1, Math.round(width * fator)),
    height: Math.max(1, Math.round(height * fator)),
  };
}

/** O que barra o arquivo antes de gastar memória decodificando. */
export function checkPhotoFile(file: File): string | null {
  if (!ACCEPTED_PHOTO_TYPES.includes(file.type))
    return 'Escolha uma imagem JPEG, PNG ou WebP.';
  if (file.size > MAX_UPLOAD_BYTES) return 'A imagem passa de 2 MB.';
  return null;
}

/**
 * Do arquivo escolhido para o corpo do upload: reduz, achata em JPEG e devolve
 * em base64.
 *
 * O JPEG não tem transparência, então o fundo é pintado de branco antes — sem
 * isso, o transparente de um PNG viraria preto.
 */
export async function fileToPhotoUpload(file: File): Promise<PhotoUploadData> {
  const erro = checkPhotoFile(file);
  if (erro) throw new Error(erro);

  const bitmap = await createImageBitmap(file);
  const { width, height } = computeScaledSize(bitmap.width, bitmap.height);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível preparar a imagem.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { data: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: 'image/jpeg' };
}
