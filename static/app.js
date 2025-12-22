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
const progressBar = document.getElementById("progressBar");
const countdownText = document.getElementById("countdownText");
const canvas = document.getElementById("hero-canvas");

let renderer;
let scene;
let camera;
let petals = [];
let animationId;
let petalBoost = 1;

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
  };
  reader.readAsDataURL(file);
}

function renderPlaceholders() {
  resultGrid.innerHTML = "";
  for (let i = 0; i < 3; i += 1) {
    const box = document.createElement("div");
    box.className = "placeholder";
    box.textContent = `结果 ${i + 1}`;
    resultGrid.appendChild(box);
  }
}

function setProgress(percent, secondsLeft) {
  progressBar.style.width = `${percent}%`;
  countdownText.textContent = secondsLeft
    ? `下一张约 ${secondsLeft}s`
    : "准备中";
}

function boostPetals(active) {
  petalBoost = active ? 2.6 : 1;
}

async function generateImages() {
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

  statusText.textContent = "生成中，请稍等...";
  outputText.textContent = "";
  renderPlaceholders();

  const activeTemplate = document.querySelector(".chip.active");
  const template = activeTemplate
    ? templates.find((item) => item.name === activeTemplate.textContent)?.value
    : "";
  const finalPrompt = `${basePrompt}\n\n修正模板: ${template}`;

  resultGrid.innerHTML = "";
  const slots = Array.from({ length: 3 }, (_, index) => {
    const wrap = document.createElement("div");
    wrap.className = "result-image";
    wrap.textContent = `生成中 ${index + 1}`;
    resultGrid.appendChild(wrap);
    return wrap;
  });

  let lastText = "";

  for (let i = 0; i < 3; i += 1) {
    const formData = new FormData();
    formData.append("prompt", finalPrompt);
    formData.append("image", file);
    formData.append("target", "1");

    try {
      const response = await fetch("/generate", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        statusText.textContent = data.error || "生成失败。";
        slots[i].textContent = "失败";
        break;
      }

      lastText = data.text || lastText;
      const image = document.createElement("img");
      image.alt = `结果 ${i + 1}`;
      image.src = `data:image/png;base64,${data.images[0]}`;
      slots[i].textContent = "";
      slots[i].appendChild(image);
      statusText.textContent = `已生成 ${i + 1} / 3`;
      outputText.textContent = lastText ? lastText.slice(0, 120) : "";
    } catch (error) {
      slots[i].textContent = "失败";
      statusText.textContent = "请求失败，请检查后端服务。";
      break;
    }
  }

  if (statusText.textContent.startsWith("已生成")) {
    statusText.textContent = "完成。";
  }
}

imageInput.addEventListener("change", (event) => {
  updatePreview(event.target.files[0]);
});

generateBtn.addEventListener("click", generateImages);
window.addEventListener("resize", resizeThree);

renderTemplateOptions();
renderPlaceholders();
setupThree();
