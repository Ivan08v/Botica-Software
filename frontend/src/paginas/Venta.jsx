import { useState } from 'react'
import { api, mensajeDe } from '../api'
import BuscadorProducto from '../componentes/BuscadorProducto.jsx'
import ElegirCliente from '../componentes/ElegirCliente.jsx'
import Icono from '../componentes/Icono.jsx'
import { desgloseIgv, fecha, fechaHora, soles, TIPOS_DOCUMENTO } from '../formato'
import { useSesion } from '../sesion.jsx'

const MEDIOS_PAGO = [
  { valor: 'EFECTIVO', nombre: 'Efectivo', icono: 'payments' },
  { valor: 'TARJETA', nombre: 'Tarjeta', icono: 'credit_card' },
  { valor: 'YAPE', nombre: 'Yape', icono: 'qr_code_2' },
  { valor: 'PLIN', nombre: 'Plin', icono: 'qr_code_scanner' },
  { valor: 'TRANSFERENCIA', nombre: 'Transferencia', icono: 'account_balance' },
]
const nombreMedio = (valor) => MEDIOS_PAGO.find((m) => m.valor === valor)?.nombre ?? valor

// SUNAT pide identificar al cliente en boletas de más de S/ 700 (el backend también lo valida)
const LIMITE_BOLETA_ANONIMA = 700
const BILLETES = [10, 20, 50, 100, 200]

// Comprobante ya registrado: lo que se entrega (o imprime) y de qué lotes sacar cada producto
function Comprobante({ venta, negocio, alTerminar }) {
  const { base, igv } = desgloseIgv(venta.total)
  const esFactura = venta.tipoComprobante === 'FACTURA'

  return (
    <div className="comprobante-pantalla">
      <p className="aviso exito con-icono no-imprimir">
        <Icono nombre="check_circle" /> Venta registrada: {venta.comprobante}
      </p>

      <article className="tarjeta comprobante">
        <header className="comprobante-cabecera">
          <span>
            <strong>{negocio}</strong>
            <span className="tenue">Representación interna: no reemplaza al comprobante electrónico</span>
          </span>
          <span className="comprobante-numero">
            <small>{esFactura ? 'FACTURA' : 'BOLETA DE VENTA'}</small>
            <strong>{venta.comprobante}</strong>
          </span>
        </header>

        <dl className="comprobante-datos">
          <div>
            <dt>Fecha</dt>
            <dd>{fechaHora(venta.fecha)}</dd>
          </div>
          <div>
            <dt>{esFactura ? 'Razón social' : 'Cliente'}</dt>
            <dd>{venta.cliente?.nombre ?? 'Cliente varios'}</dd>
          </div>
          {venta.cliente && (
            <div>
              <dt>{TIPOS_DOCUMENTO[venta.cliente.tipoDocumento]?.nombre}</dt>
              <dd>{venta.cliente.documento}</dd>
            </div>
          )}
          {venta.cliente?.direccion && (
            <div>
              <dt>Dirección</dt>
              <dd>{venta.cliente.direccion}</dd>
            </div>
          )}
          <div>
            <dt>Atendido por</dt>
            <dd>{venta.usuario.nombre}</dd>
          </div>
          <div>
            <dt>Medio de pago</dt>
            <dd>{nombreMedio(venta.medioPago)}</dd>
          </div>
        </dl>

        <div className="tabla-envoltura">
          <table className="comprobante-items">
            <thead>
              <tr>
                <th className="num">Cant.</th>
                <th>Descripción</th>
                <th className="num">P. unit.</th>
                <th className="num">Importe</th>
              </tr>
            </thead>
            <tbody>
              {venta.detalles.map((d) => (
                <tr key={d.id}>
                  <td className="num">{d.cantidad}</td>
                  <td className="producto">
                    <strong>{d.producto.nombre}</strong>
                    {/* FEFO: el sistema eligió el lote que vence antes */}
                    <span className="tenue">
                      Entregar del lote {d.lote.numeroLote} · vence {fecha(d.lote.fechaVencimiento)}
                    </span>
                  </td>
                  <td className="num">{soles(d.precioUnitario)}</td>
                  <td className="num">{soles(Number(d.precioUnitario) * d.cantidad)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="comprobante-totales">
          <div>
            <dt>Op. gravada</dt>
            <dd>{soles(base)}</dd>
          </div>
          <div>
            <dt>IGV (18 %)</dt>
            <dd>{soles(igv)}</dd>
          </div>
          <div className="total-final">
            <dt>Total</dt>
            <dd>{soles(venta.total)}</dd>
          </div>
          {venta.montoRecibido && (
            <>
              <div>
                <dt>Recibido</dt>
                <dd>{soles(venta.montoRecibido)}</dd>
              </div>
              <div className="vuelto">
                <dt>Vuelto</dt>
                <dd>{soles(venta.vuelto)}</dd>
              </div>
            </>
          )}
        </dl>
      </article>

      <div className="fila no-imprimir">
        <button className="boton con-icono" onClick={alTerminar}>
          <Icono nombre="add" /> Nueva venta
        </button>
        <button className="boton secundario con-icono" onClick={() => window.print()}>
          <Icono nombre="print" /> Imprimir
        </button>
      </div>
    </div>
  )
}

export default function Venta() {
  const { sesion } = useSesion()
  const [lineas, setLineas] = useState([])
  const [cliente, setCliente] = useState(null)
  const [tipo, setTipo] = useState('BOLETA')
  const [medio, setMedio] = useState('EFECTIVO')
  const [recibido, setRecibido] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [registrada, setRegistrada] = useState(null)

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
  const { base, igv } = desgloseIgv(total)
  const unidades = lineas.reduce((suma, l) => suma + l.cantidad, 0)
  const excedidas = lineas.filter((l) => l.cantidad > l.producto.stock)
  const esEfectivo = medio === 'EFECTIVO'
  const montoRecibido = esEfectivo && recibido !== '' ? Number(recibido) : null
  const vuelto = montoRecibido !== null ? montoRecibido - total : null
  // Billetes con los que podría pagar: los primeros que cubren el total
  const sugeridos = BILLETES.filter((b) => b > total).slice(0, 3)

  // Lo que falta para poder cobrar (el servidor vuelve a revisar todo)
  const problemas = [
    excedidas.length > 0 && 'Hay productos con más unidades que el stock disponible.',
    tipo === 'FACTURA' && !cliente && 'La factura necesita un cliente con RUC.',
    tipo === 'FACTURA' && cliente && cliente.tipoDocumento !== 'RUC' && 'La factura necesita un cliente con RUC.',
    tipo === 'BOLETA' &&
      !cliente &&
      total > LIMITE_BOLETA_ANONIMA &&
      `Una boleta de más de S/ ${LIMITE_BOLETA_ANONIMA} necesita el DNI del cliente.`,
    vuelto !== null && vuelto < 0 && 'El monto recibido no alcanza para el total.',
  ].filter(Boolean)

  async function cobrar() {
    setError('')
    setEnviando(true)
    try {
      const venta = await api('/ventas', {
        metodo: 'POST',
        cuerpo: {
          items: lineas.map((l) => ({ productoId: l.producto.id, cantidad: l.cantidad })),
          tipoComprobante: tipo,
          medioPago: medio,
          ...(cliente ? { clienteId: cliente.id } : {}),
          ...(montoRecibido !== null ? { montoRecibido } : {}),
        },
      })
      setRegistrada(venta)
      setLineas([])
      setCliente(null)
      setTipo('BOLETA')
      setMedio('EFECTIVO')
      setRecibido('')
    } catch (e) {
      // El servidor tiene la última palabra sobre el stock (otra caja pudo vender mientras tanto)
      setError(mensajeDe(e))
    } finally {
      setEnviando(false)
    }
  }

  if (registrada) {
    return <Comprobante venta={registrada} negocio={sesion.negocio.nombre} alTerminar={() => setRegistrada(null)} />
  }

  return (
    <div className="caja">
      <section className="tarjeta caja-productos">
        <h2>
          <span className="con-icono">
            <Icono nombre="shopping_cart" /> Productos
          </span>
          {lineas.length > 0 && (
            <span className="chip">
              {unidades} {unidades === 1 ? 'unidad' : 'unidades'}
            </span>
          )}
        </h2>
        <BuscadorProducto alElegir={agregar} />

        {lineas.length === 0 ? (
          <div className="carrito-vacio">
            <Icono nombre="barcode_scanner" />
            <p className="tenue">Busca o escanea un producto para agregarlo a la venta.</p>
          </div>
        ) : (
          <ul className="carrito">
            {lineas.map((l) => (
              <li key={l.producto.id}>
                <span className="carrito-producto">
                  <strong>{l.producto.nombre}</strong>
                  <span className="tenue">
                    {soles(l.producto.precioVenta)} c/u · stock {l.producto.stock}
                  </span>
                  {l.cantidad > l.producto.stock && (
                    <span className="etiqueta rojo">Solo hay {l.producto.stock}</span>
                  )}
                </span>
                <span className="contador-cantidad">
                  <button
                    type="button"
                    onClick={() => cambiarCantidad(l.producto.id, l.cantidad - 1)}
                    disabled={l.cantidad <= 1}
                    aria-label={`Una unidad menos de ${l.producto.nombre}`}
                  >
                    <Icono nombre="remove" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={l.cantidad}
                    onChange={(e) => cambiarCantidad(l.producto.id, e.target.valueAsNumber)}
                    aria-label={`Cantidad de ${l.producto.nombre}`}
                  />
                  <button
                    type="button"
                    onClick={() => cambiarCantidad(l.producto.id, l.cantidad + 1)}
                    aria-label={`Una unidad más de ${l.producto.nombre}`}
                  >
                    <Icono nombre="add" />
                  </button>
                </span>
                <strong className="cifra carrito-importe">{soles(Number(l.producto.precioVenta) * l.cantidad)}</strong>
                <button
                  type="button"
                  className="boton-icono chico peligro"
                  onClick={() => setLineas(lineas.filter((x) => x.producto.id !== l.producto.id))}
                  title="Quitar"
                  aria-label={`Quitar ${l.producto.nombre}`}
                >
                  <Icono nombre="delete" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="tarjeta caja-cobro">
        <h2>
          <span className="con-icono">
            <Icono nombre="receipt_long" /> Comprobante
          </span>
        </h2>

        <div className="paso">
          <span className="paso-titulo">Tipo de comprobante</span>
          <div className="segmentado" role="radiogroup" aria-label="Tipo de comprobante">
            {[
              ['BOLETA', 'Boleta', 'receipt'],
              ['FACTURA', 'Factura', 'description'],
            ].map(([valor, nombre, icono]) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={tipo === valor}
                onClick={() => setTipo(valor)}
              >
                <Icono nombre={icono} /> {nombre}
              </button>
            ))}
          </div>
        </div>

        <div className="paso">
          <span className="paso-titulo">
            Cliente
            <span className="tenue">
              {tipo === 'FACTURA' ? 'Obligatorio, con RUC' : `Opcional hasta S/ ${LIMITE_BOLETA_ANONIMA}`}
            </span>
          </span>
          <ElegirCliente cliente={cliente} alCambiar={setCliente} factura={tipo === 'FACTURA'} />
        </div>

        <div className="paso">
          <span className="paso-titulo">Medio de pago</span>
          <div className="medios-pago" role="radiogroup" aria-label="Medio de pago">
            {MEDIOS_PAGO.map((m) => (
              <button
                key={m.valor}
                type="button"
                role="radio"
                aria-checked={medio === m.valor}
                onClick={() => setMedio(m.valor)}
              >
                <Icono nombre={m.icono} />
                {m.nombre}
              </button>
            ))}
          </div>
        </div>

        {esEfectivo && (
          <div className="paso">
            <label className="paso-titulo" htmlFor="recibido">
              Monto recibido
              <span className="tenue">Para calcular el vuelto</span>
            </label>
            <div className="recibido">
              <span className="prefijo">S/</span>
              <input
                id="recibido"
                type="number"
                min={0}
                step="0.10"
                inputMode="decimal"
                placeholder={total.toFixed(2)}
                value={recibido}
                onChange={(e) => setRecibido(e.target.value)}
              />
            </div>
            {total > 0 && (
              <div className="billetes">
                <button type="button" onClick={() => setRecibido(total.toFixed(2))}>
                  Exacto
                </button>
                {sugeridos.map((b) => (
                  <button key={b} type="button" onClick={() => setRecibido(String(b))}>
                    S/ {b}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <dl className="resumen-cobro">
          <div>
            <dt>Op. gravada</dt>
            <dd>{soles(base)}</dd>
          </div>
          <div>
            <dt>IGV (18 %)</dt>
            <dd>{soles(igv)}</dd>
          </div>
          <div className="total-final">
            <dt>Total</dt>
            <dd>{soles(total)}</dd>
          </div>
          {vuelto !== null && vuelto >= 0 && (
            <div className="vuelto">
              <dt>Vuelto</dt>
              <dd>{soles(vuelto)}</dd>
            </div>
          )}
        </dl>

        {lineas.length > 0 &&
          problemas.map((p) => (
            <p key={p} className="aviso pendiente con-icono">
              <Icono nombre="info" /> {p}
            </p>
          ))}
        {error && <p className="aviso error">{error}</p>}

        <button
          className="boton boton-cobrar con-icono"
          disabled={lineas.length === 0 || problemas.length > 0 || enviando}
          onClick={cobrar}
        >
          <Icono nombre="point_of_sale" />
          {enviando ? 'Registrando…' : `Cobrar ${soles(total)}`}
        </button>
      </aside>
    </div>
  )
}
