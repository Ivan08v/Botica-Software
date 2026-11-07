import { useState } from 'react'
import { api, mensajeDe } from '../api'
import { fecha, soles } from '../formato'
import { useSesion } from '../sesion.jsx'

const ESTADO = {
  VENCIDO: 'Vencido',
  DIAS_30: 'Vence en 30 días',
  DIAS_60: 'Vence en 60 días',
  DIAS_90: 'Vence en 90 días',
  VIGENTE: 'Vigente',
}

// Fecha de hoy en Perú como AAAA-MM-DD (el navegador puede estar en otra zona horaria)
const hoyEnLima = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())

export default function Reportes() {
  const { sesion } = useSesion()
  const negocio = sesion?.negocio.nombre ?? ''
  const hoy = hoyEnLima()
  const [dias, setDias] = useState(90)
  const [desde, setDesde] = useState(hoy.slice(0, 8) + '01')
  const [hasta, setHasta] = useState(hoy)
  // Qué botón está trabajando, para mostrar "Generando…" solo en ese
  const [ocupado, setOcupado] = useState('')
  const [aviso, setAviso] = useState(null)

  async function descargar(clave, obtener, formato) {
    setOcupado(clave + formato)
    setAviso(null)
    try {
      const reporte = await obtener()
      if (!reporte) return
      // Las librerías de Excel y PDF se descargan recién al generar el primer reporte
      const { generar } = await import('../archivos')
      generar(reporte, formato)
      setAviso({ tipo: 'exito', texto: `Se descargó "${reporte.titulo}" (${reporte.filas.length} filas).` })
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeDe(e) })
    } finally {
      setOcupado('')
    }
  }

  async function inventario(venceEnDias) {
    const ruta = venceEnDias === undefined ? '/reportes/inventario' : `/reportes/inventario?venceEnDias=${venceEnDias}`
    const datos = await api(ruta)
    if (datos.filas.length === 0) {
      setAviso({
        tipo: 'pendiente',
        texto:
          venceEnDias === undefined
            ? 'No hay lotes con stock.'
            : `No hay lotes que venzan en los próximos ${venceEnDias} días.`,
      })
      return null
    }
    const { vigente, vencido } = datos.resumen
    const porVencer = venceEnDias !== undefined
    return {
      titulo: porVencer ? `Lotes por vencer en ${venceEnDias} días` : 'Inventario valorizado',
      negocio,
      detalle: `Al ${fecha(datos.fecha)}`,
      resumen: porVencer
        ? [
            ['Lotes por vencer', String(vigente.lotes)],
            ['Dinero en riesgo (costo)', soles(vigente.valorCosto)],
            ['Lotes vencidos', String(vencido.lotes)],
            ['Pérdida por vencidos (costo)', soles(vencido.valorCosto)],
          ]
        : [
            ['Productos con stock', String(datos.resumen.productos)],
            ['Valor vigente al costo', soles(vigente.valorCosto)],
            ['Valor vigente a precio de venta', soles(vigente.valorVenta)],
            ['Vencido al costo', soles(vencido.valorCosto)],
          ],
      columnas: [
        { titulo: 'Producto', ancho: 32 },
        { titulo: 'Presentación', ancho: 22 },
        { titulo: 'Laboratorio', ancho: 16 },
        { titulo: 'Código de barras', ancho: 16 },
        { titulo: 'Lote', ancho: 12 },
        { titulo: 'Vencimiento', tipo: 'fecha', ancho: 12 },
        // Negativo si ya venció: así también se puede ordenar en Excel
        { titulo: 'Días para vencer', tipo: 'entero', ancho: 10 },
        { titulo: 'Estado', ancho: 17 },
        { titulo: 'Cantidad', tipo: 'entero' },
        { titulo: 'Costo unit.', tipo: 'soles' },
        { titulo: 'Valor al costo', tipo: 'soles', ancho: 14 },
        { titulo: 'Precio venta', tipo: 'soles' },
        { titulo: 'Valor de venta', tipo: 'soles', ancho: 14 },
      ],
      filas: datos.filas.map((f) => [
        f.producto,
        f.presentacion,
        f.laboratorio,
        f.codigoBarras,
        f.numeroLote,
        f.fechaVencimiento,
        f.diasRestantes,
        ESTADO[f.estado],
        f.cantidad,
        f.costoUnitario,
        f.valorCosto,
        f.precioVenta,
        f.valorVenta,
      ]),
      nombreArchivo: porVencer ? `por-vencer-${venceEnDias}-dias-${datos.fecha}` : `inventario-${datos.fecha}`,
    }
  }

  async function ventas() {
    const datos = await api(`/reportes/ventas?desde=${desde}&hasta=${hasta}`)
    if (datos.filas.length === 0) {
      setAviso({ tipo: 'pendiente', texto: 'No hubo ventas en ese período.' })
      return null
    }
    const r = datos.resumen
    const periodo = desde === hasta ? fecha(desde) : `${fecha(desde)} al ${fecha(hasta)}`
    return {
      titulo: 'Ventas por período',
      negocio,
      detalle: `Del ${periodo}`,
      resumen: [
        ['Ventas', String(r.ventas)],
        ['Unidades', String(r.unidades)],
        ['Total vendido', soles(r.total)],
        ['Costo', soles(r.costo)],
        ['Ganancia bruta', soles(r.ganancia)],
      ],
      columnas: [
        { titulo: 'Fecha', tipo: 'fecha', ancho: 12 },
        { titulo: 'Hora', ancho: 8 },
        { titulo: 'Venta', ancho: 8 },
        { titulo: 'Vendedor', ancho: 18 },
        { titulo: 'Producto', ancho: 32 },
        { titulo: 'Presentación', ancho: 22 },
        { titulo: 'Lote', ancho: 12 },
        { titulo: 'Cantidad', tipo: 'entero' },
        { titulo: 'Precio unit.', tipo: 'soles' },
        { titulo: 'Subtotal', tipo: 'soles' },
        { titulo: 'Costo', tipo: 'soles' },
        { titulo: 'Ganancia', tipo: 'soles' },
      ],
      filas: datos.filas.map((f) => [
        f.dia,
        new Date(f.fecha).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' }),
        `#${f.ventaId}`,
        f.vendedor,
        f.producto,
        f.presentacion,
        f.numeroLote,
        f.cantidad,
        f.precioUnitario,
        f.subtotal,
        f.costo,
        f.ganancia,
      ]),
      nombreArchivo: `ventas-${desde}-al-${hasta}`,
    }
  }

  // Par de botones Excel / PDF de cada reporte (una función, no un componente: no tiene estado propio)
  function botones(clave, obtener) {
    return (
      <div className="fila">
        {['excel', 'pdf'].map((formato) => (
          <button
            key={formato}
            type="button"
            className={formato === 'excel' ? 'boton' : 'boton secundario'}
            disabled={ocupado !== ''}
            onClick={() => descargar(clave, obtener, formato)}
          >
            {ocupado === clave + formato ? 'Generando…' : formato === 'excel' ? 'Descargar Excel' : 'Descargar PDF'}
          </button>
        ))}
      </div>
    )
  }

  return (
    <>
      {aviso && <p className={`aviso ${aviso.tipo}`}>{aviso.texto}</p>}

      <section className="tarjeta">
        <h2>Inventario valorizado</h2>
        <p className="tenue">
          Cada lote con stock, con su valor al costo y a precio de venta. Separa lo vigente de lo vencido.
        </p>
        {botones('inventario', () => inventario())}
      </section>

      <section className="tarjeta">
        <h2>Lotes por vencer</h2>
        <p className="tenue">Lo vencido y lo que vence pronto, ordenado por urgencia, con el dinero en riesgo.</p>
        <label>
          Vencen en los próximos
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            <option value={30}>30 días</option>
            <option value={60}>60 días</option>
            <option value={90}>90 días</option>
            <option value={180}>180 días</option>
          </select>
        </label>
        {botones('vencer', () => inventario(dias))}
      </section>

      <section className="tarjeta">
        <h2>Ventas por período</h2>
        <p className="tenue">Cada lote vendido, con su costo y la ganancia bruta. Hasta un año por reporte.</p>
        <div className="dos-columnas">
          <label>
            Desde
            <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label>
            Hasta
            <input type="date" value={hasta} min={desde} max={hoy} onChange={(e) => setHasta(e.target.value)} />
          </label>
        </div>
        {botones('ventas', ventas)}
      </section>
    </>
  )
}
