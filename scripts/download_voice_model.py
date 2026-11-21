"""Install the pinned, local Qwen voice model using Python's standard library."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.request

MODEL_ID = "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-4bit"
REV = "0d6bb6fe33f92d47a507e23b9148940e8366ab5b"
DEST = Path.home() / "Library/Application Support/Afterglow/voices/model"
BASE = "https://huggingface.co"


def install(entry):
    name = entry["path"]
    path = DEST / name
    path.parent.mkdir(parents=True, exist_ok=True)
    expected = entry.get("lfs", {}).get("oid")
    def valid(file):
        if not file.exists() or file.stat().st_size != entry["size"]:
            return False
        if expected:
            with file.open("rb") as f:
                return hashlib.file_digest(f, "sha256").hexdigest() == expected
        return True
    if valid(path):
        return
    temp = path.with_suffix(path.suffix + ".part")
    if not valid(temp):
        if temp.exists() and temp.stat().st_size >= entry["size"]:
            temp.unlink()
        url = f"{BASE}/{MODEL_ID}/resolve/{REV}/{name}?download=true"
        subprocess.run(["curl", "--fail", "--silent", "--show-error", "--location", "--retry", "3",
                        "--connect-timeout", "10", "--continue-at", "-", "--output", str(temp), url], check=True)
    if not valid(temp):
        raise RuntimeError("Incomplete voice model: " + name)
    temp.replace(path)
    print("Installed", name, flush=True)


if __name__ == "__main__":
    url = f"{BASE}/api/models/{MODEL_ID}/tree/{REV}?recursive=true"
    with urllib.request.urlopen(url, timeout=30) as r:
        entries = [e for e in json.load(r) if e["type"] == "file" and not e["path"].startswith(".")]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(install, entries))
