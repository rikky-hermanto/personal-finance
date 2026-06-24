"""Chunking strategies for longer-form documents (statement narratives, notes).

Pure functions — no I/O, no model calls. Production chunked retrieval is
wired in Chapter 6; this module is the tested primitive it will build on.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class Chunk:
    text: str               # the core chunk content
    index: int              # position in the source document
    window: str = ""        # expanded context (sentence-window only)
    meta: dict = field(default_factory=dict)


def fixed_size_chunks(text: str, chunk_size: int = 500, overlap: int = 100) -> list[Chunk]:
    """Split text into character chunks of `chunk_size` with `overlap` carried between chunks.

    Overlap prevents a fact that straddles a boundary from being lost to both chunks.
    """
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")
    if overlap >= chunk_size:
        raise ValueError("overlap must be smaller than chunk_size")

    text = text.strip()
    if not text:
        return []

    chunks: list[Chunk] = []
    step = chunk_size - overlap
    for i, start in enumerate(range(0, len(text), step)):
        piece = text[start:start + chunk_size]
        if not piece.strip():
            break
        chunks.append(Chunk(text=piece, index=i))
        if start + chunk_size >= len(text):
            break
    return chunks


_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")


def sentence_window_chunks(text: str, window_size: int = 1) -> list[Chunk]:
    """One chunk per sentence; `window` carries ±window_size neighbouring sentences.

    Index/search on the small `text` (precise matching); hand the LLM the larger
    `window` (enough context to be useful). Small-to-search, big-to-read.
    """
    sentences = [s.strip() for s in _SENTENCE_SPLIT.split(text) if s.strip()]
    chunks: list[Chunk] = []
    for i, sentence in enumerate(sentences):
        lo = max(0, i - window_size)
        hi = min(len(sentences), i + window_size + 1)
        chunks.append(Chunk(text=sentence, index=i, window=" ".join(sentences[lo:hi])))
    return chunks
