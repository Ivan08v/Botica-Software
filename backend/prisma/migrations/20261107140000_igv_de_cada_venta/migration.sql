-- IGV de cada venta: los precios ya lo incluyen, así que se separa del total la operación
-- gravada (valor de venta, sin IGV) y el IGV. Se calcula línea por línea, como en el backend
-- (src/common/igv.ts): valor de cada línea = ROUND(importe / 1.18, 2); IGV = total - suma.

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "igv" DECIMAL(10,2),
ADD COLUMN     "op_gravada" DECIMAL(10,2);

-- Ventas ya registradas: se calcula con sus líneas de detalle
UPDATE "ventas" v
SET "op_gravada" = l.op_gravada, "igv" = v.total - l.op_gravada
FROM (
  SELECT venta_id, SUM(ROUND(precio_unitario * cantidad / 1.18, 2)) AS op_gravada
  FROM "detalle_venta"
  GROUP BY venta_id
) l
WHERE v.id = l.venta_id;

-- Las dos partes siempre suman el total cobrado
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_igv_cuadra_con_total"
  CHECK ("op_gravada" IS NULL OR "igv" IS NULL OR "op_gravada" + "igv" = "total");
