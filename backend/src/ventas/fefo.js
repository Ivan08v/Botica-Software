// FEFO (first expired, first out): reparte la cantidad pedida entre los lotes,
// agotando primero el que vence antes. Recibe los lotes YA ordenados por vencimiento.
// Es una función pura (sin base de datos) para poder probarla de forma aislada.
export function repartirFefo(lotes, cantidad) {
  const usos = [];
  let faltante = cantidad;
  for (const lote of lotes) {
    if (faltante === 0) break;
    const tomar = Math.min(lote.cantidadActual, faltante);
    if (tomar > 0) {
      usos.push({ loteId: lote.id, cantidad: tomar });
      faltante -= tomar;
    }
  }
  return { usos, faltante };
}
