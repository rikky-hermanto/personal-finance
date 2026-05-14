const BANKING_STOP_WORDS = new Set([
  'KARTU', 'DEBIT', 'CREDIT', 'KREDIT', 'TARIKAN', 'TRANSFER',
  'PEMBAYARAN', 'BAYAR', 'PEMBELIAN', 'BELI', 'KE', 'DARI',
  'ATM', 'BANK', 'BCA', 'BNI', 'BRI', 'MANDIRI', 'CIMB',
  'TRF', 'TF', 'VIA', 'MELALUI', 'NO', 'REF', 'IDR', 'IND',
  // Kata yang muncul sebelum nama orang — stop di sini, jangan ambil kata berikutnya
  'AN', 'REK', 'REKENING',
]);

// Pola PII yang harus distrip SEBELUM tokenisasi
// Urutan penting: strip pola panjang dulu, baru yang lebih pendek
const PII_PATTERNS: RegExp[] = [
  /A\/N\s+\S+(\s+\S+)*/gi,       // "A/N NAMA ORANG" — atas nama
  /KE\s+REK\s*\d+/gi,            // "KE REK 1234567890"
  /DARI\s+REK\s*\d+/gi,          // "DARI REK 1234567890"
  /\+62\d{7,13}/g,               // nomor HP format internasional
  /\b08\d{7,12}\b/g,             // nomor HP format lokal
  /\b\d{7,}\b/g,                 // angka 7+ digit (rekening, referensi)
  /[A-Z0-9]{10,}/g,              // kode alfanumerik panjang (reference ID)
];

export function extractKeyword(description: string): string {
  let sanitized = description.toUpperCase();

  // Strip semua pola PII dulu
  for (const pattern of PII_PATTERNS) {
    sanitized = sanitized.replace(pattern, ' ');
  }

  const words = sanitized
    .split(/[\s\-\/\.\,\(\)]+/)
    .map(w => w.trim())
    .filter(w => w.length >= 3 && !BANKING_STOP_WORDS.has(w));

  return words.slice(0, 2).join(' ').trim();
}
