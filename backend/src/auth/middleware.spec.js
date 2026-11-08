import { ErrorHttp } from "../errores.js";
import { requiereRol } from "./middleware.js";

// Ejecuta el middleware con un usuario dado y dice si dejó pasar (llamó a next)
function probar(roles, usuario) {
  let paso = false;
  requiereRol(...roles)({ usuario }, {}, () => {
    paso = true;
  });
  return paso;
}

describe("requiereRol", () => {
  it("deja pasar si el rol del usuario está permitido", () => {
    expect(probar(["DUENO"], { rol: "DUENO" })).toBe(true);
  });

  it("acepta cualquiera de varios roles", () => {
    expect(probar(["DUENO", "VENDEDOR"], { rol: "VENDEDOR" })).toBe(true);
  });

  it("rechaza con 403 si el rol no está permitido", () => {
    expect(() => probar(["DUENO"], { rol: "VENDEDOR" })).toThrow(ErrorHttp);
    try {
      probar(["DUENO"], { rol: "VENDEDOR" });
    } catch (e) {
      expect(e.estado).toBe(403);
    }
  });

  it("rechaza si no hay usuario en la petición", () => {
    expect(() => probar(["DUENO"], undefined)).toThrow(ErrorHttp);
  });
});
