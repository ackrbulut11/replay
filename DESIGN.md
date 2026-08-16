# DESIGN.md — REPLAY görsel sistemi

Bu dosya arayüzün tek görsel otoritesidir. Yeni bir ekran ya da bileşen
yazarken buradaki isimleri kullanın; ham Tailwind renkleri (`slate-700`,
`zinc-800`, `indigo-500`) artık kullanılmaz.

Token'ların tanımı: [frontend/tailwind.config.ts](frontend/tailwind.config.ts).
Taban katman ve tarayıcı yüzeyleri: [frontend/src/index.css](frontend/src/index.css).

---

## Neyi tasarlıyoruz

REPLAY bir **Operate** yüzeyi: kullanıcı bir işin içinde — bir kural kuruyor,
bir barı ileri sarıyor, bir taramanın sonucunu okuyor. Tasarımın işi kendini
göstermek değil, işin önünden çekilmek. Yoğunluk bir kusur değil, gereklilik:
ekranda aynı anda çok sayı olacak ve bu iyi.

İki istisna **Persuade** modundadır ve İngilizcedir: `LandingPage` ve
`LoginPage`. Uygulamanın geri kalanı Türkçedir.

---

## Renk

### Kural: yeşil ve kırmızı bir anlamı vardır, o da sizin buton renginiz değil

Bir trading arayüzünde yeşil "kâr", kırmızı "zarar" demektir. Yeşil bir
"Kaydet" butonu ya da yeşil bir aktif sekme, iki santim yanındaki yeşil PnL
rakamının anlamını çalar. Bu yüzden:

| Rol | Token | Nerede |
|---|---|---|
| Birincil eylem, seçili durum, aktif sekme, odak halkası | `accent-*` | Butonlar, aktif nav, seçili satır, `:focus-visible` |
| Kâr, pozitif getiri, alış yönü | `profit-*` | PnL sütunları, getiri rakamları, LONG etiketi |
| Zarar, negatif getiri, satış yönü | `loss-*` | PnL sütunları, drawdown, SHORT etiketi |
| Uyarı, geri alınamaz eylem, eksik veri | `warn-*` | Isınma periyodu uyarısı, silme onayı |

`loss-*` yıkıcı eylemler için de kullanılır (sil, oturumu kapat) — bir trader
için kırmızı zaten "dikkat" demektir, ikinci bir kırmızı icat etmeye gerek yok.

### Nötr rampa

Tek bir rampa var: `ink-50` … `ink-950`. Hepsi hafif soğuk tint taşır; saf gri
kullanılmaz. Günlük kullanımda ham `ink-*` yerine rol takma adları tercih edilir:

| Token | Değer | Anlam |
|---|---|---|
| `canvas` | `#08090c` | Uygulamanın en alt zemini |
| `surface` | `#0b0d11` | Sayfa/panel zemini |
| `surface-raised` | `#12151b` | Kart, araç çubuğu, tablo başlığı |
| `surface-overlay` | `#171b22` | Modal, açılır menü, tooltip |
| `surface-hover` | `#1c212a` | Etkileşimli satır/hücre hover |
| `line-subtle` | `#171a21` | Aynı grup içindeki ayraç |
| `line` | `#232830` | Panel ve kart kenarı |
| `line-strong` | `#333a45` | Odak dışı vurgulu kenar, input kenarı |
| `content-strong` | `#eef1f5` | Başlık, birincil sayı |
| `content` | `#d7dce3` | Gövde metni |
| `content-muted` | `#8f98a6` | İkincil metin, sütun başlığı |
| `content-faint` | `#767f8d` | Yardımcı metin, birim, zaman damgası |
| `content-disabled` | `#4a525f` | **Yalnızca pasif kontrol** — gövde metni değil |

`content-faint` değeri tarayıcıda ölçülerek seçildi: `#6b7482` canvas üzerinde
4.21:1 veriyordu, AA eşiği 4.5. Şimdiki değer 4.92:1.

`content-disabled` canvas üzerinde 2.5:1'dir ve okunmaz — bu kasıtlı, pasif bir
kontrol okunmamalı. Görünür bir metni bu token'la boyamayın.

**Renkli zeminde gri metin yok.** `accent-900` üzerindeki ikincil metin
`accent-200`'dür, `content-muted` değil.

---

## Tipografi

**IBM Plex Sans Variable** (arayüz) + **IBM Plex Mono** (sayı, sembol, kod).
İkisi de kendi sunucumuzdan; yalnızca latin + latin-ext alt kümesi. Sistem font
yığını bilinçli olarak terk edildi: platforma göre değişiyordu ve rakamları
tabular değildi.

`font-variant-numeric: tabular-nums slashed-zero` global olarak açık. Bir fiyat
sütununda rakamlar eşit genişlikte olmazsa satırlar titrer.

Ölçek (sabit px — Operate yüzeyinde akışkan tipografi işe yaramaz):

| Sınıf | Boyut | Kullanım |
|---|---|---|
| `text-2xs` | 11px | Mikro etiket, birim, tablo alt notu — **taban sınır** |
| `text-xs` | 12px | Yoğun tablo hücresi, yardımcı metin |
| `text-sm` | 13px | Arayüz varsayılanı: etiket, buton, girdi |
| `text-base` | 14px | Gövde metni, panel içi açıklama |
| `text-lg` → `text-6xl` | 16 → 46px | Başlıklar |

**11px tabandır.** Eski arayüzde 107 yerde 10px, 36 yerde 9px, 3 yerde 8px
metin vardı; hiçbiri okunabilir değildi.

`font-mono`: yalnızca sayı, sembol kodu, zaman damgası, JSON. "Teknik görünsün"
diye kostüm olarak kullanılmaz.

### Ağırlık

Uygulama içinde tek bir vurgu ağırlığı var: **`font-medium` (500)**. `bold` ve
`semibold` kullanılmaz. Önceden arayüzde 203 yerde bold/semibold vardı; her şey
kalın olunca hiçbir şey öne çıkmıyordu. Hiyerarşi artık boyut ve renkten geliyor
— `text-content-strong` bir başlığı, `text-content-faint` bir dipnotu zaten
ayırıyor. Landing ve giriş ekranındaki büyük başlıklar (26px+) istisnadır ve
`font-semibold` kullanır: orası Persuade yüzeyi, başlığın ağırlık taşıması gerek.

### Büyük harf

Dekoratif `text-transform: uppercase` kullanılmaz. 11px'lik bir etiketi büyük
harfe çevirmek onu "teknik" yapmıyor, sadece okunmasını zorlaştırıyor.

Ayrıca bu Türkçe bir arayüz: uppercase eşlemesi dile bağlıdır ve `lang`
yanlışsa "ısınma" → "ISINMA" yerine bozuk çıkar. `DashboardLayout` kökünde
`lang="tr"` var (`index.html` İngilizce landing için `lang="en"` kalıyor).

---

## Yüzey ve derinlik

Kart, kartın içine girmez. İç içe kart görürseniz biri fazladır — ayraç
(`border-line-subtle`) ya da boşluk kullanın.

Gölgeler ofset **ve** yumuşak bulanıklık taşır (`shadow-sm` … `shadow-xl`).
Sıfır ofsetli renkli hale dekorasyondur, derinlik değil. Koyu temada gölge
"daha koyu siyah"tır, asla renkli değil.

Köşe yarıçapı: kontroller `rounded-md` (6px), paneller/modaller `rounded-lg`
(8px) veya `rounded-xl` (12px), rozetler `rounded-sm`.

---

## Durumlar

Etkileşimli her bileşen yedi durumu da taşır: **default, hover, focus, active,
disabled, loading, error.** Yarısıyla ship edilmez.

- Odak: global `:focus-visible` halkası (`accent-400`, 2px, 1px offset). Bileşen
  başına yeniden icat edilmez.
- Yükleme: içerik alanında spinner değil, iskelet (skeleton).
- Boş durum: "Kayıt yok" değil — ne olduğunu ve buradan nereye gidileceğini
  söyler.
- Pasif: `content-disabled` + `opacity` değil, doygunluk düşürülerek.

---

## Hareket

150–250 ms, `ease-out` (`transition-timing-function: theme(out)`). Hareket
durum değişimini anlatır: açılma, seçim, sonuç geldi. Dekoratif hareket ve
sayfa yükleme koreografisi yok — kullanıcı akış içinde, animasyon izlemek
istemiyor. `prefers-reduced-motion` global olarak karşılanıyor.

---

## Yapılmayacaklar

Bunlar bu üründe alınmış kararlardır, genel kural değil:

- **Gradient metin.** Vurgu ağırlıktan ya da boyuttan gelir.
- **Başlık üstü etiket (eyebrow/kicker).** Başlık kendi ağırlığını taşır.
- **Dekoratif cam/blur.** Blur yalnızca gerçekten arkasında içerik olan
  katmanlarda (modal arkaplanı).
- **1px'ten kalın renkli sol kenarlık** kartlarda ve uyarılarda.
- **Aynı boyutta ikon+başlık+metin kartları** sayfa iskeleti olarak.
- **Emoji ikon yerine.** İkonlar `lucide-react`, tek çizgi kalınlığı (1.5),
  boyut 14/16px.
- **Modal ilk çözüm olarak.** Kesinti ve korunmuş odak gerekmiyorsa satır içi
  çözün.
