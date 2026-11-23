from langgraph.checkpoint.base import empty_checkpoint

from app.agents.bounded_saver import BoundedMemorySaver


def _config(thread_id: str) -> dict:
    return {"configurable": {"thread_id": thread_id, "checkpoint_ns": ""}}


def _write(saver: BoundedMemorySaver, thread_id: str) -> None:
    saver.put(_config(thread_id), empty_checkpoint(), {"source": "input", "step": 0, "parents": {}}, {})


def test_oldest_thread_is_dropped_past_the_cap():
    saver = BoundedMemorySaver(max_threads=2)
    for thread in ("a", "b", "c"):
        _write(saver, thread)
    assert saver.get_tuple(_config("a")) is None
    assert saver.get_tuple(_config("b")) is not None
    assert saver.get_tuple(_config("c")) is not None


def test_writing_a_thread_again_keeps_it_recent():
    saver = BoundedMemorySaver(max_threads=2)
    _write(saver, "a")
    _write(saver, "b")
    _write(saver, "a")          # a is now newer than b
    _write(saver, "c")          # evicts b, not a
    assert saver.get_tuple(_config("b")) is None
    assert saver.get_tuple(_config("a")) is not None
