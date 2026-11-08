import { diasRestantes, tramoDe } from "./tramos.js";

describe("tramos del panel", () => {
  it("calcula los días restantes entre dos fechas", () => {
    const hoy = new Date("2026-10-06T00:00:00Z");
    expect(diasRestantes(new Date("2026-10-06T00:00:00Z"), hoy)).toBe(0);
    expect(diasRestantes(new Date("2026-11-05T00:00:00Z"), hoy)).toBe(30);
    expect(diasRestantes(new Date("2026-10-01T00:00:00Z"), hoy)).toBe(-5);
  });

  it.each([
    [-1, "VENCIDO"],
    [0, "DIAS_30"],
    [30, "DIAS_30"],
    [31, "DIAS_60"],
    [60, "DIAS_60"],
    [61, "DIAS_90"],
    [90, "DIAS_90"],
    [91, null],
  ])("%i días -> %s", (dias, tramo) => {
    expect(tramoDe(dias)).toBe(tramo);
  });
});
