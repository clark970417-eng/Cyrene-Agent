export interface RopeBody {
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  grounded: boolean;
  mass: number;
}

export interface RopePoint {
  x: number;
  y: number;
  previousX: number;
  previousY: number;
}

export interface RopePlatform {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MemoryRope {
  points: RopePoint[];
  segments: number;
  relaxedLength: number;
  reeledLength: number;
  currentLength: number;
  tension: number;
  pull: number;
}

function anchor(body: RopeBody): { x: number; y: number } {
  return { x: body.x + body.width * 0.5, y: body.y + body.height * 0.52 };
}

function inverseMass(body: RopeBody): number {
  return (body.grounded ? 0.14 : 1) / Math.max(0.2, body.mass);
}

export function createMemoryRope(
  first: RopeBody,
  second: RopeBody,
  segments = 16,
  relaxedLength = 226,
): MemoryRope {
  const rope: MemoryRope = {
    points: [],
    segments,
    relaxedLength,
    reeledLength: relaxedLength * 0.64,
    currentLength: relaxedLength,
    tension: 0,
    pull: 0,
  };
  resetMemoryRope(rope, first, second);
  return rope;
}

export function resetMemoryRope(rope: MemoryRope, first: RopeBody, second: RopeBody): void {
  const start = anchor(first);
  const end = anchor(second);
  rope.currentLength = rope.relaxedLength;
  rope.tension = 0;
  rope.pull = 0;
  rope.points = Array.from({ length: rope.segments + 1 }, (_, index) => {
    const amount = index / rope.segments;
    const x = start.x + (end.x - start.x) * amount;
    const y = start.y + (end.y - start.y) * amount + Math.sin(Math.PI * amount) * 16;
    return { x, y, previousX: x, previousY: y };
  });
}

function collideRopePoint(point: RopePoint, platforms: RopePlatform[]): void {
  for (const platform of platforms) {
    const crossingTop = point.previousY <= platform.y + 7 && point.y >= platform.y - 3;
    if (
      crossingTop &&
      point.x >= platform.x - 2 &&
      point.x <= platform.x + platform.width + 2
    ) {
      point.y = platform.y - 3;
      const horizontalVelocity = (point.x - point.previousX) * 0.78;
      point.previousX = point.x - horizontalVelocity;
      point.previousY = point.y;
    }
  }
}

function applyBodyTension(rope: MemoryRope, first: RopeBody, second: RopeBody, dt: number): void {
  const start = anchor(first);
  const end = anchor(second);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.max(0.001, Math.hypot(dx, dy));
  const directionX = dx / distance;
  const directionY = dy / distance;
  const stretch = Math.max(0, distance - rope.currentLength * 0.82);
  const firstWeight = inverseMass(first);
  const secondWeight = inverseMass(second);
  const totalWeight = firstWeight + secondWeight;
  const firstShare = firstWeight / totalWeight;
  const secondShare = secondWeight / totalWeight;

  rope.tension = Math.max(0, Math.min(1, (distance / rope.currentLength - 0.72) / 0.28));
  const hanging = first.grounded === second.grounded ? null : first.grounded ? second : first;
  const anchorBody = hanging === first ? second : first;
  const verticalGap = hanging ? (hanging.y - anchorBody.y) : 0;
  rope.pull = hanging ? Math.max(0, Math.min(1, rope.tension * 0.62 + verticalGap / 420)) : 0;

  if (stretch > 0) {
    const force = Math.min(3900, stretch * 32 * (1 + rope.pull));
    first.vx += directionX * force * dt * firstShare;
    first.vy += directionY * force * dt * firstShare;
    second.vx -= directionX * force * dt * secondShare;
    second.vy -= directionY * force * dt * secondShare;
  }

  if (distance > rope.currentLength) {
    const correction = distance - rope.currentLength;
    first.x += directionX * correction * firstShare;
    first.y += directionY * correction * firstShare;
    second.x -= directionX * correction * secondShare;
    second.y -= directionY * correction * secondShare;
  }
}

export function stepMemoryRope(
  rope: MemoryRope,
  first: RopeBody,
  second: RopeBody,
  platforms: RopePlatform[],
  dt: number,
  elapsed: number,
  reeling: boolean,
  gravityDirection = 1,
): void {
  const step = Math.max(0.001, Math.min(dt, 1 / 30));
  const targetLength = reeling ? rope.reeledLength : rope.relaxedLength;
  rope.currentLength += (targetLength - rope.currentLength) * Math.min(1, step * (reeling ? 11 : 3.8));
  applyBodyTension(rope, first, second, step);

  const start = anchor(first);
  const end = anchor(second);
  if (rope.points.length !== rope.segments + 1) resetMemoryRope(rope, first, second);

  for (let index = 1; index < rope.points.length - 1; index += 1) {
    const point = rope.points[index];
    const velocityX = (point.x - point.previousX) * 0.992;
    const velocityY = (point.y - point.previousY) * 0.992;
    point.previousX = point.x;
    point.previousY = point.y;
    point.x += velocityX + Math.sin(elapsed * 1.6 + index * 0.61) * 13 * step * step;
    point.y += velocityY + 610 * gravityDirection * step * step;
  }

  const segmentLength = rope.currentLength / rope.segments;
  const finalIndex = rope.points.length - 1;
  for (let iteration = 0; iteration < 11; iteration += 1) {
    Object.assign(rope.points[0], { ...start, previousX: start.x, previousY: start.y });
    Object.assign(rope.points[finalIndex], { ...end, previousX: end.x, previousY: end.y });
    for (let index = 0; index < finalIndex; index += 1) {
      const left = rope.points[index];
      const right = rope.points[index + 1];
      const dx = right.x - left.x;
      const dy = right.y - left.y;
      const distance = Math.max(0.001, Math.hypot(dx, dy));
      const difference = (distance - segmentLength) / distance;
      if (index === 0) {
        right.x -= dx * difference;
        right.y -= dy * difference;
      } else if (index + 1 === finalIndex) {
        left.x += dx * difference;
        left.y += dy * difference;
      } else {
        left.x += dx * difference * 0.5;
        left.y += dy * difference * 0.5;
        right.x -= dx * difference * 0.5;
        right.y -= dy * difference * 0.5;
      }
    }
    if (iteration > 4 && gravityDirection > 0) {
      for (let index = 1; index < finalIndex; index += 1) collideRopePoint(rope.points[index], platforms);
    }
  }
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
