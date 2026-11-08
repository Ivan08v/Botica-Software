import { Prisma } from "../generated/prisma/index.js";
import { igvDeLineas, separarIgv } from "./igv.js";

const d = (n) => new Prisma.Decimal(n);

describe("separarIgv", () => {
  it("separa el valor de venta y el IGV de un precio que ya lo incluye", () => {
    const { valorVenta, igv } = separarIgv(d("118.00"));
    expect(valorVenta.toFixed(2)).toBe("100.00");
    expect(igv.toFixed(2)).toBe("18.00");
  });

  it("redondea a céntimos y el IGV completa el importe exacto", () => {
    // 10 / 1.18 = 8.4745... -> 8.47; el IGV es 1.53 y entre los dos suman 10.00
    const { valorVenta, igv } = separarIgv(d("10.00"));
    expect(valorVenta.toFixed(2)).toBe("8.47");
    expect(igv.toFixed(2)).toBe("1.53");
    expect(valorVenta.plus(igv).toFixed(2)).toBe("10.00");
  });

  it("un importe de cero no tiene IGV", () => {
    expect(separarIgv(d(0)).igv.toFixed(2)).toBe("0.00");
  });
});

describe("igvDeLineas", () => {
  it("suma el valor de venta de cada línea y el IGV es lo que falta para el total", () => {
    const { total, opGravada, igv } = igvDeLineas([d("9.00"), d("0.30")]);
    expect(total.toFixed(2)).toBe("9.30");
    expect(opGravada.toFixed(2)).toBe("7.88"); // 7.63 + 0.25
    expect(igv.toFixed(2)).toBe("1.42");
  });

  it("redondea cada línea, no el total de una sola vez", () => {
    // Tres líneas de 0.30: cada una vale 0.25 sin IGV (0.75 en total).
    // Dividir el total de una vez daría 0.90 / 1.18 = 0.76: un céntimo de diferencia.
    const { opGravada, igv } = igvDeLineas([d("0.30"), d("0.30"), d("0.30")]);
    expect(opGravada.toFixed(2)).toBe("0.75");
    expect(igv.toFixed(2)).toBe("0.15");
  });

  it("la operación gravada más el IGV siempre es el total", () => {
    const importes = ["0.10", "0.30", "4.50", "13.33", "99.99", "256.50"].map(d);
    const { total, opGravada, igv } = igvDeLineas(importes);
    expect(opGravada.plus(igv).equals(total)).toBe(true);
  });
});
