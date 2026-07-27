# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"REPLAY" — a trading research platform for market replay, manual backtesting and JSON-defined strategy research. React + TypeScript frontend (Tauri shell), Python/FastAPI backend, parquet + SQLite storage.

**Code comments, docstrings and all UI text are in Turkish.** Match that when editing existing files.

Three project documents are binding and must be read before non-trivial work:
- [RULES.md](RULES.md) — architectural rules, lookahead-bias rules, data-retention rules, hard prohibitions
- [SKILLS.md](SKILLS.md) — per-layer technical practices and allowed libraries
- [directory_structure.md](directory_structure.md) — the canonical directory tree. Per RULES.md §16, update this file *before* adding/moving/renaming any directory.

## Commands

### Frontend (`frontend/`)
```bash
npm install
npm run dev      # Vite dev server on port 1420 (strictPort), proxies /api -> http://127.0.0.1:8000
npm run build    # tsc && vite build
npm run lint     # eslint, --max-warnings 0
```

### Backend (`backend/`)
```bash
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
python main.py                   # uvicorn on 127.0.0.1:8000 with reload
```

### Tests (`backend/`)
Tests are `unittest`-based (not pytest, despite the stale `.pytest_cache/`). `tests/` has no `__init__.py`, so `unittest discover` fails — run modules by name from the `backend/` directory:
```bash
python -m unittest tests.test_rules                      # single module
python -m unittest tests.test_rules.TestRules.test_operators   # single test
python -m unittest tests.test_rules tests.test_strategy_api tests.test_alerts tests.test_auth_api
```
`ruff` is installed in the venv (no config file; defaults apply).

### Annotation evaluation — a recurring source of import-time crashes
`backend/.venv` is **Python 3.9.13** while `pyproject.toml` declares `^3.10`. Annotations are evaluated eagerly unless a module starts with `from __future__ import annotations`, and this repo has repeatedly shipped modules that crash on import because of it (`-> User | None` in `auth/dependencies.py` under 3.9; `engine: StrategyEngine` in `api/routes/admin.py`, where `StrategyEngine` is only imported lazily inside the endpoint bodies — that one broke on *every* Python version and took the whole app down).

**Start every new backend module with `from __future__ import annotations`.** After touching any module reachable from `main.py`, verify the app still imports:
```bash
python -c "import main"      # from backend/
```
FastAPI 0.128 evaluates parameter annotations leniently, so a missing `typing.Optional` in a route signature does *not* raise — but a missing name in a plain module-level `def` does. Do not rely on the app starting as proof that imports are complete.

## Architecture

### Layering (enforced by RULES.md)
```
React UI  ──HTTP /api──▶  FastAPI routes (thin)  ──▶  engines/ + rules/  ──▶  data/loader  ──▶  data/providers/*
```
- Routes contain no business logic; logic lives in `engines/`, `rules/`, `indicators/`.
- The strategy/rule engine never imports anything chart- or frontend-related, and the same `RuleEngine.evaluate*` path serves both live analysis and replay.
- Frontend talks to the backend only through `src/services/*`; components must not `fetch` directly (several existing files violate this — don't copy the pattern).

### Strategies are data, not code
A strategy is a JSON file in `storage/strategies/<uuid>.json` with `parameters`, `entry_rules`, `exit_rules`, `timeframe_filters`, `allow_short`, `take_profit_pct`, `stop_loss_pct`. Never add a `.py` file per strategy.

Rule DSL: a condition group is `{logic: "AND"|"OR", conditions: [{left, operator, right, right2?}]}`. Each operand is `{type: "indicator"|"price"|"value"|"pnl", ...}`. Numeric fields may reference a strategy parameter as a `"$param_name"` string, resolved by `resolve_parameter()` in [evaluator.py](backend/app/rules/evaluator.py).

Evaluation path: `StrategyEngine.evaluate()` → `RuleEngine.evaluate_range()` (bar-by-bar loop, position state machine `none|long|short`, TP/SL checks before rule checks) → `RuleEngine.evaluate_bar_with_state()` → `RuleEvaluator.evaluate_group()` → `IndicatorRegistry.get_value()`.

Adding an indicator = one pure function plus one entry in `INDICATOR_INFO` in [registry.py](backend/app/indicators/registry.py) (`multi_output: True` returns a dict of named series). Adding an operator = one small function in [conditions.py](backend/app/rules/conditions.py). Both require a unit test.

Adding a market = implement `IDataProvider` in `data/providers/` and register it in `DataLoader.providers`; nothing else should change.

### Lookahead bias is a hard constraint
`shift(-1)` and any future-looking access are prohibited (RULES.md §19–23). Signals come from the closed bar; evaluation is bar-index bounded. `IndicatorRegistry.get_value()` returns NaN for `bar_index < period` (warmup). `RuleEngine._get_warmup_period()` derives the start index from the largest indicator period in the strategy.

### Data loading and caching
[data/loader.py](backend/app/data/loader.py) is a three-tier cache: in-process RAM dict keyed by `(provider, symbol, timeframe)` and invalidated by parquet mtime → `storage/market_data/<provider>/<SYMBOL>_<tf>.parquet` → provider API. Cache hits are range-checked at both ends and only the missing prefix/suffix is fetched; a cache younger than 300s counts as covering "now". Per-symbol `threading.Lock`s guard parquet writes. `4h` for nasdaq/bist/forex is resampled from `1h` and cached. Timestamps are pandas datetimes; daily+ timeframes are normalized and deduped.

### Storage path resolution — two `storage/` directories exist
`StrategyEngine`, `AlertEngine` and `DataLoader` each walk up from `__file__` until they find a directory containing `storage/`. Starting under `backend/app/...`, that resolves to **`backend/storage/`**, not the repo-root `storage/`. `DATABASE_URL` (`sqlite:///./storage/database/app.db`) is relative to the process CWD, so running `python main.py` from `backend/` also lands in `backend/storage/`. Repo-root `storage/` is largely vestigial. When adding a path, follow the existing walk-up helper rather than introducing a new root.

Strategy JSON files, not the SQLAlchemy `Strategy` table, are the source of truth; the table exists in parallel and [admin.py](backend/app/api/routes/admin.py) reconciles both (`max(json_count, sql_count)`).

### Auth
Google OAuth 2.0 → `POST /api/auth/google` → app-issued JWT (access + refresh). `get_current_user` (401 on failure) and `get_current_user_optional` (returns `None`) in [dependencies.py](backend/app/auth/dependencies.py). Strategy endpoints use the optional dependency and filter by `user_id`, treating strategies with no `user_id` as visible to everyone (legacy records).

A dev bypass exists: any credential equal to `dev_mock_google_token` or starting with `dev_` logs in as `demo.trader@example.com`.

Frontend token storage is inconsistent — `strategyApi.ts` reads `replay_access_token` with a fallback to `replay_auth_token`. Check `AuthContext.tsx` before touching either key.

### Frontend state and routing
There is **no router**. `App.tsx` holds an `activeTab` string and renders chart/replay/strategy inline; every other tab renders a placeholder. Symbol/provider/timeframe/date range are `useState` in `App.tsx` and threaded down as props.

Stores in `src/store/` are hand-rolled (no zustand/redux): a module-level `currentState`, a `Set` of listeners, and a `useXStore()` hook returning `[state, setState]`. Follow that shape for new stores.

Charts use `lightweight-charts` only — do not write a custom candlestick renderer. `charts/CandleChart.tsx` is ~2300 lines and owns most chart behavior.

### Implementation status — many files are 0–3 line placeholders
Only Phases 1–3 are partially built. Verify a module is real before wiring to it:
- **Implemented:** market data + symbols, indicators, rules/evaluator/engine, strategy engine + routes, scanner engine, alerts, auth, admin; frontend chart, strategy builder/list/condition editor, batch scanner, watchlist, alerts, replay controls.
- **Stubs:** `engines/replay_engine.py`, `engines/backtest_engine.py`, `optimizer/`, `ai/`, `journal/`, `reports/`, `api/websocket.py`, routes `replay|scanner|backtest|journal|watchlist`, and frontend `pages/{Chart,Dashboard,Replay,Scanner,Backtest,Journal}Page.tsx`, `scanner/`, `journal/`, `workspace/`, `services/{websocket,backend}.ts`, `store/{chartStore,userStore}.ts`, `charts/{ChartManager,Indicators,Drawings}.ts`.

`main.py` mounts only `auth`, `market`, `strategy`, `alerts`, `admin` under `/api`. New routers must be added there explicitly.

## Deployment

Frontend deploys to Vercel; `vercel.json` rewrites `/api/*` to the Render backend at `https://replay-xj3e.onrender.com/api`, which `.env.production` also sets as `VITE_API_BASE_URL`. CORS in `main.py` allows any `*.vercel.app` plus localhost via regex. CI ([.github/workflows/build.yml](.github/workflows/build.yml)) only runs the frontend build on windows-latest — no backend tests or lint in CI.

Note: `backend/app/core/config.py` currently hardcodes a Google client ID and a dev JWT secret as pydantic-settings defaults. Real values belong in `.env` (RULES.md §17).
