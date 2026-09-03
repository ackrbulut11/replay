"""
Test paketi.

Şema burada bir kez kurulur. Migration'lar eskiden `import main` sırasında
kendiliğinden çalışıyordu; artık uygulama onları lifespan içinde çalıştırdığı
için (bkz. `app/database/migrate.py`) `TestClient(main.app)`'i bağlam yöneticisi
olarak KULLANMAYAN testler şemasız bir veritabanıyla karşılaşırdı.

Burada olması ayrıca doğru yer: "test suite'in çalışması için şema gerekir"
ifadesi bir kurulum adımıdır, uygulamanın import edilmesinin yan etkisi değil.
"""

from __future__ import annotations

import atexit
import os
from tempfile import TemporaryDirectory

# Bazı testler (test_waitlist_api.py, test_auth_api.py, test_market_api.py,
# test_analytics_api.py) gerçek `main.app`'i `TestClient` ile çalıştırıyor.
# Performans ölçüm middleware'i geliştirme ortamında varsayılan AÇIK olduğu
# için, test koşuları da kullanıcının canlı `perf.jsonl` dosyasına yazıyordu:
# `unittest discover` çalıştırıldığında testlerin ürettiği hızlı art arda
# istekler (ör. waitlist'in hız sınırı testi) canlı izleyicide gerçek
# kullanıcı trafiği gibi görünüyor, "neden bu kadar çok istek geldi" diye
# yanlış bir soruşturmaya yol açıyordu.
#
# `setdefault` kullanılır: CI ya da geliştirici bilerek `PERF_LOG=true` ile
# test çalıştırıp middleware'in kendisini test etmek isterse (bkz.
# test_perf_log.py — o da kendi izole FastAPI uygulamasını kurduğu için bu
# değişkenden etkilenmez) üzerine yazmaz.
#
# Herhangi bir `app.*` modülü (ve onun üzerinden `app.core.config`) import
# edilmeden ÖNCE ayarlanmalı; bu satır dosyadaki ilk import'tan önce duruyor.
os.environ.setdefault("PERF_LOG", "false")

# Testler geliştiricinin gerçek veritabanına hiçbir zaman bağlanmaz.
_test_storage = TemporaryDirectory(prefix="replay-tests-", ignore_cleanup_errors=True)
os.environ["DATABASE_URL"] = "sqlite:///" + _test_storage.name.replace("\\", "/") + "/test.db"
os.environ["JWT_SECRET_KEY"] = "replay-isolated-test-secret-key-at-least-32-bytes"
os.environ["ENVIRONMENT"] = "test"

from app.database.migrate import run_migrations  # noqa: E402

run_migrations()

from app.database.postgres import engine  # noqa: E402

atexit.register(engine.dispose)
