import { SetMetadata } from '@nestjs/common';

/**
 * Marca uma rota como acessível sem sessão (BL-10). O guard de auth é
 * **global** — um controller novo nasce protegido por padrão — então esta é a
 * exceção explícita, não o caminho comum.
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
