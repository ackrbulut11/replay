from pydantic import field_validator
from pydantic_settings import BaseSettings

# Geliştirme ortamının JWT imza anahtarı. Depoda açıkça duruyor ve bu BİLİNÇLİ:
# yerelde çalışmak için kimsenin anahtar üretmesi gerekmesin. Tam da bu yüzden
# ÜRETİMDE KULLANILAMAZ — `assert_production_ready` uygulamanın açılmasını
# engeller. Aksi halde Render'da JWT_SECRET_KEY tanımlı değilse uygulama hiçbir
# uyarı vermeden herkesin görebildiği bu sabitle token imzalar ve isteyen kendi
# `sub` değeriyle token üretip her kullanıcının stratejilerine erişebilirdi;
# tüm sahiplik kapıları (get_owned_strategy vb.) bu anahtara dayanıyor.
DEV_JWT_SECRET_KEY = "dev-secret-key-change-this-in-production-123456789"

# Google OAuth istemci kimliği bir SIR DEĞİLDİR: frontend paketine gömülüdür ve
# tarayıcıda herkese görünür (bkz. frontend/src/main.tsx). Burada varsayılan
# olması RULES.md #17 ihlali sayılmaz — gizli olan `GOOGLE_CLIENT_SECRET`'tır ve
# onun varsayılanı boştur.
DEFAULT_GOOGLE_CLIENT_ID = (
    "985054967666-8dbbd2hemhb2qn8k2grncd8ufcqtarqc.apps.googleusercontent.com"
)


class ProductionConfigError(RuntimeError):
    """Üretim yapılandırması güvenli değil; uygulama açılmamalı."""


class Settings(BaseSettings):
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    RELOAD: bool = True
    DATABASE_URL: str = "sqlite:///./storage/database/app.db"
    
    # Auth & OAuth Settings
    GOOGLE_CLIENT_ID: str = DEFAULT_GOOGLE_CLIENT_ID
    GOOGLE_CLIENT_SECRET: str = ""
    JWT_SECRET_KEY: str = DEV_JWT_SECRET_KEY
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

    # Twelve Data (ücretsiz plan) — Yahoo'nun intraday geçmiş sınırlarını (1h için
    # 730 gün, 15dk için 58 gün...) aşan istekler için ikincil kaynak. Boş bırakılırsa
    # ilgili sağlayıcılar (nasdaq/bist/forex) sessizce yalnızca Yahoo'ya döner —
    # RETENTION_1H/1M gibi bir "yok" durumu değil, kapasite artışı.
    TWELVE_API_KEY: str = ""

    # Piyasa verisi uçları için kullanıcı başına dakikalık istek sınırı.
    # Uçlar sağlayıcıya (Yahoo/Binance) proxy yaptığı için sınırsız kullanım
    # sunucu IP'sinin engellenmesine yol açabiliyor.
    MARKET_RATE_LIMIT_PER_MINUTE: int = 120

    # Gece yarısı piyasa verisi güncelleme işi. Testlerde ve CI'da kapatılabilsin
    # diye ayar: eskiden `import main` yapan her süreç arkada bir zamanlayıcı
    # thread'i bırakıyordu. Birden fazla uvicorn worker'a geçilirse de yalnızca
    # birinde açık bırakmak için kullanılabilir.
    ENABLE_SCHEDULER: bool = True

    # Süreç içi (RAM) mum önbelleğinin azami toplam satır sayısı.
    #
    # Bu önbellek sınırsızdı: yüklenen her sembol+zaman dilimi çerçevesi RAM'de
    # süresiz kalıyordu. 100 sembollük bir 15dk taraması, sembol başına
    # RETENTION_1M'e (100.000 satır ≈ 5,6 MB) kadar çerçeve tutabildiği için
    # tek başına yüzlerce MB demekti — Render'ın ücretsiz katmanı 512 MB.
    # Sınır aşılınca EN AZ KULLANILAN çerçeveler düşürülür (LRU).
    # 1.000.000 satır ≈ 56 MB.
    MEM_CACHE_MAX_ROWS: int = 1_000_000

    # ─── Veri Saklama Limitleri (bar sayısı, RULES.md §24-27) ────────────────
    #
    # Limit ZAMAN DİLİMİ BAŞINA tanımlanır. Eskiden 1dk/5dk/15dk aynı limiti
    # (100.000) paylaşıyordu ve bu, kuralın söylediğinin çok ötesiydi:
    # 100.000 adet 15dk mumu ≈ 2,9 YIL, oysa §25 "son birkaç ay" diyor.
    #
    # Kabaca karşılıkları (7/24 piyasa; kapalı piyasalarda daha uzun süreye
    # denk gelir):
    RETENTION_1M: int = 100_000   # ≈ 69 gün
    RETENTION_5M: int = 50_000    # ≈ 174 gün
    RETENTION_15M: int = 20_000   # ≈ 208 gün
    RETENTION_1H: int = 20_000    # ≈ 2,3 yıl
    RETENTION_4H: int = 6_000     # ≈ 2,7 yıl
    RETENTION_1D: int = 5_000     # ≈ 13,7 yıl (işlem günüyle daha uzun)
    # 1h/1g üstü uzun dilimler (1w/1mo) `RETENTION_1D` ile sınırlanır; 5.000
    # hafta ≈ 96 yıl, yani §25'in "tüm geçmiş" beklentisini fiilen karşılar.
    #
    # NOT: bu değerler yalnızca DİSKTE ne kadar geçmiş tutulacağını belirler ve
    # aynı zamanda testlerin ne kadar geriye gidebileceğini sınırlar. Daha derin
    # intraday testi gerekiyorsa .env'den yükseltilebilir.

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

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.strip().lower() == "production"

    def production_config_errors(self) -> list[str]:
        """Üretimde kabul edilemez yapılandırmaları listeler (yoksa boş liste).

        Bunlar uyarı değil, AÇILIŞI ENGELLEYEN hatalardır: ikisi de sessizce
        yanlış çalışan, fark edilmesi zor ve pahalı durumlar.
        """
        if not self.is_production:
            return []

        errors: list[str] = []

        if self.JWT_SECRET_KEY == DEV_JWT_SECRET_KEY or not self.JWT_SECRET_KEY.strip():
            errors.append(
                "JWT_SECRET_KEY ayarlanmamış; depodaki geliştirme anahtarı kullanılıyor. "
                "Bu anahtarla üretilen token'ları herkes taklit edebilir ve tüm kullanıcı "
                "verisine erişebilir. Üretmek için: "
                'python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )

        if self.DATABASE_URL.startswith("sqlite"):
            errors.append(
                "DATABASE_URL bir SQLite dosyasını gösteriyor. Render'ın diski kalıcı "
                "değildir; her dağıtımda/uyanışta tüm kullanıcılar, stratejiler ve "
                "işlem günlüğü silinir. Kalıcı bir Postgres bağlantısı verin."
            )

        return errors

    def assert_production_ready(self) -> None:
        """Üretim yapılandırması güvenli değilse `ProductionConfigError` fırlatır."""
        errors = self.production_config_errors()
        if errors:
            raise ProductionConfigError(
                "Üretim yapılandırması eksik/güvensiz:\n  - " + "\n  - ".join(errors)
            )

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

