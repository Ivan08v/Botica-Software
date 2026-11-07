import { useEffect, useState } from 'react'
import { api, mensajeDe } from '../api'
import { fecha, soles } from '../formato'
import Paginador from '../componentes/Paginador.jsx'
import { usePaginacion } from '../componentes/usePaginacion.js'

const TRAMOS = [
  { tramo: 'VENCIDO', titulo: 'Vencidos', clase: 'vencido' },
  { tramo: 'DIAS_30', titulo: 'Vence en 30 días', clase: 'rojo' },
  { tramo: 'DIAS_60', titulo: 'Vence en 31 a 60 días', clase: 'ambar' },
  { tramo: 'DIAS_90', titulo: 'Vence en 61 a 90 días', clase: 'amarillo' },
]

function textoDias(dias) {
  if (dias < 0) return `Venció hace ${-dias} ${dias === -1 ? 'día' : 'días'}`
  if (dias === 0) return 'Vence hoy'
  return `Faltan ${dias} ${dias === 1 ? 'día' : 'días'}`
}

export default function Panel() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  // Tramo elegido para filtrar la lista; null muestra todos
  const [filtro, setFiltro] = useState(null)

  useEffect(() => {
    api('/panel')
      .then(setDatos)
      .catch((e) => setError(mensajeDe(e)))
  }, [])

  const todosLosLotes = datos?.lotesPorVencer ?? []
  const lotes = filtro ? todosLosLotes.filter((l) => l.tramo === filtro) : todosLosLotes
  // Al cambiar de tramo se vuelve a la página 1
  const paginaLotes = usePaginacion(lotes, filtro)
  const paginaStockBajo = usePaginacion(datos?.productosStockBajo ?? [])

  if (error) return <p className="aviso error">{error}</p>
  if (!datos) return <p className="tenue">Cargando panel…</p>

  const resumen = {
    VENCIDO: datos.vencimientos.vencidos,
    DIAS_30: datos.vencimientos.en30Dias,
    DIAS_60: datos.vencimientos.en60Dias,
    DIAS_90: datos.vencimientos.en90Dias,
  }
  const claseDe = (tramo) => TRAMOS.find((t) => t.tramo === tramo).clase

  return (
    <>
      <section className="destacado">
        <div>
          <span>Dinero en riesgo</span>
          <strong>{soles(datos.dineroEnRiesgo)}</strong>
          <small>Costo de los lotes que vencen en los próximos 90 días</small>
        </div>
        <div>
          <span>Ya vencido</span>
          <strong>{soles(datos.dineroVencido)}</strong>
          <small>Costo de los lotes vencidos que siguen en el inventario</small>
        </div>
      </section>

      <section className="tramos">
        {TRAMOS.map(({ tramo, titulo, clase }) => (
          <button
            key={tramo}
            className={`tramo ${clase} ${filtro === tramo ? 'activo' : ''}`}
            onClick={() => setFiltro(filtro === tramo ? null : tramo)}
            aria-pressed={filtro === tramo}
          >
            <span>{titulo}</span>
            <strong>{resumen[tramo].lotes}</strong>
            <small>
              {resumen[tramo].lotes === 1 ? 'lote' : 'lotes'} · {soles(resumen[tramo].valor)}
            </small>
          </button>
        ))}
      </section>

      <section className="tarjeta">
        <h2>
          Lotes por vencer
          {filtro && (
            <button className="enlace" onClick={() => setFiltro(null)}>
              Ver todos
            </button>
          )}
        </h2>
        {lotes.length === 0 ? (
          <p className="tenue">No hay lotes en este grupo.</p>
        ) : (
          <div className="tabla-envoltura">
            <table className="tabla-lotes">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Vence</th>
                  <th className="num">Unid.</th>
                  <th className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {paginaLotes.visibles.map((l) => (
                  <tr key={l.loteId}>
                    <td>
                      <strong>{l.producto}</strong>
                      <span className="tenue">
                        {[l.presentacion, `Lote ${l.numeroLote}`].filter(Boolean).join(' · ')}
                      </span>
                    </td>
                    <td>
                      {fecha(l.fechaVencimiento)}
                      <span className={`etiqueta ${claseDe(l.tramo)}`}>{textoDias(l.diasRestantes)}</span>
                    </td>
                    <td className="num">
                      {l.cantidadActual}
                      <span className="solo-movil"> unid.</span>
                    </td>
                    <td className="num">{soles(l.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Paginador {...paginaLotes} />
          </div>
        )}
      </section>

      <section className="tarjeta">
        <h2>Productos con stock bajo</h2>
        {datos.productosStockBajo.length === 0 ? (
          <p className="tenue">Todos los productos están sobre su stock mínimo.</p>
        ) : (
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="num">Stock</th>
                  <th className="num">Mínimo</th>
                  <th className="num">Faltan</th>
                </tr>
              </thead>
              <tbody>
                {paginaStockBajo.visibles.map((p) => (
                  <tr key={p.productoId}>
                    <td>
                      <strong>{p.producto}</strong>
                      <span className="tenue">{p.presentacion}</span>
                    </td>
                    <td className="num">{p.stock}</td>
                    <td className="num">{p.stockMinimo}</td>
                    <td className="num">
                      <span className="etiqueta rojo">{p.faltante}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Paginador {...paginaStockBajo} />
          </div>
        )}
      </section>
    </>
  )
}
