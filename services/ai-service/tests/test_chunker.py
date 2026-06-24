import pytest
from app.services.chunker import fixed_size_chunks, sentence_window_chunks


def test_fixed_size_respects_chunk_size():
    chunks = fixed_size_chunks("a" * 1200, chunk_size=500, overlap=100)
    assert all(len(c.text) <= 500 for c in chunks)


def test_fixed_size_overlap_carries_content():
    text = "0123456789" * 30  # 300 chars
    chunks = fixed_size_chunks(text, chunk_size=100, overlap=20)
    # tail of chunk N == head of chunk N+1
    assert chunks[0].text[-20:] == chunks[1].text[:20]


def test_fixed_size_empty_text_returns_empty():
    assert fixed_size_chunks("   ") == []


def test_fixed_size_rejects_overlap_gte_size():
    with pytest.raises(ValueError):
        fixed_size_chunks("abc", chunk_size=100, overlap=100)


def test_sentence_window_core_is_single_sentence():
    text = "First sentence. Second sentence. Third sentence."
    chunks = sentence_window_chunks(text, window_size=1)
    assert chunks[1].text == "Second sentence."


def test_sentence_window_includes_neighbours():
    text = "First sentence. Second sentence. Third sentence."
    chunks = sentence_window_chunks(text, window_size=1)
    assert "First sentence." in chunks[1].window
    assert "Third sentence." in chunks[1].window


def test_sentence_window_edges_clamp():
    text = "One. Two. Three."
    chunks = sentence_window_chunks(text, window_size=2)
    assert chunks[0].window == "One. Two. Three."  # no negative index wraparound
