# Botica – Backend

API del sistema de inventario y vencimientos para boticas y veterinarias. NestJS + Prisma 7 + PostgreSQL 16.

## Modelo de datos

| Tabla | Qué guarda |
| --- | --- |
| `negocios` | Cada botica o veterinaria que usa el sistema |
| `usuarios` | Personas que usan el sistema, con rol `DUENO` o `VENDEDOR`; cada una pertenece a un negocio |
| `productos` | Catálogo: nombre, laboratorio, presentación, código de barras, precio y stock mínimo |
| `lotes` | Cada ingreso de mercadería: número de lote, fecha de vencimiento, cantidad y costo |
| `clientes` | Clientes del negocio identificados por DNI, carné de extranjería o RUC, con nombre (o razón social), teléfono, correo y dirección fiscal |
| `ventas` | Cabecera de cada venta: fecha, usuario, cliente, total, comprobante (boleta o factura, con serie y número), medio de pago y monto recibido |
| `detalle_venta` | Una línea por cada lote usado en una venta (para FEFO) |
| `movimientos` | Historial de todo lo que cambia el stock: ingresos, ventas, ajustes y bajas por vencimiento |

El stock de un producto no se guarda en `productos`: es la suma de `cantidad_actual` de sus lotes no vencidos. Así nunca hay dos números que se contradigan.

## Varios negocios en una misma base

Cada botica o veterinaria es una fila de `negocios`, y usuarios, productos, lotes, ventas y movimientos llevan su `negocio_id`. Al iniciar sesión, el `negocioId` del usuario queda dentro del token JWT firmado, y todas las consultas filtran por él: el cliente nunca puede elegir el negocio. Un dato de otro negocio responde `404`, igual que si no existiera.

El código de barras es único por negocio (no en toda la base), porque dos boticas venden el mismo producto. Las pruebas de [test/aislamiento.e2e-spec.ts](test/aislamiento.e2e-spec.ts) verifican que un negocio no puede ver, editar ni vender lo de otro.

## Requisitos

- Node.js 24 o superior
- Docker Desktop (para la base de datos local)

## Puesta en marcha

```bash
npm install
cp .env.example .env                   # y cambia JWT_SECRET
npm run db:up                          # levanta PostgreSQL en Docker (puerto 5434)
npm run db:generate                    # genera el cliente de Prisma en src/generated
npm run db:migrate                     # crea las tablas
npm run db:seed                        # carga dos negocios demo con sus productos y lotes
npm run start:dev                      # API en http://localhost:3001/api
```

Usuarios de prueba (contraseña `Demo1234`):

- `dueno@demo.pe`: dueña de Botica Demo (50 productos)
- `vendedor@demo.pe`: vendedor de Botica Demo
- `veterinaria@demo.pe`: dueño de Veterinaria Demo (8 productos)

Los datos de prueba calculan los vencimientos desde el día en que ejecutas el seed, así que la demo siempre tiene productos vencidos, por vencer y en buen estado. Los códigos de barras son ficticios.

## Ver la base con DBeaver

Nueva conexión PostgreSQL con: host `localhost`, puerto `5434`, base `botica`, usuario `botica`, contraseña `botica`. Úsalo para consultar; los cambios de estructura se hacen con migraciones de Prisma (`npm run db:migrate`), no a mano, para que el historial de migraciones no se desincronice.

## Endpoints

Todas las rutas llevan el prefijo `/api` y, salvo el login, piden el encabezado `Authorization: Bearer <token>`. Cada una trabaja solo con los datos del negocio del usuario.

| Método y ruta | Quién | Qué hace |
| --- | --- | --- |
| `POST /auth/login` | Público | Devuelve `accessToken`, los datos del usuario y su negocio |
| `GET /auth/me` | Cualquier rol | Usuario del token |
| `GET /productos?buscar=&incluirInactivos=` | Cualquier rol | Lista con `stock` y `stockBajo` calculados |
| `GET /productos/:id` | Cualquier rol | Producto con sus lotes |
| `GET /productos/codigo/:codigoBarras` | Cualquier rol | Búsqueda para el lector de códigos |
| `POST /productos` | DUENO | Crea un producto |
| `PATCH /productos/:id` | DUENO | Edita (o reactiva con `activo: true`) |
| `DELETE /productos/:id` | DUENO | Desactiva (no borra, para conservar el historial) |
| `GET /lotes?productoId=` | Cualquier rol | Lotes ordenados por vencimiento |
| `POST /lotes` | Cualquier rol | Ingresa un lote y registra el movimiento `INGRESO` |
| `POST /ventas` | Cualquier rol | Registra una venta `{ "items": [{ "productoId": 1, "cantidad": 3 }], "clienteId": 5, "tipoComprobante": "BOLETA", "medioPago": "EFECTIVO", "montoRecibido": 20 }` descontando stock con FEFO. Solo `items` es obligatorio (ver [Comprobantes y medios de pago](#comprobantes-y-medios-de-pago)) |
| `GET /ventas` | Cualquier rol | Últimas 50 ventas |
| `GET /ventas/:id` | Cualquier rol | Venta con el detalle de cada lote usado, el código del comprobante (`B001-00000012`) y el vuelto |
| `POST /importacion/vista-previa` | DUENO | Valida las filas de un Excel de inventario y devuelve el estado de cada una, sin guardar |
| `POST /importacion/confirmar` | DUENO | Vuelve a validar y guarda productos, lotes y movimientos en una transacción |
| `GET /reportes/inventario?venceEnDias=` | DUENO | Lotes con stock valorizados al costo y a precio de venta; con `venceEnDias`, solo lo vencido o por vencer |
| `GET /reportes/ventas?desde=&hasta=` | DUENO | Ventas de un período (días de Perú, hasta un año), con costo y ganancia por lote vendido |
| `GET /panel` | DUENO | Vencimientos (vencidos, 30, 60 y 90 días), dinero en riesgo y productos con stock bajo |
| `GET /alertas` | Cualquier rol | Conteo para el aviso del menú: productos por reponer, lotes vencidos y lotes que vencen en 30 días (sin montos) |
| `GET /clientes?buscar=` | Cualquier rol | Busca clientes por documento (inicio) o nombre, con su número de compras |
| `GET /clientes/documento/:documento` | Cualquier rol | Busca un cliente por su DNI o RUC desde la caja |
| `GET /clientes/:id` | Cualquier rol | Ficha con número de compras, total gastado y sus últimas 20 ventas |
| `POST /clientes` | Cualquier rol | Registra un cliente (documento único por negocio). Si no se indica `tipoDocumento`, se deduce: 8 dígitos es DNI, 11 dígitos es RUC |
| `PATCH /clientes/:id` | Cualquier rol | Edita sus datos; un opcional enviado vacío se borra |
| `DELETE /clientes/:id` | Cualquier rol | Elimina un cliente **sin compras** (`204`). Con compras responde `409`, para no perder su historial |

## Ventas con FEFO

FEFO (*first expired, first out*): sale primero lo que vence primero. Al registrar una venta:

1. Todo ocurre en **una transacción**: si un producto no tiene stock suficiente, no se descuenta ni se guarda nada (respuesta `409`).
2. Los lotes vendibles del producto (no vencidos y con stock) se leen ordenados por vencimiento con `SELECT ... FOR UPDATE`. Ese bloqueo hace que dos ventas simultáneas del mismo producto se atiendan una después de la otra, y la segunda ve el stock ya descontado.
3. La cantidad se reparte lote por lote ([src/ventas/fefo.ts](src/ventas/fefo.ts)); se guarda una línea de `detalle_venta` y un movimiento `VENTA` por cada lote usado.
4. Como última barrera, la base tiene `CHECK (cantidad_actual >= 0)`.

Las pruebas cubren: venta que usa varios lotes, stock insuficiente, lotes vencidos que no se venden y ventas simultáneas ([test/ventas.e2e-spec.ts](test/ventas.e2e-spec.ts)).

## Comprobantes y medios de pago

Cada venta guarda qué comprobante se entregó y cómo se pagó. El sistema los numera, pero **no los envía a SUNAT**: no reemplaza a la facturación electrónica.

- **Boleta o factura**, con serie y número correlativo por negocio: `B001-00000001`, `F001-00000001`. Un bloqueo de PostgreSQL (`pg_advisory_xact_lock`, uno por negocio y tipo) hace que dos ventas simultáneas reciban números seguidos, sin saltos ni repetidos.
- **La factura exige un cliente con RUC.** La boleta puede ser anónima hasta S/ 700; por encima, SUNAT pide identificar al cliente.
- **Medio de pago**: `EFECTIVO`, `TARJETA`, `YAPE`, `PLIN` o `TRANSFERENCIA`. En efectivo se puede indicar el `montoRecibido` y la respuesta trae el `vuelto`; si no cubre el total, la venta se rechaza (y la base lo impide con un `CHECK`).
- **Un cliente con compras no se elimina**: la llave foránea es `ON DELETE RESTRICT`, así ninguna venta queda sin saber a quién se le hizo.

Las pruebas están en [test/comprobantes.e2e-spec.ts](test/comprobantes.e2e-spec.ts) (incluye diez ventas simultáneas que reciben diez números seguidos) y en [test/clientes.e2e-spec.ts](test/clientes.e2e-spec.ts).

## Panel

`GET /panel` devuelve en una sola llamada lo que el dueño necesita ver al abrir el sistema:

- **Vencimientos** por tramo (`VENCIDO`, `DIAS_30`, `DIAS_60`, `DIAS_90`), con número de lotes, unidades y valor.
- **Dinero en riesgo**: soles, al costo, en lotes con stock que vencen en los próximos 90 días. Lo ya vencido se informa aparte (`dineroVencido`).
- **Stock bajo**: productos cuyo stock vendible está por debajo de su mínimo. El stock vencido no cuenta.

## Importación desde Excel

El navegador lee el archivo y envía las filas como JSON (una fila por lote, hasta 2000). El servidor nunca recibe el archivo.

- **Dos pasos**: `vista-previa` no guarda nada; `confirmar` repite la validación dentro de la transacción, porque los datos pudieron cambiar y nunca se confía en un resultado enviado por el navegador.
- **Misma función para ambos** ([src/importacion/analisis.ts](src/importacion/analisis.ts)): lo que se ve en la vista previa es exactamente lo que se guarda.
- **Errores por fila**: una fila mala no rechaza el archivo; se omite y se informa con su número de fila.
- **Reimportar no duplica**: un lote que ya existe se omite. Un producto se reconoce por su código de barras o, si no tiene, por nombre y presentación.
- **Lotes vencidos**: se aceptan con un aviso, porque el inventario inicial puede incluir mercadería vencida sin retirar.

## Reportes

Los endpoints de reportes devuelven JSON; el navegador lo convierte en Excel o PDF. El servidor no genera archivos, y el mismo endpoint sirve para ambos formatos.

- **Ventas por día de Perú**: un período del 01/10 al 09/10 va desde las 00:00 del 01/10 hasta las 23:59 del 09/10 en Lima (05:00 UTC). Una venta a las 23:30 cuenta en ese día aunque en UTC ya sea el siguiente.
- **Ganancia con el costo real**: gracias a FEFO cada línea de venta sabe de qué lote salió, así que la ganancia usa el costo de ese lote y no un promedio.

## Comandos

| Comando | Para qué |
| --- | --- |
| `npm run start:dev` | Levanta la API y la reinicia al guardar cambios |
| `npm test` | Pruebas unitarias |
| `npm run test:e2e` | Pruebas de extremo a extremo. Usan su propia base `botica_test`, que se crea, migra y carga sola; no tocan la de desarrollo |
| `npm run db:up` | Levanta PostgreSQL en Docker |
| `npm run db:migrate` | Crea o actualiza las tablas después de cambiar `schema.prisma` |
| `npm run db:generate` | Regenera el cliente de Prisma |
| `npm run db:seed` | Borra todo y vuelve a cargar los datos de prueba |
| `npm run db:studio` | Explora los datos en el navegador |
| `npm run typecheck` | Revisa los tipos de TypeScript |
