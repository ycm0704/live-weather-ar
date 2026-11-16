(function (global) {
  "use strict";

  function createFireworkComposition(canvas, options) {
    options = options || {};

    var transparent = options.transparent === true;
    var looping = options.loop !== false;
    var active = options.autoplay !== false;
    var flowerSize = options.flowerSize == null ? 0.52 : options.flowerSize;
    var ctx = canvas.getContext("2d", { alpha: transparent });
    var source = new Image();
    var SOURCE_W = 937;
    var SOURCE_H = 1678;
    var SHOW_DURATION = 9.6;
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var width = 0;
    var height = 0;
    var sceneScale = 1;
    var offsetX = 0;
    var offsetY = 0;
    var ready = false;
    var started = performance.now();
    var lastFrame = 0;
    var frameHandle = 0;
    var decorations = null;
    var flowers = [];
    var headTarget = null;
    var headState = null;

    // Bounds measured from the supplied 937 x 1678 artwork. The original
    // pixels are copied into sprites; no flower is redrawn in code.
    var flowerSpecs = [
      { name: "top-radial", x: 278, y: 282, rx: 218, ry: 218, delay: 0.05, phase: 0.2 },
      { name: "mint-star", x: 782, y: 260, rx: 122, ry: 125, delay: 0.26, phase: 1.8 },
      { name: "mint-radial", x: 679, y: 545, rx: 176, ry: 165, delay: 0.40, phase: 3.1 },
      { name: "red-flower", x: 194, y: 653, rx: 119, ry: 121, delay: 0.18, phase: 4.7 },
      { name: "candy-pair", x: 727, y: 828, rx: 129, ry: 119, delay: 0.58, phase: 2.5 },
      { name: "large-radial", x: 314, y: 1002, rx: 244, ry: 238, delay: 0.14, phase: 5.4 },
      { name: "purple-radial", x: 757, y: 1098, rx: 158, ry: 151, delay: 0.48, phase: 0.9 },
      { name: "yellow-star", x: 535, y: 1276, rx: 73, ry: 72, delay: 0.68, phase: 3.8 },
      { name: "blue-disc", x: 255, y: 1430, rx: 185, ry: 177, delay: 0.34, phase: 2.1 },
      { name: "crystal-star", x: 696, y: 1418, rx: 119, ry: 109, delay: 0.76, phase: 4.2 },
    ];

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function smooth(value) {
      var t = clamp(value, 0, 1);
      return t * t * (3 - 2 * t);
    }

    function resize() {
      var box = canvas.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = Math.max(1, box.width);
      height = Math.max(1, box.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sceneScale = Math.max(width / SOURCE_W, height / SOURCE_H);
      offsetX = (width - SOURCE_W * sceneScale) / 2;
      offsetY = (height - SOURCE_H * sceneScale) / 2;
      if (!active) clear();
    }

    function clear() {
      if (transparent) ctx.clearRect(0, 0, width, height);
      else {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);
      }
    }

    function keyBlackToAlpha(imageData) {
      var data = imageData.data;
      for (var i = 0; i < data.length; i += 4) {
        var light = Math.max(data[i], data[i + 1], data[i + 2]);
        var alpha = clamp((light - 3) * 9, 0, 255);
        data[i + 3] = Math.min(data[i + 3], alpha);
      }
      return imageData;
    }

    function makeTransparentSource() {
      var work = document.createElement("canvas");
      work.width = SOURCE_W;
      work.height = SOURCE_H;
      var paint = work.getContext("2d", { willReadFrequently: true });
      paint.drawImage(source, 0, 0, SOURCE_W, SOURCE_H);
      var pixels = paint.getImageData(0, 0, SOURCE_W, SOURCE_H);
      paint.putImageData(keyBlackToAlpha(pixels), 0, 0);
      return work;
    }

    function makeFlowerSprite(transparentSource, spec) {
      var padding = 8;
      var sx = Math.max(0, Math.floor(spec.x - spec.rx - padding));
      var sy = Math.max(0, Math.floor(spec.y - spec.ry - padding));
      var sw = Math.min(SOURCE_W - sx, Math.ceil(spec.rx * 2 + padding * 2));
      var sh = Math.min(SOURCE_H - sy, Math.ceil(spec.ry * 2 + padding * 2));
      var sprite = document.createElement("canvas");
      sprite.width = sw;
      sprite.height = sh;
      var paint = sprite.getContext("2d");
      paint.drawImage(transparentSource, sx, sy, sw, sh, 0, 0, sw, sh);
      paint.globalCompositeOperation = "destination-in";
      paint.fillStyle = "#fff";
      paint.beginPath();
      paint.ellipse(spec.x - sx, spec.y - sy, spec.rx + 5, spec.ry + 5, 0, 0, Math.PI * 2);
      paint.fill();
      return {
        spec: spec,
        image: sprite,
        centerX: spec.x - sx,
        centerY: spec.y - sy,
        offsetX: 0,
        offsetY: 0,
        avoidScale: 1,
        touching: false,
      };
    }

    function makeDecorations(transparentSource) {
      var layer = document.createElement("canvas");
      layer.width = SOURCE_W;
      layer.height = SOURCE_H;
      var paint = layer.getContext("2d");
      paint.drawImage(transparentSource, 0, 0);
      paint.globalCompositeOperation = "destination-out";
      for (var i = 0; i < flowerSpecs.length; i++) {
        var spec = flowerSpecs[i];
        paint.beginPath();
        paint.ellipse(spec.x, spec.y, spec.rx * 1.06, spec.ry * 1.06, 0, 0, Math.PI * 2);
        paint.fill();
      }
      return layer;
    }

    function prepareAssets() {
      var transparentSource = makeTransparentSource();
      decorations = makeDecorations(transparentSource);
      flowers = flowerSpecs.map(function (spec) {
        return makeFlowerSprite(transparentSource, spec);
      });
      ready = true;
      if (active) schedule();
    }

    function schedule() {
      if (!frameHandle && active && !document.hidden) {
        frameHandle = requestAnimationFrame(render);
      }
    }

    function updateHead(dt) {
      if (!headTarget) {
        headState = null;
        return;
      }
      if (!headState) {
        headState = { x: headTarget.x, y: headTarget.y, rx: headTarget.rx, ry: headTarget.ry };
        return;
      }
      var follow = 1 - Math.exp(-dt * 12);
      headState.x += (headTarget.x - headState.x) * follow;
      headState.y += (headTarget.y - headState.y) * follow;
      headState.rx += (headTarget.rx - headState.rx) * follow;
      headState.ry += (headTarget.ry - headState.ry) * follow;
    }

    // Proximity produces a bounded nudge and scale reduction instead of
    // starting particle simulation or unbounded spring physics.
    function updateFlowerAvoidance(flower, dt, visibleScale) {
      var targetX = 0;
      var targetY = 0;
      var targetScale = 1;
      var touching = false;
      if (headState) {
        var spec = flower.spec;
        var centerX = offsetX + spec.x * sceneScale + flower.offsetX;
        var centerY = offsetY + spec.y * sceneScale + flower.offsetY;
        var radiusX = spec.rx * sceneScale * visibleScale * 0.78;
        var radiusY = spec.ry * sceneScale * visibleScale * 0.78;
        var reachX = headState.rx * 1.03 + radiusX;
        var reachY = headState.ry * 1.03 + radiusY;
        var dx = centerX - headState.x;
        var dy = centerY - headState.y;
        var distance = Math.hypot(dx / Math.max(1, reachX), dy / Math.max(1, reachY));
        if (distance < 1) {
          touching = true;
          var length = Math.max(1, Math.hypot(dx, dy));
          var strength = 1 - distance;
          var maxNudge = Math.min(width, height) * 0.055;
          targetX = dx / length * maxNudge * strength;
          targetY = dy / length * maxNudge * strength;
          targetScale = 1 - strength * 0.18;
        }
      }
      var response = 1 - Math.exp(-dt * 10);
      flower.offsetX += (targetX - flower.offsetX) * response;
      flower.offsetY += (targetY - flower.offsetY) * response;
      flower.avoidScale += (targetScale - flower.avoidScale) * response;
      if (touching && !flower.touching && typeof options.onCollision === "function") {
        options.onCollision(flower.spec.name);
      }
      flower.touching = touching;
    }

    function flowerState(spec, elapsed) {
      var local = elapsed - spec.delay;
      if (local <= 0) return { scale: 0, alpha: 0 };
      var enter = smooth(local / 0.52);
      var exitStart = SHOW_DURATION - 1.15 + spec.delay * 0.22;
      var exit = 1 - smooth((elapsed - exitStart) / 0.75);
      var pulse = reduced ? 1 : 1 + Math.sin(local * 1.55 + spec.phase) * 0.035;
      return {
        scale: flowerSize * (0.18 + 0.82 * enter) * pulse * Math.max(0.72, exit),
        alpha: enter * exit,
      };
    }

    function drawDecorations(elapsed) {
      if (!decorations) return;
      var enter = smooth(elapsed / 0.42);
      var exit = 1 - smooth((elapsed - (SHOW_DURATION - 0.8)) / 0.65);
      ctx.save();
      ctx.globalAlpha = enter * exit * 0.94;
      ctx.drawImage(decorations, offsetX, offsetY, SOURCE_W * sceneScale, SOURCE_H * sceneScale);
      ctx.restore();
    }

    function drawFlower(flower, state, dt) {
      if (state.alpha <= 0 || state.scale <= 0) return;
      updateFlowerAvoidance(flower, dt, state.scale);
      var scale = state.scale * flower.avoidScale;
      var spec = flower.spec;
      var drawW = flower.image.width * sceneScale * scale;
      var drawH = flower.image.height * sceneScale * scale;
      var centerX = flower.centerX / flower.image.width;
      var centerY = flower.centerY / flower.image.height;
      ctx.save();
      ctx.globalAlpha = state.alpha;
      ctx.translate(offsetX + spec.x * sceneScale + flower.offsetX, offsetY + spec.y * sceneScale + flower.offsetY);
      ctx.drawImage(flower.image, -drawW * centerX, -drawH * centerY, drawW, drawH);
      ctx.restore();
    }

    function render(now) {
      frameHandle = 0;
      clear();
      if (!active) return;
      if (!ready) {
        schedule();
        return;
      }

      var elapsed = reduced ? 2.4 : (now - started) / 1000;
      if (!looping && elapsed >= SHOW_DURATION) {
        active = false;
        clear();
        return;
      }
      if (looping) elapsed %= SHOW_DURATION;

      var dt = Math.min(0.033, Math.max(0.001, (now - (lastFrame || now - 16.7)) / 1000));
      lastFrame = now;
      updateHead(dt);
      drawDecorations(elapsed);
      for (var i = 0; i < flowers.length; i++) {
        drawFlower(flowers[i], flowerState(flowers[i].spec, elapsed), dt);
      }
      schedule();
    }

    function trigger() {
      active = true;
      started = performance.now();
      lastFrame = 0;
      for (var i = 0; i < flowers.length; i++) {
        flowers[i].offsetX = 0;
        flowers[i].offsetY = 0;
        flowers[i].avoidScale = 1;
        flowers[i].touching = false;
      }
      schedule();
    }

    function stop() {
      active = false;
      if (frameHandle) cancelAnimationFrame(frameHandle);
      frameHandle = 0;
      clear();
    }

    function setHead(target) {
      headTarget = target ? { x: target.x, y: target.y, rx: target.rx, ry: target.ry } : null;
      if (!target) headState = null;
    }

    if (options.interactive !== false) canvas.addEventListener("pointerdown", trigger);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && frameHandle) {
        cancelAnimationFrame(frameHandle);
        frameHandle = 0;
      } else schedule();
    });
    source.addEventListener("load", prepareAssets);
    source.addEventListener("error", function () {
      clear();
      ctx.fillStyle = "#fff";
      ctx.font = "14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("未能载入 firework-visual.png", width / 2, height / 2);
    });

    resize();
    source.src = './firework-visual.png';
    if (active) schedule();

    return { trigger: trigger, stop: stop, resize: resize, setHead: setHead };
  }

  global.createFireworkComposition = createFireworkComposition;
  var previewCanvas = document.getElementById("fireworks");
  if (previewCanvas) {
    createFireworkComposition(previewCanvas, {
      autoplay: true,
      loop: true,
      interactive: true,
      flowerSize: 0.52,
    });
  }
})(globalThis);
