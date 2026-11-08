import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Roles, UsuarioActual } from "../auth/decoradores";
import type { UsuarioToken } from "../auth/decoradores";
import { ActualizarProductoDto, CrearProductoDto } from "./dto/producto.dto";
import { ProductosService } from "./productos.service";

// Leer: cualquier usuario con sesión. Crear, editar y desactivar: solo DUENO.
// Siempre dentro del negocio del usuario.
@Controller("productos")
export class ProductosController {
  constructor(private readonly productos: ProductosService) {}

  @Get()
  listar(
    @UsuarioActual() usuario: UsuarioToken,
    @Query("buscar") buscar?: string,
    @Query("incluirInactivos", new ParseBoolPipe({ optional: true })) incluirInactivos?: boolean,
  ) {
    return this.productos.listar(usuario.negocioId, buscar, incluirInactivos);
  }

  // Antes de ":id" para que "frecuentes" no se lea como un id
  @Get("frecuentes")
  frecuentes(@UsuarioActual() usuario: UsuarioToken) {
    return this.productos.frecuentes(usuario.negocioId);
  }

  @Get("codigo/:codigoBarras")
  obtenerPorCodigo(
    @UsuarioActual() usuario: UsuarioToken,
    @Param("codigoBarras") codigoBarras: string,
  ) {
    return this.productos.obtenerPorCodigo(usuario.negocioId, codigoBarras);
  }

  @Get(":id")
  obtener(@UsuarioActual() usuario: UsuarioToken, @Param("id", ParseIntPipe) id: number) {
    return this.productos.obtener(usuario.negocioId, id);
  }

  @Roles("DUENO")
  @Post()
  crear(@UsuarioActual() usuario: UsuarioToken, @Body() dto: CrearProductoDto) {
    return this.productos.crear(usuario.negocioId, dto);
  }

  @Roles("DUENO")
  @Patch(":id")
  actualizar(
    @UsuarioActual() usuario: UsuarioToken,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ActualizarProductoDto,
  ) {
    return this.productos.actualizar(usuario.negocioId, id, dto);
  }

  @Roles("DUENO")
  @Delete(":id")
  desactivar(@UsuarioActual() usuario: UsuarioToken, @Param("id", ParseIntPipe) id: number) {
    return this.productos.desactivar(usuario.negocioId, id);
  }
}
