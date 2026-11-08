import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { hoyEnLima } from "../common/fechas";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ActualizarProductoDto, CrearProductoDto } from "./dto/producto.dto";

// Todos los métodos reciben negocioId (del token) y solo ven productos de ese negocio.
// Un producto de otro negocio se trata igual que uno inexistente: 404.
@Injectable()
export class ProductosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(negocioId: number, buscar?: string, incluirInactivos = false) {
    const texto = buscar?.trim();
    const productos = await this.prisma.producto.findMany({
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

    return this.conStockYLote(negocioId, productos);
  }

  // Los más vendidos de los últimos 30 días que todavía tienen stock: accesos rápidos de la caja
  async frecuentes(negocioId: number, cuantos = 6) {
    const desde = hoyEnLima();
    desde.setUTCDate(desde.getUTCDate() - 30);
    const masVendidos = await this.prisma.detalleVenta.groupBy({
      by: ["productoId"],
      where: { venta: { negocioId, fecha: { gte: desde } } },
      _sum: { cantidad: true },
      orderBy: { _sum: { cantidad: "desc" } },
      take: cuantos * 2, // margen por si alguno ya no tiene stock o fue desactivado
    });
    const ids = masVendidos.map((m) => m.productoId);
    const productos = await this.prisma.producto.findMany({ where: { id: { in: ids }, negocioId, activo: true } });
    const conDatos = await this.conStockYLote(negocioId, productos);
    return conDatos
      .filter((p) => p.stock > 0)
      .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
      .slice(0, cuantos);
  }

  // Agrega a cada producto su stock vendible y el lote que FEFO usaría primero
  // (el vigente con stock que vence antes): así la caja puede mostrar de qué lote sale.
  private async conStockYLote<P extends { id: number; stockMinimo: number }>(negocioId: number, productos: P[]) {
    const ids = productos.map((p) => p.id);
    const [stock, primeros] = await Promise.all([
      this.stockPorProducto(negocioId, ids),
      this.prisma.lote.findMany({
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

  async obtener(negocioId: number, id: number) {
    const producto = await this.prisma.producto.findFirst({
      where: { id, negocioId },
      include: { lotes: { orderBy: { fechaVencimiento: "asc" } } },
    });
    if (!producto) throw new NotFoundException("Producto no encontrado");
    return this.conStock(producto);
  }

  // Para el lector de código de barras
  async obtenerPorCodigo(negocioId: number, codigoBarras: string) {
    const producto = await this.prisma.producto.findUnique({
      where: { negocioId_codigoBarras: { negocioId, codigoBarras } },
      include: { lotes: { orderBy: { fechaVencimiento: "asc" } } },
    });
    if (!producto) throw new NotFoundException("No hay ningún producto con ese código de barras");
    return this.conStock(producto);
  }

  async crear(negocioId: number, dto: CrearProductoDto) {
    try {
      const producto = await this.prisma.producto.create({ data: { ...dto, negocioId } });
      return { ...producto, stock: 0, stockBajo: producto.stockMinimo > 0 };
    } catch (e) {
      throw this.traducirError(e);
    }
  }

  async actualizar(negocioId: number, id: number, dto: ActualizarProductoDto) {
    try {
      // negocioId en el where: si el producto es de otro negocio, no se encuentra (P2025)
      await this.prisma.producto.update({ where: { id, negocioId }, data: dto });
    } catch (e) {
      throw this.traducirError(e);
    }
    return this.obtener(negocioId, id);
  }

  // No se borra de verdad: ventas y movimientos antiguos siguen apuntando al producto
  async desactivar(negocioId: number, id: number) {
    return this.actualizar(negocioId, id, { activo: false });
  }

  // Stock = suma de cantidad_actual de los lotes no vencidos (no se guarda en productos)
  private async stockPorProducto(negocioId: number, ids: number[]): Promise<Map<number, number>> {
    const grupos = await this.prisma.lote.groupBy({
      by: ["productoId"],
      where: { negocioId, productoId: { in: ids }, fechaVencimiento: { gte: hoyEnLima() } },
      _sum: { cantidadActual: true },
    });
    return new Map(grupos.map((g) => [g.productoId, g._sum.cantidadActual ?? 0]));
  }

  private conStock<
    P extends { stockMinimo: number; lotes: { numeroLote: string; fechaVencimiento: Date; cantidadActual: number }[] },
  >(producto: P) {
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

  private traducirError(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        return new ConflictException("Ya existe un producto con ese código de barras");
      }
      if (e.code === "P2025") {
        return new NotFoundException("Producto no encontrado");
      }
    }
    return e;
  }
}
