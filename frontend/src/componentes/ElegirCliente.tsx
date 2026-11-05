import { useState } from 'react'
import type { FormEvent } from 'react'
import { api, ErrorApi, mensajeDe } from '../api'
import type { Cliente } from '../tipos'

// Cliente opcional de la venta: se busca por DNI y, si no existe, se registra ahí mismo
// con nombre y teléfono, sin salir de la caja.
export default function ElegirCliente({
  cliente,
  alCambiar,
}: {
  cliente: Cliente | null
  alCambiar: (cliente: Cliente | null) => void
}) {
  const [documento, setDocumento] = useState('')
  const [nuevo, setNuevo] = useState(false)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function buscar(e: FormEvent) {
    e.preventDefault()
    const limpio = documento.trim()
    if (!limpio) return
    setError('')
    setOcupado(true)
    try {
      alCambiar(await api<Cliente>(`/clientes/documento/${encodeURIComponent(limpio)}`))
      setDocumento('')
      setNuevo(false)
    } catch (err) {
      // No existe: se ofrece registrarlo con el documento ya escrito
      if (err instanceof ErrorApi && err.estado === 404) setNuevo(true)
      else setError(mensajeDe(err))
    } finally {
      setOcupado(false)
    }
  }

  async function registrar(e: FormEvent) {
    e.preventDefault()
    setError('')
    setOcupado(true)
    try {
      const creado = await api<Cliente>('/clientes', {
        metodo: 'POST',
        cuerpo: { documento: documento.trim(), nombre, ...(telefono.trim() ? { telefono: telefono.trim() } : {}) },
      })
      alCambiar(creado)
      setDocumento('')
      setNombre('')
      setTelefono('')
      setNuevo(false)
    } catch (err) {
      setError(mensajeDe(err))
    } finally {
      setOcupado(false)
    }
  }

  if (cliente) {
    return (
      <div className="elegido">
        <span>
          <strong>{cliente.nombre}</strong>
          <span className="tenue">DNI {cliente.documento}</span>
        </span>
        <button type="button" className="boton secundario chico" onClick={() => alCambiar(null)}>
          Quitar
        </button>
      </div>
    )
  }

  return (
    <div className="cliente-venta">
      <form className="fila" onSubmit={buscar}>
        <input
          inputMode="numeric"
          placeholder="DNI del cliente (opcional)"
          maxLength={12}
          value={documento}
          onChange={(e) => {
            setDocumento(e.target.value)
            setNuevo(false)
            setError('')
          }}
          aria-label="DNI del cliente"
        />
        <button className="boton secundario" disabled={ocupado || !documento.trim()}>
          Buscar
        </button>
      </form>

      {nuevo && (
        <form className="aviso pendiente" onSubmit={registrar}>
          <p>
            No hay ningún cliente con el documento <strong>{documento.trim()}</strong>. Regístralo:
          </p>
          <label>
            Nombre completo
            <input required minLength={2} maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <label>
            Teléfono (opcional)
            <input inputMode="tel" maxLength={16} value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </label>
          <button className="boton" disabled={ocupado}>
            {ocupado ? 'Guardando…' : 'Registrar cliente'}
          </button>
        </form>
      )}
      {error && <p className="aviso error">{error}</p>}
    </div>
  )
}
