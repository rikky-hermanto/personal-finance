/** User-facing text for a 429 from the AI routes (PF-157). Indonesian, like the rest of the chat copy. */
export function rateLimitMessage(retryAfterSeconds: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
  if (seconds < 90) return `Terlalu banyak pertanyaan. Coba lagi dalam ${seconds} detik.`;
  if (seconds < 5400) return `Terlalu banyak pertanyaan. Coba lagi dalam ${Math.ceil(seconds / 60)} menit.`;
  return `Batas harian tercapai. Coba lagi dalam ${Math.ceil(seconds / 3600)} jam.`;
}
