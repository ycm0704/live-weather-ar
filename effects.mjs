import { bounceOffHead } from "./physics.mjs";

const TAU = Math.PI * 2;
const colors = ["#ff668e", "#9af5cf", "#d7b3ff", "#ffe990", "#8ae9f4"];
const fireworkPatterns = [
  {
    rings: [
      { count: 12, inner: .16, length: .28, width: .105, phase: .00 },
      { count: 18, inner: .38, length: .35, width: .125, phase: .08 },
      { count: 24, inner: .67, length: .43, width: .145, phase: .00 },
    ],
  },
  {
    rings: [
      { count: 14, inner: .12, length: .34, width: .095, phase: .00 },
      { count: 20, inner: .40, length: .30, width: .115, phase: .05 },
      { count: 18, inner: .66, length: .50, width: .16, phase: .10 },
    ],
  },
  {
    rings: [
      { count: 10, inner: .14, length: .30, width: .12, phase: .00 },
      { count: 16, inner: .39, length: .40, width: .13, phase: .06 },
      { count: 22, inner: .70, length: .36, width: .145, phase: .02 },
    ],
  },
];
const rainColors = ["#dff7ff", "#c9efff", "#b8e9ff", "#a9e2ff", "#d5f4ff", "#bfefff"];
const range = (min, max) => min + (max - min) * Math.random();
const limit = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = value => {
  const t = limit(value, 0, 1);
  return t * t * (3 - 2 * t);
};
const outBack = value => {
  const t = limit(value, 0, 1) - 1;
  return 1 + 2.25 * t * t * t + 1.25 * t * t;
};

// Rings grow from the centre one by one, then extinguish from outside to inside.
// Exported so the visual timing can be regression-tested without a DOM canvas.
export function fireworkRingState(age, ringIndex, ringCount, spokeOffset = 0) {
  const appearAt = ringIndex * .105 + spokeOffset * .022;
  const grow = outBack((age - appearAt) / .38);
  const outerOrder = ringCount - 1 - ringIndex;
  const fadeAt = 1.22 + outerOrder * .20 + spokeOffset * .016;
  const alpha = 1 - smoothstep((age - fadeAt) / .24);
  return { grow: Math.max(0, grow), alpha: limit(alpha, 0, 1) };
}

export function fireworkCenterAlpha(age, ringCount) {
  return 1 - smoothstep((age - (1.22 + ringCount * .20)) / .27);
}

export class WeatherEffects {
  constructor(canvas, reducedMotion) {
    this.canvas = canvas;
    this.fireworkParts = this.makeFireworkParts();
    this.ctx = canvas.getContext("2d", { alpha: true });
    this.reducedMotion = reducedMotion;
    this.sparks = Array.from({ length: 180 }, () => ({ life: 0 }));
    this.drops = Array.from({ length: reducedMotion ? 12 : 22 }, () => ({}));
    this.rainSprites = this.makeRainSprites();
    const loadPieces = kind => {
      const pieces = Array.from({ length: 6 });
      for (let i = 0; i < pieces.length; i++) {
        const image = new Image();
        image.onload = () => { pieces[i] = this.tintRainPiece(image); };
        image.src = `./rain-clean/${kind}-${i}.png`;
        pieces[i] = image;
      }
      return pieces;
    };
    this.rainPieces = { drop: loadPieces("drop") };
    this.head = { x: 0, y: 0, rx: 1, ry: 1, vx: 0, vy: 0 };
    this.launches = [];
    this.bursts = [];
    this.rain = 0;
    this.hits = 0;
    this.lastHit = -Infinity;
    this.hasHead = false;
    this.sparkCount = 0;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.unit = Math.max(0.7, Math.min(width, height) / 460);
    const scale = Math.min(window.devicePixelRatio || 1, 1);
    this.canvas.width = Math.round(width * scale);
    this.canvas.height = Math.round(height * scale);
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.clear();
    for (const drop of this.drops) this.resetDrop(drop, true);

  }

  clear() {
    this.rain = 0;
    this.hasHead = false;
    this.launches.length = 0;
    this.bursts.length = 0;
    this.sparkCount = 0;
    this.lastHit = -Infinity;
    for (const spark of this.sparks) spark.life = 0;
  }

  makeFireworkParts() {
    return colors.map(color => {
      const ray = document.createElement("canvas"); ray.width = 32; ray.height = 128;
      const g = ray.getContext("2d");
      const grad = g.createLinearGradient(3, 0, 29, 0);
      grad.addColorStop(0, "#4d3b64"); grad.addColorStop(.12, color);
      grad.addColorStop(.43, "#fffdf0"); grad.addColorStop(.60, color); grad.addColorStop(1, "#4b365f");
      g.shadowColor = color; g.shadowBlur = 5;
      g.fillStyle = grad; g.beginPath(); g.roundRect(4, 3, 24, 122, 12); g.fill();
      g.shadowBlur = 0;
      const gloss = g.createLinearGradient(0, 0, 0, 128);
      gloss.addColorStop(0, "rgba(255,255,255,.72)"); gloss.addColorStop(.28, "rgba(255,255,255,.08)"); gloss.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gloss; g.beginPath(); g.roundRect(9, 8, 6, 105, 4); g.fill();
      const center = document.createElement("canvas"); center.width = center.height = 64;
      const c = center.getContext("2d");
      const sphere = c.createRadialGradient(23, 18, 2, 32, 32, 31);
      sphere.addColorStop(0, "#fffde0"); sphere.addColorStop(.3, color); sphere.addColorStop(1, "#463963");
      c.fillStyle = sphere; c.beginPath(); c.arc(32,32,30,0,TAU); c.fill();
      return {ray, center};
    });
  }

  makeRainSprites() {
    return rainColors.map(color => ["streak", "drop"].map(kind => {
      const c = document.createElement("canvas"); c.width = 64; c.height = 128;
      const g = c.getContext("2d");
      const gradient = g.createLinearGradient(14, 15, 50, 110);
      gradient.addColorStop(0, "#ffffff"); gradient.addColorStop(0.19, color);
      gradient.addColorStop(0.75, color); gradient.addColorStop(1, "#855da1");
      g.fillStyle = gradient; g.beginPath();
      if (kind === "streak") {
        g.roundRect(22, 5, 20, 118, 10);
      } else {
        g.moveTo(32, 4); g.bezierCurveTo(28, 26, 9, 66, 10, 86);
        g.bezierCurveTo(10, 119, 54, 119, 54, 86);
        g.bezierCurveTo(55, 66, 36, 26, 32, 4); g.closePath();
      }
      g.fill(); g.fillStyle = "rgba(255,255,255,.45)";
      g.beginPath(); g.ellipse(25, 68, 3, 14, 0.2, 0, TAU); g.fill();
      return c;
    }));
  }

  tintRainPiece(image) {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const g = canvas.getContext("2d", { willReadFrequently: true });
    g.drawImage(image, 0, 0);
    const pixels = g.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const r = pixels.data[i], green = pixels.data[i + 1], b = pixels.data[i + 2];
      const light = (r * .24 + green * .58 + b * .18) / 255;
      pixels.data[i] = Math.round(145 + light * 94);
      pixels.data[i + 1] = Math.round(205 + light * 48);
      pixels.data[i + 2] = 255;
    }
    g.putImageData(pixels, 0, 0);
    return canvas;
  }

  resetDrop(drop, scatter) {
    drop.x = range(12, this.width - 12);
    drop.y = scatter ? range(-this.height, this.height * 0.8) : range(-this.height * 0.5, -20);
    drop.color = Math.floor(range(0, rainColors.length));
    drop.kind = 1;
    drop.sample = Math.floor(range(0, 6));
    drop.size = range(1.05, 1.55) * this.unit;
    drop.speed = range(92, 165) * this.unit;
    drop.width = range(18, 25) * drop.size;
    drop.height = range(27, 38) * drop.size;
    drop.floor = this.height * range(0.88, 0.98);
    drop.fadeIn = scatter ? 1 : 0;
    drop.phase = range(0, TAU);
    drop.sway = range(5, 12) * this.unit;
    drop.tilt = 0;
  }

  launch(target) {
    const { width, height } = this;
    const head = target || { x: width / 2, y: height * 0.47, rx: width * 0.12, ry: height * 0.17 };
    const edge = Math.min(44, width * 0.12);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const x = limit(head.x + side * (head.rx + 74 * this.unit), edge, width - edge);
      const y = limit(head.y - head.ry * 0.42 - (i === 0 ? 31 : 64) * this.unit, 42, height * 0.7);
      this.launches.push({ x, y, from: x + side * 40, elapsed: -i * 0.16, color: i * 2 });
    }
  }

  burst(launch, head) {
    // Each flower is a single physical object so a moving head pushes the whole shape.
    for (let i = 0; i < 2; i++) {
      if (this.bursts.length >= 12) this.bursts.shift();
      const angle = i * Math.PI + range(-0.25, 0.25);
      this.bursts.push({
        x: launch.x + Math.cos(angle) * 14 * this.unit,
        y: launch.y + Math.sin(angle) * 14 * this.unit,
        vx: Math.cos(angle) * range(20, 60) * this.unit,
        vy: Math.sin(angle) * range(20, 60) * this.unit,
        radius: range(43, 60) * this.unit,
        pattern: Math.floor(range(0, fireworkPatterns.length)),
        rotation: range(0, TAU), spin: range(-0.7, 0.7),
        color: (launch.color + i) % colors.length,
        life: 2.35, maxLife: 2.35, age: 0,
      });
    }
  }

  updateHead(target, dt) {
    if (!target) {
      this.hasHead = false;
      return;
    }
    const head = this.head;
    if (!this.hasHead) {
      Object.assign(head, target, { vx: 0, vy: 0 });
      this.hasHead = true;
      return;
    }
    const weight = 1 - Math.exp(-dt * 22);
    const dx = (target.x - head.x) * weight;
    const dy = (target.y - head.y) * weight;
    head.x += dx;
    head.y += dy;
    head.vx = limit(dx / dt, -600, 600);
    head.vy = limit(dy / dt, -600, 600);
    head.rx += (target.rx - head.rx) * weight;
    head.ry += (target.ry - head.ry) * weight;
  }

  drawAvatar() {
    const { ctx, head: h } = this;
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.scale(h.rx, h.ry);
    ctx.beginPath();
    ctx.ellipse(0, 0, 1, 1, 0, 0, TAU);
    ctx.fillStyle = "#272a30";
    ctx.fill();
    ctx.strokeStyle = "#bfcbd1";
    ctx.lineWidth = 1.6 / h.rx;
    ctx.stroke();

    ctx.fillStyle = "#e1e8e7";
    ctx.beginPath();
    ctx.ellipse(-0.30, -0.14, 0.075, 0.095, 0, 0, TAU);
    ctx.ellipse(0.30, -0.14, 0.075, 0.095, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-0.27, 0.22);
    ctx.quadraticCurveTo(0, 0.52, 0.27, 0.22);
    ctx.strokeStyle = "#e1e8e7";
    ctx.lineWidth = 2.5 / h.rx;
    ctx.stroke();
    ctx.restore();
  }

  step(dt, now, raining, target, simulation, debug) {
    const { ctx, width, height, head } = this;
    ctx.clearRect(0, 0, width, height);
    this.updateHead(target, dt);
    if (simulation && this.hasHead) this.drawAvatar();

    this.rain = limit(this.rain + dt * (raining ? 4 : -2.7), 0, 1);
    if (this.rain > 0) {
      // Ambient elements are fully opaque once they have entered the frame.
      if (this.rain > 0) {
        for (const drop of this.drops) {
          drop.y += drop.speed * dt;
          drop.phase += dt * 1.35;
          drop.x += Math.sin(drop.phase) * drop.sway * dt;
          if (drop.y >= height + drop.height) this.resetDrop(drop, false);
          drop.fadeIn = Math.min(1, drop.fadeIn + dt * 3);
          const opacity = this.rain * drop.fadeIn;
          ctx.save(); ctx.globalAlpha = opacity;
          const piece = this.rainPieces.drop[drop.sample];
          ctx.translate(drop.x, drop.y - drop.height / 2);
          // The drop may drift sideways, but its 3D body always remains upright.
          if ((piece.complete && piece.naturalWidth) || piece.width) {
            ctx.drawImage(piece, -drop.width / 2, -drop.height / 2, drop.width, drop.height);
          } else ctx.drawImage(this.rainSprites[drop.color][1], -drop.width / 2, -drop.height / 2, drop.width, drop.height);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    }

    for (let i = this.launches.length - 1; i >= 0; i--) {
      const rocket = this.launches[i];
      rocket.elapsed += dt;
      if (rocket.elapsed < 0) continue;
      const progress = rocket.elapsed / 0.32;
      if (progress >= 1) {
        this.burst(rocket, this.hasHead ? head : { x: width / 2, y: height * 0.48 });
        this.launches.splice(i, 1);
      } else {
        const x = rocket.from + (rocket.x - rocket.from) * progress;
        const y = height + (rocket.y - height) * progress;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 22);
        ctx.strokeStyle = colors[rocket.color];
        ctx.lineWidth = 1.8 * this.unit;
        ctx.stroke();
      }
    }

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const flower = this.bursts[i];
      flower.life -= dt;
      flower.age += dt;
      if (flower.life <= 0) { this.bursts.splice(i, 1); continue; }
      const px = flower.x, py = flower.y;
      flower.vx *= Math.exp(-dt * 0.4);
      flower.vy = flower.vy * Math.exp(-dt * 0.4) + 9 * this.unit * dt;
      flower.x += flower.vx * dt;
      flower.y += flower.vy * dt;
      flower.rotation += flower.spin * dt;
      if (this.hasHead && bounceOffHead(flower, px, py, {
        ...head, rx: head.rx + flower.radius * 0.7, ry: head.ry + flower.radius * 0.7,
      }, dt)) {
        this.hits++;
        this.lastHit = now;
        flower.spin += limit(head.vx / 400, -1.5, 1.5);
      }
      ctx.save();
      ctx.translate(flower.x, flower.y);
      ctx.rotate(flower.rotation);
      const radius = flower.radius;
      const pattern = fireworkPatterns[flower.pattern];
      // The bloom is not scaled as one bitmap: every concentric layer and every
      // glossy capsule grows independently, then the layers die outside-in.
      for (let ringIndex = pattern.rings.length - 1; ringIndex >= 0; ringIndex--) {
        const ring = pattern.rings[ringIndex];
        for (let ray = 0; ray < ring.count; ray++) {
          const spokeOffset = (ray * 7 % ring.count) / Math.max(1, ring.count - 1);
          const state = fireworkRingState(flower.age, ringIndex, pattern.rings.length, spokeOffset);
          if (state.grow <= 0 || state.alpha <= 0) continue;
          const angle = ray * TAU / ring.count + ring.phase;
          const inner = radius * ring.inner * (0.72 + .28 * state.grow);
          const length = radius * ring.length * state.grow;
          const width = radius * ring.width * (0.7 + .3 * state.grow);
          const colorShift = ringIndex === 1 ? 2 : ringIndex;
          const part = this.fireworkParts[(flower.color + colorShift + ray % 3) % colors.length];
          ctx.save();
          ctx.rotate(angle);
          ctx.globalAlpha = state.alpha;
          ctx.drawImage(part.ray, -width / 2, -inner - length, width, length);
          ctx.restore();
        }
      }
      const centerGrow = outBack(flower.age / .27);
      const centerAlpha = fireworkCenterAlpha(flower.age, pattern.rings.length);
      const centerSize = radius * .43 * Math.max(0, centerGrow);
      if (centerSize > 0 && centerAlpha > 0) {
        ctx.globalAlpha = centerAlpha;
        ctx.drawImage(this.fireworkParts[(flower.color + 3) % colors.length].center, -centerSize/2, -centerSize/2, centerSize, centerSize);
      }
      ctx.restore();
    }
    this.sparkCount = this.bursts.length;
    ctx.globalAlpha = 1;
    const hitAge = now - this.lastHit;
    if (this.hasHead && (debug || hitAge < 260)) {
      ctx.beginPath();
      ctx.ellipse(head.x, head.y, head.rx, head.ry, 0, 0, TAU);
      ctx.strokeStyle = hitAge < 260 ? "#f5ddb8" : "#d9e2e4";
      ctx.lineWidth = hitAge < 260 ? 2.3 : 1.2;
      ctx.setLineDash(debug ? [5, 4] : []);
      ctx.globalAlpha = debug ? 0.95 : 0.7 * (1 - hitAge / 260);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  get playing() {
    return this.launches.length > 0 || this.bursts.length > 0 || this.sparkCount > 0 || this.rain > 0;
  }
}
