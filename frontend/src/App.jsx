import { Navigate, Route, Routes } from 'react-router-dom'
import Marco from './componentes/Marco.jsx'
import Clientes from './paginas/Clientes.jsx'
import Importar from './paginas/Importar.jsx'
import Ingreso from './paginas/Ingreso.jsx'
import Login from './paginas/Login.jsx'
import Panel from './paginas/Panel.jsx'
import Productos from './paginas/Productos.jsx'
import Reportes from './paginas/Reportes.jsx'
import Venta from './paginas/Venta.jsx'
import { useSesion } from './sesion.jsx'

export default function App() {
  const { sesion } = useSesion()

  if (!sesion) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  const esDueno = sesion.usuario.rol === 'DUENO'
  // Cada rol aterriza en lo que más usa: la dueña en el panel, el vendedor en la venta
  const inicio = esDueno ? '/panel' : '/venta'

  return (
    <Routes>
      <Route element={<Marco />}>
        {/* Ocultar la ruta es solo comodidad: quien decide de verdad es el backend (403) */}
        {esDueno && <Route path="/panel" element={<Panel />} />}
        <Route path="/venta" element={<Venta />} />
        <Route path="/ingreso" element={<Ingreso />} />
        <Route path="/productos" element={<Productos />} />
        <Route path="/clientes" element={<Clientes />} />
        {esDueno && <Route path="/productos/importar" element={<Importar />} />}
        {esDueno && <Route path="/reportes" element={<Reportes />} />}
        <Route path="*" element={<Navigate to={inicio} replace />} />
      </Route>
    </Routes>
  )
}
