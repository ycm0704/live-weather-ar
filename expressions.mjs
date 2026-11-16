export class ExpressionGate {
  constructor() {
    this.reset();
  }

  reset() {
    this.smile = 0;
    this.jaw = 0;
    this.baselineSmile = 0;
    this.baselineJaw = 0;
    this.samples = 0;
    this.lastAt = 0;
    this.raining = false;
    this.smileSince = null;
    this.mouthOpenSince = null;
    this.mouthOpenLatched = false;
    this.lastBurstAt = -Infinity;
  }

  update(smile, jaw, now) {
    if (this.lastAt && now - this.lastAt > 1200) {
      this.smileSince = this.mouthOpenSince = null;
      this.raining = false;
    }
    this.lastAt = now;
    this.smile += (smile - this.smile) * 0.48;
    this.jaw += (jaw - this.jaw) * 0.48;
    if (this.samples < 7) {
      this.samples++;
      this.baselineSmile += (smile - this.baselineSmile) / this.samples;
      this.baselineJaw += (jaw - this.baselineJaw) / this.samples;
      return { warming: true, rain: false, burst: false };
    }

    const smileThreshold = Math.max(0.11, Math.min(this.baselineSmile, 0.34) + 0.06);
    // Fireworks are a mouth-open gesture, not a laugh classifier. Keep the
    // threshold relative to the relaxed jaw and reject one-frame spikes.
    const mouthOpenThreshold = Math.max(0.42, Math.min(this.baselineJaw, 0.22) + 0.28);
    const smiling = this.smile >= smileThreshold - (this.raining ? 0.035 : 0)
      && (this.raining || smile >= smileThreshold);
    const mouthOpen = this.jaw >= mouthOpenThreshold && jaw >= mouthOpenThreshold;

    this.smileSince = smiling ? this.smileSince ?? now : null;
    this.mouthOpenSince = mouthOpen ? this.mouthOpenSince ?? now : null;

    if (this.jaw < mouthOpenThreshold - 0.14 && jaw < mouthOpenThreshold - 0.12) {
      this.mouthOpenLatched = false;
    }
    const burst = this.mouthOpenSince !== null && now - this.mouthOpenSince >= 225
      && !this.mouthOpenLatched && now - this.lastBurstAt >= 1600;
    if (burst) {
      this.mouthOpenLatched = true;
      this.lastBurstAt = now;
    }
    this.raining = !mouthOpen && !this.mouthOpenLatched
      && this.smileSince !== null && now - this.smileSince >= 100;
    return { warming: false, rain: this.raining, burst };
  }
}

export function readFace(result) {
  const points = result.faceLandmarks[0];
  const categories = result.faceBlendshapes[0]?.categories;
  if (!points || !categories?.length) return null;

  const get = (name) => categories.find(item => item.categoryName === name)?.score ?? 0;
  const smile = (get("mouthSmileLeft") + get("mouthSmileRight")) / 2;
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  // The face mesh ends at the forehead. Extend its bounds toward the crown.
  const faceHeight = maxY - minY;
  return {
    smile, jaw: get("jawOpen"), x: (minX + maxX) / 2, y: (minY + maxY) / 2 - 0.10 * faceHeight,
    rx: (maxX - minX) * 0.55, ry: faceHeight * 0.63,
  };
}

export function projectFace(face, videoWidth, videoHeight, width, height) {
  // Matches the mirrored object-fit: cover video, including crop on narrow screens.
  const scale = Math.max(width / videoWidth, height / videoHeight);
  const fittedWidth = videoWidth * scale;
  const fittedHeight = videoHeight * scale;
  return {
    x: width / 2 + (0.5 - face.x) * fittedWidth,
    y: height / 2 + (face.y - 0.5) * fittedHeight,
    rx: Math.max(16, face.rx * fittedWidth),
    ry: Math.max(20, face.ry * fittedHeight),
  };
}
