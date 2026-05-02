import json
import logging

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)


class GeminiProvider:
    def __init__(self, api_key: str, model: str = "gemini-2.5-flash") -> None:
        self._client = genai.Client(api_key=api_key)
        self._model = model

    async def extract_structured(
        self,
        system_prompt: str,
        user_text: str,
        schema: dict,
        image: tuple[bytes, str] | None = None,
    ) -> dict:
        config = types.GenerateContentConfig(
            temperature=0.0,
            response_mime_type="application/json",
            response_schema=schema,
            system_instruction=system_prompt,
        )

        if image is not None:
            img_bytes, media_type = image
            contents = [
                types.Part(inline_data=types.Blob(mime_type=media_type, data=img_bytes)),
                types.Part(text=user_text),
            ]
        else:
            contents = user_text

        response = await self._client.aio.models.generate_content(
            model=self._model,
            contents=contents,
            config=config,
        )

        logger.info(
            "Gemini extract complete | model=%s | input_tokens=%d | output_tokens=%d",
            self._model,
            response.usage_metadata.prompt_token_count,
            response.usage_metadata.candidates_token_count,
        )

        return json.loads(response.text)
