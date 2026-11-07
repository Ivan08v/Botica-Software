import { PartialType } from "@nestjs/mapped-types";
import { Transform } from "class-transformer";
import { IsEmail, IsEnum, IsOptional, IsString, Length, Matches, MaxLength } from "class-validator";
import { TipoDocumento } from "../../generated/prisma/client";

const recortar = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);
// Un campo opcional enviado vacío se guarda como null (así también se puede borrar al editar)
const vacioANull = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() || null : value;

export class CrearClienteDto {
  // Si no se indica, se deduce del documento (ver tipoDeDocumento en el servicio)
  @IsOptional()
  @IsEnum(TipoDocumento, { message: "El tipo de documento debe ser DNI, CE o RUC" })
  tipoDocumento?: TipoDocumento;

  // DNI: 8 dígitos. RUC: 11 dígitos. Carné de extranjería: 9 a 12 caracteres alfanuméricos.
  // Que el formato coincida con el tipo elegido se revisa en el servicio.
  @Transform(recortar)
  @Matches(/^[A-Za-z0-9]{8,12}$/, {
    message: "El documento debe ser un DNI (8 dígitos), RUC (11 dígitos) o carné de extranjería (9 a 12 caracteres)",
  })
  documento: string;

  @Transform(recortar)
  @IsString()
  @Length(2, 120, { message: "El nombre debe tener entre 2 y 120 caracteres" })
  nombre: string;

  @IsOptional()
  @Transform(vacioANull)
  @Matches(/^\+?\d{6,15}$/, { message: "El teléfono solo puede tener números (6 a 15 dígitos)" })
  @MaxLength(16)
  telefono?: string | null;

  @IsOptional()
  @Transform(vacioANull)
  @IsEmail({}, { message: "El correo no es válido" })
  @MaxLength(120)
  email?: string | null;

  @IsOptional()
  @Transform(vacioANull)
  @IsString()
  @MaxLength(200, { message: "La dirección puede tener hasta 200 caracteres" })
  direccion?: string | null;
}

export class ActualizarClienteDto extends PartialType(CrearClienteDto) {}
