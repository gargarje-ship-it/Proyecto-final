# Portátil ideal para tu día a día

Umbral compara tres portátiles para ofimática, estudio y videollamadas. El chat
responde con fragmentos citados y reconoce cuando un dato no consta.

## Datos

Seis registros ficticios de la maqueta: las fichas técnicas y los registros de
tienda de Nova Esencial 15, Atlas Equilibrio 14 y Orbit Studio 16. Los productos,
precios y canales no son ofertas reales. La valoración ilustrativa está en
`maquetas.html`, apartado «Cómo se calcula la valoración ilustrativa».

## Arranque

Terminal 1, desde la carpeta del proyecto:

```powershell
uv run servidor.py
```

Terminal 2:

```powershell
cd web
npm install
npm run dev
```

Abre <http://127.0.0.1:5173/>. La clave de OpenAI se configura en `.env` y solo
la usa el servidor.

## Preguntas comprobadas

- «Quiero un portátil para ofimática, estudiar y videollamadas. Compara las gamas baja, media y alta. Dame una valoración general puntuando cada ordenador.»
- «¿Qué precio tiene cada uno? ¿Merece la pena pagar la diferencia?»
- «¿Dónde puedo comprarlos?»
- «Me quedo con el Atlas Equilibrio 14. ¿Cuál es su fecha de fabricación?»

La última pregunta responde que no consta y cita A01 · Identificación.

## Entregable

[Abrir el informe PDF](entregable.pdf) · [Ver el informe HTML](entregable.html)
