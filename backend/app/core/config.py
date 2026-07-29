from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    RELOAD: bool = True
    DATABASE_URL: str = "sqlite:///./storage/database/app.db"
    
    # Auth & OAuth Settings
    GOOGLE_CLIENT_ID: str = "985054967666-8dbbd2hemhb2qn8k2grncd8ufcqtarqc.apps.googleusercontent.com"
    GOOGLE_CLIENT_SECRET: str = ""
    JWT_SECRET_KEY: str = "dev-secret-key-change-this-in-production-123456789"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14
    FRONTEND_URL: str = "http://localhost:5173"

    # Geliştirici test girişi: boş bırakılırsa tamamen kapalıdır (güvenli varsayılan).
    # Doldurulursa, `POST /auth/google` isteğinde `credential` alanı bu değere BİREBİR
    # eşit olduğunda tek bir sabit hesapla (DEV_LOGIN_EMAIL) giriş yapılabilir.
    # Google doğrulamasını atlayan tek yol budur; başka hiçbir token bu şekilde kabul edilmez.
    DEV_LOGIN_TOKEN: str = ""
    DEV_LOGIN_EMAIL: str = "demo.trader@example.com"

    # Hata izleme (Sentry). Boş bırakılırsa tamamen devre dışıdır (güvenli varsayılan,
    # yerel geliştirmede hiçbir şey gönderilmez). Render'da bu değer set edilince açılır.
    SENTRY_DSN: str = ""
    # Render/Vercel ortam adı; Sentry olaylarını dev/staging/prod'a göre ayırmak için.
    ENVIRONMENT: str = "development"
    # Performans izleme (trace) örnekleme oranı — 0.0-1.0. Ücretsiz/düşük plan kotasını
    # hızla tüketmemek için düşük tutulur; hata (exception) yakalama bundan etkilenmez.
    SENTRY_TRACES_SAMPLE_RATE: float = 0.1

    # Admin yetkisi olan e-posta adresleri (.env: ADMIN_EMAILS=a@x.com,b@y.com)
    # Boş bırakılırsa admin uçlarına hiç kimse erişemez (güvenli varsayılan).
    # Not: pydantic-settings karmaşık tipleri .env'den JSON olarak çözmeye çalıştığı için
    # düz string tutulup admin_emails üzerinden listeye çevriliyor.
    ADMIN_EMAILS: str = ""

    # Veri Saklama Limitleri (Varsayılan bar sayıları)
    RETENTION_1M: int = 100000  # son birkaç ay
    RETENTION_1H: int = 20000   # son 1-2 yıl
    RETENTION_1D: int = 5000    # son 5-10 yıl

    @field_validator("DATABASE_URL")
    @classmethod
    def _normalize_database_url(cls, value: str) -> str:
        """
        `postgres://` şemasını `postgresql://` olarak düzeltir.

        Render/Heroku bağlantı adresini `postgres://` ile verir; SQLAlchemy 2.x
        bu şemayı tanımaz ve uygulama "Can't load plugin" hatasıyla hiç açılmaz.
        """
        if value.startswith("postgres://"):
            return "postgresql://" + value[len("postgres://") :]
        return value

    @property
    def admin_emails(self) -> set[str]:
        """ADMIN_EMAILS'i normalize edilmiş (küçük harf, boşluksuz) bir kümeye çevirir."""
        return {e.strip().lower() for e in self.ADMIN_EMAILS.split(",") if e.strip()}

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

