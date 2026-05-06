"""
Image generation utility using Google Gemini image models (via google-genai SDK).
Generates images from text prompts — used for dashboard agent profile photos
and other visual assets.

Model: gemini-2.5-flash-image (native image output via generateContent)
Docs: https://ai.google.dev/gemini-api/docs/image-generation
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types

from utils.logger import get_logger

load_dotenv()
logger = get_logger(__name__)

_OUTPUT_DIR = Path(__file__).resolve().parent.parent / "data" / "images"
_MODEL = "gemini-2.5-flash-image"


def generate_image(
    prompt: str,
    *,
    output_filename: str | None = None,
) -> Path:
    """
    Generate an image from a text prompt using Gemini image generation.

    Args:
        prompt:           Text description of the image to generate.
        output_filename:  Filename to save under data/images/ (e.g. "analyst.png").
                          Defaults to a sanitised version of the prompt.

    Returns:
        Path to the saved PNG file.

    Raises:
        ValueError: If GOOGLE_API_KEY is not set or the API returns no image.
        RuntimeError: If the API call fails.
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY is not set in environment / .env file")

    client = genai.Client(api_key=api_key)

    logger.info("Requesting image | model=%s | prompt: %r", _MODEL, prompt[:80])

    try:
        response = client.models.generate_content(
            model=_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE", "TEXT"],
            ),
        )
    except Exception as exc:
        logger.error("Image generation API call failed: %s", exc)
        raise RuntimeError(f"Image generation API call failed: {exc}") from exc

    # Extract image bytes from the response parts
    image_bytes: bytes | None = None
    for part in response.candidates[0].content.parts:
        if part.inline_data is not None:
            image_bytes = part.inline_data.data
            break

    if image_bytes is None:
        raise ValueError(
            "API returned no image data — prompt may have been blocked by safety filters"
        )

    _OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if output_filename is None:
        safe_name = "".join(c if c.isalnum() else "_" for c in prompt[:40]).strip("_")
        output_filename = f"{safe_name}.png"
    elif not output_filename.endswith(".png"):
        output_filename += ".png"

    output_path = _OUTPUT_DIR / output_filename
    output_path.write_bytes(image_bytes)

    logger.info("Image saved to %s (%d bytes)", output_path, len(image_bytes))
    return output_path
