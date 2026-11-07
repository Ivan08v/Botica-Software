import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, mensajeDe } from '../api'

const MAXIMO_DETALLE = 200
const ETIQUETA = {
  ERROR: { texto: 'Error', clase: 'rojo' },
  OMITIDA: { texto: 'Se omite', clase: '' },
  OK: { texto: 'Aviso', clase: 'amarillo' },
}

// Importar inventario desde Excel en tres pasos: elegir archivo, revisar la vista previa y confirmar
export default function Importar() {
  const [archivo, setArchivo] = useState('')
  const [filas, setFilas] = useState([])
  const [previa, setPrevia] = useState(null)
  const [hecho, setHecho] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function alElegirArchivo(evento) {
    const elegido = evento.target.files?.[0]
    // Permite volver a elegir el mismo archivo después de corregirlo
    evento.target.value = ''
    if (!elegido) return
    setError('')
    setPrevia(null)
    setHecho(null)
    setOcupado(true)
    try {
      const { leerInventario } = await import('../excel')
      const leido = await leerInventario(elegido)
      const respuesta = await api('/importacion/vista-previa', {
        metodo: 'POST',
        cuerpo: { filas: leido.filas },
      })
      // El servidor numera las filas en orden; aquí se traduce al número real en el Excel,
      // que puede ser otro si el archivo tiene filas vacías en medio
      respuesta.filas.forEach((f, i) => (f.fila = leido.numeros[i]))
      setArchivo(elegido.name)
      setFilas(leido.filas)
      setPrevia(respuesta)
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setOcupado(false)
    }
  }

  async function confirmar() {
    setError('')
    setOcupado(true)
    try {
      setHecho(await api('/importacion/confirmar', { metodo: 'POST', cuerpo: { filas } }))
      setPrevia(null)
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setOcupado(false)
    }
  }

  async function plantilla() {
    const { descargarPlantilla } = await import('../excel')
    descargarPlantilla()
  }

  // Solo se detallan las filas que necesitan atención: errores primero, luego omitidas y avisos
  const orden = ['ERROR', 'OMITIDA', 'OK']
  const conNovedad = (previa?.filas ?? [])
    .filter((f) => f.estado !== 'OK' || f.avisos.length > 0)
    .sort((a, b) => orden.indexOf(a.estado) - orden.indexOf(b.estado) || a.fila - b.fila)

  return (
    <>
      <section className="tarjeta">
        <h2>
          Importar inventario desde Excel
          <Link className="enlace" to="/productos">
            Volver a productos
          </Link>
        </h2>
        <ol className="pasos">
          <li>
            Descarga la plantilla y llénala con una fila por cada lote.{' '}
            <button type="button" className="enlace" onClick={plantilla}>
              Descargar plantilla
            </button>
          </li>
          <li>Elige tu archivo. Primero verás una vista previa: todavía no se guarda nada.</li>
          <li>Revisa los avisos y confirma la importación.</li>
        </ol>

        <label className="boton archivo">
          {ocupado && !previa
            ? 'Leyendo archivo…'
            : previa || hecho
              ? 'Elegir otro archivo'
              : 'Elegir archivo de Excel'}
          <input type="file" accept=".xlsx,.xls" onChange={alElegirArchivo} disabled={ocupado} />
        </label>
        {error && <p className="aviso error">{error}</p>}
      </section>

      {hecho && (
        <section className="tarjeta">
          <p className="aviso exito">Importación terminada</p>
          <div className="datos">
            <Dato titulo="Productos nuevos" valor={hecho.importado.productos} />
            <Dato titulo="Lotes cargados" valor={hecho.importado.lotes} />
            <Dato titulo="Unidades" valor={hecho.importado.unidades} />
          </div>
          {hecho.conError + hecho.omitidas > 0 && (
            <p className="tenue">
              No se importaron {hecho.conError} {hecho.conError === 1 ? 'fila' : 'filas'} con error y {hecho.omitidas}{' '}
              que ya estaban registradas. Corrige el archivo y vuelve a subirlo: lo ya importado no se duplicará.
            </p>
          )}
          <Link className="boton" to="/productos">
            Ver productos
          </Link>
        </section>
      )}

      {previa && (
        <section className="tarjeta">
          <h2>Vista previa de {archivo}</h2>
          <div className="datos">
            <Dato titulo="Filas listas" valor={previa.resumen.correctas} clase="verde" />
            <Dato titulo="Se omiten" valor={previa.resumen.omitidas} />
            <Dato titulo="Con error" valor={previa.resumen.conError} clase={previa.resumen.conError ? 'rojo' : ''} />
          </div>
          <p>
            Al confirmar se crearán <strong>{previa.resumen.productosNuevos}</strong> productos y{' '}
            <strong>{previa.resumen.lotesNuevos}</strong> lotes, con <strong>{previa.resumen.unidades}</strong> unidades
            en total.
          </p>

          {conNovedad.length > 0 && (
            <>
              <h2>Filas que revisar</h2>
              <ul className="lista">
                {conNovedad.slice(0, MAXIMO_DETALLE).map((f) => (
                  <li key={f.fila}>
                    <span>
                      <span>
                        <strong>Fila {f.fila}</strong>
                        <span className={`etiqueta ${ETIQUETA[f.estado].clase}`}>{ETIQUETA[f.estado].texto}</span>
                      </span>
                      <span className="tenue">
                        {[f.nombre || '(sin nombre)', f.numeroLote && `lote ${f.numeroLote}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      {[...f.errores, ...f.avisos].map((mensaje) => (
                        <span key={mensaje}>{mensaje}</span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
              {conNovedad.length > MAXIMO_DETALLE && (
                <p className="tenue">
                  Se muestran las primeras {MAXIMO_DETALLE} de {conNovedad.length} filas con novedades.
                </p>
              )}
            </>
          )}

          {previa.resumen.conError > 0 && (
            <p className="tenue">
              Las filas con error no se importarán. Puedes importar las demás ahora y subir después el archivo
              corregido: lo ya importado no se duplica.
            </p>
          )}
          <button className="boton" disabled={ocupado || previa.resumen.correctas === 0} onClick={confirmar}>
            {ocupado
              ? 'Importando…'
              : `Importar ${previa.resumen.correctas} ${previa.resumen.correctas === 1 ? 'fila' : 'filas'}`}
          </button>
        </section>
      )}
    </>
  )
}

function Dato({ titulo, valor, clase = '' }) {
  return (
    <div className={`tramo dato ${clase}`}>
      <span>{titulo}</span>
      <strong>{valor.toLocaleString('es-PE')}</strong>
    </div>
  )
}
