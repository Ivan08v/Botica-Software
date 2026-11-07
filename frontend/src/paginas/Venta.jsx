import { useState } from 'react'
import { api, mensajeDe } from '../api'
import BuscadorProducto from '../componentes/BuscadorProducto.jsx'
import ElegirCliente from '../componentes/ElegirCliente.jsx'
import { fecha, soles } from '../formato'

export default function Venta() {
  const [lineas, setLineas] = useState([])
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [registrada, setRegistrada] = useState(null)
  const [cliente, setCliente] = useState(null)

  // Elegir (o escanear) un producto que ya está en la lista suma una unidad más
  function agregar(producto) {
    setError('')
    setLineas((actuales) => {
      const existe = actuales.some((l) => l.producto.id === producto.id)
      return existe
        ? actuales.map((l) => (l.producto.id === producto.id ? { ...l, cantidad: l.cantidad + 1 } : l))
        : [...actuales, { producto, cantidad: 1 }]
    })
  }

  function cambiarCantidad(productoId, cantidad) {
    setLineas((actuales) =>
      actuales.map((l) => (l.producto.id === productoId ? { ...l, cantidad: Math.max(1, cantidad || 1) } : l)),
    )
  }

  const total = lineas.reduce((suma, l) => suma + Number(l.producto.precioVenta) * l.cantidad, 0)
  const excedidas = lineas.filter((l) => l.cantidad > l.producto.stock)

  async function registrar() {
    setError('')
    setEnviando(true)
    try {
      const venta = await api('/ventas', {
        metodo: 'POST',
        cuerpo: {
          items: lineas.map((l) => ({ productoId: l.producto.id, cantidad: l.cantidad })),
          ...(cliente ? { clienteId: cliente.id } : {}),
        },
      })
      setRegistrada(venta)
      setLineas([])
      setCliente(null)
    } catch (e) {
      // El servidor tiene la última palabra sobre el stock (otra caja pudo vender mientras tanto)
      setError(mensajeDe(e))
    } finally {
      setEnviando(false)
    }
  }

  if (registrada) {
    return (
      <section className="tarjeta">
        <p className="aviso exito">Venta #{registrada.id} registrada</p>
        {registrada.cliente && (
          <p className="tenue">
            Cliente: <strong>{registrada.cliente.nombre}</strong> · DNI {registrada.cliente.documento}
          </p>
        )}
        <p className="total">
          Total <strong>{soles(registrada.total)}</strong>
        </p>
        <h2>Entregar de estos lotes</h2>
        <p className="tenue">El sistema eligió primero los que vencen antes.</p>
        <ul className="lista">
          {registrada.detalles.map((d) => (
            <li key={d.id}>
              <span>
                <strong>
                  {d.cantidad} × {d.producto.nombre}
                </strong>
                <span className="tenue">
                  Lote {d.lote.numeroLote} · vence {fecha(d.lote.fechaVencimiento)}
                </span>
              </span>
              <span>{soles(Number(d.precioUnitario) * d.cantidad)}</span>
            </li>
          ))}
        </ul>
        <button className="boton" onClick={() => setRegistrada(null)}>
          Nueva venta
        </button>
      </section>
    )
  }

  return (
    <>
      <section className="tarjeta">
        <h2>Nueva venta</h2>
        <BuscadorProducto alElegir={agregar} />
      </section>

      <section className="tarjeta">
        {lineas.length === 0 ? (
          <p className="tenue">Busca o escanea un producto para agregarlo a la venta.</p>
        ) : (
          <ul className="lista">
            {lineas.map((l) => (
              <li key={l.producto.id}>
                <span>
                  <strong>{l.producto.nombre}</strong>
                  <span className="tenue">
                    {soles(l.producto.precioVenta)} c/u · stock {l.producto.stock}
                  </span>
                  {l.cantidad > l.producto.stock && <span className="etiqueta rojo">Solo hay {l.producto.stock}</span>}
                </span>
                <span className="fila">
                  <input
                    className="cantidad"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={l.cantidad}
                    onChange={(e) => cambiarCantidad(l.producto.id, e.target.valueAsNumber)}
                    aria-label={`Cantidad de ${l.producto.nombre}`}
                  />
                  <button
                    className="boton secundario chico"
                    onClick={() => setLineas(lineas.filter((x) => x.producto.id !== l.producto.id))}
                    aria-label={`Quitar ${l.producto.nombre}`}
                  >
                    Quitar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <h2 className="subtitulo">Cliente</h2>
        <ElegirCliente cliente={cliente} alCambiar={setCliente} />

        {error && <p className="aviso error">{error}</p>}

        <p className="total">
          Total <strong>{soles(total)}</strong>
        </p>
        <button
          className="boton"
          disabled={lineas.length === 0 || excedidas.length > 0 || enviando}
          onClick={registrar}
        >
          {enviando ? 'Registrando…' : 'Registrar venta'}
        </button>
      </section>
    </>
  )
}
