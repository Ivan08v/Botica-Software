// Ícono de Material Symbols (la fuente se carga en index.html).
// `nombre` es el del catálogo: https://fonts.google.com/icons — por ejemplo "search" o "error".
// Es decorativo: el texto de al lado ya dice lo que significa, así que se oculta a lectores de pantalla.
export default function Icono({ nombre }) {
  return (
    <span className="icono" aria-hidden="true">
      {nombre}
    </span>
  )
}
