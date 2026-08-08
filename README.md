# 📈 REPLAY — Trading Research Platform

[![Live Demo](https://img.shields.io/badge/Live_Demo-replay--nine--gold.vercel.app-00C853?style=for-the-badge&logo=vercel)](https://replay-nine-gold.vercel.app/)
[![Frontend](https://img.shields.io/badge/Frontend-React_%7C_TypeScript_%7C_Vite-61DAFB?style=flat-square&logo=react)](https://replay-nine-gold.vercel.app/)
[![Backend](https://img.shields.io/badge/Backend-FastAPI_%7C_Python-009688?style=flat-square&logo=fastapi)](https://replay-xj3e.onrender.com)
[![Database](https://img.shields.io/badge/Database-PostgreSQL_%2F_SQLite-336791?style=flat-square&logo=postgresql)](https://replay-nine-gold.vercel.app/)

> **REPLAY**, piyasa simülasyonu (Market Replay), manuel backtest, teknik analiz ve JSON tabanlı nicel strateji araştırması odaklı, yüksek performanslı ve modüler bir web platformudur.

🌐 **Canlı Uygulama Adresi:** [https://replay-nine-gold.vercel.app/](https://replay-nine-gold.vercel.app/)

---

## 🌟 Öne Çıkan Özellikler

- **📉 İnteraktif Grafik & Teknik Analiz Engine:**
  - `lightweight-charts` tabanlı, milisaniyelik yanıt süresine sahip mum ve çizgi grafiği.
  - Çoklu zaman dilimi desteği (`1d`, `4h`, `1h`, `15m`, `5m`, `1m`).
  - Dahili indikatörler: **EMA, SMA, RSI, MACD, ATR, Bollinger Bands, ADX, Volume MA**.
  - Özelleştirilebilir renkler, pan/zoom, crosshair ve ölçüm araçları.

- **↺ Market Replay (Piyasa Simülasyonu):**
  - Adım adım mum ilerletme (*bar-by-bar simulation*), otomatik oynatma, duraklatma ve hız ayarı.
  - Belirli bir geçmiş tarihe anında gitme ve zaman aralığı seçimi.
  - Klavye kısayolları ile hızlı kontrol.

- **⚙️ JSON Tabanlı Görsel Strateji Motoru (Rule Engine):**
  - Kod yazmaya gerek kalmadan `EMA20 > EMA50 AND RSI < 30 => AL` gibi karmaşık kural ağaçları (DSL) oluşturma.
  - Strateji parametrelerini dinamik olarak tanımlama (`$period`, `$rsi_threshold`).
  - Çoklu zaman dilimi filtreleme (örn. 15m grafik üzerinde 4h trend filtresi).
  - **Lookahead-Bias Önleyici Mimari:** Gelecek mum verisinin geriye dönük sızmasını (*future leak*) kesin olarak engelleyen garantili hesaplama.

- **🔍 Toplu Tarama & Sinyal Motoru (Scanner):**
  - Tanımlanan stratejileri BIST, NASDAQ veya Kripto (Binance) sembol kümesinde tek tıkla tarama.
  - Al/Sat sinyallerini ve koşul uyum oranlarını listeleme.

- **📋 Akıllı İzleme Listesi (Watchlist):**
  - Sürükle-bırak destekli özelleştirilebilir sembol listeleri (`@dnd-kit`).
  - Semboller için anlık fiyat, yüzde değişim ve aktif strateji sinyalleri.

- **🔔 Koşullu Alarm Sistemi (Alert Engine):**
  - İndikatör kesişimleri ve fiyat seviyeleri için kullanıcıya özel alarm tanımları.
  - Arka plan taraması ile otomatik bildirim altyapısı.

- **🔐 Güvenli Kimlik Doğrulama & Yönetim:**
  - Google OAuth 2.0 ile tek tıkla giriş ve JWT (*Access/Refresh Token*) session mimarisi.
  - Yönetici paneli (*Admin Dashboard*) ile sistem istatistikleri, kullanıcı ve strateji takibi.

---

## 🛠️ Teknoloji Yığını (Tech Stack)

### **Frontend**
- **Framework & Dili:** React 18, TypeScript, Vite
- **Grafik Motoru:** Lightweight Charts (TradingView)
- **Stil & UI:** TailwindCSS, Lucide React (İkonlar)
- **Sürükle & Bırak:** `@dnd-kit/core`, `@dnd-kit/sortable`
- **Hata İzleme:** Sentry (`@sentry/react`)
- **Dağıtım (Deployment):** Vercel

### **Backend**
- **Framework:** Python 3.10+ / FastAPI
- **Veritabanı & ORM:** PostgreSQL / SQLite, SQLAlchemy 2.0, Alembic (Migration)
- **Veri İşleme & Önbellek:** Pandas, NumPy, PyArrow (Parquet depolama)
- **Görev Zamanlayıcı:** APScheduler
- **Hata İzleme & Güvenlik:** Sentry SDK, Google Auth, Python-Jose (JWT)
- **Dağıtım (Deployment):** Render

---

## 🏗️ Mimari ve Veri Akışı

```text
               +-------------------------------------------------------+
               |                  React UI (Vercel)                    |
               | (Chart, Replay, Rule Builder, Watchlist, Admin Panel) |
               +---------------------------+---------------------------+
                                           |
                                      HTTP / REST API
                                           |
               +---------------------------v---------------------------+
               |                  FastAPI Backend (Render)             |
               +-------------+---------------------------+-------------+
                             |                           |
                +------------v------------+ +------------v------------+
                |     Strategy Engine     | |     DataLoader Engine   |
                |  (Rule Evaluation DSL)  | | (3-Tier Parquet Cache)  |
                +------------+------------+ +------------+------------+
                             |                           |
                +------------v------------+ +------------v------------+
                |    PostgreSQL / SQLite  | |    External Providers   |
                | (User, Strategy, Scan)  | |  (Binance, Yahoo Fin)   |
                +-------------------------+ +-------------------------+
```

---

## 📁 Proje Dizin Yapısı

```text
replay/
├── docs/                      # Mimari ve kullanım dokümantasyonları
├── frontend/                  # React + TypeScript Web Arayüzü
│   ├── src/
│   │   ├── components/        # Grafik, strateji editörü, watchlist bileşenleri
│   │   ├── context/           # Auth ve global state bağlamları
│   │   ├── services/          # API servisleri (Market, Strateji, Auth, Admin)
│   │   ├── store/             # Yerel state depoları
│   │   └── utils/             # İndikatör hesaplamaları ve yardımcılar
│   ├── package.json
│   └── vite.config.ts
├── backend/                   # Python FastAPI REST API Hizmeti
│   ├── app/
│   │   ├── api/               # FastAPI route tanımları (auth, market, strategy, admin...)
│   │   ├── rules/             # JSON Kural ve Koşul Değerlendirme Motoru (DSL)
│   │   ├── indicators/        # İndikatör kayıt ve hesaplama kütüphanesi
│   │   ├── data/              # Veri yükleyici ve Parquet 3 katmanlı önbellek
│   │   └── db/                # SQLAlchemy modelleri ve veritabanı bağlantısı
│   ├── alembic/               # Veritabanı şema migrasyonları
│   ├── main.py                # FastAPI ana sunucu giriş noktası
│   └── requirements.txt
├── scripts/                   # Veri indirme, güncelleme ve toplu işlem betikleri
├── storage/                   # Mum verileri önbelleği (Parquet) ve SQLite veritabanı
├── vercel.json                # Vercel proxy ve yönlendirme ayarları
└── README.md
```

---

## 🚀 Kurulum ve Yerel Çalıştırma

Projeyi yerel ortamınızda çalıştırmak için aşağıdaki adımları izleyin.

### Ön Koşullar
- **Node.js** v18+ ve **npm**
- **Python** v3.10+

---

### 1. Repository'yi Klonlayın

```bash
git clone https://github.com/ackrbulut11/replay.git
cd replay
```

---

### 2. Frontend Kurulumu ve Çalıştırma

```bash
cd frontend

# Bağımlılıkları yükleyin
npm install

# Geliştirici sunucusunu başlatın (Port: 1420)
npm run dev
```

> Frontend varsayılan olarak `http://localhost:1420` üzerinde çalışır ve `/api/*` isteklerini `http://127.0.0.1:8000` adresine yönlendirir (Vite proxy).

---

### 3. Backend Kurulumu ve Çalıştırma

Yeni bir terminal açarak backend klasörüne geçin:

```bash
cd backend

# Sanal ortam (virtualenv) oluşturun ve aktifleştirin
# Windows için:
python -m venv .venv
.venv\Scripts\activate

# Linux / macOS için:
# python3 -m venv .venv
# source .venv/bin/activate

# Bağımlılıkları yükleyin
pip install -r requirements.txt

# Veritabanı migrasyonlarını uygulayın
alembic upgrade head

# Sunucuyu başlatın
python main.py
```

> Backend varsayılan olarak `http://127.0.0.1:8000` adresinde uvicorn üzerinde başlatılır. OpenAPI dokümantasyonuna `http://127.0.0.1:8000/docs` adresinden erişebilirsiniz.

---

## 🔐 Ortam Değişkenleri (Environment Variables)

### Backend (`backend/.env`)

```env
# Veritabanı (Üretim ortamında PostgreSQL, yerelde SQLite)
DATABASE_URL=sqlite:///./storage/database/app.db

# Güvenlik & Auth
JWT_SECRET_KEY=your-super-secret-jwt-key
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Admin Yetkileri
ADMIN_EMAILS=admin@example.com,user@example.com

# Opsiyonel: Sentry Hata İzleme
SENTRY_DSN=
ENVIRONMENT=development
```

### Frontend (`frontend/.env`)

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
# VITE_SENTRY_DSN=
```

---

## 🗺️ Yol Haritası (Roadmap Status)

- [x] **Faz 1 — MVP:** İnteraktif mum grafiği, Replay kontrolleri, temel indikatörler, Binance/NASDAQ/BIST veri akışı.
- [x] **Faz 2 — Strateji Motoru:** JSON tabanlı kural geliştirici, parametre desteği, çoklu timeframe filtreleme, lookahead bias engelleme.
- [x] **Faz 3 — Scanner & Watchlist & Alarmlar:** Tüm sembollerde toplu strateji taraması, akıllı watchlist, alarm mekanizması.
- [ ] **Faz 4 — Manuel Backtest & Trade Journal:** Replay sırasında sanal pozisyon açma/kapama, performans raporu (Win Rate, Profit Factor, Drawdown), trade günlüğü.
- [ ] **Faz 5 — Gelişmiş Analiz:** Parameter Optimizer, Walk-Forward analizi, Monte Carlo simülasyonları.
- [ ] **Faz 6 — AI Özellikleri:** Doğal dilden JSON stratejiye dönüştürme, yapay zeka destekli piyasa analizi.

---

## ⚠️ Yasal Uyarı (Disclaimer)

Bu platform **yalnızca eğitim, teknik analiz ve strateji araştırması amacıyla** geliştirilmiştir. Platformda sunulan grafikler, indikatörler, strateji sinyalleri ve tahliller **kesinlikle yatırım tavsiyesi niteliğinde değildir**. 

---

## 📄 Lisans

Bu proje [MIT Lisansı](LICENSE) ile lisanslanmıştır.
