// Formas de los datos que devuelve la API.
// Los montos llegan como texto ("12.50") porque en la base son DECIMAL: así no pierden precisión.

export type Rol = 'DUENO' | 'VENDEDOR'

export interface Sesion {
  accessToken: string
  usuario: { id: number; nombre: string; correo: string; rol: Rol }
  negocio: { id: number; nombre: string; tipo: 'BOTICA' | 'VETERINARIA' }
}

export interface Producto {
  id: number
  nombre: string
  laboratorio: string | null
  presentacion: string | null
  codigoBarras: string | null
  precioVenta: string
  stockMinimo: number
  activo: boolean
  stock: number
  stockBajo: boolean
}

export interface Lote {
  id: number
  productoId: number
  numeroLote: string
  fechaVencimiento: string
  cantidadActual: number
  costoUnitario: string
}

export type Tramo = 'VENCIDO' | 'DIAS_30' | 'DIAS_60' | 'DIAS_90'

export interface ResumenTramo {
  lotes: number
  unidades: number
  valor: string
}

export interface Panel {
  fecha: string
  dineroEnRiesgo: string
  dineroVencido: string
  vencimientos: {
    vencidos: ResumenTramo
    en30Dias: ResumenTramo
    en60Dias: ResumenTramo
    en90Dias: ResumenTramo
  }
  lotesPorVencer: {
    loteId: number
    producto: string
    presentacion: string | null
    numeroLote: string
    fechaVencimiento: string
    diasRestantes: number
    tramo: Tramo
    cantidadActual: number
    valor: string
  }[]
  productosStockBajo: {
    productoId: number
    producto: string
    presentacion: string | null
    stock: number
    stockMinimo: number
    faltante: number
  }[]
}

export interface Cliente {
  id: number
  documento: string
  nombre: string
  telefono: string | null
}

// Ficha del cliente con su historial de compras
export interface FichaCliente extends Cliente {
  compras: number
  totalGastado: string
  ultimaCompra: string | null
  ventas: {
    id: number
    fecha: string
    total: string
    productos: { nombre: string; presentacion: string | null; cantidad: number }[]
  }[]
}

// Conteo para el aviso del menú (sin montos)
export interface ResumenAlertas {
  stockBajo: number
  vencidos: number
  porVencer30: number
  total: number
}

export interface Venta {
  id: number
  fecha: string
  total: string
  cliente: { id: number; documento: string; nombre: string } | null
  detalles: {
    id: number
    cantidad: number
    precioUnitario: string
    producto: { nombre: string; presentacion: string | null }
    lote: { numeroLote: string; fechaVencimiento: string }
  }[]
}
