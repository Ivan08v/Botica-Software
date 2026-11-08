import { Router } from "express";
import { z } from "zod";
import { requiereRol } from "../auth/middleware.js";
import { mensaje, validar } from "../validacion.js";
import { confirmarImportacion, vistaPrevia } from "./servicio.js";

export const MAXIMO_FILAS = 2000;

// Aquí solo se valida la forma general. El contenido de cada fila lo revisa analizarFilas,
// que en vez de rechazar todo el pedido devuelve los errores fila por fila.
const esquemaImportar = z.strictObject({
  filas: z
    .array(z.looseObject({}))
    .min(1, { error: mensaje("El archivo no tiene filas con datos") })
    .max(MAXIMO_FILAS, { error: mensaje(`Se pueden importar hasta ${MAXIMO_FILAS} filas por archivo`) }),
});

// Solo DUENO: la importación crea productos y carga inventario en bloque
export const rutasImportacion = Router();
rutasImportacion.use(requiereRol("DUENO"));

rutasImportacion.post("/vista-previa", async (req, res) => {
  const { filas } = validar(esquemaImportar, req.body);
  res.json(await vistaPrevia(req.usuario.negocioId, filas));
});

rutasImportacion.post("/confirmar", async (req, res) => {
  const { filas } = validar(esquemaImportar, req.body);
  res.status(201).json(await confirmarImportacion(req.usuario, filas));
});
