// Pruebas de extremo a extremo: levantan la app completa contra la base botica_test,
// que global-setup.ts deja migrada y con el seed cargado.
import request from "supertest";
import { iniciarApp } from "./app-de-prueba.js";

describe("Autenticación y roles (e2e)", () => {
  let servidor;
  let cerrar;
  let tokenDueno;
  let tokenVendedor;

  async function tokenDe(correo) {
    const res = await request(servidor).post("/auth/login").send({ correo, password: "Demo1234" });
    return res.body.accessToken;
  }

  beforeAll(async () => {
    ({ servidor, cerrar } = await iniciarApp());
    tokenDueno = await tokenDe("dueno@demo.pe");
    tokenVendedor = await tokenDe("vendedor@demo.pe");
  });

  afterAll(async () => {
    await cerrar();
  });

  it("login correcto devuelve token y rol", async () => {
    const res = await request(servidor)
      .post("/auth/login")
      .send({ correo: "dueno@demo.pe", password: "Demo1234" })
      .expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.usuario.rol).toBe("DUENO");
    expect(res.body.usuario.passwordHash).toBeUndefined();
  });

  it("login con contraseña incorrecta responde 401", async () => {
    await request(servidor)
      .post("/auth/login")
      .send({ correo: "dueno@demo.pe", password: "incorrecta" })
      .expect(401);
  });

  it("sin token no se puede ver productos (401)", async () => {
    await request(servidor).get("/productos").expect(401);
  });

  it("el vendedor puede ver productos con su stock", async () => {
    const res = await request(servidor)
      .get("/productos")
      .set("Authorization", `Bearer ${tokenVendedor}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toEqual(expect.objectContaining({ stock: expect.any(Number) }));
  });

  it("el vendedor no puede crear productos (403)", async () => {
    await request(servidor)
      .post("/productos")
      .set("Authorization", `Bearer ${tokenVendedor}`)
      .send({ nombre: "Producto de prueba", precioVenta: 1 })
      .expect(403);
  });

  it("el dueño recibe 400 si manda datos inválidos", async () => {
    await request(servidor)
      .post("/productos")
      .set("Authorization", `Bearer ${tokenDueno}`)
      .send({ nombre: "", precioVenta: -5 })
      .expect(400);
  });
});
