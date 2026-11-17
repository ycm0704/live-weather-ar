import { ExpressionGate, projectFace, readFace } from "./expressions.mjs?v=31";
import { WeatherEffects } from "./effects.mjs?v=33";
import { createTracker } from "./tracker.mjs";
import { initLiveRoom } from "./live-room.mjs?v=11";

const $ = id => document.getElementById(id);
const stage = $("stage");
const video = $("camera");
const gate = new ExpressionGate();
const effects = new WeatherEffects($("effects"), matchMedia("(prefers-reduced-motion: reduce)").matches);
const fireworkVisual = globalThis.createFireworkComposition($("firework-visual"), {
  autoplay: false,
  loop: false,
  interactive: false,
  transparent: true,
  flowerSize: 1,
  onCollision: () => { effects.hits += 1; },
});
const frame = document.createElement("canvas");
const frameContext = frame.getContext("2d");
const cameraButton = $("camera-toggle");
const pointer = { x: 0.5, y: 0.51 };
let session = null;
let request = 0;
let lastFrame = 0;
let metricsAt = 0;
let frames = 0;
let previewRainUntil = 0;

function status(message) {
  $("status").textContent = message;
}

function cameraUI(label, button, message) {
  $("camera-state").textContent = label;
  $("camera-button-text").textContent = button;
  cameraButton.dataset.state = label.toLowerCase();
  cameraButton.setAttribute("aria-pressed", String(label !== "OFF"));
  cameraButton.setAttribute("aria-busy", String(label === "REQUEST" || label === "STARTING" || label === "LOADING"));
  cameraButton.title = button;
  if (message) status(message);
}

function resize() {
  const { width, height } = stage.getBoundingClientRect();
  effects.resize(width, height);
  fireworkVisual.resize();
  wake();
}
new ResizeObserver(resize).observe(stage);
resize();

function stopCamera(message = "摄像头已关闭。可继续模拟预览。") {
  const previous = session;
  session = null;
  previous?.stream?.getTracks().forEach(track => track.stop());
  previous?.worker?.terminate();
  previous?.tracker?.close();
  clearTimeout(previous?.initTimer);
  video.pause();
  video.srcObject = null;
  video.hidden = true;
  stage.classList.remove("live");
  stage.classList.remove("effect-active");
  $("mode-label").textContent = "模拟预览";
  cameraUI("OFF", "开启摄像头", message);
  effects.clear();
  fireworkVisual.stop();
  fireworkVisual.setHead(null);
  gate.reset();
  previewRainUntil = 0;
  updateMetrics(0, true);
  wake();
}

function target() {
  if (session?.stream) {
    const face = session.face;
    return face && video.videoWidth && video.videoHeight
      ? projectFace(face, video.videoWidth, video.videoHeight, effects.width, effects.height)
      : null;
  }
  const radius = Math.min(effects.width, effects.height) * 0.125;
  return { x: pointer.x * effects.width, y: pointer.y * effects.height, rx: radius, ry: radius * 1.23 };
}

function triggerFire(now) {
  if (fireworkVisual.isPlaying()) return;
  fireworkVisual.trigger();
  previewRainUntil = 0;
  wake();
}

function acceptDetection(current, face, ms, at) {
  current.pending = false;
  if (document.hidden || performance.now() - at > 1000) return;
  current.ms = ms;
  if (!face) return;
  current.face = face;
  current.faceAt = at;
  const state = gate.update(face.smile, face.jaw, at);
  current.warming = state.warming;
  current.raining = state.rain;
  if (state.burst) triggerFire(performance.now());
}

function trackingReady(current, engine) {
  current.engine = engine;
  current.ready = true;
  cameraUI("LIVE", "关闭摄像头", "正脸入镜并保持自然表情，校准后微笑下雨，大笑触发烟花。");
}

async function useMainThread(current) {
  clearTimeout(current.initTimer);
  current.worker?.terminate();
  current.worker = null;
  current.ready = false;
  current.pending = false;
  cameraUI("LOADING", "取消开启", "正在准备兼容模式…");
  current.initTimer = setTimeout(() => {
    if (session === current) stopCamera("模型初始化超时。请重试，或使用模拟预览。");
  }, 20000);
  let tracker;
  try {
    try {
      tracker = await createTracker("GPU");
    } catch {
      if (session !== current) return;
      tracker = await createTracker("CPU");
    }
    if (session !== current) {
      tracker.close();
      return;
    }
    clearTimeout(current.initTimer);
    current.tracker = tracker;
    trackingReady(current, "兼容模式");
  } catch (error) {
    console.warn("Face tracking could not initialize", error);
    if (session === current) stopCamera("人脸模型加载失败。请重试，或使用模拟预览。");
  }
}

function startTracking(current) {
  if (!window.Worker || !window.createImageBitmap || !window.OffscreenCanvas) {
    useMainThread(current);
    return;
  }
  try {
    const worker = new Worker(new URL("./tracking-worker.js?v=27", import.meta.url));
    current.worker = worker;
    worker.onmessage = ({ data }) => {
      if (session !== current || current.worker !== worker) return;
      if (data.type === "ready") {
        clearTimeout(current.initTimer);
        trackingReady(current, "Worker");
      } else if (data.type === "result") {
        acceptDetection(current, data.face, data.ms, data.at);
      } else {
        console.warn("Face tracking worker switched to compatibility mode", data.message);
        useMainThread(current);
      }
    };
    worker.onerror = () => {
      if (session === current && current.worker === worker) useMainThread(current);
    };
    current.initTimer = setTimeout(() => {
      if (session === current && current.worker === worker) useMainThread(current);
    }, 15000);
    worker.postMessage({ type: "init" });
  } catch {
    useMainThread(current);
  }
}

async function startCamera() {
  if (session) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    status("请在 HTTPS 或 localhost 上使用支持摄像头的浏览器。");
    return;
  }
  const current = { face: null, faceAt: 0, lastVideoTime: -1, lastAt: -Infinity };
  session = current;
  cameraUI("REQUEST", "取消开启", "请在浏览器中允许使用摄像头。");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 24 } },
    });
    if (session !== current) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    current.stream = stream;
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      if (session === current) stopCamera("摄像头已断开。请重新开启。");
    });
    video.srcObject = stream;
    video.hidden = false;
    video.autoplay = true;
    cameraUI("STARTING", "取消开启", "摄像头已连接，正在显示画面…");
    await video.play();
    if (session !== current) return;
    stage.classList.add("live");
    effects.clear();
    gate.reset();
    previewRainUntil = 0;
    $("mode-label").textContent = "实时摄像头";
    cameraUI("LOADING", "取消开启", "正在加载本机人脸模型…");
    startTracking(current);
    wake();
  } catch (error) {
    if (session !== current) return;
    if (error.name === "NotAllowedError") stopCamera("摄像头未授权。可在地址栏权限中允许后重试。");
    else if (error.name === "NotFoundError") stopCamera("没有找到摄像头。可继续模拟预览。");
    else stopCamera("摄像头无法启动。请检查是否被其他应用占用。");
  }
}

function sample(current, now) {
  if (!current.ready || video.readyState < 2) return;
  if (current.pending) {
    if (now - current.lastAt > 5000 && current.worker) useMainThread(current);
    return;
  }
  const minInterval = current.worker ? Math.max(120, (current.ms || 0) * 1.45) : Math.max(200, (current.ms || 0) * 4);
  if (now - current.lastAt < minInterval || current.lastVideoTime === video.currentTime) return;
  current.lastAt = now;
  current.lastVideoTime = video.currentTime;
  const scale = Math.min(1, 192 / Math.max(video.videoWidth, video.videoHeight));
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  if (frame.width !== width || frame.height !== height) {
    frame.width = width;
    frame.height = height;
  }
  frameContext.drawImage(video, 0, 0, width, height);
  const worker = current.worker;
  if (worker) {
    current.pending = true;
    createImageBitmap(frame).then(bitmap => {
      if (session !== current || current.worker !== worker || document.hidden) {
        bitmap.close();
        current.pending = false;
        return;
      }
      try {
        worker.postMessage({ bitmap, at: now }, [bitmap]);
      } catch {
        bitmap.close();
        if (session === current && current.worker === worker) useMainThread(current);
      }
    }).catch(() => {
      if (session === current && current.worker === worker) useMainThread(current);
    });
  } else {
    try {
      const start = performance.now();
      const face = readFace(current.tracker.detectForVideo(frame, now));
      acceptDetection(current, face, performance.now() - start, now);
    } catch (error) {
      console.warn("Face tracking interrupted", error);
      stopCamera("推理中断。请重启摄像头，或使用模拟预览。");
    }
  }
}

function updateMetrics(fps, idle) {
  $("fps").textContent = idle ? "—" : String(fps);
  $("hits").textContent = String(effects.hits);
  $("inference").textContent = session?.ms == null ? "—" : session.ms.toFixed(0);
  $("tracking-state").textContent = session?.stream
    ? session.face ? session.warming ? "校准中" : "已追踪 · " + session.engine : "寻找人脸"
    : "模拟头部";
  for (const name of ["smile", "jaw"]) {
    const value = session?.face ? gate[name] : 0;
    $(name).value = value;
    $(name + "-value").textContent = session?.face ? value.toFixed(2) : "—";
  }
}

function wake() {
  if (!request && !document.hidden) request = requestAnimationFrame(render);
}

function render(now) {
  request = 0;
  const dt = Math.min(0.033, Math.max(0.001, (now - (lastFrame || now - 16.7)) / 1000));
  lastFrame = now;
  if (session?.stream) {
    if (session.face && now - session.faceAt > 1200) {
      session.face = null;
      session.raining = false;
      gate.reset();
    }
    sample(session, now);
  }
  const fire = fireworkVisual.isPlaying();
  const rain = !fire && (now < previewRainUntil || session?.raining);
  stage.classList.toggle("effect-active", Boolean(fire || rain));
  const currentTarget = target();
  fireworkVisual.setHead(currentTarget);
  effects.step(dt, now, rain, currentTarget, !session?.stream, $("show-collider").checked);
  const scene = fire ? "FIREWORKS" : rain ? "RAIN" : "STANDBY";
  if ($("scene-name").textContent !== scene) {
    $("scene-name").textContent = scene;
    $("scene-detail").textContent = fire ? "原视觉烟花演出" : rain ? "微笑雨幕" : "等待触发";
  }
  const active = Boolean(session?.stream || effects.playing || rain || fire);
  if (active) {
    if (!metricsAt) metricsAt = now;
    else frames++;
    if (now - metricsAt >= 500) {
      updateMetrics(Math.round(frames * 1000 / (now - metricsAt)), false);
      metricsAt = now;
      frames = 0;
    }
    wake();
  } else {
    updateMetrics(0, true);
    lastFrame = metricsAt = frames = 0;
  }
}

cameraButton.addEventListener("click", event => {
  event.preventDefault();
  if (session) stopCamera("摄像头启动已取消。可再次点击开启。");
  else void startCamera();
});
$("preview-rain").addEventListener("click", () => {
  fireworkVisual.stop();
  previewRainUntil = performance.now() + 2300;
  wake();
});
$("preview-fire").addEventListener("click", () => triggerFire(performance.now()));
$("show-collider").addEventListener("change", wake);

initLiveRoom(stage);

function moveAvatar(event) {
  if (event.target.closest?.("button, form, .gift-tray")) return;
  if (session?.stream || (event.pointerType === "touch" && event.type === "pointermove" && !event.buttons)) return;
  const rect = stage.getBoundingClientRect();
  pointer.x = Math.max(0.14, Math.min(0.86, (event.clientX - rect.left) / rect.width));
  pointer.y = Math.max(0.21, Math.min(0.79, (event.clientY - rect.top) / rect.height));
  if (!effects.playing) effects.hasHead = false;
  wake();
}
stage.addEventListener("pointermove", moveAvatar);
stage.addEventListener("pointerdown", event => {
  if (!session?.stream && event.pointerType === "touch" && !event.target.closest?.("button, form, .gift-tray")) {
    stage.setPointerCapture(event.pointerId);
  }
  moveAvatar(event);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelAnimationFrame(request);
    request = 0;
    lastFrame = metricsAt = frames = 0;
    if (session) {
      session.face = null;
      session.raining = false;
      gate.reset();
    }
  } else wake();
});
window.addEventListener("pagehide", () => {
  if (session) stopCamera();
});
