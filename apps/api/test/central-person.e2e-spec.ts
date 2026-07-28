import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/**
 * Trocar a pessoa central (RN-018) mexe em duas linhas ao mesmo tempo, e a regra
 * "existe no máximo uma" não tem constraint no banco — quem garante é o serviço.
 * Isso não dá para verificar sem banco, então mora aqui, e não no `pnpm test`.
 *
 * O teste cria as próprias pessoas e devolve tudo como estava: quem era central
 * volta a ser no `afterAll`, mesmo se algum caso falhar no meio.
 */
describe('Pessoa central (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;

  let centralOriginal: string | null = null;
  const criados: string[] = [];

  type PessoaResposta = {
    id: string;
    isCentralUser: boolean;
    kinshipDegree: string | null;
  };

  const criarPessoa = async (name: string) => {
    const resposta = await request(http)
      .post('/api/people')
      .send({ name, relationshipType: 'FAMILY' })
      .expect(201);
    const { id } = resposta.body as PessoaResposta;
    criados.push(id);
    return id;
  };

  const central = async () => {
    const resposta = await request(http).get('/api/people/central').expect(200);
    const body = resposta.body as PessoaResposta | null;
    return body?.id ?? null;
  };

  const quantosCentrais = async () => {
    const resposta = await request(http).get('/api/people').expect(200);
    const pessoas = resposta.body as PessoaResposta[];
    return pessoas.filter((p) => p.isCentralUser).length;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    http = app.getHttpServer();

    centralOriginal = await central();
  });

  afterAll(async () => {
    if (centralOriginal) {
      await request(http)
        .put('/api/people/central')
        .send({ personId: centralOriginal });
    }
    for (const id of criados) {
      await request(http).delete(`/api/people/${id}`);
    }
    await app.close();
  });

  it('transfere o posto em vez de criar um segundo central', async () => {
    const alvo = await criarPessoa('E2E Central Um');

    await request(http)
      .put('/api/people/central')
      .send({ personId: alvo })
      .expect(200);

    expect(await central()).toBe(alvo);
    expect(await quantosCentrais()).toBe(1);
  });

  it('o antigo central vira pessoa comum e ganha grau de parentesco', async () => {
    const primeiro = await criarPessoa('E2E Central Dois');
    await request(http).put('/api/people/central').send({ personId: primeiro });

    const segundo = await criarPessoa('E2E Central Três');
    await request(http).put('/api/people/central').send({ personId: segundo });

    const resposta = await request(http)
      .get(`/api/people/${primeiro}`)
      .expect(200);
    const body = resposta.body as PessoaResposta;
    expect(body.isCentralUser).toBe(false);
    // Deixou de ser "Você"; sem laço de sangue com o novo central, é o fallback
    // de quem é família (RN-015).
    expect(body.kinshipDegree).toBe('Parente distante');
  });

  it('trocar para quem já é central não muda nada', async () => {
    const alvo = await criarPessoa('E2E Central Quatro');
    await request(http).put('/api/people/central').send({ personId: alvo });

    await request(http)
      .put('/api/people/central')
      .send({ personId: alvo })
      .expect(200);

    expect(await central()).toBe(alvo);
    expect(await quantosCentrais()).toBe(1);
  });

  it('recusa pessoa que não existe e id que não é uuid', async () => {
    await request(http)
      .put('/api/people/central')
      .send({ personId: '00000000-0000-0000-0000-000000000000' })
      .expect(404);

    await request(http)
      .put('/api/people/central')
      .send({ personId: 'nao-sou-uuid' })
      .expect(400);
  });

  it('o POST continua barrando uma segunda pessoa central (RN-001)', async () => {
    // Trocar é transferência; criar outra continua proibido.
    await request(http)
      .post('/api/people')
      .send({
        name: 'E2E Central Cinco',
        relationshipType: 'FAMILY',
        isCentralUser: true,
      })
      .expect(400);
  });
});
