# Botica – Frontend

Aplicación web del sistema de inventario y vencimientos. React 19 + Vite en JavaScript (componentes `.jsx`), diseñada primero para celular.

## Puesta en marcha

Necesita el [backend](../backend/README.md) corriendo en `http://localhost:3001`.

```bash
npm install
npm run dev        # http://localhost:5173
```

### Abrirla desde el celular

Con el celular y la computadora en la misma red Wi-Fi:

```bash
npm run dev:celular
```

Vite muestra una dirección `Network`, por ejemplo `https://192.168.1.106:5173`. Ábrela en el celular y acepta la advertencia de seguridad: el certificado es local y autofirmado. Va con `https` porque los navegadores solo prestan la cámara en páginas seguras.

En desarrollo no hay que configurar nada: Vite reenvía las llamadas a `/api` hacia el backend ([vite.config.js](vite.config.js)). En producción se define `VITE_API_URL` con la URL pública del backend (ver [.env.example](.env.example)).

## Pantallas

| Ruta | Quién | Qué hace |
| --- | --- | --- |
| `/panel` | Dueño | Tarjetas por grupo de vencimiento, distribución del valor, tabla de lotes con pestañas y buscador, dinero en riesgo y stock crítico |
| `/venta` | Todos | Caja: productos con su lote FEFO, boleta o factura, cliente, medio de pago y vuelto, IGV separado; al cobrar muestra el comprobante para imprimir. Atajos F2, F4 y F9 |
| `/ingreso` | Todos | Registra un lote que llegó: número, vencimiento, cantidad y costo |
| `/productos` | Todos (editar: dueño) | Catálogo con stock; el dueño crea, edita y desactiva |
| `/clientes` | Todos | Registrar, buscar, editar y eliminar clientes (DNI, CE o RUC) y ver su historial de compras |
| `/reportes` | Dueño | Inventario valorizado, lotes por vencer y ventas por período, en Excel o PDF |
| `/productos/importar` | Dueño | Importa el inventario desde Excel: plantilla, vista previa con errores por fila y confirmación |

## Estructura

| Archivo | Contenido |
| --- | --- |
| [src/api.js](src/api.js) | Única función que habla con el backend: agrega el token y convierte los errores |
| [src/archivos.js](src/archivos.js) | Arma los reportes en Excel (SheetJS) o PDF (jsPDF) en el navegador |
| [src/excel.js](src/excel.js) | Lee el Excel en el navegador con SheetJS y genera la plantilla |
| [src/sesion.jsx](src/sesion.jsx) | Quién inició sesión (contexto de React + `localStorage`) |
| [src/App.jsx](src/App.jsx) | Rutas según el rol |
| [src/paginas/](src/paginas/) | Una pantalla por archivo |
| [src/componentes/](src/componentes/) | Marco con el menú lateral, buscador de productos, escáner, paginación, íconos y elección de cliente |

## Notas

- **Escáner de códigos**: usa la cámara con `barcode-detector`, que lee con ZXing compilado a WebAssembly y analiza cada cuadro a la resolución real de la cámara. Se empezó con `html5-qrcode`, pero esa librería analiza la imagen al tamaño en que se muestra en pantalla y no lograba leer códigos de barras a distancia normal. El código debe ocupar al menos una sexta parte del ancho de la imagen y verse nítido; siempre se puede escribir a mano.
- **Excel**: SheetJS se instala desde su distribución oficial (`cdn.sheetjs.com`), porque el paquete `xlsx` de npm quedó desactualizado. Las fechas se leen como el número de días que guarda Excel y se convierten sin pasar por zonas horarias, para que no se corran un día.
- **Permisos**: ocultar un botón o una ruta según el rol es solo comodidad. Quien decide es el backend, que responde 403.
- **Sesión**: el token se guarda en `localStorage`; si vence o es rechazado, la app vuelve sola al login.

## Comandos

| Comando | Para qué |
| --- | --- |
| `npm run dev` | Servidor de desarrollo con recarga al guardar |
| `npm run dev:celular` | Igual, pero visible en la red Wi-Fi y con https, para probar desde el celular |
| `npm run build` | Genera `dist/` para publicar |
| `npm run lint` | Revisa el código con oxlint |
