// ===== 포위퍼즐 시드 선별 스크립트 =====
// 용도: 각 레벨의 seeds 배열을 채울 검증된 시드를 뽑는다.
// 동작:
//   1. 레벨별로 시드 후보 N개를 생성
//   2. 각 시드로 "적 확산 경로"를 시뮬레이션 (deterministic)
//   3. 솔버(solver-v40.js 로직 내장)로 해당 경로가 min 예산 안에 클리어 가능한지 확인
//   4. 통과한 시드 중 목표 개수만큼 출력
//
// 실행: node seed-validator.js [레벨번호] [--candidates N] [--target M] [--time S]
//   예) node seed-validator.js 13 --candidates 200 --target 5 --time 30
//       → 레벨 13에 대해 시드 200개 시도, 클리어 가능한 것 5개 찾으면 종료 (시드당 최대 30초)
//
// ⚠️ 시드 PRNG는 포위퍼즐-v41.html의 mulberry32와 동일해야 한다.

// ===== mulberry32 (게임과 동일) =====
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let z = Math.imul(seed ^ seed >>> 15, 1 | seed);
    z = z + Math.imul(z ^ z >>> 7, 61 | z) ^ z;
    return ((z ^ z >>> 14) >>> 0) / 4294967296;
  };
}

// ===== 레벨 정의 (solver-v40.js와 동일) =====
const LEVELS = [
  { board: 3, enemies: [[0,0]], walls: [[1,0,1],[1,1,1]], schedule: [1],     spread: true, combat: false, min: 1, exactBudget: true },  // 1
  { board: 3, enemies: [[0,0]],                           schedule: [1,1,1], spread: true, combat: false, min: 3, exactBudget: true },  // 2
  { board: 4, enemies: [[1,2]],       schedule: [1,1,1,1,1,1],         spread: true, combat: false, min: 6, exactBudget: true },        // 3
  { board: 4, enemies: [[0,0],[3,3]], schedule: [1,1,1,1,1,1,1],       spread: true, combat: false, min: 7, exactBudget: true },        // 4
  { board: 4, enemies: [[1,1],[2,3]], schedule: [1,1,1,1,1,1,1],       spread: true, combat: false, min: 7, exactBudget: true },        // 5
  { board: 5, enemies: [[1,1]],       schedule: [1,1,1,1,1,1,1,1],     spread: true, combat: false, min: 8, exactBudget: true },        // 6
  { board: 5, enemies: [[2,1]],       schedule: [1,1,1,1,1,1,1,1],     spread: true, combat: false, min: 8, exactBudget: true },        // 7
  { board: 5, enemies: [[2,2]],       schedule: [1,1,1,1,1,1,1,1,1],   spread: true, combat: false, min: 9, exactBudget: true },        // 8
  { board: 3, enemies: [[0,0]], walls: [[1,0,1]], schedule: [1], spread: true, combat: true, min: 1, exactBudget: true },                // 9
  { board: 3, enemies: [[0,0]],       schedule: [1,1,1],                 spread: true, combat: true, min: 3, exactBudget: true },        // 10
  { board: 4, enemies: [[0,0]],       schedule: [1,1,1,1],               spread: true, combat: true, min: 4, exactBudget: true },        // 11
  { board: 4, enemies: [[1,1]],       schedule: [1,1,1,1,1,1],           spread: true, combat: true, min: 6, exactBudget: true },        // 12
  { board: 5, enemies: [[1,1]],       schedule: [1,1,1,1,1,1,1,1],       spread: true, combat: true, min: 8, exactBudget: true },        // 13
  { board: 5, enemies: [[2,1]],       schedule: [1,1,1,1,1,1,1,1],       spread: true, combat: true, min: 8, exactBudget: true },        // 14
  { board: 6, enemies: [[0,0],[2,0]], hp: 2, schedule: [1,1,1,1,1,1,1,1,1], spread: true, combat: true, min: 9, exactBudget: true },     // 15
];

const EMPTY = 0, ENEMY = -1;
const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];

class Timeout extends Error {}

// ===== 시드 기반 확산 시뮬레이터 =====
// 게임의 pickSpreadCell과 동일 로직 — PRNG만 mulberry32로 교체
function makeSpreadPicker(N, prng) {
  const idx = (x, y) => y * N + x;
  const inBoard = (x, y) => x >= 0 && x < N && y >= 0 && y < N;

  function isSuicide(grid, c) {
    const seen = new Set([c]);
    const q = [c];
    let empties = 0;
    while (q.length) {
      const k = q.pop();
      if (grid[k] === EMPTY) empties++;
      if (empties > 1) return false;
      const kx = k % N, ky = (k / N) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = kx + dx, ny = ky + dy;
        if (!inBoard(nx, ny)) continue;
        const ni = idx(nx, ny);
        if (grid[ni] !== undefined && grid[ni] <= 0 && !seen.has(ni)) { seen.add(ni); q.push(ni); }
      }
    }
    return empties === 1;
  }

  function pickSpreadCell(grid) {
    const frontier = new Set();
    for (let i = 0; i < N * N; i++) {
      if (grid[i] !== ENEMY) continue;
      const cx = i % N, cy = (i / N) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (inBoard(nx, ny) && grid[idx(nx, ny)] === EMPTY) frontier.add(idx(nx, ny));
      }
    }
    if (frontier.size === 0) return null;
    const weigh = (allowSuicide) => {
      const out = [];
      for (const i of frontier) {
        if (!allowSuicide && isSuicide(grid, i)) continue;
        const cx = i % N, cy = (i / N) | 0;
        let openness = 0;
        for (const [dx, dy] of DIRS) {
          const nx = cx + dx, ny = cy + dy;
          if (inBoard(nx, ny) && grid[idx(nx, ny)] === EMPTY) openness++;
        }
        const w = 1 + openness * 2;
        for (let j = 0; j < w; j++) out.push(i);
      }
      return out;
    };
    let weighted = weigh(false);
    if (weighted.length === 0) weighted = weigh(true);
    return weighted[Math.floor(prng() * weighted.length)];
  }

  return { pickSpreadCell, isSuicide };
}

// ===== 솔버 (solver-v40.js에서 이식, 시드 확산 경로 검증용) =====
// 시드 기반 확산: pickSpreadCell을 seeded PRNG 버전으로 넘긴다
function solveWithSeed(level, seed, { timeMs = 30000 } = {}) {
  const N = level.board;
  const NN = N * N;
  const idx = (x, y) => y * N + x;
  const inBoard = (x, y) => x >= 0 && x < N && y >= 0 && y < N;
  const isBlock = v => v > 0;
  const deadline = Date.now() + timeMs;
  let nodes = 0;

  const NB = [];
  for (let i = 0; i < NN; i++) {
    const x = i % N, y = (i / N) | 0, ns = [];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < N && ny >= 0 && ny < N) ns.push(idx(nx, ny));
    }
    NB.push(ns);
  }

  // 미러링: seeded prng로 fx/fy 결정
  const prng = mulberry32(seed);
  const fx = prng() < .5;
  const fy = prng() < .5;

  const g0 = new Array(NN).fill(EMPTY);
  for (const [x, y] of level.enemies) g0[idx(fx ? N - 1 - x : x, fy ? N - 1 - y : y)] = ENEMY;
  if (level.walls) for (const [x, y, hp] of level.walls) g0[idx(fx ? N - 1 - x : x, fy ? N - 1 - y : y)] = hp;

  // 확산 PRNG: 미러링 소비 후 남은 prng 상태를 이어서 사용 (게임과 동일 흐름)
  const { pickSpreadCell, isSuicide } = makeSpreadPicker(N, prng);

  function forEachRegion(g, cb) {
    const seen = new Uint8Array(NN);
    for (let i = 0; i < NN; i++) {
      if (isBlock(g[i]) || seen[i]) continue;
      const cells = [], q = [i];
      seen[i] = 1;
      let hasEnemy = false, empties = 0;
      while (q.length) {
        const c = q.pop();
        cells.push(c);
        if (g[c] === ENEMY) hasEnemy = true;
        else if (g[c] === EMPTY) empties++;
        for (const n of NB[c]) if (!isBlock(g[n]) && !seen[n]) { seen[n] = 1; q.push(n); }
      }
      cb(cells, hasEnemy, empties);
    }
  }

  function capture(g) {
    const kills = [], hits = [];
    forEachRegion(g, (cells, hasEnemy, empties) => {
      if (!hasEnemy || empties > 0) return;
      const enemySet = new Set(cells);
      const walls = new Set();
      for (const c of enemySet) for (const n of NB[c]) if (isBlock(g[n])) walls.add(n);
      const wallOrder = [...walls].sort((a, b) => a - b);
      const foesOf = w => NB[w].filter(n => enemySet.has(n)).sort((a, b) => a - b);
      const matchedBy = new Map();
      const aug = (w, vis) => {
        for (const f of foesOf(w)) {
          if (vis.has(f)) continue; vis.add(f);
          if (!matchedBy.has(f) || aug(matchedBy.get(f), vis)) { matchedBy.set(f, w); return true; }
        }
        return false;
      };
      for (const w of wallOrder) aug(w, new Set());
      for (const f of matchedBy.keys()) kills.push(f);
      if (level.combat) {
        const foeOrder = [...enemySet].sort((a, b) => a - b);
        const wallsOfFoe = f => NB[f].filter(n => isBlock(g[n])).sort((a, b) => (g[a] - g[b]) || (a - b));
        const hitBy = new Map();
        const augC = (f, vis) => {
          for (const w of wallsOfFoe(f)) {
            if (vis.has(w)) continue; vis.add(w);
            if (!hitBy.has(w) || augC(hitBy.get(w), vis)) { hitBy.set(w, f); return true; }
          }
          return false;
        };
        for (const f of foeOrder) augC(f, new Set());
        for (const w of hitBy.keys()) hits.push(w);
      }
    });
    if (!kills.length) return false;
    for (const f of kills) g[f] = EMPTY;
    for (const w of hits) { g[w]--; if (g[w] === 0) g[w] = EMPTY; }
    return true;
  }

  function enemyCnt(g) { let n = 0; for (let i = 0; i < NN; i++) if (g[i] === ENEMY) n++; return n; }
  const adjEnemy = (g, i) => NB[i].some(n => g[n] === ENEMY);

  // 시드 기반 확산: 분기 없이 seeded pick 하나만 사용 (단일 경로 검증)
  function enemyTurnSeeded(g) {
    const next = pickSpreadCell(g);
    if (next === null) return [null];  // 확산 불가 → 즉시 승리
    const g2 = g.slice();
    g2[next] = ENEMY;
    capture(g2);
    return [enemyCnt(g2) === 0 ? null : g2];
  }

  function candidateMoves(g) {
    const out = [];
    forEachRegion(g, (cells, hasEnemy) => {
      if (hasEnemy) for (const c of cells) if (g[c] === EMPTY) out.push(c);
    });
    return out;
  }

  // 시드 고정 = 단일 확산 경로 → 플레이어(OR)만 분기, 적은 결정론적
  const memo = new Map();
  function win(g, stones) {
    if (Date.now() > deadline) throw new Timeout();
    nodes++;
    const key = g.join(',') + '|' + stones;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;

    let result = false;
    if (stones <= 0) { memo.set(key, false); return false; }
    for (const m of candidateMoves(g)) {
      const g2 = g.slice();
      g2[m] = level.hp || 1;
      capture(g2);
      if (enemyCnt(g2) === 0) { result = true; break; }

      if (!level.spread) {
        if (stones - 1 <= 0) continue;
        if (win(g2, stones - 1)) { result = true; break; }
        continue;
      }
      const branches = enemyTurnSeeded(g2);
      let all = true;
      for (const g3 of branches) {
        if (g3 === null) continue;
        if (stones - 1 <= 0) { all = false; break; }
        if (!win(g3, stones - 1)) { all = false; break; }
      }
      if (all) { result = true; break; }
    }
    if (memo.size < 5_000_000) memo.set(key, result);
    return result;
  }

  const budget = level.schedule.reduce((a, b) => a + b, 0);
  try {
    const ok = win(g0, budget);
    return { status: ok ? 'PASS' : 'FAIL', nodes, memo: memo.size };
  } catch (e) {
    if (e instanceof Timeout) return { status: 'TIMEOUT', nodes, memo: memo.size };
    throw e;
  }
}

// ===== 실행 =====
const args = process.argv.slice(2);
const levelArg = args[0] && !args[0].startsWith('--') ? Number(args[0]) : null;
const ciIdx = args.indexOf('--candidates');
const candidates = ciIdx >= 0 ? Number(args[ciIdx + 1]) : 300;
const tiIdx = args.indexOf('--target');
const target = tiIdx >= 0 ? Number(args[tiIdx + 1]) : 5;
const tmIdx = args.indexOf('--time');
const timeMs = (tmIdx >= 0 ? Number(args[tmIdx + 1]) : 10) * 1000;

const levels = levelArg
  ? [[levelArg - 1, LEVELS[levelArg - 1]]]
  : LEVELS.map((lv, i) => [i, lv]);

console.log(`포위퍼즐 시드 검증기 — 레벨당 최대 ${candidates}개 시도, 목표 ${target}개, 시드당 ${timeMs/1000}s\n`);

for (const [i, level] of levels) {
  if (!level) { console.log(`레벨 ${i + 1}: 정의 없음`); continue; }
  const found = [];
  let tried = 0;
  const t0 = Date.now();

  // 시드 범위: 레벨 번호 * 100000 + 1 ~ +99999
  const base = (i + 1) * 100000;

  while (tried < candidates && found.length < target) {
    const seed = base + tried + 1;
    tried++;
    const r = solveWithSeed(level, seed, { timeMs });
    const mark = r.status === 'PASS' ? '✓' : r.status === 'TIMEOUT' ? '?' : '✗';
    process.stdout.write(`\r  레벨 ${i+1}: ${tried}/${candidates} 시도, 통과 ${found.length}/${target}  `);
    if (r.status === 'PASS') found.push(seed);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n레벨 ${String(i + 1).padStart(2)}: seeds: [${found.join(',')}]  (${found.length}/${target} 확보, ${tried}개 시도, ${elapsed}s)`);
}

console.log('\n완료. 위 seeds 배열을 포위퍼즐-v41.html의 LEVELS 정의에 붙여넣으세요.');
