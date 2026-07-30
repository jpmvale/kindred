import { describe, expect, it } from "vitest";
import { trimJanuaryFirst } from "./trim-january-first";

describe("trimJanuaryFirst", () => {
  it("1º de janeiro vira só o ano — é o que se sabia de verdade", () => {
    expect(trimJanuaryFirst("1988-01-01")).toBe("1988");
  });

  it("qualquer outro dia fica como está, inclusive 2 de janeiro", () => {
    expect(trimJanuaryFirst("1988-01-02")).toBe("1988-01-02");
    expect(trimJanuaryFirst("1988-12-31")).toBe("1988-12-31");
  });

  it("data já parcial e nula passam intactas", () => {
    expect(trimJanuaryFirst("1988")).toBe("1988");
    expect(trimJanuaryFirst("--01-01")).toBe("--01-01");
    expect(trimJanuaryFirst(null)).toBeNull();
  });
});
