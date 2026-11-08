import { BadRequestException, Injectable } from "@nestjs/common";
import { fechaEnLima, hoyEnLima, inicioDelDiaEnLima } from "../common/fechas";
import { separarIgv } from "../common/igv";
import { Prisma } from "../generated/prisma/client";
import { diasRestantes, tramoDe } from "../panel/tramos";
import { PrismaService } from "../prisma/prisma.service";

const MAXIMO_DIAS_VENTAS = 366;
const cero = () => new Prisma.Decimal(0);

// "2027-02-31" se convierte en marzo: si al volver a texto cambia, la fecha no existe
function fechaExiste(fecha: string): boolean {
  const d = new Date(`${fecha}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

// Los reportes devuelven datos; el navegador los convierte en Excel o PDF.
// Así el mismo endpoint sirve para ambos formatos y el servidor no genera archivos.
@Injectable()
export class ReportesService {
  constructor(private readonly prisma: PrismaService) {}

  // Inventario valorizado: un renglón por lote con stock, con su valor al costo y a precio de venta
  async inventario(negocioId: number, venceEnDias?: number) {
    const hoy = hoyEnLima();
    let limite: Date | undefined;
    if (venceEnDias !== undefined) {
      limite = new Date(hoy);
      limite.setUTCDate(limite.getUTCDate() + venceEnDias);
    }

    const lotes = await this.prisma.lote.findMany({
      where: {
        negocioId,
        cantidadActual: { gt: 0 },
        producto: { activo: true },
        ...(limite ? { fechaVencimiento: { lte: limite } } : {}),
      },
      include: {
        producto: {
          select: { nombre: true, laboratorio: true, presentacion: true, codigoBarras: true, precioVenta: true },
        },
      },
      // Por vencer: lo más urgente primero. Inventario completo: alfabético por producto.
      orderBy: limite
        ? [{ fechaVencimiento: "asc" }, { id: "asc" }]
        : [{ producto: { nombre: "asc" } }, { fechaVencimiento: "asc" }],
    });

    const totales = {
      vigente: { lotes: 0, unidades: 0, valorCosto: cero(), valorVenta: cero() },
      vencido: { lotes: 0, unidades: 0, valorCosto: cero(), valorVenta: cero() },
    };
    const productos = new Set<number>();

    const filas = lotes.map((lote) => {
      const dias = diasRestantes(lote.fechaVencimiento, hoy);
      const estado = tramoDe(dias) ?? "VIGENTE";
      const valorCosto = lote.costoUnitario.mul(lote.cantidadActual);
      const valorVenta = lote.producto.precioVenta.mul(lote.cantidadActual);
      const grupo = estado === "VENCIDO" ? totales.vencido : totales.vigente;
      grupo.lotes += 1;
      grupo.unidades += lote.cantidadActual;
      grupo.valorCosto = grupo.valorCosto.plus(valorCosto);
      grupo.valorVenta = grupo.valorVenta.plus(valorVenta);
      productos.add(lote.productoId);
      return {
        producto: lote.producto.nombre,
        laboratorio: lote.producto.laboratorio,
        presentacion: lote.producto.presentacion,
        codigoBarras: lote.producto.codigoBarras,
        numeroLote: lote.numeroLote,
        fechaVencimiento: lote.fechaVencimiento.toISOString().slice(0, 10),
        diasRestantes: dias,
        estado,
        cantidad: lote.cantidadActual,
        costoUnitario: lote.costoUnitario.toFixed(2),
        valorCosto: valorCosto.toFixed(2),
        precioVenta: lote.producto.precioVenta.toFixed(2),
        valorVenta: valorVenta.toFixed(2),
      };
    });

    const formato = (g: typeof totales.vigente) => ({
      ...g,
      valorCosto: g.valorCosto.toFixed(2),
      valorVenta: g.valorVenta.toFixed(2),
    });
    return {
      fecha: hoy.toISOString().slice(0, 10),
      venceEnDias: venceEnDias ?? null,
      resumen: { productos: productos.size, vigente: formato(totales.vigente), vencido: formato(totales.vencido) },
      filas,
    };
  }

  // Ventas de un período (días del calendario de Perú, ambos incluidos), un renglón por lote vendido
  async ventas(negocioId: number, desde: string, hasta: string) {
    if (!fechaExiste(desde) || !fechaExiste(hasta)) {
      throw new BadRequestException("Alguna de las fechas no existe");
    }
    if (hasta < desde) {
      throw new BadRequestException("La fecha final no puede ser anterior a la inicial");
    }
    const inicio = inicioDelDiaEnLima(desde);
    const fin = inicioDelDiaEnLima(hasta);
    fin.setUTCDate(fin.getUTCDate() + 1);
    if ((fin.getTime() - inicio.getTime()) / 86_400_000 > MAXIMO_DIAS_VENTAS) {
      throw new BadRequestException("El período no puede ser mayor a un año");
    }

    const detalles = await this.prisma.detalleVenta.findMany({
      where: { venta: { negocioId, fecha: { gte: inicio, lt: fin } } },
      include: {
        venta: { select: { fecha: true, usuario: { select: { nombre: true } } } },
        producto: { select: { nombre: true, presentacion: true } },
        lote: { select: { numeroLote: true, costoUnitario: true } },
      },
      orderBy: [{ venta: { fecha: "asc" } }, { id: "asc" }],
    });

    let total = cero();
    let opGravada = cero();
    let costo = cero();
    let unidades = 0;
    const ventas = new Set<number>();

    const filas = detalles.map((d) => {
      const subtotal = d.precioUnitario.mul(d.cantidad);
      // El IGV incluido en el precio no es de la botica (se paga a SUNAT): se quita antes de calcular
      // la ganancia. Se separa por línea, igual que al registrar la venta (src/common/igv.ts).
      const { valorVenta, igv } = separarIgv(subtotal);
      // Ganancia bruta: valor de venta (sin IGV) menos lo que costó ese lote exacto (gracias a FEFO se sabe cuál)
      const costoLinea = d.lote.costoUnitario.mul(d.cantidad);
      total = total.plus(subtotal);
      opGravada = opGravada.plus(valorVenta);
      costo = costo.plus(costoLinea);
      unidades += d.cantidad;
      ventas.add(d.ventaId);
      return {
        ventaId: d.ventaId,
        fecha: d.venta.fecha.toISOString(),
        dia: fechaEnLima(d.venta.fecha),
        vendedor: d.venta.usuario.nombre,
        producto: d.producto.nombre,
        presentacion: d.producto.presentacion,
        numeroLote: d.lote.numeroLote,
        cantidad: d.cantidad,
        precioUnitario: d.precioUnitario.toFixed(2),
        subtotal: subtotal.toFixed(2),
        valorVenta: valorVenta.toFixed(2),
        igv: igv.toFixed(2),
        costo: costoLinea.toFixed(2),
        ganancia: valorVenta.minus(costoLinea).toFixed(2),
      };
    });

    return {
      desde,
      hasta,
      resumen: {
        ventas: ventas.size,
        unidades,
        total: total.toFixed(2), // lo cobrado, con IGV
        opGravada: opGravada.toFixed(2), // lo cobrado sin IGV
        igv: total.minus(opGravada).toFixed(2), // lo que se paga a SUNAT
        costo: costo.toFixed(2),
        ganancia: opGravada.minus(costo).toFixed(2),
      },
      filas,
    };
  }
}
