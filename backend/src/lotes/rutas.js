import { Router } from "express";
import { z } from "zod";
import { idDeRuta, mensaje, monto, validar } from "../validacion.js";
import { ingresarLote, listarLotes } from "./servicio.js";

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
