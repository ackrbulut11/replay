import type { Config } from 'tailwindcss';

/**
 * REPLAY tasarım token'ları.
 *
 * Buradaki isimler ham renk değil, *rol* taşır: `bg-surface-raised`,
 * `text-content-muted`, `border-line`. Bileşenlerde `slate-700` / `zinc-800`
 * gibi ham Tailwind renkleri kullanmayın — uygulama daha önce iki ayrı gri
 * rampasını (slate + zinc) ve iki ayrı vurgu rengini (indigo + emerald) aynı
 * ekranda karıştırıyordu, bu katman onu tek bir dile indirger.
 *
 * En önemli kural: **yeşil ve kırmızı yalnızca kâr/zarar anlamına gelir.**
 * "Aktif sekme", "birincil buton", "seçili satır" gibi durumlar `accent`
 * (çelik mavisi) kullanır. Bir trading arayüzünde yeşil bir kaydet butonu,
 * yanındaki yeşil PnL rakamının anlamını çalar.
 */

/** Ana içerik ölçeği — Operate yüzeyi: sabit px, dar adımlar, yoğun. */
const type = {
  '2xs': ['11px', { lineHeight: '15px', letterSpacing: '0.005em' }],
  xs: ['12px', { lineHeight: '16px' }],
  sm: ['13px', { lineHeight: '18px' }],
  base: ['14px', { lineHeight: '20px' }],
  lg: ['16px', { lineHeight: '22px', letterSpacing: '-0.01em' }],
  xl: ['18px', { lineHeight: '24px', letterSpacing: '-0.015em' }],
  '2xl': ['21px', { lineHeight: '27px', letterSpacing: '-0.02em' }],
  '3xl': ['25px', { lineHeight: '30px', letterSpacing: '-0.022em' }],
  '4xl': ['30px', { lineHeight: '34px', letterSpacing: '-0.025em' }],
  '5xl': ['38px', { lineHeight: '40px', letterSpacing: '-0.03em' }],
  '6xl': ['46px', { lineHeight: '48px', letterSpacing: '-0.032em' }],
} as const;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    fontSize: type as unknown as Record<string, [string, Record<string, string>]>,
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans Variable"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },

      colors: {
        /* ─── Nötr rampa ───────────────────────────────────────────────────
           Saf gri değil: hepsinde hafif soğuk (mavi) bir tint var. Saf
           #000/#888 ekranda ölü görünür, tint'li nötr derinlik taşır. */
        ink: {
          950: '#08090c',
          900: '#0b0d11',
          850: '#0f1116',
          800: '#12151b',
          750: '#171b22',
          700: '#1c212a',
          650: '#232830',
          600: '#333a45',
          500: '#4a525f',
          /* 400 tarayıcıda iki kez ölçüldü. İlk değer (#6b7482) canvas üzerinde
             4.21:1 veriyordu. İkinci değer (#767f8d) canvas'ta geçiyordu ama
             `surface-hover` gibi açık yüzeylerde 4.23'e düşüyordu — yardımcı
             metin her zaman en koyu zeminde durmuyor. Şimdiki değer en açık
             yüzeyde bile 4.8:1. */
          400: '#848d9b',
          300: '#8f98a6',
          200: '#b4bcc8',
          100: '#d7dce3',
          50: '#eef1f5',
        },

        /* ─── Vurgu: çelik mavisi ──────────────────────────────────────────
           Birincil eylem, seçili durum, odak halkası. Bilinçli olarak
           indigo/mordan uzak (hue ~205°) ve doygunluğu düşük: enstrüman
           paneli gibi okunsun, oyuncak gibi değil. */
        accent: {
          50: '#eaf4fa',
          200: '#a8d4ea',
          300: '#7cbde0',
          400: '#4fa3cf',
          500: '#2f88b8',
          600: '#256e97',
          700: '#1c5576',
          800: '#143f58',
          900: '#0f2f42',
          950: '#0a1f2c',
        },

        /* ─── Kâr / zarar ──────────────────────────────────────────────────
           Yalnızca sayısal sonuç taşıyan yerlerde: PnL, getiri, kazanma
           oranı, alış/satış yönü. Buton ya da sekme rengi olarak asla. */
        profit: {
          300: '#6ee0ab',
          400: '#3ecf8e',
          500: '#22ad72',
          600: '#178a5b',
          900: '#0b2b1f',
          950: '#071a13',
        },
        loss: {
          300: '#f4909a',
          400: '#ef5f6b',
          500: '#dc3d4b',
          600: '#b52d39',
          900: '#2f1216',
          950: '#1e0b0e',
        },

        /* ─── Uyarı ────────────────────────────────────────────────────────
           Dikkat çeken ama engellemeyen durumlar: ısınma periyodu, eksik
           veri, geri alınamaz eylem onayı. */
        warn: {
          300: '#f5c76a',
          400: '#e0a63c',
          500: '#c2872a',
          900: '#2e2110',
          950: '#1d1509',
        },

        /* ─── Rol takma adları ─────────────────────────────────────────────
           Bileşenlerin gerçekte yazdığı isimler bunlar. */
        canvas: '#08090c',
        surface: {
          DEFAULT: '#0b0d11',
          sunken: '#090a0e',
          raised: '#12151b',
          overlay: '#171b22',
          hover: '#1c212a',
        },
        line: {
          DEFAULT: '#232830',
          subtle: '#171a21',
          strong: '#333a45',
        },
        content: {
          DEFAULT: '#d7dce3',
          strong: '#eef1f5',
          muted: '#8f98a6',
          faint: '#848d9b',
          /* Yalnızca PASİF kontroller için. Gövde metni olarak kullanmayın —
             canvas üzerinde 2.5:1 veriyor, okunmuyor. */
          disabled: '#4a525f',
        },
      },

      borderRadius: {
        xs: '3px',
        sm: '4px',
        DEFAULT: '6px',
        md: '6px',
        lg: '8px',
        xl: '12px',
        '2xl': '16px',
      },

      /* Gölgeler ofset + yumuşak bulanıklık taşır; sıfır ofsetli renkli hale
         dekorasyondur, derinlik değil. Koyu temada gölge = daha koyu siyah. */
      boxShadow: {
        xs: '0 1px 2px rgba(0, 0, 0, 0.4)',
        sm: '0 1px 3px rgba(0, 0, 0, 0.45), 0 1px 2px rgba(0, 0, 0, 0.3)',
        DEFAULT: '0 2px 6px rgba(0, 0, 0, 0.45), 0 1px 2px rgba(0, 0, 0, 0.3)',
        md: '0 4px 12px rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.3)',
        lg: '0 10px 28px rgba(0, 0, 0, 0.55), 0 4px 8px rgba(0, 0, 0, 0.35)',
        xl: '0 20px 48px rgba(0, 0, 0, 0.6), 0 8px 16px rgba(0, 0, 0, 0.4)',
        none: 'none',
      },

      /* Operate yüzeyi: 150–250 ms. Kullanıcı akış içinde, koreografi
         beklemiyor. Üstel ease-out doğal duruş hissi verir. */
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        DEFAULT: '160ms',
      },

      /* Bu üç isim kodda 15 yerde çağrılıyordu ama hiçbir yerde tanımlı
         değildi — modallar ve paneller animasyonsuz "pat" diye açılıyordu.
         Hepsi zaten görünür bir varsayılandan başlar, üstel ease-out ile
         durur ve durum değişimini anlatır; dekorasyon değil. */
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        scaleUp: {
          from: { opacity: '0', transform: 'scale(0.97) translateY(4px)' },
          to: { opacity: '1', transform: 'none' },
        },
        slideInRight: {
          from: { opacity: '0', transform: 'translateX(10px)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 140ms cubic-bezier(0.16, 1, 0.3, 1)',
        scaleUp: 'scaleUp 190ms cubic-bezier(0.16, 1, 0.3, 1)',
        slideInRight: 'slideInRight 190ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
