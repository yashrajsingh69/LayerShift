import requests
import os
from pathlib import Path

env_file = Path(__file__).resolve().parent / ".env"

if env_file.exists():
    for line in env_file.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    raise ValueError("GEMINI_API_KEY missing from backend/.env")

url = "https://generativelanguage.googleapis.com/v1beta/models"

response = requests.get(
    url,
    headers={"x-goog-api-key": api_key},
    timeout=30
)

response.raise_for_status()

models = response.json().get("models", [])

for model in models:
    if "generateContent" in model.get("supportedGenerationMethods", []):
        print(
            f"{model['name']}: {model.get('displayName', 'N/A')} "
            f"- Input: {model.get('inputTokenLimit', 'N/A')}"
        )