import { useState } from 'react'
import { mensajeDe } from '../api'
import Icono from '../componentes/Icono.jsx'
import { useSesion } from '../sesion.jsx'

// Mensajes de la botica para el panel de bienvenida
const VALORES = [
  { icono: 'medication', titulo: 'Medicamentos de confianza', detalle: 'Productos garantizados y bien conservados' },
  { icono: 'health_and_safety', titulo: 'Atención cercana', detalle: 'Te orientamos con amabilidad en cada compra' },
  { icono: 'family_restroom', titulo: 'Para toda la familia', detalle: 'Cuidamos tu salud y la de los tuyos' },
]

export default function Login() {
  const { entrar } = useSesion()
  const [correo, setCorreo] = useState('')
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function alEnviar(evento) {
    evento.preventDefault()
    setError('')
    setEnviando(true)
    try {
      await entrar(correo, password)
    } catch (e) {
      setError(mensajeDe(e))
      setEnviando(false)
    }
  }

  return (
    <div className="login">
      <main className="login-principal">
        <section className="login-presentacion" aria-hidden="true">
          <div className="login-marca">
            <span className="login-logo">
              <Icono nombre="medication" />
            </span>
            <span>
              <strong>Botica</strong>
              <small>Salud y bienestar</small>
            </span>
          </div>

          <div className="login-mensaje">
            <span className="login-pastilla">
              <span className="punto-vivo" /> Abiertos para cuidarte
            </span>
            <h1>Tu salud y la de tu familia, en buenas manos.</h1>
            <p>
              Medicamentos de calidad, atención amable y el consejo que necesitas para sentirte mejor cada día.
            </p>
            <ul className="login-funciones">
              {VALORES.map((f) => (
                <li key={f.titulo}>
                  <span className="login-funcion-icono">
                    <Icono nombre={f.icono} />
                  </span>
                  <span>
                    <strong>{f.titulo}</strong>
                    <small>{f.detalle}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="login-pie-panel">Gracias por confiar en nosotros.</p>
        </section>

        <section className="login-lado-formulario">
          <form className="login-tarjeta" onSubmit={alEnviar}>
            {/* En celular no se ve el panel azul: la marca va arriba del formulario */}
            <div className="login-marca-movil">
              <span className="login-logo">
                <Icono nombre="medication" />
              </span>
              <span>
                <strong>Botica</strong>
                <small>Salud y bienestar</small>
              </span>
            </div>

            <header className="login-encabezado">
              <span className="login-etiqueta">
                <span className="punto" /> Personal de la botica
              </span>
              <h2>¡Bienvenido!</h2>
              <p className="tenue">Ingresa con tu cuenta para empezar a atender.</p>
            </header>

            <label className="login-campo">
              Correo electrónico
              <span className="campo-con-icono">
                <Icono nombre="alternate_email" />
                <input
                  type="email"
                  autoComplete="username"
                  placeholder="tucorreo@botica.pe"
                  required
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                />
              </span>
            </label>

            <label className="login-campo">
              Contraseña
              <span className="campo-con-icono con-boton">
                <Icono nombre="lock" />
                <input
                  type={verPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="ver-password"
                  onClick={() => setVerPassword(!verPassword)}
                  aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  title={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  <Icono nombre={verPassword ? 'visibility_off' : 'visibility'} />
                </button>
              </span>
            </label>

            {error && <p className="aviso error">{error}</p>}

            <button className="login-boton" disabled={enviando}>
              {enviando ? 'Ingresando…' : 'Iniciar sesión'}
              <Icono nombre="arrow_forward" />
            </button>
          </form>
        </section>
      </main>

      <footer className="login-pie">
        <span>
          <strong>Botica</strong> · Salud y bienestar para tu familia
        </span>
      </footer>
    </div>
  )
}
