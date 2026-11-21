"""Private stdin/stdout worker started lazily by the game. No network requests."""
import json
import os
from pathlib import Path
import sys
import wave

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
answers = sys.stdout
sys.stdout = sys.stderr  # keep library diagnostics out of the JSON protocol

import mlx.core as mx
import numpy as np
from mlx_audio.tts.utils import load_model
from mlx_audio.utils import load_audio

ROOT = Path(__file__).resolve().parents[1]
MODEL = Path.home() / "Library/Application Support/Afterglow/voices/model"


def main():
    model = load_model(str(MODEL))
    scripts = {
        "zh": json.loads((ROOT / "src/lib/standingDialogue.json").read_text()),
        "en": json.loads((ROOT / "src/lib/standingEnglish.json").read_text())["dialogue"],
    }
    references = {}
    for raw in sys.stdin:
        try:
            job = json.loads(raw)
            language = job.get("language", "zh")
            key = (language, job["artist"])
            if key not in references:
                line = next(row for row in scripts[language] if row["artistId"] == job["artist"])
                path = ROOT / "public" / line["audio"].lstrip("/")
                references[key] = (load_audio(str(path), sample_rate=model.sample_rate), line["text"])
            reference, transcript = references[key]
            # The reference is the game's synthetic character performance.
            # Limit tokens by text length so an unfinished utterance cannot loop.
            mx.random.seed(17)
            results = model.generate(text=job["text"], lang_code="english" if language == "en" else "chinese", ref_audio=reference,
                                     ref_text=transcript, temperature=.65, top_k=35,
                                     max_tokens=min(1100, max(70, 12*len(job["text"])+25)),
                                     speed=job["rate"], verbose=False)
            chunks = [np.array(result.audio, dtype=np.float32).reshape(-1) for result in results]
            samples = np.concatenate(chunks) if chunks else np.empty(0)
            if len(samples) < model.sample_rate*.12 or not np.isfinite(samples).all() or abs(samples).max() < .002:
                raise ValueError("empty audio")
            with wave.open(job["out"], "wb") as f:
                f.setparams((1, 2, model.sample_rate, 0, "NONE", "not compressed"))
                f.writeframes((np.clip(samples, -1, 1)*32767).astype("<i2").tobytes())
            status = {"ok": True}
        except Exception as exc:
            print("Offline synthesis:", type(exc).__name__, str(exc)[:240], file=sys.stderr, flush=True)
            status = {"ok": False}
        print(json.dumps(status), file=answers, flush=True)


if __name__ == "__main__":
    main()
