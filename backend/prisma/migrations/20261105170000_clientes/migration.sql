-- Atención al cliente: clientes por negocio (DNI) y cliente opcional en cada venta

-- CreateTable
CREATE TABLE "clientes" (
    "id" SERIAL NOT NULL,
    "negocio_id" INTEGER NOT NULL,
    "documento" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN "cliente_id" INTEGER;

-- CreateIndex
CREATE INDEX "clientes_negocio_id_nombre_idx" ON "clientes"("negocio_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_negocio_id_documento_key" ON "clientes"("negocio_id", "documento");

-- CreateIndex
CREATE INDEX "ventas_cliente_id_fecha_idx" ON "ventas"("cliente_id", "fecha");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
