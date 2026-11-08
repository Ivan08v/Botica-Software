// Atención al cliente: registro por DNI, cliente opcional en la venta e historial de compras.
// También el resumen de alertas que se muestra en el menú a cualquier usuario.
import bcrypt from "bcryptjs";
import request from "supertest";
import { iniciarApp } from "./app-de-prueba.js";
import { hoyEnLima } from "../src/common/fechas.js";

describe("Clientes y alertas (e2e)", () => {
  let servidor;
  let cerrar;
  let prisma;
  let vendedor;
  let veterinaria;

  // DNI único por prueba (8 dígitos) para no chocar con otras ejecuciones
  const dniNuevo = () => String(10_000_000 + Math.floor(Math.random() * 89_999_999));

  async function entrar(correo) {
    const res = await request(servidor)
      .post("/auth/login")
      .send({ correo, password: "Demo1234" })
      .expect(200);
    return { token: res.body.accessToken, negocioId: res.body.negocio.id };
  }

  function como(sesion) {
    const peticion = request(servidor);
    const auth = { Authorization: `Bearer ${sesion.token}` };
    return {
      get: (ruta) => peticion.get(ruta).set(auth),
      post: (ruta, cuerpo) => peticion.post(ruta).set(auth).send(cuerpo),
      patch: (ruta, cuerpo) => peticion.patch(ruta).set(auth).send(cuerpo),
      delete: (ruta) => peticion.delete(ruta).set(auth),
    };
  }

  // Producto propio con un lote vigente, para poder venderle al cliente
  async function productoConStock(negocioId, cantidad = 20) {
    const vence = hoyEnLima();
    vence.setUTCDate(vence.getUTCDate() + 200);
    const producto = await prisma.producto.create({
      data: { negocioId, nombre: `Prueba cliente ${Date.now()}-${Math.random()}`, precioVenta: 2.5 },
    });
    await prisma.lote.create({
      data: {
        negocioId,
        productoId: producto.id,
        numeroLote: "C-1",
        fechaVencimiento: vence,
        cantidadInicial: cantidad,
        cantidadActual: cantidad,
        costoUnitario: 1,
      },
    });
    return producto.id;
  }

  beforeAll(async () => {
    ({ servidor, prisma, cerrar } = await iniciarApp());

    const [{ base }] = await prisma.$queryRaw`SELECT current_database() AS base`;
    expect(base).toMatch(/_test$/);

    vendedor = await entrar("vendedor@demo.pe");
    veterinaria = await entrar("veterinaria@demo.pe");
  });

  afterAll(async () => {
    await cerrar();
  });

  it("el vendedor registra un cliente y lo encuentra por DNI y por nombre", async () => {
    const documento = dniNuevo();
    const creado = await como(vendedor)
      .post("/clientes", { documento: ` ${documento} `, nombre: "  Ana Torres Vega ", telefono: "912345678" })
      .expect(201);
    expect(creado.body).toEqual(
      expect.objectContaining({ documento, nombre: "Ana Torres Vega", telefono: "912345678" }),
    );

    const porDni = await como(vendedor).get(`/clientes/documento/${documento}`).expect(200);
    expect(porDni.body.id).toBe(creado.body.id);

    const busqueda = await como(vendedor).get("/clientes?buscar=torres").expect(200);
    expect(busqueda.body.map((c) => c.id)).toContain(creado.body.id);
  });

  it("no acepta un DNI repetido en el mismo negocio", async () => {
    const documento = dniNuevo();
    await como(vendedor).post("/clientes", { documento, nombre: "Primero" }).expect(201);
    const res = await como(vendedor).post("/clientes", { documento, nombre: "Segundo" }).expect(409);
    expect(res.body.message).toMatch(/ya existe/i);
  });

  it("valida el documento y el teléfono", async () => {
    await como(vendedor).post("/clientes", { documento: "1234", nombre: "Corto" }).expect(400);
    await como(vendedor).post("/clientes", { documento: "12345678", nombre: "A" }).expect(400);
    await como(vendedor)
      .post("/clientes", { documento: dniNuevo(), nombre: "Tel malo", telefono: "abc" })
      .expect(400);
  });

  it("la venta con cliente queda en su historial con el total gastado", async () => {
    const cliente = (
      await como(vendedor).post("/clientes", { documento: dniNuevo(), nombre: "Cliente Historial" })
    ).body;
    const productoId = await productoConStock(vendedor.negocioId);

    const venta = await como(vendedor)
      .post("/ventas", { clienteId: cliente.id, items: [{ productoId, cantidad: 4 }] })
      .expect(201);
    expect(venta.body.cliente).toEqual(expect.objectContaining({ id: cliente.id }));
    await como(vendedor)
      .post("/ventas", { clienteId: cliente.id, items: [{ productoId, cantidad: 2 }] })
      .expect(201);

    const ficha = await como(vendedor).get(`/clientes/${cliente.id}`).expect(200);
    expect(ficha.body.compras).toBe(2);
    expect(ficha.body.totalGastado).toBe("15.00"); // (4 + 2) × 2.50
    expect(ficha.body.ventas).toHaveLength(2);
    expect(ficha.body.ventas[0].productos[0]).toEqual(expect.objectContaining({ cantidad: 2 }));
  });

  it("la venta sin cliente sigue funcionando igual", async () => {
    const productoId = await productoConStock(vendedor.negocioId);
    const venta = await como(vendedor)
      .post("/ventas", { items: [{ productoId, cantidad: 1 }] })
      .expect(201);
    expect(venta.body.cliente).toBeNull();
  });

  it("no se puede usar ni ver un cliente de otro negocio, y la venta no descuenta stock", async () => {
    const ajeno = (
      await como(veterinaria).post("/clientes", { documento: dniNuevo(), nombre: "Cliente Veterinaria" })
    ).body;
    await como(vendedor).get(`/clientes/${ajeno.id}`).expect(404);
    await como(vendedor).get(`/clientes/documento/${ajeno.documento}`).expect(404);
    await como(vendedor).patch(`/clientes/${ajeno.id}`, { nombre: "Cambiado" }).expect(404);

    const productoId = await productoConStock(vendedor.negocioId, 5);
    await como(vendedor)
      .post("/ventas", { clienteId: ajeno.id, items: [{ productoId, cantidad: 1 }] })
      .expect(404);
    const lote = await prisma.lote.findFirstOrThrow({ where: { productoId } });
    expect(lote.cantidadActual).toBe(5);
  });

  it("deduce el tipo de documento y valida que coincida con el indicado", async () => {
    const dni = (
      await como(vendedor).post("/clientes", { documento: dniNuevo(), nombre: "Con DNI" }).expect(201)
    ).body;
    expect(dni.tipoDocumento).toBe("DNI");

    const ruc = `20${String(Date.now()).slice(-9)}`;
    const empresa = await como(vendedor)
      .post("/clientes", { documento: ruc, nombre: "Empresa Prueba S.A.C.", direccion: " Jr. Lima 123 " })
      .expect(201);
    expect(empresa.body).toEqual(
      expect.objectContaining({ tipoDocumento: "RUC", documento: ruc, direccion: "Jr. Lima 123" }),
    );

    // Un RUC tiene que empezar con 10, 15, 16, 17 o 20; y un DNI no puede tener 11 dígitos
    await como(vendedor)
      .post("/clientes", { tipoDocumento: "RUC", documento: "99123456789", nombre: "X Y" })
      .expect(400);
    await como(vendedor)
      .post("/clientes", { tipoDocumento: "DNI", documento: ruc, nombre: "X Y" })
      .expect(400);
    await como(vendedor)
      .post("/clientes", { documento: dniNuevo(), nombre: "Correo malo", email: "no-es-correo" })
      .expect(400);
  });

  it("edita un cliente y puede borrar sus datos opcionales", async () => {
    const creado = (
      await como(vendedor)
        .post("/clientes", {
          documento: dniNuevo(),
          nombre: "Para editar",
          telefono: "987000111",
          email: "a@b.pe",
        })
        .expect(201)
    ).body;
    const editado = await como(vendedor)
      .patch(`/clientes/${creado.id}`, { nombre: "Editado", telefono: "", email: null })
      .expect(200);
    expect(editado.body).toEqual(expect.objectContaining({ nombre: "Editado", telefono: null, email: null }));
  });

  it("la lista trae cuántas compras tiene cada cliente", async () => {
    const cliente = (
      await como(vendedor).post("/clientes", { documento: dniNuevo(), nombre: "Contador Compras" })
    ).body;
    const productoId = await productoConStock(vendedor.negocioId);
    await como(vendedor)
      .post("/ventas", { clienteId: cliente.id, items: [{ productoId, cantidad: 1 }] })
      .expect(201);

    const lista = await como(vendedor).get(`/clientes?buscar=${cliente.documento}`).expect(200);
    expect(lista.body[0]).toEqual(expect.objectContaining({ id: cliente.id, compras: 1 }));
  });

  it("elimina un cliente sin compras, pero no uno con compras ni uno de otro negocio", async () => {
    const sinCompras = (
      await como(vendedor).post("/clientes", { documento: dniNuevo(), nombre: "Sin compras" })
    ).body;
    await como(vendedor).delete(`/clientes/${sinCompras.id}`).expect(204);
    await como(vendedor).get(`/clientes/${sinCompras.id}`).expect(404);
    await como(vendedor).delete(`/clientes/${sinCompras.id}`).expect(404);

    const conCompras = (
      await como(vendedor).post("/clientes", { documento: dniNuevo(), nombre: "Con compras" })
    ).body;
    const productoId = await productoConStock(vendedor.negocioId);
    await como(vendedor)
      .post("/ventas", { clienteId: conCompras.id, items: [{ productoId, cantidad: 1 }] })
      .expect(201);
    const res = await como(vendedor).delete(`/clientes/${conCompras.id}`).expect(409);
    expect(res.body.message).toMatch(/1 compra registrada/);
    await como(vendedor).get(`/clientes/${conCompras.id}`).expect(200);

    const ajeno = (await como(veterinaria).post("/clientes", { documento: dniNuevo(), nombre: "Ajeno" }))
      .body;
    await como(vendedor).delete(`/clientes/${ajeno.id}`).expect(404);
    await como(veterinaria).get(`/clientes/${ajeno.id}`).expect(200);
  });

  it("el mismo DNI puede ser cliente de dos negocios distintos", async () => {
    const documento = dniNuevo();
    await como(vendedor).post("/clientes", { documento, nombre: "En la botica" }).expect(201);
    await como(veterinaria).post("/clientes", { documento, nombre: "En la veterinaria" }).expect(201);
  });

  it("el resumen de alertas cuenta reposición y vencimientos, coincide con el panel y lo ve el vendedor", async () => {
    // Negocio propio con datos conocidos: las otras pruebas corren en paralelo y cambian el demo
    const marca = `${Date.now()}-${Math.random()}`;
    const passwordHash = await bcrypt.hash("Alerta1234", 4);
    const negocioId = (await prisma.negocio.create({ data: { nombre: `Alertas ${marca}` } })).id;
    await prisma.usuario.createMany({
      data: [
        { negocioId, nombre: "Dueña", correo: `dueno-${marca}@alertas.test`, passwordHash, rol: "DUENO" },
        { negocioId, nombre: "Vendedor", correo: `vendedor-${marca}@alertas.test`, passwordHash },
      ],
    });
    const enDias = (dias) => {
      const d = hoyEnLima();
      d.setUTCDate(d.getUTCDate() + dias);
      return d;
    };
    const lote = (productoId, numeroLote, dias, cantidad) =>
      prisma.lote.create({
        data: {
          negocioId,
          productoId,
          numeroLote,
          fechaVencimiento: enDias(dias),
          cantidadInicial: cantidad,
          cantidadActual: cantidad,
          costoUnitario: 1,
        },
      });
    // A: stock 3 con mínimo 10 (reposición). B: un lote vencido y otro que vence en 10 días.
    const a = await prisma.producto.create({
      data: { negocioId, nombre: "A", precioVenta: 1, stockMinimo: 10 },
    });
    const b = await prisma.producto.create({ data: { negocioId, nombre: "B", precioVenta: 1 } });
    await lote(a.id, "A-1", 300, 3);
    await lote(b.id, "B-VENCIDO", -5, 4);
    await lote(b.id, "B-PRONTO", 10, 6);
    await lote(b.id, "B-VACIO", -20, 0); // agotado: no es alerta

    const entrarCon = async (correo) =>
      (await request(servidor).post("/auth/login").send({ correo, password: "Alerta1234" })).body.accessToken;
    const tokenDueno = await entrarCon(`dueno-${marca}@alertas.test`);
    const tokenVendedor = await entrarCon(`vendedor-${marca}@alertas.test`);

    const alertas = (await como({ token: tokenVendedor }).get("/alertas").expect(200)).body;
    expect(alertas).toEqual({ stockBajo: 1, vencidos: 1, porVencer30: 1, total: 3 });

    const panel = (await como({ token: tokenDueno }).get("/panel").expect(200)).body;
    expect(panel.productosStockBajo).toHaveLength(alertas.stockBajo);
    expect(panel.vencimientos.vencidos.lotes).toBe(alertas.vencidos);
    expect(panel.vencimientos.en30Dias.lotes).toBe(alertas.porVencer30);
  });
});
