
import io
import base64
import numpy as np
from pathlib import Path
from fastapi import FastAPI, File, UploadFile, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from PIL import Image
import tensorflow as tf
import uvicorn

# ─── App Setup ───────────────────────────────────────────────────────────────
app = FastAPI(title="Neural Vision Classifier")

# Mount static files — served at /static (maps to ./static/ folder)
app.mount("/static", StaticFiles(directory="static"), name="static")

templates = Jinja2Templates(directory="templates")

# ─── Class Labels ────────────────────────────────────────────────────────────
CLASS_LABELS = {
    "cifar10": [
        "Airplane", "Automobile", "Bird", "Cat", "Deer",
        "Dog", "Frog", "Horse", "Ship", "Truck"
    ],
    "mnist": ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
}

# ─── Model Config ────────────────────────────────────────────────────────────
MODEL_CONFIG = {
    "cifar10": {
        "input_size":  (32, 32),
        "channels":    3,
        "normalize":   True,
        "dataset":     "CIFAR-10",
        "num_classes": 10,
    },
    "mnist": {
        "input_size":  (28, 28),
        "channels":    1,
        "normalize":   True,
        "dataset":     "MNIST",
        "num_classes": 10,
    },
}

# ─── Model Cache ─────────────────────────────────────────────────────────────
loaded_models: dict = {}

def try_load_model(name: str, path: str):
    """Load a Keras model if the file exists; silently skip otherwise."""
    p = Path(path)
    if p.exists():
        print(f"[INFO] Loading {path} ...")
        loaded_models[name] = tf.keras.models.load_model(path)
        print(f"[INFO] '{name}' ready.")
    else:
        print(f"[WARN] '{path}' not found — {name} unavailable.")

@app.on_event("startup")
async def startup_event():
    try_load_model("cifar10", "cnn_cifar10.keras")
    try_load_model("mnist",   "cnn_mnist.keras")

# ─── Image Preprocessing ─────────────────────────────────────────────────────
def preprocess_image(image_bytes: bytes, model_type: str) -> np.ndarray:
    """Open → resize → channel convert → normalize → batch-expand."""
    cfg  = MODEL_CONFIG[model_type]
    w, h = cfg["input_size"]

    img = Image.open(io.BytesIO(image_bytes))
    img = img.convert("L" if cfg["channels"] == 1 else "RGB")
    img = img.resize((w, h))

    arr = np.array(img, dtype=np.float32)
    if cfg["normalize"]:
        arr /= 255.0
    if cfg["channels"] == 1:
        arr = np.expand_dims(arr, axis=-1)   # (H,W) → (H,W,1)
    return np.expand_dims(arr, axis=0)        # → (1,H,W,C)

# ─── Demo Prediction (no real model) ─────────────────────────────────────────
def demo_prediction(model_type: str):
    """Return fake uniform predictions when model file is missing."""
    n = MODEL_CONFIG[model_type]["num_classes"]
    preds = np.ones(n, dtype=np.float32) / n
    return preds, True   # (probabilities, is_demo)

# ─── Build Result Dict ────────────────────────────────────────────────────────
def build_result(preds: np.ndarray, model_type: str,
                 demo: bool, image_bytes: bytes) -> dict:
    """Package inference output into the JSON shape app.js expects."""
    labels   = CLASS_LABELS[model_type]
    top5_idx = np.argsort(preds)[::-1][:5]

    # Re-encode the uploaded image as base64 for the in-browser preview
    preview_b64 = base64.b64encode(image_bytes).decode("utf-8")

    return {
        "label":      labels[top5_idx[0]],
        "confidence": float(preds[top5_idx[0]] * 100),
        "top5": [
            {"label": labels[i], "confidence": float(preds[i] * 100)}
            for i in top5_idx
        ],
        "preview":   preview_b64,
        "demo_mode": demo,
    }

# ─── Routes ──────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """
    Render index.html. The Jinja2 context maps to the {{ }} placeholders
    already in the uploaded template (dataset, num_classes, input_size,
    demo_mode).
    """
    # Pick whichever model loaded for the header info strip
    if "cifar10" in loaded_models:
        active = "cifar10"
    elif "mnist" in loaded_models:
        active = "mnist"
    else:
        active = "cifar10"   # show cifar10 labels even in demo mode

    cfg  = MODEL_CONFIG[active]
    demo = len(loaded_models) == 0

    return templates.TemplateResponse("index.html", {
        "request":     request,
        "dataset":     cfg["dataset"],
        "num_classes": cfg["num_classes"],
        "input_size":  cfg["input_size"][0],
        "demo_mode":   demo,
    })


@app.post("/predict")
async def predict(image: UploadFile = File(...)):
    """
    Accept multipart image (field name: 'image' — matches app.js FormData).
    Returns JSON that renderResults() in app.js consumes directly.
    """

    # ── Validate content type
    if not image.content_type.startswith("image/"):
        return JSONResponse(
            status_code=400,
            content={"error": f"Invalid file type '{image.content_type}'. Upload PNG, JPG, WEBP or BMP."}
        )

    image_bytes = await image.read()

    # ── Validate file size (10 MB)
    if len(image_bytes) > 10 * 1024 * 1024:
        return JSONResponse(
            status_code=400,
            content={"error": "File exceeds 10 MB limit."}
        )

    # ── Choose model — prefer cifar10, fall back to mnist, then demo
    if "cifar10" in loaded_models:
        model_type, model, demo = "cifar10", loaded_models["cifar10"], False
    elif "mnist" in loaded_models:
        model_type, model, demo = "mnist",   loaded_models["mnist"],   False
    else:
        # No model on disk — return demo uniform predictions
        preds, demo = demo_prediction("cifar10")
        return JSONResponse(content=build_result(preds, "cifar10", demo, image_bytes))

    try:
        arr   = preprocess_image(image_bytes, model_type)
        preds = model.predict(arr, verbose=0)[0]
        return JSONResponse(content=build_result(preds, model_type, False, image_bytes))

    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={"error": f"Prediction failed: {str(exc)}"}
        )


# ─── Entry point ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
