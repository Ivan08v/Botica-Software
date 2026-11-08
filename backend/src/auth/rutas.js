import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { noAutorizado } from "../errores.js";
import { prisma } from "../prisma.js";
import { mensaje, validar } from "../validacion.js";
import { autenticar } from "./middleware.js";
import { firmarToken } from "./token.js";

const esquemaLogin = z.strictObject({
  correo: z.email({ error: mensaje("El correo no es válido") }),
  password: z.string().min(1, { error: mensaje("La contraseña es obligatoria") }),
});

export async function login(correo, password) {
  const usuario = await prisma.usuario.findUnique({
    where: { correo: correo.trim().toLowerCase() },
    include: { negocio: true },
  });
  // Mismo mensaje si falla el correo o la contraseña: no revela qué correos existen
  const valido =
    usuario && usuario.activo && usuario.negocio.activo && (await bcrypt.compare(password, usuario.passwordHash));
  if (!valido) throw noAutorizado("Correo o contraseña incorrectos");

  return {
    accessToken: firmarToken(usuario),
    usuario: { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol },
    negocio: { id: usuario.negocio.id, nombre: usuario.negocio.nombre, tipo: usuario.negocio.tipo },
  };
}

export const rutasAuth = Router();

// Única ruta pública de la API
rutasAuth.post("/login", async (req, res) => {
  const { correo, password } = validar(esquemaLogin, req.body);
  res.json(await login(correo, password));
});

// Quién soy (según el token)
rutasAuth.get("/me", autenticar, (req, res) => {
  res.json(req.usuario);
});
