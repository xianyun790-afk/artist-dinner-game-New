"""Private voice recordings and offline speech for the local macOS game."""
import local_asr
import atexit
import json
import os
import re
import select
import subprocess
import sys
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler
from pathlib import Path

VOICE_HOME = Path.home() / "Library/Application Support/Afterglow/voices"
RECORDING = re.compile(r"^/api/local-voice/recordings/([a-f0-9]{64})$")
SLOTS = threading.BoundedSemaphore(2)
ASR_SLOT = threading.BoundedSemaphore(1)
MAC_VOICES = {"vincent": "Eddy", "dali": "Reed", "monet": "Grandpa", "georgia": "Grandma", "lin": "Flo"}
MAX_AUDIO = 9_000_000


class OfflineWorker:
    def __init__(self):
        self.lock = threading.Lock()
        self.proc = None

    def stop(self):
        if self.proc:
            self.proc.kill()
            self.proc.wait()
            self.proc = None

    def generate(self, artist, text, rate, directory, language):
        executable = VOICE_HOME / "runtime/bin/python"
        supported = ("dali", "vincent", "georgia", "monet") if language == "en" else ("dali", "vincent", "georgia")
        if (artist not in supported or not executable.exists()
                or not (VOICE_HOME / "model/speech_tokenizer/model.safetensors").exists()
                or not (VOICE_HOME / "model/model.safetensors").exists()):
            return None
        output = directory / "role.wav"
        with self.lock:
            try:
                if not self.proc or self.proc.poll() is not None:
                    self.proc = subprocess.Popen([str(executable), "-u", str(Path(__file__).with_name("offline_voice_worker.py"))],
                                                 stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
                job = {"artist": artist, "text": text, "rate": rate, "out": str(output), "language": language}
                self.proc.stdin.write(json.dumps(job) + "\n")
                self.proc.stdin.flush()
                if not select.select([self.proc.stdout], [], [], 55)[0]:
                    self.stop()
                    return None
                if json.loads(self.proc.stdout.readline()).get("ok"):
                    return output.read_bytes()
            except (OSError, ValueError, subprocess.SubprocessError):
                self.stop()
        return None


WORKER = OfflineWorker()
atexit.register(WORKER.stop)

def mac_speech(artist, text, rate, directory, language):
    # Strip Apple's inline speech directives from dialogue and read text on stdin.
    text = text.replace("[[", " ").replace("]]", " ")
    aiff = directory / "speech.aiff"
    wav = directory / "speech.wav"
    voice = MAC_VOICES.get(artist, "Tingting")
    if language == "en":
        voice = {"dali": "Daniel", "vincent": "Eddy (英语（美国）)", "monet": "Fred", "georgia": "Samantha"}.get(artist, "Samantha")
    elif voice != "Tingting":
        voice += " (中文（中国大陆）)"
    subprocess.run(["/usr/bin/say", "-v", voice, "-r", str(round(172 * rate)),
                    "-o", str(aiff), "-f", "-"], input=text.encode(), check=True,
                   capture_output=True, timeout=25)
    subprocess.run(["/usr/bin/afconvert", "-f", "WAVE", "-d", "LEI16", str(aiff), str(wav)],
                   check=True, capture_output=True, timeout=10)
    return wav.read_bytes()


class GameHandler(SimpleHTTPRequestHandler):
    def reply(self, status, body=b"", mime="application/octet-stream", engine=None):
        self.send_response(status)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Type", mime)
        self.send_header("Cache-Control", "no-store")
        if engine:
            self.send_header("X-Voice-Engine", engine)
        self.end_headers()
        if body:
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def local_client(self):
        host = self.headers.get("Host", "")
        if host in ("127.0.0.1:4893", "localhost:4893", "[::1]:4893") and self.headers.get("Origin") in (None, "http://" + host):
            return True
        self.reply(403)
        return False

    def read_body(self, limit):
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            size = 0
        if not 0 < size <= limit:
            self.reply(413)
            return None
        data = self.rfile.read(size)
        if len(data) != size:
            self.reply(400)
            return None
        return data

    def do_GET(self):
        if self.path == "/api/local-asr/status":
            if self.local_client():
                self.reply(200, json.dumps({"ready": local_asr.installed()}).encode(), "application/json")
            return
        match = RECORDING.fullmatch(self.path)
        if not match:
            return super().do_GET()
        if not self.local_client():
            return
        try:
            audio = (VOICE_HOME / "recordings" / match[1]).read_bytes()
        except FileNotFoundError:
            self.reply(204)
            return
        except OSError:
            self.reply(503)
            return
        self.reply(200, audio)

    def do_PUT(self):
        match = RECORDING.fullmatch(self.path)
        if not match:
            return self.reply(404)
        if not self.local_client():
            return
        if self.headers.get_content_type() != "application/octet-stream":
            return self.reply(415)
        audio = self.read_body(MAX_AUDIO)
        if audio is None:
            return
        records = VOICE_HOME / "recordings"
        tmp = None
        try:
            records.mkdir(parents=True, exist_ok=True, mode=0o700)
            with tempfile.NamedTemporaryFile(dir=records, delete=False) as f:
                tmp = f.name
                f.write(audio)
            os.replace(tmp, records / match[1])
        except OSError:
            return self.reply(503)
        finally:
            if tmp:
                Path(tmp).unlink(missing_ok=True)
        self.reply(204)

    def recognize(self):
        if not self.local_client():
            return
        if self.headers.get_content_type() != "application/octet-stream":
            return self.reply(415)
        pcm = self.read_body(local_asr.MAX_BYTES)
        if pcm is None:
            return
        if len(pcm) % 2:
            return self.reply(400)
        if not local_asr.installed():
            return self.reply(503)
        if not ASR_SLOT.acquire(blocking=False):
            return self.reply(429)
        try:
            result = subprocess.run([str(local_asr.PYTHON), str(Path(local_asr.__file__))],
                                    input=pcm, capture_output=True, check=True, timeout=20)
            body = json.dumps({"text": result.stdout.decode().strip()[:400]}, ensure_ascii=False).encode()
            self.reply(200, body, "application/json")
        except (OSError, UnicodeError, subprocess.SubprocessError):
            self.reply(503)
        finally:
            ASR_SLOT.release()

    def do_POST(self):
        if self.path == "/api/local-asr/transcribe":
            return self.recognize()
        if self.path != "/api/local-voice/speak":
            return self.reply(404)
        if not self.local_client():
            return
        if self.headers.get_content_type() != "application/json":
            return self.reply(415)
        data = self.read_body(10000)
        if data is None:
            return
        try:
            body = json.loads(data)
            artist, text, rate = body["artist"], body["text"], body["rate"]
            language = body.get("language", "zh")
            if language not in ("zh", "en"):
                raise ValueError()
            if (not isinstance(artist, str) or len(artist) > 200 or not isinstance(text, str)
                    or not 0 < len(text.strip()) <= 1000 or not isinstance(rate, (int, float))
                    or not .65 <= rate <= 1.25):
                raise ValueError()
        except (KeyError, TypeError, ValueError):
            return self.reply(400)
        if sys.platform != "darwin" or not SLOTS.acquire(blocking=False):
            return self.reply(503)
        try:
            with tempfile.TemporaryDirectory() as directory:
                wav = WORKER.generate(artist, text, rate, Path(directory), language)
                engine = "qwen" if wav else "macos"
                if not wav:
                    wav = mac_speech(artist, text, rate, Path(directory), language)
            self.reply(200, wav, "audio/wav", engine)
        except (OSError, subprocess.SubprocessError):
            self.reply(503)
        finally:
            SLOTS.release()
