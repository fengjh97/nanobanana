import base64
import os
import time
from datetime import datetime
from pathlib import Path
import sqlite3

from flask import (
    Flask,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

from google import genai
from google.genai import types
from google.genai import errors


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


app = Flask(__name__)
load_env_file(Path(__file__).resolve().parent / ".env")
app.secret_key = os.getenv("FLASK_SECRET", "change-me")
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
INPUT_DIR = DATA_DIR / "inputs"
OUTPUT_DIR = DATA_DIR / "outputs"
DB_PATH = DATA_DIR / "history.db"

for folder in (DATA_DIR, INPUT_DIR, OUTPUT_DIR):
    folder.mkdir(parents=True, exist_ok=True)


def init_db() -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS generations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                prompt TEXT NOT NULL,
                template TEXT,
                ratio TEXT,
                input_path TEXT NOT NULL,
                output_path TEXT NOT NULL
            )
            """
        )
        conn.commit()


init_db()


def get_client() -> genai.Client:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("Missing GOOGLE_API_KEY environment variable.")
    return genai.Client(api_key=api_key)


def build_config(aspect_ratio: str) -> types.GenerateContentConfig:
    image_config_cls = getattr(types, "ImageConfig", None) or getattr(
        types, "ImageGenerationConfig", None
    )
    image_config_kwargs = {
        "aspect_ratio": aspect_ratio,
        "image_size": "1K",
    }
    image_config = (
        image_config_cls(**image_config_kwargs)
        if image_config_cls
        else image_config_kwargs
    )

    return types.GenerateContentConfig(
        temperature=1,
        top_p=0.95,
        max_output_tokens=32768,
        response_modalities=["IMAGE"],
        safety_settings=[
            types.SafetySetting(
                category="HARM_CATEGORY_HATE_SPEECH",
                threshold="OFF",
            ),
            types.SafetySetting(
                category="HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold="OFF",
            ),
            types.SafetySetting(
                category="HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold="OFF",
            ),
            types.SafetySetting(
                category="HARM_CATEGORY_HARASSMENT",
                threshold="OFF",
            ),
        ],
        image_config=image_config,
    )


def extract_images_from_chunk(chunk) -> list[bytes]:
    images: list[bytes] = []
    candidates = getattr(chunk, "candidates", None) or []
    for candidate in candidates:
        content = getattr(candidate, "content", None)
        parts = getattr(content, "parts", None) or []
        for part in parts:
            inline = getattr(part, "inline_data", None)
            data = getattr(inline, "data", None)
            if data:
                images.append(data)
    return images


def make_text_part(text: str):
    if hasattr(types.Part, "from_text"):
        try:
            return types.Part.from_text(text)
        except TypeError:
            pass
    return types.Part(text=text)


def make_image_part(data: bytes, mime_type: str):
    if hasattr(types.Part, "from_bytes"):
        try:
            return types.Part.from_bytes(data=data, mime_type=mime_type)
        except TypeError:
            pass
    return types.Part(inline_data=types.Blob(data=data, mime_type=mime_type))


@app.route("/")
def index():
    if not session.get("authenticated"):
        return redirect(url_for("login"))
    return render_template("index.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        password = request.form.get("password") or ""
        expected = os.getenv("APP_PASSWORD")
        if expected and password == expected:
            session["authenticated"] = True
            return redirect(url_for("index"))
        error = "密码错误。"
    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/admin")
def admin():
    if not session.get("authenticated"):
        return redirect(url_for("login"))
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute(
            "SELECT id, created_at, prompt, template, ratio, input_path, output_path "
            "FROM generations ORDER BY id DESC"
        ).fetchall()
    return render_template("admin.html", rows=rows)


@app.route("/generate", methods=["POST"])
def generate():
    if not session.get("authenticated"):
        return jsonify({"error": "Unauthorized."}), 401
    prompt = (request.form.get("prompt") or "").strip()
    if not prompt:
        return jsonify({"error": "Prompt is required."}), 400

    file = request.files.get("image")
    if not file:
        return jsonify({"error": "Image is required."}), 400

    image_bytes = file.read()
    if not image_bytes:
        return jsonify({"error": "Image is empty."}), 400

    image_part = make_image_part(image_bytes, file.mimetype or "image/png")
    text_part = make_text_part(prompt)

    contents = [
        types.Content(
            role="user",
            parts=[image_part, text_part],
        )
    ]

    client = get_client()
    aspect_ratio = (request.form.get("ratio") or "9:16").strip()
    template_value = (request.form.get("template") or "").strip()
    config = build_config(aspect_ratio)
    model = "gemini-3-pro-image-preview"

    images: list[str] = []
    text_response = ""
    target_images = request.form.get("target")
    try:
        target_images = int(target_images) if target_images else 3
    except ValueError:
        target_images = 3

    attempts = 0
    last_error = None
    while attempts < 3 and len(images) < target_images:
        attempts += 1
        try:
            stream = client.models.generate_content_stream(
                model=model,
                contents=contents,
                config=config,
            )
            for chunk in stream:
                if getattr(chunk, "text", None):
                    text_response += chunk.text
                for data in extract_images_from_chunk(chunk):
                    images.append(base64.b64encode(data).decode("ascii"))
                if len(images) >= target_images:
                    break
        except errors.ServerError as exc:
            last_error = exc
            time.sleep(1.2 * attempts)
        if len(images) >= target_images:
            break

    if not images:
        error_message = "No images returned from model."
        if last_error:
            error_message = f"Model error after retries: {last_error}"
        return jsonify({"error": error_message, "text": text_response}), 502

    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S-%f")
    input_path = INPUT_DIR / f"{timestamp}.bin"
    input_path.write_bytes(image_bytes)

    output_path = OUTPUT_DIR / f"{timestamp}.png"
    output_path.write_bytes(base64.b64decode(images[0]))

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT INTO generations (created_at, prompt, template, ratio, input_path, output_path) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                datetime.utcnow().isoformat(timespec="seconds"),
                prompt,
                template_value,
                aspect_ratio,
                str(input_path.relative_to(BASE_DIR)),
                str(output_path.relative_to(BASE_DIR)),
            ),
        )
        conn.commit()

    return jsonify({"images": images[:1], "text": text_response})


if __name__ == "__main__":
    app.run(debug=True, port=8000)
