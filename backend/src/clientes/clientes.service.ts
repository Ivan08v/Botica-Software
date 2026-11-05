import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ActualizarClienteDto, CrearClienteDto } from "./dto/cliente.dto";

// Igual que productos: todo se filtra por el negocio del usuario y un cliente
// de otro negocio responde 404, como si no existiera.
@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  listar(negocioId: number, buscar?: string) {
    const texto = buscar?.trim();
    return this.prisma.cliente.findMany({
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
      take: 50,
    });
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
    try {
      return await this.prisma.cliente.create({ data: { ...dto, negocioId } });
    } catch (e) {
      throw this.traducirError(e);
    }
  }

  async actualizar(negocioId: number, id: number, dto: ActualizarClienteDto) {
    try {
      return await this.prisma.cliente.update({ where: { id, negocioId }, data: dto });
    } catch (e) {
      throw this.traducirError(e);
    }
  }

  private traducirError(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return new ConflictException("Ya existe un cliente con ese documento");
      if (e.code === "P2025") return new NotFoundException("Cliente no encontrado");
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
