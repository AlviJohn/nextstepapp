import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import auth, billing, day, insights, tasks


app = FastAPI(
    title="NextStep API",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)

# Same-origin on Vercel; only needed when the Vite dev server runs on another port.
origins = [o for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (auth, tasks, day, insights, billing):
    app.include_router(module.router)


@app.get("/api/health")
def health():
    return {"ok": True}
