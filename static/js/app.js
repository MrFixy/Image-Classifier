"use strict";

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const dropZone     = document.getElementById("dropZone");
const fileInput    = document.getElementById("fileInput");
const browseLink   = document.getElementById("browseLink");
const dropIdle     = document.getElementById("dropIdle");
const dropPreview  = document.getElementById("dropPreview");
const previewThumb = document.getElementById("previewThumb");
const previewName  = document.getElementById("previewName");
const previewSize  = document.getElementById("previewSize");
const clearBtn     = document.getElementById("clearBtn");

const uploadForm   = document.getElementById("uploadForm");
const submitBtn    = document.getElementById("submitBtn");
const btnLabel     = document.getElementById("btnLabel");
const btnSpinner   = document.getElementById("btnSpinner");

const errorAlert   = document.getElementById("errorAlert");
const errorText    = document.getElementById("errorText");

const resultsEmpty = document.getElementById("resultsEmpty");
const resultsCard  = document.getElementById("resultsCard");
const resultImage  = document.getElementById("resultImage");
const resultLabel  = document.getElementById("resultLabel");
const resultConf   = document.getElementById("resultConf");
const confBar      = document.getElementById("confBar");
const top5List     = document.getElementById("top5List");
const demoAlert    = document.getElementById("demoAlert");
const againBtn     = document.getElementById("againBtn");

const MAX_SIZE_MB   = 10;
const ALLOWED_TYPES = ["image/png","image/jpeg","image/webp","image/bmp"];

let selectedFile = null;

// ─── Utilities ────────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function showError(msg) {
  errorText.textContent = msg;
  errorAlert.hidden = false;
}

function clearError() {
  errorAlert.hidden = true;
  errorText.textContent = "";
}

// ─── File handling ────────────────────────────────────────────────────────────
function handleFile(file) {
  clearError();

  if (!file) return;

  if (!ALLOWED_TYPES.includes(file.type)) {
    showError(`Unsupported file type "${file.type}". Please upload a PNG, JPG, WEBP, or BMP image.`);
    return;
  }

  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    showError(`File is too large (${formatBytes(file.size)}). Maximum allowed size is ${MAX_SIZE_MB} MB.`);
    return;
  }

  selectedFile = file;

  // Show thumbnail in drop zone
  const reader = new FileReader();
  reader.onload = (e) => {
    previewThumb.src   = e.target.result;
    previewName.textContent = file.name;
    previewSize.textContent = formatBytes(file.size);

    dropIdle.hidden    = true;
    dropPreview.hidden = false;
    dropZone.classList.add("has-file");

    btnLabel.textContent = "Run Classification";
    submitBtn.disabled   = false;
  };
  reader.readAsDataURL(file);
}

function clearFile() {
  selectedFile         = null;
  fileInput.value      = "";
  previewThumb.src     = "";
  dropIdle.hidden      = false;
  dropPreview.hidden   = true;
  dropZone.classList.remove("has-file");
  submitBtn.disabled   = true;
  btnLabel.textContent = "Select an image first";
  clearError();
}

// ─── Drag-and-drop ────────────────────────────────────────────────────────────
dropZone.addEventListener("click", (e) => {
  // Don't trigger if clicking the clear button
  if (e.target === clearBtn || clearBtn.contains(e.target)) return;
  fileInput.click();
});

dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
});

browseLink.addEventListener("click", (e) => {
  e.stopPropagation();
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  if (fileInput.files.length) handleFile(fileInput.files[0]);
});

clearBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  clearFile();
});

["dragenter","dragover"].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault(); e.stopPropagation();
    dropZone.classList.add("dragover");
  });
});

["dragleave","dragend"].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault(); e.stopPropagation();
    dropZone.classList.remove("dragover");
  });
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault(); e.stopPropagation();
  dropZone.classList.remove("dragover");
  const file = e.dataTransfer?.files[0];
  if (file) handleFile(file);
});

// ─── Loading state ────────────────────────────────────────────────────────────
function setLoading(active) {
  if (active) {
    btnLabel.hidden   = true;
    btnSpinner.hidden = false;
    submitBtn.disabled = true;
  } else {
    btnLabel.hidden   = false;
    btnSpinner.hidden = true;
    submitBtn.disabled = !selectedFile;
  }
}

// ─── Render results ───────────────────────────────────────────────────────────
function renderResults(data) {
  // Image preview
  resultImage.src = `data:image/png;base64,${data.preview}`;

  // Label
  resultLabel.textContent = data.label;

  // Confidence bar (animate after short delay)
  resultConf.textContent = data.confidence.toFixed(1) + "%";
  confBar.style.width = "0%";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      confBar.style.width = data.confidence + "%";
    });
  });

  // Top-5 list
  top5List.innerHTML = "";
  const maxConf = data.top5[0]?.confidence ?? 100;
  data.top5.forEach((item, idx) => {
    const isTop = idx === 0;
    const barWidth = maxConf > 0 ? (item.confidence / maxConf) * 100 : 0;

    const row = document.createElement("div");
    row.className = "top5-item" + (isTop ? " is-top" : "");
    row.innerHTML = `
      <span class="top5-name">${escapeHtml(item.label)}</span>
      <div class="top5-bar-wrap">
        <div class="top5-bar" style="width:${barWidth.toFixed(1)}%"></div>
      </div>
      <span class="top5-pct">${item.confidence.toFixed(1)}%</span>
    `;
    top5List.appendChild(row);
  });

  // Demo mode notice
  demoAlert.hidden = !data.demo_mode;

  // Swap panels
  resultsEmpty.hidden = true;
  resultsCard.hidden  = false;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])
  );
}

// ─── Form submission ──────────────────────────────────────────────────────────
uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  if (!selectedFile) {
    showError("Please select an image before submitting.");
    return;
  }

  setLoading(true);

  try {
    const formData = new FormData();
    formData.append("image", selectedFile);

    const response = await fetch("/predict", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      showError(data.error || `Server error (${response.status}). Please try again.`);
      return;
    }

    renderResults(data);

  } catch (err) {
    showError(`Network error: ${err.message}. Make sure the Flask server is running.`);
  } finally {
    setLoading(false);
  }
});

// ─── Classify again ────────────────────────────────────────────────────────────
againBtn.addEventListener("click", () => {
  clearFile();
  resultsCard.hidden  = true;
  resultsEmpty.hidden = false;
  // Scroll back to upload on mobile
  if (window.innerWidth < 860) {
    document.querySelector(".panel--upload").scrollIntoView({ behavior: "smooth" });
  }
});
