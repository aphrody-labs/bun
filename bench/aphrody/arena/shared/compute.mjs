// E1, engine lane: pure ECMAScript (nbody, fannkuch, collections, text, sort).
import { hashString, measureSync, mix, prng, report, warmup } from "./common.mjs";

const warm = Math.max(10, warmup);

function nbody(steps) {
  const PI = Math.PI;
  const SOLAR_MASS = 4 * PI * PI;
  const DAYS = 365.24;
  const bodies = [
    [0, 0, 0, 0, 0, 0, SOLAR_MASS],
    [
      4.8414314424647209,
      -1.16032004402742839,
      -1.03622044471123109e-1,
      1.66007664274403694e-3 * DAYS,
      7.69901118419740425e-3 * DAYS,
      -6.90460016972063023e-5 * DAYS,
      9.54791938424326609e-4 * SOLAR_MASS,
    ],
    [
      8.34336671824457987,
      4.12479856412430479,
      -4.03523417114321381e-1,
      -2.76742510726862411e-3 * DAYS,
      4.99852801234917238e-3 * DAYS,
      2.30417297573763929e-5 * DAYS,
      2.85885980666130812e-4 * SOLAR_MASS,
    ],
    [
      1.2894369562139131e1,
      -1.51111514016986312e1,
      -2.23307578892655734e-1,
      2.96460137564761618e-3 * DAYS,
      2.3784717395948095e-3 * DAYS,
      -2.96589568540237556e-5 * DAYS,
      4.36624404335156298e-5 * SOLAR_MASS,
    ],
    [
      1.53796971148509165e1,
      -2.59193146099879641e1,
      1.79258772950371181e-1,
      2.68067772490389322e-3 * DAYS,
      1.62824170038242295e-3 * DAYS,
      -9.5159225451971587e-5 * DAYS,
      5.15138902046611451e-5 * SOLAR_MASS,
    ],
  ].map(b => ({ x: b[0], y: b[1], z: b[2], vx: b[3], vy: b[4], vz: b[5], m: b[6] }));
  let px = 0,
    py = 0,
    pz = 0;
  for (const b of bodies) {
    px += b.vx * b.m;
    py += b.vy * b.m;
    pz += b.vz * b.m;
  }
  bodies[0].vx = -px / SOLAR_MASS;
  bodies[0].vy = -py / SOLAR_MASS;
  bodies[0].vz = -pz / SOLAR_MASS;
  const n = bodies.length;
  const dt = 0.01;
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < n; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < n; j++) {
        const b = bodies[j];
        const dx = a.x - b.x,
          dy = a.y - b.y,
          dz = a.z - b.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const mag = dt / (d2 * Math.sqrt(d2));
        a.vx -= dx * b.m * mag;
        a.vy -= dy * b.m * mag;
        a.vz -= dz * b.m * mag;
        b.vx += dx * a.m * mag;
        b.vy += dy * a.m * mag;
        b.vz += dz * a.m * mag;
      }
    }
    for (const b of bodies) {
      b.x += dt * b.vx;
      b.y += dt * b.vy;
      b.z += dt * b.vz;
    }
  }
  let e = 0;
  for (let i = 0; i < n; i++) {
    const a = bodies[i];
    e += 0.5 * a.m * (a.vx * a.vx + a.vy * a.vy + a.vz * a.vz);
    for (let j = i + 1; j < n; j++) {
      const b = bodies[j];
      const dx = a.x - b.x,
        dy = a.y - b.y,
        dz = a.z - b.z;
      e -= (a.m * b.m) / Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
  }
  return Math.round(e * 1e9) >>> 0;
}

function fannkuch(n) {
  const perm = new Int32Array(n);
  const perm1 = new Int32Array(n);
  const count = new Int32Array(n);
  for (let i = 0; i < n; i++) perm1[i] = i;
  let maxFlips = 0,
    checksum = 0,
    permCount = 0,
    r = n;
  for (;;) {
    while (r !== 1) count[r - 1] = r--;
    perm.set(perm1);
    let flips = 0,
      k;
    while ((k = perm[0]) !== 0) {
      for (let i = 0, j = k; i < j; i++, j--) {
        const t = perm[i];
        perm[i] = perm[j];
        perm[j] = t;
      }
      flips++;
    }
    if (flips > maxFlips) maxFlips = flips;
    checksum += permCount % 2 === 0 ? flips : -flips;
    for (;;) {
      if (r === n) return mix(maxFlips, checksum);
      const p0 = perm1[0];
      for (let i = 0; i < r; i++) perm1[i] = perm1[i + 1];
      perm1[r] = p0;
      if (--count[r] > 0) break;
      r++;
    }
    permCount++;
  }
}

function collections(ops) {
  const rnd = prng(42);
  const map = new Map();
  const set = new Set();
  const obj = {};
  let h = 2166136261;
  for (let i = 0; i < ops; i++) {
    const k = (rnd() * 4096) | 0;
    const ks = "k" + k;
    map.set(k, (map.get(k) ?? 0) + i);
    if (set.has(ks)) set.delete(ks);
    else set.add(ks);
    obj[ks] = (obj[ks] | 0) + 1;
    if ((i & 1023) === 0) h = mix(h, map.size ^ set.size);
  }
  let sum = 0;
  for (const v of map.values()) sum = (sum + v) >>> 0;
  for (const k of set) h = hashString(h, k);
  return mix(mix(h, sum), Object.keys(obj).length);
}

const words = (() => {
  const rnd = prng(7);
  const out = [];
  for (let i = 0; i < 2000; i++) {
    let w = "";
    const len = 2 + ((rnd() * 9) | 0);
    for (let j = 0; j < len; j++) w += String.fromCharCode(97 + ((rnd() * 26) | 0));
    out.push(w);
  }
  return out;
})();

function text() {
  const parts = [];
  for (let i = 0; i < 20000; i++) parts.push(words[(i * 7919) % words.length]);
  const s = parts.join(" ");
  const replaced = s.replace(/([aeiou])([a-z])/g, "$2$1");
  const counts = new Map();
  for (const w of replaced.split(" ")) counts.set(w, (counts.get(w) ?? 0) + 1);
  let h = hashString(2166136261, replaced.slice(0, 4096));
  h = mix(h, counts.size);
  h = mix(h, replaced.toUpperCase().indexOf("ZZ") + 1);
  return mix(h, (replaced.match(/\b[a-z]{5}\b/g) ?? []).length);
}

const sortInput = (() => {
  const rnd = prng(1234);
  const nums = new Float64Array(100000);
  for (let i = 0; i < nums.length; i++) nums[i] = rnd();
  return { nums, strs: words.concat(words.map(w => w + "x")) };
})();

function sort() {
  const a = Array.from(sortInput.nums);
  a.sort((x, y) => x - y);
  const s = sortInput.strs.slice();
  s.sort();
  let h = 2166136261;
  for (let i = 0; i < a.length; i += 997) h = mix(h, (a[i] * 1e9) | 0);
  for (let i = 0; i < s.length; i += 97) h = hashString(h, s[i]);
  return h;
}

report("compute", "engine", {
  nbody: measureSync("nbody", () => nbody(50000), { warm }),
  fannkuch: measureSync("fannkuch", () => fannkuch(9), { warm }),
  collections: measureSync("collections", () => collections(200000), { warm }),
  text: measureSync("text", text, { warm }),
  sort: measureSync("sort", sort, { warm }),
});
