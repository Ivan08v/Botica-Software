-- Baja de lotes vencidos: cada movimiento BAJA_VENCIMIENTO guarda si el lote se destruyó
-- o se devolvió al proveedor.

-- CreateEnum
CREATE TYPE "DestinoBaja" AS ENUM ('DESTRUCCION', 'DEVOLUCION_PROVEEDOR');

-- AlterTable
ALTER TABLE "movimientos" ADD COLUMN     "destino_baja" "DestinoBaja";

-- El destino solo tiene sentido en una baja, y toda baja debe decir su destino
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_destino_solo_en_bajas"
  CHECK (("tipo" = 'BAJA_VENCIMIENTO') = ("destino_baja" IS NOT NULL));
