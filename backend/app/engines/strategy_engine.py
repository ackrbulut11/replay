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
from app.rules.engine import DEFAULT_BAR_DELAY, RuleEngine
from app.rules.strategy_models import (
    StrategyCreateRequest,
    StrategyModel,
    StrategyUpdateRequest,
)


# Kullanıcı başına saklanacak azami tekli test sayısı; aşan en eski kayıtlar silinir.
MAX_EVALUATIONS_PER_USER = 30


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
    ) -> dict:
        """Stratejiyi verilen veri üzerinde değerlendirir."""
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
        total_pnl_percent = round(sum(s["pnl_percent"] for s in trades), 2)

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
        }

    @staticmethod
    def load_multi_tf_data(
        strategy: dict,
        provider: str,
        symbol: str,
        loader,
        start_dt,
        end_dt,
    ) -> dict[str, pd.DataFrame]:
        """Stratejinin `timeframe_filters` ve koşul operandlarında referans
        verdiği ek zaman dilimlerini yükler (tekli test ve toplu tarama
        arasında tutarlı davranış için ortak yardımcı)."""
        multi_tf_data: dict[str, pd.DataFrame] = {}

        tf_filters = strategy.get("timeframe_filters", [])
        for tf_filter in tf_filters:
            tf = tf_filter.get("timeframe")
            if tf and tf not in multi_tf_data:
                try:
                    tf_df = loader.load_data(
                        provider_name=provider,
                        symbol=symbol,
                        timeframe=tf,
                        start_time=start_dt,
                        end_time=end_dt,
                    )
                    if not tf_df.empty:
                        multi_tf_data[tf] = tf_df
                except Exception:
                    pass

        for rule_key in ("entry_rules", "exit_rules"):
            rules = strategy.get(rule_key, {})
            for condition in rules.get("conditions", []):
                for side in ("left", "right", "right2"):
                    operand = condition.get(side)
                    if operand and operand.get("timeframe"):
                        tf = operand["timeframe"]
                        if tf not in multi_tf_data:
                            try:
                                tf_df = loader.load_data(
                                    provider_name=provider,
                                    symbol=symbol,
                                    timeframe=tf,
                                    start_time=start_dt,
                                    end_time=end_dt,
                                )
                                if not tf_df.empty:
                                    multi_tf_data[tf] = tf_df
                            except Exception:
                                pass

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
