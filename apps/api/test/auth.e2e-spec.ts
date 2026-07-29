import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * O ciclo de sessão por cookie (BL-10) — o que só se prova com uma requisição
 * HTTP de verdade, não com o `AuthService` dublado em teste unitário: o cookie
 * sai `httpOnly`, e uma rota comum (não só `/auth/me`) barra sem ele.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const criados: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    for (const id of criados) {
      await prisma.user.delete({ where: { id } }).catch(() => undefined);
    }
    await app.close();
  });

  const emailUnico = (rotulo: string) =>
    `e2e-auth-${rotulo}-${Date.now()}-${Math.random().toString(36).slice(2)}@teste.kindred.local`;

  type UsuarioResposta = { id: string; name: string; email: string };
  type ErroResposta = { message: string | string[] };

  it('register → me → logout → me: a sessão nasce, funciona e morre', async () => {
    const agent = request.agent(app.getHttpServer());
    const email = emailUnico('ciclo');

    const registro = await agent
      .post('/api/auth/register')
      .send({ name: 'Fulana', email, password: 'senha-forte-123' })
      .expect(201);
    const usuario = registro.body as UsuarioResposta;
    criados.push(usuario.id);
    expect(typeof usuario.id).toBe('string');
    expect(usuario.name).toBe('Fulana');
    expect(usuario.email).toBe(email);
    // Nunca o hash da senha no corpo da resposta.
    expect(usuario).not.toHaveProperty('passwordHash');

    const cookie = registro.headers['set-cookie']?.[0];
    expect(cookie).toMatch(/kindred_session=/);
    expect(cookie).toMatch(/HttpOnly/i);

    await agent
      .get('/api/auth/me')
      .expect(200)
      .expect({ id: usuario.id, name: 'Fulana', email });

    await agent.post('/api/auth/logout').expect(204);

    await agent.get('/api/auth/me').expect(401);
  });

  it('uma rota comum também exige sessão — não é só /auth/me', async () => {
    await request(app.getHttpServer()).get('/api/people').expect(401);
  });

  it('/api/health continua público, mesmo com o guard global', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect(({ body }: { body: { status: string } }) => {
        expect(body.status).toBe('ok');
      });
  });

  it('login com e-mail inexistente e com senha errada dão o mesmo 401', async () => {
    const email = emailUnico('login');
    const agent = request.agent(app.getHttpServer());
    const registro = await agent
      .post('/api/auth/register')
      .send({ name: 'Ciclana', email, password: 'senha-forte-123' })
      .expect(201);
    criados.push((registro.body as { id: string }).id);
    await agent.post('/api/auth/logout');

    const semEmail = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'ninguem-aqui@teste.kindred.local', password: 'qualquer' })
      .expect(401);
    const senhaErrada = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'senha-errada' })
      .expect(401);

    expect((semEmail.body as ErroResposta).message).toBe(
      (senhaErrada.body as ErroResposta).message,
    );
  });

  it('não deixa cadastrar duas contas com o mesmo e-mail', async () => {
    const email = emailUnico('duplicado');
    const primeiro = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'Uma', email, password: 'senha-forte-123' })
      .expect(201);
    criados.push((primeiro.body as { id: string }).id);

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'Outra', email, password: 'outra-senha-123' })
      .expect(409);
  });

  it('duas contas nunca enxergam a pessoa uma da outra', async () => {
    const agentA = request.agent(app.getHttpServer());
    const agentB = request.agent(app.getHttpServer());

    const a = await agentA
      .post('/api/auth/register')
      .send({
        name: 'Conta A',
        email: emailUnico('a'),
        password: 'senha-forte-123',
      })
      .expect(201);
    criados.push((a.body as { id: string }).id);
    const b = await agentB
      .post('/api/auth/register')
      .send({
        name: 'Conta B',
        email: emailUnico('b'),
        password: 'senha-forte-123',
      })
      .expect(201);
    criados.push((b.body as { id: string }).id);

    const pessoaA = await agentA
      .post('/api/people')
      .send({ name: 'Pessoa da conta A', relationshipType: 'FAMILY' })
      .expect(201);
    const idPessoaA = (pessoaA.body as { id: string }).id;

    // B não vê a pessoa de A na própria lista...
    const listaB = await agentB.get('/api/people').expect(200);
    expect(
      (listaB.body as { id: string }[]).some((p) => p.id === idPessoaA),
    ).toBe(false);
    // ...nem consegue acessá-la diretamente pelo id (404, não 403 — não
    // denuncia se o id existe em outra conta).
    await agentB.get(`/api/people/${idPessoaA}`).expect(404);
  });
});
