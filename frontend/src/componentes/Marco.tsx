import { NavLink, Outlet } from 'react-router-dom'
import { useSesion } from '../sesion.tsx'
import AvisoAlertas from './AvisoAlertas.tsx'

// Encabezado y menú comunes a todas las pantallas. En celular el menú queda fijo abajo.
export default function Marco() {
  const { sesion, salir } = useSesion()
  if (!sesion) return null
  const esDueno = sesion.usuario.rol === 'DUENO'

  return (
    <div className="marco">
      <header className="encabezado">
        <div>
          <strong>{sesion.negocio.nombre}</strong>
          <span className="tenue">
            {sesion.usuario.nombre} · {esDueno ? 'Dueño(a)' : 'Vendedor(a)'}
          </span>
        </div>
        <div className="acciones-encabezado">
          {/* La dueña va al panel con el detalle; el vendedor, a productos (ve el stock bajo) */}
          <AvisoAlertas destino={esDueno ? '/panel' : '/productos'} />
          <button className="boton secundario chico" onClick={salir}>
            Salir
          </button>
        </div>
      </header>

      <nav className="menu">
        {esDueno && <NavLink to="/panel">Panel</NavLink>}
        <NavLink to="/venta">Venta</NavLink>
        <NavLink to="/ingreso">Ingreso</NavLink>
        <NavLink to="/productos">Productos</NavLink>
        <NavLink to="/clientes">Clientes</NavLink>
        {esDueno && <NavLink to="/reportes">Reportes</NavLink>}
      </nav>

      <main className="contenido">
        <Outlet />
      </main>
    </div>
  )
}
