import json
import logging

from google import genai
from google.genai import types

from app.observability import langfuse, estimate_cost_usd

logger = logging.getLogger(__name__)


class GeminiProvider:
    def __init__(self, api_key: str, model: str = "gemini-2.5-flash") -> None:
        self._api_key = api_key
        self._model = model
        self._client = None

    def _get_client(self) -> genai.Client:
        if self._client is None:
            if not self._api_key:
                raise ValueError("GEMINI_API_KEY is not set.")
            self._client = genai.Client(api_key=self._api_key)
        return self._client

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

        client = self._get_client()

        generation = langfuse.start_observation(
            as_type="generation",
            name="gemini-extract-structured",
            model=self._model,
            input=user_text[:500],
            metadata={"has_image": image is not None},
        )

        try:
            response = await client.aio.models.generate_content(
                model=self._model,
                contents=contents,
                config=config,
            )

            input_tokens = response.usage_metadata.prompt_token_count
            output_tokens = response.usage_metadata.candidates_token_count
            cost = estimate_cost_usd(self._model, input_tokens, output_tokens)

            logger.info(
                "Gemini extract complete | model=%s | input_tokens=%d | output_tokens=%d | cost_usd=%.6f",
                self._model, input_tokens, output_tokens, cost,
            )

            generation.update(
                output=response.text[:500],
                usage_details={"input": input_tokens, "output": output_tokens},
                cost_details={"usd": cost},
                metadata={"has_image": image is not None, "cost_usd": cost},
            )
            generation.end()

            return json.loads(response.text)

        except Exception as exc:
            generation.update(level="ERROR", status_message=str(exc))
            generation.end()
            raise

    async def generate_json(self, system_prompt: str, user_prompt: str, schema: dict) -> dict:
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            response_schema=schema,
            temperature=0.0,
        )

        client = self._get_client()

        generation = langfuse.start_observation(
            as_type="generation",
            name="gemini-generate-json",
            model=self._model,
            input=user_prompt[:500],
        )

        try:
            response = await client.aio.models.generate_content(
                model=self._model,
                contents=user_prompt,
                config=config,
            )

            input_tokens = response.usage_metadata.prompt_token_count
            output_tokens = response.usage_metadata.candidates_token_count
            cost = estimate_cost_usd(self._model, input_tokens, output_tokens)

            generation.update(
                output=response.text[:500],
                usage_details={"input": input_tokens, "output": output_tokens},
                cost_details={"usd": cost},
                metadata={"cost_usd": cost},
            )
            generation.end()

            return json.loads(response.text)

        except Exception as exc:
            generation.update(level="ERROR", status_message=str(exc))
            generation.end()
            raise
