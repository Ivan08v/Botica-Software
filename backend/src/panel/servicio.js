import { hoyEnLima } from "../common/fechas.js";
import { Prisma, prisma } from "../prisma.js";
import { listarProductos } from "../productos/servicio.js";
import { DIAS_PANEL, diasRestantes, tramoDe } from "./tramos.js";

// Lo que el dueño necesita ver al abrir el sistema, en una sola consulta
export async function obtenerPanel(negocioId) {
  const hoy = hoyEnLima();
  const limite = new Date(hoy);
  limite.setUTCDate(limite.getUTCDate() + DIAS_PANEL);

  // Lotes con stock que ya vencieron o vencen dentro de 90 días.
  // Un lote vacío no representa riesgo, por eso no se incluye.
  const lotes = await prisma.lote.findMany({
    where: {
      negocioId,
      cantidadActual: { gt: 0 },
      fechaVencimiento: { lte: limite },
      producto: { activo: true },
    },
    include: { producto: { select: { nombre: true, presentacion: true } } },
    orderBy: [{ fechaVencimiento: "asc" }, { id: "asc" }],
  });

  // Por tramo: cuántos lotes, cuántas unidades y cuánto valen al costo
  const cero = () => ({ lotes: 0, unidades: 0, valor: new Prisma.Decimal(0) });
  const tramos = { VENCIDO: cero(), DIAS_30: cero(), DIAS_60: cero(), DIAS_90: cero() };

  const detalle = lotes.map((lote) => {
    const dias = diasRestantes(lote.fechaVencimiento, hoy);
    const tramo = tramoDe(dias);
    // Se valoriza al costo: es lo que el negocio pagó y perdería si el lote vence
    const valor = lote.costoUnitario.mul(lote.cantidadActual);
    tramos[tramo].lotes += 1;
    tramos[tramo].unidades += lote.cantidadActual;
    tramos[tramo].valor = tramos[tramo].valor.plus(valor);
    return {
      loteId: lote.id,
      productoId: lote.productoId,
      producto: lote.producto.nombre,
      presentacion: lote.producto.presentacion,
      numeroLote: lote.numeroLote,
      fechaVencimiento: lote.fechaVencimiento,
      diasRestantes: dias,
      tramo,
      cantidadActual: lote.cantidadActual,
      valor: valor.toFixed(2),
    };
  });

  const stockBajo = (await listarProductos(negocioId)).filter((p) => p.stockBajo);

  // "Dinero en riesgo": lo que todavía se puede salvar vendiendo (vence en los próximos 90 días).
  // Lo ya vencido se informa aparte como pérdida.
  const dineroEnRiesgo = tramos.DIAS_30.valor.plus(tramos.DIAS_60.valor).plus(tramos.DIAS_90.valor);
  const formato = (a) => ({ ...a, valor: a.valor.toFixed(2) });

  return {
    fecha: hoy,
    dineroEnRiesgo: dineroEnRiesgo.toFixed(2),
    dineroVencido: tramos.VENCIDO.valor.toFixed(2),
    vencimientos: {
      vencidos: formato(tramos.VENCIDO),
      en30Dias: formato(tramos.DIAS_30),
      en60Dias: formato(tramos.DIAS_60),
      en90Dias: formato(tramos.DIAS_90),
    },
    lotesPorVencer: detalle,
    productosStockBajo: stockBajo.map((p) => ({
      productoId: p.id,
      producto: p.nombre,
      presentacion: p.presentacion,
      stock: p.stock,
      stockMinimo: p.stockMinimo,
      faltante: p.stockMinimo - p.stock,
    })),
  };
}

// Aviso liviano para el menú: cuántas alertas hay, sin montos.
// Reposición = productos activos por debajo de su stock mínimo.
export async function resumenAlertas(negocioId) {
  const hoy = hoyEnLima();
  const en30 = new Date(hoy);
  en30.setUTCDate(en30.getUTCDate() + 30);
  const conStock = { negocioId, cantidadActual: { gt: 0 }, producto: { activo: true } };

  const [productos, vencidos, porVencer30] = await Promise.all([
    listarProductos(negocioId),
    prisma.lote.count({ where: { ...conStock, fechaVencimiento: { lt: hoy } } }),
    prisma.lote.count({ where: { ...conStock, fechaVencimiento: { gte: hoy, lte: en30 } } }),
  ]);
  const stockBajo = productos.filter((p) => p.stockBajo).length;

  return { stockBajo, vencidos, porVencer30, total: stockBajo + vencidos + porVencer30 };
}
