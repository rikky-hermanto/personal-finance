import base64
import logging

from anthropic import AsyncAnthropic

from app.observability import langfuse, estimate_cost_usd

logger = logging.getLogger(__name__)


class AnthropicProvider:
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6") -> None:
        self._client = AsyncAnthropic(api_key=api_key)
        self._model = model

    async def extract_structured(
        self,
        system_prompt: str,
        user_text: str,
        schema: dict,
        image: tuple[bytes, str] | None = None,
    ) -> dict:
        tool = {
            "name": "extract_transactions",
            "description": "Extract all bank transactions from the provided text.",
            "input_schema": schema,
        }

        if image is not None:
            img_bytes, media_type = image
            content = [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": base64.standard_b64encode(img_bytes).decode(),
                    },
                },
                {"type": "text", "text": user_text},
            ]
        else:
            content = user_text

        generation = langfuse.start_observation(
            as_type="generation",
            name="anthropic-extract-structured",
            model=self._model,
            input=user_text[:500] if isinstance(user_text, str) else "[image input]",
            metadata={"has_image": image is not None},
        )
        _generation_ended = False

        try:
            message = await self._client.messages.create(
                model=self._model,
                max_tokens=4096,
                temperature=0.0,
                system=system_prompt,
                tools=[tool],
                tool_choice={"type": "tool", "name": "extract_transactions"},
                messages=[{"role": "user", "content": content}],
            )

            if message.stop_reason == "max_tokens":
                generation.update(level="ERROR", status_message="max_tokens truncation")
                generation.end()
                _generation_ended = True
                raise RuntimeError(
                    "Response truncated — statement too long. Split into pages before re-extracting."
                )

            tool_block = next(
                (b for b in message.content if b.type == "tool_use"), None
            )
            if tool_block is None:
                generation.update(level="ERROR", status_message="no tool_use block returned")
                generation.end()
                _generation_ended = True
                raise ValueError("Anthropic did not return a tool_use block")

            input_tokens = message.usage.input_tokens
            output_tokens = message.usage.output_tokens
            cost = estimate_cost_usd(self._model, input_tokens, output_tokens)

            logger.info(
                "Anthropic extract complete | model=%s | input_tokens=%d | output_tokens=%d | cost_usd=%.6f",
                self._model, input_tokens, output_tokens, cost,
            )

            generation.update(
                output=str(tool_block.input)[:500],
                usage_details={"input": input_tokens, "output": output_tokens},
                cost_details={"usd": cost},
                metadata={"has_image": image is not None, "cost_usd": cost},
            )
            generation.end()
            _generation_ended = True

            return tool_block.input

        except Exception as exc:
            if not _generation_ended:
                generation.update(level="ERROR", status_message=str(exc))
                generation.end()
            raise

    async def generate_json(self, system_prompt: str, user_prompt: str, schema: dict) -> dict:
        tools = [{
            "name": "classify",
            "description": "Return classification result",
            "input_schema": schema,
        }]

        generation = langfuse.start_observation(
            as_type="generation",
            name="anthropic-generate-json",
            model=self._model,
            input=user_prompt[:500],
        )

        try:
            response = await self._client.messages.create(
                model=self._model,
                max_tokens=256,
                temperature=0.0,
                system=system_prompt,
                tools=tools,
                tool_choice={"type": "any"},
                messages=[{"role": "user", "content": user_prompt}],
            )
            tool_block = next(b for b in response.content if b.type == "tool_use")
            input_tokens = response.usage.input_tokens
            output_tokens = response.usage.output_tokens
            cost = estimate_cost_usd(self._model, input_tokens, output_tokens)
            generation.update(
                output=str(tool_block.input)[:500],
                usage_details={"input": input_tokens, "output": output_tokens},
                cost_details={"usd": cost},
                metadata={"cost_usd": cost},
            )
            generation.end()
            return tool_block.input

        except Exception as exc:
            generation.update(level="ERROR", status_message=str(exc))
            generation.end()
            raise
