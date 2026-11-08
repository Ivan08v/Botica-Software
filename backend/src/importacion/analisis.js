// Validación de las filas de un Excel de inventario.
// Es una función pura: recibe las filas y lo que ya existe en el negocio, y devuelve qué
// pasaría con cada fila. La usan tanto la vista previa como la importación real, así
// lo que la persona ve antes de confirmar es exactamente lo que después se guarda.
//
// Cada fila cruda del Excel es un lote con los datos de su producto (cada celda puede ser
// texto, número o vacía): nombre, laboratorio, presentacion, codigoBarras, precioVenta,
// stockMinimo, numeroLote, fechaVencimiento, cantidad y costoUnitario.
//
// `existente` = { productos: [{ id, nombre, presentacion, codigoBarras }], lotes: Set de "productoId|NUMEROLOTE" }
//
// Cada fila analizada devuelve:
//   fila (número en el Excel; la 1 son los encabezados), estado ("OK" | "OMITIDA" | "ERROR"),
//   errores, avisos, nombre, numeroLote, claveProducto (identifica al producto dentro del archivo),
//   productoExistenteId, productoNuevo (si hay que crearlo) y lote (si hay que crearlo).

const texto = (valor) => (valor === null || valor === undefined ? "" : String(valor).trim());
const normalizar = (valor) => valor.toLowerCase().replace(/\s+/g, " ");
const claveLote = (numeroLote) => numeroLote.toUpperCase();

// Acepta "12.5", "12,5" y números; devuelve null si no es un número
function numero(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const limpio = texto(valor)
    .replace(/^s\/\.?\s*/i, "")
    .replace(",", ".");
  if (limpio === "" || !/^-?\d+(\.\d+)?$/.test(limpio)) return null;
  return Number(limpio);
}

// Excel guarda 0.3 como 0.30000000000000004: los montos se redondean a céntimos
const aCentimos = (monto) => Math.round(monto * 100) / 100;

function fechaValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  // "2027-02-31" se convierte en marzo: si al volver a texto cambia, la fecha no existe
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

// `hoy` en formato AAAA-MM-DD (fecha de Perú)
export function analizarFilas(crudas, existente, hoy) {
  const porCodigo = new Map();
  const porNombre = new Map();
  for (const p of existente.productos) {
    if (p.codigoBarras) porCodigo.set(p.codigoBarras, p);
    porNombre.set(`${normalizar(p.nombre)}|${normalizar(p.presentacion ?? "")}`, p);
  }

  // Lo que se va acumulando al recorrer el archivo
  const nuevosEnArchivo = new Map();
  const lotesEnArchivo = new Set();

  const filas = crudas.map((cruda, indice) => {
    const errores = [];
    const avisos = [];
    const nombre = texto(cruda.nombre);
    const laboratorio = texto(cruda.laboratorio);
    const presentacion = texto(cruda.presentacion);
    const codigoBarras = texto(cruda.codigoBarras).replace(/\s/g, "");
    const numeroLote = texto(cruda.numeroLote);

    const resultado = {
      fila: indice + 2,
      estado: "OK",
      errores,
      avisos,
      nombre,
      numeroLote,
      claveProducto: null,
      productoExistenteId: null,
      productoNuevo: null,
      lote: null,
    };

    // --- Producto ---
    if (!nombre) errores.push("Falta el nombre del producto");
    else if (nombre.length > 150) errores.push("El nombre supera los 150 caracteres");
    if (laboratorio.length > 100) errores.push("El laboratorio supera los 100 caracteres");
    if (presentacion.length > 100) errores.push("La presentación supera los 100 caracteres");
    if (codigoBarras && !/^\d{8,14}$/.test(codigoBarras)) {
      errores.push(`El código de barras "${codigoBarras}" debe tener entre 8 y 14 dígitos`);
    }

    // Un producto se reconoce por su código de barras; si no tiene, por nombre y presentación
    const claveNombre = `${normalizar(nombre)}|${normalizar(presentacion)}`;
    const yaExiste = (codigoBarras && porCodigo.get(codigoBarras)) || porNombre.get(claveNombre) || null;
    const clave = yaExiste
      ? `id:${yaExiste.id}`
      : codigoBarras
        ? `codigo:${codigoBarras}`
        : `nombre:${claveNombre}`;

    if (yaExiste) {
      if (normalizar(yaExiste.nombre) !== normalizar(nombre) && nombre) {
        avisos.push(
          `El código de barras ya pertenece a "${yaExiste.nombre}": el lote se agregará a ese producto`,
        );
      }
    } else if (!nuevosEnArchivo.has(clave)) {
      // Producto nuevo: aquí sí hacen falta sus datos
      const precio = numero(cruda.precioVenta);
      if (texto(cruda.precioVenta) === "") errores.push("Falta el precio de venta");
      else if (precio === null || precio <= 0)
        errores.push("El precio de venta debe ser un número mayor que cero");

      let stockMinimo = 0;
      if (texto(cruda.stockMinimo) !== "") {
        const minimo = numero(cruda.stockMinimo);
        if (minimo === null || !Number.isInteger(minimo) || minimo < 0) {
          errores.push("El stock mínimo debe ser un número entero, cero o mayor");
        } else {
          stockMinimo = minimo;
        }
      }

      if (errores.length === 0) {
        resultado.productoNuevo = {
          nombre,
          laboratorio: laboratorio || null,
          presentacion: presentacion || null,
          codigoBarras: codigoBarras || null,
          precioVenta: aCentimos(precio),
          stockMinimo,
        };
      }
    }

    // --- Lote ---
    const fechaTexto = texto(cruda.fechaVencimiento);
    const camposLote = [numeroLote, fechaTexto, texto(cruda.cantidad), texto(cruda.costoUnitario)];
    const tieneLote = camposLote.some((campo) => campo !== "");
    let lote = null;

    if (tieneLote) {
      const cantidad = numero(cruda.cantidad);
      const costo = numero(cruda.costoUnitario);

      if (!numeroLote) errores.push("Falta el número de lote");
      else if (numeroLote.length > 50) errores.push("El número de lote supera los 50 caracteres");

      if (!fechaTexto) errores.push("Falta la fecha de vencimiento");
      else if (!fechaValida(fechaTexto)) {
        errores.push(`La fecha de vencimiento "${fechaTexto}" no es válida (usa día/mes/año)`);
      } else if (fechaTexto < hoy) {
        // No es un error: en el inventario inicial puede haber mercadería vencida sin retirar
        avisos.push("Este lote ya está vencido: se registrará, pero no se podrá vender");
      }

      if (texto(cruda.cantidad) === "") errores.push("Falta la cantidad");
      else if (cantidad === null || !Number.isInteger(cantidad) || cantidad < 1) {
        errores.push("La cantidad debe ser un número entero mayor que cero");
      }

      if (texto(cruda.costoUnitario) === "") errores.push("Falta el costo unitario");
      else if (costo === null || costo < 0)
        errores.push("El costo unitario debe ser un número, cero o mayor");

      if (errores.length === 0) {
        lote = {
          numeroLote,
          fechaVencimiento: fechaTexto,
          cantidad: cantidad,
          costoUnitario: aCentimos(costo),
        };
      }
    }

    if (errores.length > 0) {
      resultado.estado = "ERROR";
      resultado.productoNuevo = null;
      return resultado;
    }

    resultado.claveProducto = clave;
    resultado.productoExistenteId = yaExiste?.id ?? null;

    if (lote) {
      const claveEnArchivo = `${clave}|${claveLote(lote.numeroLote)}`;
      if (lotesEnArchivo.has(claveEnArchivo)) {
        resultado.estado = "ERROR";
        errores.push(`El lote "${lote.numeroLote}" está repetido en el archivo para este producto`);
        resultado.productoNuevo = null;
        return resultado;
      }
      if (yaExiste && existente.lotes.has(`${yaExiste.id}|${claveLote(lote.numeroLote)}`)) {
        // Volver a subir el mismo archivo no duplica nada
        resultado.estado = "OMITIDA";
        avisos.push("Este lote ya estaba registrado");
        return resultado;
      }
      lotesEnArchivo.add(claveEnArchivo);
      resultado.lote = lote;
    } else if (yaExiste || nuevosEnArchivo.has(clave)) {
      resultado.estado = "OMITIDA";
      avisos.push("El producto ya existe y la fila no trae un lote");
      resultado.productoNuevo = null;
      return resultado;
    }

    if (resultado.productoNuevo) nuevosEnArchivo.set(clave, resultado.productoNuevo);
    return resultado;
  });

  const correctas = filas.filter((f) => f.estado === "OK");
  return {
    filas,
    resumen: {
      total: filas.length,
      correctas: correctas.length,
      omitidas: filas.filter((f) => f.estado === "OMITIDA").length,
      conError: filas.filter((f) => f.estado === "ERROR").length,
      productosNuevos: correctas.filter((f) => f.productoNuevo).length,
      lotesNuevos: correctas.filter((f) => f.lote).length,
      unidades: correctas.reduce((suma, f) => suma + (f.lote?.cantidad ?? 0), 0),
    },
  };
}
