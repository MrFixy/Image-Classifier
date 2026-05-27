#  Neural Vision — Image Classifier Web App

FastAPI + TensorFlow/Keras image classifier with a clean dark terminal UI.

---

##  Project Structure

```
image_classifier_app/
├── app.py                        ← FastAPI backend (all logic)
├── requirements.txt              ← Python dependencies
├── cifar10_model.keras           ← YOUR model (place here)
├── mnist_model.keras             ← YOUR model (place here)
├── templates/
│   └── index.html                ← Jinja2 HTML template
└── static/
    ├── css/
    │   └── style.css             ← All styling
    └── js/
        └── app.js                ← Drag-drop, fetch, render logic
```

---

##  Setup & Run

```bash
# 1. Drop your model files in the root folder
#    cifar10_model.keras
#    mnist_model.keras

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run
python app.py
```

Open → **http://localhost:8000**

---

##  How It Works

1. User drops/selects an image in the browser
2. JS sends a `POST /predict` with `FormData` (field: `image`)
3. FastAPI reads the file, preprocesses it, runs model inference
4. Returns JSON `{ label, confidence, top5, preview, demo_mode }`
5. JS renders the results panel without a page reload

---

##  Model Details

| Model   | Input    | Classes | Notes          |
|---------|----------|---------|----------------|
| CIFAR-10| 32×32 RGB| 10      | Objects        |
| MNIST   | 28×28 Gray| 10     | Digits 0–9     |

If neither model file is found, the app runs in **demo mode** and returns
uniform placeholder predictions so the UI is still fully explorable.
