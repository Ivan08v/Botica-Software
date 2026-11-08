import { Router } from "express";
import { requiereRol } from "../auth/middleware.js";
import { obtenerPanel, resumenAlertas } from "./servicio.js";

// Solo DUENO: el panel muestra costos y dinero en riesgo del negocio
export const rutasPanel = Router();

rutasPanel.get("/", requiereRol("DUENO"), async (req, res) => {
  res.json(await obtenerPanel(req.usuario.negocioId));
});

// Cualquier rol: el vendedor también ve el aviso de reposición y vencimientos.
// Solo devuelve conteos (sin costos); el detalle con dinero sigue en /panel, solo para DUENO.
export const rutasAlertas = Router();

rutasAlertas.get("/", async (req, res) => {
  res.json(await resumenAlertas(req.usuario.negocioId));
});
