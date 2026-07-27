```
TradingResearchPlatform/

├── README.md
├── LICENSE
├── .gitignore
├── docs/
│
├── frontend/                         # Modern Web Application (React + Vite + TypeScript)
│   │
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   │
│   ├── src/
│   │   │
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   │
│   │   ├── assets/
│   │   │   └── logo.jpg              # Official REPLAY platform brand logo
│   │   │
│   │   ├── context/
│   │   │   └── AuthContext.tsx       # Google OAuth 2.0 & JWT Auth state management
│   │   │
│   │   ├── components/               # Ortak UI parçaları
│   │   │   ├── ui/                   # Modular UI components
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── Toolbar.tsx
│   │   │
│   │   ├── layouts/
│   │   │   └── DashboardLayout.tsx
│   │   │
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx         # Google OAuth & Demo Test Login page
│   │   │   ├── Dashboard.tsx
│   │   │   ├── ChartPage.tsx
│   │   │   ├── ReplayPage.tsx
│   │   │   ├── ScannerPage.tsx
│   │   │   ├── StrategyPage.tsx
│   │   │   ├── BacktestPage.tsx
│   │   │   └── JournalPage.tsx
│   │   │
│   │   ├── charts/
│   │   │   ├── CandleChart.tsx       # Lightweight Charts integration
│   │   │   ├── ChartManager.ts
│   │   │   ├── Indicators.ts
│   │   │   └── Drawings.ts
│   │   │
│   │   ├── replay/
│   │   │   ├── ReplayControls.tsx
│   │   │   └── ReplayPanel.tsx
│   │   │
│   │   ├── strategy/
│   │   │   ├── StrategyBuilder.tsx
│   │   │   ├── ConditionEditor.tsx
│   │   │   └── StrategyList.tsx
│   │   │
│   │   ├── scanner/
│   │   │   ├── ScannerTable.tsx
│   │   │   ├── FilterPanel.tsx
│   │   │   └── WatchlistPanel.tsx
│   │   │
│   │   ├── journal/
│   │   │   ├── TradeJournalTable.tsx
│   │   │   └── PerformanceReport.tsx
│   │   │
│   │   ├── workspace/
│   │   │   ├── WorkspaceManager.ts
│   │   │   └── LayoutStore.ts
│   │   │
│   │   ├── services/
│   │   │   ├── api.ts
│   │   │   ├── websocket.ts
│   │   │   └── backend.ts
│   │   │
│   │   ├── store/
│   │   │   ├── chartStore.ts
│   │   │   ├── replayStore.ts
│   │   │   └── userStore.ts
│   │   │
│   │   ├── hooks/
│   │   │
│   │   ├── types/
│   │   │
│   │   └── utils/
│   │
│   └── e2e/                          # Playwright test senaryoları
│
│
├── backend/                          # Python FastAPI (Web REST & Auth Engine)
│   │
│   ├── requirements.txt
│   ├── pyproject.toml
│   ├── alembic.ini                   # Alembic yapılandırması (URL env.py'den okunur)
│   ├── .env.example                  # Ayar şablonu (.env git'e girmez)
│   ├── main.py
│   │
│   ├── app/
│   │   │
│   │   ├── auth/                     # Google OAuth 2.0 & JWT Authentication
│   │   │   ├── router.py             # Auth endpoints (/google, /refresh, /me, /logout)
│   │   │   ├── jwt.py                # Token creation & verification
│   │   │   └── dependencies.py       # FastAPI current_user dependency
│   │   │
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── market.py
│   │   │   │   ├── strategy.py
│   │   │   │   ├── replay.py
│   │   │   │   ├── scanner.py
│   │   │   │   ├── watchlist.py
│   │   │   │   ├── backtest.py
│   │   │   │   ├── journal.py
│   │   │   │   └── alerts.py
│   │   │   │
│   │   │   └── websocket.py
│   │   │
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   └── security.py
│   │   │
│   │   ├── data/
│   │   │   ├── providers/
│   │   │   │   ├── base.py
│   │   │   │   ├── binance.py
│   │   │   │   ├── bist.py
│   │   │   │   ├── nasdaq.py
│   │   │   │   └── forex.py          # Tick volume & Intraday Yahoo FX provider
│   │   │   │
│   │   │   └── loader.py             # L1 RAM Cache, Parquet storage & thread safety
│   │   │
│   │   ├── database/                 # PostgreSQL & SQLite ORM Models
│   │   │   ├── postgres.py           # SQLAlchemy Engine & Session
│   │   │   ├── models.py             # User, Strategy, StrategyScan, ReplaySession, JournalTrade, ChartLayout
│   │   │   └── migrations/           # Alembic
│   │   │       ├── env.py
│   │   │       ├── script.py.mako
│   │   │       └── versions/
│   │   │
│   │   ├── indicators/
│   │   │   ├── base.py
│   │   │   ├── trend.py
│   │   │   ├── momentum.py
│   │   │   └── volatility.py
│   │   │
│   │   ├── rules/                    # Rule/Strategy Engine — JSON kural ağacı
│   │   │   ├── engine.py
│   │   │   ├── conditions.py
│   │   │   └── evaluator.py
│   │   │
│   │   ├── engines/
│   │   │   ├── replay_engine.py
│   │   │   ├── strategy_engine.py
│   │   │   ├── scanner_engine.py
│   │   │   └── backtest_engine.py
│   │   │
│   │   ├── journal/
│   │   │   └── trade_journal.py
│   │   │
│   │   ├── reports/
│   │   │   └── performance_report.py
│   │   │
│   │   ├── optimizer/
│   │   │   └── parameter_search.py
│   │   │
│   │   ├── alerts/
│   │   │   ├── telegram.py
│   │   │   └── notification.py
│   │   │
│   │   ├── ai/
│   │   │   ├── strategy_generator.py
│   │   │   └── analyzer.py
│   │   │
│   │   └── utils/
│   │
│   └── tests/                        # Automated Auth & Market API integration tests
│       └── test_auth_api.py
│
│
├── storage/
│   │
│   ├── market_data/                  # Parquet Caches
│   │   ├── binance/
│   │   ├── bist/
│   │   ├── nasdaq/
│   │   └── forex/
│   │
│   ├── strategies/                   # ESKİ: stratejiler artık veritabanında (bkz. RULES.md §4)
│   │                                 # Bu klasör yalnızca geçiş öncesi yedekleri barındırır.
│   │
│   └── database/
│       └── app.db                    # Local SQLite Database
│
│
├── scripts/
│   ├── download_data.py
│   ├── update_market.py
│   ├── build_sidecar.py
│   └── import_strategies_to_db.py    # Eski JSON stratejileri veritabanına aktarır (tek seferlik)
│
└── .github/
    └── workflows/
        └── build.yml
```
