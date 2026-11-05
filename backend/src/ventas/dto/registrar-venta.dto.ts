import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from "class-validator";

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

  // Opcional: cliente registrado del mismo negocio (para su historial de compras)
  @IsOptional()
  @IsInt()
  clienteId?: number;
}
