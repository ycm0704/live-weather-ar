export function bounceOffHead(particle, startX, startY, head, dt) {
  const rx = head.rx + 2;
  const ry = head.ry + 2;
  const x = (startX - head.x + head.vx * dt) / rx;
  const y = (startY - head.y + head.vy * dt) / ry;
  const dx = (particle.x - head.x) / rx - x;
  const dy = (particle.y - head.y) / ry - y;
  const c = x * x + y * y - 1;
  let t = 0;
  if (c > 0) {
    const a = dx * dx + dy * dy;
    const halfB = x * dx + y * dy;
    const discriminant = halfB * halfB - a * c;
    if (a < 1e-10 || halfB >= 0 || discriminant < 0) return false;
    t = (-halfB - Math.sqrt(discriminant)) / a;
    if (t < 0 || t > 1) return false;
  }

  let u = x + dx * t;
  let v = y + dy * t;
  if (Math.abs(u) + Math.abs(v) < 1e-8) v = -1;
  const radius = Math.hypot(u, v);
  u /= radius;
  v /= radius;
  const length = Math.hypot(u / rx, v / ry);
  const nx = u / rx / length;
  const ny = v / ry / length;
  const impact = (particle.vx - head.vx) * nx + (particle.vy - head.vy) * ny;

  if (impact < 0) {
    particle.vx -= 1.62 * impact * nx;
    particle.vy -= 1.62 * impact * ny;
  }
  const remainder = (1 - t) * dt;
  particle.x = head.x + u * rx + nx + (particle.vx - head.vx) * remainder;
  particle.y = head.y + v * ry + ny + (particle.vy - head.vy) * remainder;
  return impact < -8;
}
