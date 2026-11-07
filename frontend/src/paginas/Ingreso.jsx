import { useState } from 'react'
import { api, mensajeDe } from '../api'
import BuscadorProducto from '../componentes/BuscadorProducto.jsx'
import { fecha } from '../formato'

const VACIO = { numeroLote: '', fechaVencimiento: '', cantidad: '', costoUnitario: '' }

// Ingreso de mercadería: se elige el producto y se registra el lote que llegó
export default function Ingreso() {
  const [producto, setProducto] = useState(null)
  const [campos, setCampos] = useState(VACIO)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cambiar = (campo) => (e) => setCampos({ ...campos, [campo]: e.target.value })

  async function alEnviar(evento) {
    evento.preventDefault()
    if (!producto) return
    setError('')
    setEnviando(true)
    try {
      const lote = await api('/lotes', {
        metodo: 'POST',
        cuerpo: {
          productoId: producto.id,
          numeroLote: campos.numeroLote,
          fechaVencimiento: campos.fechaVencimiento,
          cantidad: Number(campos.cantidad),
          costoUnitario: Number(campos.costoUnitario),
        },
      })
      setExito(
        `Ingresaron ${lote.cantidadActual} unidades de ${producto.nombre} (lote ${lote.numeroLote}, vence ${fecha(lote.fechaVencimiento)}).`,
      )
      setProducto(null)
      setCampos(VACIO)
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="tarjeta">
      <h2>Ingreso de mercadería</h2>
      {exito && <p className="aviso exito">{exito}</p>}

      {!producto ? (
        <BuscadorProducto
          alElegir={(p) => {
            setProducto(p)
            setExito('')
          }}
        />
      ) : (
        <form onSubmit={alEnviar}>
          <div className="elegido">
            <span>
              <strong>{producto.nombre}</strong>
              <span className="tenue">
                {[producto.presentacion, `stock actual ${producto.stock}`].filter(Boolean).join(' · ')}
              </span>
            </span>
            <button type="button" className="boton secundario chico" onClick={() => setProducto(null)}>
              Cambiar
            </button>
          </div>

          <label>
            Número de lote
            <input required maxLength={50} value={campos.numeroLote} onChange={cambiar('numeroLote')} />
          </label>
          <label>
            Fecha de vencimiento
            <input type="date" required value={campos.fechaVencimiento} onChange={cambiar('fechaVencimiento')} />
          </label>
          <div className="dos-columnas">
            <label>
              Cantidad
              <input
                type="number"
                required
                min={1}
                step={1}
                inputMode="numeric"
                value={campos.cantidad}
                onChange={cambiar('cantidad')}
              />
            </label>
            <label>
              Costo por unidad (S/)
              <input
                type="number"
                required
                min={0}
                step="0.01"
                inputMode="decimal"
                value={campos.costoUnitario}
                onChange={cambiar('costoUnitario')}
              />
            </label>
          </div>

          {error && <p className="aviso error">{error}</p>}
          <button className="boton" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Registrar ingreso'}
          </button>
        </form>
      )}
    </section>
  )
}
