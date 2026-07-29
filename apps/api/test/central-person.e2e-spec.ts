import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Trocar a pessoa central (RN-018) mexe em duas linhas ao mesmo tempo, e a regra
 * "existe no máximo uma" não tem constraint no banco — quem garante é o serviço.
 * Isso não dá para verificar sem banco, então mora aqui, e não no `pnpm test`.
 *
 * Desde o BL-10 toda rota exige sessão: o teste registra uma conta jogável só
 * para si (e-mail único por execução) e usa um `agent` do supertest, que
 * guarda o cookie de sessão entre chamadas como um navegador guardaria. No
 * `afterAll`, apagar o usuário já leva tudo junto pela cascata do banco — não
 * há "central original" para devolver, porque a conta nasceu vazia.
 */
describe('Pessoa central (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let agent: ReturnType<typeof request.agent>;
  let userId: string;

  type PessoaResposta = {
    id: string;
    isCentralUser: boolean;
    kinshipDegree: string | null;
  };

  const criarPessoa = async (name: string) => {
    const resposta = await agent
      .post('/api/people')
      .send({ name, relationshipType: 'FAMILY' })
      .expect(201);
    return (resposta.body as PessoaResposta).id;
  };

  const central = async () => {
    const resposta = await agent.get('/api/people/central').expect(200);
    const body = resposta.body as PessoaResposta | null;
    return body?.id ?? null;
  };

  const quantosCentrais = async () => {
    const resposta = await agent.get('/api/people').expect(200);
    const pessoas = resposta.body as PessoaResposta[];
    return pessoas.filter((p) => p.isCentralUser).length;
  };

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

    agent = request.agent(app.getHttpServer());
    const email = `e2e-central-${Date.now()}@teste.kindred.local`;
    const registro = await agent
      .post('/api/auth/register')
      .send({ name: 'E2E Central', email, password: 'senha-de-teste-123' })
      .expect(201);
    userId = (registro.body as { id: string }).id;
  });

  afterAll(async () => {
    // Cascata do banco (User → Person/Location/Session) limpa tudo que o
    // teste criou — não sobra pessoa nem sessão desta conta jogável.
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await app.close();
  });

  it('transfere o posto em vez de criar um segundo central', async () => {
    const alvo = await criarPessoa('E2E Central Um');

    await agent.put('/api/people/central').send({ personId: alvo }).expect(200);

    expect(await central()).toBe(alvo);
    expect(await quantosCentrais()).toBe(1);
  });

  it('o antigo central vira pessoa comum e ganha grau de parentesco', async () => {
    const primeiro = await criarPessoa('E2E Central Dois');
    await agent.put('/api/people/central').send({ personId: primeiro });

    const segundo = await criarPessoa('E2E Central Três');
    await agent.put('/api/people/central').send({ personId: segundo });

    const resposta = await agent.get(`/api/people/${primeiro}`).expect(200);
    const body = resposta.body as PessoaResposta;
    expect(body.isCentralUser).toBe(false);
    // Deixou de ser "Você"; sem laço de sangue com o novo central, é o fallback
    // de quem é família (RN-015).
    expect(body.kinshipDegree).toBe('Parente distante');
  });

  it('trocar para quem já é central não muda nada', async () => {
    const alvo = await criarPessoa('E2E Central Quatro');
    await agent.put('/api/people/central').send({ personId: alvo });

    await agent.put('/api/people/central').send({ personId: alvo }).expect(200);

    expect(await central()).toBe(alvo);
    expect(await quantosCentrais()).toBe(1);
  });

  it('recusa pessoa que não existe e id que não é uuid', async () => {
    await agent
      .put('/api/people/central')
      .send({ personId: '00000000-0000-0000-0000-000000000000' })
      .expect(404);

    await agent
      .put('/api/people/central')
      .send({ personId: 'nao-sou-uuid' })
      .expect(400);
  });

  it('o POST continua barrando uma segunda pessoa central (RN-001)', async () => {
    // Trocar é transferência; criar outra continua proibido.
    await agent
      .post('/api/people')
      .send({
        name: 'E2E Central Cinco',
        relationshipType: 'FAMILY',
        isCentralUser: true,
      })
      .expect(400);
  });

  it('sem sessão, a mesma rota responde 401, não 200', async () => {
    await request(app.getHttpServer()).get('/api/people/central').expect(401);
  });
});
