import { useState } from 'react'
import { api, ErrorApi, mensajeDe } from '../api'
import { TIPOS_DOCUMENTO } from '../formato'
import Icono from './Icono.jsx'

// Cliente de la venta: se busca por DNI o RUC y, si no existe, se registra ahí mismo
// sin salir de la caja. En una factura se pide RUC y la dirección fiscal.
export default function ElegirCliente({ cliente, alCambiar, factura }) {
  const [documento, setDocumento] = useState('')
  const [nuevo, setNuevo] = useState(false)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const limpio = documento.trim()
  // 11 dígitos es un RUC: se pide razón social y dirección fiscal
  const esRuc = /^\d{11}$/.test(limpio)

  function limpiar() {
    setDocumento('')
    setNombre('')
    setTelefono('')
    setDireccion('')
    setNuevo(false)
  }

  async function buscar(e) {
    e.preventDefault()
    if (!limpio) return
    setError('')
    setOcupado(true)
    try {
      alCambiar(await api(`/clientes/documento/${encodeURIComponent(limpio)}`))
      limpiar()
    } catch (err) {
      // No existe: se ofrece registrarlo con el documento ya escrito
      if (err instanceof ErrorApi && err.estado === 404) setNuevo(true)
      else setError(mensajeDe(err))
    } finally {
      setOcupado(false)
    }
  }

  async function registrar(e) {
    e.preventDefault()
    setError('')
    setOcupado(true)
    try {
      alCambiar(
        await api('/clientes', {
          metodo: 'POST',
          cuerpo: { documento: limpio, nombre: nombre.trim(), telefono, direccion },
        }),
      )
      limpiar()
    } catch (err) {
      setError(mensajeDe(err))
    } finally {
      setOcupado(false)
    }
  }

  if (cliente) {
    const sinRuc = factura && cliente.tipoDocumento !== 'RUC'
    return (
      <div className={`cliente-elegido ${sinRuc ? 'con-problema' : ''}`}>
        <span className="avatar-cliente">
          <Icono nombre={cliente.tipoDocumento === 'RUC' ? 'domain' : 'person'} />
        </span>
        <span className="cliente-elegido-datos">
          <strong>{cliente.nombre}</strong>
          <span className="tenue">
            {TIPOS_DOCUMENTO[cliente.tipoDocumento]?.nombre ?? 'DNI'} {cliente.documento}
          </span>
          {cliente.direccion && <span className="tenue">{cliente.direccion}</span>}
          {sinRuc && <span className="texto-error">Para una factura el cliente debe tener RUC</span>}
        </span>
        <button
          type="button"
          className="boton-icono chico"
          onClick={() => alCambiar(null)}
          title="Cambiar cliente"
          aria-label="Quitar cliente"
        >
          <Icono nombre="close" />
        </button>
      </div>
    )
  }

  return (
    <div className="cliente-venta">
      <form className="fila" onSubmit={buscar}>
        <input
          inputMode="numeric"
          placeholder={factura ? 'RUC del cliente (11 dígitos)' : 'DNI o RUC del cliente'}
          maxLength={12}
          value={documento}
          onChange={(e) => {
            setDocumento(e.target.value)
            setNuevo(false)
            setError('')
          }}
          aria-label={factura ? 'RUC del cliente' : 'DNI o RUC del cliente'}
        />
        <button className="boton secundario con-icono" disabled={ocupado || !limpio}>
          <Icono nombre="search" /> Buscar
        </button>
      </form>

      {nuevo && (
        <form className="aviso pendiente" onSubmit={registrar}>
          <p>
            No hay ningún cliente con el {esRuc ? 'RUC' : 'documento'} <strong>{limpio}</strong>. Regístralo:
          </p>
          <label>
            {esRuc ? 'Razón social' : 'Nombre completo'}
            <input required minLength={2} maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          {esRuc && (
            <label>
              Dirección fiscal
              <input maxLength={200} value={direccion} onChange={(e) => setDireccion(e.target.value)} />
            </label>
          )}
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
