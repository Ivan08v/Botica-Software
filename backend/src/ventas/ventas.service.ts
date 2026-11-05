import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { UsuarioToken } from "../auth/decoradores";
import { hoyEnLima } from "../common/fechas";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RegistrarVentaDto } from "./dto/registrar-venta.dto";
import { LoteDisponible, repartirFefo } from "./fefo";

const DETALLE_COMPLETO = {
  usuario: { select: { id: true, nombre: true } },
  cliente: { select: { id: true, documento: true, nombre: true } },
  detalles: {
    orderBy: { id: "asc" },
    include: {
      producto: { select: { nombre: true, presentacion: true } },
      lote: { select: { numeroLote: true, fechaVencimiento: true } },
    },
  },
} satisfies Prisma.VentaInclude;

@Injectable()
export class VentasService {
  constructor(private readonly prisma: PrismaService) {}

  listar(negocioId: number) {
    return this.prisma.venta.findMany({
      where: { negocioId },
      orderBy: { fecha: "desc" },
      take: 50,
      include: {
        usuario: { select: { id: true, nombre: true } },
        cliente: { select: { id: true, documento: true, nombre: true } },
      },
    });
  }

  async obtener(negocioId: number, id: number) {
    const venta = await this.prisma.venta.findFirst({
      where: { id, negocioId },
      include: DETALLE_COMPLETO,
    });
    if (!venta) throw new NotFoundException("Venta no encontrada");
    return venta;
  }

  async registrar(dto: RegistrarVentaDto, usuario: UsuarioToken) {
    const { negocioId, id: usuarioId } = usuario;
    // Si el mismo producto viene dos veces, se suma en una sola línea
    const pedido = new Map<number, number>();
    for (const item of dto.items) {
      pedido.set(item.productoId, (pedido.get(item.productoId) ?? 0) + item.cantidad);
    }
    // Siempre en el mismo orden: dos ventas con los mismos productos bloquean los lotes
    // en la misma secuencia y así no pueden quedar esperándose una a la otra (deadlock)
    const productoIds = [...pedido.keys()].sort((a, b) => a - b);
    const hoy = hoyEnLima().toISOString().slice(0, 10);

    // Todo o nada: si falla cualquier producto, no se descuenta ni se guarda nada
    const ventaId = await this.prisma.$transaction(async (tx) => {
      // El cliente, si viene, tiene que ser de este negocio: uno ajeno cuenta como inexistente
      if (dto.clienteId !== undefined) {
        const cliente = await tx.cliente.findFirst({ where: { id: dto.clienteId, negocioId } });
        if (!cliente) throw new NotFoundException(`No existe el cliente con id ${dto.clienteId}`);
      }

      // Solo productos del negocio del usuario: uno ajeno cuenta como inexistente
      const productos = await tx.producto.findMany({
        where: { id: { in: productoIds }, negocioId },
      });
      const porId = new Map(productos.map((p) => [p.id, p]));

      const lineas: {
        productoId: number;
        loteId: number;
        cantidad: number;
        precioUnitario: Prisma.Decimal;
      }[] = [];

      for (const productoId of productoIds) {
        const producto = porId.get(productoId);
        if (!producto) throw new NotFoundException(`No existe el producto con id ${productoId}`);
        if (!producto.activo) {
          throw new BadRequestException(`El producto "${producto.nombre}" está desactivado`);
        }

        // FOR UPDATE bloquea estos lotes hasta que termine la transacción. Otra venta
        // simultánea del mismo producto espera aquí y, al continuar, lee las cantidades
        // ya descontadas. Los lotes vencidos o vacíos ni siquiera se consideran.
        const lotes = await tx.$queryRaw<LoteDisponible[]>`
          SELECT id, cantidad_actual AS "cantidadActual"
          FROM lotes
          WHERE producto_id = ${productoId}
            AND negocio_id = ${negocioId}
            AND fecha_vencimiento >= ${hoy}::date
            AND cantidad_actual > 0
          ORDER BY fecha_vencimiento ASC, id ASC
          FOR UPDATE`;

        const cantidad = pedido.get(productoId)!;
        const reparto = repartirFefo(lotes, cantidad);
        if (reparto.faltante > 0) {
          throw new ConflictException(
            `Stock insuficiente de "${producto.nombre}": se pidieron ${cantidad} y hay ${cantidad - reparto.faltante} disponibles`,
          );
        }
        for (const uso of reparto.usos) {
          lineas.push({
            productoId,
            loteId: uso.loteId,
            cantidad: uso.cantidad,
            precioUnitario: producto.precioVenta,
          });
        }
      }

      for (const linea of lineas) {
        await tx.lote.update({
          where: { id: linea.loteId },
          data: { cantidadActual: { decrement: linea.cantidad } },
        });
      }

      // El precio se copia al detalle: si mañana cambia, la venta de hoy no se altera
      const total = lineas.reduce(
        (suma, l) => suma.plus(l.precioUnitario.mul(l.cantidad)),
        new Prisma.Decimal(0),
      );
      const venta = await tx.venta.create({
        data: {
          negocioId,
          usuarioId,
          clienteId: dto.clienteId,
          total,
          detalles: { create: lineas },
        },
      });

      await tx.movimiento.createMany({
        data: lineas.map((l) => ({
          negocioId,
          tipo: "VENTA" as const,
          productoId: l.productoId,
          loteId: l.loteId,
          cantidad: -l.cantidad,
          usuarioId,
          motivo: `Venta #${venta.id}`,
        })),
      });
      return venta.id;
    });

    return this.obtener(negocioId, ventaId);
  }
}
