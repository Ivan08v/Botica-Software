import { createContext, useContext, useEffect, useState } from 'react'
import { api, guardarSesion, leerSesion, SESION_VENCIDA } from './api'

const Contexto = createContext(null)

// Guarda quién inició sesión y lo comparte con toda la app.
// La sesión vive en localStorage para que no se pierda al recargar la página.
export function ProveedorSesion({ children }) {
  const [sesion, setSesion] = useState(leerSesion)

  useEffect(() => {
    const alVencer = () => setSesion(null)
    window.addEventListener(SESION_VENCIDA, alVencer)
    return () => window.removeEventListener(SESION_VENCIDA, alVencer)
  }, [])

  async function entrar(correo, password) {
    const nueva = await api('/auth/login', { metodo: 'POST', cuerpo: { correo, password } })
    guardarSesion(nueva)
    setSesion(nueva)
  }

  function salir() {
    guardarSesion(null)
    setSesion(null)
  }

  return <Contexto.Provider value={{ sesion, entrar, salir }}>{children}</Contexto.Provider>
}

export function useSesion() {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('useSesion debe usarse dentro de ProveedorSesion')
  return contexto
}
