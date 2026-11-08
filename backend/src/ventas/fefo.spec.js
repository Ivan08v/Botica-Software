import { repartirFefo } from "./fefo.js";

describe("repartirFefo", () => {
  const lotes = [
    { id: 1, cantidadActual: 5 }, // vence primero
    { id: 2, cantidadActual: 10 },
    { id: 3, cantidadActual: 20 },
  ];

  it("toma todo del primer lote si alcanza", () => {
    expect(repartirFefo(lotes, 3)).toEqual({ usos: [{ loteId: 1, cantidad: 3 }], faltante: 0 });
  });

  it("si un lote no alcanza, sigue con el siguiente", () => {
    expect(repartirFefo(lotes, 8)).toEqual({
      usos: [
        { loteId: 1, cantidad: 5 },
        { loteId: 2, cantidad: 3 },
      ],
      faltante: 0,
    });
  });

  it("puede agotar todos los lotes exactamente", () => {
    const reparto = repartirFefo(lotes, 35);
    expect(reparto.usos.map((u) => u.cantidad)).toEqual([5, 10, 20]);
    expect(reparto.faltante).toBe(0);
  });

  it("informa cuánto falta si el stock no alcanza", () => {
    expect(repartirFefo(lotes, 40).faltante).toBe(5);
  });

  it("sin lotes, falta todo", () => {
    expect(repartirFefo([], 4)).toEqual({ usos: [], faltante: 4 });
  });

  it("salta los lotes vacíos", () => {
    const reparto = repartirFefo(
      [
        { id: 1, cantidadActual: 0 },
        { id: 2, cantidadActual: 6 },
      ],
      2,
    );
    expect(reparto.usos).toEqual([{ loteId: 2, cantidad: 2 }]);
  });
});
