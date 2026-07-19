from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    RELOAD: bool = True
    DATABASE_URL: str = "sqlite:///storage/database/app.db"
    
    # Data Retention Limits (Default bar counts)
    RETENTION_1M: int = 100000  # son birkaç ay
    RETENTION_1H: int = 20000   # son 1-2 yıl
    RETENTION_1D: int = 5000    # son 5-10 yıl

    class Config:
        env_file = ".env"

settings = Settings()
