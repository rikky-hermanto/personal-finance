from typing import Protocol, runtime_checkable


@runtime_checkable
class LlmProvider(Protocol):
    async def extract_structured(
        self,
        system_prompt: str,
        user_text: str,
        schema: dict,
        image: tuple[bytes, str] | None = None,
    ) -> dict:
        """
        Extract structured data from user_text (and optionally an image).

        image: (bytes, media_type) — e.g. (png_bytes, "image/png"). When provided,
        the image is sent as a multimodal content block alongside user_text.

        Returns:
            dict matching the schema — ready for Pydantic validation.

        Raises:
            Exception: Any provider-level failure (API error, truncation, etc.).
        """
        ...

    async def generate_json(self, system_prompt: str, user_prompt: str, schema: dict) -> dict:
        """Return a JSON object matching the given schema."""
        ...
