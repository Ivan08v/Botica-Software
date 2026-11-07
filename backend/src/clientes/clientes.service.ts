import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TipoDocumento } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ActualizarClienteDto, CrearClienteDto } from "./dto/cliente.dto";

const FORMATOS: Record<TipoDocumento, { patron: RegExp; mensaje: string }> = {
  DNI: { patron: /^\d{8}$/, mensaje: "El DNI debe tener 8 dígitos" },
  // Los RUC empiezan con 10 (persona con negocio), 15, 16, 17 o 20 (empresa)
  RUC: { patron: /^(10|15|16|17|20)\d{9}$/, mensaje: "El RUC debe tener 11 dígitos y empezar con 10, 15, 16, 17 o 20" },
  CE: { patron: /^[A-Za-z0-9]{9,12}$/, mensaje: "El carné de extranjería debe tener de 9 a 12 caracteres" },
};

// Devuelve el tipo de documento: el indicado (si el formato coincide) o, si no se indicó,
// el que corresponde al formato: 8 dígitos es DNI, 11 dígitos con prefijo de RUC es RUC, y si no, CE.
export function tipoDeDocumento(documento: string, indicado?: TipoDocumento): TipoDocumento {
  if (indicado) {
    if (!FORMATOS[indicado].patron.test(documento)) throw new BadRequestException(FORMATOS[indicado].mensaje);
    return indicado;
  }
  const tipo = (["DNI", "RUC", "CE"] as const).find((t) => FORMATOS[t].patron.test(documento));
  if (!tipo) throw new BadRequestException("El documento no es un DNI, RUC ni carné de extranjería válido");
  return tipo;
}

// Igual que productos: todo se filtra por el negocio del usuario y un cliente
// de otro negocio responde 404, como si no existiera.
@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  // Con el número de compras de cada uno, para la tabla de clientes
  async listar(negocioId: number, buscar?: string) {
    const texto = buscar?.trim();
    const clientes = await this.prisma.cliente.findMany({
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

  // Para la caja: el vendedor digita el DNI y el sistema le dice si ya es cliente
  async obtenerPorDocumento(negocioId: number, documento: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { negocioId_documento: { negocioId, documento: documento.trim() } },
    });
    if (!cliente) throw new NotFoundException("No hay ningún cliente con ese documento");
    return cliente;
  }

  // Ficha del cliente con su historial: lo que compró, cuándo y cuánto gastó en total
  async obtener(negocioId: number, id: number) {
    const cliente = await this.prisma.cliente.findFirst({ where: { id, negocioId } });
    if (!cliente) throw new NotFoundException("Cliente no encontrado");

    const [ventas, resumen] = await Promise.all([
      this.prisma.venta.findMany({
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
      this.prisma.venta.aggregate({
        where: { negocioId, clienteId: id },
        _count: true,
        _sum: { total: true },
      }),
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

  async crear(negocioId: number, dto: CrearClienteDto) {
    const tipoDocumento = tipoDeDocumento(dto.documento, dto.tipoDocumento);
    try {
      return await this.prisma.cliente.create({ data: { ...dto, tipoDocumento, negocioId } });
    } catch (e) {
      throw this.traducirError(e);
    }
  }

  async actualizar(negocioId: number, id: number, dto: ActualizarClienteDto) {
    const actual = await this.prisma.cliente.findFirst({ where: { id, negocioId } });
    if (!actual) throw new NotFoundException("Cliente no encontrado");
    // Si cambia el documento o el tipo, se revisa que sigan coincidiendo
    const tipoDocumento =
      dto.documento !== undefined || dto.tipoDocumento !== undefined
        ? tipoDeDocumento(dto.documento ?? actual.documento, dto.tipoDocumento)
        : actual.tipoDocumento;
    try {
      return await this.prisma.cliente.update({ where: { id, negocioId }, data: { ...dto, tipoDocumento } });
    } catch (e) {
      throw this.traducirError(e);
    }
  }

  // Solo se elimina un cliente sin compras: con compras, borrarlo dejaría ventas sin su cliente
  // (y una factura sin a quién se emitió). En ese caso se puede editar, pero no eliminar.
  async eliminar(negocioId: number, id: number) {
    const cliente = await this.prisma.cliente.findFirst({
      where: { id, negocioId },
      include: { _count: { select: { ventas: true } } },
    });
    if (!cliente) throw new NotFoundException("Cliente no encontrado");
    const compras = cliente._count.ventas;
    if (compras > 0) {
      throw new ConflictException(
        `${cliente.nombre} tiene ${compras} ${compras === 1 ? "compra registrada" : "compras registradas"}: no se puede eliminar para no perder su historial`,
      );
    }
    try {
      await this.prisma.cliente.delete({ where: { id } });
    } catch (e) {
      throw this.traducirError(e);
    }
  }

  private traducirError(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return new ConflictException("Ya existe un cliente con ese documento");
      if (e.code === "P2025") return new NotFoundException("Cliente no encontrado");
      // La base rechazó eliminarlo: justo se le registró una venta (ON DELETE RESTRICT)
      if (e.code === "P2003") return new ConflictException("El cliente tiene compras registradas: no se puede eliminar");
    }
    return e;
  }
}

function agrupar(
  detalles: { productoId: number; cantidad: number; producto: { nombre: string; presentacion: string | null } }[],
) {
  const porProducto = new Map<number, { nombre: string; presentacion: string | null; cantidad: number }>();
  for (const d of detalles) {
    const actual = porProducto.get(d.productoId);
    if (actual) actual.cantidad += d.cantidad;
    else porProducto.set(d.productoId, { ...d.producto, cantidad: d.cantidad });
  }
  return [...porProducto.values()];
}
