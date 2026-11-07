import { useState } from 'react'
import { mensajeDe } from '../api'
import { useSesion } from '../sesion.jsx'

export default function Login() {
  const { entrar } = useSesion()
  const [correo, setCorreo] = useState('')
  const [password, setPassword] = useState('')
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
      <form className="tarjeta" onSubmit={alEnviar}>
        <h1>Inventario y vencimientos</h1>
        <p className="tenue">Ingresa con la cuenta de tu negocio</p>

        <label>
          Correo
          <input
            type="email"
            autoComplete="username"
            required
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <p className="aviso error">{error}</p>}
        <button className="boton" disabled={enviando}>
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}
