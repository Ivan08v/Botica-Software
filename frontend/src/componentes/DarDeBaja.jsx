import { useEffect, useRef, useState } from 'react'
import { api, mensajeDe } from '../api'
import { fecha, soles } from '../formato'
import Icono from './Icono.jsx'

const DESTINOS = [
  {
    valor: 'DESTRUCCION',
    nombre: 'Destrucción',
    detalle: 'Se destruye y se deja constancia en un acta',
    icono: 'delete_forever',
    ejemplo: 'Ej.: Acta N° 012, destruido por la empresa EcoMed',
  },
  {
    valor: 'DEVOLUCION_PROVEEDOR',
    nombre: 'Devolución al proveedor',
    detalle: 'Se devuelve a la droguería para canje o nota de crédito',
    icono: 'assignment_return',
    ejemplo: 'Ej.: Nota de crédito 0045 de Droguería San Martín',
  },
]

// Ventana para dar de baja lotes vencidos: muestra qué se retira y cuánto se pierde,
// y pide el destino (destrucción o devolución) y una observación opcional.
// `lotes`: los lotes del panel que se van a retirar. `todos`: si es "dar de baja todos los vencidos".
export default function DarDeBaja({ lotes, todos, alCerrar, alTerminar }) {
  const dialogo = useRef(null)
  const [destino, setDestino] = useState('DESTRUCCION')
  const [observacion, setObservacion] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  // <dialog> nativo: bloquea el resto de la pantalla y se cierra con Esc
  useEffect(() => {
    dialogo.current?.showModal()
  }, [])

  const unidades = lotes.reduce((suma, l) => suma + l.cantidadActual, 0)
  const perdida = lotes.reduce((suma, l) => suma + Number(l.valor), 0)
  const elegido = DESTINOS.find((d) => d.valor === destino)

  async function confirmar(e) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      const resultado = await api('/lotes/bajas', {
        metodo: 'POST',
        cuerpo: {
          ...(todos ? {} : { loteIds: lotes.map((l) => l.loteId) }),
          destino,
          ...(observacion.trim() ? { observacion: observacion.trim() } : {}),
        },
      })
      alTerminar(resultado)
    } catch (err) {
      setError(mensajeDe(err))
      setEnviando(false)
    }
  }

  return (
    <dialog ref={dialogo} className="dialogo-baja" onClose={alCerrar} aria-labelledby="titulo-baja">
      <form onSubmit={confirmar}>
        <header className="dialogo-baja-cabecera">
          <span className="dialogo-baja-icono">
            <Icono nombre="delete_sweep" />
          </span>
          <span>
            <h2 id="titulo-baja">{todos ? 'Dar de baja todos los vencidos' : 'Dar de baja lote vencido'}</h2>
            <p className="tenue">Se retira del inventario: el stock del lote queda en 0.</p>
          </span>
          <button type="button" className="boton-icono chico" onClick={alCerrar} aria-label="Cerrar">
            <Icono nombre="close" />
          </button>
        </header>

        <ul className="dialogo-baja-lotes">
          {lotes.slice(0, 4).map((l) => (
            <li key={l.loteId}>
              <span>
                <strong>{l.producto}</strong>
                <span className="tenue">
                  Lote {l.numeroLote} · venció el {fecha(l.fechaVencimiento)}
                </span>
              </span>
              <span className="num">
                <strong>{l.cantidadActual} und</strong>
                <span className="tenue">{soles(l.valor)}</span>
              </span>
            </li>
          ))}
          {lotes.length > 4 && <li className="tenue dialogo-baja-mas">y {lotes.length - 4} lotes más…</li>}
        </ul>

        <dl className="dialogo-baja-totales">
          <div>
            <dt>Lotes</dt>
            <dd>{lotes.length}</dd>
          </div>
          <div>
            <dt>Unidades</dt>
            <dd>{unidades}</dd>
          </div>
          <div className="perdida">
            <dt>Pérdida al costo</dt>
            <dd>{soles(perdida)}</dd>
          </div>
        </dl>

        <fieldset className="dialogo-baja-destinos">
          <legend>¿Qué se hace con la mercadería?</legend>
          {DESTINOS.map((d) => (
            <label key={d.valor} className={destino === d.valor ? 'elegido' : ''}>
              <input
                type="radio"
                name="destino"
                value={d.valor}
                checked={destino === d.valor}
                onChange={() => setDestino(d.valor)}
              />
              <Icono nombre={d.icono} />
              <span>
                <strong>{d.nombre}</strong>
                <small>{d.detalle}</small>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="dialogo-baja-observacion">
          Observación (opcional)
          <input
            maxLength={200}
            placeholder={elegido.ejemplo}
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
          />
        </label>

        <p className="aviso pendiente con-icono">
          <Icono nombre="warning" /> Esta acción no se puede deshacer. Queda registrada con tu nombre y la fecha.
        </p>
        {error && <p className="aviso error">{error}</p>}

        <footer className="dialogo-baja-pie">
          <button type="button" className="boton secundario" onClick={alCerrar} disabled={enviando}>
            Cancelar
          </button>
          <button className="boton boton-peligro con-icono" disabled={enviando}>
            <Icono nombre="delete" />
            {enviando ? 'Dando de baja…' : `Dar de baja (${soles(perdida)})`}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
