// Lectura del Excel de inventario en el navegador (el archivo no se sube al servidor:
// solo viajan las filas ya convertidas). Este módulo se carga bajo demanda porque SheetJS pesa.
import * as XLSX from 'xlsx'

// Título de cada columna en la plantilla y otros nombres que también se aceptan,
// porque cada negocio arma su Excel a su manera.
const COLUMNAS = [
  { campo: 'nombre', titulo: 'Nombre', alias: ['producto', 'descripcion', 'nombre del producto'] },
  { campo: 'laboratorio', titulo: 'Laboratorio', alias: ['marca', 'fabricante'] },
  { campo: 'presentacion', titulo: 'Presentación', alias: [] },
  { campo: 'codigoBarras', titulo: 'Código de barras', alias: ['codigo', 'codigo barras', 'ean'] },
  { campo: 'precioVenta', titulo: 'Precio de venta', alias: ['precio', 'precio venta', 'pvp'] },
  { campo: 'stockMinimo', titulo: 'Stock mínimo', alias: ['minimo'] },
  { campo: 'numeroLote', titulo: 'Número de lote', alias: ['lote', 'numero lote', 'nro lote', 'n lote'] },
  {
    campo: 'fechaVencimiento',
    titulo: 'Fecha de vencimiento',
    alias: ['vencimiento', 'fecha vencimiento', 'vence', 'fecha de venc', 'f vencimiento'],
  },
  { campo: 'cantidad', titulo: 'Cantidad', alias: ['stock', 'unidades', 'existencia'] },
  {
    campo: 'costoUnitario',
    titulo: 'Costo unitario',
    alias: ['costo', 'costo unit', 'precio de compra', 'precio compra'],
  },
]

// "Fecha de Vencimiento " y "fecha_de_vencimiento" deben reconocerse como la misma columna
const simplificar = (titulo) =>
  String(titulo ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const dosDigitos = (n) => String(n).padStart(2, '0')

// Deja la fecha como AAAA-MM-DD sin pasar por zonas horarias.
// Excel guarda las fechas como un número de días; si la celda es texto se espera día/mes/año.
function aFecha(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  if (typeof valor === 'number') {
    const f = XLSX.SSF.parse_date_code(valor)
    return f ? `${f.y}-${dosDigitos(f.m)}-${dosDigitos(f.d)}` : String(valor)
  }
  const texto = String(valor).trim()
  const diaMesAnio = texto.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (diaMesAnio) return `${diaMesAnio[3]}-${dosDigitos(diaMesAnio[2])}-${dosDigitos(diaMesAnio[1])}`
  const anioMesDia = texto.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/)
  if (anioMesDia) return `${anioMesDia[1]}-${dosDigitos(anioMesDia[2])}-${dosDigitos(anioMesDia[3])}`
  // Si no se entiende, se envía tal cual y el servidor lo informa como error de esa fila
  return texto
}

function aCelda(valor) {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'number') return valor
  const texto = String(valor).trim()
  return texto === '' ? null : texto
}

export async function leerInventario(archivo) {
  let matriz
  try {
    const libro = XLSX.read(await archivo.arrayBuffer())
    const hoja = libro.Sheets[libro.SheetNames[0]]
    matriz = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: null })
  } catch {
    throw new Error('No se pudo leer el archivo. Debe ser un Excel (.xlsx).')
  }
  if (matriz.length === 0) throw new Error('El archivo está vacío.')

  // ¿En qué posición está cada columna conocida?
  const posicion = new Map()
  matriz[0].forEach((titulo, i) => {
    const simple = simplificar(titulo)
    const columna = COLUMNAS.find((c) => simplificar(c.titulo) === simple || c.alias.includes(simple))
    if (columna && !posicion.has(columna.campo)) posicion.set(columna.campo, i)
  })
  if (!posicion.has('nombre')) {
    throw new Error('No se encontró la columna "Nombre" en la primera fila. Usa la plantilla como guía.')
  }

  const filas = []
  const numeros = []
  matriz.slice(1).forEach((celdas, i) => {
    const leer = (campo) => (posicion.has(campo) ? celdas[posicion.get(campo)] : null)
    const fila = {
      nombre: aCelda(leer('nombre')),
      laboratorio: aCelda(leer('laboratorio')),
      presentacion: aCelda(leer('presentacion')),
      codigoBarras: aCelda(leer('codigoBarras')),
      precioVenta: aCelda(leer('precioVenta')),
      stockMinimo: aCelda(leer('stockMinimo')),
      numeroLote: aCelda(leer('numeroLote')),
      fechaVencimiento: aFecha(leer('fechaVencimiento')),
      cantidad: aCelda(leer('cantidad')),
      costoUnitario: aCelda(leer('costoUnitario')),
    }
    if (Object.values(fila).some((valor) => valor !== null)) {
      filas.push(fila)
      numeros.push(i + 2)
    }
  })
  if (filas.length === 0) throw new Error('El archivo no tiene filas con datos debajo de los encabezados.')
  return { filas, numeros }
}

export function descargarPlantilla() {
  const hoja = XLSX.utils.aoa_to_sheet([
    COLUMNAS.map((c) => c.titulo),
    [
      'Paracetamol 500 mg',
      'Genfar',
      'Caja x 100 tabletas',
      '7750000000014',
      0.2,
      200,
      'L2401',
      '30/06/2027',
      300,
      0.12,
    ],
    [
      'Paracetamol 500 mg',
      'Genfar',
      'Caja x 100 tabletas',
      '7750000000014',
      0.2,
      200,
      'L2455',
      '31/12/2027',
      500,
      0.12,
    ],
    ['Alcohol medicinal 70°', 'Alkofarma', 'Frasco 250 ml', '', 5, 20, 'A-118', '15/03/2028', 40, 3],
  ])
  hoja['!cols'] = [28, 16, 24, 18, 15, 13, 16, 20, 10, 14].map((ancho) => ({ wch: ancho }))

  const ayuda = XLSX.utils.aoa_to_sheet([
    ['Cómo llenar la hoja "Inventario"'],
    [],
    ['Escribe una fila por cada lote. Si un producto tiene varios lotes, repite sus datos en varias filas.'],
    ['Obligatorio: Nombre, Precio de venta, Número de lote, Fecha de vencimiento, Cantidad y Costo unitario.'],
    ['Opcional: Laboratorio, Presentación, Código de barras y Stock mínimo.'],
    ['Fecha de vencimiento: día/mes/año, por ejemplo 30/06/2027.'],
    ['Precio y costo: en soles, por unidad de venta.'],
    ['Borra las filas de ejemplo antes de importar.'],
  ])
  ayuda['!cols'] = [{ wch: 100 }]

  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Inventario')
  XLSX.utils.book_append_sheet(libro, ayuda, 'Instrucciones')
  XLSX.writeFile(libro, 'plantilla-inventario.xlsx')
}
