import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api, mensajeDe } from '../api'
import { soles } from '../formato'
import { useSesion } from '../sesion.jsx'
import Paginador from '../componentes/Paginador.jsx'
import { usePaginacion } from '../componentes/usePaginacion.js'

const Escaner = lazy(() => import('../componentes/Escaner.jsx'))

const VACIO = { nombre: '', laboratorio: '', presentacion: '', codigoBarras: '', precioVenta: '', stockMinimo: '0' }
// Formulario para crear o editar. `producto` es null cuando se crea uno nuevo.
function Formulario({ producto, codigoInicial, alGuardar, alCancelar }) {
  const [campos, setCampos] = useState(
    producto
      ? {
          nombre: producto.nombre,
          laboratorio: producto.laboratorio ?? '',
          presentacion: producto.presentacion ?? '',
          codigoBarras: producto.codigoBarras ?? '',
          precioVenta: producto.precioVenta,
          stockMinimo: String(producto.stockMinimo),
        }
      : { ...VACIO, codigoBarras: codigoInicial ?? '' },
  )
  const [escaneando, setEscaneando] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cambiar = (campo) => (e) => setCampos({ ...campos, [campo]: e.target.value })

  async function alEnviar(evento) {
    evento.preventDefault()
    setError('')
    setEnviando(true)
    // Un campo opcional vacío se envía como null: así también se puede borrar al editar
    const cuerpo = {
      nombre: campos.nombre.trim(),
      laboratorio: campos.laboratorio.trim() || null,
      presentacion: campos.presentacion.trim() || null,
      codigoBarras: campos.codigoBarras.trim() || null,
      precioVenta: Number(campos.precioVenta),
      stockMinimo: Number(campos.stockMinimo),
    }
    try {
      if (producto) await api(`/productos/${producto.id}`, { metodo: 'PATCH', cuerpo })
      else await api('/productos', { metodo: 'POST', cuerpo })
      alGuardar()
    } catch (e) {
      setError(mensajeDe(e))
      setEnviando(false)
    }
  }

  return (
    <form className="tarjeta" onSubmit={alEnviar}>
      <h2>{producto ? 'Editar producto' : 'Nuevo producto'}</h2>
      <label>
        Nombre
        <input
          required
          maxLength={150}
          value={campos.nombre}
          onChange={cambiar('nombre')}
          placeholder="Paracetamol 500 mg"
        />
      </label>
      <div className="dos-columnas">
        <label>
          Laboratorio
          <input maxLength={100} value={campos.laboratorio} onChange={cambiar('laboratorio')} />
        </label>
        <label>
          Presentación
          <input
            maxLength={100}
            value={campos.presentacion}
            onChange={cambiar('presentacion')}
            placeholder="Caja x 100 tabletas"
          />
        </label>
      </div>
      {/* El botón va fuera de la etiqueta: dentro, un lector de pantalla lo leería como parte del nombre del campo */}
      <div className="campo">
        <label htmlFor="codigo-barras">Código de barras</label>
        <span className="fila">
          <input
            id="codigo-barras"
            inputMode="numeric"
            pattern="\d{8,14}"
            title="Entre 8 y 14 dígitos"
            value={campos.codigoBarras}
            onChange={cambiar('codigoBarras')}
          />
          <button type="button" className="boton secundario" onClick={() => setEscaneando(!escaneando)}>
            Escanear
          </button>
        </span>
      </div>
      {escaneando && (
        <Suspense fallback={<p className="tenue">Abriendo cámara…</p>}>
          <Escaner
            alLeer={(codigo) => {
              setCampos((c) => ({ ...c, codigoBarras: codigo }))
              setEscaneando(false)
            }}
            alCerrar={() => setEscaneando(false)}
          />
        </Suspense>
      )}
      <div className="dos-columnas">
        <label>
          Precio de venta (S/)
          <input
            type="number"
            required
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={campos.precioVenta}
            onChange={cambiar('precioVenta')}
          />
        </label>
        <label>
          Stock mínimo
          <input
            type="number"
            required
            min={0}
            step={1}
            inputMode="numeric"
            value={campos.stockMinimo}
            onChange={cambiar('stockMinimo')}
          />
        </label>
      </div>

      {error && <p className="aviso error">{error}</p>}
      <div className="fila">
        <button className="boton" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="boton secundario" onClick={alCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

export default function Productos() {
  const { sesion } = useSesion()
  const esDueno = sesion?.usuario.rol === 'DUENO'
  const [buscar, setBuscar] = useState('')
  const [productos, setProductos] = useState(null)
  const [error, setError] = useState('')
  const paginacion = usePaginacion(productos ?? [], buscar)
  // undefined: formulario cerrado; null: creando; Producto: editando ese
  // Si se llega desde un escaneo sin resultado, se abre directo el formulario con ese código
  const navegar = useNavigate()
  const origen = useLocation().state
  const [editando, setEditando] = useState(origen?.codigoNuevo && esDueno ? null : undefined)

  // Al terminar se regresa a la pantalla desde la que se escaneó (venta o ingreso), si la hubo
  function cerrarFormulario() {
    if (origen?.volverA) navegar(origen.volverA)
    else setEditando(undefined)
  }

  const cargar = useCallback(async (texto) => {
    try {
      setProductos(await api(`/productos?buscar=${encodeURIComponent(texto.trim())}`))
      setError('')
    } catch (e) {
      setError(mensajeDe(e))
    }
  }, [])

  useEffect(() => {
    const espera = setTimeout(() => cargar(buscar), 250)
    return () => clearTimeout(espera)
  }, [buscar, cargar])

  async function desactivar(producto) {
    if (!window.confirm(`¿Desactivar "${producto.nombre}"? Dejará de aparecer en ventas e ingresos.`)) return
    try {
      await api(`/productos/${producto.id}`, { metodo: 'DELETE' })
      await cargar(buscar)
    } catch (e) {
      setError(mensajeDe(e))
    }
  }

  if (editando !== undefined) {
    return (
      <Formulario
        producto={editando}
        codigoInicial={editando === null ? origen?.codigoNuevo : undefined}
        alCancelar={cerrarFormulario}
        alGuardar={() => {
          cerrarFormulario()
          cargar(buscar)
        }}
      />
    )
  }

  return (
    <section className="tarjeta">
      <h2>
        Productos
        {esDueno && (
          <span className="fila">
            <Link className="boton secundario chico" to="/productos/importar">
              Importar Excel
            </Link>
            <button className="boton chico" onClick={() => setEditando(null)}>
              Nuevo producto
            </button>
          </span>
        )}
      </h2>
      <input
        type="search"
        placeholder="Buscar por nombre, laboratorio o código"
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
        aria-label="Buscar productos"
      />
      {error && <p className="aviso error">{error}</p>}

      {!productos ? (
        <p className="tenue">Cargando productos…</p>
      ) : productos.length === 0 ? (
        <p className="tenue">No se encontraron productos.</p>
      ) : (
        <>
          <ul className="lista">
            {paginacion.visibles.map((p) => (
              <li key={p.id}>
                <span>
                  <strong>{p.nombre}</strong>
                  <span className="tenue">
                    {[p.presentacion, p.laboratorio, p.codigoBarras].filter(Boolean).join(' · ')}
                  </span>
                  <span>
                    {soles(p.precioVenta)}
                    <span className={p.stockBajo ? 'etiqueta rojo' : 'etiqueta'}>
                      Stock {p.stock}
                      {p.stockBajo && ` (mínimo ${p.stockMinimo})`}
                    </span>
                  </span>
                </span>
                {esDueno && (
                  <span className="fila">
                    <button className="boton secundario chico" onClick={() => setEditando(p)}>
                      Editar
                    </button>
                    <button className="boton secundario chico peligro" onClick={() => desactivar(p)}>
                      Desactivar
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <Paginador {...paginacion} />
        </>
      )}
    </section>
  )
}
