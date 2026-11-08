import { Router } from "express";
import { z } from "zod";
import { requiereRol } from "../auth/middleware.js";
import { mensaje, validar } from "../validacion.js";
import { reporteInventario, reporteVentas } from "./servicio.js";

// Si se indica, el reporte trae solo los lotes vencidos o que vencen dentro de esos días.
// Llega como texto en la URL (?venceEnDias=30): se convierte a número.
const esquemaInventario = z.strictObject({
  venceEnDias: z.coerce.number().int().min(0).max(3650).optional(),
});

const esquemaVentas = z.strictObject({
  desde: z
    .string({ error: mensaje("La fecha inicial debe tener el formato AAAA-MM-DD") })
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: mensaje("La fecha inicial debe tener el formato AAAA-MM-DD") }),
  hasta: z
    .string({ error: mensaje("La fecha final debe tener el formato AAAA-MM-DD") })
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: mensaje("La fecha final debe tener el formato AAAA-MM-DD") }),
});

// Solo DUENO: los reportes muestran costos y ganancias del negocio
export const rutasReportes = Router();
rutasReportes.use(requiereRol("DUENO"));

rutasReportes.get("/inventario", async (req, res) => {
  const { venceEnDias } = validar(esquemaInventario, req.query);
  res.json(await reporteInventario(req.usuario.negocioId, venceEnDias));
});

rutasReportes.get("/ventas", async (req, res) => {
  const { desde, hasta } = validar(esquemaVentas, req.query);
  res.json(await reporteVentas(req.usuario.negocioId, desde, hasta));
});
