import requests
import base64
import os
from pathlib import Path

# Read API key from backend/.env
env_file = Path(__file__).resolve().parent / ".env"

if env_file.exists():
    for line in env_file.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(
                key.strip(),
                value.strip().strip('"').strip("'")
            )

api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    raise ValueError("GEMINI_API_KEY missing from backend/.env")

test_image = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)

models_to_test = [
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-2.5-flash-image",
]

for model in models_to_test:
    url = (
        f"https://generativelanguage.googleapis.com/"
        f"v1beta/models/{model}:generateContent"
    )

    payload = {
        "contents": [{
            "parts": [
                {"text": "Say hello in one word."},
                {
                    "inlineData": {
                        "mimeType": "image/png",
                        "data": base64.b64encode(test_image).decode()
                    }
                }
            ]
        }],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 100
        }
    }

    try:
        response = requests.post(
            url,
            headers={"x-goog-api-key": api_key},
            json=payload,
            timeout=30
        )

        print(f"\n=== {model} ===")
        print(f"Status: {response.status_code}")

        if response.status_code == 200:
            result = response.json()
            output = result.get("candidates", [{}])[0].get(
                "content", {}
            ).get("parts", [{}])[0].get("text", "")

            print(f"Response: {output[:100]}")
        else:
            print(f"Error: {response.text[:200]}")

    except Exception as error:
        print(f"Exception: {error}")