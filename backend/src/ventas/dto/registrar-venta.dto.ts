import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from "class-validator";
import { MedioPago, TipoComprobante } from "../../generated/prisma/client";

export const MEDIOS_PAGO_ACEPTADOS: MedioPago[] = ["EFECTIVO", "TARJETA", "YAPE", "PLIN"];

export class ItemVentaDto {
  @IsInt()
  productoId: number;

  @IsInt()
  @Min(1, { message: "La cantidad debe ser al menos 1" })
  cantidad: number;
}

export class RegistrarVentaDto {
  @IsArray()
  @ArrayNotEmpty({ message: "La venta debe tener al menos un producto" })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ItemVentaDto)
  items: ItemVentaDto[];

  // Cliente registrado del mismo negocio. Opcional en boleta (salvo montos altos), obligatorio en factura.
  @IsOptional()
  @IsInt()
  clienteId?: number;

  @IsOptional()
  @IsEnum(TipoComprobante, { message: "El comprobante debe ser BOLETA o FACTURA" })
  tipoComprobante?: TipoComprobante;

  // En el mostrador de una botica se paga en efectivo, con tarjeta o con Yape/Plin.
  // TRANSFERENCIA sigue en la base solo para las ventas antiguas que lo tienen.
  @IsOptional()
  @IsIn(MEDIOS_PAGO_ACEPTADOS, { message: "El medio de pago debe ser EFECTIVO, TARJETA, YAPE o PLIN" })
  medioPago?: MedioPago;

  // Solo en efectivo: con cuánto paga el cliente, para calcular el vuelto
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "El monto recibido debe ser un número con máximo 2 decimales" })
  @Min(0.01, { message: "El monto recibido debe ser mayor que cero" })
  montoRecibido?: number;
}
