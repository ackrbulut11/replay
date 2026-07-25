import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.database.postgres import engine, Base
from app.database import models
from app.auth.router import router as auth_router
from app.api.routes import alerts, market, strategy, admin


# Veritabanı tablolarını otomatik oluştur
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Trading Research Platform API",
    version="0.1.0",
    description="Backend services for Replay, Strategy, Scanner and Journal"
)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:1420",
    "https://replay-nine-gold.vercel.app",
    settings.FRONTEND_URL
]

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.vercel\.app|http://localhost:.*|http://127\.0\.0\.1:.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(market.router, prefix="/api")
app.include_router(strategy.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(admin.router, prefix="/api")


@app.get("/")
def read_root():
    return {"message": "Trading Research Platform Backend API is running"}

if __name__ == "__main__":
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=settings.RELOAD)

