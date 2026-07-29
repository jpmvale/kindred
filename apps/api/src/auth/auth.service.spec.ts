import bcrypt from 'bcryptjs';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@kindred/db';
import { AuthService } from './auth.service';
import type { PrismaService } from '../prisma/prisma.service';

/** Um `P2002` de verdade — não um Error qualquer com `.code` grudado. */
function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
  });
}

/*
 * Dublê de Prisma escrito à mão, no mesmo estilo de
 * `people/people.service.spec.ts` — sem lib de mock de Prisma.
 */
function prismaFake() {
  const users = new Map<
    string,
    { id: string; name: string; email: string; passwordHash: string }
  >();
  const sessions = new Map<
    string,
    { id: string; userId: string; expiresAt: Date }
  >();

  const service = {
    user: {
      findUnique: jest.fn(({ where }: { where: { email: string } }) =>
        Promise.resolve(
          [...users.values()].find((u) => u.email === where.email) ?? null,
        ),
      ),
      create: jest.fn(
        ({
          data,
        }: {
          data: { name: string; email: string; passwordHash: string };
        }) => {
          if ([...users.values()].some((u) => u.email === data.email)) {
            return Promise.reject(uniqueConstraintError());
          }
          const user = { id: `u${users.size + 1}`, ...data };
          users.set(user.id, user);
          return Promise.resolve({
            id: user.id,
            name: user.name,
            email: user.email,
          });
        },
      ),
      findUniqueOrThrow: jest.fn(({ where }: { where: { id: string } }) => {
        const user = users.get(where.id);
        if (!user) return Promise.reject(new Error('not found'));
        return Promise.resolve(user);
      }),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: { email?: string; passwordHash?: string };
        }) => {
          const user = users.get(where.id)!;
          if (
            data.email &&
            [...users.values()].some(
              (u) => u.id !== user.id && u.email === data.email,
            )
          ) {
            return Promise.reject(uniqueConstraintError());
          }
          const updated = { ...user, ...data };
          users.set(user.id, updated);
          return Promise.resolve({
            id: updated.id,
            name: updated.name,
            email: updated.email,
          });
        },
      ),
    },
    session: {
      create: jest.fn(
        ({
          data,
        }: {
          data: { id: string; userId: string; expiresAt: Date };
        }) => {
          sessions.set(data.id, data);
          return Promise.resolve(data);
        },
      ),
      findUnique: jest.fn(({ where }: { where: { id: string } }) => {
        const session = sessions.get(where.id);
        if (!session) return Promise.resolve(null);
        const user = users.get(session.userId)!;
        return Promise.resolve({
          ...session,
          user: { id: user.id, name: user.name, email: user.email },
        });
      }),
      delete: jest.fn(({ where }: { where: { id: string } }) => {
        sessions.delete(where.id);
        return Promise.resolve();
      }),
      deleteMany: jest.fn(
        ({
          where,
        }: {
          where: { id: string } | { userId: string; id: { not: string } };
        }) => {
          let count = 0;
          if ('userId' in where) {
            for (const [id, session] of sessions) {
              if (session.userId === where.userId && id !== where.id.not) {
                sessions.delete(id);
                count++;
              }
            }
          } else if (sessions.delete(where.id)) {
            count = 1;
          }
          return Promise.resolve({ count });
        },
      ),
    },
  };

  return {
    prisma: service as unknown as PrismaService,
    users,
    sessions,
    service,
  };
}

describe('AuthService', () => {
  describe('register', () => {
    it('recusa e-mail já cadastrado', async () => {
      const { prisma } = prismaFake();
      const service = new AuthService(prisma);
      await service.register({
        name: 'Ana',
        email: 'ana@x.com',
        password: 'senha1234',
      });

      await expect(
        service.register({
          name: 'Outra Ana',
          email: 'ana@x.com',
          password: 'outrasenha',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('recusa a mesma corrida de e-mail duplicado que o findUnique não pega', async () => {
      // Simula duas requisições simultâneas: o findUnique de ambas não vê
      // ninguém, e é o create() que detecta via o índice único do banco.
      const { prisma, service } = prismaFake();
      service.user.findUnique.mockResolvedValueOnce(null);
      await new AuthService(prisma).register({
        name: 'Ana',
        email: 'ana@x.com',
        password: 'senha1234',
      });

      service.user.findUnique.mockResolvedValueOnce(null);
      await expect(
        new AuthService(prisma).register({
          name: 'Ana Dois',
          email: 'ana@x.com',
          password: 'outrasenha',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('grava a senha com hash, nunca em texto puro', async () => {
      const { prisma, users } = prismaFake();
      await new AuthService(prisma).register({
        name: 'Ana',
        email: 'ana@x.com',
        password: 'senha1234',
      });

      const salva = [...users.values()][0];
      expect(salva.passwordHash).not.toBe('senha1234');
      expect(await bcrypt.compare('senha1234', salva.passwordHash)).toBe(true);
    });
  });

  describe('login', () => {
    it('a mesma mensagem de erro serve para e-mail inexistente e senha errada', async () => {
      const { prisma } = prismaFake();
      const service = new AuthService(prisma);
      await service.register({
        name: 'Ana',
        email: 'ana@x.com',
        password: 'senha1234',
      });

      const capturaErro = (login: Promise<unknown>) =>
        login.catch((e: unknown) => e) as Promise<UnauthorizedException>;

      const [e1, e2] = await Promise.all([
        capturaErro(
          service.login({ email: 'ninguem@x.com', password: 'qualquer' }),
        ),
        capturaErro(service.login({ email: 'ana@x.com', password: 'errada' })),
      ]);
      expect(e1).toBeInstanceOf(UnauthorizedException);
      expect(e2).toBeInstanceOf(UnauthorizedException);
      expect(e1.message).toBe(e2.message);
    });

    it('senha certa autentica e cria uma sessão', async () => {
      const { prisma } = prismaFake();
      const service = new AuthService(prisma);
      await service.register({
        name: 'Ana',
        email: 'ana@x.com',
        password: 'senha1234',
      });

      const { user, token } = await service.login({
        email: 'ana@x.com',
        password: 'senha1234',
      });

      expect(user.email).toBe('ana@x.com');
      expect(await service.validateSession(token)).toEqual(user);
    });
  });

  describe('validateSession', () => {
    it('token expirado devolve null e apaga a sessão', async () => {
      const { prisma, sessions } = prismaFake();
      const service = new AuthService(prisma);
      const { token } = await service.register({
        name: 'Ana',
        email: 'ana@x.com',
        password: 'senha1234',
      });

      const [id] = sessions.keys();
      sessions.set(id, {
        ...sessions.get(id)!,
        expiresAt: new Date(Date.now() - 1000),
      });

      expect(await service.validateSession(token)).toBeNull();
      expect(sessions.has(id)).toBe(false);
    });

    it('sem cookie, devolve null sem consultar o banco', async () => {
      const { prisma, service } = prismaFake();
      expect(
        await new AuthService(prisma).validateSession(undefined),
      ).toBeNull();
      expect(service.session.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('apaga a sessão do token', async () => {
      const { prisma, sessions } = prismaFake();
      const service = new AuthService(prisma);
      const { token } = await service.register({
        name: 'Ana',
        email: 'ana@x.com',
        password: 'senha1234',
      });
      expect(sessions.size).toBe(1);

      await service.logout(token);

      expect(sessions.size).toBe(0);
    });

    it('sem cookie, não faz nada (idempotente)', async () => {
      const { prisma, service } = prismaFake();
      await new AuthService(prisma).logout(undefined);
      expect(service.session.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('updateMe', () => {
    async function setup() {
      const helpers = prismaFake();
      const service = new AuthService(helpers.prisma);
      const { user, token } = await service.register({
        name: 'Ana',
        email: 'ana@x.com',
        password: 'senha1234',
      });
      return { ...helpers, service, user, token };
    }

    it('recusa senha atual errada', async () => {
      const { service, token } = await setup();
      await expect(
        service.updateMe(
          'u1',
          { currentPassword: 'errada', email: 'nova@x.com' },
          token,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('recusa se não vier nem e-mail nem senha nova', async () => {
      const { service, token } = await setup();
      await expect(
        service.updateMe('u1', { currentPassword: 'senha1234' }, token),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa e-mail já usado por outra conta', async () => {
      const { service, token } = await setup();
      await service.register({
        name: 'Bia',
        email: 'bia@x.com',
        password: 'outrasenha',
      });

      await expect(
        service.updateMe(
          'u1',
          { currentPassword: 'senha1234', email: 'bia@x.com' },
          token,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('troca só o e-mail sem derrubar nenhuma sessão', async () => {
      const { service, token, sessions } = await setup();
      const outraSessao = await service.login({
        email: 'ana@x.com',
        password: 'senha1234',
      });
      expect(sessions.size).toBe(2);

      const updated = await service.updateMe(
        'u1',
        { currentPassword: 'senha1234', email: 'nova@x.com' },
        token,
      );

      expect(updated.email).toBe('nova@x.com');
      expect(sessions.size).toBe(2);
      expect(await service.validateSession(outraSessao.token)).not.toBeNull();
    });

    it('troca a senha, mantém a sessão atual e derruba as outras', async () => {
      const { service, token, users } = await setup();
      const outraSessao = await service.login({
        email: 'ana@x.com',
        password: 'senha1234',
      });

      await service.updateMe(
        'u1',
        { currentPassword: 'senha1234', newPassword: 'senhanova123' },
        token,
      );

      expect(await service.validateSession(token)).not.toBeNull();
      expect(await service.validateSession(outraSessao.token)).toBeNull();

      const salva = users.get('u1')!;
      expect(await bcrypt.compare('senhanova123', salva.passwordHash)).toBe(
        true,
      );
    });
  });
});
