"""
Strateji API Routes.

CRUD endpointleri ve strateji değerlendirme.
İş mantığı strategy_engine ve rule engine'de (RULES.md #9).
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.postgres import get_db, SessionLocal
from app.database.models import User
from app.auth.dependencies import get_current_user
from app.data.loader import DataLoader
from app.engines.scanner_engine import ScannerEngine
from app.engines.strategy_engine import StrategyEngine
from app.indicators.registry import IndicatorRegistry
from app.rules.strategy_models import (
    BatchEvaluateRequest,
    EvaluateRequest,
    EvaluateResponse,
    SaveScanRequest,
    SignalResult,
    StrategyCreateRequest,
    StrategyUpdateRequest,
)

MAX_LIMIT_BARS = 10000  # Strateji testinde (tekli/toplu) izin verilen azami mum sayısı

# Zaman dilimi başına yaklaşık dakika (mum sayısından gereken takvim aralığını hesaplamak için).
_TF_MINUTES = {
    "1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240,
    "1d": 1440, "1w": 1440 * 7, "1mo": 1440 * 30,
}


def _lookback_start_for_bars(end_dt: datetime, timeframe: str, limit_bars: int) -> datetime:
    """`limit_bars` kadar mumu güvenle kapsayacak başlangıç tarihini hesaplar.

    Sabit bir tabloya (ör. "1h için her zaman 3 yıl") göre değil, istenen mum
    sayısına göre ölçeklenir. Aksi halde `limit_bars=200` gibi küçük bir istek
    bile yıllarca veri çekip Binance klines gibi sayfa başına 1000 mum dönen
    API'lerde onlarca sayfalı isteğe (ve dakikalarca süren taramalara) neden
    olabiliyordu — bkz. "1h taraması dakikalarca bitmiyor" hatası.
    Piyasa kapalı saatleri/hafta sonları için pay bırakılır: gün-içi zaman
    dilimlerinde x3, günlük ve üzerinde x1.6, artı sabit bir tampon.
    """
    minutes_per_bar = _TF_MINUTES.get(timeframe, 1440)
    raw_days = (minutes_per_bar * limit_bars) / 1440
    if timeframe in ("1m", "5m", "15m", "1h", "4h"):
        padded_days = raw_days * 3 + 5
    else:
        padded_days = raw_days * 1.6 + 10
    return end_dt - timedelta(days=padded_days)


class ImportEvaluationsRequest(BaseModel):
    """Tarayıcıda kalmış eski test geçmişinin tek seferlik aktarımı."""

    items: List[Dict[str, Any]] = Field(default_factory=list)


router = APIRouter(prefix="/strategy", tags=["strategy"])

# Singleton instance'lar (durum tutmazlar; veritabanı oturumu her istekte verilir)
_engine = StrategyEngine()
_scanner = ScannerEngine()
_loader = DataLoader()


def get_owned_strategy(
    strategy_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """
    Yol parametresindeki stratejiyi yalnızca sahibi için döndürür.

    Sahibi olmayan bir istek 403 değil 404 alır: 403, başkasına ait bir
    stratejinin var olduğunu sızdırırdı.
    """
    strategy = _engine.get_strategy(db, strategy_id, current_user.id)
    if strategy is None:
        raise HTTPException(status_code=404, detail=f"Strateji bulunamadı: {strategy_id}")
    return strategy



@router.get("/list")
def list_strategies(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Yalnızca giriş yapan kullanıcının stratejilerini listeler."""
    strategies = _engine.list_strategies(db, current_user.id)
    return {"strategies": strategies, "count": len(strategies)}


@router.get("/indicators")
def get_available_indicators():
    """Kullanılabilir indikatör listesini döndürür."""
    indicators = IndicatorRegistry.list_indicators()
    return {"indicators": indicators}


# ─── Tekli Test Geçmişi ──────────────────────────────────────────────────────
#
# DİKKAT: Bu uçlar "/{strategy_id}" yolundan ÖNCE tanımlanmalıdır; aksi halde
# yol parametresi "evaluations" kelimesini strateji ID'si sanıp bunları yutar.


@router.get("/evaluations")
def list_evaluations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Kullanıcının tekli test geçmişini döndürür (tüm stratejiler)."""
    items = _engine.list_evaluations(db, current_user.id)
    return {"evaluations": items, "count": len(items)}


@router.post("/evaluations/import")
def import_evaluations(
    request: ImportEvaluationsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Tarayıcıda kalmış eski geçmişi bir kez veritabanına aktarır.

    Yalnızca sunucuda hiç kayıt yokken çağrılması beklenir; var olan kayıtların
    üzerine yazmamak için sunucu doluysa hiçbir şey yapılmaz.
    """
    if _engine.list_evaluations(db, current_user.id):
        return {"message": "Geçmiş zaten mevcut, aktarım yapılmadı", "imported": 0}

    imported = 0
    for item in request.items:
        req = item.get("request") or {}
        result = item.get("result")
        if not result or not req.get("symbol"):
            continue
        # Stratejinin hâlâ var ve kullanıcıya ait olduğunu doğrula.
        if _engine.get_strategy(db, item.get("strategy_id", ""), current_user.id) is None:
            continue
        _engine.save_evaluation(
            db=db,
            user_id=current_user.id,
            strategy_id=item["strategy_id"],
            strategy_name=item.get("strategy_name", ""),
            request=req,
            result=result,
        )
        imported += 1

    return {"message": "Geçmiş aktarıldı", "imported": imported}


@router.delete("/evaluations")
def clear_evaluations(
    strategy_id: Optional[str] = Query(None, description="Yalnızca bu stratejinin kayıtlarını sil"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Test geçmişini temizler."""
    deleted = _engine.clear_evaluations(db, current_user.id, strategy_id)
    return {"message": "Test geçmişi temizlendi", "deleted": deleted}


@router.delete("/evaluations/{evaluation_id}")
def delete_evaluation(
    evaluation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Tek bir test kaydını siler (yalnızca sahibi)."""
    if not _engine.delete_evaluation(db, evaluation_id, current_user.id):
        raise HTTPException(status_code=404, detail=f"Test kaydı bulunamadı: {evaluation_id}")
    return {"message": "Test kaydı silindi", "evaluation_id": evaluation_id}


# ─── Strateji Detayı ─────────────────────────────────────────────────────────


@router.get("/{strategy_id}")
def get_strategy(strategy: dict = Depends(get_owned_strategy)):
    """Strateji detayını döndürür (yalnızca sahibi)."""
    return strategy


@router.post("")
def create_strategy(
    request: StrategyCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Yeni strateji oluşturur. Sahip, token'daki kullanıcıdır."""
    try:
        strategy = _engine.create_strategy(db, request, user_id=current_user.id)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    return {"message": "Strateji oluşturuldu", "strategy": strategy}


@router.put("/{strategy_id}")
def update_strategy(
    strategy_id: str,
    request: StrategyUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mevcut stratejiyi günceller (yalnızca sahibi)."""
    result = _engine.update_strategy(db, strategy_id, request, current_user.id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Strateji bulunamadı: {strategy_id}")
    return {"message": "Strateji güncellendi", "strategy": result}


@router.delete("/{strategy_id}")
def delete_strategy(
    strategy_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stratejiyi siler (yalnızca sahibi). Tarama geçmişi de birlikte silinir."""
    success = _engine.delete_strategy(db, strategy_id, current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Strateji bulunamadı: {strategy_id}")
    return {"message": "Strateji silindi", "strategy_id": strategy_id}


@router.post("/{strategy_id}/evaluate")
def evaluate_strategy(
    request: EvaluateRequest,
    strategy: dict = Depends(get_owned_strategy),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Stratejiyi verilen sembol/timeframe üzerinde çalıştırır (yalnızca sahibi).

    Sinyalleri döndürür (BUY/SELL noktaları).
    """
    # Tarih aralığını hazırla
    if request.end:
        try:
            end_dt = datetime.strptime(request.end, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Geçersiz bitiş tarihi formatı (YYYY-MM-DD)")
    else:
        end_dt = datetime.now()

    limit_bars = request.limit_bars if request.limit_bars is not None else 1000
    if limit_bars > MAX_LIMIT_BARS:
        limit_bars = MAX_LIMIT_BARS

    if request.start:
        try:
            start_dt = datetime.strptime(request.start, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Geçersiz başlangıç tarihi formatı (YYYY-MM-DD)")
    elif limit_bars == 0:
        # "Tüm Veri (Sınırsız)" seçildiğinde geniş sabit pencere kullanılır;
        # mum sayısına göre ölçekleme burada anlamsız olur.
        if request.timeframe in ("1m", "5m", "15m"):
            start_dt = end_dt - timedelta(days=90)
        elif request.timeframe in ("1h", "4h"):
            start_dt = end_dt - timedelta(days=365 * 3)
        else:
            start_dt = datetime(2010, 1, 1)
    else:
        start_dt = _lookback_start_for_bars(end_dt, request.timeframe, limit_bars)

    # Ana zaman dilimi verisini yükle
    try:
        df = _loader.load_data(
            provider_name=request.provider,
            symbol=request.symbol,
            timeframe=request.timeframe,
            start_time=start_dt,
            end_time=end_dt,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Veri yükleme hatası: {e}")

    if df.empty:
        raise HTTPException(status_code=404, detail="Belirtilen aralıkta veri bulunamadı")

    # Çoklu timeframe verilerini yükle (varsa) — tekli test ve toplu tarama
    # arasında tutarlılık için ortak yardımcı kullanılır.
    multi_tf_data = _engine.load_multi_tf_data(
        strategy=strategy,
        provider=request.provider,
        symbol=request.symbol,
        loader=_loader,
        start_dt=start_dt,
        end_dt=end_dt,
    )

    if limit_bars > 0 and len(df) > limit_bars:
        df = df.tail(limit_bars).reset_index(drop=True)

    # Değerlendir
    try:
        result = _engine.evaluate(
            strategy=strategy,
            df=df,
            param_overrides=request.param_overrides,
            multi_tf_data=multi_tf_data if multi_tf_data else None,
            allow_short=request.allow_short,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Değerlendirme hatası: {e}")

    # Sonucu tekli test geçmişine kaydet (toplu tarama da aynı şekilde davranır).
    # Geçmiş kaydı başarısız olsa bile değerlendirme sonucu döndürülmeli.
    try:
        _engine.save_evaluation(
            db=db,
            user_id=current_user.id,
            strategy_id=strategy["id"],
            strategy_name=strategy.get("name", ""),
            request=request.model_dump(),
            result=result,
        )
    except Exception as e:
        db.rollback()
        print(f"Uyarı: test geçmişi kaydedilemedi: {e}")

    return EvaluateResponse(
        strategy_id=result["strategy_id"],
        strategy_name=result["strategy_name"],
        symbol=request.symbol,
        provider=request.provider,
        timeframe=request.timeframe,
        total_bars=result["total_bars"],
        signals=[
            SignalResult(
                timestamp=s["timestamp"],
                signal=s["signal"],
                price=s.get("price", 0.0),
                conditions_met=s["conditions_met"],
                entry_price=s.get("entry_price"),
                pnl_percent=s.get("pnl_percent"),
                signal_timestamp=s.get("signal_timestamp"),
            )
            for s in result["signals"]
        ],
        buy_count=result["buy_count"],
        sell_count=result["sell_count"],
        total_trades=result.get("total_trades", 0),
        winning_trades=result.get("winning_trades", 0),
        losing_trades=result.get("losing_trades", 0),
        win_rate=result.get("win_rate", 0.0),
        total_pnl_percent=result.get("total_pnl_percent", 0.0),
    )


def _run_batch_scan_job(
    scan_id: str,
    strategy: dict,
    symbols: List[str],
    provider: str,
    timeframe: str,
    start_dt: datetime,
    end_dt: datetime,
    limit_bars: int,
    param_overrides: Optional[Dict[str, Any]],
    allow_short: Optional[bool],
) -> None:
    """Toplu taramayı arka planda (BackgroundTasks) çalıştırır.

    HTTP isteği çoktan yanıtlanmış olduğu için burada request'e bağlı `db`
    session'ı kullanılamaz (kapatılmış olur); kendi session'ını açar. Her
    sembol bittikçe sonucu veritabanına yazar, böylece frontend `/status`
    endpoint'inden ilerlemeyi kademeli olarak okuyabilir.

    `requests`'e verilen `timeout` DNS çözümlemesini kapsamaz: sağlayıcı
    (özellikle Yahoo Finance/BIST-Nasdaq) DNS veya bağlantı seviyesinde
    donarsa, ilgili thread süresiz asılı kalabilir ve `as_completed` de onu
    süresiz bekler — tarama sonsuza dek "running" görünür (scanned_count
    hiç ilerlemez). Bu yüzden burada `concurrent.futures.wait` ile bir tur
    içinde HİÇBİR görev bitmezse elde kalanları zaman aşımı hatası olarak
    işaretleyip taramayı yine de sonlandırıyoruz.
    """
    from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait

    ROUND_TIMEOUT_SECONDS = 30

    db = SessionLocal()
    # Sıralı (tek işçi): sağlayıcılar (özellikle Yahoo Finance) çok sayıda eşzamanlı
    # isteği kısıtlayıp yavaşlatabiliyor/donmaya sebep olabiliyor; tek tek taramak
    # toplamda daha güvenilir ve sonuçlar zaten bitiği anda aşağıya düşüyor.
    executor = ThreadPoolExecutor(max_workers=1)
    try:
        futures = {
            executor.submit(
                _engine.evaluate_symbol,
                strategy=strategy,
                symbol=sym,
                provider=provider,
                timeframe=timeframe,
                loader=_loader,
                start_dt=start_dt,
                end_dt=end_dt,
                limit_bars=limit_bars,
                param_overrides=param_overrides,
                allow_short=allow_short,
            ): sym
            for sym in symbols
        }
        pending = set(futures)
        while pending:
            done, pending = wait(pending, timeout=ROUND_TIMEOUT_SECONDS, return_when=FIRST_COMPLETED)
            if not done:
                # Bu turda hiçbir sembol bitmedi (muhtemelen ağ/DNS donması):
                # kalanları hata olarak işaretleyip taramayı bitir, sonsuza
                # kadar "running" kalmasını engelle.
                for fut in pending:
                    sym = futures[fut]
                    _scanner.append_scan_result(
                        db,
                        scan_id=scan_id,
                        result={"symbol": sym, "error": "Zaman aşımı: veri sağlayıcıdan yanıt alınamadı"},
                    )
                pending = set()
                break
            for fut in done:
                sym = futures[fut]
                try:
                    result = fut.result()
                except Exception as e:
                    result = {"symbol": sym, "error": str(e)}
                _scanner.append_scan_result(db, scan_id=scan_id, result=result)

        _scanner.finish_scan(db, scan_id=scan_id)
    except Exception as e:
        _scanner.fail_scan(db, scan_id=scan_id, error=str(e))
    finally:
        db.close()
        # Hâlâ asılı duran (donmuş) thread'leri beklemeden çık; response zaten
        # gönderildi ve tarama kaydı yukarıda sonuçlandırıldı.
        executor.shutdown(wait=False, cancel_futures=True)


@router.post("/{strategy_id}/batch-evaluate")
def batch_evaluate_strategy(
    request: BatchEvaluateRequest,
    background_tasks: BackgroundTasks,
    strategy: dict = Depends(get_owned_strategy),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Stratejiyi birden fazla sembol üzerinde arka planda değerlendirir (yalnızca sahibi).

    İstek anında bir `scan_id` ile döner; gerçek tarama arka planda devam eder.
    İlerleme `/scans/{scan_id}/status` ile sorgulanır. Bu sayede tek bir HTTP
    isteği hiçbir zaman uzun sürmez ve Vercel'in harici proxy zaman aşımına
    (ROUTER_EXTERNAL_TARGET_ERROR) takılmaz.
    """
    if request.end:
        try:
            end_dt = datetime.strptime(request.end, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Geçersiz bitiş tarihi formatı (YYYY-MM-DD)")
    else:
        end_dt = datetime.now()

    limit_bars = request.limit_bars if request.limit_bars is not None else 1000
    if limit_bars > MAX_LIMIT_BARS:
        limit_bars = MAX_LIMIT_BARS

    if request.start:
        try:
            start_dt = datetime.strptime(request.start, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Geçersiz başlangıç tarihi formatı (YYYY-MM-DD)")
    elif limit_bars <= 0:
        # Toplu taramada "sınırsız" seçeneği yok, ama savunma amaçlı sabit
        # pencereye düş (mum sayısına göre ölçekleme burada anlamsız olur).
        if request.timeframe in ("1m", "5m", "15m"):
            start_dt = end_dt - timedelta(days=182)  # ~6 ay
        elif request.timeframe in ("1h", "4h"):
            start_dt = end_dt - timedelta(days=3 * 365)
        else:
            start_dt = end_dt - timedelta(days=10 * 365)
    else:
        start_dt = _lookback_start_for_bars(end_dt, request.timeframe, limit_bars)

    scan = _scanner.create_running_scan(
        db=db,
        strategy_id=strategy["id"],
        strategy_name=strategy.get("name", "Strateji"),
        provider=request.provider,
        timeframe=request.timeframe,
        total_symbols=len(request.symbols),
        user_id=current_user.id,
    )

    background_tasks.add_task(
        _run_batch_scan_job,
        scan_id=scan["scan_id"],
        strategy=strategy,
        symbols=request.symbols,
        provider=request.provider,
        timeframe=request.timeframe,
        start_dt=start_dt,
        end_dt=end_dt,
        limit_bars=limit_bars,
        param_overrides=request.param_overrides,
        allow_short=request.allow_short,
    )

    return scan


@router.get("/{strategy_id}/scans")
def get_strategy_scans(
    strategy: dict = Depends(get_owned_strategy),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bir stratejiye ait tarama geçmişini döndürür (yalnızca sahibi)."""
    scans = _scanner.get_scans(db, strategy["id"], current_user.id)
    latest = scans[0] if scans else None
    return {"strategy_id": strategy["id"], "scans": scans, "latest": latest}


@router.post("/{strategy_id}/scans")
def save_strategy_scan(
    request: SaveScanRequest,
    strategy: dict = Depends(get_owned_strategy),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Strateji tarama sonucunu manuel olarak kaydeder (yalnızca sahibi)."""
    scan_item = _scanner.save_scan(
        db=db,
        strategy_id=strategy["id"],
        strategy_name=strategy.get("name", "Strateji"),
        provider=request.provider,
        timeframe=request.timeframe,
        results=request.results,
        user_id=current_user.id,
    )
    return {"message": "Tarama kaydedildi", "scan": scan_item}


@router.get("/{strategy_id}/scans/{scan_id}/status")
def get_scan_status(
    scan_id: str,
    strategy: dict = Depends(get_owned_strategy),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Arka planda çalışan (veya biten) bir taramanın güncel durumunu döndürür (yalnızca sahibi).

    Frontend, `/batch-evaluate` çağrısından dönen `scan_id` ile bunu birkaç
    saniyede bir sorgulayarak ilerlemeyi (status/scanned_count/results) takip eder.
    """
    scan = _scanner.get_scan(db, strategy["id"], scan_id, current_user.id)
    if not scan:
        raise HTTPException(status_code=404, detail="Tarama bulunamadı")
    return scan

