"""Servidor inicial de Umbral. Arranque: uv run servidor.py."""
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
import uvicorn

load_dotenv(Path(__file__).resolve().parent / ".env")
app = FastAPI(title="Umbral", version="0.1.0")


@app.get("/api/salud")
def salud() -> dict[str, str]:
    return {"estado": "ok", "aplicacion": "umbral"}


if __name__ == "__main__":
    uvicorn.run("servidor:app", host="127.0.0.1", port=8000, reload=True)
