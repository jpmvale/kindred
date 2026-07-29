import { describe, expect, it, vi } from "vitest";
import { resetPassword } from "./reset-password";

function prismaFake() {
  const users = new Map<string, { id: string; email: string; passwordHash: string }>([
    ["u1", { id: "u1", email: "dono@kindred.local", passwordHash: "hash-antigo" }],
  ]);
  const sessoes = new Map<string, { id: string; userId: string }>([
    ["s1", { id: "s1", userId: "u1" }],
    ["s2", { id: "s2", userId: "u1" }],
    ["s3", { id: "s3", userId: "u2" }],
  ]);

  const prisma = {
    user: {
      findUnique: vi.fn(({ where }: { where: { email: string } }) =>
        Promise.resolve(
          [...users.values()].find((u) => u.email === where.email) ?? null,
        ),
      ),
      update: vi.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: { passwordHash: string };
        }) => {
          const user = users.get(where.id)!;
          users.set(where.id, { ...user, ...data });
          return Promise.resolve(users.get(where.id));
        },
      ),
    },
    session: {
      deleteMany: vi.fn(({ where }: { where: { userId: string } }) => {
        let count = 0;
        for (const [id, s] of sessoes) {
          if (s.userId === where.userId) {
            sessoes.delete(id);
            count++;
          }
        }
        return Promise.resolve({ count });
      }),
    },
  };

  return { prisma, users, sessoes };
}

describe("resetPassword", () => {
  it("recusa e-mail que não tem conta", async () => {
    const { prisma } = prismaFake();
    await expect(
      resetPassword(prisma, "ninguem@x.com", "hash-novo"),
    ).rejects.toThrow(/Nenhuma conta/);
  });

  it("troca o hash e derruba só as sessões da conta redefinida", async () => {
    const { prisma, users, sessoes } = prismaFake();

    const resultado = await resetPassword(
      prisma,
      "dono@kindred.local",
      "hash-novo",
    );

    expect(resultado).toEqual({ userId: "u1", sessoesEncerradas: 2 });
    expect(users.get("u1")?.passwordHash).toBe("hash-novo");
    expect(sessoes.has("s3")).toBe(true);
  });
});
