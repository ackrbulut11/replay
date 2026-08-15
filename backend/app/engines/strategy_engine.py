"""
Strateji Değerlendirme Motoru.

Strateji CRUD işlemleri (veritabanı üzerinden, kullanıcıya bağlı) ve
rule engine çağrısı koordinasyonunu sağlar.

Stratejiler kod değil veridir (RULES.md #4): kural ağacı `strategies.rules`
JSON kolonunda tutulur, `.py` dosyası açılmaz. Saklama yeri dosya değil
veritabanıdır; böylece sahiplik `user_id` yabancı anahtarıyla garanti altındadır
ve bir kullanıcı başkasının stratejisine erişemez.

İş mantığı burada, route dosyasına yazılmaz (RULES.md #9).
"""

from __future__ import annotations

from datetime import datetime
from typing import Union

import pandas as pd
from sqlalchemy.orm import Session

from app.database.models import Strategy, StrategyEvaluation
from app.engines.execution import (
    ExecutionCosts,
    PositionSizing,
    fill_price,
    net_pnl_percent,
    simulate_account,
)
from app.reports.performance_report import calculate_performance, compound_return_pct
from app.rules.engine import DEFAULT_BAR_DELAY, RuleEngine
from app.rules.strategy_models import (
    StrategyCreateRequest,
    StrategyModel,
    StrategyUpdateRequest,
)


# Kullanıcı başına saklanacak azami tekli test sayısı; aşan en eski kayıtlar silinir.
MAX_EVALUATIONS_PER_USER = 30

# Nakit simülasyonunun varsayılan başlangıç bakiyesi. Manuel işlem günlüğü de
# aynı varsayılanı kullanıyor (journal/trade_journal.performance), böylece iki
# tarafın sonucu doğrudan karşılaştırılabilir.
DEFAULT_STARTING_BALANCE = 10_000.0


class MultiTimeframeDataError(RuntimeError):
    """Stratejinin ihtiyaç duyduğu bir üst zaman dilimi verisi yüklenemedi.

    Sessizce ana zaman dilimine düşmek yerine yükseltilir: eksik bir filtre,
    kullanıcının test ettiğini sandığı stratejiyi sessizce değiştirir.
    """


def _iso(value: datetime | None) -> str:
    """datetime'ı arayüzün beklediği ISO 8601 + Z biçimine çevirir."""
    return (value or datetime.utcnow()).isoformat() + "Z"


class StrategyEngine:
    """Strateji CRUD ve değerlendirme motoru (veritabanı destekli)."""

    # ─── Satır ↔ Sözlük Dönüşümü ──────────────────────────────────────────

    @staticmethod
    def _row_to_dict(row: Strategy) -> dict:
        """
        Veritabanı satırını API/rule engine'in beklediği strateji sözlüğüne çevirir.

        Kural ağacı `rules` kolonunda saklanır; kimlik ve sürüm bilgisi
        kolonlardan alınır (kolonlar tek doğruluk kaynağıdır).
        """
        data = dict(row.rules or {})
        data.update(
            {
                "id": row.id,
                "user_id": row.user_id,
                "name": row.name,
                "description": row.description or "",
                "version": row.version,
                "created_at": _iso(row.created_at),
                "updated_at": _iso(row.updated_at),
            }
        )
        data.setdefault("parameters", [])
        data.setdefault("entry_rules", {"logic": "AND", "conditions": []})
        data.setdefault("exit_rules", {"logic": "AND", "conditions": []})
        data.setdefault("timeframe_filters", [])
        data.setdefault("allow_short", False)
        data.setdefault("take_profit_pct", None)
        data.setdefault("stop_loss_pct", None)
        # Alan öncesinde kaydedilmiş stratejiler kural uyumlu varsayılana düşer
        # (RULES.md #22): 1 bar gecikme.
        data.setdefault("bar_delay", DEFAULT_BAR_DELAY)
        # Maliyet alanlari alan oncesi stratejilerde yok; sifir = maliyetsiz
        # (eski davranis), boylece kayitli sonuclarin anlami degismez.
        data.setdefault("commission_bps", 0.0)
        data.setdefault("slippage_bps", 0.0)
        return data

    @staticmethod
    def _rules_payload(data: dict) -> dict:
        """`rules` kolonuna yazılacak kural ağacını ayıklar (kimlik alanları hariç)."""
        return {
            "parameters": data.get("parameters", []),
            "entry_rules": data.get("entry_rules", {"logic": "AND", "conditions": []}),
            "exit_rules": data.get("exit_rules", {"logic": "AND", "conditions": []}),
            "timeframe_filters": data.get("timeframe_filters", []),
            "allow_short": data.get("allow_short", False),
            "take_profit_pct": data.get("take_profit_pct"),
            "stop_loss_pct": data.get("stop_loss_pct"),
            "bar_delay": data.get("bar_delay", DEFAULT_BAR_DELAY),
            "commission_bps": data.get("commission_bps", 0.0),
            "slippage_bps": data.get("slippage_bps", 0.0),
        }

    # ─── CRUD İşlemleri ────────────────────────────────────────────────────

    def list_strategies(self, db: Session, user_id: str) -> list[dict]:
        """Yalnızca ilgili kullanıcının stratejilerini listeler."""
        rows = (
            db.query(Strategy)
            .filter(Strategy.user_id == user_id)
            .order_by(Strategy.created_at.desc())
            .all()
        )
        return [self._row_to_dict(r) for r in rows]

    def get_strategy(self, db: Session, strategy_id: str, user_id: str) -> dict | None:
        """
        Stratejiyi döndürür — yalnızca sahibi ise.

        Sahibi değilse None döner; çağıran taraf bunu 404'e çevirir, böylece
        başkasına ait bir stratejinin varlığı sızdırılmaz.
        """
        row = (
            db.query(Strategy)
            .filter(Strategy.id == strategy_id, Strategy.user_id == user_id)
            .first()
        )
        return self._row_to_dict(row) if row else None

    def create_strategy(self, db: Session, request: StrategyCreateRequest, user_id: str) -> dict:
        """
        Yeni strateji oluşturur.

        Sahiplik yalnızca `user_id` argümanından alınır; istek gövdesindeki
        `user_id` alanı bilinçli olarak yok sayılır (taklit edilememesi için).
        """
        strategy = StrategyModel(
            name=request.name,
            description=request.description,
            user_id=user_id,
            parameters=request.parameters,
            entry_rules=request.entry_rules,
            exit_rules=request.exit_rules,
            timeframe_filters=request.timeframe_filters,
            allow_short=request.allow_short,
            take_profit_pct=request.take_profit_pct,
            stop_loss_pct=request.stop_loss_pct,
            # Bunlar geçirilmezse istek gövdesindeki değerler sessizce düşer ve
            # her yeni strateji model varsayılanıyla kaydedilirdi.
            bar_delay=request.bar_delay,
            commission_bps=request.commission_bps,
            slippage_bps=request.slippage_bps,
        )
        data = strategy.model_dump()

        row = Strategy(
            id=strategy.id,
            user_id=user_id,
            name=strategy.name,
            description=strategy.description,
            rules=self._rules_payload(data),
            version=1,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return self._row_to_dict(row)

    def update_strategy(
        self,
        db: Session,
        strategy_id: str,
        request: StrategyUpdateRequest,
        user_id: str,
    ) -> dict | None:
        """Mevcut stratejiyi günceller — yalnızca sahibi ise."""
        row = (
            db.query(Strategy)
            .filter(Strategy.id == strategy_id, Strategy.user_id == user_id)
            .first()
        )
        if row is None:
            return None

        rules = dict(row.rules or {})

        if request.name is not None:
            row.name = request.name
        if request.description is not None:
            row.description = request.description
        if request.parameters is not None:
            rules["parameters"] = [p.model_dump() for p in request.parameters]
        if request.entry_rules is not None:
            rules["entry_rules"] = request.entry_rules.model_dump()
        if request.exit_rules is not None:
            rules["exit_rules"] = request.exit_rules.model_dump()
        if request.timeframe_filters is not None:
            rules["timeframe_filters"] = [tf.model_dump() for tf in request.timeframe_filters]
        if request.allow_short is not None:
            rules["allow_short"] = request.allow_short
        if request.take_profit_pct is not None:
            rules["take_profit_pct"] = request.take_profit_pct
        if request.stop_loss_pct is not None:
            rules["stop_loss_pct"] = request.stop_loss_pct
        if request.bar_delay is not None:
            rules["bar_delay"] = request.bar_delay
        if request.commission_bps is not None:
            rules["commission_bps"] = request.commission_bps
        if request.slippage_bps is not None:
            rules["slippage_bps"] = request.slippage_bps

        row.rules = rules
        row.version = (row.version or 1) + 1
        db.commit()
        db.refresh(row)
        return self._row_to_dict(row)

    def delete_strategy(self, db: Session, strategy_id: str, user_id: str) -> bool:
        """Stratejiyi siler — yalnızca sahibi ise. Tarama geçmişi cascade ile gider."""
        row = (
            db.query(Strategy)
            .filter(Strategy.id == strategy_id, Strategy.user_id == user_id)
            .first()
        )
        if row is None:
            return False
        db.delete(row)
        db.commit()
        return True

    # ─── Tekli Test Geçmişi ───────────────────────────────────────────────

    @staticmethod
    def _evaluation_to_dict(row: StrategyEvaluation) -> dict:
        """Satırı arayüzün SingleEvaluationLogItem yapısına çevirir."""
        created = row.created_at or datetime.utcnow()
        return {
            "id": row.id,
            "strategy_id": row.strategy_id,
            "strategy_name": row.strategy_name or "",
            "symbol": row.symbol,
            "provider": row.provider,
            "timeframe": row.timeframe,
            # Arayüz bunu olduğu gibi gösteriyor (saat:dakika).
            "executed_at": created.strftime("%H:%M"),
            "created_at": created.isoformat() + "Z",
            "total_bars": row.total_bars or 0,
            "total_trades": row.total_trades or 0,
            "win_rate": row.win_rate or 0.0,
            "total_pnl_percent": row.total_pnl_percent or 0.0,
            "request": row.request,
            "result": row.result,
        }

    def save_evaluation(
        self,
        db: Session,
        user_id: str,
        strategy_id: str,
        strategy_name: str,
        request: dict,
        result: dict,
        created_at: datetime | None = None,
    ) -> dict:
        """
        Tekli test sonucunu kaydeder.

        Aynı strateji/sağlayıcı/parite/zaman dilimi için kayıt varsa üzerine
        yazılır — geçmişte her kombinasyondan yalnızca en güncel test durur.
        """
        symbol = str(request.get("symbol", "")).upper()
        provider = str(request.get("provider", "")).lower()
        timeframe = str(request.get("timeframe", ""))

        row = (
            db.query(StrategyEvaluation)
            .filter(
                StrategyEvaluation.user_id == user_id,
                StrategyEvaluation.strategy_id == strategy_id,
                StrategyEvaluation.provider == provider,
                StrategyEvaluation.symbol == symbol,
                StrategyEvaluation.timeframe == timeframe,
            )
            .first()
        )

        if row is None:
            row = StrategyEvaluation(
                user_id=user_id,
                strategy_id=strategy_id,
                symbol=symbol,
                provider=provider,
                timeframe=timeframe,
            )
            db.add(row)

        row.strategy_name = strategy_name
        row.total_bars = result.get("total_bars", 0)
        row.total_trades = result.get("total_trades", 0)
        row.win_rate = result.get("win_rate", 0.0)
        row.total_pnl_percent = result.get("total_pnl_percent", 0.0)
        row.request = request
        row.result = result
        row.created_at = created_at or datetime.utcnow()

        db.commit()
        db.refresh(row)

        self._prune_evaluations(db, user_id)
        return self._evaluation_to_dict(row)

    def _prune_evaluations(self, db: Session, user_id: str) -> None:
        """Kullanıcı başına saklanan test sayısını sınırlar (sınırsız birikmesin)."""
        stale = (
            db.query(StrategyEvaluation)
            .filter(StrategyEvaluation.user_id == user_id)
            .order_by(StrategyEvaluation.created_at.desc())
            .offset(MAX_EVALUATIONS_PER_USER)
            .all()
        )
        if not stale:
            return
        for row in stale:
            db.delete(row)
        db.commit()

    def list_evaluations(self, db: Session, user_id: str) -> list[dict]:
        """Kullanıcının tekli test geçmişini döndürür (en yeni en başta)."""
        rows = (
            db.query(StrategyEvaluation)
            .filter(StrategyEvaluation.user_id == user_id)
            .order_by(StrategyEvaluation.created_at.desc())
            .limit(MAX_EVALUATIONS_PER_USER)
            .all()
        )
        return [self._evaluation_to_dict(r) for r in rows]

    def delete_evaluation(self, db: Session, evaluation_id: str, user_id: str) -> bool:
        """Tek bir test kaydını siler — yalnızca sahibi ise."""
        row = (
            db.query(StrategyEvaluation)
            .filter(
                StrategyEvaluation.id == evaluation_id,
                StrategyEvaluation.user_id == user_id,
            )
            .first()
        )
        if row is None:
            return False
        db.delete(row)
        db.commit()
        return True

    def clear_evaluations(self, db: Session, user_id: str, strategy_id: str | None = None) -> int:
        """Test geçmişini temizler; strategy_id verilirse yalnızca o stratejiyi."""
        query = db.query(StrategyEvaluation).filter(StrategyEvaluation.user_id == user_id)
        if strategy_id:
            query = query.filter(StrategyEvaluation.strategy_id == strategy_id)

        rows = query.all()
        for row in rows:
            db.delete(row)
        db.commit()
        return len(rows)

    # ─── Değerlendirme ────────────────────────────────────────────────────
    #
    # Değerlendirme metotları veritabanına hiç dokunmaz: strateji sözlüğü
    # dışarıdan verilir. Bu sayede batch değerlendirme thread havuzunda
    # güvenle çalışır (SQLAlchemy oturumu thread'ler arasında paylaşılmaz).

    def evaluate(
        self,
        strategy: dict,
        df: pd.DataFrame,
        param_overrides: dict[str, Union[int, float]] | None = None,
        multi_tf_data: dict[str, pd.DataFrame] | None = None,
        allow_short: bool | None = None,
        starting_balance: float = DEFAULT_STARTING_BALANCE,
        sizing: PositionSizing | None = None,
    ) -> dict:
        """Stratejiyi verilen veri üzerinde değerlendirir.

        Yüzdesel sonuçların yanında NAKİT simülasyonu da yapılır: verilen
        başlangıç bakiyesi ve boyutlandırma kuralıyla işlemler sırayla
        uygulanır ve `performance` altında tam metrik seti döner (Sharpe,
        max drawdown, profit factor, expectancy, bakiye eğrisi).
        """
        if param_overrides is None:
            param_overrides = {}
        else:
            param_overrides = dict(param_overrides)

        if allow_short is not None:
            param_overrides["allow_short"] = allow_short

        signals = RuleEngine.evaluate_range(
            strategy=strategy,
            df=df,
            params=param_overrides,
            multi_tf_data=multi_tf_data,
        )

        buy_count = sum(1 for s in signals if s["signal"] == "BUY")
        sell_count = sum(1 for s in signals if s["signal"] == "SELL")

        trades = [s for s in signals if s.get("pnl_percent") is not None]
        total_trades = len(trades)
        winning_trades = sum(1 for s in trades if s["pnl_percent"] > 0)
        losing_trades = sum(1 for s in trades if s["pnl_percent"] < 0)
        win_rate = round((winning_trades / total_trades) * 100.0, 2) if total_trades > 0 else 0.0
        # Bileşik getiri (düz toplam değil): +%50 ardından -%50 gerçekte -%25'tir.
        total_pnl_percent = round(compound_return_pct([s["pnl_percent"] for s in trades]), 2)

        # ─── Nakit simülasyonu ve tam performans raporu ────────────────────
        #
        # `performance_report.py` Sharpe, max drawdown, profit factor,
        # expectancy ve bakiye eğrisini zaten hesaplıyordu ama YALNIZCA manuel
        # işlem günlüğü kullanıyordu; strateji testi kendi içinde win rate ve
        # toplam PnL hesaplayıp orada kalıyordu. İkisi artık aynı rapordan
        # geçiyor — böylece "elle şu sonucu aldım, strateji şunu alırdı"
        # karşılaştırması aynı ölçüyle yapılabiliyor (RULES.md #8).
        account = simulate_account(
            self._closed_positions(signals),
            starting_balance=starting_balance,
            sizing=sizing or PositionSizing(),
        )
        performance = calculate_performance(
            account["trades"], starting_balance=starting_balance
        )

        # Al-tut kiyasi: strateji bu donemde "hicbir sey yapmamaya" gore
        # deger uretti mi? Ayni maliyetler uygulanir ki karsilastirma adil olsun.
        costs = ExecutionCosts.from_strategy(strategy, param_overrides)
        benchmark = self.buy_and_hold(df, costs)
        outperformance = (
            round(total_pnl_percent - benchmark["return_pct"], 2)
            if benchmark["return_pct"] is not None
            else None
        )

        return {
            "strategy_id": strategy.get("id", ""),
            "strategy_name": strategy.get("name", ""),
            "total_bars": len(df),
            "signals": signals,
            "buy_count": buy_count,
            "sell_count": sell_count,
            "total_trades": total_trades,
            "winning_trades": winning_trades,
            "losing_trades": losing_trades,
            "win_rate": win_rate,
            "total_pnl_percent": total_pnl_percent,
            "performance": performance,
            "buy_and_hold": benchmark,
            # Pozitifse strateji al-tut'u yendi.
            "outperformance_pct": outperformance,
        }

    @staticmethod
    def buy_and_hold(df: pd.DataFrame, costs: ExecutionCosts | None = None) -> dict:
        """Aynı dönemde "al ve tut" getirisi.

        Strateji sonucunu tek başına okumak yanıltıcıdır: aynı dönemde sembol
        %60 yükseldiyse %40 getiren bir strateji aslında kaybettirmiştir.
        Karşılaştırma, kullanıcıya "bu stratejiyi kurmaya değdi mi" sorusunun
        cevabını verir.

        Değerlendirilen aralığın ilk barının AÇILIŞINDAN alınıp son barın
        kapanışında satıldığı varsayılır; strateji tarafıyla aynı komisyon ve
        slipaj uygulanır ki karşılaştırma adil olsun.
        """
        empty = {"return_pct": None, "entry_price": None, "exit_price": None}
        if df is None or df.empty:
            return empty

        costs = costs or ExecutionCosts()
        open_col = next((c for c in df.columns if str(c).lower() == "open"), None)
        close_col = next((c for c in df.columns if str(c).lower() == "close"), None)
        if close_col is None:
            return empty

        raw_entry = float(df.iloc[0][open_col if open_col else close_col])
        raw_exit = float(df.iloc[-1][close_col])
        if raw_entry <= 0:
            return empty

        entry = fill_price(raw_entry, is_buy=True, costs=costs)
        exit_price = fill_price(raw_exit, is_buy=False, costs=costs)

        return {
            "return_pct": round(net_pnl_percent("long", entry, exit_price, costs), 2),
            "entry_price": round(entry, 4),
            "exit_price": round(exit_price, 4),
        }

    @staticmethod
    def _closed_positions(signals: list[dict]) -> list[dict]:
        """Sinyal listesinden KAPANMIŞ pozisyonları (giriş+çıkış) çıkarır.

        Rule engine sinyalleri tek tek yazar; kapanışı taşıyan kayıt hem
        `entry_price` hem `pnl_percent` içerir. Nakit simülasyonu için
        pozisyonun yönü de gerekir: `position_closed` alanı bunu söyler.
        """
        positions: list[dict] = []
        for signal in signals:
            if signal.get("pnl_percent") is None:
                continue
            positions.append({
                "side": str(signal.get("position_closed", "LONG")).lower(),
                "entry_price": signal.get("entry_price"),
                "exit_price": signal.get("price"),
                # Maliyetler zaten düşülmüş; yeniden hesaplanmasın.
                "pnl_percent": signal.get("pnl_percent"),
                "exit_timestamp": signal.get("timestamp"),
            })
        return positions

    @staticmethod
    def required_timeframes(strategy: dict) -> list[str]:
        """Stratejinin ana dilim dışında ihtiyaç duyduğu zaman dilimleri.

        Hem `timeframe_filters` hem de koşul operandlarındaki `timeframe`
        alanları taranır; sıra korunur, tekrar edilmez.
        """
        timeframes: list[str] = []

        def _add(tf) -> None:
            if tf and tf not in timeframes:
                timeframes.append(tf)

        for tf_filter in strategy.get("timeframe_filters", []):
            _add(tf_filter.get("timeframe"))

        groups = [strategy.get("entry_rules", {}), strategy.get("exit_rules", {})]
        groups.extend(strategy.get("timeframe_filters", []))
        for group in groups:
            for condition in (group or {}).get("conditions", []):
                for side in ("left", "right", "right2"):
                    operand = condition.get(side)
                    if operand:
                        _add(operand.get("timeframe"))

        return timeframes

    @staticmethod
    def load_multi_tf_data(
        strategy: dict,
        provider: str,
        symbol: str,
        loader,
        start_dt,
        end_dt,
    ) -> dict[str, pd.DataFrame]:
        """Stratejinin referans verdiği ek zaman dilimlerini yükler.

        Tekli test ve toplu tarama arasında tutarlı davranış için ortak
        yardımcıdır.

        Bir dilim yüklenemezse (sağlayıcı hatası ya da boş yanıt) hata
        YÜKSELTİLİR. Eskiden `except Exception: pass` ile yutuluyordu ve
        değerlendirme, filtre hiç yokmuş gibi devam ediyordu — kullanıcı
        istediğinden farklı bir stratejinin sonucunu görüyordu. Toplu taramada
        `evaluate_symbol` bunu yakalayıp ilgili sembolü hata olarak işaretler,
        tekli testte ise route 502'ye çevirir.
        """
        multi_tf_data: dict[str, pd.DataFrame] = {}
        failures: list[str] = []

        for tf in StrategyEngine.required_timeframes(strategy):
            try:
                tf_df = loader.load_data(
                    provider_name=provider,
                    symbol=symbol,
                    timeframe=tf,
                    start_time=start_dt,
                    end_time=end_dt,
                )
            except Exception as exc:
                failures.append(f"{tf} ({exc})")
                continue

            if tf_df is None or tf_df.empty:
                failures.append(f"{tf} (veri bulunamadı)")
                continue

            multi_tf_data[tf] = tf_df

        if failures:
            raise MultiTimeframeDataError(
                f"{symbol} için gereken üst zaman dilimi verisi yüklenemedi: "
                + ", ".join(failures)
            )

        return multi_tf_data

    def evaluate_symbol(
        self,
        strategy: dict,
        symbol: str,
        provider: str,
        timeframe: str,
        loader,
        start_dt,
        end_dt,
        limit_bars: int = 1000,
        param_overrides: dict | None = None,
        allow_short: bool | None = None,
        starting_balance: float = DEFAULT_STARTING_BALANCE,
        sizing: PositionSizing | None = None,
    ) -> dict:
        """Tek bir sembolü yükler ve değerlendirir (batch yardımcı fonksiyonu)."""
        try:
            df = loader.load_data(
                provider_name=provider,
                symbol=symbol,
                timeframe=timeframe,
                start_time=start_dt,
                end_time=end_dt,
            )
            if df.empty:
                return {
                    "symbol": symbol,
                    "error": "Veri bulunamadı",
                }

            if limit_bars > 0 and len(df) > limit_bars:
                df = df.tail(limit_bars).reset_index(drop=True)

            multi_tf_data = self.load_multi_tf_data(
                strategy=strategy,
                provider=provider,
                symbol=symbol,
                loader=loader,
                start_dt=start_dt,
                end_dt=end_dt,
            )

            res = self.evaluate(
                strategy=strategy,
                df=df,
                param_overrides=param_overrides,
                multi_tf_data=multi_tf_data if multi_tf_data else None,
                allow_short=allow_short,
                starting_balance=starting_balance,
                sizing=sizing,
            )

            last_sig = res["signals"][-1] if res["signals"] else None

            return {
                "symbol": symbol,
                "total_bars": res["total_bars"],
                "buy_count": res["buy_count"],
                "sell_count": res["sell_count"],
                "total_trades": res["total_trades"],
                "winning_trades": res["winning_trades"],
                "losing_trades": res["losing_trades"],
                "win_rate": res["win_rate"],
                "total_pnl_percent": res["total_pnl_percent"],
                "last_signal": last_sig["signal"] if last_sig else None,
                "last_signal_time": last_sig["timestamp"] if last_sig else None,
                # Taramada getiriyi tek basina gostermek yaniltici: ayni getiriyi
                # %60 dususle alan bir strateji ayni strateji degildir.
                "max_drawdown_pct": res["performance"].get("max_drawdown_pct"),
                "profit_factor": res["performance"].get("profit_factor"),
                "sharpe_ratio": res["performance"].get("sharpe_ratio"),
                "buy_and_hold_pct": res["buy_and_hold"].get("return_pct"),
                "outperformance_pct": res.get("outperformance_pct"),
                "error": None,
            }
        except Exception as e:
            return {
                "symbol": symbol,
                "error": str(e),
            }

    def evaluate_batch(
        self,
        strategy: dict,
        symbols: list[str],
        provider: str,
        timeframe: str,
        loader,
        start_dt,
        end_dt,
        limit_bars: int = 1000,
        param_overrides: dict | None = None,
        allow_short: bool | None = None,
        starting_balance: float = DEFAULT_STARTING_BALANCE,
        sizing: PositionSizing | None = None,
        max_workers: int = 10,
    ) -> list[dict]:
        """Tüm sembol grubunu paralel olarak değerlendirir."""
        from concurrent.futures import ThreadPoolExecutor

        results = []
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [
                executor.submit(
                    self.evaluate_symbol,
                    strategy=strategy,
                    symbol=sym,
                    provider=provider,
                    timeframe=timeframe,
                    loader=loader,
                    start_dt=start_dt,
                    end_dt=end_dt,
                    limit_bars=limit_bars,
                    param_overrides=param_overrides,
                    allow_short=allow_short,
                    starting_balance=starting_balance,
                    sizing=sizing,
                )
                for sym in symbols
            ]

            for future in futures:
                try:
                    res = future.result()
                    results.append(res)
                except Exception as ex:
                    print(f"Batch evaluation error: {ex}")

        # PnL'e göre büyükten küçüğe sırala
        results.sort(
            key=lambda x: x.get("total_pnl_percent", 0.0) if x.get("error") is None else -99999,
            reverse=True,
        )
        return results
