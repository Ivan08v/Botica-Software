import { hoyEnLima } from "../common/fechas.js";
import { conflicto, solicitudIncorrecta } from "../errores.js";
import { Prisma, prisma } from "../prisma.js";
import { analizarFilas } from "./analisis.js";

// No guarda nada: solo dice qué pasaría con cada fila
export function vistaPrevia(negocioId, filas) {
  return analizar(prisma, negocioId, filas);
}

export async function confirmarImportacion(usuario, filas) {
  const { negocioId } = usuario;
  try {
    // Todo o nada: si algo falla a mitad de camino, no queda un inventario a medias
    return await prisma.$transaction(
      async (tx) => {
        // Se vuelve a analizar dentro de la transacción: los datos pudieron cambiar
        // desde la vista previa, y nunca se confía en un resultado que envíe el navegador
        const { filas: analizadas, resumen } = await analizar(tx, negocioId, filas);
        const correctas = analizadas.filter((f) => f.estado === "OK");
        if (correctas.length === 0) {
          throw solicitudIncorrecta("No hay ninguna fila válida para importar");
        }

        // 1. Productos nuevos
        const idPorClave = new Map();
        for (const f of correctas) {
          if (f.productoExistenteId) idPorClave.set(f.claveProducto, f.productoExistenteId);
        }
        for (const f of correctas.filter((x) => x.productoNuevo)) {
          const producto = await tx.producto.create({ data: { ...f.productoNuevo, negocioId } });
          idPorClave.set(f.claveProducto, producto.id);
        }

        // 2. Lotes
        const lotes = await tx.lote.createManyAndReturn({
          data: correctas
            .filter((f) => f.lote)
            .map((f) => ({
              negocioId,
              productoId: idPorClave.get(f.claveProducto),
              numeroLote: f.lote.numeroLote,
              fechaVencimiento: new Date(`${f.lote.fechaVencimiento}T00:00:00.000Z`),
              cantidadInicial: f.lote.cantidad,
              cantidadActual: f.lote.cantidad,
              costoUnitario: f.lote.costoUnitario,
            })),
        });

        // 3. Un movimiento INGRESO por lote, igual que en un ingreso manual
        await tx.movimiento.createMany({
          data: lotes.map((lote) => ({
            negocioId,
            tipo: "INGRESO",
            productoId: lote.productoId,
            loteId: lote.id,
            cantidad: lote.cantidadInicial,
            usuarioId: usuario.id,
            motivo: "Importación desde Excel",
          })),
        });

        return {
          importado: {
            productos: correctas.filter((f) => f.productoNuevo).length,
            lotes: lotes.length,
            unidades: resumen.unidades,
          },
          omitidas: resumen.omitidas,
          conError: resumen.conError,
        };
      },
      { timeout: 30_000 },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw conflicto(
        "El inventario cambió mientras se importaba. Vuelve a cargar el archivo para revisar la vista previa.",
      );
    }
    throw e;
  }
}

// `db` es el cliente normal o el de una transacción: los dos tienen producto y lote
async function analizar(db, negocioId, filas) {
  const [productos, lotes] = await Promise.all([
    db.producto.findMany({
      where: { negocioId },
      select: { id: true, nombre: true, presentacion: true, codigoBarras: true },
    }),
    db.lote.findMany({ where: { negocioId }, select: { productoId: true, numeroLote: true } }),
  ]);
  return analizarFilas(
    filas,
    { productos, lotes: new Set(lotes.map((l) => `${l.productoId}|${l.numeroLote.toUpperCase()}`)) },
    hoyEnLima().toISOString().slice(0, 10),
  );
}
