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
│   │   │   ├── JournalPage.tsx
│   │   │   └── AdminPage.tsx
│   │   │
│   │   ├── charts/
│   │   │   ├── CandleChart.tsx       # Lightweight Charts integration
│   │   │   ├── IndicatorToolbar.tsx
│   │   │   ├── ChartManager.ts       # STUB
│   │   │   ├── Indicators.ts         # STUB
│   │   │   ├── Drawings.ts           # STUB
│   │   │   └── drawings/
│   │   │
│   │   ├── replay/
│   │   │   ├── ReplayControls.tsx
│   │   │   ├── ReplayTradePanel.tsx   # replay sırasında pozisyon aç/kapat
│   │   │   ├── ReplayHistoryPanel.tsx # işlem geçmişi + kalıcı kaydetme
│   │   │   └── ReplayPanel.tsx
│   │   │
│   │   ├── strategy/
│   │   │   ├── StrategyBuilder.tsx
│   │   │   ├── ConditionEditor.tsx
│   │   │   └── StrategyList.tsx
│   │   │
│   │   ├── scanner/                  # STUB
│   │   │   ├── ScannerTable.tsx
│   │   │   ├── FilterPanel.tsx
│   │   │   └── WatchlistPanel.tsx
│   │   │
│   │   ├── journal/                  # STUB
│   │   │   ├── TradeJournalTable.tsx
│   │   │   └── PerformanceReport.tsx
│   │   │
│   │   ├── workspace/                # STUB
│   │   │   ├── WorkspaceManager.ts
│   │   │   └── LayoutStore.ts
│   │   │
│   │   ├── services/
│   │   │   ├── api.ts
│   │   │   ├── strategyApi.ts
│   │   │   ├── adminApi.ts
│   │   │   ├── chartAnalytics.ts
│   │   │   ├── websocket.ts          # STUB
│   │   │   └── backend.ts            # STUB
│   │   │
│   │   ├── store/
│   │   │   ├── replayStore.ts
│   │   │   ├── strategyStore.ts
│   │   │   ├── watchlistStore.ts
│   │   │   ├── alertStore.ts
│   │   │   ├── chartStore.ts         # STUB
│   │   │   └── userStore.ts          # STUB
│   │   │
│   │   ├── hooks/
│   │   │   └── useDraggablePanel.ts   # yüzen panelleri sürüklenebilir yapar
│   │   │
│   │   ├── types/
│   │   │
│   │   └── utils/
│   │
│   └── e2e/                          # Playwright test senaryoları
│
│
├── backend/                          # Python FastAPI (REST API & Auth Engine)
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
│   │   │   │   ├── alerts.py
│   │   │   │   ├── watchlist.py
│   │   │   │   ├── admin.py
│   │   │   │   ├── analytics.py
│   │   │   │   ├── replay.py          # STUB
│   │   │   │   ├── scanner.py         # STUB
│   │   │   │   ├── backtest.py        # STUB
│   │   │   │   └── journal.py
│   │   │   │
│   │   │   └── websocket.py          # STUB
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
│   │   ├── database/                 # SQLite ORM Models (SQLAlchemy)
│   │   │   ├── sqlite.py             # Engine & Session (aktif — DATABASE_URL sqlite:///./storage/database/app.db)
│   │   │   ├── postgres.py           # Kullanılmıyor / gelecekteki Postgres desteği için
│   │   │   ├── models.py             # User, Strategy, StrategyScan, StrategyEvaluation, Alert, Watchlist, ReplaySession, JournalTrade, ChartLayout
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
│   │   │   ├── strategy_engine.py
│   │   │   ├── scanner_engine.py
│   │   │   ├── replay_engine.py
│   │   │   └── backtest_engine.py     # STUB
│   │   │
│   │   ├── journal/
│   │   │   ├── models.py
│   │   │   └── trade_journal.py
│   │   │
│   │   ├── reports/
│   │   │   └── performance_report.py
│   │   │
│   │   ├── optimizer/                 # STUB
│   │   │   └── parameter_search.py
│   │   │
│   │   ├── alerts/
│   │   │   ├── telegram.py
│   │   │   └── notification.py
│   │   │
│   │   ├── ai/                        # STUB
│   │   │   ├── strategy_generator.py
│   │   │   └── analyzer.py
│   │   │
│   │   └── utils/
│   │
│   └── tests/                        # unittest tabanlı (pytest değil) — bkz. CLAUDE.md Commands
│       ├── test_rules.py
│       ├── test_strategy_api.py
│       ├── test_alerts.py
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
│   ├── import_strategies_to_db.py    # Eski JSON stratejileri veritabanına aktarır (tek seferlik)
│   └── import_alerts_to_db.py        # Eski JSON alarmları veritabanına aktarır (tek seferlik)
│
└── .github/
    └── workflows/
        └── build.yml
```
