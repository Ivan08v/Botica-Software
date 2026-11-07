-- Un cliente con ventas no se puede eliminar: antes la venta quedaba sin cliente (SET NULL)
-- y se perdía a quién se le vendió (o a quién se emitió la factura).

-- DropForeignKey
ALTER TABLE "ventas" DROP CONSTRAINT "ventas_cliente_id_fkey";

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
