import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// `npm run dev`          -> http://localhost:5173, solo en esta computadora.
// `npm run dev:celular`  -> https en la red Wi-Fi, para abrir la app desde el celular.
//   Va con https (certificado local autofirmado) porque los navegadores solo prestan
//   la cámara en páginas seguras; el celular mostrará una advertencia que hay que aceptar.
export default defineConfig(({ mode }) => {
  const celular = mode === 'celular'
  return {
    plugins: [react(), ...(celular ? [basicSsl()] : [])],
    server: {
      port: 5173,
      host: celular,
      // El navegador llama a /api en este mismo origen y Vite lo reenvía al backend:
      // así no hace falta CORS ni escribir la URL del backend en el código,
      // y el celular solo necesita llegar a este puerto.
      proxy: {
        '/api': 'http://localhost:3001',
      },
    },
  }
})
