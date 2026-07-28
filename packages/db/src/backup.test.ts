import { describe, expect, it } from "vitest";
import { assertCoverage } from "./backup";

/**
 * A rede de proteção do backup é a `assertCoverage`: ela cobra do
 * `schema.prisma` que todo campo escalar esteja no arquivo. Um backup que sai
 * incompleto só se revela na restauração, quando o dado original já não existe —
 * por isso a checagem falha na hora de gravar, e por isso ela tem teste.
 */
describe("assertCoverage", () => {
  const pessoaCompleta = {
    id: "p1",
    name: "Fulana",
    sex: "FEMALE",
    birthDate: "1990-01-01T00:00:00.000Z",
    deathDate: null,
    deceased: false,
    relationshipType: "FAMILY",
    isCentralUser: false,
    notes: null,
    fatherId: null,
    motherId: null,
    locationId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  const localCompleto = {
    id: "l1",
    name: "Curitiba, PR",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  const uniaoCompleta = {
    id: "u1",
    partnerAId: "p1",
    partnerBId: "p2",
    status: "CURRENT",
    startDate: null,
    endDate: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  const fotoCompleta = {
    personId: "p1",
    bytes: "AAAA",
    mimeType: "image/jpeg",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  const completo = () => ({
    Location: [{ ...localCompleto }],
    Person: [{ ...pessoaCompleta }],
    Union: [{ ...uniaoCompleta }],
    PersonPhoto: [{ ...fotoCompleta }],
  });

  it("aceita um backup que cobre todos os campos do schema", () => {
    expect(() => assertCoverage(completo())).not.toThrow();
  });

  it("aceita banco vazio — não há campo que conferir", () => {
    expect(() =>
      assertCoverage({ Location: [], Person: [], Union: [], PersonPhoto: [] }),
    ).not.toThrow();
  });

  it("recusa quando um campo do schema ficou de fora, e diz qual", () => {
    const dados = completo();
    delete (dados.Person[0] as Record<string, unknown>).notes;

    expect(() => assertCoverage(dados)).toThrow(/Person\.notes/);
  });

  it("cobra os campos de todos os modelos, não só o de pessoas", () => {
    const dados = completo();
    delete (dados.PersonPhoto[0] as Record<string, unknown>).mimeType;
    delete (dados.Union[0] as Record<string, unknown>).status;

    expect(() => assertCoverage(dados)).toThrow(/PersonPhoto\.mimeType/);
    expect(() => assertCoverage(dados)).toThrow(/Union\.status/);
  });

  it("enxerga campo novo no schema mesmo que ninguém lembre de exportá-lo", () => {
    // Não é um campo escrito à mão nesta lista: a checagem lê o schema. Se o
    // `notes` sumisse do modelo, este teste morreria junto — de propósito.
    const dados = completo();
    dados.Person = [{ id: "p1", name: "Só o básico" } as never];

    expect(() => assertCoverage(dados)).toThrow(/deceased|relationshipType/);
  });
});
