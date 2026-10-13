"""Entry point: `uv run fastapi dev app/main.py --port 8200` (reads bio/.env)."""

from app.server import create_app

app = create_app()
