import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.176.0/build/three.module.js";
import {
  FilesetResolver,
  HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs";

const PARTICLE_COUNT = 76000;
const GLOW_COUNT = 76000;
const AMBIENT_COUNT = 14000;
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const canvas = document.querySelector("[data-scene]");
const video = document.querySelector("[data-video]");
const overlay = document.querySelector("[data-overlay]");
const startCameraButton = document.querySelector("[data-start-camera]");
const fullscreenButton = document.querySelector("[data-fullscreen]");
const openExternalButton = document.querySelector("[data-open-external]");
const miniStatus = document.querySelector("[data-mini-status]");
const cameraState = document.querySelector("[data-camera-state]");
const statusText = document.querySelector("[data-status]");
const openValue = document.querySelector("[data-open-value]");
const spreadValue = document.querySelector("[data-spread-value]");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05070d, 0.024);

const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 220);
camera.position.set(0, 0, 38);

const particleTexture = createParticleTexture();

const positions = new Float32Array(PARTICLE_COUNT * 3);
const glowPositions = new Float32Array(GLOW_COUNT * 3);
const baseTargets = new Float32Array(PARTICLE_COUNT * 3);
const velocities = new Float32Array(PARTICLE_COUNT * 3);
const colors = new Float32Array(PARTICLE_COUNT * 3);
const driftVectors = new Float32Array(PARTICLE_COUNT * 3);
const explodeVectors = new Float32Array(PARTICLE_COUNT * 3);
const phases = new Float32Array(PARTICLE_COUNT);

const mainGeometry = new THREE.BufferGeometry();
mainGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
mainGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

const glowGeometry = new THREE.BufferGeometry();
glowGeometry.setAttribute("position", new THREE.BufferAttribute(glowPositions, 3));
glowGeometry.setAttribute("color", new THREE.BufferAttribute(colors.slice(), 3));

const mainMaterial = new THREE.PointsMaterial({
  size: 0.12,
  sizeAttenuation: true,
  map: particleTexture,
  transparent: true,
  alphaTest: 0.008,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexColors: true,
  opacity: 0.98,
});

const glowMaterial = new THREE.PointsMaterial({
  size: 0.44,
  sizeAttenuation: true,
  map: particleTexture,
  transparent: true,
  alphaTest: 0.003,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexColors: true,
  opacity: 0.34,
});

const particleField = new THREE.Group();
particleField.position.set(0, 0, 0);
particleField.rotation.y = 0;
particleField.rotation.x = 0.06;

const particleSystem = new THREE.Points(mainGeometry, mainMaterial);
const glowSystem = new THREE.Points(glowGeometry, glowMaterial);
particleField.add(glowSystem);
particleField.add(particleSystem);
scene.add(particleField);

const ambientGeometry = new THREE.BufferGeometry();
const ambientPositions = new Float32Array(AMBIENT_COUNT * 3);
for (let i = 0; i < AMBIENT_COUNT; i += 1) {
  const i3 = i * 3;
  const p = randomOnSphere();
  const radius = 18 + Math.random() * 26;
  ambientPositions[i3] = p.x * radius;
  ambientPositions[i3 + 1] = p.y * radius * 0.7;
  ambientPositions[i3 + 2] = p.z * radius;
}
ambientGeometry.setAttribute("position", new THREE.BufferAttribute(ambientPositions, 3));

const ambientSystem = new THREE.Points(
  ambientGeometry,
  new THREE.PointsMaterial({
    color: new THREE.Color("#ffffff"),
    size: 0.16,
    sizeAttenuation: true,
    map: particleTexture,
    transparent: true,
    alphaTest: 0.01,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.1,
  })
);
scene.add(ambientSystem);

scene.add(new THREE.AmbientLight(0xffffff, 0.4));

const bloomLight = new THREE.PointLight(0xffffff, 10.5, 260, 2);
bloomLight.position.set(12, 10, 22);
scene.add(bloomLight);

const fillLight = new THREE.PointLight(0xf7fbff, 7.8, 220, 2);
fillLight.position.set(18, -6, 14);
scene.add(fillLight);

const state = {
  targetExplosion: 0,
  currentExplosion: 0,
  targetSpinX: 0,
  targetSpinY: 0,
  currentSpinX: 0,
  currentSpinY: 0,
  targetSpinVelocityX: 0,
  targetSpinVelocityY: 0,
  currentSpinVelocityX: 0,
  currentSpinVelocityY: 0,
  targetOrbitTurnY: 0,
  currentOrbitTurnY: 0,
  appliedOrbitTurnY: 0,
  targetFieldX: 0,
  targetFieldY: 0,
  currentFieldX: 0,
  currentFieldY: 0,
  interactionWorldX: 0,
  interactionWorldY: 0,
  interactionStrength: 0,
  handLandmarker: null,
  handTrackingReady: false,
  cameraReady: false,
  stream: null,
  lastVideoTime: -1,
  permissionState: "unknown",
  openScore: 0,
  fistScore: 0,
  prevIndexX: null,
  prevIndexY: null,
  lastSwipeAt: 0,
};

buildSphere();
updateMetrics(0, 0);
setStatus("等待摄像头启动");
setMiniStatus("Offline");

if (isLikelyEmbeddedBrowser()) {
  setStatus("当前内嵌浏览器可能拦截相机，建议直接在 Chrome 打开");
  setMiniStatus("Embed");
}

startCameraButton.addEventListener("click", async () => {
  startCameraButton.disabled = true;
  startCameraButton.textContent = "连接中…";

  try {
    await runCameraPreflight();
    await ensureHandTracking();
    await startCamera();
    document.body.classList.add("started");
    startCameraButton.textContent = "球体已连接";
    setStatus("张开手掌炸开，握拳回球，食指滑动可以转球");
    setMiniStatus("Live");
  } catch (error) {
    console.error(error);
    startCameraButton.disabled = false;
    startCameraButton.textContent = "重新连接";
    const { status, detail } = explainCameraFailure(error);
    setStatus(status);
    cameraState.textContent = detail;
    setMiniStatus("Error");
  }
});

openExternalButton?.addEventListener("click", () => {
  window.open(window.location.href, "_blank", "noopener,noreferrer");
});

fullscreenButton.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (error) {
    console.error(error);
    setStatus("全屏模式启动失败");
  }
});

document.addEventListener("fullscreenchange", () => {
  fullscreenButton.textContent = document.fullscreenElement ? "退出全屏" : "全屏";
});

window.addEventListener("resize", onResize);
requestAnimationFrame(render);

async function ensureHandTracking() {
  if (state.handTrackingReady) return;

  setStatus("正在加载手势识别模型…");
  cameraState.textContent = "加载感应模块…";

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  state.handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
    },
    runningMode: "VIDEO",
    numHands: 1,
  });

  state.handTrackingReady = true;
}

async function runCameraPreflight() {
  if (!window.isSecureContext) {
    throw new Error("INSECURE_CONTEXT");
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    throw new Error("MEDIA_DEVICES_UNSUPPORTED");
  }

  if (navigator.permissions && typeof navigator.permissions.query === "function") {
    try {
      const result = await navigator.permissions.query({ name: "camera" });
      state.permissionState = result.state;
      if (result.state === "denied") {
        throw new Error("CAMERA_PERMISSION_DENIED");
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (
          error.message === "CAMERA_PERMISSION_DENIED" ||
          error.message === "INSECURE_CONTEXT" ||
          error.message === "MEDIA_DEVICES_UNSUPPORTED"
        )
      ) {
        throw error;
      }
    }
  }
}

async function startCamera() {
  if (state.cameraReady) return;

  state.stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });

  video.srcObject = state.stream;
  await new Promise((resolve) => {
    video.onloadedmetadata = () => resolve();
  });

  await video.play();
  resizeOverlay();
  state.cameraReady = true;
  cameraState.textContent = "张手炸开，握拳回球，食指转球";
}

function explainCameraFailure(error) {
  const fallback = {
    status: "装置连接失败",
    detail: "当前环境没能成功打开摄像头，更像是权限或浏览器限制。",
  };

  if (!(error instanceof Error)) return fallback;

  if (error.message === "INSECURE_CONTEXT") {
    return {
      status: "当前页面不是安全上下文",
      detail: "这个浏览器环境没有把当前页面当作可访问摄像头的安全页面。",
    };
  }

  if (error.message === "MEDIA_DEVICES_UNSUPPORTED") {
    return {
      status: "当前浏览器不支持摄像头接口",
      detail: "这个浏览器没有提供 mediaDevices.getUserMedia。",
    };
  }

  if (error.message === "CAMERA_PERMISSION_DENIED" || error.name === "NotAllowedError") {
    return {
      status: "摄像头权限被拒绝",
      detail: "当前应用或浏览器没有相机权限。",
    };
  }

  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
    return {
      status: "没有找到可用摄像头",
      detail: "系统没有返回可用的视频输入设备。",
    };
  }

  if (error.name === "NotReadableError" || error.name === "TrackStartError") {
    return {
      status: "摄像头正被占用",
      detail: "相机可能被其他应用占用。",
    };
  }

  return {
    status: `装置连接失败：${error.name || "UnknownError"}`,
    detail: error.message || fallback.detail,
  };
}

function render(now) {
  const time = now * 0.001;
  updateHandTracking(now);
  animateCurtain(time);
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

function updateHandTracking(now) {
  if (!state.handLandmarker || !state.cameraReady || video.readyState < 2) {
    return;
  }

  if (video.currentTime === state.lastVideoTime) {
    return;
  }

  state.lastVideoTime = video.currentTime;

  let result;
  try {
    result = state.handLandmarker.detectForVideo(video, now);
  } catch (error) {
    result = state.handLandmarker.detectForVideo(video);
  }

  drawHandOverlay(result);
  applyHandResponse(result);
}

function applyHandResponse(result) {
  const hand = result?.landmarks?.[0];
  if (!hand) {
    state.targetExplosion *= 0.92;
    state.interactionStrength *= 0.86;
    state.targetSpinX *= 0.88;
    state.targetSpinY *= 0.88;
    state.targetFieldX *= 0.9;
    state.targetFieldY *= 0.9;
    state.prevIndexX = null;
    state.prevIndexY = null;
    updateMetrics(state.openScore * 0.9, state.targetExplosion);
    setStatus("把一只手放进画面，张手炸开，握拳回球，食指滑动转球");
    cameraState.textContent = "等待手进入画面";
    setMiniStatus("Idle");
    return;
  }

  const openScore = estimateOpenValue(hand);
  const fistScore = estimateFistValue(hand);
  const center = palmCenter(hand);
  const indexTip = hand[8];
  const indexBase = hand[5];
  const screenIndexX = 1 - indexTip.x;
  const screenIndexY = indexTip.y;
  const indexExtended =
    dist3D(indexTip, hand[0]) > dist3D(indexBase, hand[0]) * 1.18;
  const isOpen = openScore > 0.72;
  const isFist = fistScore > 0.72 && openScore < 0.42;

  state.openScore = openScore;
  state.fistScore = fistScore;
  state.interactionWorldX = THREE.MathUtils.lerp(-7.5, 7.5, 1 - center.x);
  state.interactionWorldY = THREE.MathUtils.lerp(7.5, -7.5, center.y);
  state.interactionStrength = THREE.MathUtils.lerp(0.08, 0.9, Math.max(openScore, fistScore * 0.82));
  state.targetSpinY = (center.x - 0.5) * 0.24;
  state.targetSpinX = -(center.y - 0.5) * 0.16;

  if (isOpen) {
    state.targetExplosion = THREE.MathUtils.clamp(
      0.48 + (openScore - 0.72) * 1.8,
      0,
      1
    );
    setStatus("张开手掌，粒子球正在整体炸散");
    cameraState.textContent = "Open burst";
    setMiniStatus("Open");
    state.prevIndexX = null;
    state.prevIndexY = null;
  } else if (isFist) {
    state.targetExplosion = 0;
    state.targetFieldX = THREE.MathUtils.lerp(-7.2, 7.2, 1 - center.x);
    state.targetFieldY = THREE.MathUtils.lerp(7.6, -7.6, center.y);
    setStatus("握拳中，粒子正在重新收回球体表面");
    cameraState.textContent = "Fist follow";
    setMiniStatus("Fist");
    state.prevIndexX = null;
    state.prevIndexY = null;
  } else {
    state.targetExplosion += (0.05 - state.targetExplosion) * 0.2;
    state.targetFieldX *= 0.84;
    state.targetFieldY *= 0.84;
    if (indexExtended) {
      if (state.prevIndexX != null && state.prevIndexY != null) {
        const deltaX = screenIndexX - state.prevIndexX;
        const deltaY = screenIndexY - state.prevIndexY;

        if (
          deltaX < -0.018 &&
          Math.abs(deltaX) > Math.abs(deltaY) * 1.35 &&
          performance.now() - state.lastSwipeAt > 700
        ) {
          state.targetOrbitTurnY += Math.PI * 2;
          state.lastSwipeAt = performance.now();
          setStatus("食指向左甩动，粒子球开始完整转一圈");
          cameraState.textContent = "Swipe spin";
          setMiniStatus("Swipe");
        }

        state.targetSpinVelocityY = THREE.MathUtils.clamp(
          state.targetSpinVelocityY + deltaX * 0.9,
          -0.09,
          0.09
        );
        state.targetSpinVelocityX = THREE.MathUtils.clamp(
          state.targetSpinVelocityX + deltaY * 0.62,
          -0.065,
          0.065
        );
      }
      state.prevIndexX = screenIndexX;
      state.prevIndexY = screenIndexY;
      if (performance.now() - state.lastSwipeAt > 260) {
        setStatus("食指滑动中，粒子球会跟着旋转，向左甩会转一整圈");
        cameraState.textContent = "Index rotate";
        setMiniStatus("Rotate");
      }
    } else {
      state.prevIndexX = null;
      state.prevIndexY = null;
      setStatus("保持手在画面里，食指滑动可以转球，向左甩会转一整圈");
      cameraState.textContent = "Tracking";
      setMiniStatus("Track");
    }
  }

  updateMetrics(openScore, state.targetExplosion);
}

function animateCurtain(time) {
  state.currentExplosion += (state.targetExplosion - state.currentExplosion) * 0.055;
  state.currentSpinX += (state.targetSpinX - state.currentSpinX) * 0.05;
  state.currentSpinY += (state.targetSpinY - state.currentSpinY) * 0.05;
  state.currentSpinVelocityX += (state.targetSpinVelocityX - state.currentSpinVelocityX) * 0.12;
  state.currentSpinVelocityY += (state.targetSpinVelocityY - state.currentSpinVelocityY) * 0.12;
  state.currentOrbitTurnY += (state.targetOrbitTurnY - state.currentOrbitTurnY) * 0.09;
  state.currentFieldX += (state.targetFieldX - state.currentFieldX) * 0.12;
  state.currentFieldY += (state.targetFieldY - state.currentFieldY) * 0.12;
  state.targetSpinVelocityX *= 0.9;
  state.targetSpinVelocityY *= 0.9;
  state.currentSpinVelocityX *= 0.985;
  state.currentSpinVelocityY *= 0.985;

  particleField.rotation.x += state.currentSpinVelocityX * 0.018;
  particleField.rotation.y +=
    0.0018 +
    state.currentSpinY * 0.08 +
    state.currentSpinVelocityY * 0.024 +
    (state.currentOrbitTurnY - state.appliedOrbitTurnY);
  state.appliedOrbitTurnY = state.currentOrbitTurnY;
  particleField.rotation.x += (0.06 + state.currentSpinX - particleField.rotation.x) * 0.05;
  particleField.rotation.z = Math.sin(time * 0.12) * 0.04;
  particleField.position.x = Math.sin(time * 0.08) * 0.18 + state.currentFieldX;
  particleField.position.y = state.currentFieldY;

  ambientSystem.rotation.y += 0.0006 + state.currentExplosion * 0.0012;
  ambientSystem.rotation.x = Math.sin(time * 0.08) * 0.06;

  bloomLight.position.x = 12 + Math.sin(time * 0.18) * 3.6;
  bloomLight.position.y = 10 + Math.cos(time * 0.14) * 2.6;
  fillLight.position.x = 18 + Math.cos(time * 0.16) * 2.4;
  fillLight.position.y = -6 + Math.sin(time * 0.2) * 2.4;
  bloomLight.intensity = 9.4 + state.currentExplosion * 7.8;
  fillLight.intensity = 7 + state.currentExplosion * 4.4;

  mainMaterial.size = 0.12 + state.currentExplosion * 0.24;
  glowMaterial.size = 0.44 + state.currentExplosion * 0.72;
  glowMaterial.opacity = 0.34 + state.currentExplosion * 0.28;

  const localRadius = 5.4;
  const localPush = 0.45 + state.currentExplosion * 1.25;

  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const i3 = i * 3;
    const phase = phases[i];
    const breath =
      Math.sin(time * 0.86 + phase) * 0.16 +
      Math.cos(time * 0.44 + phase * 1.7) * 0.09;
    const shimmer = Math.sin(time * 1.7 + phase) * 0.18;
    const drift = 0.22 + state.currentExplosion * 0.54;
    const explode = state.currentExplosion * (2.4 + Math.sin(time * 1.28 + phase) * 0.45);

    let targetX =
      baseTargets[i3] +
      driftVectors[i3] * breath * drift +
      explodeVectors[i3] * explode;
    let targetY =
      baseTargets[i3 + 1] +
      driftVectors[i3 + 1] * breath * drift +
      explodeVectors[i3 + 1] * explode;
    let targetZ =
      baseTargets[i3 + 2] +
      driftVectors[i3 + 2] * breath * drift * 0.8 +
      explodeVectors[i3 + 2] * explode;

    const dx = targetX - state.interactionWorldX;
    const dy = targetY - state.interactionWorldY;
    const dist = Math.hypot(dx, dy);
    const influence = Math.max(0, 1 - dist / localRadius) * state.interactionStrength;
    const push = influence * influence * localPush;

    if (push > 0) {
      targetX += dx * push * 0.38;
      targetY += dy * push * 0.28;
      targetZ += (0.3 + shimmer) * push * 0.8;
    }

    velocities[i3] = velocities[i3] * 0.9 + (targetX - positions[i3]) * 0.028;
    velocities[i3 + 1] = velocities[i3 + 1] * 0.9 + (targetY - positions[i3 + 1]) * 0.028;
    velocities[i3 + 2] = velocities[i3 + 2] * 0.9 + (targetZ - positions[i3 + 2]) * 0.028;

    positions[i3] += velocities[i3];
    positions[i3 + 1] += velocities[i3 + 1];
    positions[i3 + 2] += velocities[i3 + 2];

    glowPositions[i3] += (positions[i3] - glowPositions[i3]) * 0.075;
    glowPositions[i3 + 1] += (positions[i3 + 1] - glowPositions[i3 + 1]) * 0.075;
    glowPositions[i3 + 2] += (positions[i3 + 2] - glowPositions[i3 + 2]) * 0.075;
  }

  mainGeometry.attributes.position.needsUpdate = true;
  glowGeometry.attributes.position.needsUpdate = true;
}

function buildSphere() {
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const i3 = i * 3;
    const point = createSpherePoint(i, PARTICLE_COUNT);
    baseTargets[i3] = point.position.x;
    baseTargets[i3 + 1] = point.position.y;
    baseTargets[i3 + 2] = point.position.z;
    positions[i3] = point.position.x;
    positions[i3 + 1] = point.position.y;
    positions[i3 + 2] = point.position.z;
    glowPositions[i3] = point.position.x;
    glowPositions[i3 + 1] = point.position.y;
    glowPositions[i3 + 2] = point.position.z;

    driftVectors[i3] = point.drift.x;
    driftVectors[i3 + 1] = point.drift.y;
    driftVectors[i3 + 2] = point.drift.z;
    explodeVectors[i3] = point.explode.x;
    explodeVectors[i3 + 1] = point.explode.y;
    explodeVectors[i3 + 2] = point.explode.z;

    colors[i3] = point.color.r;
    colors[i3 + 1] = point.color.g;
    colors[i3 + 2] = point.color.b;
    phases[i] = Math.random() * Math.PI * 2;
  }

  mainGeometry.attributes.position.needsUpdate = true;
  mainGeometry.attributes.color.needsUpdate = true;
  glowGeometry.attributes.position.needsUpdate = true;
  glowGeometry.attributes.color.needsUpdate = true;
}

function createSpherePoint(index, total) {
  const shell = fibonacciSphere(index, total, 6.3);
  const normal = shell.clone().normalize();
  const lat = Math.asin(normal.y);
  const lon = Math.atan2(normal.z, normal.x);
  const undulation =
    Math.sin(lon * 4.2 + lat * 2.0) * 0.05 +
    Math.cos(lat * 6.2) * 0.025 +
    Math.sin(lon * 1.8 - lat * 5.0) * 0.018;
  const radius = 6.05 + undulation;
  const position = normal.clone().multiplyScalar(radius);

  const drift = randomOnSphere();
  const explode = normal
    .clone()
    .multiplyScalar(1.8 + Math.random() * 2.4)
    .add(randomOnSphere().multiplyScalar(0.18 + Math.random() * 0.32));

  const brightness = 0.84 + Math.random() * 0.16;
  const color = new THREE.Color(brightness, brightness, brightness);

  return { position, color, drift, explode };
}

function fibonacciSphere(index, total, radius) {
  const offset = 2 / total;
  const increment = Math.PI * (3 - Math.sqrt(5));
  const y = ((index * offset) - 1) + offset / 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const phi = index * increment;
  return new THREE.Vector3(
    Math.cos(phi) * r * radius,
    y * radius,
    Math.sin(phi) * r * radius
  );
}

function drawHandOverlay(result) {
  const ctx = overlay.getContext("2d");
  if (!ctx) return;

  resizeOverlay();
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  const hand = result?.landmarks?.[0];
  if (!hand) return;

  ctx.lineWidth = 1.9;
  ctx.strokeStyle = "rgba(120, 195, 255, 0.88)";
  ctx.fillStyle = "rgba(177, 223, 255, 0.92)";

  HAND_CONNECTIONS.forEach(([from, to]) => {
    const start = hand[from];
    const end = hand[to];
    ctx.beginPath();
    ctx.moveTo((1 - start.x) * overlay.width, start.y * overlay.height);
    ctx.lineTo((1 - end.x) * overlay.width, end.y * overlay.height);
    ctx.stroke();
  });

  hand.forEach((point) => {
    ctx.beginPath();
    ctx.arc((1 - point.x) * overlay.width, point.y * overlay.height, 3.1, 0, Math.PI * 2);
    ctx.fill();
  });
}

function updateMetrics(open, spread) {
  if (openValue) openValue.textContent = `${Math.round(open * 100)}%`;
  if (spreadValue) spreadValue.textContent = `${Math.round(spread * 100)}%`;
}

function setStatus(message) {
  if (statusText) statusText.textContent = message;
  if (cameraState) cameraState.textContent = message;
}

function setMiniStatus(message) {
  if (miniStatus) miniStatus.textContent = message;
}

function resizeOverlay() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (overlay.width !== width || overlay.height !== height) {
    overlay.width = width;
    overlay.height = height;
  }
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  resizeOverlay();
}

function palmCenter(hand) {
  const ids = [0, 5, 9, 13, 17];
  const total = ids.reduce(
    (acc, id) => {
      acc.x += hand[id].x;
      acc.y += hand[id].y;
      return acc;
    },
    { x: 0, y: 0 }
  );
  return { x: total.x / ids.length, y: total.y / ids.length };
}

function estimateOpenValue(hand) {
  const palmWidth = dist3D(hand[5], hand[17]) || 0.08;
  const tips = [4, 8, 12, 16, 20];
  const center = palmCenter(hand);
  const avgDistance =
    tips.reduce((sum, id) => {
      const point = hand[id];
      return sum + Math.hypot(point.x - center.x, point.y - center.y);
    }, 0) / tips.length;
  return clamp((avgDistance / (palmWidth * 2.05) - 0.2) / 0.72, 0, 1);
}

function estimateFistValue(hand) {
  const wrist = hand[0];
  const tips = [8, 12, 16, 20];
  const bases = [5, 9, 13, 17];
  let compact = 0;
  for (let i = 0; i < tips.length; i += 1) {
    const tipDist = dist3D(hand[tips[i]], wrist);
    const baseDist = dist3D(hand[bases[i]], wrist);
    compact += 1 - clamp((tipDist - baseDist * 0.8) / (baseDist * 0.9), 0, 1);
  }
  return compact / tips.length;
}

function dist3D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function randomOnSphere() {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  return new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  );
}

function createParticleTexture() {
  const size = 128;
  const canvasEl = document.createElement("canvas");
  canvasEl.width = size;
  canvasEl.height = size;
  const ctx = canvasEl.getContext("2d");

  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.22, "rgba(255,255,255,0.98)");
  gradient.addColorStop(0.55, "rgba(255,255,255,0.42)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvasEl);
  texture.needsUpdate = true;
  return texture;
}

function isLikelyEmbeddedBrowser() {
  const ua = navigator.userAgent || "";
  return /WebView|wv|Codex/i.test(ua);
}
