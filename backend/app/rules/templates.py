"""
Hazır strateji şablonları.

Boş bir editörden başlamak öğrenme eşiğini gereksiz yükseltiyor: kullanıcı
hem DSL'i hem de hangi kuralın anlamlı olduğunu aynı anda çözmek zorunda
kalıyor. Buradaki şablonlar çalışır birer başlangıç noktasıdır; kopyalanıp
düzenlenmeleri beklenir.

Şablonlar KOD DEĞİL VERİDİR (RULES.md #4): her biri düz bir kural ağacı
sözlüğüdür, `strategies.rules` kolonuna olduğu gibi yazılabilir. Yeni şablon
eklemek bu listeye bir sözlük eklemektir.

Hepsi `validate_strategy` ile doğrulanabilir olmalıdır; `test_templates.py`
bunu her şablon için kontrol eder.
"""

from __future__ import annotations

from typing import Any

# Gerçekçi varsayılan maliyet: Binance spot taker ≈ 10 bps, üstüne bir miktar
# slipaj. Sıfır bırakmak şablonu "her zaman kârlı" gösterirdi.
_DEFAULT_COMMISSION_BPS = 10.0
_DEFAULT_SLIPPAGE_BPS = 5.0


def _base(**overrides: Any) -> dict:
    """Ortak alanları taşıyan şablon iskeleti."""
    template = {
        "parameters": [],
        "entry_rules": {"logic": "AND", "conditions": []},
        "exit_rules": {"logic": "AND", "conditions": []},
        "timeframe_filters": [],
        "allow_short": False,
        "take_profit_pct": None,
        "stop_loss_pct": None,
        "bar_delay": 1,
        "commission_bps": _DEFAULT_COMMISSION_BPS,
        "slippage_bps": _DEFAULT_SLIPPAGE_BPS,
    }
    template.update(overrides)
    return template


def _indicator(name: str, period: Any, **extra: Any) -> dict:
    return {"type": "indicator", "name": name, "period": period, **extra}


def _price(field: str = "close", **extra: Any) -> dict:
    return {"type": "price", "field": field, **extra}


def _value(value: Any) -> dict:
    return {"type": "value", "value": value}


STRATEGY_TEMPLATES: list[dict] = [
    {
        "key": "ema_cross",
        "name": "EMA Kesişimi (Golden Cross)",
        "description": (
            "Hızlı EMA yavaş EMA'yı yukarı kestiğinde alır, aşağı kestiğinde satar. "
            "Trend takibinin en klasik biçimi; yatay piyasada çok sinyal üretir."
        ),
        "strategy": _base(
            parameters=[
                {"name": "fast", "type": "int", "default": 20, "min": 2, "max": 100,
                 "description": "Hızlı EMA periyodu"},
                {"name": "slow", "type": "int", "default": 50, "min": 5, "max": 300,
                 "description": "Yavaş EMA periyodu"},
            ],
            entry_rules={"logic": "AND", "conditions": [{
                "left": _indicator("EMA", "$fast"),
                "operator": "cross_above",
                "right": _indicator("EMA", "$slow"),
            }]},
            exit_rules={"logic": "AND", "conditions": [{
                "left": _indicator("EMA", "$fast"),
                "operator": "cross_below",
                "right": _indicator("EMA", "$slow"),
            }]},
        ),
    },
    {
        "key": "rsi_reversal",
        "name": "RSI Aşırı Satım Dönüşü",
        "description": (
            "RSI aşırı satım bölgesinden yukarı çıkınca alır, aşırı alıma girince satar. "
            "Ortalamaya dönüş mantığı; güçlü trendlerde erken çıkış yapar."
        ),
        "strategy": _base(
            parameters=[
                {"name": "rsi_period", "type": "int", "default": 14, "min": 2, "max": 50},
                {"name": "oversold", "type": "int", "default": 30, "min": 5, "max": 45},
                {"name": "overbought", "type": "int", "default": 70, "min": 55, "max": 95},
            ],
            entry_rules={"logic": "AND", "conditions": [{
                "left": _indicator("RSI", "$rsi_period"),
                "operator": "cross_above",
                "right": _value("$oversold"),
            }]},
            exit_rules={"logic": "AND", "conditions": [{
                "left": _indicator("RSI", "$rsi_period"),
                "operator": "cross_below",
                "right": _value("$overbought"),
            }]},
            stop_loss_pct=3.0,
        ),
    },
    {
        "key": "trend_filtered_rsi",
        "name": "Trend Filtreli RSI",
        "description": (
            "Yalnızca fiyat EMA200'ün üstündeyken RSI dönüşü alır. Ortalamaya dönüşü "
            "trend yönüyle sınırlamak, düşen piyasada bıçak yakalamayı azaltır."
        ),
        "strategy": _base(
            parameters=[
                {"name": "rsi_period", "type": "int", "default": 14, "min": 2, "max": 50},
                {"name": "trend_period", "type": "int", "default": 200, "min": 20, "max": 400},
            ],
            entry_rules={"logic": "AND", "conditions": [
                {
                    "left": _indicator("RSI", "$rsi_period"),
                    "operator": "cross_above",
                    "right": _value(35),
                },
                {
                    "left": _price("close"),
                    "operator": ">",
                    "right": _indicator("EMA", "$trend_period"),
                },
            ]},
            exit_rules={"logic": "OR", "conditions": [
                {
                    "left": _indicator("RSI", "$rsi_period"),
                    "operator": "cross_below",
                    "right": _value(70),
                },
                {
                    "left": _price("close"),
                    "operator": "<",
                    "right": _indicator("EMA", "$trend_period"),
                },
            ]},
            stop_loss_pct=4.0,
        ),
    },
    {
        "key": "macd_momentum",
        "name": "MACD Momentum",
        "description": (
            "MACD sinyal çizgisini yukarı kestiğinde alır, aşağı kestiğinde satar. "
            "Momentum dönüşlerini EMA kesişiminden daha erken yakalar."
        ),
        "strategy": _base(
            entry_rules={"logic": "AND", "conditions": [{
                "left": _indicator("MACD", 12, field="MACD"),
                "operator": "cross_above",
                "right": _indicator("MACD", 12, field="MACD_signal"),
            }]},
            exit_rules={"logic": "AND", "conditions": [{
                "left": _indicator("MACD", 12, field="MACD"),
                "operator": "cross_below",
                "right": _indicator("MACD", 12, field="MACD_signal"),
            }]},
        ),
    },
    {
        "key": "atr_trailing",
        "name": "ATR Tabanlı Çıkış",
        "description": (
            "EMA kesişimiyle girer, fiyat son kapanışın ATR katı altına düşünce çıkar. "
            "Sabit yüzde yerine oynaklığa göre uyarlanan stop — aritmetik operand örneği."
        ),
        "strategy": _base(
            parameters=[
                {"name": "atr_mult", "type": "float", "default": 2.0, "min": 0.5, "max": 6.0,
                 "description": "Stop mesafesi = ATR x bu katsayı"},
            ],
            entry_rules={"logic": "AND", "conditions": [{
                "left": _indicator("EMA", 20),
                "operator": "cross_above",
                "right": _indicator("EMA", 50),
            }]},
            exit_rules={"logic": "AND", "conditions": [{
                "left": _price("close"),
                "operator": "<",
                # close(1 bar önce) - atr_mult * ATR(14)
                "right": {
                    "type": "expr",
                    "op": "-",
                    "left": _price("close", offset=1),
                    "right": {
                        "type": "expr",
                        "op": "*",
                        "left": _value("$atr_mult"),
                        "right": _indicator("ATR", 14),
                    },
                },
            }]},
        ),
    },
    {
        "key": "breakout_or_pullback",
        "name": "Kırılım veya Geri Çekilme",
        "description": (
            "İki ayrı giriş senaryosu: ya Bollinger üst bandı kırılır ya da yükseliş "
            "trendinde RSI geri çekilmesi biter. İç içe grup (parantezli kural) örneği."
        ),
        "strategy": _base(
            entry_rules={"logic": "OR", "conditions": [
                # (Kırılım) fiyat üst bandın üstüne çıktı VE ADX güçlü trend diyor
                {"logic": "AND", "conditions": [
                    {
                        "left": _price("close"),
                        "operator": "cross_above",
                        "right": _indicator("BollingerBands", 20, field="BB_upper"),
                    },
                    {
                        "left": _indicator("ADX", 14, field="ADX"),
                        "operator": ">",
                        "right": _value(25),
                    },
                ]},
                # (Geri çekilme) trend yukarı VE RSI dipten dönüyor
                {"logic": "AND", "conditions": [
                    {
                        "left": _price("close"),
                        "operator": ">",
                        "right": _indicator("EMA", 200),
                    },
                    {
                        "left": _indicator("RSI", 14),
                        "operator": "cross_above",
                        "right": _value(40),
                    },
                ]},
            ]},
            exit_rules={"logic": "AND", "conditions": [{
                "left": _indicator("RSI", 14),
                "operator": "cross_below",
                "right": _value(65),
            }]},
            take_profit_pct=8.0,
            stop_loss_pct=4.0,
        ),
    },
]


def list_templates() -> list[dict]:
    """Şablonların arayüz için özet listesi (kural ağacı dahil)."""
    return [dict(template) for template in STRATEGY_TEMPLATES]


def get_template(key: str) -> dict | None:
    """Anahtarına göre tek bir şablon."""
    for template in STRATEGY_TEMPLATES:
        if template["key"] == key:
            return dict(template)
    return None
