"""
Paylasilan hiz sinirlayici birim testleri (unittest).
"""

import unittest

from fastapi import HTTPException

from app.core.security import RateLimiter


class FakeClock:
    """Elle ilerletilebilir monotonik saat — testler beklemesin diye."""

    def __init__(self) -> None:
        self.value = 1000.0

    def __call__(self) -> float:
        return self.value

    def advance(self, seconds: float) -> None:
        self.value += seconds


class TestRateLimiter(unittest.TestCase):
    def test_allows_up_to_limit_then_blocks(self):
        limiter = RateLimiter(max_requests=3, window_seconds=60)
        for _ in range(3):
            limiter.check("ip-1")

        with self.assertRaises(HTTPException) as ctx:
            limiter.check("ip-1")
        self.assertEqual(ctx.exception.status_code, 429)

    def test_keys_are_independent(self):
        limiter = RateLimiter(max_requests=1, window_seconds=60)
        limiter.check("ip-1")
        # Baska bir anahtar etkilenmemeli
        limiter.check("ip-2")
        with self.assertRaises(HTTPException):
            limiter.check("ip-1")

    def test_window_resets(self):
        clock = FakeClock()
        limiter = RateLimiter(max_requests=1, window_seconds=60, time_fn=clock)
        limiter.check("ip-1")
        with self.assertRaises(HTTPException):
            limiter.check("ip-1")

        clock.advance(61)
        limiter.check("ip-1")  # yeni pencere

    def test_retry_after_header_is_present(self):
        limiter = RateLimiter(max_requests=1, window_seconds=60)
        limiter.check("ip-1")
        with self.assertRaises(HTTPException) as ctx:
            limiter.check("ip-1")
        self.assertIn("Retry-After", ctx.exception.headers or {})

    def test_state_does_not_grow_without_bound(self):
        """Penceresi dolmus kayitlar temizlenmeli (eski surumde hic silinmiyordu)."""
        clock = FakeClock()
        limiter = RateLimiter(max_requests=5, window_seconds=60, time_fn=clock)

        # Esigi asacak kadar farkli anahtar; hepsi ayni (eski) pencerede.
        for i in range(RateLimiter._CLEANUP_THRESHOLD + 10):
            limiter.check(f"ip-{i}")

        clock.advance(61)
        limiter.check("tetikleyici")

        self.assertLessEqual(
            len(limiter._state), 2, f"suresi dolmus kayitlar temizlenmemis: {len(limiter._state)}"
        )

    def test_reset_clears_counters(self):
        limiter = RateLimiter(max_requests=1, window_seconds=60)
        limiter.check("ip-1")
        limiter.reset()
        limiter.check("ip-1")  # patlamamali


if __name__ == "__main__":
    unittest.main()
