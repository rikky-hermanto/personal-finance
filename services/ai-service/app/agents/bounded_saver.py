"""Advisor checkpointer that forgets its oldest sessions instead of growing forever (PF-157)."""
from collections import OrderedDict

from langgraph.checkpoint.memory import MemorySaver

MAX_THREADS = 200


class BoundedMemorySaver(MemorySaver):
    """MemorySaver that keeps at most `max_threads` conversations, dropping the least recently written."""

    def __init__(self, *args, max_threads: int = MAX_THREADS, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self._max_threads = max_threads
        self._recent: OrderedDict[str, None] = OrderedDict()

    def _remember(self, config) -> None:
        thread_id = config["configurable"]["thread_id"]
        self._recent.pop(thread_id, None)
        self._recent[thread_id] = None
        while len(self._recent) > self._max_threads:
            oldest, _ = self._recent.popitem(last=False)
            self.delete_thread(oldest)

    def put(self, config, checkpoint, metadata, new_versions):
        result = super().put(config, checkpoint, metadata, new_versions)
        self._remember(config)
        return result

    async def aput(self, config, checkpoint, metadata, new_versions):
        result = await super().aput(config, checkpoint, metadata, new_versions)
        self._remember(config)
        return result
