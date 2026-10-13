"""Vercel entrypoint. Every /api/* request is rewritten here (see vercel.json)."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from _lib.main import app  # noqa: E402,F401
