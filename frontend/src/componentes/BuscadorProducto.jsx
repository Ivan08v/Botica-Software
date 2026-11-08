import { lazy, Suspense, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, ErrorApi, mensajeDe } from '../api'
import { useSesion } from '../sesion.jsx'
import Icono from './Icono.jsx'

// La librería de cámara es pesada: se descarga recién cuando alguien toca "Escanear"
const Escaner = lazy(() => import('./Escaner.jsx'))

// Busca un producto por nombre, laboratorio o código de barras (escrito o escaneado)
// y avisa cuál se eligió. Lo usan la venta y el ingreso de mercadería.
export default function BuscadorProducto({ alElegir }) {
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState([])
  const [escaneando, setEscaneando] = useState(false)
  const [error, setError] = useState('')
  // Código escaneado que no corresponde a ningún producto del negocio
  const [sinRegistrar, setSinRegistrar] = useState('')
  const { sesion } = useSesion()
  const esDueno = sesion?.usuario.rol === 'DUENO'
  const navegar = useNavigate()
  const { pathname } = useLocation()

  // Espera a que la persona deje de escribir antes de consultar (no una llamada por tecla)
  useEffect(() => {
    const limpio = texto.trim()
    if (limpio.length < 2) return
    let vigente = true
    const espera = setTimeout(() => {
      api(`/productos?buscar=${encodeURIComponent(limpio)}`)
        .then((lista) => {
          if (vigente) setResultados(lista.slice(0, 8))
        })
        .catch((e) => vigente && setError(mensajeDe(e)))
    }, 250)
    return () => {
      vigente = false
      clearTimeout(espera)
    }
  }, [texto])

  // Con menos de 2 letras no se busca ni se muestran resultados anteriores
  const visibles = texto.trim().length < 2 ? [] : resultados

  function elegir(producto) {
    setTexto('')
    setResultados([])
    setError('')
    setSinRegistrar('')
    alElegir(producto)
  }

  async function alLeerCodigo(codigo) {
    setEscaneando(false)
    setError('')
    setSinRegistrar('')
    try {
      elegir(await api(`/productos/codigo/${encodeURIComponent(codigo)}`))
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 404) setSinRegistrar(codigo)
      else setError(mensajeDe(e))
    }
  }

  return (
    <div className="buscador">
      <div className="fila">
        <span className="campo-con-icono">
          <Icono nombre="search" />
          <input
            id="buscar-producto"
            type="search"
            placeholder="Buscar medicina por nombre, laboratorio o código de barras"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value)
              setError('')
              setSinRegistrar('')
            }}
            aria-label="Buscar producto"
          />
        </span>
        <button type="button" className="boton-suave con-icono" onClick={() => setEscaneando(!escaneando)}>
          <Icono nombre="qr_code_scanner" /> Escanear
        </button>
      </div>

      {escaneando && (
        <Suspense fallback={<p className="tenue">Abriendo cámara…</p>}>
          <Escaner alLeer={alLeerCodigo} alCerrar={() => setEscaneando(false)} />
        </Suspense>
      )}
      {error && <p className="aviso error">{error}</p>}
      {sinRegistrar && (
        <div className="aviso pendiente">
          <p>
            El código <strong>{sinRegistrar}</strong> se leyó bien, pero todavía no hay ningún producto registrado con
            él.
          </p>
          {esDueno ? (
            // Lleva al formulario con el código ya puesto y, al guardar, regresa a esta pantalla
            <button
              type="button"
              className="boton"
              onClick={() => navegar('/productos', { state: { codigoNuevo: sinRegistrar, volverA: pathname } })}
            >
              Registrar producto con este código
            </button>
          ) : (
            <p>Pide al dueño o dueña del negocio que lo registre.</p>
          )}
        </div>
      )}

      {visibles.length > 0 && (
        <ul className="resultados">
          {visibles.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => elegir(p)}>
                <span>
                  <strong>{p.nombre}</strong>
                  <span className="tenue">{[p.presentacion, p.laboratorio].filter(Boolean).join(' · ')}</span>
                </span>
                <span className={p.stock === 0 ? 'etiqueta rojo' : 'etiqueta'}>Stock {p.stock}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
