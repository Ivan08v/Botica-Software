import { hoyEnLima } from "../common/fechas.js";
import { conflicto, noEncontrado, solicitudIncorrecta } from "../errores.js";
import { Prisma, prisma } from "../prisma.js";

export function listarLotes(negocioId, productoId) {
  return prisma.lote.findMany({
    where: { negocioId, ...(productoId ? { productoId } : {}) },
    include: { producto: { select: { nombre: true, presentacion: true } } },
    orderBy: { fechaVencimiento: "asc" },
  });
}

export async function ingresarLote(datos, usuario) {
  const { negocioId } = usuario;
  const fechaVencimiento = new Date(`${datos.fechaVencimiento}T00:00:00.000Z`);
  // JavaScript convierte "2027-02-31" en 3 de marzo; si al volver a texto cambia, la fecha no existe
  if (
    Number.isNaN(fechaVencimiento.getTime()) ||
    fechaVencimiento.toISOString().slice(0, 10) !== datos.fechaVencimiento
  ) {
    throw solicitudIncorrecta("La fecha de vencimiento no existe");
  }
  if (fechaVencimiento < hoyEnLima()) {
    throw solicitudIncorrecta("No se puede ingresar un lote que ya está vencido");
  }

  // Buscar con negocioId impide ingresar mercadería a un producto de otro negocio
  const producto = await prisma.producto.findFirst({ where: { id: datos.productoId, negocioId } });
  if (!producto) throw noEncontrado("Producto no encontrado");
  if (!producto.activo) throw solicitudIncorrecta("El producto está desactivado");

  try {
    // Lote y movimiento en una sola transacción: o se guardan los dos o ninguno
    return await prisma.$transaction(async (tx) => {
      const lote = await tx.lote.create({
        data: {
          negocioId,
          productoId: datos.productoId,
          numeroLote: datos.numeroLote.trim(),
          fechaVencimiento,
          cantidadInicial: datos.cantidad,
          cantidadActual: datos.cantidad,
          costoUnitario: datos.costoUnitario,
        },
      });
      await tx.movimiento.create({
        data: {
          negocioId,
          tipo: "INGRESO",
          productoId: datos.productoId,
          loteId: lote.id,
          cantidad: datos.cantidad,
          usuarioId: usuario.id,
          motivo: "Ingreso de mercadería",
        },
      });
      return lote;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw conflicto("Ese número de lote ya está registrado para este producto");
    }
    throw e;
  }
}

// ---- Baja de lotes vencidos ----
// Un lote vencido no se puede vender: se retira del stock y se destruye o se devuelve al
// proveedor. La baja deja el lote en 0 y registra un movimiento BAJA_VENCIMIENTO con el destino,
// la observación (ej. "Acta N° 012") y quién lo hizo. El costo de lo retirado es la pérdida.

const TEXTO_DESTINO = { DESTRUCCION: "Destrucción", DEVOLUCION_PROVEEDOR: "Devolución al proveedor" };

// Da de baja los lotes indicados (o, si no se indican, todos los vencidos con stock).
// Todo en una transacción: o se dan de baja todos o ninguno.
export async function darDeBaja(usuario, { loteIds, destino, observacion }) {
  const { negocioId } = usuario;
  const hoy = hoyEnLima().toISOString().slice(0, 10);

  return prisma.$transaction(async (tx) => {
    // FOR UPDATE: si dos personas dan de baja el mismo lote a la vez, la segunda espera
    // y luego ve que ya no tiene stock. Solo lotes del negocio del usuario.
    const lotes = loteIds
      ? await tx.$queryRaw`
          SELECT l.id, l.producto_id AS "productoId", l.numero_lote AS "numeroLote",
                 l.fecha_vencimiento AS "fechaVencimiento", l.cantidad_actual AS "cantidadActual",
                 l.costo_unitario AS "costoUnitario", p.nombre AS producto
          FROM lotes l JOIN productos p ON p.id = l.producto_id
          WHERE l.negocio_id = ${negocioId} AND l.id IN (${Prisma.join(loteIds)})
          ORDER BY l.id
          FOR UPDATE OF l`
      : await tx.$queryRaw`
          SELECT l.id, l.producto_id AS "productoId", l.numero_lote AS "numeroLote",
                 l.fecha_vencimiento AS "fechaVencimiento", l.cantidad_actual AS "cantidadActual",
                 l.costo_unitario AS "costoUnitario", p.nombre AS producto
          FROM lotes l JOIN productos p ON p.id = l.producto_id
          WHERE l.negocio_id = ${negocioId} AND l.cantidad_actual > 0
            AND l.fecha_vencimiento < ${hoy}::date AND p.activo = true
          ORDER BY l.id
          FOR UPDATE OF l`;

    if (loteIds) {
      const encontrados = new Set(lotes.map((l) => l.id));
      const ajeno = loteIds.find((id) => !encontrados.has(id));
      if (ajeno !== undefined) throw noEncontrado(`No existe el lote con id ${ajeno}`);
    }
    if (lotes.length === 0) throw solicitudIncorrecta("No hay lotes vencidos con stock para dar de baja");

    for (const lote of lotes) {
      const venceTexto = lote.fechaVencimiento.toISOString().slice(0, 10);
      if (venceTexto >= hoy) {
        throw solicitudIncorrecta(
          `El lote ${lote.numeroLote} de "${lote.producto}" todavía no vence: solo se dan de baja lotes vencidos`,
        );
      }
      if (lote.cantidadActual === 0) {
        throw conflicto(`El lote ${lote.numeroLote} de "${lote.producto}" ya no tiene stock`);
      }
    }

    for (const lote of lotes) {
      await tx.lote.update({ where: { id: lote.id }, data: { cantidadActual: 0 } });
    }
    await tx.movimiento.createMany({
      data: lotes.map((lote) => ({
        negocioId,
        tipo: "BAJA_VENCIMIENTO",
        productoId: lote.productoId,
        loteId: lote.id,
        cantidad: -lote.cantidadActual,
        usuarioId: usuario.id,
        destinoBaja: destino,
        motivo: observacion || TEXTO_DESTINO[destino],
      })),
    });

    const valor = lotes.reduce(
      (suma, l) => suma.plus(new Prisma.Decimal(l.costoUnitario).mul(l.cantidadActual)),
      new Prisma.Decimal(0),
    );
    return {
      lotes: lotes.length,
      unidades: lotes.reduce((suma, l) => suma + l.cantidadActual, 0),
      // Pérdida al costo: lo que se pagó por lo que se retira
      valor: valor.toFixed(2),
      destino,
    };
  });
}
