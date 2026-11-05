import { PartialType } from "@nestjs/mapped-types";
import { Transform } from "class-transformer";
import { IsOptional, IsString, Length, Matches, MaxLength } from "class-validator";

const recortar = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export class CrearClienteDto {
  // DNI: 8 dígitos. Carné de extranjería: 9 a 12 caracteres alfanuméricos.
  @Transform(recortar)
  @Matches(/^(\d{8}|[A-Za-z0-9]{9,12})$/, {
    message: "El documento debe ser un DNI de 8 dígitos o un carné de extranjería de 9 a 12 caracteres",
  })
  documento: string;

  @Transform(recortar)
  @IsString()
  @Length(2, 120, { message: "El nombre debe tener entre 2 y 120 caracteres" })
  nombre: string;

  @IsOptional()
  @Transform(recortar)
  @Matches(/^\+?\d{6,15}$/, { message: "El teléfono solo puede tener números (6 a 15 dígitos)" })
  @MaxLength(16)
  telefono?: string;
}

export class ActualizarClienteDto extends PartialType(CrearClienteDto) {}
