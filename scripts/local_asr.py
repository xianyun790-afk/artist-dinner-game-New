"""On-device transcription for one bounded mono PCM utterance, passed on stdin."""
from pathlib import Path
import sys

HOME_DIR = Path.home() / "Library/Application Support/Afterglow/recognition"
MODEL = HOME_DIR / "model"
PYTHON = HOME_DIR / "runtime/bin/python"
RATE = 16000
MAX_BYTES = 30 * RATE * 2


def installed():
    return PYTHON.is_file() and all((MODEL / name).is_file() for name in (
        "model.int8.onnx", "tokens.txt", "silero_vad.onnx"))


def transcribe(pcm):
    import numpy as np
    import sherpa_onnx

    samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768
    config = sherpa_onnx.VadModelConfig()
    config.silero_vad.model = str(MODEL / "silero_vad.onnx")
    config.silero_vad.min_speech_duration = .15
    config.sample_rate = RATE
    vad = sherpa_onnx.VoiceActivityDetector(config, buffer_size_in_seconds=32)
    window = config.silero_vad.window_size
    padded = np.pad(samples, (0, (-len(samples)) % window))
    for start in range(0, len(padded), window):
        vad.accept_waveform(padded[start:start + window])
    vad.flush()
    if vad.empty():
        return ""
    recognizer = sherpa_onnx.OfflineRecognizer.from_sense_voice(
        model=str(MODEL / "model.int8.onnx"), tokens=str(MODEL / "tokens.txt"),
        language="auto", use_itn=True, provider="cpu", num_threads=3)
    stream = recognizer.create_stream()
    stream.accept_waveform(RATE, samples)
    recognizer.decode_stream(stream)
    return stream.result.text.strip()


if __name__ == "__main__":
    audio = sys.stdin.buffer.read(MAX_BYTES + 1)
    if not 2 <= len(audio) <= MAX_BYTES or len(audio) % 2:
        sys.exit(2)
    print(transcribe(audio))
