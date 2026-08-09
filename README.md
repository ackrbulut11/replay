# 📈 REPLAY — Trading Research Platform

[![Live Demo](https://img.shields.io/badge/Live_Demo-replay--nine--gold.vercel.app-00C853?style=for-the-badge&logo=vercel)](https://replay-nine-gold.vercel.app/)

> **REPLAY**, geçmiş piyasa verileri üzerinde zaman aralıklı mum simülasyonu (*Market Replay*), kural tabanlı strateji geliştirme (DSL), teknik analiz indikatörleri ve grafik inceleme odaklı modüler bir finansal araştırma ve backtest platformudur.

🌐 **Canlı Uygulama Adresi:** [https://replay-nine-gold.vercel.app/](https://replay-nine-gold.vercel.app/)

---

## 🎯 Projenin Amacı ve Özellikleri

REPLAY, finansal piyasalarda (Kripto, BIST, NASDAQ, Forex) teknik analiz ve strateji araştırmaları yapmak isteyen kullanıcılar için tasarlanmış modern bir web platformudur.

### **Ana Modüller & Yetenekler**

- **⏳ Market Replay (Geçmiş Simülasyonu):**
  - Seçilen sembol ve zaman diliminde geçmiş veriler üzerinde adım adım veya otomatik oynatma.
  - Canlı piyasa psikolojisini geçmiş mumlar üzerinde deneyimleme imkanı.

- **⚡ Strateji ve Kural Motoru (JSON DSL):**
  - Kod yazmaya gerek kalmadan görsel koşul ve mantık editörü (`AND` / `OR` grupları).
  - İndikatörler (RSI, MACD, Bollinger Bands, Moving Averages vb.), fiyat hareketleri ve mum formasyonları üzerinden alım/satım kuralları oluşturma.
  - Zaman dilimi (Timeframe) filtreleme ve lookahead bias (gelemeyen gelecek verisinin kullanımı) engelleme mimarisi.

- **📊 İnteraktif Grafik & Teknik Analiz:**
  - Lightweight Charts (TradingView) altyapısı ile yüksek performanslı interaktif mum grafikler.
  - Çizim araçları, cetvel (ruler), dinamik indikatör katmanları ve zaman dilimi değiştirebilme.

- **🔍 Toplu Piyasa Taraması (Scanner) & İzleme Listeleri (Watchlists):**
  - Oluşturulan bir kuralın tüm sembol listelerinde tek tıkla toplu olarak taranması.
  - BIST, NASDAQ, Kripto ve Forex sembol kategorileri ile özelleştirilebilir kullanıcı izleme listeleri.

- **🔐 Güvenli Kimlik Doğrulama & Yönetici Paneli:**
  - Google OAuth 2.0 ile oturum açma ve güvenli JWT (Access / Refresh Token) altyapısı.
  - Yönetici ekranı ile sistem durumu, kullanıcı listesi ve aktif stratejilerin izlenmesi.

---

## 🛠️ Teknoloji Yığını (Tech Stack)

### **Frontend**
- **Framework & Dili:** React 18, TypeScript, Vite
- **Grafik Motoru:** Lightweight Charts (TradingView)
- **Stil & Tasarım:** TailwindCSS, Lucide React (İkonlar)
- **Sürükle & Bırak:** `@dnd-kit/core`, `@dnd-kit/sortable`
- **Dağıtım (Deployment):** Vercel

### **Backend**
- **Framework & Dili:** Python 3.10+ / FastAPI
- **Veritabanı & ORM:** PostgreSQL / SQLite, SQLAlchemy 2.0, Alembic
- **Veri İşleme & Önbellekleme:** Pandas, NumPy, PyArrow (3 Katmanlı Parquet veri depolama)
- **Veri Kaynakları:** Binance API, Yahoo Finance (NASDAQ, BIST, Forex)
- **Görev & Bildirim Zamanlayıcı:** APScheduler
- **Dağıtım (Deployment):** Render

---

## 🏛️ Sistem Mimari Akışı

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

## 📁 Proje Klasör Yapısı

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
│   └── main.py                # FastAPI ana sunucu giriş noktası
├── scripts/                   # Veri indirme, güncelleme ve toplu işlem betikleri
├── storage/                   # Mum verileri önbelleği (Parquet) ve SQLite veritabanı
└── vercel.json                # Vercel proxy ve yönlendirme ayarları
```

---

## 🗺️ Yol Haritası (Roadmap)

- [x] **Faz 1 — MVP:** İnteraktif mum grafiği, Replay kontrolleri, temel indikatörler, Binance/NASDAQ/BIST veri akışı.
- [x] **Faz 2 — Strateji Motoru:** JSON tabanlı kural geliştirici, parametre desteği, çoklu timeframe filtreleme, lookahead bias engelleme.
- [x] **Faz 3 — Scanner & Watchlist & Alarmlar:** Tüm sembollerde toplu strateji taraması, akıllı watchlist, alarm mekanizması.
- [ ] **Faz 4 — Manuel Backtest & Trade Journal:** Replay sırasında sanal pozisyon açma/kapama, performans raporu (Win Rate, Profit Factor, Drawdown), trade günlüğü.
- [ ] **Faz 5 — Gelişmiş Analiz:** Parameter Optimizer, Walk-Forward analizi, Monte Carlo simülasyonları.
- [ ] **Faz 6 — Yapay Zeka Özellikleri:** Doğal dilden JSON stratejiye dönüştürme, AI destekli piyasa ve mum analizi.

---

## 📄 Lisans

Bu proje [MIT Lisansı](LICENSE) ile lisanslanmıştır.
