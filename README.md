# Trading Research Platform

Market replay, manuel backtest, strateji araştırmaları ve teknik analiz odaklı modüler bir masaüstü platformu.

## Tech Stack

- **Frontend:** React + TypeScript + TailwindCSS + Tauri (Grafik kütüphanesi: `lightweight-charts`)
- **Backend:** Python + FastAPI (Tauri sidecar olarak çalışır, WebSocket üzerinden veri sağlar)
- **Veritabanı:** SQLite (`storage/database/app.db`)

## Proje Yapısı

```text
├── docs/               # Dokümantasyon
├── frontend/           # React + TypeScript + Tauri arayüzü
├── backend/            # Python FastAPI backend modülü
├── storage/            # Mum verileri, stratejiler ve yerel veritabanı
├── scripts/            # Veri indirme, güncelleme ve derleme betikleri
└── .gitignore          
```

## Kurulum ve Çalıştırma

### 1. Frontend Kurulumu

```bash
cd frontend
npm install
npm run dev
```

### 2. Backend Kurulumu

```bash
cd backend
# Sanal ortamı aktifleştirin (Windows)
.venv\Scripts\activate

# Bağımlılıkları yükleyin 
pip install -r requirements.txt

# Çalıştırın
python main.py
```

