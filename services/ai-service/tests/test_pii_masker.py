"""PiiMasker: per-class masking, plus the cases that must NOT be masked."""
import pytest

from app.services.pii_masker import mask_pii


def test_mask_nik_sixteen_digits():
    assert mask_pii("GAJI a.n. BUDI NIK 3174012345678901") == "GAJI a.n. BUDI [NIK]"


def test_mask_nik_without_label():
    assert mask_pii("KTP 3174012345678901 ok") == "KTP [NIK] ok"


@pytest.mark.parametrize("raw", [
    "TRF KE 081234567890 BUDI",
    "TRF KE 0812-3456-7890 BUDI",
    "TRF KE 628123456789 BUDI",
])
def test_mask_phone_local_and_country_prefix(raw):
    assert mask_pii(raw) == "TRF KE [PHONE] BUDI"


def test_mask_phone_plus62_leaves_no_stray_plus():
    assert mask_pii("TRF KE +6281234567890 BUDI") == "TRF KE [PHONE] BUDI"


@pytest.mark.parametrize("raw", [
    "TRSF rek 5271234567 a.n. SITI",
    "TRSF REKENING: 5271234567890 a.n. SITI",
    "TRSF norek 5271234567 a.n. SITI",
    "TRSF a/c 5271234567 a.n. SITI",
])
def test_mask_account_requires_cue_word(raw):
    masked = mask_pii(raw)
    assert "[ACCOUNT]" in masked
    assert "5271234567" not in masked


def test_mask_email():
    assert mask_pii("KIRIM KE budi.santoso+pay@mail.co.id SEKARANG") == "KIRIM KE [EMAIL] SEKARANG"


def test_merchant_name_passes_through():
    assert mask_pii("ALFAMART TEBET 50000") == "ALFAMART TEBET 50000"


def test_bare_reference_number_not_masked_as_account():
    # 10 digits with no cue word = reference number, must survive
    assert mask_pii("QR 0123456789 PAYMENT") == "QR 0123456789 PAYMENT"


def test_short_numbers_and_amounts_untouched():
    text = "GOJEK RIDE 32000 ref 12345"
    assert mask_pii(text) == text


def test_mask_is_idempotent():
    once = mask_pii("GAJI NIK 3174012345678901 hp 081234567890 rek 5271234567 a@b.co")
    assert mask_pii(once) == once
    assert "[NIK]" in once and "[PHONE]" in once and "[ACCOUNT]" in once and "[EMAIL]" in once
