// Solo el tipo Decimal: no hace falta conectarse a la base para estos cálculos
import { Prisma } from "../generated/prisma/index.js";

// IGV del Perú: 18 % (16 % de IGV + 2 % de impuesto de promoción municipal)
export const TASA_IGV = 0.18;

// Los precios de venta de la botica ya incluyen el IGV. De un importe cobrado se separa
// el valor de venta (lo que es de la botica) y el IGV (lo que se paga a SUNAT):
//   valor de venta = importe / 1.18, redondeado a céntimos
//   IGV            = importe - valor de venta   (así los dos siempre suman el importe exacto)
export function separarIgv(importe) {
  const valorVenta = importe.div(1 + TASA_IGV).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return { valorVenta, igv: importe.minus(valorVenta) };
}

// Para una venta se calcula línea por línea, como en un comprobante: la operación gravada
// es la suma de los valores de venta de cada línea, y el IGV es lo que falta para el total.
export function igvDeLineas(importes) {
  const cero = new Prisma.Decimal(0);
  const total = importes.reduce((suma, i) => suma.plus(i), cero);
  const opGravada = importes.reduce((suma, i) => suma.plus(separarIgv(i).valorVenta), cero);
  return { total, opGravada, igv: total.minus(opGravada) };
}
