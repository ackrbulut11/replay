```
TradingResearchPlatform/

├── README.md
├── LICENSE
├── .gitignore
├── docs/
│
├── frontend/                         # React + TypeScript + Tauri UI
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
│   │   │
│   │   ├── components/               # Ortak UI parçaları
│   │   │   ├── ui/                   # shadcn components
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── Toolbar.tsx
│   │   │
│   │   ├── layouts/
│   │   │   └── DashboardLayout.tsx
│   │   │
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── ChartPage.tsx
│   │   │   ├── ReplayPage.tsx
│   │   │   ├── ScannerPage.tsx
│   │   │   ├── StrategyPage.tsx
│   │   │   ├── BacktestPage.tsx
│   │   │   └── JournalPage.tsx
│   │   │
│   │   ├── charts/
│   │   │   ├── CandleChart.tsx       # Lightweight Charts
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
│   ├── e2e/                          # Playwright / test senaryoları
│   │
│   └── src-tauri/                    # Tauri Rust tarafı
│       │
│       ├── Cargo.toml
│       ├── tauri.conf.json
│       ├── capabilities/
│       │
│       ├── src/
│       │   ├── main.rs
│       │   └── commands.rs
│       │
│       └── binaries/
│           └── backend.exe           # Python sidecar
│
│
├── backend/                          # Python FastAPI
│   │
│   ├── requirements.txt
│   ├── pyproject.toml
│   ├── main.py
│   │
│   ├── app/
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
│   │   │   │   └── nasdaq.py
│   │   │   │
│   │   │   └── loader.py
│   │   │
│   │   ├── indicators/
│   │   │   ├── base.py
│   │   │   ├── trend.py
│   │   │   ├── momentum.py
│   │   │   └── volatility.py
│   │   │
│   │   ├── rules/                    # Rule/Strategy Engine — kod yazmadan JSON tabanlı strateji
│   │   │   ├── engine.py             # JSON kural ağacını parse edip değerlendirir
│   │   │   ├── conditions.py         # >, <, cross_above, cross_below vb. operatörler
│   │   │   └── evaluator.py
│   │   │
│   │   ├── engines/
│   │   │   ├── replay_engine.py
│   │   │   ├── strategy_engine.py
│   │   │   ├── scanner_engine.py
│   │   │   └── backtest_engine.py
│   │   │
│   │   ├── journal/
│   │   │   ├── trade_journal.py
│   │   │   └── models.py             # Trade, Note, Screenshot
│   │   │
│   │   ├── reports/
│   │   │   └── performance_report.py # Win Rate, Profit Factor, Sharpe, Drawdown
│   │   │
│   │   ├── database/
│   │   │   ├── sqlite.py
│   │   │   ├── models.py
│   │   │   └── migrations/
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
│   └── tests/
│
│
├── storage/
│   │
│   ├── market_data/
│   │   ├── binance/
│   │   ├── bist/
│   │   └── nasdaq/
│   │
│   ├── strategies/                   # Kullanıcı stratejileri (JSON)
│   │
│   ├── parquet/
│   │
│   └── database/
│       └── app.db
│
│
├── scripts/
│   ├── download_data.py
│   ├── update_market.py
│   └── build_sidecar.py
│
└── .github/
    └── workflows/
        └── build.yml
```
