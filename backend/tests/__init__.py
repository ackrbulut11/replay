"""
Test paketi.

Şema burada bir kez kurulur. Migration'lar eskiden `import main` sırasında
kendiliğinden çalışıyordu; artık uygulama onları lifespan içinde çalıştırdığı
için (bkz. `app/database/migrate.py`) `TestClient(main.app)`'i bağlam yöneticisi
olarak KULLANMAYAN testler şemasız bir veritabanıyla karşılaşırdı.

Burada olması ayrıca doğru yer: "test suite'in çalışması için şema gerekir"
ifadesi bir kurulum adımıdır, uygulamanın import edilmesinin yan etkisi değil.
"""

from app.database.migrate import run_migrations

run_migrations()
