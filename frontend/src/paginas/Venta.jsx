import { useEffect, useRef, useState } from 'react'
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
]
// Las ventas antiguas pueden tener TRANSFERENCIA, que ya no se ofrece en la caja
const nombreMedio = (valor) =>
  MEDIOS_PAGO.find((m) => m.valor === valor)?.nombre ?? (valor === 'TRANSFERENCIA' ? 'Transferencia' : valor)

// SUNAT pide identificar al cliente en boletas de más de S/ 700 (el backend también lo valida)
const LIMITE_BOLETA_ANONIMA = 700
const BILLETES = [10, 20, 50, 100, 200]

// Comprobante ya registrado: lo que se entrega (o imprime) y de qué lotes sacar cada producto
function Comprobante({ venta, negocio, alTerminar, imprimirAlAbrir }) {
  // 'Cobrar e imprimir': al aparecer el comprobante se abre una sola vez el diálogo de impresión
  const impreso = useRef(false)
  useEffect(() => {
    if (imprimirAlAbrir && !impreso.current) {
      impreso.current = true
      window.print()
    }
  }, [imprimirAlAbrir])

  // El IGV lo calcula y guarda el servidor al registrar la venta
  const base = venta.opGravada
  const igv = venta.igv
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

// Caja: productos a la izquierda (buscador, lista y accesos rápidos) y cobro a la derecha
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
  // Número que llevará el próximo comprobante y productos más vendidos (se refrescan tras cada venta)
  const [proximo, setProximo] = useState(null)
  const [frecuentes, setFrecuentes] = useState([])
  const [recargar, setRecargar] = useState(0)

  useEffect(() => {
    // Son ayudas visuales: si fallan, la caja sigue funcionando sin ellas
    api('/ventas/proximo-comprobante')
      .then(setProximo)
      .catch(() => setProximo(null))
    api('/productos/frecuentes')
      .then(setFrecuentes)
      .catch(() => setFrecuentes([]))
  }, [recargar])

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

  function nuevaVenta() {
    setLineas([])
    setCliente(null)
    setTipo('BOLETA')
    setMedio('EFECTIVO')
    setRecibido('')
    setError('')
    setRegistrada(null)
  }

  const importes = lineas.map((l) => Number(l.producto.precioVenta) * l.cantidad)
  const total = importes.reduce((suma, i) => suma + i, 0)
  // Vista previa del IGV incluido en los precios (el servidor hace el cálculo oficial al cobrar)
  const { base, igv } = desgloseIgv(importes)
  const excedidas = lineas.filter((l) => l.cantidad > l.producto.stock)
  const esEfectivo = medio === 'EFECTIVO'
  const esBilletera = medio === 'YAPE' || medio === 'PLIN'
  const montoRecibido = esEfectivo && recibido !== '' ? Number(recibido) : null
  const vuelto = montoRecibido !== null ? montoRecibido - total : null
  // Billetes con los que podría pagar: los primeros que cubren el total
  const sugeridos = BILLETES.filter((b) => b > total).slice(0, 3)

  // Lo que falta para poder cobrar (el servidor vuelve a revisar todo)
  const problemas = [
    excedidas.length > 0 && 'Hay productos con más unidades que el stock disponible.',
    tipo === 'FACTURA' && cliente?.tipoDocumento !== 'RUC' && 'La factura necesita un cliente con RUC.',
    tipo === 'BOLETA' &&
      !cliente &&
      total > LIMITE_BOLETA_ANONIMA &&
      `Una boleta de más de S/ ${LIMITE_BOLETA_ANONIMA} necesita el DNI del cliente.`,
    vuelto !== null && vuelto < 0 && 'El monto recibido no alcanza para el total.',
  ].filter(Boolean)
  const puedeCobrar = lineas.length > 0 && problemas.length === 0 && !enviando

  async function cobrar() {
    if (!puedeCobrar) return
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
      nuevaVenta()
      setRegistrada(venta)
      setRecargar((n) => n + 1)
    } catch (e) {
      // El servidor tiene la última palabra sobre el stock (otra caja pudo vender mientras tanto)
      setError(mensajeDe(e))
    } finally {
      setEnviando(false)
    }
  }

  // Atajos de teclado de la caja: F2 nueva venta, F4 buscar, F9 cobrar.
  // Se vuelve a registrar en cada render para usar siempre el estado actual.
  useEffect(() => {
    function alPresionar(e) {
      if (e.key === 'F2') {
        e.preventDefault()
        if (registrada || lineas.length === 0 || window.confirm('¿Descartar la venta actual y empezar otra?')) {
          nuevaVenta()
        }
      } else if (e.key === 'F4') {
        e.preventDefault()
        document.getElementById('buscar-producto')?.focus()
      } else if (e.key === 'F9' && !registrada) {
        e.preventDefault()
        cobrar()
      }
    }
    window.addEventListener('keydown', alPresionar)
    return () => window.removeEventListener('keydown', alPresionar)
  })

  if (registrada) {
    return <Comprobante venta={registrada} negocio={sesion.negocio.nombre} alTerminar={nuevaVenta} imprimirAlAbrir />
  }

  return (
    <div className="caja">
      <section className="caja-izquierda">
        <div className="tarjeta caja-buscador">
          <BuscadorProducto alElegir={agregar} />
        </div>

        <div className="tarjeta caja-carrito">
          <header className="caja-carrito-cabecera">
            <span>Productos en esta venta ({lineas.length})</span>
            {lineas.length > 0 && (
              <button
                type="button"
                className="boton-texto peligro"
                onClick={() => window.confirm('¿Quitar todos los productos de esta venta?') && setLineas([])}
              >
                <Icono nombre="delete" /> Vaciar venta
              </button>
            )}
          </header>

          {lineas.length === 0 ? (
            <div className="carrito-vacio">
              <Icono nombre="barcode_scanner" />
              <p className="tenue">
                Busca o escanea un producto para agregarlo. <kbd>F4</kbd> lleva al buscador.
              </p>
            </div>
          ) : (
            <ul className="carrito">
              {lineas.map((l) => {
                const lote = l.producto.proximoLote
                const excede = l.cantidad > l.producto.stock
                return (
                  <li key={l.producto.id}>
                    <span className="carrito-producto">
                      <span className="carrito-nombre">
                        <strong>{l.producto.nombre}</strong>
                        {l.producto.presentacion && <span className="chip">{l.producto.presentacion}</span>}
                      </span>
                      <span className="carrito-meta">
                        {/* FEFO: sale primero el lote que vence antes */}
                        {lote && (
                          <>
                            <span>
                              Lote: <strong>{lote.numeroLote}</strong>
                            </span>
                            <span>
                              Vcto: <strong>{fecha(lote.fechaVencimiento)}</strong>
                            </span>
                          </>
                        )}
                        <span className={excede ? 'texto-error' : 'texto-exito'}>
                          {excede ? `Solo hay ${l.producto.stock}` : `Stock: ${l.producto.stock}`}
                        </span>
                      </span>
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
                    <span className="carrito-precio">
                      <small>{soles(l.producto.precioVenta)} c/u</small>
                      <strong className="cifra">{soles(Number(l.producto.precioVenta) * l.cantidad)}</strong>
                    </span>
                    <button
                      type="button"
                      className="boton-icono chico peligro"
                      onClick={() => setLineas(lineas.filter((x) => x.producto.id !== l.producto.id))}
                      title="Quitar"
                      aria-label={`Quitar ${l.producto.nombre}`}
                    >
                      <Icono nombre="close" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {frecuentes.length > 0 && (
          <div className="tarjeta caja-comunes">
            <span className="caja-comunes-titulo">Más vendidos</span>
            <span className="caja-comunes-lista">
              {frecuentes.map((p) => (
                <button key={p.id} type="button" onClick={() => agregar(p)} title={`Agregar ${p.nombre}`}>
                  + {p.nombre}
                </button>
              ))}
            </span>
          </div>
        )}
      </section>

      <aside className="tarjeta caja-cobro">
        <header className="caja-cobro-cabecera">
          <span className="con-icono">
            <Icono nombre="receipt_long" /> Comprobante de pago
          </span>
          {proximo && <span className="numero-proximo" title="Número que llevará este comprobante">{proximo[tipo]}</span>}
        </header>

        <div className="paso">
          <span className="paso-titulo">Tipo de documento</span>
          <div className="segmentado" role="radiogroup" aria-label="Tipo de comprobante">
            {[
              ['BOLETA', 'Boleta'],
              ['FACTURA', 'Factura'],
            ].map(([valor, nombre]) => (
              <button key={valor} type="button" role="radio" aria-checked={tipo === valor} onClick={() => setTipo(valor)}>
                {nombre}
              </button>
            ))}
          </div>
        </div>

        <div className="paso">
          <span className="paso-titulo">
            Cliente
            {cliente ? (
              <button type="button" className="enlace-chico" onClick={() => setCliente(null)}>
                Cliente varios
              </button>
            ) : (
              <span className="tenue">
                {tipo === 'FACTURA' ? 'Obligatorio, con RUC' : `Opcional hasta S/ ${LIMITE_BOLETA_ANONIMA}`}
              </span>
            )}
          </span>
          <ElegirCliente cliente={cliente} alCambiar={setCliente} factura={tipo === 'FACTURA'} />
        </div>

        <div className="paso">
          <span className="paso-titulo">Medio de pago</span>
          <div className="medios-pago" role="radiogroup" aria-label="Medio de pago">
            <button
              type="button"
              role="radio"
              aria-checked={esEfectivo}
              className="medio-efectivo"
              onClick={() => setMedio('EFECTIVO')}
            >
              {esEfectivo && <span className="marca-elegido"><Icono nombre="check" /></span>}
              <Icono nombre="payments" />
              Efectivo
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={medio === 'TARJETA'}
              className="medio-tarjeta"
              onClick={() => {
                setMedio('TARJETA')
                setRecibido('')
              }}
            >
              {medio === 'TARJETA' && <span className="marca-elegido"><Icono nombre="check" /></span>}
              <Icono nombre="credit_card" />
              Tarjeta
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={esBilletera}
              className="medio-billetera"
              onClick={() => {
                if (!esBilletera) setMedio('YAPE')
                setRecibido('')
              }}
            >
              {esBilletera && <span className="marca-elegido"><Icono nombre="check" /></span>}
              <span className="puntos-billetera">
                <span className="punto-yape" />
                <Icono nombre="smartphone" />
                <span className="punto-plin" />
              </span>
              <span>
                <b className="texto-yape">Yape</b> / <b className="texto-plin">Plin</b>
              </span>
            </button>
          </div>
          {/* Se guarda cuál de los dos se usó, para cuadrar la caja con cada aplicativo */}
          {esBilletera && (
            <div className="segmentado chico" role="radiogroup" aria-label="Aplicativo">
              {[
                ['YAPE', 'Yape'],
                ['PLIN', 'Plin'],
              ].map(([valor, nombre]) => (
                <button key={valor} type="button" role="radio" aria-checked={medio === valor} onClick={() => setMedio(valor)}>
                  {nombre}
                </button>
              ))}
            </div>
          )}
        </div>

        {esEfectivo && (
          <div className="caja-efectivo">
            <label className="caja-efectivo-fila" htmlFor="recibido">
              <span>Monto recibido</span>
              <span className="recibido">
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
              </span>
            </label>
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
            {vuelto !== null && vuelto >= 0 && (
              <div className="vuelto-entregar">
                <span>Vuelto a entregar</span>
                <strong>{soles(vuelto)}</strong>
              </div>
            )}
          </div>
        )}

        {/* Totales y botón quedan fijos al pie del panel: siempre a la vista aunque el panel se desplace */}
        <div className="caja-cobro-pie">
          {lineas.length > 0 &&
            problemas.map((p) => (
              <p key={p} className="aviso pendiente con-icono">
                <Icono nombre="info" /> {p}
              </p>
            ))}
          {error && <p className="aviso error">{error}</p>}

          <dl className="resumen-cobro">
            <div>
              <dt>Op. gravada</dt>
              <dd>{soles(base)}</dd>
            </div>
            <div>
              <dt>IGV (18 %)</dt>
              <dd>{soles(igv)}</dd>
            </div>
            <div className="total-a-pagar">
              <dt>Total a pagar</dt>
              <dd>{soles(total)}</dd>
            </div>
          </dl>

          <button className="boton-cobrar con-icono" disabled={!puedeCobrar} onClick={cobrar}>
            <Icono nombre="print" />
            {enviando ? 'Registrando…' : 'Cobrar e imprimir (F9)'}
          </button>
        </div>
      </aside>
    </div>
  )
}
