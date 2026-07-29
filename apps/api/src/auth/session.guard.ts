import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { sessionToken } from './cookie';

/**
 * Guard global (registrado como `APP_GUARD` em `AppModule`) — um controller
 * novo nasce protegido por padrão; `@Public()` é a exceção explícita, não o
 * inverso. Ver ADR-018 sobre por que não é `@UseGuards` por controller.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const user = await this.authService.validateSession(sessionToken(req));
    if (!user) throw new UnauthorizedException();

    req.user = user;
    return true;
  }
}
