// Errores HTTP de la API. Un servicio lanza, por ejemplo, noEncontrado("Producto no encontrado")
// y el manejador de errores lo convierte en la respuesta { statusCode, message, error }.

const NOMBRES = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  413: "Payload Too Large",
  500: "Internal Server Error",
};

export class ErrorHttp extends Error {
  // `mensaje` puede ser un texto o una lista (por ejemplo, varios errores de validación)
  constructor(estado, mensaje) {
    super(Array.isArray(mensaje) ? mensaje.join(". ") : mensaje);
    this.estado = estado;
    this.mensaje = mensaje;
  }
}

export const solicitudIncorrecta = (mensaje) => new ErrorHttp(400, mensaje);
export const noAutorizado = (mensaje) => new ErrorHttp(401, mensaje);
export const prohibido = (mensaje) => new ErrorHttp(403, mensaje);
export const noEncontrado = (mensaje) => new ErrorHttp(404, mensaje);
export const conflicto = (mensaje) => new ErrorHttp(409, mensaje);

function responder(res, estado, mensaje) {
  res.status(estado).json({ statusCode: estado, message: mensaje, error: NOMBRES[estado] ?? "Error" });
}

// Rutas que no existen
export function rutaNoEncontrada(req, res) {
  responder(res, 404, `No existe la ruta ${req.method} ${req.originalUrl}`);
}

// Último middleware de la app: toda excepción termina aquí.
// Express 5 envía aquí también los errores de las funciones async (no hace falta try/catch).
// eslint-disable-next-line no-unused-vars
export function manejarErrores(error, req, res, next) {
  if (error instanceof ErrorHttp) return responder(res, error.estado, error.mensaje);

  // Errores del lector de JSON de Express (cuerpo mal formado o demasiado grande)
  if (error.type === "entity.parse.failed") {
    return responder(res, 400, "El cuerpo de la petición no es un JSON válido");
  }
  if (error.type === "entity.too.large") {
    return responder(res, 413, "La petición es demasiado grande");
  }

  // Cualquier otro error es un fallo del servidor: se registra y no se muestra el detalle
  console.error(error);
  responder(res, 500, "Ocurrió un error inesperado en el servidor");
}
