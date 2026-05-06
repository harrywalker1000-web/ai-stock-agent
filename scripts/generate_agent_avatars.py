"""
Generate AI robot avatar images for each agent using Google Imagen 3.
Saves PNG files to dashboard/public/agents/{id}.png
"""

import os
import sys
from pathlib import Path

# Load .env
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

api_key = os.environ.get("GOOGLE_API_KEY")
if not api_key:
    print("ERROR: GOOGLE_API_KEY not set")
    sys.exit(1)

from google import genai
from google.genai import types

client = genai.Client(api_key=api_key)

OUTPUT_DIR = Path(__file__).parent.parent / "dashboard" / "public" / "agents"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Each agent: id, accent color (hex), role description, visual motif
AGENTS = [
    {
        "id": "macro",
        "color": "cyan blue",
        "prompt": (
            "A cinematic portrait of a futuristic AI robot analyst, glowing cyan-blue circuit patterns "
            "across its sleek dark metallic face, viewing holographic world maps and economic data streams "
            "floating in the air around it, dark background with deep navy tones, neon cyan light accents, "
            "professional hedge fund aesthetic, photorealistic, high detail, square crop"
        ),
    },
    {
        "id": "sector",
        "color": "teal cyan",
        "prompt": (
            "A cinematic portrait of a futuristic AI robot analyst, teal glowing eyes, dark metallic "
            "face with circuit engravings, surrounded by holographic bar charts comparing multiple industry "
            "sectors, rotating 3D sector wheels, sleek dark background, neon teal light, "
            "professional financial technology aesthetic, photorealistic, high detail, square crop"
        ),
    },
    {
        "id": "institutional",
        "color": "purple violet",
        "prompt": (
            "A cinematic portrait of a futuristic AI robot spy-analyst, glowing violet-purple optical "
            "sensors, dark sleek metallic face, surrounded by holographic surveillance feeds and fund "
            "flow data, 13-F filing visualizations in purple neon, dark background, mysterious and "
            "intelligent expression, photorealistic, high detail, square crop"
        ),
    },
    {
        "id": "news",
        "color": "amber gold",
        "prompt": (
            "A 2D illustration of a futuristic AI robot news analyst, glowing amber-gold eyes and "
            "amber neon circuits across a sleek dark metallic face, surrounded by thousands of "
            "floating newspaper headlines and breaking news feeds in golden light, broadcast antenna "
            "signal waves visualized in amber, warm amber-gold neon accents on dark navy background, "
            "alert scanning expression, digital art style, high detail, square crop"
        ),
    },
    {
        "id": "candidate",
        "color": "emerald green",
        "prompt": (
            "A cinematic portrait of a futuristic AI robot stock screener, emerald green glowing eyes, "
            "dark metallic face, visualizing a large funnel of 950 stocks being filtered down to a handful "
            "of glowing candidates, green neon data streams, dark background, precise and selective "
            "expression, photorealistic, high detail, square crop"
        ),
    },
    {
        "id": "fundamental",
        "color": "red orange",
        "prompt": (
            "A cinematic portrait of a futuristic AI robot financial analyst, red-orange glowing circuit "
            "patterns, dark metallic face, surrounded by holographic balance sheets, income statements, "
            "and valuation multiples, comparing peer P/E ratios in fiery neon red, dark background, "
            "sharp analytical expression, photorealistic, high detail, square crop"
        ),
    },
    {
        "id": "quant",
        "color": "sapphire blue",
        "prompt": (
            "A 2D illustration of a futuristic AI robot quantitative analyst, glowing sapphire-blue "
            "mathematical equations and RSI charts reflected in its dark visor, sleek dark metallic face "
            "with royal blue circuit engravings, holographic Bollinger bands and z-score charts in vivid "
            "royal blue floating around it, deep navy background with sapphire blue neon grid, "
            "precise cold expression, digital art style, high detail, square crop"
        ),
    },
    {
        "id": "sentiment",
        "color": "vivid orange",
        "prompt": (
            "A 2D illustration of a futuristic AI robot contrarian sentiment analyst, glowing vivid "
            "orange eyes and bright orange circuit patterns across its dark metallic face, surrounded by "
            "opposing data streams — bull and bear signals clashing in vivid orange light, fear vs greed "
            "visualization, dark background with bright orange neon accents, contrarian thoughtful "
            "expression, digital art style, high detail, square crop"
        ),
    },
    {
        "id": "memory",
        "color": "cool silver grey",
        "prompt": (
            "A 2D illustration of a futuristic AI robot memory archivist, glowing cool silver-grey "
            "circuits and memory banks visible through translucent dark metallic skull, surrounded by "
            "holographic trade history timelines and pattern recognition matrices in silver-white neon, "
            "dark background with cool grey glow, wise contemplative expression, "
            "digital art style, high detail, square crop"
        ),
    },
    {
        "id": "committee",
        "color": "crimson red",
        "prompt": (
            "A 2D illustration of a futuristic AI robot investment committee chairman, commanding "
            "authoritative presence, glowing crimson-red eyes and red circuit patterns on dark metallic "
            "face, surrounded by holographic scorecards and voting matrices from 9 analyst agents, gavel "
            "visualized in crimson neon, dark background with deep crimson-red authority lighting, "
            "decisive powerful expression, digital art style, high detail, square crop"
        ),
    },
    {
        "id": "executor",
        "color": "bright lime green",
        "prompt": (
            "A 2D illustration of a futuristic AI robot trade executor, precision dark metallic face "
            "with glowing bright lime-green execution indicators and circuit lines, surrounded by "
            "trading order book holograms and lightning-fast execution data streams in bright green neon, "
            "dark background with electric lime-green glow, zero-hesitation focused expression, "
            "digital art style, high detail, square crop"
        ),
    },
]


def generate_avatar(agent: dict) -> bool:
    out_path = OUTPUT_DIR / f"{agent['id']}.png"
    if out_path.exists():
        print(f"  ✓ {agent['id']}.png already exists — skipping")
        return True

    print(f"  Generating {agent['id']}...")
    try:
        response = client.models.generate_images(
            model="imagen-4.0-fast-generate-001",
            prompt=agent["prompt"],
            config=types.GenerateImagesConfig(
                number_of_images=1,
                aspect_ratio="1:1",
                output_mime_type="image/png",
            ),
        )
        if not response.generated_images:
            print(f"  ✗ No image returned for {agent['id']}")
            return False

        image_bytes = response.generated_images[0].image.image_bytes
        out_path.write_bytes(image_bytes)
        print(f"  ✓ Saved {agent['id']}.png ({len(image_bytes) // 1024} KB)")
        return True

    except Exception as e:
        print(f"  ✗ Error generating {agent['id']}: {e}")
        return False


if __name__ == "__main__":
    print(f"Generating {len(AGENTS)} agent avatars → {OUTPUT_DIR}\n")
    success = 0
    for agent in AGENTS:
        if generate_avatar(agent):
            success += 1

    print(f"\nDone: {success}/{len(AGENTS)} generated successfully")
    if success < len(AGENTS):
        print("Re-run to retry failed images.")
