// Three.js page-curl close animation for the login book.
// Plays once on successful login: right page rolls left toward the spine
// (real vertex-shader curl), then the closed book scales and fades out.
// Gracefully no-ops if WebGL is unavailable.

(() => {
  function hasWebGL() {
    try {
      const c = document.createElement("canvas");
      return !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch (_) {
      return false;
    }
  }

  if (!hasWebGL() || typeof THREE === "undefined") {
    window.loginFlip = { ready: () => false, playClose: () => Promise.resolve() };
    return;
  }

  const css = `
    #login-flip-canvas {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 200;
      display: none;
      transition: opacity 0.32s linear;
      background: transparent;
    }
  `;
  const styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  const canvas = document.createElement("canvas");
  canvas.id = "login-flip-canvas";
  document.body.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  camera.position.set(0, -0.05, 3.4);
  camera.lookAt(0, 0, 0);

  const ambient = new THREE.AmbientLight(0xfff5e8, 0.65);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xfff1d8, 0.95);
  key.position.set(2.5, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff8a7a, 0.3);
  rim.position.set(-3, 1.5, 1);
  scene.add(rim);

  function paperTexture(role) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 768;
    const ctx = c.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 768);
    grad.addColorStop(0, "#fbf2e7");
    grad.addColorStop(1, "#f1e2d0");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 768);

    ctx.fillStyle = "rgba(193, 69, 44, 0.05)";
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 768;
      const r = Math.random() * 1.4 + 0.2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(122, 46, 24, 0.13)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 8]);
    for (let y = 220; y < 660; y += 46) {
      const indent = role === "left" ? 60 : 50;
      const tail = role === "left" ? 50 : 60;
      ctx.beginPath();
      ctx.moveTo(indent, y);
      ctx.lineTo(512 - tail, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (role === "left") {
      ctx.fillStyle = "rgba(122, 46, 24, 0.6)";
      ctx.font = "16px Marcellus, serif";
      ctx.textAlign = "left";
      ctx.fillText("FOR JINGWEN ZHANG", 60, 90);

      ctx.fillStyle = "rgba(26, 18, 16, 0.88)";
      ctx.font = "44px 'Noto Serif SC', serif";
      ctx.fillText("静闻的私密小宇宙", 60, 165);
    } else {
      ctx.fillStyle = "rgba(122, 46, 24, 0.5)";
      ctx.font = "14px Marcellus, serif";
      ctx.textAlign = "right";
      ctx.fillText("TODAY'S PASS", 460, 90);

      const cx = 256;
      const dotY = 360;
      ctx.fillStyle = "rgba(193, 69, 44, 0.78)";
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(cx - 90 + i * 60, dotY, 9, 0, Math.PI * 2);
        ctx.fill();
      }

      const wax = ctx.createRadialGradient(420, 680, 4, 420, 680, 32);
      wax.addColorStop(0, "#ff8a7a");
      wax.addColorStop(1, "#a23a25");
      ctx.fillStyle = wax;
      ctx.beginPath();
      ctx.arc(420, 680, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff8f3";
      ctx.font = "bold 24px 'Noto Serif SC', serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("寄", 420, 680);
    }

    const edge = ctx.createLinearGradient(
      role === "left" ? 412 : 0,
      0,
      role === "left" ? 512 : 100,
      0
    );
    edge.addColorStop(role === "left" ? 0 : 1, "rgba(0,0,0,0)");
    edge.addColorStop(role === "left" ? 1 : 0, "rgba(58, 28, 18, 0.22)");
    ctx.fillStyle = edge;
    ctx.fillRect(role === "left" ? 412 : 0, 0, 100, 768);

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  const PAGE_W = 1.05;
  const PAGE_H = 1.55;

  // Left page: flat plane, hinged so its right edge sits at x=0 (the spine).
  const leftGeo = new THREE.PlaneGeometry(PAGE_W, PAGE_H, 1, 1);
  leftGeo.translate(-PAGE_W / 2, 0, 0);
  const leftMat = new THREE.MeshStandardMaterial({
    map: paperTexture("left"),
    side: THREE.DoubleSide,
    roughness: 0.85,
    metalness: 0.02,
  });
  const leftMesh = new THREE.Mesh(leftGeo, leftMat);

  // Right page: subdivided plane, curls via vertex shader.
  // Local geometry: x in [0, PAGE_W], y in [-H/2, H/2]; the spine is x=0.
  const SEG = 48;
  const rightGeo = new THREE.PlaneGeometry(PAGE_W, PAGE_H, SEG, 1);
  rightGeo.translate(PAGE_W / 2, 0, 0);
  const rightTex = paperTexture("right");
  const rightUniforms = {
    map: { value: rightTex },
    progress: { value: 0 },
    pageW: { value: PAGE_W },
    radius: { value: 0.18 },
    accent: { value: new THREE.Color(0xff8a7a) },
    accentDeep: { value: new THREE.Color(0xc1452c) },
  };
  const rightMat = new THREE.ShaderMaterial({
    uniforms: rightUniforms,
    side: THREE.DoubleSide,
    transparent: true,
    vertexShader: `
      varying vec2 vUv;
      varying float vCurl;
      uniform float progress;
      uniform float pageW;
      uniform float radius;
      void main() {
        vUv = uv;
        vec3 pos = position;
        float axis = pageW * (1.0 - progress);
        float dist = pos.x - axis;
        float curl = 0.0;
        if (dist > 0.0) {
          float angle = dist / radius;
          pos.x = axis + sin(angle) * radius;
          pos.z = (1.0 - cos(angle)) * radius;
          curl = clamp(angle / 3.14159, 0.0, 1.0);
        }
        vCurl = curl;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying float vCurl;
      uniform sampler2D map;
      uniform vec3 accent;
      uniform vec3 accentDeep;
      void main() {
        vec4 base;
        if (gl_FrontFacing) {
          base = texture2D(map, vUv);
        } else {
          // back of page: warm cream with subtle gradient hint of the wax stamp
          float v = smoothstep(0.0, 1.0, vUv.x);
          vec3 backCol = mix(vec3(0.965, 0.918, 0.847), vec3(0.952, 0.881, 0.798), v);
          base = vec4(backCol, 1.0);
        }
        // shade the curl: deeper paper shadow as it bends over
        float shade = mix(1.0, 0.78, vCurl);
        base.rgb *= shade;
        gl_FragColor = base;
      }
    `,
  });
  const rightMesh = new THREE.Mesh(rightGeo, rightMat);

  const book = new THREE.Group();
  book.add(leftMesh);
  book.add(rightMesh);
  scene.add(book);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // adjust camera distance for portrait mobile so the book fills nicely
    camera.position.z = h > w ? 4.2 : 3.4;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInQuad(t) { return t * t; }

  let busy = false;

  function playClose() {
    if (busy) return Promise.resolve();
    busy = true;
    canvas.style.opacity = "1";
    canvas.style.display = "block";

    rightUniforms.progress.value = 0;
    book.rotation.set(0, 0, 0);
    book.scale.setScalar(1);

    const flipDur = 1.0;
    const settleDur = 0.55;
    const t0 = performance.now();

    return new Promise((resolve) => {
      function tick() {
        const dt = (performance.now() - t0) / 1000;
        if (dt < flipDur) {
          const p = easeOutCubic(dt / flipDur);
          rightUniforms.progress.value = p;
          book.rotation.y = -0.12 * p;
        } else if (dt < flipDur + settleDur) {
          rightUniforms.progress.value = 1;
          const p = (dt - flipDur) / settleDur;
          const e = easeInQuad(p);
          book.rotation.y = -0.12 - 0.18 * e;
          book.rotation.x = -0.05 * e;
          book.scale.setScalar(1 - 0.22 * e);
          canvas.style.opacity = String(1 - e);
        } else {
          canvas.style.display = "none";
          canvas.style.opacity = "1";
          rightUniforms.progress.value = 0;
          book.rotation.set(0, 0, 0);
          book.scale.setScalar(1);
          busy = false;
          resolve();
          return;
        }
        renderer.render(scene, camera);
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  window.loginFlip = {
    ready: () => true,
    playClose,
  };
})();
