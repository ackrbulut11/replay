# Güvenlik yardımcı araçları

from __future__ import annotations

import threading
import time
from typing import Any, Awaitable, Callable, Dict, Tuple

from fastapi import HTTPException, Request
from starlette.responses import JSONResponse


def client_ip(request: Request) -> str:
    """Güvenilir ters vekilin eklediği son X-Forwarded-For adresini döndürür.

    İlk değeri almak istemcinin kendi eklediği sahte adresi kabul ediyordu.
    Vercel/Render zinciri gerçek istemci adresini listenin sonuna ekler; doğrudan
    bağlantıda ise ASGI sunucusunun gördüğü adres kullanılır.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    addresses = [part.strip() for part in forwarded.split(",") if part.strip()]
    if addresses:
        return addresses[-1][:128]
    return (request.client.host if request.client else "unknown")[:128]


class _RequestBodyTooLarge(Exception):
    pass


class RequestBodyLimitMiddleware:
    """Content-Length ve chunked gövdeleri süreç belleğine girmeden sınırlar."""

    def __init__(self, app: Any, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(
        self,
        scope: dict[str, Any],
        receive: Callable[[], Awaitable[dict[str, Any]]],
        send: Callable[[dict[str, Any]], Awaitable[None]],
    ) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        raw_length = headers.get(b"content-length")
        try:
            content_length = int(raw_length) if raw_length else None
        except ValueError:
            content_length = None

        if content_length is not None and content_length > self.max_bytes:
            await self._reject(scope, receive, send)
            return

        received = 0

        async def limited_receive() -> dict[str, Any]:
            nonlocal received
            message = await receive()
            if message.get("type") == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise _RequestBodyTooLarge
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _RequestBodyTooLarge:
            await self._reject(scope, receive, send)

    @staticmethod
    async def _reject(
        scope: dict[str, Any],
        receive: Callable[[], Awaitable[dict[str, Any]]],
        send: Callable[[dict[str, Any]], Awaitable[None]],
    ) -> None:
        response = JSONResponse(
            status_code=413,
            content={"detail": "İstek gövdesi izin verilen boyutu aşıyor."},
        )
        await response(scope, receive, send)


class SecurityHeadersMiddleware:
    """API yanıtlarına tarayıcı tarafı savunma başlıklarını ekler."""

    def __init__(self, app: Any, production: bool = False) -> None:
        self.app = app
        self.production = production

    async def __call__(
        self,
        scope: dict[str, Any],
        receive: Callable[[], Awaitable[dict[str, Any]]],
        send: Callable[[dict[str, Any]], Awaitable[None]],
    ) -> None:
        async def send_with_headers(message: dict[str, Any]) -> None:
            if message.get("type") == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend(
                    [
                        (b"x-content-type-options", b"nosniff"),
                        (b"referrer-policy", b"strict-origin-when-cross-origin"),
                        (
                            b"permissions-policy",
                            b"camera=(), microphone=(), geolocation=(), payment=(), usb=()",
                        ),
                    ]
                )
                if self.production:
                    headers.append(
                        (b"strict-transport-security", b"max-age=63072000; includeSubDomains")
                    )
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_headers)


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
