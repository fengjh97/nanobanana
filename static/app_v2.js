const API_KEY_STORAGE = "nanobanana_google_api_key";
const GEMINI_MODEL = "gemini-3-pro-image-preview";
const GEMINI_ENDPOINT = (apiKey) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

function getApiKey() {
  try {
    return localStorage.getItem(API_KEY_STORAGE) || "";
  } catch (_) {
    return "";
  }
}

function setApiKey(key) {
  try {
    if (key) {
      localStorage.setItem(API_KEY_STORAGE, key);
    } else {
      localStorage.removeItem(API_KEY_STORAGE);
    }
  } catch (_) {
    /* ignore */
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

async function callGemini({ parts, aspectRatio, apiKey }) {
  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 1,
      topP: 0.95,
      maxOutputTokens: 32768,
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio,
        imageSize: "1K",
      },
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "OFF" },
    ],
  };

  const response = await fetch(GEMINI_ENDPOINT(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const errBody = await response.json();
      detail = errBody?.error?.message || JSON.stringify(errBody);
    } catch (_) {
      detail = await response.text();
    }
    const err = new Error(`Gemini ${response.status}: ${detail}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  const images = [];
  let text = "";
  const candidates = data.candidates || [];
  for (const candidate of candidates) {
    const cParts = candidate?.content?.parts || [];
    for (const part of cParts) {
      const inline = part.inlineData || part.inline_data;
      if (inline?.data) {
        images.push(inline.data);
      } else if (typeof part.text === "string") {
        text += part.text;
      }
    }
  }
  return { images, text };
}

const templates = [
  {
    name: "不使用模板",
    value: "",
  },
  {
    name: "轻柔美颜",
    value:
      "soft beauty retouching, smooth skin, gentle glow, balanced highlights, clean natural tone",
  },
  {
    name: "电影质感",
    value: "cinematic lighting, rich contrast, dramatic color grading, film grain",
  },
  {
    name: "产品精修",
    value: "clean studio light, minimal background, sharp details, premium product shot",
  },
  {
    name: "水彩梦境",
    value: "watercolor texture, soft bleed edges, dreamy palette, gentle lighting",
  },
  {
    name: "复古胶片",
    value: "vintage film look, muted tones, subtle vignette, analog texture",
  },
  {
    name: "等距插画",
    value: "isometric illustration, crisp outlines, playful geometry, flat shading",
  },
  {
    name: "极简海报",
    value: "minimalist poster, bold typography space, strong negative space",
  },
];

const quickTemplates = document.getElementById("quickTemplates");
const promptInput = document.getElementById("promptInput");
const imageInput = document.getElementById("imageInput");
const previewImage = document.getElementById("previewImage");
const generateBtn = document.getElementById("generateBtn");
const resultGrid = document.getElementById("resultGrid");
const statusText = document.getElementById("statusText");
const outputText = document.getElementById("outputText");
const countRange = document.getElementById("countRange");
const countValue = document.getElementById("countValue");
const ratioRowPortrait = document.getElementById("ratioRowPortrait");
const ratioRowLandscape = document.getElementById("ratioRowLandscape");
const autoRatioControl = document.getElementById("autoRatioButton");
const styleImageInput = document.getElementById("styleImageInput");
const targetImageInput = document.getElementById("targetImageInput");
const stylePreviewImage = document.getElementById("stylePreviewImage");
const targetPreviewImage = document.getElementById("targetPreviewImage");
const stylePromptInput = document.getElementById("stylePromptInput");
const styleCountRange = document.getElementById("styleCountRange");
const styleCountValue = document.getElementById("styleCountValue");
const styleRatioRowPortrait = document.getElementById("styleRatioRowPortrait");
const styleRatioRowLandscape = document.getElementById("styleRatioRowLandscape");
const styleAutoRatioControl = document.getElementById("styleAutoRatioButton");
const styleGenerateBtn = document.getElementById("styleGenerateBtn");
const styleStatusText = document.getElementById("styleStatusText");
const styleProgressBar = document.getElementById("styleProgressBar");
const styleCountdownText = document.getElementById("styleCountdownText");
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");
const loveNoteText = document.getElementById("loveNoteText");
const progressBar = document.getElementById("progressBar");
const countdownText = document.getElementById("countdownText");
const canvas = document.getElementById("hero-canvas");
const settingsBtn = document.getElementById("settingsBtn");
const apiKeyModal = document.getElementById("apiKeyModal");
const apiKeyInput = document.getElementById("apiKeyInput");
const apiKeySaveBtn = document.getElementById("apiKeySaveBtn");
const apiKeyClearBtn = document.getElementById("apiKeyClearBtn");
const apiKeyStatus = document.getElementById("apiKeyStatus");

let renderer;
let scene;
let camera;
let petals = [];
let animationId;
let petalBoost = 1;
let autoRatioValue = "1:1";
let selectedRatio = "auto";
let styleAutoRatioValue = "1:1";
let styleSelectedRatio = "auto";
let loveNoteIndex = 0;

const loveNotes = [
  "我的第一个诺言：每次都把你放在心尖上。",
  "愿我们的日常，被你喜欢的光填满。",
  "每一次生成，都是给你的小惊喜。",
  "如果有下一个季节，也要和你一起拍。",
  "遇见你以后，连风都变得温柔。",
];

function renderTemplateOptions() {
  templates.forEach((template, index) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (index === 0 ? " active" : "");
    chip.textContent = template.name;
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((node) => {
        node.classList.remove("active");
      });
      chip.classList.add("active");
    });
    quickTemplates.appendChild(chip);
  });
}

function rotateLoveNotes() {
  if (!loveNoteText) return;
  let charIndex = 0;
  let currentNote = loveNotes[loveNoteIndex];

  const typeNext = () => {
    loveNoteText.textContent = currentNote.slice(0, charIndex + 1);
    charIndex += 1;
    if (charIndex < currentNote.length) {
      setTimeout(typeNext, 70);
      return;
    }
    setTimeout(() => {
      loveNoteIndex = (loveNoteIndex + 1) % loveNotes.length;
      currentNote = loveNotes[loveNoteIndex];
      charIndex = 0;
      typeNext();
    }, 3000);
  };

  typeNext();
}

function renderRatioChoices() {
  const portrait = [
    { label: "1:1", value: "1:1" },
    { label: "4:5", value: "4:5" },
    { label: "2:3", value: "2:3" },
    { label: "3:4", value: "3:4" },
    { label: "9:16", value: "9:16" },
  ];
  const landscape = [
    { label: "5:4", value: "5:4" },
    { label: "4:3", value: "4:3" },
    { label: "3:2", value: "3:2" },
    { label: "16:9", value: "16:9" },
    { label: "21:9", value: "21:9" },
  ];

  const makeButton = (item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "ratio-btn" + (item.value === selectedRatio ? " active" : "");
    button.textContent = item.label;
    button.dataset.value = item.value;
    button.addEventListener("click", () => {
      document.querySelectorAll(".ratio-btn").forEach((node) => {
        node.classList.remove("active");
      });
      if (autoRatioControl) {
        autoRatioControl.classList.remove("active");
      }
      button.classList.add("active");
      selectedRatio = item.value;
    });
    return button;
  };

  portrait.forEach((item) => ratioRowPortrait.appendChild(makeButton(item)));
  landscape.forEach((item) => ratioRowLandscape.appendChild(makeButton(item)));
}

function renderStyleRatioChoices() {
  const portrait = [
    { label: "1:1", value: "1:1" },
    { label: "4:5", value: "4:5" },
    { label: "2:3", value: "2:3" },
    { label: "3:4", value: "3:4" },
    { label: "9:16", value: "9:16" },
  ];
  const landscape = [
    { label: "5:4", value: "5:4" },
    { label: "4:3", value: "4:3" },
    { label: "3:2", value: "3:2" },
    { label: "16:9", value: "16:9" },
    { label: "21:9", value: "21:9" },
  ];

  const clearActive = () => {
    styleRatioRowPortrait
      .querySelectorAll(".ratio-btn")
      .forEach((node) => node.classList.remove("active"));
    styleRatioRowLandscape
      .querySelectorAll(".ratio-btn")
      .forEach((node) => node.classList.remove("active"));
  };

  const makeButton = (item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "ratio-btn" + (item.value === styleSelectedRatio ? " active" : "");
    button.textContent = item.label;
    button.dataset.value = item.value;
    button.addEventListener("click", () => {
      clearActive();
      if (styleAutoRatioControl) {
        styleAutoRatioControl.classList.remove("active");
      }
      button.classList.add("active");
      styleSelectedRatio = item.value;
    });
    return button;
  };

  portrait.forEach((item) =>
    styleRatioRowPortrait.appendChild(makeButton(item))
  );
  landscape.forEach((item) =>
    styleRatioRowLandscape.appendChild(makeButton(item))
  );
}

function setupThree() {
  if (!canvas || !window.THREE) return;

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.z = 18;

  const ambient = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(ambient);

  const geometry = new THREE.CircleGeometry(0.35, 24);
  const palette = ["#ffd5c8", "#f7b6a3", "#f9d5e5", "#ffe6cc"];

  petals = Array.from({ length: 32 }, (_, index) => {
    const material = new THREE.MeshBasicMaterial({
      color: palette[index % palette.length],
      transparent: true,
      opacity: 0.6,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      (Math.random() - 0.5) * 22,
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 6
    );
    mesh.rotation.z = Math.random() * Math.PI;
    mesh.userData = {
      speed: 0.002 + Math.random() * 0.004,
      drift: (Math.random() - 0.5) * 0.01,
      wobble: Math.random() * Math.PI * 2,
    };
    scene.add(mesh);
    return mesh;
  });

  const animate = () => {
    animationId = requestAnimationFrame(animate);
    petals.forEach((petal) => {
      petal.position.y += petal.userData.speed * 6 * petalBoost;
      petal.position.x += petal.userData.drift * 3 * petalBoost;
      petal.rotation.z += 0.002;
      petal.userData.wobble += 0.01;
      petal.position.x += Math.sin(petal.userData.wobble) * 0.002;
      if (petal.position.y > 9) {
        petal.position.y = -9;
        petal.position.x = (Math.random() - 0.5) * 22;
      }
    });
    renderer.render(scene, camera);
  };

  animate();
}

function resizeThree() {
  if (!renderer || !camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function updatePreview(file) {
  if (!file) {
    previewImage.style.display = "none";
    previewImage.src = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    previewImage.src = reader.result;
    previewImage.style.display = "block";
    const image = new Image();
    image.onload = () => {
      autoRatioValue = pickNearestRatio(image.width, image.height);
      if (autoRatioControl) {
        autoRatioControl.textContent = `保持原图 (${autoRatioValue})`;
      }
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function updateStylePreview(file, imageEl) {
  if (!file) {
    imageEl.style.display = "none";
    imageEl.src = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    imageEl.src = reader.result;
    imageEl.style.display = "block";
  };
  reader.readAsDataURL(file);
}

function updateTargetPreview(file) {
  updateStylePreview(file, targetPreviewImage);
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      styleAutoRatioValue = pickNearestRatio(image.width, image.height);
      if (styleAutoRatioControl) {
        styleAutoRatioControl.textContent = `保持原图 (${styleAutoRatioValue})`;
      }
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function resolveNearestRatioFromFile(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve(autoRatioValue);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        resolve(pickNearestRatio(image.width, image.height));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function renderPlaceholders() {
  resultGrid.replaceChildren();
  for (let i = 0; i < 3; i += 1) {
    const box = document.createElement("div");
    box.className = "placeholder";
    box.textContent = `结果 ${i + 1}`;
    resultGrid.appendChild(box);
  }
}

function pickNearestRatio(width, height) {
  const ratio = width / height;
  const candidates = [
    "1:1",
    "5:4",
    "4:5",
    "2:3",
    "3:4",
    "9:16",
    "4:3",
    "3:2",
    "16:9",
    "21:9",
  ];
  let best = candidates[0];
  let bestDiff = Number.POSITIVE_INFINITY;
  candidates.forEach((item) => {
    const [w, h] = item.split(":").map(Number);
    const diff = Math.abs(ratio - w / h);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = item;
    }
  });
  return best;
}

function setProgress(percent, secondsLeft) {
  progressBar.style.width = `${percent}%`;
  countdownText.textContent = secondsLeft
    ? `下一张约 ${secondsLeft}s`
    : "准备中";
}

function setStyleProgress(percent, secondsLeft) {
  styleProgressBar.style.width = `${percent}%`;
  styleCountdownText.textContent = secondsLeft
    ? `下一张约 ${secondsLeft}s`
    : "准备中";
}

function boostPetals(active) {
  petalBoost = active ? 2.6 : 1;
}

async function generateImages() {
  const apiKey = getApiKey();
  if (!apiKey) {
    statusText.textContent = "请先点右上角 ⚙ API Key 设置 Google 密钥。";
    openApiKeyModal();
    return;
  }

  const file = imageInput.files[0];
  if (!file) {
    statusText.textContent = "请先上传图片。";
    return;
  }

  const basePrompt = promptInput.value.trim();
  if (!basePrompt) {
    statusText.textContent = "请输入提示词。";
    return;
  }

  const total = Number.parseInt(countRange.value, 10);
  statusText.textContent = "生成中，请稍等...";
  outputText.textContent = "";
  renderPlaceholders();

  generateBtn.textContent = `为静闻生成 ${total} 张惊喜`;

  const activeTemplate = document.querySelector(".chip.active");
  const template = activeTemplate
    ? templates.find((item) => item.name === activeTemplate.textContent)?.value
    : "";
  const finalPrompt = template ? `${basePrompt}\n\n修正模板: ${template}` : basePrompt;
  const imageBase64 = await fileToBase64(file);
  const imageMime = file.type || "image/png";

  resultGrid.replaceChildren();
  const slots = Array.from({ length: total }, (_, index) => {
    const wrap = document.createElement("div");
    wrap.className = "result-image";
    wrap.textContent = `生成中 ${index + 1}`;
    resultGrid.appendChild(wrap);
    return wrap;
  });

  let lastText = "";
  const chosenRatio =
    selectedRatio === "auto" ||
    (autoRatioControl && autoRatioControl.classList.contains("active"))
      ? autoRatioValue
      : selectedRatio || autoRatioValue;

  for (let i = 0; i < total; i += 1) {
    boostPetals(true);
    const targetSeconds = 30;
    let secondsLeft = targetSeconds;
    setProgress(0, secondsLeft);
    const countdownTimer = setInterval(() => {
      secondsLeft -= 1;
      const percent = Math.min(
        100,
        ((targetSeconds - secondsLeft) / targetSeconds) * 100
      );
      setProgress(percent, secondsLeft);
      if (secondsLeft <= 0) {
        clearInterval(countdownTimer);
      }
    }, 1000);

    try {
      const { images, text } = await callGemini({
        apiKey,
        aspectRatio: chosenRatio,
        parts: [
          { inlineData: { mimeType: imageMime, data: imageBase64 } },
          { text: finalPrompt },
        ],
      });
      clearInterval(countdownTimer);
      setProgress(100, 0);
      boostPetals(false);

      if (!images.length) {
        statusText.textContent = text ? `模型只返回文字: ${text.slice(0, 80)}` : "未返回图片。";
        slots[i].textContent = "失败";
        break;
      }

      lastText = text || lastText;
      const image = document.createElement("img");
      image.alt = `结果 ${i + 1}`;
      image.src = `data:image/png;base64,${images[0]}`;
      slots[i].textContent = "";
      slots[i].appendChild(image);
      statusText.textContent = `已生成 ${i + 1} / ${total}`;
      outputText.textContent = lastText ? lastText.slice(0, 120) : "";
    } catch (error) {
      clearInterval(countdownTimer);
      boostPetals(false);
      slots[i].textContent = "失败";
      statusText.textContent = error?.message || "请求失败。";
      if (error?.status === 401 || error?.status === 403) {
        statusText.textContent = "API Key 无效或被拒绝，请重新设置。";
        openApiKeyModal();
      }
      break;
    }
  }

  if (statusText.textContent.startsWith("已生成")) {
    statusText.textContent = "完成。";
    setProgress(0, 0);
  }
}

async function generateStyleImages() {
  const apiKey = getApiKey();
  if (!apiKey) {
    styleStatusText.textContent = "请先点右上角 ⚙ API Key 设置 Google 密钥。";
    openApiKeyModal();
    return;
  }

  const styleFile = styleImageInput.files[0];
  const targetFile = targetImageInput.files[0];
  if (!styleFile || !targetFile) {
    styleStatusText.textContent = "请上传风格参考图和待修改图。";
    return;
  }

  const promptText = stylePromptInput.value.trim();
  if (!promptText) {
    styleStatusText.textContent = "请输入风格提示词。";
    return;
  }

  const total = Number.parseInt(styleCountRange.value, 10);
  styleStatusText.textContent = "生成中，请稍等...";

  const targetRatio =
    styleSelectedRatio === "auto" ||
    (styleAutoRatioControl && styleAutoRatioControl.classList.contains("active"))
      ? styleAutoRatioValue
      : styleSelectedRatio || styleAutoRatioValue;

  const styleBase64 = await fileToBase64(styleFile);
  const targetBase64 = await fileToBase64(targetFile);
  const styleMime = styleFile.type || "image/png";
  const targetMime = targetFile.type || "image/png";

  resultGrid.replaceChildren();
  const slots = Array.from({ length: total }, (_, index) => {
    const wrap = document.createElement("div");
    wrap.className = "result-image";
    wrap.textContent = `生成中 ${index + 1}`;
    resultGrid.appendChild(wrap);
    return wrap;
  });

  for (let i = 0; i < total; i += 1) {
    boostPetals(true);
    const targetSeconds = 30;
    let secondsLeft = targetSeconds;
    setStyleProgress(0, secondsLeft);
    const countdownTimer = setInterval(() => {
      secondsLeft -= 1;
      const percent = Math.min(
        100,
        ((targetSeconds - secondsLeft) / targetSeconds) * 100
      );
      setStyleProgress(percent, secondsLeft);
      if (secondsLeft <= 0) {
        clearInterval(countdownTimer);
      }
    }, 1000);

    try {
      const { images } = await callGemini({
        apiKey,
        aspectRatio: targetRatio,
        parts: [
          { inlineData: { mimeType: styleMime, data: styleBase64 } },
          { inlineData: { mimeType: targetMime, data: targetBase64 } },
          { text: promptText },
        ],
      });
      clearInterval(countdownTimer);
      setStyleProgress(100, 0);
      boostPetals(false);

      if (!images.length) {
        styleStatusText.textContent = "未返回图片。";
        slots[i].textContent = "失败";
        break;
      }

      const image = document.createElement("img");
      image.alt = `结果 ${i + 1}`;
      image.src = `data:image/png;base64,${images[0]}`;
      slots[i].textContent = "";
      slots[i].appendChild(image);
      styleStatusText.textContent = `已生成 ${i + 1} / ${total}`;
    } catch (error) {
      clearInterval(countdownTimer);
      boostPetals(false);
      slots[i].textContent = "失败";
      styleStatusText.textContent = error?.message || "请求失败。";
      if (error?.status === 401 || error?.status === 403) {
        styleStatusText.textContent = "API Key 无效或被拒绝，请重新设置。";
        openApiKeyModal();
      }
      break;
    }
  }

  if (styleStatusText.textContent.startsWith("已生成")) {
    styleStatusText.textContent = "完成。";
    setStyleProgress(0, 0);
  }
}

imageInput.addEventListener("change", (event) => {
  updatePreview(event.target.files[0]);
});
styleImageInput.addEventListener("change", (event) => {
  updateStylePreview(event.target.files[0], stylePreviewImage);
});
targetImageInput.addEventListener("change", (event) => {
  updateTargetPreview(event.target.files[0]);
});

generateBtn.addEventListener("click", generateImages);
styleGenerateBtn.addEventListener("click", generateStyleImages);
window.addEventListener("resize", resizeThree);

countRange.addEventListener("input", () => {
  countValue.textContent = countRange.value;
  generateBtn.textContent = `为静闻生成 ${countRange.value} 张惊喜`;
});

styleCountRange.addEventListener("input", () => {
  styleCountValue.textContent = styleCountRange.value;
});

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab;
    tabButtons.forEach((node) => node.classList.remove("active"));
    tabPanels.forEach((panel) => panel.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${target}`)?.classList.add("active");
  });
});

renderTemplateOptions();
renderRatioChoices();
renderStyleRatioChoices();
renderPlaceholders();
setupThree();
rotateLoveNotes();

if (autoRatioControl) {
  autoRatioControl.addEventListener("click", () => {
    document.querySelectorAll(".ratio-btn").forEach((node) => {
      node.classList.remove("active");
    });
    autoRatioControl.classList.add("active");
    selectedRatio = "auto";
  });
  autoRatioControl.classList.add("active");
}

if (styleAutoRatioControl) {
  styleAutoRatioControl.addEventListener("click", () => {
    styleRatioRowPortrait
      .querySelectorAll(".ratio-btn")
      .forEach((node) => node.classList.remove("active"));
    styleRatioRowLandscape
      .querySelectorAll(".ratio-btn")
      .forEach((node) => node.classList.remove("active"));
    styleAutoRatioControl.classList.add("active");
    styleSelectedRatio = "auto";
  });
  styleAutoRatioControl.classList.add("active");
}

function openApiKeyModal() {
  if (!apiKeyModal) return;
  apiKeyInput.value = getApiKey();
  apiKeyStatus.textContent = "";
  apiKeyModal.classList.add("open");
  setTimeout(() => apiKeyInput.focus(), 50);
}

function closeApiKeyModal() {
  apiKeyModal?.classList.remove("open");
}

function refreshSettingsBtnLabel() {
  if (!settingsBtn) return;
  settingsBtn.textContent = getApiKey() ? "⚙ API Key" : "⚙ 设置 API Key";
}

if (settingsBtn) {
  settingsBtn.addEventListener("click", openApiKeyModal);
}

if (apiKeyModal) {
  apiKeyModal.addEventListener("click", (event) => {
    if (event.target === apiKeyModal) closeApiKeyModal();
  });
}

if (apiKeySaveBtn) {
  apiKeySaveBtn.addEventListener("click", () => {
    const value = (apiKeyInput.value || "").trim();
    if (!value) {
      apiKeyStatus.textContent = "请输入 key 后再保存。";
      return;
    }
    setApiKey(value);
    apiKeyStatus.textContent = "已保存到当前浏览器。";
    refreshSettingsBtnLabel();
    setTimeout(closeApiKeyModal, 600);
  });
}

if (apiKeyClearBtn) {
  apiKeyClearBtn.addEventListener("click", () => {
    setApiKey("");
    apiKeyInput.value = "";
    apiKeyStatus.textContent = "已清除。";
    refreshSettingsBtnLabel();
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeApiKeyModal();
});

refreshSettingsBtnLabel();
if (!getApiKey()) {
  openApiKeyModal();
}
