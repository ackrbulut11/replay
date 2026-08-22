// ESLint yapılandırması (flat config, ESLint 9).
//
// `npm run lint` script'i vardı ama eslint kurulu DEĞİLDİ ve bu dosya da yoktu:
// komut her çağrıldığında anında patlıyordu. CI de bu yüzden onu bilerek
// atlıyordu — yani frontend'de hiçbir statik denetim koşmuyordu.
//
// Kural seti bilinçli olarak dar tutuldu: amaç mevcut kodu baştan yazmak değil,
// GERÇEK hataları (kullanılmayan değişken, kaçırılmış hook bağımlılığı, `any`)
// yakalamak. Kademeli sıkılaştırma için aşağıdaki `warn`lar zamanla `error`a
// çekilebilir.

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'e2e/.playwright'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // ─── HATA: kırılırsa CI durur ────────────────────────────────────────
      //
      // RULES.md #10: `any` yasak. Mevcut 121 kullanım temizlendiği için
      // doğrudan `error`; yeni bir `any` sızarsa lint kırılır.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'prefer-const': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Hook çağrı sırası ihlali her zaman gerçek bir hatadır.
      'react-hooks/rules-of-hooks': 'error',

      // ─── UYARI: görünür ama CI'ı durdurmaz ───────────────────────────────
      //
      // Aşağıdakiler React Compiler ile gelen yeni/deneysel kurallar ve
      // CandleChart.tsx (3500 satır, testi yok) üzerinde toplu bir yeniden
      // yazma gerektiriyorlar. Uyarı olarak görünür kalıyorlar; her biri ayrı
      // ayrı, ölçülerek ele alınmalı — hepsini birden "düzeltmek" testsiz bir
      // grafik motorunda regresyon üretmenin kestirme yolu olurdu.
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // Playwright testleri Node ortamında koşar.
    files: ['e2e/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.node },
  }
);
