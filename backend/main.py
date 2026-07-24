import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

app = FastAPI(
    title="Trading Research Platform API",
    version="0.1.0",
    description="Backend services for Replay, Strategy, Scanner and Journal"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api.routes import alerts, market, strategy

app.include_router(market.router, prefix="/api")
app.include_router(strategy.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")


@app.get("/")
def read_root():
    return {"message": "Trading Research Platform Backend API is running"}

if __name__ == "__main__":
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=settings.RELOAD)
