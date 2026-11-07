import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { UsuarioToken } from "../auth/decoradores";
import { hoyEnLima } from "../common/fechas";
import { Prisma, TipoComprobante } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RegistrarVentaDto } from "./dto/registrar-venta.dto";
import { LoteDisponible, repartirFefo } from "./fefo";

// Serie de cada comprobante. Una sola caja por negocio: una serie por tipo alcanza.
export const SERIES: Record<TipoComprobante, string> = { BOLETA: "B001", FACTURA: "F001" };
// SUNAT pide identificar al cliente en boletas de más de S/ 700
export const LIMITE_BOLETA_ANONIMA = 700;

const CLIENTE_COMPROBANTE = {
  select: { id: true, tipoDocumento: true, documento: true, nombre: true, direccion: true },
} satisfies Prisma.Venta$clienteArgs;

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
} satisfies Prisma.VentaInclude;

@Injectable()
export class VentasService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(negocioId: number) {
    const ventas = await this.prisma.venta.findMany({
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

  async obtener(negocioId: number, id: number) {
    const venta = await this.prisma.venta.findFirst({
      where: { id, negocioId },
      include: DETALLE_COMPLETO,
    });
    if (!venta) throw new NotFoundException("Venta no encontrada");
    return conComprobante(venta);
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
    const tipoComprobante = dto.tipoComprobante ?? "BOLETA";
    const medioPago = dto.medioPago ?? "EFECTIVO";
    if (dto.montoRecibido !== undefined && medioPago !== "EFECTIVO") {
      throw new BadRequestException("El monto recibido solo se indica cuando se paga en efectivo");
    }

    // Todo o nada: si falla cualquier producto, no se descuenta ni se guarda nada
    const ventaId = await this.prisma.$transaction(async (tx) => {
      // El cliente, si viene, tiene que ser de este negocio: uno ajeno cuenta como inexistente
      const cliente =
        dto.clienteId === undefined
          ? null
          : await tx.cliente.findFirst({ where: { id: dto.clienteId, negocioId } });
      if (dto.clienteId !== undefined && !cliente) {
        throw new NotFoundException(`No existe el cliente con id ${dto.clienteId}`);
      }
      if (tipoComprobante === "FACTURA" && cliente?.tipoDocumento !== "RUC") {
        throw new BadRequestException("Para emitir una factura el cliente debe tener RUC");
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

      // El precio se copia al detalle: si mañana cambia, la venta de hoy no se altera
      const total = lineas.reduce(
        (suma, l) => suma.plus(l.precioUnitario.mul(l.cantidad)),
        new Prisma.Decimal(0),
      );
      if (tipoComprobante === "BOLETA" && !cliente && total.greaterThan(LIMITE_BOLETA_ANONIMA)) {
        throw new BadRequestException(
          `Para una boleta de más de S/ ${LIMITE_BOLETA_ANONIMA} hay que identificar al cliente con su DNI`,
        );
      }
      if (dto.montoRecibido !== undefined && total.greaterThan(dto.montoRecibido)) {
        throw new BadRequestException(
          `El monto recibido (S/ ${dto.montoRecibido.toFixed(2)}) no cubre el total (S/ ${total.toFixed(2)})`,
        );
      }

      for (const linea of lineas) {
        await tx.lote.update({
          where: { id: linea.loteId },
          data: { cantidadActual: { decrement: linea.cantidad } },
        });
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
          clienteId: dto.clienteId,
          total,
          tipoComprobante,
          serie,
          numero,
          medioPago,
          montoRecibido: dto.montoRecibido,
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

// Agrega a la venta el código del comprobante ("B001-00000012") y el vuelto, si pagó en efectivo
function conComprobante<
  V extends { serie: string | null; numero: number | null; total: Prisma.Decimal; montoRecibido: Prisma.Decimal | null },
>(venta: V) {
  return {
    ...venta,
    comprobante: venta.serie && venta.numero ? `${venta.serie}-${String(venta.numero).padStart(8, "0")}` : null,
    vuelto: venta.montoRecibido ? venta.montoRecibido.minus(venta.total).toFixed(2) : null,
  };
}
