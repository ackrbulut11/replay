from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    RELOAD: bool = True
    DATABASE_URL: str = "sqlite:///./storage/database/app.db"
    
    # Auth & OAuth Settings
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    JWT_SECRET_KEY: str = "dev-secret-key-change-this-in-production-123456789"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14
    FRONTEND_URL: str = "http://localhost:5173"

    # Veri Saklama Limitleri (Varsayılan bar sayıları)
    RETENTION_1M: int = 100000  # son birkaç ay
    RETENTION_1H: int = 20000   # son 1-2 yıl
    RETENTION_1D: int = 5000    # son 5-10 yıl

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

