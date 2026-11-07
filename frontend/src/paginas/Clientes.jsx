import { useEffect, useState } from 'react'
import { api, mensajeDe } from '../api'
import { fecha, fechaHora, soles } from '../formato'
import Paginador from '../componentes/Paginador.jsx'
import { usePaginacion } from '../componentes/usePaginacion.js'

// Atención al cliente: buscar por DNI o nombre y ver qué compró antes,
// para atender más rápido a quien vuelve (ej. tratamientos continuos).
export default function Clientes() {
  const [texto, setTexto] = useState('')
  const [lista, setLista] = useState([])
  const [ficha, setFicha] = useState(null)
  const [error, setError] = useState('')
  const paginacion = usePaginacion(lista, texto)
  // El historial vuelve a la página 1 al abrir otro cliente
  const paginacionVentas = usePaginacion(ficha?.ventas ?? [], ficha?.id)

  useEffect(() => {
    let vigente = true
    const espera = setTimeout(() => {
      api(`/clientes?buscar=${encodeURIComponent(texto.trim())}`)
        .then((r) => vigente && setLista(r))
        .catch((e) => vigente && setError(mensajeDe(e)))
    }, 250)
    return () => {
      vigente = false
      clearTimeout(espera)
    }
  }, [texto])

  async function abrir(id) {
    setError('')
    try {
      setFicha(await api(`/clientes/${id}`))
    } catch (e) {
      setError(mensajeDe(e))
    }
  }

  if (ficha) {
    return (
      <section className="tarjeta">
        <h2>
          {ficha.nombre}
          <button className="boton secundario chico" onClick={() => setFicha(null)}>
            Volver
          </button>
        </h2>
        <p className="tenue">
          DNI {ficha.documento}
          {ficha.telefono && ` · Tel. ${ficha.telefono}`}
        </p>
        <div className="tramos">
          <div className="tramo dato">
            <span>Compras</span>
            <strong>{ficha.compras}</strong>
          </div>
          <div className="tramo dato verde">
            <span>Total gastado</span>
            <strong>{soles(ficha.totalGastado)}</strong>
          </div>
          <div className="tramo dato">
            <span>Última compra</span>
            <strong className="fecha-dato">{ficha.ultimaCompra ? fecha(ficha.ultimaCompra) : '—'}</strong>
          </div>
        </div>

        <h2>Historial</h2>
        {ficha.ventas.length === 0 ? (
          <p className="tenue">Todavía no tiene compras registradas.</p>
        ) : (
          <>
            <ul className="lista">
              {paginacionVentas.visibles.map((v) => (
                <li key={v.id}>
                  <span>
                    <strong>
                      Venta #{v.id} · {fechaHora(v.fecha)}
                    </strong>
                    <span className="tenue">{v.productos.map((p) => `${p.cantidad} × ${p.nombre}`).join(', ')}</span>
                  </span>
                  <span>{soles(v.total)}</span>
                </li>
              ))}
            </ul>
            <Paginador {...paginacionVentas} />
          </>
        )}
      </section>
    )
  }

  return (
    <section className="tarjeta">
      <h2>Clientes</h2>
      <input
        type="search"
        placeholder="Buscar por DNI o nombre"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        aria-label="Buscar cliente"
      />
      {error && <p className="aviso error">{error}</p>}
      {lista.length === 0 ? (
        <p className="tenue espacio-arriba">
          {texto.trim()
            ? 'No se encontraron clientes.'
            : 'Aún no hay clientes. Se registran desde la venta, con su DNI.'}
        </p>
      ) : (
        <>
          <ul className="resultados">
            {paginacion.visibles.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => abrir(c.id)}>
                  <span>
                    <strong>{c.nombre}</strong>
                    <span className="tenue">
                      DNI {c.documento}
                      {c.telefono && ` · ${c.telefono}`}
                    </span>
                  </span>
                  <span className="etiqueta">Ver historial</span>
                </button>
              </li>
            ))}
          </ul>
          <Paginador {...paginacion} />
        </>
      )}
    </section>
  )
}
