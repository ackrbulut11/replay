# Güvenlik yardımcı araçları

from __future__ import annotations

import threading
import time
from typing import Callable, Dict, Tuple

from fastapi import HTTPException


class RateLimiter:
    """Sabit pencereli, süreç içi istek sayacı.

    Aynı anahtarın (IP ya da kullanıcı kimliği) bir pencere içinde
    yapabileceği istek sayısını sınırlar; aşılırsa 429 fırlatır.

    Süreç belleğinde tutulur: Render'da tek instance çalıştığı için yeterli.
    Birden fazla instance'a geçilirse sayaç instance başına ayrı işler ve
    gerçek sınır katlanır — o noktada Redis'e taşınmalıdır.

    Sözlük SINIRSIZ BÜYÜMEZ: eşik aşıldığında penceresi dolmuş kayıtlar
    temizlenir. Eskiden waitlist'teki sayaç her IP için bir giriş ekleyip hiç
    silmiyordu, yani yavaş bir bellek sızıntısıydı ve IP çeşitlendirerek
    hızlandırılabiliyordu.

    Thread-safe: `/market/quotes` gibi uçlar ThreadPoolExecutor kullanıyor ve
    BackgroundTasks da ayrı thread'lerde çalışıyor.
    """

    # Temizlik, sözlük bu boyutu aştığında yapılır (her istekte taramak pahalı).
    _CLEANUP_THRESHOLD = 1024

    def __init__(
        self,
        max_requests: int,
        window_seconds: float,
        detail: str = "Çok fazla istek. Lütfen biraz sonra tekrar deneyin.",
        time_fn: Callable[[], float] = time.monotonic,
    ) -> None:
        self._max_requests = max_requests
        self._window_seconds = window_seconds
        self._detail = detail
        # Saat dışarıdan verilebilir: testler beklemeden pencere ilerletebilsin.
        self._now = time_fn
        # anahtar -> (pencere içindeki istek sayısı, pencere başlangıcı)
        self._state: Dict[str, Tuple[int, float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        """Bir isteği sayar; sınır aşıldıysa `HTTPException(429)` fırlatır."""
        now = self._now()

        with self._lock:
            if len(self._state) > self._CLEANUP_THRESHOLD:
                self._purge(now)

            count, window_start = self._state.get(key, (0, now))
            if now - window_start > self._window_seconds:
                count, window_start = 0, now

            if count >= self._max_requests:
                retry_after = max(int(self._window_seconds - (now - window_start)), 1)
                raise HTTPException(
                    status_code=429,
                    detail=self._detail,
                    headers={"Retry-After": str(retry_after)},
                )

            self._state[key] = (count + 1, window_start)

    def _purge(self, now: float) -> None:
        """Penceresi dolmuş kayıtları siler (kilit çağıran tarafından tutulur)."""
        expired = [
            key
            for key, (_, window_start) in self._state.items()
            if now - window_start > self._window_seconds
        ]
        for key in expired:
            del self._state[key]

    def reset(self) -> None:
        """Tüm sayaçları sıfırlar — testler arasında izolasyon için."""
        with self._lock:
            self._state.clear()
