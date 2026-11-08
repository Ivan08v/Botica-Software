import { fechaEnLima, hoyEnLima, inicioDelDiaEnLima } from "./fechas.js";

describe("hoyEnLima", () => {
  it("usa el calendario de Perú aunque en UTC ya sea el día siguiente", () => {
    // 02:00 UTC del 7 de octubre = 21:00 del 6 de octubre en Lima (UTC-5)
    expect(hoyEnLima(new Date("2026-10-07T02:00:00Z")).toISOString()).toBe("2026-10-06T00:00:00.000Z");
  });

  it("coincide con UTC durante el día", () => {
    expect(hoyEnLima(new Date("2026-10-06T15:00:00Z")).toISOString()).toBe("2026-10-06T00:00:00.000Z");
  });
});

describe("días del calendario de Perú", () => {
  it("el día en Lima empieza a las 05:00 UTC", () => {
    expect(inicioDelDiaEnLima("2026-10-06").toISOString()).toBe("2026-10-06T05:00:00.000Z");
  });

  it("una venta a las 23:30 de Lima pertenece a ese día aunque en UTC ya sea el siguiente", () => {
    expect(fechaEnLima(new Date("2026-10-07T04:30:00Z"))).toBe("2026-10-06");
    expect(fechaEnLima(new Date("2026-10-07T05:00:00Z"))).toBe("2026-10-07");
  });
});
