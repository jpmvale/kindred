/*
 * `db:seed` — popula o banco com uma família de exemplo.
 *
 *   pnpm db:seed            # exige banco vazio
 *   pnpm db:seed --force    # apaga o que existe antes (dev)
 *
 * O objetivo é ter conteúdo suficiente para as telas fazerem sentido de primeira:
 * três gerações (para a árvore e o cálculo de parentesco), datas de nascimento
 * espalhadas pelo ano (para o calendário de aniversários), pessoas falecidas,
 * locais, relacionamentos de todos os tipos e uniões conjugais — inclusive uma
 * desfeita, para exercitar o "ex" e o corte da afinidade (RN-013). São pessoas
 * fictícias.
 */
import {
  PrismaClient,
  type RelationshipType,
  type Sex,
  type UnionStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { loadRootEnv } from "./env";

loadRootEnv();

const prisma = new PrismaClient();

type PersonSeed = {
  name: string;
  sex?: Sex;
  birthDate?: string;
  deathDate?: string;
  relationshipType?: RelationshipType;
  isCentralUser?: boolean;
  father?: string;
  mother?: string;
  location?: string;
  notes?: string;
};

/** Os nomes são resolvidos para ids; a ordem do par é normalizada na gravação (RN-011). */
type UnionSeed = {
  partners: [string, string];
  status?: UnionStatus;
  startDate?: string;
  endDate?: string;
};

const LOCATIONS = [
  "São Paulo, SP",
  "Belo Horizonte, MG",
  "Curitiba, PR",
  "Fortaleza, CE",
];

/**
 * Ordem importa: pai e mãe precisam existir antes do filho (as chaves são o
 * próprio `name`, resolvido para o id gerado no banco).
 */
const PEOPLE: PersonSeed[] = [
  // --- Avós paternos ---
  {
    name: "Antônio Souza",
    sex: "MALE",
    birthDate: "1932-01-18",
    deathDate: "2010-03-12",
    location: "Belo Horizonte, MG",
    notes:
      "Veio de Diamantina para Belo Horizonte aos dezenove anos, sozinho, e foi ferroviário a vida toda. Contava a viagem em detalhes toda ceia de Natal.",
  },
  {
    name: "Maria Souza",
    sex: "FEMALE",
    birthDate: "1935-07-04",
    deathDate: "2018-11-02",
    location: "Belo Horizonte, MG",
  },

  // --- Avós maternos ---
  {
    name: "José Lima",
    sex: "MALE",
    birthDate: "1938-09-23",
    location: "Fortaleza, CE",
  },
  {
    name: "Aparecida Lima",
    sex: "FEMALE",
    birthDate: "1940-12-08",
    location: "Fortaleza, CE",
  },

  // --- Pais e tio ---
  {
    name: "Carlos Souza",
    sex: "MALE",
    birthDate: "1960-04-27",
    father: "Antônio Souza",
    mother: "Maria Souza",
    location: "São Paulo, SP",
  },
  {
    name: "Regina Lima Souza",
    sex: "FEMALE",
    birthDate: "1962-06-15",
    father: "José Lima",
    mother: "Aparecida Lima",
    location: "São Paulo, SP",
  },
  {
    name: "Paulo Souza",
    sex: "MALE",
    birthDate: "1958-02-09",
    father: "Antônio Souza",
    mother: "Maria Souza",
    location: "Belo Horizonte, MG",
  },

  // --- A pessoa central e sua geração ---
  {
    name: "Miguel Souza",
    sex: "MALE",
    birthDate: "1988-05-30",
    isCentralUser: true,
    father: "Carlos Souza",
    mother: "Regina Lima Souza",
    location: "São Paulo, SP",
  },
  {
    name: "Beatriz Souza",
    sex: "FEMALE",
    birthDate: "1991-08-21",
    father: "Carlos Souza",
    mother: "Regina Lima Souza",
    location: "Curitiba, PR",
  },
  {
    name: "Rafael Souza",
    sex: "MALE",
    birthDate: "1995-10-03",
    father: "Carlos Souza",
    mother: "Regina Lima Souza",
    location: "São Paulo, SP",
  },
  {
    name: "Diego Souza",
    sex: "MALE",
    birthDate: "1985-03-17",
    father: "Paulo Souza",
    location: "Belo Horizonte, MG",
  },

  // --- Família da esposa (sogros e cunhado, para exercitar a afinidade) ---
  {
    name: "Heitor Alves",
    sex: "MALE",
    birthDate: "1959-08-14",
    location: "Curitiba, PR",
  },
  {
    name: "Sônia Alves",
    sex: "FEMALE",
    birthDate: "1963-03-02",
    location: "Curitiba, PR",
  },
  {
    name: "Fernanda Alves",
    sex: "FEMALE",
    birthDate: "1990-11-11",
    father: "Heitor Alves",
    mother: "Sônia Alves",
    location: "São Paulo, SP",
  },
  {
    name: "Marcos Alves",
    sex: "MALE",
    birthDate: "1993-06-26",
    father: "Heitor Alves",
    mother: "Sônia Alves",
    location: "Curitiba, PR",
  },

  // --- Filhos ---
  {
    name: "Laura Souza",
    sex: "FEMALE",
    birthDate: "2018-01-07",
    father: "Miguel Souza",
    mother: "Fernanda Alves",
    location: "São Paulo, SP",
  },
  {
    name: "Theo Souza",
    sex: "MALE",
    birthDate: "2021-09-14",
    father: "Miguel Souza",
    mother: "Fernanda Alves",
    location: "São Paulo, SP",
  },

  // --- Cônjuges dos parentes e a união desfeita ---
  {
    name: "Rodrigo Pinto",
    sex: "MALE",
    birthDate: "1990-01-23",
    location: "Curitiba, PR",
  },
  {
    name: "Tereza Nunes",
    sex: "FEMALE",
    birthDate: "1987-05-09",
    relationshipType: "OTHER",
    location: "São Paulo, SP",
  },

  // --- Fora da família ---
  {
    name: "Bruno Carvalho",
    sex: "MALE",
    birthDate: "1987-07-19",
    relationshipType: "FRIEND",
    location: "Curitiba, PR",
    notes:
      "Amizade do intercâmbio em 2009 — dividimos apartamento em Coimbra por um ano. É quem apresentou a Camila ao grupo.",
  },
  {
    name: "Camila Rocha",
    sex: "FEMALE",
    birthDate: "1989-12-02",
    relationshipType: "FRIEND",
    location: "São Paulo, SP",
  },
  {
    name: "Sérgio Menezes",
    sex: "MALE",
    birthDate: "1975-04-05",
    relationshipType: "ACQUAINTANCE",
    location: "Fortaleza, CE",
    notes: "Contato de trabalho em Fortaleza; nos vemos uma vez por ano na feira.",
  },
  {
    name: "Lúcia Prado",
    sex: "FEMALE",
    birthDate: "1966-02-28",
    relationshipType: "OTHER",
  },
];

const UNIONS: UnionSeed[] = [
  { partners: ["Antônio Souza", "Maria Souza"], startDate: "1957-11-09" },
  { partners: ["José Lima", "Aparecida Lima"], startDate: "1961-02-18" },
  { partners: ["Carlos Souza", "Regina Lima Souza"], startDate: "1986-10-25" },
  { partners: ["Heitor Alves", "Sônia Alves"], startDate: "1988-04-16" },
  // A pessoa central: uma união vigente e uma desfeita — é o par que distingue
  // "Esposa" de "Ex-esposa" e corta a afinidade pelo lado da Tereza.
  { partners: ["Miguel Souza", "Fernanda Alves"], startDate: "2015-12-05" },
  {
    partners: ["Miguel Souza", "Tereza Nunes"],
    status: "ENDED",
    startDate: "2010-06-19",
    endDate: "2014-03-30",
  },
  // Marido da irmã: cunhado pelo outro caminho da afinidade.
  { partners: ["Beatriz Souza", "Rodrigo Pinto"], startDate: "2019-09-07" },
];

async function main() {
  const force = process.argv.includes("--force");
  const existing = await prisma.person.count();

  if (existing > 0 && !force) {
    console.error(
      `✗ o banco já tem ${existing} pessoa(s). O seed é bootstrap (banco vazio) — use --force para apagar antes.`,
    );
    process.exit(1);
  }

  if (existing > 0 && force) {
    console.log(`▶ --force: apagando ${existing} pessoa(s), uniões e locais`);
    // `people` referencia `people` (pai/mãe) e `locations`: limpa filho antes de pai.
    // As uniões cairiam junto por cascata, mas apagá-las antes deixa a ordem explícita.
    await prisma.union.deleteMany();
    await prisma.person.deleteMany();
    await prisma.location.deleteMany();
  }

  // O seed é bootstrap de um banco vazio: a conta é criada aqui também, não
  // recebida de fora — não há login ainda no fluxo de `pnpm db:seed` (BL-10).
  const owner = await prisma.user.upsert({
    where: { email: "seed@kindred.local" },
    create: {
      name: "Seed",
      email: "seed@kindred.local",
      passwordHash: await bcrypt.hash("seed-account", 12),
    },
    update: {},
  });

  const locationIds = new Map<string, string>();
  for (const name of LOCATIONS) {
    const location = await prisma.location.create({
      data: { name, userId: owner.id },
    });
    locationIds.set(name, location.id);
  }

  const personIds = new Map<string, string>();
  for (const seed of PEOPLE) {
    const person = await prisma.person.create({
      data: {
        name: seed.name,
        sex: seed.sex ?? null,
        birthDate: seed.birthDate ? new Date(seed.birthDate) : null,
        deathDate: seed.deathDate ? new Date(seed.deathDate) : null,
        deceased: Boolean(seed.deathDate),
        relationshipType: seed.relationshipType ?? "FAMILY",
        isCentralUser: seed.isCentralUser ?? false,
        notes: seed.notes ?? null,
        userId: owner.id,
        fatherId: seed.father ? (personIds.get(seed.father) ?? null) : null,
        motherId: seed.mother ? (personIds.get(seed.mother) ?? null) : null,
        locationId: seed.location ? (locationIds.get(seed.location) ?? null) : null,
      },
    });
    personIds.set(seed.name, person.id);
  }

  for (const union of UNIONS) {
    const [first, second] = union.partners.map((name) => {
      const id = personIds.get(name);
      if (!id) throw new Error(`união com pessoa desconhecida: "${name}"`);
      return id;
    });
    // Ordem normalizada (RN-011): o menor id em partnerAId, para que (A,B) e
    // (B,A) sejam sempre a mesma união.
    const [partnerAId, partnerBId] =
      first < second ? [first, second] : [second, first];

    await prisma.union.create({
      data: {
        partnerAId,
        partnerBId,
        status: union.status ?? "CURRENT",
        startDate: union.startDate ? new Date(union.startDate) : null,
        endDate: union.endDate ? new Date(union.endDate) : null,
      },
    });
  }

  console.log(
    `✓ seed aplicado: ${locationIds.size} locais, ${personIds.size} pessoas e ${UNIONS.length} uniões (central: Miguel Souza).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
