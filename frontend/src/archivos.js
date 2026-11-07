// Genera los reportes como Excel (SheetJS) o PDF (jsPDF) en el navegador, a partir de los
// datos que entrega la API. Se carga bajo demanda porque las librerías pesan.
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

// Un reporte es un objeto { titulo, negocio, detalle, resumen, columnas, filas, nombreArchivo }:
// - detalle: líneas bajo el título, por ejemplo el período o la fecha de corte
// - resumen: pares [etiqueta, valor]
// - columnas: { titulo, tipo, ancho }, donde tipo es 'texto' | 'entero' | 'soles' | 'fecha' y decide
//   el formato en Excel y la alineación en el PDF; ancho va en caracteres, para Excel
// - filas: arreglos de texto, número o null, en el orden de las columnas
// - nombreArchivo: sin extensión

// "2027-03-15" -> número de días que usa Excel para las fechas, sin pasar por zonas horarias
function fechaExcel(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return (Date.UTC(anio, mes - 1, dia) - Date.UTC(1899, 11, 30)) / 86_400_000
}

const fechaTexto = (fecha) => fecha.split('-').reverse().join('/')
const soles = (valor) => valor.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function generar(reporte, formato) {
  if (formato === 'excel') generarExcel(reporte)
  else generarPdf(reporte)
}

function generarExcel(r) {
  const encabezado = [[r.titulo], [r.negocio], [r.detalle], [], ...r.resumen, []]
  const inicioTabla = encabezado.length
  const hoja = XLSX.utils.aoa_to_sheet([...encabezado, r.columnas.map((c) => c.titulo)])

  // Los montos y las fechas se guardan como números de verdad: así se pueden sumar,
  // filtrar y ordenar en Excel, y solo se les da formato para mostrarlos
  r.filas.forEach((fila, i) => {
    fila.forEach((valor, j) => {
      if (valor === null || valor === '') return
      const tipo = r.columnas[j].tipo ?? 'texto'
      const celda = XLSX.utils.encode_cell({ r: inicioTabla + 1 + i, c: j })
      if (tipo === 'soles') hoja[celda] = { t: 'n', v: Number(valor), z: '#,##0.00' }
      else if (tipo === 'entero') hoja[celda] = { t: 'n', v: Number(valor), z: '0' }
      else if (tipo === 'fecha') hoja[celda] = { t: 'n', v: fechaExcel(String(valor)), z: 'dd/mm/yyyy' }
      else hoja[celda] = { t: 's', v: String(valor) }
    })
  })
  hoja['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: inicioTabla + r.filas.length, c: Math.max(r.columnas.length - 1, 1) },
  })
  hoja['!cols'] = r.columnas.map((c) => ({ wch: c.ancho ?? Math.max(c.titulo.length + 2, 12) }))
  // Filtros en la fila de encabezados de la tabla
  hoja['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: inicioTabla, c: 0 },
      e: { r: inicioTabla + r.filas.length, c: r.columnas.length - 1 },
    }),
  }

  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Reporte')
  XLSX.writeFile(libro, `${r.nombreArchivo}.xlsx`)
}

function generarPdf(r) {
  // compress: sin esto el PDF pesa varias veces más (el texto va sin comprimir)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  const margen = 12

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(r.titulo, margen, 16)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(90)
  doc.text(`${r.negocio} · ${r.detalle}`, margen, 22)

  // Resumen en una sola línea de pares "etiqueta: valor"
  doc.setTextColor(20)
  doc.text(r.resumen.map(([etiqueta, valor]) => `${etiqueta}: ${valor}`).join('    '), margen, 29, {
    maxWidth: 297 - margen * 2,
  })

  const alinear = (c) => (c.tipo === 'soles' || c.tipo === 'entero' ? 'right' : 'left')
  autoTable(doc, {
    startY: 35,
    margin: { left: margen, right: margen, bottom: 14 },
    head: [r.columnas.map((c) => c.titulo)],
    body: r.filas.map((fila) =>
      fila.map((valor, j) => {
        if (valor === null || valor === '') return ''
        const tipo = r.columnas[j].tipo
        if (tipo === 'soles') return soles(Number(valor))
        if (tipo === 'fecha') return fechaTexto(String(valor))
        return String(valor)
      }),
    ),
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: [15, 118, 110], textColor: 255 },
    alternateRowStyles: { fillColor: [243, 245, 244] },
    columnStyles: Object.fromEntries(r.columnas.map((c, j) => [j, { halign: alinear(c) }])),
  })

  // Pie con número de página, una vez que se sabe cuántas páginas hay
  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(`Página ${i} de ${paginas}`, 297 - margen, 210 - 6, { align: 'right' })
  }
  doc.save(`${r.nombreArchivo}.pdf`)
}
