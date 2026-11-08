import { Router } from "express";
import { z } from "zod";
import { idDeRuta, mensaje, monto, validar } from "../validacion.js";
import { requiereRol } from "../auth/middleware.js";
import { darDeBaja, ingresarLote, listarLotes } from "./servicio.js";

const esquemaIngreso = z.strictObject({
  productoId: z.number().int(),
  numeroLote: z.string().min(1, { error: mensaje("El número de lote es obligatorio") }).max(50),
  fechaVencimiento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: mensaje("La fecha de vencimiento debe tener el formato AAAA-MM-DD") }),
  cantidad: z.number().int().min(1, { error: mensaje("La cantidad debe ser al menos 1") }),
  costoUnitario: monto("El costo debe ser un número con máximo 2 decimales").min(0),
});

// Sin restricción de rol: tanto DUENO como VENDEDOR registran ingresos de mercadería
export const rutasLotes = Router();

rutasLotes.get("/", async (req, res) => {
  const productoId = req.query.productoId === undefined ? undefined : idDeRuta(req.query.productoId);
  res.json(await listarLotes(req.usuario.negocioId, productoId));
});

rutasLotes.post("/", async (req, res) => {
  const datos = validar(esquemaIngreso, req.body);
  res.status(201).json(await ingresarLote(datos, req.usuario));
});

const esquemaBaja = z.strictObject({
  // Sin loteIds: se dan de baja todos los lotes vencidos con stock
  loteIds: z.array(z.number().int()).min(1).max(500).optional(),
  destino: z.enum(["DESTRUCCION", "DEVOLUCION_PROVEEDOR"], {
    error: mensaje("El destino debe ser DESTRUCCION o DEVOLUCION_PROVEEDOR"),
  }),
  // Ej. "Acta N° 012, incinerado por la empresa X" o "Nota de crédito 0045 de Droguería Y"
  observacion: z
    .string()
    .trim()
    .max(200, { error: mensaje("La observación puede tener hasta 200 caracteres") })
    .optional(),
});

// Solo DUENO: dar de baja retira mercadería del inventario y registra la pérdida
rutasLotes.post("/bajas", requiereRol("DUENO"), async (req, res) => {
  const datos = validar(esquemaBaja, req.body);
  res.status(201).json(await darDeBaja(req.usuario, datos));
});
