# Verificador de documentos

Mini web/API independiente para Render.

## Ejecutar local

```bash
npm start
```

Abre:

```txt
http://localhost:8787
```

## Endpoints

- `POST /api/documentos`: registra un documento emitido.
- `GET /api/verificar/:codigo`: devuelve los datos del documento.
- `GET /verificar/:codigo`: pagina publica de validacion.

## Render

1. Sube esta carpeta a un repositorio de GitHub.
2. En Render crea un Web Service desde ese repositorio.
3. Render puede leer `render.yaml` automaticamente.
4. Si te pide datos manuales:

```txt
Build command: npm install
Start command: npm start
```

5. Copia la URL que te da Render.
6. En `sistema-medico`, crea o edita `.env` con:

```txt
VITE_VERIFICATION_BASE_URL=https://tu-servicio.onrender.com
```

7. Reinicia el proyecto `sistema-medico`.

## Importante sobre almacenamiento

Esta version guarda los documentos en `data/documentos.json`.
Sirve para pruebas en Render, pero si Render redeploya o reinicia el servicio puede perderse el archivo.
Para uso permanente conviene cambiarlo luego a PostgreSQL.
