# Umbral · Proyecto final

Preparación del asistente de compra de portátiles. `maquetas.html` es la referencia
visual. La interfaz todavía conserva la plantilla inicial de Svelte; el RAG y
el chat se construirán en los pasos siguientes.

## Requisitos

- Node.js LTS y npm (verificados con Node 24.20.0 y npm 11.19.0).
- uv, que gestiona Python 3.12 y las dependencias; no se usa pip.
- `.env` local con las claves y `HTTPS_PROXY`. Nunca se añade a Git.

La configuración de usuario de npm usa el mismo proxy y https-proxy que
`HTTPS_PROXY` del `.env`. Sus valores no se incluyen en este repositorio.
En esta máquina Node y npm están instalados en la carpeta de usuario; si una
terminal anterior no los encuentra, abre una terminal nueva.

## Instalar después de clonar

```powershell
uv sync
cd web
npm install
```

Si PowerShell bloquea npm.ps1 por su política de ejecución, usa `npm.cmd`.

## Servidor Python (terminal 1, carpeta del proyecto)

```powershell
uv run servidor.py
```

API inicial: http://127.0.0.1:8000/api/salud
Documentación: http://127.0.0.1:8000/docs
Este servidor inicial no realiza llamadas a OpenAI.

## Interfaz (terminal 2)

```powershell
cd web
npm run dev
```

Abre http://127.0.0.1:5173. Vite reenvía `/api` a http://127.0.0.1:8000,
sin quitar el prefijo. Por ejemplo, http://127.0.0.1:5173/api/salud llega al
servidor Python. Las claves permanecen en el `.env` del servidor, fuera de `web/`.
Si el puerto 8000 está ocupado por otra aplicación, detén esa aplicación antes
de iniciar este servidor; no se modifica el puerto del proxy automáticamente.

## Comprobar la interfaz

```powershell
cd web
npm run check
npm run build
```

`uv.lock` y `web/package-lock.json` fijan las dependencias. `.env`, `.venv`,
`node_modules`, las bases de datos y sus respaldos se excluyen mediante `.gitignore`.
