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
