import { useCallback, useEffect, useState } from 'react'
import { api, mensajeDe } from '../api'
import { fecha, fechaHora, soles, TIPOS_DOCUMENTO } from '../formato'
import Icono from '../componentes/Icono.jsx'
import Paginador from '../componentes/Paginador.jsx'
import { usePaginacion } from '../componentes/usePaginacion.js'

const VACIO = { tipoDocumento: 'DNI', documento: '', nombre: '', telefono: '', email: '', direccion: '' }

// Formulario para registrar o editar un cliente. `cliente` es null cuando se registra uno nuevo.
function FormularioCliente({ cliente, alGuardar, alCancelar }) {
  const [campos, setCampos] = useState(
    cliente
      ? {
          tipoDocumento: cliente.tipoDocumento,
          documento: cliente.documento,
          nombre: cliente.nombre,
          telefono: cliente.telefono ?? '',
          email: cliente.email ?? '',
          direccion: cliente.direccion ?? '',
        }
      : VACIO,
  )
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const esRuc = campos.tipoDocumento === 'RUC'

  const cambiar = (campo) => (e) => setCampos({ ...campos, [campo]: e.target.value })

  async function alEnviar(e) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      // Los opcionales vacíos se mandan como "" y el servidor los guarda como null (así se pueden borrar)
      const cuerpo = { ...campos, documento: campos.documento.trim(), nombre: campos.nombre.trim() }
      const guardado = cliente
        ? await api(`/clientes/${cliente.id}`, { metodo: 'PATCH', cuerpo })
        : await api('/clientes', { metodo: 'POST', cuerpo })
      alGuardar(guardado)
    } catch (err) {
      setError(mensajeDe(err))
      setEnviando(false)
    }
  }

  return (
    <form className="tarjeta formulario-cliente" onSubmit={alEnviar}>
      <h2>{cliente ? 'Editar cliente' : 'Nuevo cliente'}</h2>
      <div className="dos-columnas">
        <label>
          Tipo de documento
          <select value={campos.tipoDocumento} onChange={cambiar('tipoDocumento')}>
            {Object.entries(TIPOS_DOCUMENTO).map(([valor, t]) => (
              <option key={valor} value={valor}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Número de documento
          <input
            required
            inputMode={campos.tipoDocumento === 'CE' ? 'text' : 'numeric'}
            maxLength={TIPOS_DOCUMENTO[campos.tipoDocumento].largo}
            placeholder={TIPOS_DOCUMENTO[campos.tipoDocumento].ayuda}
            value={campos.documento}
            onChange={cambiar('documento')}
          />
        </label>
      </div>
      <label>
        {esRuc ? 'Razón social' : 'Nombre completo'}
        <input
          required
          minLength={2}
          maxLength={120}
          placeholder={esRuc ? 'Consultorio Médico Santa Rosa S.A.C.' : 'Rosa Quispe Huamán'}
          value={campos.nombre}
          onChange={cambiar('nombre')}
        />
      </label>
      <div className="dos-columnas">
        <label>
          Teléfono (opcional)
          <input inputMode="tel" maxLength={16} value={campos.telefono} onChange={cambiar('telefono')} />
        </label>
        <label>
          Correo (opcional)
          <input type="email" maxLength={120} value={campos.email} onChange={cambiar('email')} />
        </label>
      </div>
      <label>
        {esRuc ? 'Dirección fiscal (para la factura)' : 'Dirección (opcional)'}
        <input maxLength={200} value={campos.direccion} onChange={cambiar('direccion')} />
      </label>

      {error && <p className="aviso error">{error}</p>}
      <div className="fila">
        <button className="boton" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="boton secundario" onClick={alCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

// Ficha del cliente con su historial de compras
function FichaCliente({ id, alVolver, alEditar }) {
  const [ficha, setFicha] = useState(null)
  const [error, setError] = useState('')
  const paginacion = usePaginacion(ficha?.ventas ?? [], id)

  useEffect(() => {
    api(`/clientes/${id}`)
      .then(setFicha)
      .catch((e) => setError(mensajeDe(e)))
  }, [id])

  if (error) return <p className="aviso error">{error}</p>
  if (!ficha) return <p className="tenue">Cargando cliente…</p>

  return (
    <section className="tarjeta">
      <h2>
        {ficha.nombre}
        <span className="fila">
          <button className="boton secundario chico con-icono" onClick={() => alEditar(ficha)}>
            <Icono nombre="edit" /> Editar
          </button>
          <button className="boton secundario chico" onClick={alVolver}>
            Volver
          </button>
        </span>
      </h2>
      <p className="tenue">
        {TIPOS_DOCUMENTO[ficha.tipoDocumento].nombre} {ficha.documento}
        {ficha.telefono && ` · Tel. ${ficha.telefono}`}
        {ficha.email && ` · ${ficha.email}`}
        {ficha.direccion && ` · ${ficha.direccion}`}
      </p>
      <div className="tramos">
        <div className="tramo dato">
          <span>Compras</span>
          <strong>{ficha.compras}</strong>
        </div>
        <div className="tramo dato verde">
          <span>Total gastado</span>
          <strong>{soles(ficha.totalGastado)}</strong>
        </div>
        <div className="tramo dato">
          <span>Última compra</span>
          <strong className="fecha-dato">{ficha.ultimaCompra ? fecha(ficha.ultimaCompra) : '—'}</strong>
        </div>
      </div>

      <h2>Historial</h2>
      {ficha.ventas.length === 0 ? (
        <p className="tenue">Todavía no tiene compras registradas.</p>
      ) : (
        <>
          <ul className="lista">
            {paginacion.visibles.map((v) => (
              <li key={v.id}>
                <span>
                  <strong>
                    Venta #{v.id} · {fechaHora(v.fecha)}
                  </strong>
                  <span className="tenue">{v.productos.map((p) => `${p.cantidad} × ${p.nombre}`).join(', ')}</span>
                </span>
                <span>{soles(v.total)}</span>
              </li>
            ))}
          </ul>
          <Paginador {...paginacion} nombre="compras" />
        </>
      )}
    </section>
  )
}

// Clientes: listar, buscar, registrar, editar, eliminar y ver el historial de cada uno.
export default function Clientes() {
  const [texto, setTexto] = useState('')
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  // Vista actual: lista, formulario (nuevo o edición) o ficha de un cliente
  const [vista, setVista] = useState({ tipo: 'lista' })
  const paginacion = usePaginacion(lista ?? [], texto)

  const cargar = useCallback(async (buscar) => {
    try {
      setLista(await api(`/clientes?buscar=${encodeURIComponent(buscar.trim())}`))
      setError('')
    } catch (e) {
      setError(mensajeDe(e))
    }
  }, [])

  useEffect(() => {
    const espera = setTimeout(() => cargar(texto), 250)
    return () => clearTimeout(espera)
  }, [texto, cargar])

  async function eliminar(cliente) {
    if (!window.confirm(`¿Eliminar a "${cliente.nombre}"? Esta acción no se puede deshacer.`)) return
    setAviso('')
    try {
      await api(`/clientes/${cliente.id}`, { metodo: 'DELETE' })
      setAviso(`Se eliminó a ${cliente.nombre}.`)
      await cargar(texto)
    } catch (e) {
      // Un cliente con compras no se elimina: el servidor explica por qué
      setError(mensajeDe(e))
    }
  }

  function alGuardar(guardado, eraNuevo) {
    setAviso(eraNuevo ? `Se registró a ${guardado.nombre}.` : `Se guardaron los cambios de ${guardado.nombre}.`)
    setError('')
    setVista({ tipo: 'lista' })
    cargar(texto)
  }

  if (vista.tipo === 'formulario') {
    return (
      <FormularioCliente
        cliente={vista.cliente}
        alGuardar={(g) => alGuardar(g, !vista.cliente)}
        alCancelar={() => setVista(vista.volverA ?? { tipo: 'lista' })}
      />
    )
  }

  if (vista.tipo === 'ficha') {
    return (
      <FichaCliente
        id={vista.id}
        alVolver={() => setVista({ tipo: 'lista' })}
        alEditar={(c) => setVista({ tipo: 'formulario', cliente: c, volverA: vista })}
      />
    )
  }

  return (
    <section className="tarjeta tabla-panel">
      <div className="barra-filtros">
        <h2>
          <span>
            Clientes {lista && <span className="chip">{lista.length}</span>}
          </span>
          <button
            className="boton chico con-icono"
            onClick={() => {
              setAviso('')
              setVista({ tipo: 'formulario', cliente: null })
            }}
          >
            <Icono nombre="person_add" /> Nuevo cliente
          </button>
        </h2>
        <label className="buscador-panel">
          <Icono nombre="search" />
          <input
            type="search"
            placeholder="Buscar por DNI, RUC o nombre"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            aria-label="Buscar cliente"
          />
        </label>
        {aviso && <p className="aviso exito">{aviso}</p>}
        {error && <p className="aviso error">{error}</p>}
      </div>

      {!lista ? (
        <p className="tenue vacio">Cargando clientes…</p>
      ) : lista.length === 0 ? (
        <p className="tenue vacio">
          {texto.trim() ? 'No se encontraron clientes.' : 'Aún no hay clientes. Regístralos aquí o desde la venta.'}
        </p>
      ) : (
        <>
          <div className="tabla-envoltura">
            <table className="tabla-clientes">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Documento</th>
                  <th>Teléfono</th>
                  <th className="num">Compras</th>
                  <th className="num">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginacion.visibles.map((c) => (
                  <tr key={c.id}>
                    <td className="producto">
                      <strong>{c.nombre}</strong>
                      <span className="tenue">{c.email || c.direccion || 'Sin correo ni dirección'}</span>
                    </td>
                    <td className="documento">
                      <span className={`chip ${c.tipoDocumento === 'RUC' ? 'tono-azul' : ''}`}>{c.tipoDocumento}</span>{' '}
                      <span className="codigo">{c.documento}</span>
                    </td>
                    <td className="telefono">{c.telefono || <span className="tenue">—</span>}</td>
                    <td className="num compras">
                      <strong className="cifra">{c.compras}</strong>
                    </td>
                    <td className="num acciones">
                      <span className="acciones-fila">
                        <button
                          className="boton-icono chico"
                          title="Ver historial"
                          aria-label={`Ver historial de ${c.nombre}`}
                          onClick={() => setVista({ tipo: 'ficha', id: c.id })}
                        >
                          <Icono nombre="history" />
                        </button>
                        <button
                          className="boton-icono chico"
                          title="Editar"
                          aria-label={`Editar a ${c.nombre}`}
                          onClick={() => {
                            setAviso('')
                            setVista({ tipo: 'formulario', cliente: c })
                          }}
                        >
                          <Icono nombre="edit" />
                        </button>
                        <button
                          className="boton-icono chico peligro"
                          title={c.compras > 0 ? 'Tiene compras: no se puede eliminar' : 'Eliminar'}
                          aria-label={`Eliminar a ${c.nombre}`}
                          disabled={c.compras > 0}
                          onClick={() => eliminar(c)}
                        >
                          <Icono nombre="delete" />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginador {...paginacion} nombre="clientes" />
        </>
      )}
    </section>
  )
}
