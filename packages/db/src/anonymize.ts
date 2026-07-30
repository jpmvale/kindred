/*
 * `db:anonymize` — copia a **forma** de uma base real, sem levar ninguém junto.
 *
 *   pnpm db:anonymize                    # lê o banco atual
 *   pnpm db:anonymize <backup.json>      # lê um arquivo de backup
 *
 * Grava `packages/db/fixtures/anonimizado.json`, no mesmo formato do `db:backup`
 * — então carregar é `pnpm db:restore <arquivo> --force`, sem um segundo caminho
 * de seed para manter.
 *
 * Serve para o repositório (que é público) ter uma base do tamanho de uma base de
 * verdade: a árvore com a profundidade real, o calendário com aniversários
 * espalhados, o BL-09 com volume para medir. O que é da pessoa fica de fora:
 *
 *   nome        → fictício, sorteado de forma determinística pelo índice
 *   notas       → descartadas (texto livre é o que mais identifica)
 *   fotos       → descartadas (rosto é dado pessoal, e não há como anonimizar)
 *   local       → cidade fictícia (de onde a família é diz muito sobre ela)
 *   datas       → deslocadas em até ±10 dias, preservando o ano e a distribuição
 *   ids         → sequenciais, não os UUIDs originais
 *   carimbos    → uma data fixa, para o arquivo não registrar quando se mexeu
 *
 * O que **é preservado**, porque é o que dá valor ao fixture: o grafo de pai/mãe,
 * as uniões e sua situação, sexo, tipo de relacionamento, quem é a pessoa central
 * e quem faleceu.
 *
 * Rodar de novo sobre a mesma base dá o mesmo arquivo: o diff só mostra o que
 * mudou de verdade.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { BACKUP_FORMAT, collect } from "./backup";
import { loadRootEnv } from "./env";

loadRootEnv();

const NOMES_M = [
  "Antônio", "Bruno", "Caio", "Danilo", "Eduardo", "Fábio", "Gustavo", "Henrique",
  "Ígor", "Joaquim", "Kléber", "Leandro", "Murilo", "Nelson", "Otávio", "Paulo",
  "Quirino", "Rafael", "Sérgio", "Tadeu", "Ubirajara", "Vinícius", "Wagner", "Xavier",
];

const NOMES_F = [
  "Alice", "Beatriz", "Cecília", "Débora", "Elisa", "Fernanda", "Gabriela", "Helena",
  "Irene", "Júlia", "Karina", "Lívia", "Marina", "Natália", "Olívia", "Priscila",
  "Quitéria", "Renata", "Sônia", "Teresa", "Úrsula", "Valentina", "Wanda", "Yara",
];

const SOBRENOMES = [
  "Almeida", "Barbosa", "Carvalho", "Duarte", "Esteves", "Farias", "Gonçalves",
  "Henriques", "Ibrahim", "Jardim", "Klein", "Lacerda", "Macedo", "Nogueira",
  "Oliveira", "Pacheco", "Queiroz", "Ribeiro", "Salgado", "Teixeira",
];

const CIDADES = [
  "Bela Vista, PR", "Campo Novo, SP", "Porto Seco, RS", "Serra Alta, MG",
  "Vila Verde, SC", "Rio Claro, GO", "Monte Azul, BA", "Água Limpa, MT",
];

/** Carimbo único em todo o arquivo: nada aqui registra quando se mexeu na base. */
const CARIMBO = "2026-01-01T00:00:00.000Z";

/**
 * Deslocamento em dias, estável por pessoa — não sorteia a cada execução.
 *
 * O deslocamento **nunca é zero**: um intervalo de −10 a +10 deixaria uma data em
 * cada 21 passar intacta, e data de nascimento exata é dado pessoal mesmo ao lado
 * de um nome falso. O resultado cai em [−10,−1] ∪ [+1,+10].
 */
function jitter(iso: string | null, semente: number): string | null {
  if (!iso) return null;
  const passo = (semente % 20) - 10;
  const dias = passo >= 0 ? passo + 1 : passo;

  // Data parcial (RN-027) só é deslocada quando está completa: mexer em `1988`
  // ou `1988-05` mudaria o ano ou o mês, que é justamente o que a pessoa sabe.
  const completa = /^\d{4}-\d{2}-\d{2}/.exec(iso);
  if (!completa) return iso;

  const d = new Date(`${completa[0]}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function nome(indice: number, sexo: string | null): string {
  const pool = sexo === "MALE" ? NOMES_M : sexo === "FEMALE" ? NOMES_F : [...NOMES_M, ...NOMES_F];
  const primeiro = pool[indice % pool.length];
  const sobrenome = SOBRENOMES[(indice * 7) % SOBRENOMES.length];
  return `${primeiro} ${sobrenome}`;
}

type Linha = Record<string, unknown>;

/**
 * O dono sintético de toda a árvore anônima. `Person.userId`/`Location.userId`
 * são obrigatórios (BL-10) — e o destino deste fixture é um banco **vazio**,
 * sem conta nenhuma ainda, então a conta precisa vir dentro do próprio arquivo
 * (`dados.User`, restaurado antes do resto). Senha fixa e conhecida: é um
 * fixture de teste, não um dado de ninguém — dá para logar como
 * `fixture@kindred.local` / `fixture-account` depois de restaurar.
 */
const DONO_ID = "user-fixture";
const DONO_SENHA = "fixture-account";

export function anonymize(dados: {
  Location: Linha[];
  Person: Linha[];
  Union: Linha[];
  PersonPhoto: Linha[];
}) {
  const dono = {
    id: DONO_ID,
    name: "Conta de teste",
    email: "fixture@kindred.local",
    passwordHash: bcrypt.hashSync(DONO_SENHA, 12),
    createdAt: CARIMBO,
    updatedAt: CARIMBO,
  };

  const idLocal = new Map<string, string>();
  const locations = dados.Location.map((local, i) => {
    const id = `location-${String(i + 1).padStart(2, "0")}`;
    idLocal.set(local.id as string, id);
    return {
      id,
      name: CIDADES[i % CIDADES.length],
      userId: DONO_ID,
      createdAt: CARIMBO,
      updatedAt: CARIMBO,
    };
  });

  const idPessoa = new Map<string, string>();
  dados.Person.forEach((pessoa, i) => {
    idPessoa.set(pessoa.id as string, `person-${String(i + 1).padStart(3, "0")}`);
  });

  const people = dados.Person.map((pessoa, i) => ({
    id: idPessoa.get(pessoa.id as string)!,
    name: nome(i, pessoa.sex as string | null),
    sex: pessoa.sex ?? null,
    birthDate: jitter(pessoa.birthDate as string | null, i),
    deathDate: jitter(pessoa.deathDate as string | null, i + 3),
    deceased: pessoa.deceased ?? false,
    relationshipType: pessoa.relationshipType,
    isCentralUser: pessoa.isCentralUser ?? false,
    userId: DONO_ID,
    notes: null,
    // A filiação é o que dá sentido ao fixture: some com o nome, fica o grafo.
    fatherId: pessoa.fatherId ? (idPessoa.get(pessoa.fatherId as string) ?? null) : null,
    motherId: pessoa.motherId ? (idPessoa.get(pessoa.motherId as string) ?? null) : null,
    locationId: pessoa.locationId ? (idLocal.get(pessoa.locationId as string) ?? null) : null,
    createdAt: CARIMBO,
    updatedAt: CARIMBO,
  }));

  const unions = dados.Union.map((uniao, i) => ({
    id: `union-${String(i + 1).padStart(2, "0")}`,
    partnerAId: idPessoa.get(uniao.partnerAId as string)!,
    partnerBId: idPessoa.get(uniao.partnerBId as string)!,
    status: uniao.status,
    startDate: jitter(uniao.startDate as string | null, i),
    endDate: jitter(uniao.endDate as string | null, i + 5),
    createdAt: CARIMBO,
    updatedAt: CARIMBO,
  }));

  return {
    formato: BACKUP_FORMAT,
    geradoEm: CARIMBO,
    contagem: {
      Location: locations.length,
      Person: people.length,
      Union: unions.length,
      // Foto de rosto não tem versão anônima: sai fora.
      PersonPhoto: 0,
    },
    dados: {
      Location: locations,
      Person: people,
      Union: unions,
      PersonPhoto: [],
      User: [dono],
    },
  };
}

export function fixturePath(): string {
  return resolve(__dirname, "..", "fixtures", "anonimizado.json");
}

async function main() {
  const entrada = process.argv[2];
  let dados;

  if (entrada && !entrada.startsWith("--")) {
    // Caminho relativo é relativo a quem chamou, não a `packages/db`.
    const caminho = isAbsolute(entrada)
      ? entrada
      : resolve(process.env.INIT_CWD ?? process.cwd(), entrada);
    dados = JSON.parse(readFileSync(caminho, "utf-8")).dados;
  } else {
    const prisma = new PrismaClient();
    try {
      dados = await collect(prisma, { kind: "all" });
    } finally {
      await prisma.$disconnect();
    }
  }

  const anonimo = anonymize(dados as never);
  const destino = fixturePath();
  mkdirSync(join(destino, ".."), { recursive: true });
  writeFileSync(destino, JSON.stringify(anonimo, null, 2), "utf-8");

  console.log(`✓ fixture anônimo em ${destino}`);
  console.log(
    `  ${anonimo.contagem.Person} pessoas, ${anonimo.contagem.Union} uniões, ${anonimo.contagem.Location} locais`,
  );
  console.log(`  nomes, notas, fotos e cidades trocados; datas deslocadas em até ±10 dias`);
  console.log(`  carregar: pnpm db:restore "${destino}" --force`);
}

if (require.main === module) {
  main().catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
}
