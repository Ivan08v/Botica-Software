import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill'
import { useEffect, useRef, useState } from 'react'
import urlWasm from 'zxing-wasm/reader/zxing_reader.wasm?url'

// El motor de lectura (ZXing, compilado a WebAssembly) se sirve desde nuestra propia app
// en vez de descargarse de un CDN externo: así el escáner no depende de terceros.
prepareZXingModule({
  overrides: {
    locateFile: (ruta, prefijo) => (ruta.endsWith('.wasm') ? urlWasm : prefijo + ruta),
  },
})

// Formatos de los empaques de farmacia. Limitar la lista hace la lectura más rápida y confiable.
const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] })

const MS_ENTRE_LECTURAS = 150

// Lee códigos de barras con la cámara del celular o de la laptop.
// Cada lectura analiza el cuadro completo de la cámara a su resolución real: las barras
// de un código son muy finas y se pierden si la imagen se reduce antes de analizarla.
export default function Escaner({ alLeer, alCerrar }) {
  const video = useRef(null)
  const [error, setError] = useState('')
  const [manual, setManual] = useState('')
  const alLeerRef = useRef(alLeer)
  useEffect(() => {
    alLeerRef.current = alLeer
  })

  useEffect(() => {
    let cancelado = false
    let camara
    let espera

    async function leer() {
      if (cancelado || !video.current) return
      try {
        const codigos = await detector.detect(video.current)
        if (cancelado) return
        if (codigos.length > 0) {
          // Se deja de leer en cuanto aparece un código: la cámara lo vería muchas veces por segundo
          cancelado = true
          alLeerRef.current(codigos[0].rawValue.trim())
          return
        }
      } catch {
        // Un cuadro que no se pudo analizar no es un problema: se intenta con el siguiente
      }
      espera = setTimeout(leer, MS_ENTRE_LECTURAS)
    }

    async function encender() {
      // Los navegadores solo prestan la cámara en páginas seguras (https) o en localhost
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador solo permite usar la cámara en una página segura (https). Escribe el código abajo.')
        return
      }
      try {
        camara = await navigator.mediaDevices.getUserMedia({
          audio: false,
          // Cámara trasera en celulares y la mayor resolución razonable
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        })
      } catch {
        setError('No se pudo usar la cámara. Revisa el permiso del navegador o escribe el código abajo.')
        return
      }
      // Si el componente se cerró mientras se pedía el permiso, la cámara se apaga de inmediato
      if (cancelado || !video.current) {
        camara.getTracks().forEach((pista) => pista.stop())
        return
      }
      video.current.srcObject = camara
      await video.current.play().catch(() => {})
      leer()
    }

    encender()

    return () => {
      cancelado = true
      clearTimeout(espera)
      camara?.getTracks().forEach((pista) => pista.stop())
    }
  }, [])

  function enviarManual(evento) {
    evento.preventDefault()
    evento.stopPropagation()
    if (manual.trim()) alLeer(manual.trim())
  }

  return (
    <div className="escaner">
      {error ? (
        <p className="aviso error">{error}</p>
      ) : (
        <>
          <div className="escaner-marco">
            <video ref={video} muted playsInline aria-label="Vista de la cámara" />
          </div>
          <p className="tenue">
            Acerca el código a la línea, con buena luz y sin reflejos. Si se ve borroso, aléjalo un poco: las cámaras de
            laptop no enfocan de cerca.
          </p>
        </>
      )}

      {/* Siempre hay una salida si la cámara no logra leer */}
      <form className="fila" onSubmit={enviarManual}>
        <input
          inputMode="numeric"
          placeholder="O escribe el código de barras"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          aria-label="Código de barras escrito a mano"
        />
        <button className="boton secundario" disabled={!manual.trim()}>
          Usar
        </button>
      </form>
      <button type="button" className="boton secundario" onClick={alCerrar}>
        Cerrar cámara
      </button>
    </div>
  )
}
