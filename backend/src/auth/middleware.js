import { noAutorizado, prohibido } from "../errores.js";
import { leerToken } from "./token.js";

// Exige un token válido en el encabezado Authorization: Bearer <token>.
// Deja en req.usuario quién es y su negocio: todas las consultas se filtran por ese negocio,
// que sale del token firmado y nunca de un dato que envíe el cliente.
export function autenticar(req, res, next) {
  const [tipo, token] = (req.headers.authorization ?? "").split(" ");
  if (tipo !== "Bearer" || !token) throw noAutorizado("Falta el token de acceso");
  try {
    req.usuario = leerToken(token);
  } catch {
    throw noAutorizado("Token inválido o vencido");
  }
  next();
}

// Limita una ruta a ciertos roles. Va después de autenticar.
// Ej.: router.post("/", requiereRol("DUENO"), crear)
export function requiereRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      throw prohibido("Tu rol no tiene permiso para esta acción");
    }
    next();
  };
}
