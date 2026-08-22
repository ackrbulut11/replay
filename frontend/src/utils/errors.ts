/**
 * Yakalanan hatalardan kullanıcıya gösterilebilir mesaj çıkarma.
 *
 * Yakalanan hata her yerde `any` olarak tipleniyordu (32 yer). `any` yalnızca
 * RULES.md #10'a aykırı değil, aynı zamanda `err.message`'ı kontrolsüz okumaya
 * davet ediyor: fırlatılan şey bir `Error` olmak zorunda değil (bir string, bir
 * yanıt nesnesi ya da `undefined` de olabilir) ve o durumda arayüzde
 * "undefined" yazıyordu.
 *
 * Doğru tip `unknown`'dur; daraltmayı burada bir kez yapıyoruz.
 */

/** `Error`, `{message}` taşıyan nesne ya da düz string olabilir. */
export function errorMessage(error: unknown, fallback = 'Beklenmeyen bir hata oluştu.'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

/**
 * İstek iptal edildi mi? (`AbortController.abort()`)
 *
 * İptal bir HATA DEĞİLDİR: kullanıcı sembol/zaman dilimi değiştirdiğinde
 * eskiyen istekler bilerek iptal ediliyor ve bunu konsola hata olarak yazmak
 * gerçek arızaları gürültüde boğuyordu.
 */
export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}
