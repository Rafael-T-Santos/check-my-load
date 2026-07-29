const VISIBLE_DIGITS = 5;

/**
 * Oculta o código de barras deixando visíveis apenas os últimos dígitos
 * (ex.: 7891234551452 -> ********51452).
 *
 * O conferente precisa ler o código no produto físico — se o app mostrasse o
 * código completo, bastaria copiar o que está na tela para "conferir".
 */
export function maskBarcode(code?: string | null): string {
  if (!code) return '';
  const hidden = Math.max(0, code.length - VISIBLE_DIGITS);
  return '*'.repeat(hidden) + code.slice(-VISIBLE_DIGITS);
}
