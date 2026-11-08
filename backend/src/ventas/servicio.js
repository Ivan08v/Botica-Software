import { hoyEnLima } from "../common/fechas.js";
import { igvDeLineas } from "../common/igv.js";
import { conflicto, noEncontrado, solicitudIncorrecta } from "../errores.js";
import { prisma } from "../prisma.js";
import { repartirFefo } from "./fefo.js";

// Serie de cada comprobante. Una sola caja por negocio: una serie por tipo alcanza.
export const SERIES = { BOLETA: "B001", FACTURA: "F001" };
// SUNAT pide identificar al cliente en boletas de más de S/ 700
export const LIMITE_BOLETA_ANONIMA = 700;

const CLIENTE_COMPROBANTE = {
  select: { id: true, tipoDocumento: true, documento: true, nombre: true, direccion: true },
};

const DETALLE_COMPLETO = {
  usuario: { select: { id: true, nombre: true } },
  cliente: CLIENTE_COMPROBANTE,
  detalles: {
    orderBy: { id: "asc" },
    include: {
      producto: { select: { nombre: true, presentacion: true } },
      lote: { select: { numeroLote: true, fechaVencimiento: true } },
    },
  },
};

export async function listarVentas(negocioId) {
  const ventas = await prisma.venta.findMany({
    where: { negocioId },
    orderBy: { fecha: "desc" },
    take: 50,
    include: {
      usuario: { select: { id: true, nombre: true } },
      cliente: CLIENTE_COMPROBANTE,
    },
  });
  return ventas.map(conComprobante);
}

// Número que llevará la próxima boleta y la próxima factura
export async function proximoComprobante(negocioId) {
  const ultimos = await prisma.venta.groupBy({
    by: ["serie"],
    where: { negocioId, serie: { in: Object.values(SERIES) } },
    _max: { numero: true },
  });
  const siguiente = (tipo) => {
    const serie = SERIES[tipo];
    const ultimo = ultimos.find((u) => u.serie === serie)?._max.numero ?? 0;
    return codigoComprobante(serie, ultimo + 1);
  };
  return { BOLETA: siguiente("BOLETA"), FACTURA: siguiente("FACTURA") };
}

export async function obtenerVenta(negocioId, id) {
  const venta = await prisma.venta.findFirst({ where: { id, negocioId }, include: DETALLE_COMPLETO });
  if (!venta) throw noEncontrado("Venta no encontrada");
  return conComprobante(venta);
}

export async function registrarVenta(datos, usuario) {
  const { negocioId, id: usuarioId } = usuario;
  // Si el mismo producto viene dos veces, se suma en una sola línea
  const pedido = new Map();
  for (const item of datos.items) {
    pedido.set(item.productoId, (pedido.get(item.productoId) ?? 0) + item.cantidad);
  }
  // Siempre en el mismo orden: dos ventas con los mismos productos bloquean los lotes
  // en la misma secuencia y así no pueden quedar esperándose una a la otra (deadlock)
  const productoIds = [...pedido.keys()].sort((a, b) => a - b);
  const hoy = hoyEnLima().toISOString().slice(0, 10);
  const tipoComprobante = datos.tipoComprobante ?? "BOLETA";
  const medioPago = datos.medioPago ?? "EFECTIVO";
  if (datos.montoRecibido !== undefined && medioPago !== "EFECTIVO") {
    throw solicitudIncorrecta("El monto recibido solo se indica cuando se paga en efectivo");
  }

  // Todo o nada: si falla cualquier producto, no se descuenta ni se guarda nada
  const ventaId = await prisma.$transaction(async (tx) => {
    // El cliente, si viene, tiene que ser de este negocio: uno ajeno cuenta como inexistente
    const cliente =
      datos.clienteId === undefined ? null : await tx.cliente.findFirst({ where: { id: datos.clienteId, negocioId } });
    if (datos.clienteId !== undefined && !cliente) {
      throw noEncontrado(`No existe el cliente con id ${datos.clienteId}`);
    }
    if (tipoComprobante === "FACTURA" && cliente?.tipoDocumento !== "RUC") {
      throw solicitudIncorrecta("Para emitir una factura el cliente debe tener RUC");
    }

    // Solo productos del negocio del usuario: uno ajeno cuenta como inexistente
    const productos = await tx.producto.findMany({ where: { id: { in: productoIds }, negocioId } });
    const porId = new Map(productos.map((p) => [p.id, p]));

    // Una línea por cada lote usado: { productoId, loteId, cantidad, precioUnitario }
    const lineas = [];

    for (const productoId of productoIds) {
      const producto = porId.get(productoId);
      if (!producto) throw noEncontrado(`No existe el producto con id ${productoId}`);
      if (!producto.activo) throw solicitudIncorrecta(`El producto "${producto.nombre}" está desactivado`);

      // FOR UPDATE bloquea estos lotes hasta que termine la transacción. Otra venta
      // simultánea del mismo producto espera aquí y, al continuar, lee las cantidades
      // ya descontadas. Los lotes vencidos o vacíos ni siquiera se consideran.
      const lotes = await tx.$queryRaw`
        SELECT id, cantidad_actual AS "cantidadActual"
        FROM lotes
        WHERE producto_id = ${productoId}
          AND negocio_id = ${negocioId}
          AND fecha_vencimiento >= ${hoy}::date
          AND cantidad_actual > 0
        ORDER BY fecha_vencimiento ASC, id ASC
        FOR UPDATE`;

      const cantidad = pedido.get(productoId);
      const reparto = repartirFefo(lotes, cantidad);
      if (reparto.faltante > 0) {
        throw conflicto(
          `Stock insuficiente de "${producto.nombre}": se pidieron ${cantidad} y hay ${cantidad - reparto.faltante} disponibles`,
        );
      }
      for (const uso of reparto.usos) {
        lineas.push({ productoId, loteId: uso.loteId, cantidad: uso.cantidad, precioUnitario: producto.precioVenta });
      }
    }

    // El precio se copia al detalle: si mañana cambia, la venta de hoy no se altera.
    // Los precios incluyen IGV: se separa línea por línea lo que es de la botica y lo que es de SUNAT.
    const { total, opGravada, igv } = igvDeLineas(lineas.map((l) => l.precioUnitario.mul(l.cantidad)));
    if (tipoComprobante === "BOLETA" && !cliente && total.greaterThan(LIMITE_BOLETA_ANONIMA)) {
      throw solicitudIncorrecta(
        `Para una boleta de más de S/ ${LIMITE_BOLETA_ANONIMA} hay que identificar al cliente con su DNI`,
      );
    }
    if (datos.montoRecibido !== undefined && total.greaterThan(datos.montoRecibido)) {
      throw solicitudIncorrecta(
        `El monto recibido (S/ ${datos.montoRecibido.toFixed(2)}) no cubre el total (S/ ${total.toFixed(2)})`,
      );
    }

    for (const linea of lineas) {
      await tx.lote.update({ where: { id: linea.loteId }, data: { cantidadActual: { decrement: linea.cantidad } } });
    }

    // Número correlativo de la serie. El bloqueo (uno por negocio y tipo de comprobante) hace que
    // dos ventas simultáneas se numeren una después de la otra: sin saltos ni números repetidos.
    // Va al final, después de bloquear los lotes, para que todas las ventas tomen los bloqueos
    // en el mismo orden y no puedan quedar esperándose entre sí.
    const serie = SERIES[tipoComprobante];
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${negocioId}::int, ${tipoComprobante === "BOLETA" ? 1 : 2}::int)`;
    const ultima = await tx.venta.aggregate({ where: { negocioId, serie }, _max: { numero: true } });
    const numero = (ultima._max.numero ?? 0) + 1;

    const venta = await tx.venta.create({
      data: {
        negocioId,
        usuarioId,
        clienteId: datos.clienteId,
        total,
        opGravada,
        igv,
        tipoComprobante,
        serie,
        numero,
        medioPago,
        montoRecibido: datos.montoRecibido,
        detalles: { create: lineas },
      },
    });

    await tx.movimiento.createMany({
      data: lineas.map((l) => ({
        negocioId,
        tipo: "VENTA",
        productoId: l.productoId,
        loteId: l.loteId,
        cantidad: -l.cantidad,
        usuarioId,
        motivo: `Venta #${venta.id}`,
      })),
    });
    return venta.id;
  });

  return obtenerVenta(negocioId, ventaId);
}

// Agrega a la venta el código del comprobante ("B001-00000012") y el vuelto, si pagó en efectivo
function conComprobante(venta) {
  return {
    ...venta,
    comprobante: venta.serie && venta.numero ? codigoComprobante(venta.serie, venta.numero) : null,
    vuelto: venta.montoRecibido ? venta.montoRecibido.minus(venta.total).toFixed(2) : null,
  };
}

// "B001" y 12 -> "B001-00000012"
function codigoComprobante(serie, numero) {
  return `${serie}-${String(numero).padStart(8, "0")}`;
}
