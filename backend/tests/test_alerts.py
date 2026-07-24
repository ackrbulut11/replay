import pytest
import tempfile
from pathlib import Path
from app.alerts.engine import AlertEngine
from app.alerts.models import AlertCreateRequest, AlertUpdateRequest, AlertTargetType, AlertCondition, AlertStatus


@pytest.fixture
def temp_alert_engine():
    with tempfile.TemporaryDirectory() as tmpdir:
        engine = AlertEngine(alerts_dir=Path(tmpdir))
        yield engine


def test_alert_crud(temp_alert_engine):
    req = AlertCreateRequest(
        symbol="BTCUSDT",
        provider="binance",
        target_type=AlertTargetType.PRICE,
        condition=AlertCondition.RISES_ABOVE,
        threshold_value=70000.0,
        note="Resistance alert",
    )

    # Create
    alert = temp_alert_engine.create_alert(req)
    assert alert["symbol"] == "BTCUSDT"
    assert alert["threshold_value"] == 70000.0
    assert alert["status"] == "ACTIVE"

    # List
    alerts = temp_alert_engine.list_alerts(symbol="BTCUSDT")
    assert len(alerts) == 1
    assert alerts[0]["id"] == alert["id"]

    # Update
    updated = temp_alert_engine.update_alert(alert["id"], AlertUpdateRequest(status=AlertStatus.DISABLED))
    assert updated["status"] == "DISABLED"

    # Delete
    deleted = temp_alert_engine.delete_alert(alert["id"])
    assert deleted is True
    assert len(temp_alert_engine.list_alerts()) == 0


def test_alert_check_trigger(temp_alert_engine):
    req_price = AlertCreateRequest(
        symbol="BTCUSDT",
        provider="binance",
        target_type=AlertTargetType.PRICE,
        condition=AlertCondition.RISES_ABOVE,
        threshold_value=65000.0,
    )
    req_rsi = AlertCreateRequest(
        symbol="BTCUSDT",
        provider="binance",
        target_type=AlertTargetType.RSI,
        indicator_period=14,
        condition=AlertCondition.FALLS_BELOW,
        threshold_value=30.0,
    )

    temp_alert_engine.create_alert(req_price)
    temp_alert_engine.create_alert(req_rsi)

    # Check with price=66000 (triggers price alert) and RSI=25 (triggers RSI alert)
    triggered = temp_alert_engine.check_alerts(
        symbol="BTCUSDT",
        provider="binance",
        current_price=66000.0,
        indicator_values={"RSI_14": 25.0},
    )

    assert len(triggered) == 2
    for t in triggered:
        assert t["status"] == "TRIGGERED"
