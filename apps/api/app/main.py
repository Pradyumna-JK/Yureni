from fastapi import FastAPI

from app.routers import deals, health

app = FastAPI(title="DealMind API", version="0.1.0")
app.include_router(health.router)
app.include_router(deals.router)
