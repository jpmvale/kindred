import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  sessionToken,
} from './cookie';
import type { AuthenticatedUser } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.authService.register(dto);
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    return user;
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.authService.login(dto);
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    return user;
  }

  // Público de propósito: funciona mesmo sem cookie ou com sessão já expirada
  // (idempotente) — é a própria saída da sessão, não pode depender dela.
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(sessionToken(req));
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/api' });
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  /**
   * Trocar e-mail e/ou senha (BL-16). Não é `@Public()` — exige a sessão
   * comum, e o token dela é o que decide quais **outras** sessões somem
   * quando a senha muda (`AuthService.updateMe`).
   */
  @Patch('me')
  updateMe(
    @Body() dto: UpdateMeDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const token = sessionToken(req);
    // Inalcançável: esta rota não é `@Public()`, então o guard já exigiu um
    // cookie válido para `user` existir. Checado mesmo assim — nunca um `!`
    // solto onde o compilador ainda consegue avisar.
    if (!token) throw new UnauthorizedException();
    return this.authService.updateMe(user.id, dto, token);
  }
}
