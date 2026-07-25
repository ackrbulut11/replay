# Görev: Tauri Masaüstü Uygulamasını Google OAuth Destekli Web Uygulamasına Dönüştürme (Yalın MVP)

## Bağlam
Mevcut sistem: **Tauri + FastAPI + SQLite**, tek kullanıcılı masaüstü uygulaması.
Hedef sistem: **React + FastAPI + PostgreSQL**, çoklu kullanıcılı web uygulaması.

Kimlik doğrulama **yalnızca Google OAuth 2.0 (Gmail ile giriş)** üzerinden yapılacaktır.
Klasik email/şifre kayıt-giriş akışı, bcrypt şifreleme ve "şifremi unuttum" akışı **kapsam dışıdır**.
Görsel depolama (Cloudflare R2/S3) ve SQLite migrasyonu ilk etap (MVP) için **kapsam dışıdır**.

---

## Adım 1 — Frontend Web Dönüşümü & Tauri Temizliği
- `frontend/src-tauri/` masaüstü klasörünü devre dışı bırak/kaldır.
- `frontend/package.json` içinden Tauri bağımlılıklarını temizle.
- Web uygulaması için gerekli `@react-oauth/google` ve `jwt-decode` paketlerini ekle.
- `git commit` yap (pushlama).

## Adım 2 — Veritabanı & Modeller (PostgreSQL)
- PostgreSQL / SQLite uyumlu SQLAlchemy altyapısını kur (`app/database/postgres.py`).
- `User` modelini oluştur. Alanlar: `id` (UUID), `google_id` (unique, indexed), `email`, `name`, `avatar_url`, `created_at`.
  - Şifre alanı **yok** — kimlik doğrulama tamamen Google OAuth'a devredilecek.
- `Strategy`, `JournalTrade`, `ReplaySession`, `ChartLayout` tablolarını `user_id` (Foreign Key → `User.id`, indexed) ile güncelle.
- `git commit` yap (pushlama).

## Adım 3 — Backend Auth (Google OAuth 2.0 & JWT)
- `app/auth/` modülünü yaz (`jwt.py`, `dependencies.py`, `router.py`):
  - `/api/auth/google` — Google credential'ı doğrular, kullanıcıyı kaydeder/getirir, JWT **access token** ve **refresh token** (httpOnly cookie) döner.
  - `/api/auth/refresh` — refresh token'ı doğrular, yeni access token üretir.
  - `/api/auth/me` — mevcut kullanıcı profil bilgisini döner.
  - `/api/auth/logout` — refresh token cookie'sini temizler.
- `Depends(get_current_user)` dependency'sini yaz ve mevcut endpoint'leri (`market.py`, `strategy.py`) `user_id` ile filtrele.
- `git commit` yap (pushlama).

## Adım 4 — Frontend Auth (React Entegrasyonu)
- `context/AuthContext.tsx` oluştur: `user`, `accessToken`, `login`, `logout`, `refreshAccessToken`.
- `pages/LoginPage.tsx` sayfasını oluştur (Google ile Giriş Yap butonu ile).
- `services/api.ts` axios/fetch interceptor: her isteğe `Authorization: Bearer <accessToken>` ekle; 401 durumunda silent refresh yap.
- Protected Routes: Giriş yapmamış kullanıcıları `/login` sayfasına yönlendir.
- `git commit` yap (pushlama).

---

## Kapsam Dışı (İleride Eklenecekler)
- Email/şifre ile kayıt-giriş ve bcrypt
- Görsel depolama (Cloudflare R2 / S3)
- Strateji ve backtest sonuçlarını başkalarıyla paylaşma (Sosyal ağ)
- SQLite migrasyon betiği

---

## Kurallar
1. Her bir adım tamamlandığında `git commit` yapılacak (asla `git push` yapılmayacak).
2. Değişiklik yapılan dosyalar temiz ve yorumlu şekilde güncellenecektir.