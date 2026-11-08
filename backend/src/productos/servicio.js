import { hoyEnLima } from "../common/fechas.js";
import { conflicto, noEncontrado } from "../errores.js";
import { Prisma, prisma } from "../prisma.js";

// Todas las funciones reciben negocioId (del token) y solo ven productos de ese negocio.
// Un producto de otro negocio se trata igual que uno inexistente: 404.

export async function listarProductos(negocioId, buscar, incluirInactivos = false) {
  const texto = buscar?.trim();
  const productos = await prisma.producto.findMany({
    where: {
      negocioId,
      ...(incluirInactivos ? {} : { activo: true }),
      ...(texto
        ? {
            OR: [
              { nombre: { contains: texto, mode: "insensitive" } },
              { laboratorio: { contains: texto, mode: "insensitive" } },
              { codigoBarras: texto },
            ],
          }
        : {}),
    },
    orderBy: { nombre: "asc" },
  });
  return conStockYLote(negocioId, productos);
}

// Los más vendidos de los últimos 30 días que todavía tienen stock: accesos rápidos de la caja
export async function productosFrecuentes(negocioId, cuantos = 6) {
  const desde = hoyEnLima();
  desde.setUTCDate(desde.getUTCDate() - 30);
  const masVendidos = await prisma.detalleVenta.groupBy({
    by: ["productoId"],
    where: { venta: { negocioId, fecha: { gte: desde } } },
    _sum: { cantidad: true },
    orderBy: { _sum: { cantidad: "desc" } },
    take: cuantos * 2, // margen por si alguno ya no tiene stock o fue desactivado
  });
  const ids = masVendidos.map((m) => m.productoId);
  const productos = await prisma.producto.findMany({ where: { id: { in: ids }, negocioId, activo: true } });
  const conDatos = await conStockYLote(negocioId, productos);
  return conDatos
    .filter((p) => p.stock > 0)
    .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
    .slice(0, cuantos);
}

export async function obtenerProducto(negocioId, id) {
  const producto = await prisma.producto.findFirst({
    where: { id, negocioId },
    include: { lotes: { orderBy: { fechaVencimiento: "asc" } } },
  });
  if (!producto) throw noEncontrado("Producto no encontrado");
  return conStock(producto);
}

// Para el lector de código de barras
export async function obtenerPorCodigo(negocioId, codigoBarras) {
  const producto = await prisma.producto.findUnique({
    where: { negocioId_codigoBarras: { negocioId, codigoBarras } },
    include: { lotes: { orderBy: { fechaVencimiento: "asc" } } },
  });
  if (!producto) throw noEncontrado("No hay ningún producto con ese código de barras");
  return conStock(producto);
}

export async function crearProducto(negocioId, datos) {
  try {
    const producto = await prisma.producto.create({ data: { ...datos, negocioId } });
    return { ...producto, stock: 0, stockBajo: producto.stockMinimo > 0 };
  } catch (e) {
    throw traducirError(e);
  }
}

export async function actualizarProducto(negocioId, id, datos) {
  try {
    // negocioId en el where: si el producto es de otro negocio, no se encuentra (P2025)
    await prisma.producto.update({ where: { id, negocioId }, data: datos });
  } catch (e) {
    throw traducirError(e);
  }
  return obtenerProducto(negocioId, id);
}

// No se borra de verdad: ventas y movimientos antiguos siguen apuntando al producto
export function desactivarProducto(negocioId, id) {
  return actualizarProducto(negocioId, id, { activo: false });
}

// Agrega a cada producto su stock vendible y el lote que FEFO usaría primero
// (el vigente con stock que vence antes): así la caja puede mostrar de qué lote sale.
async function conStockYLote(negocioId, productos) {
  const ids = productos.map((p) => p.id);
  const [stock, primeros] = await Promise.all([
    stockPorProducto(negocioId, ids),
    prisma.lote.findMany({
      where: { negocioId, productoId: { in: ids }, fechaVencimiento: { gte: hoyEnLima() }, cantidadActual: { gt: 0 } },
      orderBy: [{ productoId: "asc" }, { fechaVencimiento: "asc" }, { id: "asc" }],
      distinct: ["productoId"],
      select: { productoId: true, numeroLote: true, fechaVencimiento: true },
    }),
  ]);
  const lotePorProducto = new Map(primeros.map(({ productoId, ...lote }) => [productoId, lote]));
  return productos.map((p) => {
    const stockActual = stock.get(p.id) ?? 0;
    return {
      ...p,
      stock: stockActual,
      stockBajo: stockActual < p.stockMinimo,
      proximoLote: lotePorProducto.get(p.id) ?? null,
    };
  });
}

// Stock = suma de cantidad_actual de los lotes no vencidos (no se guarda en productos)
async function stockPorProducto(negocioId, ids) {
  const grupos = await prisma.lote.groupBy({
    by: ["productoId"],
    where: { negocioId, productoId: { in: ids }, fechaVencimiento: { gte: hoyEnLima() } },
    _sum: { cantidadActual: true },
  });
  return new Map(grupos.map((g) => [g.productoId, g._sum.cantidadActual ?? 0]));
}

function conStock(producto) {
  const hoy = hoyEnLima();
  const vigentes = producto.lotes.filter((l) => l.fechaVencimiento >= hoy);
  const stock = vigentes.reduce((suma, l) => suma + l.cantidadActual, 0);
  // Los lotes ya vienen ordenados por vencimiento: el primero vigente con stock es el que sale (FEFO)
  const proximo = vigentes.find((l) => l.cantidadActual > 0);
  return {
    ...producto,
    stock,
    stockBajo: stock < producto.stockMinimo,
    proximoLote: proximo ? { numeroLote: proximo.numeroLote, fechaVencimiento: proximo.fechaVencimiento } : null,
  };
}

function traducirError(e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return conflicto("Ya existe un producto con ese código de barras");
    if (e.code === "P2025") return noEncontrado("Producto no encontrado");
  }
  return e;
}
