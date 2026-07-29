import { randomBytes, createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { Prisma } from '@kindred/db';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import type { AuthenticatedUser } from './auth.types';

const BCRYPT_COST = 12;

/** Sem renovação deslizante no MVP: a sessão expira 30 dias após o login,
 * independente de uso — usar o app não a estende. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type SessionResult = {
  user: AuthenticatedUser;
  token: string;
  expiresAt: Date;
};

/** O hash SHA-256 (hex) é o que fica no banco — o token cru só existe no cookie. */
function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

const USER_SELECT = { id: true, name: true, email: true } as const;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto): Promise<SessionResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Este e-mail já tem conta');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);

    let user: AuthenticatedUser;
    try {
      user = await this.prisma.user.create({
        data: { name: dto.name, email: dto.email, passwordHash },
        select: USER_SELECT,
      });
    } catch (error) {
      // Corrida entre dois cadastros simultâneos com o mesmo e-mail — o
      // findUnique acima não pega, o índice único do banco sim.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Este e-mail já tem conta');
      }
      throw error;
    }

    return this.createSession(user);
  }

  async login(dto: LoginDto): Promise<SessionResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Mesma mensagem para e-mail inexistente e senha errada — não vazar qual
    // dos dois falhou.
    const invalido = () =>
      new UnauthorizedException('E-mail ou senha inválidos');
    if (!user) throw invalido();

    const senhaCorreta = await bcrypt.compare(dto.password, user.passwordHash);
    if (!senhaCorreta) throw invalido();

    return this.createSession({
      id: user.id,
      name: user.name,
      email: user.email,
    });
  }

  /**
   * Troca e-mail e/ou senha (BL-16). A senha atual é conferida sempre, mesmo
   * para só trocar o e-mail — é a mesma defesa do `login`, reaplicada aqui:
   * uma sessão sequestrada não deveria conseguir assumir a conta de vez sem
   * saber a senha.
   *
   * Trocar a senha derruba as **outras** sessões (qualquer outro dispositivo
   * logado perde acesso), mas mantém a atual — trocar a própria senha não
   * pode deslogar quem acabou de fazer isso.
   */
  async updateMe(
    userId: string,
    dto: UpdateMeDto,
    currentToken: string,
  ): Promise<AuthenticatedUser> {
    if (!dto.email && !dto.newPassword) {
      throw new BadRequestException('Informe um novo e-mail ou uma nova senha');
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const senhaCorreta = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!senhaCorreta) throw new UnauthorizedException('Senha atual incorreta');

    const data: { email?: string; passwordHash?: string } = {};
    if (dto.email && dto.email !== user.email) data.email = dto.email;
    if (dto.newPassword) {
      data.passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_COST);
    }

    let updated: AuthenticatedUser;
    try {
      updated = await this.prisma.user.update({
        where: { id: userId },
        data,
        select: USER_SELECT,
      });
    } catch (error) {
      // Mesma corrida do `register`: outra conta ficou com este e-mail entre
      // o `!==` acima e este `update`.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Este e-mail já tem conta');
      }
      throw error;
    }

    if (dto.newPassword) {
      await this.prisma.session.deleteMany({
        where: { userId, id: { not: hashToken(currentToken) } },
      });
    }

    return updated;
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.session.deleteMany({
      where: { id: hashToken(rawToken) },
    });
  }

  async validateSession(
    rawToken: string | undefined,
  ): Promise<AuthenticatedUser | null> {
    if (!rawToken) return null;

    const session = await this.prisma.session.findUnique({
      where: { id: hashToken(rawToken) },
      include: { user: { select: USER_SELECT } },
    });
    if (!session) return null;

    if (session.expiresAt < new Date()) {
      // Limpeza preguiçosa: sem cron, o volume de um app pessoal não pede.
      await this.prisma.session
        .delete({ where: { id: session.id } })
        .catch(() => undefined);
      return null;
    }

    return session.user;
  }

  private async createSession(user: AuthenticatedUser): Promise<SessionResult> {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.prisma.session.create({
      data: { id: hashToken(token), userId: user.id, expiresAt },
    });

    return { user, token, expiresAt };
  }
}
