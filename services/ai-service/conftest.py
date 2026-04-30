import os

# Set before any app module is imported so pydantic-settings picks these up
os.environ.setdefault("AI_PROVIDER", "anthropic")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key-for-pytest")
