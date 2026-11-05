// Atención al cliente: registro por DNI, cliente opcional en la venta e historial de compras.
// También el resumen de alertas que se muestra en el menú a cualquier usuario.
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import bcrypt from "bcryptjs";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { hoyEnLima } from "../src/common/fechas";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Clientes y alertas (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let vendedor: { token: string; negocioId: number };
  let veterinaria: { token: string; negocioId: number };

  // DNI único por prueba (8 dígitos) para no chocar con otras ejecuciones
  const dniNuevo = () => String(10_000_000 + Math.floor(Math.random() * 89_999_999));

  async function entrar(correo: string) {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ correo, password: "Demo1234" })
      .expect(200);
    return { token: res.body.accessToken as string, negocioId: res.body.negocio.id as number };
  }

  function como(sesion: { token: string }) {
    const servidor = request(app.getHttpServer());
    const auth = { Authorization: `Bearer ${sesion.token}` };
    return {
      get: (ruta: string) => servidor.get(ruta).set(auth),
      post: (ruta: string, cuerpo: object) => servidor.post(ruta).set(auth).send(cuerpo),
      patch: (ruta: string, cuerpo: object) => servidor.patch(ruta).set(auth).send(cuerpo),
    };
  }

  // Producto propio con un lote vigente, para poder venderle al cliente
  async function productoConStock(negocioId: number, cantidad = 20) {
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
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    const [{ base }] = await prisma.$queryRaw<{ base: string }[]>`SELECT current_database() AS base`;
    expect(base).toMatch(/_test$/);

    vendedor = await entrar("vendedor@demo.pe");
    veterinaria = await entrar("veterinaria@demo.pe");
  });

  afterAll(async () => {
    await app.close();
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
    expect(busqueda.body.map((c: { id: number }) => c.id)).toContain(creado.body.id);
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
    const venta = await como(vendedor).post("/ventas", { items: [{ productoId, cantidad: 1 }] }).expect(201);
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
    const enDias = (dias: number) => {
      const d = hoyEnLima();
      d.setUTCDate(d.getUTCDate() + dias);
      return d;
    };
    const lote = (productoId: number, numeroLote: string, dias: number, cantidad: number) =>
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
    const a = await prisma.producto.create({ data: { negocioId, nombre: "A", precioVenta: 1, stockMinimo: 10 } });
    const b = await prisma.producto.create({ data: { negocioId, nombre: "B", precioVenta: 1 } });
    await lote(a.id, "A-1", 300, 3);
    await lote(b.id, "B-VENCIDO", -5, 4);
    await lote(b.id, "B-PRONTO", 10, 6);
    await lote(b.id, "B-VACIO", -20, 0); // agotado: no es alerta

    const entrarCon = async (correo: string) =>
      (await request(app.getHttpServer()).post("/auth/login").send({ correo, password: "Alerta1234" }))
        .body.accessToken as string;
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
