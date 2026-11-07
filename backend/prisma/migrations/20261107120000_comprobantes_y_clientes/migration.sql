-- Comprobante (boleta o factura con serie y número), medio de pago y monto recibido en cada venta.
-- Clientes con tipo de documento (DNI, CE o RUC), email y dirección fiscal.

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('DNI', 'CE', 'RUC');

-- CreateEnum
CREATE TYPE "TipoComprobante" AS ENUM ('BOLETA', 'FACTURA');

-- CreateEnum
CREATE TYPE "MedioPago" AS ENUM ('EFECTIVO', 'TARJETA', 'YAPE', 'PLIN', 'TRANSFERENCIA');

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "direccion" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "tipo_documento" "TipoDocumento" NOT NULL DEFAULT 'DNI';

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "medio_pago" "MedioPago" NOT NULL DEFAULT 'EFECTIVO',
ADD COLUMN     "monto_recibido" DECIMAL(10,2),
ADD COLUMN     "numero" INTEGER,
ADD COLUMN     "serie" TEXT,
ADD COLUMN     "tipo_comprobante" "TipoComprobante" NOT NULL DEFAULT 'BOLETA';

-- CreateIndex
CREATE UNIQUE INDEX "ventas_negocio_id_serie_numero_key" ON "ventas"("negocio_id", "serie", "numero");

-- Clientes ya registrados: hasta ahora solo se aceptaba DNI (8 dígitos) o carné de extranjería
UPDATE "clientes" SET "tipo_documento" = 'CE' WHERE "documento" !~ '^\d{8}$';

-- Ventas ya registradas: pasan a ser boletas B001 numeradas en orden de fecha, por negocio
UPDATE "ventas" v
SET "serie" = 'B001', "numero" = n.numero
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY negocio_id ORDER BY fecha, id)::int AS numero
  FROM "ventas"
) n
WHERE v.id = n.id;

-- Última barrera: con lo que paga el cliente se tiene que cubrir el total
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_monto_recibido_cubre_total"
  CHECK ("monto_recibido" IS NULL OR "monto_recibido" >= "total");
