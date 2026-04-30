from typing import Protocol, runtime_checkable


@runtime_checkable
class LlmProvider(Protocol):
    async def extract_structured(
        self,
        system_prompt: str,
        user_text: str,
        schema: dict,
    ) -> dict:
        """
        Extract structured data from user_text.

        Returns:
            dict matching the schema — ready for Pydantic validation.

        Raises:
            Exception: Any provider-level failure (API error, truncation, etc.).
        """
        ...
