import pytest
import fitz

from app.services.pdf_extractor import PdfExtractor, PdfExtractionError


def _make_pdf_bytes(text: str = "Sample transaction 14/03/2024 IDR 100,000") -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 100), text)
    return doc.tobytes()


def _make_empty_pdf_bytes() -> bytes:
    doc = fitz.open()
    doc.new_page()
    return doc.tobytes()


class TestPdfExtractor:
    def setup_method(self):
        self.extractor = PdfExtractor()

    def test_extract_single_page_returns_text_and_page_count(self):
        pdf_bytes = _make_pdf_bytes("TRANSFER GOFOOD 85000")
        text, pages = self.extractor.extract(pdf_bytes)
        assert pages == 1
        assert "TRANSFER GOFOOD" in text

    def test_extract_multi_page_includes_page_markers(self):
        doc = fitz.open()
        for i in range(3):
            page = doc.new_page()
            page.insert_text((50, 100), f"Page {i + 1} content")
        pdf_bytes = doc.tobytes()

        text, pages = self.extractor.extract(pdf_bytes)
        assert pages == 3
        assert "--- PAGE 1 ---" in text
        assert "--- PAGE 2 ---" in text
        assert "--- PAGE 3 ---" in text

    def test_extract_empty_pdf_returns_empty_text(self):
        pdf_bytes = _make_empty_pdf_bytes()
        text, pages = self.extractor.extract(pdf_bytes)
        assert pages == 1
        assert isinstance(text, str)

    def test_extract_corrupted_bytes_raises_extraction_error(self):
        with pytest.raises(PdfExtractionError, match="Failed to open PDF"):
            self.extractor.extract(b"not a pdf at all")
