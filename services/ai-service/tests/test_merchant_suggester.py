import pytest
from unittest.mock import Mock, AsyncMock
from app.services.merchant_suggester import MerchantSuggester, _is_pii_keyword


@pytest.fixture
def mock_provider():
    provider = Mock()
    provider.extract_structured = AsyncMock(return_value={
        "suggestions": [
            {
                "merchant_pattern": "GOPAY/TOPUP",
                "suggested_category": "E-Wallet",
                "suggested_keyword": "GOPAY",
                "confidence": 0.95,
            },
            {
                "merchant_pattern": "AZKO BALI",
                "suggested_category": "Food & Dining",
                "suggested_keyword": "AZKO",
                "confidence": 0.8,
            },
        ]
    })
    return provider


@pytest.fixture
def mock_provider_with_pii():
    """Provider that returns a mix of clean and PII-contaminated keywords."""
    provider = Mock()
    provider.extract_structured = AsyncMock(return_value={
        "suggestions": [
            {
                "merchant_pattern": "TRANSFER KE BUDI SANTOSO 081234567890",
                "suggested_category": "Transfer",
                "suggested_keyword": "081234567890",  # phone number — must be filtered
                "confidence": 0.9,
            },
            {
                "merchant_pattern": "SHOPEE PAY 08123456789",
                "suggested_category": "Shopping",
                "suggested_keyword": "SHOPEE",  # clean keyword — must pass through
                "confidence": 0.92,
            },
            {
                "merchant_pattern": "TRF KE REK 1234567890",
                "suggested_category": "Transfer",
                "suggested_keyword": "1234567890",  # account number — must be filtered
                "confidence": 0.85,
            },
        ]
    })
    return provider


@pytest.mark.asyncio
async def test_suggest_batch_returns_suggestions(mock_provider):
    suggester = MerchantSuggester(provider=mock_provider)
    results = await suggester.suggest_batch(
        ["GOPAY/TOPUP", "AZKO BALI"],
        ["E-Wallet", "Food & Dining", "Shopping"],
    )
    assert len(results) > 0
    assert all("merchant_pattern" in r for r in results)
    assert all(0.0 <= r["confidence"] <= 1.0 for r in results)


@pytest.mark.asyncio
async def test_suggest_batch_empty_input_returns_empty():
    suggester = MerchantSuggester(provider=Mock())
    results = await suggester.suggest_batch([], [])
    assert results == []


@pytest.mark.asyncio
async def test_suggest_batch_filters_pii_keywords(mock_provider_with_pii):
    """PII-contaminated keywords returned by LLM must be dropped before returning results."""
    suggester = MerchantSuggester(provider=mock_provider_with_pii)
    results = await suggester.suggest_batch(
        ["TRANSFER KE BUDI SANTOSO 081234567890", "SHOPEE PAY 08123456789", "TRF KE REK 1234567890"],
        ["Transfer", "Shopping"],
    )
    returned_keywords = [r["suggested_keyword"] for r in results]
    # Phone number and account number must be filtered
    assert "081234567890" not in returned_keywords
    assert "1234567890" not in returned_keywords
    # Clean merchant keyword must survive
    assert "SHOPEE" in returned_keywords


@pytest.mark.parametrize("keyword,expected_pii", [
    ("081234567890", True),        # Indonesian phone number
    ("+6281234567890", True),      # International phone
    ("1234567890", True),          # 10-digit account number
    ("A/N BUDI", True),            # Atas nama pattern
    ("REK123456", True),           # Rekening prefix
    ("GOPAY", False),              # Clean merchant
    ("INDOMARET", False),          # Clean merchant
    ("SHOPEE PAY", False),         # Clean multi-word merchant
    ("BIAYA ADMIN", False),        # Clean banking term
])
def test_is_pii_keyword(keyword, expected_pii):
    assert _is_pii_keyword(keyword) == expected_pii
