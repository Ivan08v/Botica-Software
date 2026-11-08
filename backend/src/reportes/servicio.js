import { fechaEnLima, hoyEnLima, inicioDelDiaEnLima } from "../common/fechas.js";
import { separarIgv } from "../common/igv.js";
import { solicitudIncorrecta } from "../errores.js";
import { diasRestantes, tramoDe } from "../panel/tramos.js";
import { Prisma, prisma } from "../prisma.js";

const MAXIMO_DIAS_VENTAS = 366;
const cero = () => new Prisma.Decimal(0);

// "2027-02-31" se convierte en marzo: si al volver a texto cambia, la fecha no existe
function fechaExiste(fecha) {
  const d = new Date(`${fecha}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

// Los reportes devuelven datos; el navegador los convierte en Excel o PDF.
// Así el mismo endpoint sirve para ambos formatos y el servidor no genera archivos.

// Inventario valorizado: un renglón por lote con stock, con su valor al costo y a precio de venta
export async function reporteInventario(negocioId, venceEnDias) {
  const hoy = hoyEnLima();
  let limite;
  if (venceEnDias !== undefined) {
    limite = new Date(hoy);
    limite.setUTCDate(limite.getUTCDate() + venceEnDias);
  }

  const lotes = await prisma.lote.findMany({
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
  const productos = new Set();

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

  const formato = (g) => ({ ...g, valorCosto: g.valorCosto.toFixed(2), valorVenta: g.valorVenta.toFixed(2) });
  return {
    fecha: hoy.toISOString().slice(0, 10),
    venceEnDias: venceEnDias ?? null,
    resumen: { productos: productos.size, vigente: formato(totales.vigente), vencido: formato(totales.vencido) },
    filas,
  };
}

// Ventas de un período (días del calendario de Perú, ambos incluidos), un renglón por lote vendido
export async function reporteVentas(negocioId, desde, hasta) {
  if (!fechaExiste(desde) || !fechaExiste(hasta)) {
    throw solicitudIncorrecta("Alguna de las fechas no existe");
  }
  if (hasta < desde) {
    throw solicitudIncorrecta("La fecha final no puede ser anterior a la inicial");
  }
  const inicio = inicioDelDiaEnLima(desde);
  const fin = inicioDelDiaEnLima(hasta);
  fin.setUTCDate(fin.getUTCDate() + 1);
  if ((fin.getTime() - inicio.getTime()) / 86_400_000 > MAXIMO_DIAS_VENTAS) {
    throw solicitudIncorrecta("El período no puede ser mayor a un año");
  }

  const detalles = await prisma.detalleVenta.findMany({
    where: { venta: { negocioId, fecha: { gte: inicio, lt: fin } } },
    include: {
      venta: {
        select: {
          fecha: true,
          serie: true,
          numero: true,
          medioPago: true,
          usuario: { select: { nombre: true } },
          cliente: { select: { nombre: true, tipoDocumento: true, documento: true } },
        },
      },
      producto: { select: { nombre: true, presentacion: true } },
      lote: { select: { numeroLote: true, costoUnitario: true } },
    },
    orderBy: [{ venta: { fecha: "asc" } }, { id: "asc" }],
  });

  let total = cero();
  let opGravada = cero();
  let costo = cero();
  let unidades = 0;
  const ventas = new Set();

  const filas = detalles.map((d) => {
    const subtotal = d.precioUnitario.mul(d.cantidad);
    // El IGV incluido en el precio no es de la botica (se paga a SUNAT): se quita antes de calcular
    // la ganancia. Se separa por línea, igual que al registrar la venta (src/common/igv.js).
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
      // Ventas antiguas cargadas directo a la base pueden no tener serie: entonces va null
      comprobante: d.venta.serie && d.venta.numero ? `${d.venta.serie}-${String(d.venta.numero).padStart(8, "0")}` : null,
      medioPago: d.venta.medioPago,
      cliente: d.venta.cliente?.nombre ?? null,
      documentoCliente: d.venta.cliente ? `${d.venta.cliente.tipoDocumento} ${d.venta.cliente.documento}` : null,
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

// Bajas de lotes vencidos en un período (días de Perú): qué se retiró, cómo y cuánto se perdió al costo
export async function reporteBajas(negocioId, desde, hasta) {
  if (!fechaExiste(desde) || !fechaExiste(hasta)) {
    throw solicitudIncorrecta("Alguna de las fechas no existe");
  }
  if (hasta < desde) {
    throw solicitudIncorrecta("La fecha final no puede ser anterior a la inicial");
  }
  const inicio = inicioDelDiaEnLima(desde);
  const fin = inicioDelDiaEnLima(hasta);
  fin.setUTCDate(fin.getUTCDate() + 1);
  if ((fin.getTime() - inicio.getTime()) / 86_400_000 > MAXIMO_DIAS_VENTAS) {
    throw solicitudIncorrecta("El período no puede ser mayor a un año");
  }

  const bajas = await prisma.movimiento.findMany({
    where: { negocioId, tipo: "BAJA_VENCIMIENTO", fecha: { gte: inicio, lt: fin } },
    include: {
      producto: { select: { nombre: true, presentacion: true, laboratorio: true } },
      lote: { select: { numeroLote: true, fechaVencimiento: true, costoUnitario: true } },
      usuario: { select: { nombre: true } },
    },
    orderBy: [{ fecha: "asc" }, { id: "asc" }],
  });

  let valorTotal = cero();
  let unidades = 0;
  const porDestino = { DESTRUCCION: cero(), DEVOLUCION_PROVEEDOR: cero() };

  const filas = bajas.map((b) => {
    const cantidad = -b.cantidad; // el movimiento guarda la salida en negativo
    const valor = b.lote.costoUnitario.mul(cantidad);
    valorTotal = valorTotal.plus(valor);
    unidades += cantidad;
    porDestino[b.destinoBaja] = porDestino[b.destinoBaja].plus(valor);
    return {
      fecha: b.fecha.toISOString(),
      dia: fechaEnLima(b.fecha),
      producto: b.producto.nombre,
      presentacion: b.producto.presentacion,
      laboratorio: b.producto.laboratorio,
      numeroLote: b.lote.numeroLote,
      fechaVencimiento: b.lote.fechaVencimiento.toISOString().slice(0, 10),
      cantidad,
      costoUnitario: b.lote.costoUnitario.toFixed(2),
      valor: valor.toFixed(2),
      destino: b.destinoBaja,
      observacion: b.motivo,
      usuario: b.usuario.nombre,
    };
  });

  return {
    desde,
    hasta,
    resumen: {
      lotes: filas.length,
      unidades,
      valor: valorTotal.toFixed(2),
      destruccion: porDestino.DESTRUCCION.toFixed(2),
      devolucionProveedor: porDestino.DEVOLUCION_PROVEEDOR.toFixed(2),
    },
    filas,
  };
}
