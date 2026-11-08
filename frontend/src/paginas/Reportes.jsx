import { useEffect, useState } from 'react'
import { api, mensajeDe } from '../api'
import Icono from '../componentes/Icono.jsx'
import { fecha, soles } from '../formato'
import { useSesion } from '../sesion.jsx'

const ESTADO = {
  VENCIDO: 'Vencido',
  DIAS_30: 'Vence en 30 días',
  DIAS_60: 'Vence en 60 días',
  DIAS_90: 'Vence en 90 días',
  VIGENTE: 'Vigente',
}

const MEDIO_PAGO = { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', YAPE: 'Yape', PLIN: 'Plin', TRANSFERENCIA: 'Transferencia' }

const FILTROS_INVENTARIO = {
  todos: 'Todos los lotes',
  vigentes: 'Solo lotes vigentes',
  vencidos: 'Solo vencidos',
}

// Fecha de hoy en Perú como AAAA-MM-DD (el navegador puede estar en otra zona horaria)
const hoyEnLima = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
const horaEnLima = (iso) =>
  new Date(iso).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })

function textoDias(dias) {
  if (dias < 0) return `Venció hace ${-dias} ${dias === -1 ? 'día' : 'días'}`
  if (dias === 0) return 'Vence hoy'
  return `${dias} ${dias === 1 ? 'día' : 'días'}`
}

// Color de la etiqueta de días: rojo si venció o vence en 30 días, ámbar hasta 60, gris después
const tonoDias = (dias) => (dias <= 30 ? 'tono-rojo' : dias <= 60 ? 'tono-ambar' : '')

// Carga los datos de un reporte cada vez que cambia su ruta (filtros). `null` mientras carga.
function useDatos(ruta) {
  const [estado, setEstado] = useState({ ruta: null, datos: null, error: '' })
  useEffect(() => {
    if (!ruta) return
    let vigente = true
    api(ruta)
      .then((datos) => vigente && setEstado({ ruta, datos, error: '' }))
      .catch((e) => vigente && setEstado({ ruta, datos: null, error: mensajeDe(e) }))
    return () => {
      vigente = false
    }
  }, [ruta])
  // Si los datos son de otra ruta (el filtro cambió), todavía está cargando
  return estado.ruta === ruta ? estado : { datos: null, error: '' }
}

// ---- Reportes listos para Excel / PDF (los mismos datos que se ven en la vista previa) ----

function reporteInventario(datos, filtro, negocio) {
  const filas = datos.filas.filter((f) =>
    filtro === 'vigentes' ? f.estado !== 'VENCIDO' : filtro === 'vencidos' ? f.estado === 'VENCIDO' : true,
  )
  const { vigente, vencido } = datos.resumen
  return {
    titulo: filtro === 'todos' ? 'Inventario valorizado' : `Inventario valorizado: ${FILTROS_INVENTARIO[filtro].toLowerCase()}`,
    negocio,
    detalle: `Al ${fecha(datos.fecha)}`,
    resumen: [
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
    filas: filas.map((f) => [
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
    nombreArchivo: `inventario-${filtro}-${datos.fecha}`,
    filasOriginales: filas,
  }
}

function reportePorVencer(datos, dias, negocio) {
  const { vigente, vencido } = datos.resumen
  return {
    titulo: `Lotes por vencer en ${dias} días`,
    negocio,
    detalle: `Al ${fecha(datos.fecha)}`,
    resumen: [
      ['Lotes por vencer', String(vigente.lotes)],
      ['Dinero en riesgo (costo)', soles(vigente.valorCosto)],
      ['Lotes vencidos', String(vencido.lotes)],
      ['Pérdida por vencidos (costo)', soles(vencido.valorCosto)],
    ],
    columnas: [
      { titulo: 'Producto', ancho: 32 },
      { titulo: 'Presentación', ancho: 22 },
      { titulo: 'Laboratorio', ancho: 16 },
      { titulo: 'Lote', ancho: 12 },
      { titulo: 'Vencimiento', tipo: 'fecha', ancho: 12 },
      { titulo: 'Días para vencer', tipo: 'entero', ancho: 10 },
      { titulo: 'Estado', ancho: 17 },
      { titulo: 'Cantidad', tipo: 'entero' },
      { titulo: 'Valor al costo', tipo: 'soles', ancho: 14 },
    ],
    filas: datos.filas.map((f) => [
      f.producto,
      f.presentacion,
      f.laboratorio,
      f.numeroLote,
      f.fechaVencimiento,
      f.diasRestantes,
      ESTADO[f.estado],
      f.cantidad,
      f.valorCosto,
    ]),
    nombreArchivo: `por-vencer-${dias}-dias-${datos.fecha}`,
    filasOriginales: datos.filas,
  }
}

function reporteVentas(datos, desde, hasta, negocio) {
  const r = datos.resumen
  const periodo = desde === hasta ? fecha(desde) : `${fecha(desde)} al ${fecha(hasta)}`
  return {
    titulo: 'Ventas por período',
    negocio,
    detalle: `Del ${periodo}`,
    resumen: [
      ['Ventas', String(r.ventas)],
      ['Unidades', String(r.unidades)],
      ['Total cobrado (con IGV)', soles(r.total)],
      ['IGV a pagar a SUNAT (18 %)', soles(r.igv)],
      ['Venta sin IGV', soles(r.opGravada)],
      ['Costo', soles(r.costo)],
      // Sin el IGV: ese dinero se cobra al cliente pero no es de la botica
      ['Ganancia bruta (sin IGV)', soles(r.ganancia)],
    ],
    columnas: [
      { titulo: 'Fecha', tipo: 'fecha', ancho: 12 },
      { titulo: 'Hora', ancho: 8 },
      { titulo: 'Comprobante', ancho: 15 },
      { titulo: 'Cliente', ancho: 24 },
      { titulo: 'Documento', ancho: 15 },
      { titulo: 'Medio de pago', ancho: 13 },
      { titulo: 'Vendedor', ancho: 18 },
      { titulo: 'Producto', ancho: 32 },
      { titulo: 'Lote', ancho: 12 },
      { titulo: 'Cantidad', tipo: 'entero' },
      { titulo: 'Precio unit.', tipo: 'soles' },
      { titulo: 'Subtotal', tipo: 'soles' },
      { titulo: 'Valor venta', tipo: 'soles' },
      { titulo: 'IGV', tipo: 'soles' },
      { titulo: 'Costo', tipo: 'soles' },
      { titulo: 'Ganancia', tipo: 'soles' },
    ],
    filas: datos.filas.map((f) => [
      f.dia,
      horaEnLima(f.fecha),
      f.comprobante ?? `Venta #${f.ventaId}`,
      f.cliente ?? 'Cliente varios',
      f.documentoCliente,
      MEDIO_PAGO[f.medioPago] ?? f.medioPago,
      f.vendedor,
      f.producto,
      f.numeroLote,
      f.cantidad,
      f.precioUnitario,
      f.subtotal,
      f.valorVenta,
      f.igv,
      f.costo,
      f.ganancia,
    ]),
    nombreArchivo: `ventas-${desde}-al-${hasta}`,
    filasOriginales: datos.filas,
  }
}

const DESTINO = { DESTRUCCION: 'Destrucción', DEVOLUCION_PROVEEDOR: 'Devolución al proveedor' }

function reporteBajas(datos, desde, hasta, negocio) {
  const r = datos.resumen
  const periodo = desde === hasta ? fecha(desde) : `${fecha(desde)} al ${fecha(hasta)}`
  return {
    titulo: 'Bajas por vencimiento',
    negocio,
    detalle: `Del ${periodo}`,
    resumen: [
      ['Lotes dados de baja', String(r.lotes)],
      ['Unidades retiradas', String(r.unidades)],
      ['Pérdida total al costo', soles(r.valor)],
      ['Por destrucción', soles(r.destruccion)],
      ['Por devolución al proveedor', soles(r.devolucionProveedor)],
    ],
    columnas: [
      { titulo: 'Fecha de baja', tipo: 'fecha', ancho: 12 },
      { titulo: 'Producto', ancho: 32 },
      { titulo: 'Presentación', ancho: 22 },
      { titulo: 'Laboratorio', ancho: 16 },
      { titulo: 'Lote', ancho: 12 },
      { titulo: 'Venció', tipo: 'fecha', ancho: 12 },
      { titulo: 'Cantidad', tipo: 'entero' },
      { titulo: 'Costo unit.', tipo: 'soles' },
      { titulo: 'Pérdida', tipo: 'soles' },
      { titulo: 'Destino', ancho: 22 },
      { titulo: 'Observación', ancho: 34 },
      { titulo: 'Registró', ancho: 18 },
    ],
    filas: datos.filas.map((f) => [
      f.dia,
      f.producto,
      f.presentacion,
      f.laboratorio,
      f.numeroLote,
      f.fechaVencimiento,
      f.cantidad,
      f.costoUnitario,
      f.valor,
      DESTINO[f.destino],
      f.observacion,
      f.usuario,
    ]),
    nombreArchivo: `bajas-${desde}-al-${hasta}`,
    filasOriginales: datos.filas,
  }
}

// Las filas del reporte de ventas son por lote vendido; la vista previa las junta por venta
function ventasAgrupadas(filas) {
  const porVenta = new Map()
  for (const f of filas) {
    const venta = porVenta.get(f.ventaId) ?? { ...f, base: 0, igvTotal: 0, totalVenta: 0 }
    venta.base += Number(f.valorVenta)
    venta.igvTotal += Number(f.igv)
    venta.totalVenta += Number(f.subtotal)
    porVenta.set(f.ventaId, venta)
  }
  return [...porVenta.values()]
}

// ---- Piezas de la pantalla ----

// Botones de descarga de un reporte
function Descargas({ reporte, alDescargar, ocupado }) {
  const listo = reporte && reporte.filas.length > 0
  return (
    <div className="reporte-descargas">
      <button
        type="button"
        className="boton-excel con-icono"
        disabled={!listo || ocupado !== ''}
        onClick={() => alDescargar(reporte, 'excel')}
      >
        <Icono nombre="download" />
        {ocupado === 'excel' ? 'Generando…' : 'Descargar Excel (.xlsx)'}
      </button>
      <button
        type="button"
        className="boton-pdf con-icono"
        disabled={!listo || ocupado !== ''}
        onClick={() => alDescargar(reporte, 'pdf')}
      >
        <Icono nombre="picture_as_pdf" />
        {ocupado === 'pdf' ? 'Generando…' : 'Descargar PDF'}
      </button>
    </div>
  )
}

// Recuadro "Vista previa de exportación" con las primeras filas de lo que se va a descargar
function VistaPrevia({ tono, cargando, error, vacio, total, nombre, nota, encabezados, children }) {
  return (
    <div className="vista-previa">
      <div className="vista-previa-cabecera">
        <span className="con-icono">
          <span className={`vista-previa-icono ${tono}`}>
            <Icono nombre="visibility" />
          </span>
          <strong>Vista previa de exportación</strong>
          {!cargando && !error && !vacio && (
            <span className="chip">
              Primeras {Math.min(3, total)} de {total} {nombre}
            </span>
          )}
        </span>
        <span className="tenue">{nota}</span>
      </div>
      {error ? (
        <p className="aviso error">{error}</p>
      ) : cargando ? (
        <p className="tenue vista-previa-vacia">Cargando…</p>
      ) : vacio ? (
        <p className="tenue vista-previa-vacia">{vacio}</p>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla-vista-previa">
            <thead>
              <tr>
                {encabezados.map(([titulo, clase]) => (
                  <th key={titulo} className={clase}>
                    {titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TarjetaReporte({ tono, icono, titulo, descripcion, filtros, descargas, children }) {
  return (
    <section className={`tarjeta tarjeta-reporte tono-${tono}`}>
      <div className="tarjeta-reporte-cuerpo">
        <div className="tarjeta-reporte-info">
          <span className="reporte-icono">
            <Icono nombre={icono} />
          </span>
          <div>
            <h3>{titulo}</h3>
            <p className="tenue">{descripcion}</p>
            <div className="reporte-filtros">{filtros}</div>
          </div>
        </div>
        {descargas}
      </div>
      {children}
    </section>
  )
}

export default function Reportes() {
  const { sesion } = useSesion()
  const negocio = sesion?.negocio.nombre ?? ''
  const hoy = hoyEnLima()
  const [filtroInventario, setFiltroInventario] = useState('todos')
  const [dias, setDias] = useState(90)
  const [desde, setDesde] = useState(hoy.slice(0, 8) + '01')
  const [hasta, setHasta] = useState(hoy)
  const [desdeBajas, setDesdeBajas] = useState(hoy.slice(0, 8) + '01')
  const [hastaBajas, setHastaBajas] = useState(hoy)
  // Qué botón está trabajando (ej. "ventas-excel"), para mostrar "Generando…" solo en ese
  const [ocupado, setOcupado] = useState('')
  const [aviso, setAviso] = useState(null)

  const inventario = useDatos('/reportes/inventario')
  const porVencer = useDatos(`/reportes/inventario?venceEnDias=${dias}`)
  // Solo se piden las ventas si el período es válido (desde no puede ser posterior a hasta)
  const ventas = useDatos(desde && hasta && desde <= hasta ? `/reportes/ventas?desde=${desde}&hasta=${hasta}` : null)

  const repInventario = inventario.datos && reporteInventario(inventario.datos, filtroInventario, negocio)
  const repPorVencer = porVencer.datos && reportePorVencer(porVencer.datos, dias, negocio)
  const repVentas = ventas.datos && reporteVentas(ventas.datos, desde, hasta, negocio)
  const periodoBajasValido = desdeBajas && hastaBajas && desdeBajas <= hastaBajas
  const bajas = useDatos(periodoBajasValido ? `/reportes/bajas?desde=${desdeBajas}&hasta=${hastaBajas}` : null)
  const repBajas = bajas.datos && reporteBajas(bajas.datos, desdeBajas, hastaBajas, negocio)
  const ventasVista = repVentas ? ventasAgrupadas(repVentas.filasOriginales) : []

  async function descargar(clave, reporte, formato) {
    setOcupado(`${clave}-${formato}`)
    setAviso(null)
    try {
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

  const ocupadoEn = (clave) => (ocupado.startsWith(clave + '-') ? ocupado.slice(clave.length + 1) : ocupado ? '-' : '')

  return (
    <div className="reportes">
      <header className="reportes-cabecera">
        <div>
          <h2>Reportes disponibles</h2>
          <p className="tenue">Elige los filtros, revisa la vista previa y descarga el informe en Excel o PDF.</p>
        </div>
        <span className="tenue">Se generan al momento con los datos de tu negocio</span>
      </header>

      {aviso && <p className={`aviso ${aviso.tipo}`}>{aviso.texto}</p>}

      <TarjetaReporte
        tono="azul"
        icono="inventory_2"
        titulo="Inventario valorizado"
        descripcion="Cada lote con stock, con su costo y su precio de venta. Separa el stock vigente de los lotes vencidos."
        filtros={
          <label className="filtro-en-linea">
            Estado del stock:
            <select value={filtroInventario} onChange={(e) => setFiltroInventario(e.target.value)}>
              {Object.entries(FILTROS_INVENTARIO).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </select>
          </label>
        }
        descargas={
          <Descargas
            reporte={repInventario}
            ocupado={ocupadoEn('inventario')}
            alDescargar={(r, f) => descargar('inventario', r, f)}
          />
        }
      >
        <VistaPrevia
          tono="tono-azul"
          cargando={!inventario.datos && !inventario.error}
          error={inventario.error}
          vacio={repInventario?.filas.length === 0 && 'No hay lotes con este filtro.'}
          total={repInventario?.filas.length ?? 0}
          nombre="lotes"
          nota={`Al ${inventario.datos ? fecha(inventario.datos.fecha) : '…'}`}
          encabezados={[
            ['Código'],
            ['Producto'],
            ['Lote'],
            ['Vence'],
            ['Stock', 'num'],
            ['Costo unit.', 'num'],
            ['Valor total', 'num'],
            ['Estado', 'centro'],
          ]}
        >
          {repInventario?.filasOriginales.slice(0, 3).map((f) => (
            <tr key={`${f.producto}-${f.numeroLote}`}>
              <td className="codigo-celda">{f.codigoBarras ?? '—'}</td>
              <td className="producto">
                <strong>{f.producto}</strong>
                <span className="tenue">{f.presentacion}</span>
              </td>
              <td className="codigo-celda">{f.numeroLote}</td>
              <td className={f.estado === 'VENCIDO' ? 'texto-error' : ''}>{fecha(f.fechaVencimiento)}</td>
              <td className="num">{f.cantidad} und</td>
              <td className="num tenue">{soles(f.costoUnitario)}</td>
              <td className="num">
                <strong>{soles(f.valorCosto)}</strong>
              </td>
              <td className="centro">
                <span className={`chip ${f.estado === 'VENCIDO' ? 'tono-rojo' : 'tono-verde'}`}>
                  {f.estado === 'VENCIDO' ? 'Vencido' : 'Vigente'}
                </span>
              </td>
            </tr>
          ))}
        </VistaPrevia>
      </TarjetaReporte>

      <TarjetaReporte
        tono="ambar"
        icono="schedule"
        titulo="Lotes por vencer"
        descripcion="Lo vencido y lo que vence pronto, ordenado por urgencia, para venderlo primero, pedir un canje o devolverlo al proveedor."
        filtros={
          <label className="filtro-en-linea">
            Vencen en los próximos:
            <select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
              <option value={30}>30 días (crítico)</option>
              <option value={60}>60 días (atención)</option>
              <option value={90}>90 días (recomendado)</option>
              <option value={180}>180 días (semestre)</option>
            </select>
          </label>
        }
        descargas={
          <Descargas
            reporte={repPorVencer}
            ocupado={ocupadoEn('vencer')}
            alDescargar={(r, f) => descargar('vencer', r, f)}
          />
        }
      >
        <VistaPrevia
          tono="tono-ambar"
          cargando={!porVencer.datos && !porVencer.error}
          error={porVencer.error}
          vacio={repPorVencer?.filas.length === 0 && `No hay lotes que venzan en los próximos ${dias} días.`}
          total={repPorVencer?.filas.length ?? 0}
          nombre="lotes"
          nota={`Filtro: ${dias} días`}
          encabezados={[
            ['Medicamento / presentación'],
            ['Lote'],
            ['Laboratorio'],
            ['Vencimiento'],
            ['Días restantes', 'centro'],
            ['Stock', 'num'],
          ]}
        >
          {repPorVencer?.filasOriginales.slice(0, 3).map((f) => (
            <tr key={`${f.producto}-${f.numeroLote}`}>
              <td className="producto">
                <strong>{f.producto}</strong>
                <span className="tenue">{f.presentacion}</span>
              </td>
              <td className="codigo-celda">{f.numeroLote}</td>
              <td className="tenue">{f.laboratorio ?? '—'}</td>
              <td className={f.diasRestantes <= 30 ? 'texto-error' : ''}>{fecha(f.fechaVencimiento)}</td>
              <td className="centro">
                <span className={`chip ${tonoDias(f.diasRestantes)}`}>{textoDias(f.diasRestantes)}</span>
              </td>
              <td className="num">
                <strong>{f.cantidad} und</strong>
              </td>
            </tr>
          ))}
        </VistaPrevia>
      </TarjetaReporte>

      <TarjetaReporte
        tono="indigo"
        icono="bar_chart"
        titulo="Ventas por período"
        descripcion="Cada venta con su comprobante, cliente y medio de pago, el IGV separado, el costo y la ganancia bruta sin IGV. Hasta un año por reporte."
        filtros={
          <>
            <label className="filtro-en-linea">
              Desde:
              <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
            </label>
            <label className="filtro-en-linea">
              Hasta:
              <input type="date" value={hasta} min={desde} max={hoy} onChange={(e) => setHasta(e.target.value)} />
            </label>
          </>
        }
        descargas={
          <Descargas
            reporte={repVentas}
            ocupado={ocupadoEn('ventas')}
            alDescargar={(r, f) => descargar('ventas', r, f)}
          />
        }
      >
        <VistaPrevia
          tono="tono-indigo"
          cargando={!!(desde <= hasta) && !ventas.datos && !ventas.error}
          error={desde > hasta ? 'La fecha inicial no puede ser posterior a la final.' : ventas.error}
          vacio={ventasVista.length === 0 && 'No hubo ventas en ese período.'}
          total={ventasVista.length}
          nombre="ventas"
          nota={`Rango: ${fecha(desde)} – ${fecha(hasta)}`}
          encabezados={[
            ['Fecha / hora'],
            ['Comprobante'],
            ['Cliente / documento'],
            ['Medio de pago'],
            ['Base imp.', 'num'],
            ['IGV (18 %)', 'num'],
            ['Total venta', 'num'],
          ]}
        >
          {ventasVista.slice(0, 3).map((v) => (
            <tr key={v.ventaId}>
              <td className="tenue">
                {fecha(v.dia)} {horaEnLima(v.fecha)}
              </td>
              <td className="codigo-celda">
                <strong>{v.comprobante ?? `Venta #${v.ventaId}`}</strong>
              </td>
              <td>
                {v.cliente ?? 'Cliente varios'}
                {v.documentoCliente && <span className="tenue"> ({v.documentoCliente})</span>}
              </td>
              <td>
                <span className="chip">{MEDIO_PAGO[v.medioPago] ?? v.medioPago}</span>
              </td>
              <td className="num tenue">{soles(v.base)}</td>
              <td className="num tenue">{soles(v.igvTotal)}</td>
              <td className="num">
                <strong>{soles(v.totalVenta)}</strong>
              </td>
            </tr>
          ))}
        </VistaPrevia>
      </TarjetaReporte>

      <TarjetaReporte
        tono="rojo"
        icono="delete_sweep"
        titulo="Bajas por vencimiento"
        descripcion="Los lotes vencidos que se retiraron del inventario: si se destruyeron o se devolvieron al proveedor, con su acta u observación y la pérdida al costo."
        filtros={
          <>
            <label className="filtro-en-linea">
              Desde:
              <input
                type="date"
                value={desdeBajas}
                max={hastaBajas}
                onChange={(e) => setDesdeBajas(e.target.value)}
              />
            </label>
            <label className="filtro-en-linea">
              Hasta:
              <input
                type="date"
                value={hastaBajas}
                min={desdeBajas}
                max={hoy}
                onChange={(e) => setHastaBajas(e.target.value)}
              />
            </label>
          </>
        }
        descargas={
          <Descargas reporte={repBajas} ocupado={ocupadoEn('bajas')} alDescargar={(r, f) => descargar('bajas', r, f)} />
        }
      >
        <VistaPrevia
          tono="tono-rojo"
          cargando={!!periodoBajasValido && !bajas.datos && !bajas.error}
          error={periodoBajasValido ? bajas.error : 'La fecha inicial no puede ser posterior a la final.'}
          vacio={
            repBajas?.filas.length === 0 &&
            'No se dio de baja ningún lote en ese período. Los vencidos se dan de baja desde el Panel de control.'
          }
          total={repBajas?.filas.length ?? 0}
          nombre="bajas"
          nota={repBajas && repBajas.filas.length > 0 ? `Pérdida total: ${soles(bajas.datos.resumen.valor)}` : ''}
          encabezados={[
            ['Fecha'],
            ['Producto'],
            ['Lote'],
            ['Cantidad', 'num'],
            ['Pérdida', 'num'],
            ['Destino', 'centro'],
            ['Observación'],
          ]}
        >
          {repBajas?.filasOriginales.slice(0, 3).map((f) => (
            <tr key={`${f.fecha}-${f.numeroLote}`}>
              <td className="tenue">{fecha(f.dia)}</td>
              <td className="producto">
                <strong>{f.producto}</strong>
                <span className="tenue">{f.presentacion}</span>
              </td>
              <td className="codigo-celda">{f.numeroLote}</td>
              <td className="num">{f.cantidad} und</td>
              <td className="num">
                <strong>{soles(f.valor)}</strong>
              </td>
              <td className="centro">
                <span className={`chip ${f.destino === 'DESTRUCCION' ? 'tono-rojo' : 'tono-azul'}`}>
                  {DESTINO[f.destino]}
                </span>
              </td>
              <td className="tenue">{f.observacion}</td>
            </tr>
          ))}
        </VistaPrevia>
      </TarjetaReporte>
    </div>
  )
}
