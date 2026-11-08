import "dotenv/config";
import jwt from "jsonwebtoken";

function secreto() {
  const clave = process.env.JWT_SECRET;
  if (!clave) throw new Error("Falta JWT_SECRET en el archivo .env");
  return clave;
}

// Lo que viaja dentro del token firmado: quién es y a qué negocio pertenece
export function firmarToken(usuario) {
  return jwt.sign(
    { sub: usuario.id, negocioId: usuario.negocioId, nombre: usuario.nombre, rol: usuario.rol },
    secreto(),
    { expiresIn: process.env.JWT_EXPIRES_IN ?? "8h" },
  );
}

// Devuelve el usuario del token, o lanza un error si la firma no es válida o ya venció
export function leerToken(token) {
  const datos = jwt.verify(token, secreto());
  return { id: datos.sub, negocioId: datos.negocioId, nombre: datos.nombre, rol: datos.rol };
}
