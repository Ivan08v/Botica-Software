import { useEffect, useRef, useState } from 'react'
import { api, mensajeDe } from '../api'
import { fecha, soles } from '../formato'
import DarDeBaja from '../componentes/DarDeBaja.jsx'
import Icono from '../componentes/Icono.jsx'
import Paginador from '../componentes/Paginador.jsx'
import { usePaginacion } from '../componentes/usePaginacion.js'

// Los cuatro grupos de vencimiento, del más urgente al menos urgente.
// `tono` elige los colores en index.css (.tono-rojo, .tono-ambar, ...).
const TRAMOS = [
  {
    tramo: 'VENCIDO',
    clave: 'vencidos',
    titulo: 'Vencidos',
    rango: 'Retiro urgente',
    corto: 'Vencidos',
    icono: 'error',
    tono: 'rojo',
    detalle: (n) => `${n} ${n === 1 ? 'lote requiere' : 'lotes requieren'} retiro inmediato`,
  },
  {
    tramo: 'DIAS_30',
    clave: 'en30Dias',
    titulo: 'Por vencer',
    rango: '1 a 30 días',
    corto: '1 a 30 días',
    icono: 'schedule',
    tono: 'ambar',
    detalle: (n) => `${n} ${n === 1 ? 'lote' : 'lotes'} para vender con prioridad`,
  },
  {
    tramo: 'DIAS_60',
    clave: 'en60Dias',
    titulo: 'Próximos',
    rango: '31 a 60 días',
    corto: '31 a 60 días',
    icono: 'timelapse',
    tono: 'azul',
    detalle: (n) => `${n} ${n === 1 ? 'lote' : 'lotes'} con tiempo para rotar`,
  },
  {
    tramo: 'DIAS_90',
    clave: 'en90Dias',
    titulo: 'En seguimiento',
    rango: '61 a 90 días',
    corto: '61 a 90 días',
    icono: 'check_circle',
    tono: 'verde',
    detalle: (n) => `${n} ${n === 1 ? 'lote' : 'lotes'} bajo control`,
  },
]

const tonoDe = (tramo) => TRAMOS.find((t) => t.tramo === tramo).tono

function textoDias(dias) {
  if (dias < 0) return `Venció hace ${-dias} ${dias === -1 ? 'día' : 'días'}`
  if (dias === 0) return 'Vence hoy'
  return `Vence en ${dias} ${dias === 1 ? 'día' : 'días'}`
}

const porcentaje = (parte, total) => (total > 0 ? (parte / total) * 100 : 0)

export default function Panel() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  // Tramo elegido en las pestañas; null muestra todos
  const [filtro, setFiltro] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const tablaRef = useRef(null)
  // Ventana de baja abierta: { lotes, todos } o null
  const [baja, setBaja] = useState(null)
  const [aviso, setAviso] = useState('')
  // Al cambiar, se vuelve a pedir el panel (por ejemplo, después de dar de baja)
  const [recargar, setRecargar] = useState(0)

  useEffect(() => {
    api('/panel')
      .then(setDatos)
      .catch((e) => setError(mensajeDe(e)))
  }, [recargar])

  function alTerminarBaja(resultado) {
    setBaja(null)
    setAviso(
      `Se ${resultado.lotes === 1 ? 'dio de baja 1 lote' : `dieron de baja ${resultado.lotes} lotes`} ` +
        `(${resultado.unidades} unidades) por ${resultado.destino === 'DESTRUCCION' ? 'destrucción' : 'devolución al proveedor'}. ` +
        `Pérdida al costo: ${soles(resultado.valor)}.`,
    )
    setRecargar((n) => n + 1)
  }

  const texto = busqueda.trim().toLowerCase()
  const lotes = (datos?.lotesPorVencer ?? []).filter(
    (l) =>
      (!filtro || l.tramo === filtro) &&
      (!texto || l.producto.toLowerCase().includes(texto) || l.numeroLote.toLowerCase().includes(texto)),
  )
  // Al cambiar de pestaña o de búsqueda se vuelve a la página 1
  const paginaLotes = usePaginacion(lotes, `${filtro}|${texto}`)
  // La columna lateral muestra 5 por página para quedar pareja con la tabla
  const paginaStockBajo = usePaginacion(datos?.productosStockBajo ?? [], undefined, 5)

  if (error) return <p className="aviso error">{error}</p>
  if (!datos) return <p className="tenue">Cargando panel…</p>

  const resumen = (t) => datos.vencimientos[t.clave]
  const totalLotes = TRAMOS.reduce((suma, t) => suma + resumen(t).lotes, 0)
  const totalValor = TRAMOS.reduce((suma, t) => suma + Number(resumen(t).valor), 0)

  // Desde una tarjeta: filtra la tabla por ese grupo y la muestra
  function verTramo(tramo) {
    setFiltro(tramo)
    tablaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const vencidos = datos.lotesPorVencer.filter((l) => l.tramo === 'VENCIDO')

  return (
    <div className="panel">
      {aviso && (
        <p className="aviso exito con-icono aviso-cerrable">
          <Icono nombre="check_circle" /> {aviso}
          <button type="button" className="boton-icono chico" onClick={() => setAviso('')} aria-label="Cerrar aviso">
            <Icono nombre="close" />
          </button>
        </p>
      )}
      {baja && (
        <DarDeBaja lotes={baja.lotes} todos={baja.todos} alCerrar={() => setBaja(null)} alTerminar={alTerminarBaja} />
      )}

      <section className="resumen-tramos" aria-label="Resumen de vencimientos">
        {TRAMOS.map((t) => {
          const r = resumen(t)
          return (
            <article key={t.tramo} className={`tarjeta-tramo tono-${t.tono}`}>
              <header>
                <span className="icono-caja">
                  <Icono nombre={t.icono} />
                </span>
                <span className="tarjeta-tramo-titulo">
                  <strong>{t.titulo}</strong>
                  <small>{t.rango}</small>
                </span>
                <span className="chip">
                  {r.lotes} {r.lotes === 1 ? 'lote' : 'lotes'}
                </span>
              </header>
              <p className="tarjeta-tramo-monto">{soles(r.valor)}</p>
              <p className="tenue">{t.detalle(r.lotes)}</p>
              <footer>
                {/* Los vencidos no se pueden vender: desde aquí se retiran del inventario */}
                {t.tramo === 'VENCIDO' && vencidos.length > 0 ? (
                  <button
                    type="button"
                    className="boton-texto boton-baja-todos"
                    onClick={() => setBaja({ lotes: vencidos, todos: true })}
                  >
                    <Icono nombre="delete_sweep" /> Dar de baja todos
                  </button>
                ) : (
                  <span>Valor al costo</span>
                )}
                <button type="button" className="boton-texto" onClick={() => verTramo(t.tramo)} disabled={r.lotes === 0}>
                  Ver lotes <Icono nombre="arrow_forward" />
                </button>
              </footer>
            </article>
          )
        })}
      </section>

      <section className="tarjeta distribucion">
        <div className="distribucion-cabecera">
          <span className="con-icono">
            <Icono nombre="bar_chart" /> <strong>Distribución del valor en seguimiento</strong>
          </span>
          <span className="tenue">
            Total: <strong className="cifra">{soles(totalValor)}</strong> ({totalLotes} lotes)
          </span>
        </div>
        <div className="barra-distribucion" role="img" aria-label="Distribución del valor por grupo de vencimiento">
          {TRAMOS.map((t) => {
            const valor = Number(resumen(t).valor)
            if (valor === 0) return null
            return (
              <span
                key={t.tramo}
                className={`tono-${t.tono}`}
                style={{ width: `${porcentaje(valor, totalValor)}%` }}
                title={`${t.corto}: ${soles(valor)}`}
              />
            )
          })}
        </div>
        <ul className="leyenda">
          {TRAMOS.map((t) => {
            const valor = Number(resumen(t).valor)
            return (
              <li key={t.tramo} className={`tono-${t.tono}`}>
                <span className="punto" />
                {t.corto} <strong className="cifra">{soles(valor)}</strong>
                <span className="tenue">({porcentaje(valor, totalValor).toFixed(1)}%)</span>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="panel-cuerpo">
        <section className="tarjeta tabla-panel" ref={tablaRef}>
          <div className="barra-filtros">
            <div className="pestanas" role="tablist" aria-label="Filtrar lotes">
              <button type="button" role="tab" aria-selected={filtro === null} onClick={() => setFiltro(null)}>
                Todos ({totalLotes})
              </button>
              {TRAMOS.map((t) => (
                <button
                  key={t.tramo}
                  type="button"
                  role="tab"
                  aria-selected={filtro === t.tramo}
                  className={`tono-${t.tono}`}
                  onClick={() => setFiltro(t.tramo)}
                >
                  <span className="punto" />
                  {t.corto} ({resumen(t).lotes})
                </button>
              ))}
            </div>
            <label className="buscador-panel">
              <Icono nombre="search" />
              <input
                type="search"
                placeholder="Buscar por producto o número de lote"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                aria-label="Buscar lotes"
              />
            </label>
          </div>

          {lotes.length === 0 ? (
            <p className="tenue vacio">No hay lotes que coincidan.</p>
          ) : (
            <>
              <div className="tabla-envoltura">
                <table className="tabla-lotes">
                  <thead>
                    <tr>
                      <th>Producto y presentación</th>
                      <th>Lote</th>
                      <th>Vencimiento</th>
                      <th>Estado</th>
                      <th className="num">Stock</th>
                      <th className="num">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginaLotes.visibles.map((l) => (
                      <tr key={l.loteId}>
                        <td className="producto">
                          <strong>{l.producto}</strong>
                          <span className="tenue">{l.presentacion}</span>
                        </td>
                        <td className="lote">
                          <span className="codigo">{l.numeroLote}</span>
                        </td>
                        <td className="cifra vence">{fecha(l.fechaVencimiento)}</td>
                        <td className="estado">
                          <span className={`chip-estado tono-${tonoDe(l.tramo)}`}>
                            <span className="punto" />
                            {textoDias(l.diasRestantes)}
                          </span>
                          {l.tramo === 'VENCIDO' && (
                            <button
                              type="button"
                              className="boton-baja"
                              onClick={() => setBaja({ lotes: [l], todos: false })}
                              title="Retirar este lote del inventario"
                            >
                              <Icono nombre="delete" /> Dar de baja
                            </button>
                          )}
                        </td>
                        <td className="num">
                          <strong className="cifra">{l.cantidadActual}</strong> <span className="tenue">und</span>
                        </td>
                        <td className="num">
                          <strong className="cifra">{soles(l.valor)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginador {...paginaLotes} nombre="lotes" />
            </>
          )}
        </section>

        <aside className="panel-lateral">
          <section className="tarjeta riesgo">
            <span className="con-icono tenue">
              <Icono nombre="payments" /> Dinero en riesgo
            </span>
            <p className="riesgo-monto">{soles(datos.dineroEnRiesgo)}</p>
            <p className="tenue">Costo de los lotes que vencen en los próximos 90 días.</p>
            <p className="riesgo-vencido">
              <span>Ya vencido en inventario</span>
              <strong className="cifra">{soles(datos.dineroVencido)}</strong>
            </p>
          </section>

          <section className="tarjeta stock-critico">
            <h2>
              <span className="con-icono">
                <span className="punto tono-rojo" /> Stock crítico
              </span>
              <span className="chip tono-rojo">
                {datos.productosStockBajo.length} {datos.productosStockBajo.length === 1 ? 'producto' : 'productos'}
              </span>
            </h2>
            <p className="tenue">Productos por debajo de su stock mínimo.</p>
            {datos.productosStockBajo.length === 0 ? (
              <p className="tenue">Todos los productos están sobre su stock mínimo.</p>
            ) : (
              <>
                <ul className="lista-critica">
                  {paginaStockBajo.visibles.map((p) => {
                    const nivel = Math.min(100, Math.round(porcentaje(p.stock, p.stockMinimo)))
                    // Menos de la mitad del mínimo es urgente (rojo); el resto, ámbar
                    const tono = nivel < 50 ? 'rojo' : 'ambar'
                    return (
                      <li key={p.productoId} className={`tono-${tono}`}>
                        <div className="lista-critica-fila">
                          <span className="lista-critica-nombre">
                            <strong>{p.producto}</strong>
                            <span className="tenue">{p.presentacion}</span>
                          </span>
                          <span className="chip">−{p.faltante} und</span>
                        </div>
                        <div className="lista-critica-fila tenue">
                          <span>
                            Actual: <strong className="cifra">{p.stock}</strong> / Mínimo: {p.stockMinimo}
                          </span>
                          <strong className="cifra porcentaje">{nivel}%</strong>
                        </div>
                        <div className="progreso">
                          <span style={{ width: `${nivel}%` }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
                <Paginador {...paginaStockBajo} nombre="productos" />
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
