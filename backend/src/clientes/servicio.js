import { conflicto, noEncontrado, solicitudIncorrecta } from "../errores.js";
import { Prisma, prisma } from "../prisma.js";

const FORMATOS = {
  DNI: { patron: /^\d{8}$/, mensaje: "El DNI debe tener 8 dígitos" },
  // Los RUC empiezan con 10 (persona con negocio), 15, 16, 17 o 20 (empresa)
  RUC: { patron: /^(10|15|16|17|20)\d{9}$/, mensaje: "El RUC debe tener 11 dígitos y empezar con 10, 15, 16, 17 o 20" },
  CE: { patron: /^[A-Za-z0-9]{9,12}$/, mensaje: "El carné de extranjería debe tener de 9 a 12 caracteres" },
};

// Devuelve el tipo de documento: el indicado (si el formato coincide) o, si no se indicó,
// el que corresponde al formato: 8 dígitos es DNI, 11 dígitos con prefijo de RUC es RUC, y si no, CE.
export function tipoDeDocumento(documento, indicado) {
  if (indicado) {
    if (!FORMATOS[indicado].patron.test(documento)) throw solicitudIncorrecta(FORMATOS[indicado].mensaje);
    return indicado;
  }
  const tipo = ["DNI", "RUC", "CE"].find((t) => FORMATOS[t].patron.test(documento));
  if (!tipo) throw solicitudIncorrecta("El documento no es un DNI, RUC ni carné de extranjería válido");
  return tipo;
}

// Igual que productos: todo se filtra por el negocio del usuario y un cliente
// de otro negocio responde 404, como si no existiera.

// Con el número de compras de cada uno, para la tabla de clientes
export async function listarClientes(negocioId, buscar) {
  const texto = buscar?.trim();
  const clientes = await prisma.cliente.findMany({
    where: {
      negocioId,
      ...(texto
        ? {
            OR: [
              { documento: { startsWith: texto } },
              { nombre: { contains: texto, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { nombre: "asc" },
    take: 500,
    include: { _count: { select: { ventas: true } } },
  });
  return clientes.map(({ _count, ...cliente }) => ({ ...cliente, compras: _count.ventas }));
}

// Para la caja: el vendedor digita el DNI o RUC y el sistema le dice si ya es cliente
export async function obtenerPorDocumento(negocioId, documento) {
  const cliente = await prisma.cliente.findUnique({
    where: { negocioId_documento: { negocioId, documento: documento.trim() } },
  });
  if (!cliente) throw noEncontrado("No hay ningún cliente con ese documento");
  return cliente;
}

// Ficha del cliente con su historial: lo que compró, cuándo y cuánto gastó en total
export async function obtenerCliente(negocioId, id) {
  const cliente = await prisma.cliente.findFirst({ where: { id, negocioId } });
  if (!cliente) throw noEncontrado("Cliente no encontrado");

  const [ventas, resumen] = await Promise.all([
    prisma.venta.findMany({
      where: { negocioId, clienteId: id },
      orderBy: { fecha: "desc" },
      take: 20,
      include: {
        detalles: {
          orderBy: { id: "asc" },
          include: { producto: { select: { nombre: true, presentacion: true } } },
        },
      },
    }),
    prisma.venta.aggregate({ where: { negocioId, clienteId: id }, _count: true, _sum: { total: true } }),
  ]);

  return {
    ...cliente,
    compras: resumen._count,
    totalGastado: (resumen._sum.total ?? new Prisma.Decimal(0)).toFixed(2),
    ultimaCompra: ventas[0]?.fecha ?? null,
    ventas: ventas.map((v) => ({
      id: v.id,
      fecha: v.fecha,
      total: v.total,
      // Una venta FEFO puede tener varias líneas del mismo producto (una por lote): se agrupan
      productos: agrupar(v.detalles),
    })),
  };
}

export async function crearCliente(negocioId, datos) {
  const tipoDocumento = tipoDeDocumento(datos.documento, datos.tipoDocumento);
  try {
    return await prisma.cliente.create({ data: { ...datos, tipoDocumento, negocioId } });
  } catch (e) {
    throw traducirError(e);
  }
}

export async function actualizarCliente(negocioId, id, datos) {
  const actual = await prisma.cliente.findFirst({ where: { id, negocioId } });
  if (!actual) throw noEncontrado("Cliente no encontrado");
  // Si cambia el documento o el tipo, se revisa que sigan coincidiendo
  const tipoDocumento =
    datos.documento !== undefined || datos.tipoDocumento !== undefined
      ? tipoDeDocumento(datos.documento ?? actual.documento, datos.tipoDocumento)
      : actual.tipoDocumento;
  try {
    return await prisma.cliente.update({ where: { id, negocioId }, data: { ...datos, tipoDocumento } });
  } catch (e) {
    throw traducirError(e);
  }
}

// Solo se elimina un cliente sin compras: con compras, borrarlo dejaría ventas sin su cliente
// (y una factura sin a quién se emitió). En ese caso se puede editar, pero no eliminar.
export async function eliminarCliente(negocioId, id) {
  const cliente = await prisma.cliente.findFirst({
    where: { id, negocioId },
    include: { _count: { select: { ventas: true } } },
  });
  if (!cliente) throw noEncontrado("Cliente no encontrado");
  const compras = cliente._count.ventas;
  if (compras > 0) {
    throw conflicto(
      `${cliente.nombre} tiene ${compras} ${compras === 1 ? "compra registrada" : "compras registradas"}: no se puede eliminar para no perder su historial`,
    );
  }
  try {
    await prisma.cliente.delete({ where: { id } });
  } catch (e) {
    throw traducirError(e);
  }
}

function traducirError(e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return conflicto("Ya existe un cliente con ese documento");
    if (e.code === "P2025") return noEncontrado("Cliente no encontrado");
    // La base rechazó eliminarlo: justo se le registró una venta (ON DELETE RESTRICT)
    if (e.code === "P2003") return conflicto("El cliente tiene compras registradas: no se puede eliminar");
  }
  return e;
}

// Suma las cantidades de un mismo producto: [{ nombre, presentacion, cantidad }]
function agrupar(detalles) {
  const porProducto = new Map();
  for (const d of detalles) {
    const actual = porProducto.get(d.productoId);
    if (actual) actual.cantidad += d.cantidad;
    else porProducto.set(d.productoId, { ...d.producto, cantidad: d.cantidad });
  }
  return [...porProducto.values()];
}
