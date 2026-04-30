import logging

from anthropic import AsyncAnthropic

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
    ) -> dict:
        tool = {
            "name": "extract_transactions",
            "description": "Extract all bank transactions from the provided text.",
            "input_schema": schema,
        }

        message = await self._client.messages.create(
            model=self._model,
            max_tokens=4096,
            temperature=0.0,
            system=system_prompt,
            tools=[tool],
            tool_choice={"type": "tool", "name": "extract_transactions"},
            messages=[{"role": "user", "content": user_text}],
        )

        if message.stop_reason == "max_tokens":
            raise RuntimeError(
                "Response truncated — statement too long. Split into pages before re-extracting."
            )

        tool_block = next(
            (b for b in message.content if b.type == "tool_use"), None
        )
        if tool_block is None:
            raise ValueError("Anthropic did not return a tool_use block")

        logger.info(
            "Anthropic extract complete | model=%s | input_tokens=%d | output_tokens=%d",
            self._model,
            message.usage.input_tokens,
            message.usage.output_tokens,
        )

        return tool_block.input
