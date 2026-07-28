import { IsBase64, IsIn, IsString } from 'class-validator';
import { PHOTO_MIME_TYPES } from '../photo.util';

export class UploadPhotoDto {
  /** Só os bytes em base64 — o prefixo `data:` fica no navegador. */
  @IsString()
  @IsBase64()
  data: string;

  @IsIn(PHOTO_MIME_TYPES)
  mimeType: string;
}
