// PF-157 STEP 11 (FIN-05): shown wherever the AI portfolio review is displayed or started. Keep the wording
// verbatim; /compliance cleared this exact string on 2026-11-23. It is cleared for a single-owner, private
// product: a second user or public access needs a legal opinion first (see PF-157 Notes).
const InvestmentReviewDisclaimer = () => (
  <p className="text-[11px] leading-snug text-muted-foreground">
    Analisis ini dibuat AI dari portofolio yang Anda masukkan dan bisa keliru. Probabilitas dan perkiraan
    hasil hanyalah ilustrasi, bukan prediksi atau jaminan. Bukan saran investasi dan bukan ajakan membeli
    atau menjual aset. Data portofolio Anda diproses oleh penyedia AI pihak ketiga.
  </p>
);

export default InvestmentReviewDisclaimer;
