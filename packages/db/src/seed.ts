/*
 * `db:seed` — popula o banco com uma família de exemplo.
 *
 *   pnpm db:seed            # exige banco vazio
 *   pnpm db:seed --force    # apaga o que existe antes (dev)
 *
 * O objetivo é ter conteúdo suficiente para as telas fazerem sentido de primeira:
 * três gerações (para a árvore e o cálculo de parentesco), datas de nascimento
 * espalhadas pelo ano (para o calendário de aniversários), pessoas falecidas,
 * locais e relacionamentos de todos os tipos. São pessoas fictícias.
 */
import { PrismaClient, type RelationshipType, type Sex } from "@prisma/client";
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
  {
    name: "Fernanda Alves",
    sex: "FEMALE",
    birthDate: "1990-11-11",
    relationshipType: "WIFE",
    location: "São Paulo, SP",
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

  // --- Fora da família ---
  {
    name: "Bruno Carvalho",
    sex: "MALE",
    birthDate: "1987-07-19",
    relationshipType: "FRIEND",
    location: "Curitiba, PR",
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
  },
  {
    name: "Lúcia Prado",
    sex: "FEMALE",
    birthDate: "1966-02-28",
    relationshipType: "OTHER",
  },
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
    console.log(`▶ --force: apagando ${existing} pessoa(s) e os locais`);
    // `people` referencia `people` (pai/mãe) e `locations`: limpa filho antes de pai.
    await prisma.person.deleteMany();
    await prisma.location.deleteMany();
  }

  const locationIds = new Map<string, string>();
  for (const name of LOCATIONS) {
    const location = await prisma.location.create({ data: { name } });
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
        fatherId: seed.father ? personIds.get(seed.father) : null,
        motherId: seed.mother ? personIds.get(seed.mother) : null,
        locationId: seed.location ? locationIds.get(seed.location) : null,
      },
    });
    personIds.set(seed.name, person.id);
  }

  console.log(
    `✓ seed aplicado: ${locationIds.size} locais e ${personIds.size} pessoas (central: Miguel Souza).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
