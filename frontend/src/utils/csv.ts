/**
 * CSV dışa aktarma yardımcıları.
 *
 * Sunucuya gitmeden çalışır: veriler zaten ekranda, yeniden hesaplatmak
 * gereksiz bir tur olurdu.
 *
 * Excel uyumu için iki ayrıntı önemli:
 *  - Dosya BOM ile başlar; aksi halde Excel UTF-8'i tanımayıp Türkçe
 *    karakterleri bozuyor.
 *  - Ayırıcı noktalı virgül: Türkçe yerelde Excel virgülü ondalık ayırıcı
 *    sayıyor ve virgülle ayrılmış dosyayı tek sütuna yığıyor.
 */

const DELIMITER = ';';
const BOM = '﻿';

/** Bir hücreyi CSV'ye güvenli biçimde yazar. */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';

  const text = String(value);
  // Ayırıcı, tırnak veya satır sonu içeren hücreler tırnaklanır; içerideki
  // tırnaklar ikilenir (RFC 4180).
  if (text.includes(DELIMITER) || text.includes('"') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Sayıyı Türkçe ondalık ayırıcıyla yazar (Excel doğrudan sayı olarak okur). */
export function csvNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return value.toFixed(digits).replace('.', ',');
}

/**
 * Satırları CSV'ye çevirip tarayıcıya indirtir.
 *
 * `headers` sütun başlıklarıdır; `rows` aynı sıradaki hücre dizileridir.
 */
export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(DELIMITER));
  const blob = new Blob([BOM + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Nesne URL'i serbest bırakılmazsa sekme kapanana kadar bellekte kalır.
  URL.revokeObjectURL(url);
}

/** Dosya adı için güvenli bir zaman damgası (2024-03-05_14-30). */
export function csvTimestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}`
  );
}
