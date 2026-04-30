import logging

import fitz  # PyMuPDF

logger = logging.getLogger(__name__)


class PdfExtractionError(Exception):
    """Raised when the PDF cannot be opened or read."""
    pass


class PdfExtractor:
    """Extracts raw text from PDF bytes using PyMuPDF."""

    def extract(self, pdf_bytes: bytes) -> tuple[str, int]:
        """
        Extract text from all pages.

        Returns:
            (full_text, page_count) — text has page-break markers between pages.

        Raises:
            PdfExtractionError — for password-protected, corrupted, or unreadable PDFs.
        """
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        except Exception as e:
            raise PdfExtractionError(f"Failed to open PDF: {e}") from e

        if doc.needs_pass:
            doc.close()
            raise PdfExtractionError("PDF is password-protected")

        pages: list[str] = []
        for i, page in enumerate(doc, start=1):
            try:
                text = page.get_text()
                pages.append(f"--- PAGE {i} ---\n{text.strip()}")
            except Exception as e:
                logger.warning("Failed to extract text from page %d: %s", i, e)
                pages.append(f"--- PAGE {i} --- [extraction failed]")

        doc.close()

        page_count = len(pages)
        full_text = "\n\n".join(pages)

        logger.info("PDF extracted | pages=%d | chars=%d", page_count, len(full_text))
        return full_text, page_count
