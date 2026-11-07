import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useSesion } from '../sesion.jsx'
import AvisoAlertas from './AvisoAlertas.jsx'
import Icono from './Icono.jsx'

// Módulos del menú. `soloDueno` los oculta al vendedor (el backend igual lo impide con 403).
// `titulo` va en el menú lateral y en la barra superior; `corto`, en el menú de abajo del celular.
const MODULOS = [
  { ruta: '/panel', titulo: 'Panel de control', corto: 'Panel', icono: 'dashboard', soloDueno: true },
  { ruta: '/venta', titulo: 'Ventas', corto: 'Venta', icono: 'point_of_sale' },
  { ruta: '/ingreso', titulo: 'Ingreso de lotes', corto: 'Ingreso', icono: 'move_to_inbox' },
  { ruta: '/productos', titulo: 'Productos y stock', corto: 'Productos', icono: 'inventory_2' },
  { ruta: '/clientes', titulo: 'Clientes', corto: 'Clientes', icono: 'group' },
  { ruta: '/reportes', titulo: 'Reportes', corto: 'Reportes', icono: 'receipt_long', soloDueno: true },
]

function tituloDe(ruta) {
  if (ruta === '/productos/importar') return 'Importar inventario'
  return MODULOS.find((m) => ruta.startsWith(m.ruta))?.titulo ?? ''
}

// Estructura común a todas las pantallas: menú lateral en escritorio, menú abajo en celular
// y una barra superior con el título de la pantalla, las alertas y el acceso a una venta nueva.
export default function Marco() {
  const { sesion, salir } = useSesion()
  const { pathname } = useLocation()
  if (!sesion) return null
  const esDueno = sesion.usuario.rol === 'DUENO'
  const modulos = MODULOS.filter((m) => esDueno || !m.soloDueno)
  const rol = esDueno ? 'Dueño(a)' : 'Vendedor(a)'

  return (
    <div className="marco">
      <aside className="lateral">
        <div className="lateral-marca">
          <span className="logo">
            <Icono nombre="local_pharmacy" />
          </span>
          <span>
            <strong>{sesion.negocio.nombre}</strong>
            <small>Inventario y vencimientos</small>
          </span>
        </div>

        <p className="lateral-seccion">Módulos</p>
        <nav className="lateral-menu" aria-label="Menú principal">
          {modulos.map((m) => (
            <NavLink key={m.ruta} to={m.ruta}>
              <Icono nombre={m.icono} />
              {m.titulo}
            </NavLink>
          ))}
        </nav>

        <div className="lateral-usuario">
          <span className="avatar">
            <Icono nombre="person" />
          </span>
          <span className="lateral-usuario-datos">
            <strong>{sesion.usuario.nombre}</strong>
            <small>{rol}</small>
          </span>
          <button type="button" className="boton-icono" onClick={salir} title="Cerrar sesión" aria-label="Cerrar sesión">
            <Icono nombre="logout" />
          </button>
        </div>
      </aside>

      <div className="area">
        <header className="barra-superior">
          {/* En celular no hay menú lateral: el nombre del negocio va aquí */}
          <div className="barra-superior-titulo">
            <span className="logo solo-movil-flex">
              <Icono nombre="local_pharmacy" />
            </span>
            <span>
              <strong className="solo-movil-bloque">{sesion.negocio.nombre}</strong>
              <h1>{tituloDe(pathname)}</h1>
            </span>
          </div>
          <div className="barra-superior-acciones">
            {/* La dueña va al panel con el detalle; el vendedor, a productos (ve el stock bajo) */}
            <AvisoAlertas destino={esDueno ? '/panel' : '/productos'} />
            {pathname !== '/venta' && (
              <Link to="/venta" className="boton chico con-icono solo-escritorio-flex">
                <Icono nombre="add" /> Nueva venta
              </Link>
            )}
            <button
              type="button"
              className="boton-icono solo-movil-flex"
              onClick={salir}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <Icono nombre="logout" />
            </button>
          </div>
        </header>

        <main className="contenido">
          <Outlet />
        </main>
      </div>

      <nav className="menu-movil" aria-label="Menú principal">
        {modulos.map((m) => (
          <NavLink key={m.ruta} to={m.ruta}>
            <Icono nombre={m.icono} />
            <span>{m.corto}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
