import { analizarFilas } from "./analisis.js";

const HOY = "2026-10-06";
const vacio = { productos: [], lotes: new Set() };

const fila = (cambios = {}) => ({
  nombre: "Paracetamol 500 mg",
  laboratorio: "Genfar",
  presentacion: "Caja x 100",
  codigoBarras: "7750000000014",
  precioVenta: 0.2,
  stockMinimo: 50,
  numeroLote: "A-1",
  fechaVencimiento: "2027-06-30",
  cantidad: 100,
  costoUnitario: 0.12,
  ...cambios,
});

describe("analizarFilas", () => {
  it("una fila correcta crea un producto y un lote", () => {
    const { filas, resumen } = analizarFilas([fila()], vacio, HOY);
    expect(filas[0]).toMatchObject({ fila: 2, estado: "OK", errores: [] });
    expect(filas[0].productoNuevo).toMatchObject({
      nombre: "Paracetamol 500 mg",
      precioVenta: 0.2,
      stockMinimo: 50,
    });
    expect(filas[0].lote).toEqual({
      numeroLote: "A-1",
      fechaVencimiento: "2027-06-30",
      cantidad: 100,
      costoUnitario: 0.12,
    });
    expect(resumen).toMatchObject({
      total: 1,
      correctas: 1,
      productosNuevos: 1,
      lotesNuevos: 1,
      unidades: 100,
    });
  });

  it("varias filas del mismo producto crean un solo producto con varios lotes", () => {
    const { filas, resumen } = analizarFilas([fila(), fila({ numeroLote: "A-2", cantidad: 30 })], vacio, HOY);
    expect(filas[1].estado).toBe("OK");
    expect(filas[1].productoNuevo).toBeNull();
    expect(filas[1].claveProducto).toBe(filas[0].claveProducto);
    expect(resumen).toMatchObject({ productosNuevos: 1, lotesNuevos: 2, unidades: 130 });
  });

  it("reúne todos los errores de una fila", () => {
    const { filas } = analizarFilas(
      [
        fila({
          nombre: "",
          precioVenta: "gratis",
          cantidad: 0,
          fechaVencimiento: "2027-02-31",
          codigoBarras: "ABC",
        }),
      ],
      vacio,
      HOY,
    );
    expect(filas[0].estado).toBe("ERROR");
    expect(filas[0].errores).toEqual([
      "Falta el nombre del producto",
      'El código de barras "ABC" debe tener entre 8 y 14 dígitos',
      "El precio de venta debe ser un número mayor que cero",
      'La fecha de vencimiento "2027-02-31" no es válida (usa día/mes/año)',
      "La cantidad debe ser un número entero mayor que cero",
    ]);
    expect(filas[0].productoNuevo).toBeNull();
  });

  it("acepta números escritos como texto, con coma decimal o con S/", () => {
    const { filas } = analizarFilas(
      [fila({ precioVenta: "S/ 12,50", cantidad: "20", costoUnitario: "7.5" })],
      vacio,
      HOY,
    );
    expect(filas[0].estado).toBe("OK");
    expect(filas[0].productoNuevo?.precioVenta).toBe(12.5);
    expect(filas[0].lote).toMatchObject({ cantidad: 20, costoUnitario: 7.5 });
  });

  it("redondea a céntimos los decimales imprecisos de Excel", () => {
    const { filas } = analizarFilas([fila({ precioVenta: 0.30000000000000004 })], vacio, HOY);
    expect(filas[0].productoNuevo?.precioVenta).toBe(0.3);
  });

  it("un lote vencido se acepta con un aviso", () => {
    const { filas } = analizarFilas([fila({ fechaVencimiento: "2026-01-15" })], vacio, HOY);
    expect(filas[0].estado).toBe("OK");
    expect(filas[0].avisos[0]).toContain("ya está vencido");
  });

  it("un lote repetido dentro del archivo es un error", () => {
    const { filas } = analizarFilas([fila(), fila()], vacio, HOY);
    expect(filas.map((f) => f.estado)).toEqual(["OK", "ERROR"]);
    expect(filas[1].errores[0]).toContain("repetido en el archivo");
  });

  it("una fila sin datos de lote crea solo el producto", () => {
    const sinLote = fila({ numeroLote: "", fechaVencimiento: "", cantidad: "", costoUnitario: "" });
    const { filas, resumen } = analizarFilas([sinLote], vacio, HOY);
    expect(filas[0]).toMatchObject({ estado: "OK", lote: null });
    expect(resumen).toMatchObject({ productosNuevos: 1, lotesNuevos: 0 });
  });

  it("un lote a medio llenar es un error", () => {
    const { filas } = analizarFilas([fila({ fechaVencimiento: "", cantidad: "" })], vacio, HOY);
    expect(filas[0].errores).toEqual(["Falta la fecha de vencimiento", "Falta la cantidad"]);
  });

  describe("con productos que ya existen en el negocio", () => {
    const existente = {
      productos: [
        { id: 7, nombre: "Paracetamol 500 mg", presentacion: "Caja x 100", codigoBarras: "7750000000014" },
        { id: 8, nombre: "Gasa estéril", presentacion: null, codigoBarras: null },
      ],
      lotes: new Set(["7|A-1"]),
    };

    it("agrega el lote al producto existente, sin crear otro ni exigir precio", () => {
      const { filas, resumen } = analizarFilas(
        [fila({ numeroLote: "B-9", precioVenta: "" })],
        existente,
        HOY,
      );
      expect(filas[0]).toMatchObject({ estado: "OK", productoExistenteId: 7, productoNuevo: null });
      expect(resumen).toMatchObject({ productosNuevos: 0, lotesNuevos: 1 });
    });

    it("omite un lote que ya estaba registrado (reimportar no duplica)", () => {
      const { filas, resumen } = analizarFilas([fila({ numeroLote: "a-1" })], existente, HOY);
      expect(filas[0]).toMatchObject({ estado: "OMITIDA", lote: null });
      expect(resumen).toMatchObject({ correctas: 0, omitidas: 1 });
    });

    it("sin código de barras, reconoce el producto por nombre sin importar mayúsculas", () => {
      const { filas } = analizarFilas(
        [fila({ nombre: "  GASA   estéril ", presentacion: "", codigoBarras: "", numeroLote: "G-1" })],
        existente,
        HOY,
      );
      expect(filas[0]).toMatchObject({ estado: "OK", productoExistenteId: 8 });
    });

    it("avisa si el código de barras pertenece a un producto con otro nombre", () => {
      const { filas } = analizarFilas([fila({ nombre: "Panadol", numeroLote: "P-1" })], existente, HOY);
      expect(filas[0]).toMatchObject({ estado: "OK", productoExistenteId: 7 });
      expect(filas[0].avisos[0]).toContain('ya pertenece a "Paracetamol 500 mg"');
    });
  });
});
