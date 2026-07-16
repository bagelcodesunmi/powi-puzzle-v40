// ===== 포위 퍼즐 v36 적대적(worst-case) 솔버 =====
// 목적: 각 레벨이 "최악의 확산 선택"에서도 예산(=min) 안에 클리어 가능한지 검증.
// 규칙 미러링 대상: 포위퍼즐-v40.html (전면 내구도 1)
//   - 배치: 빈칸 전용, 내구도 1 (반격 1발 = 파괴)
//   - 포획: 영역 빈칸 0(완전 밀폐) → 내 화살 최대 매칭(블록·적 좌상단 순) — 벽당 1킬, 미조준 적 생존
//   - 반격(combat 레벨): 밀폐 영역의 적 전원(죽는 적 포함)이 최대 매칭으로 벽에 1타씩 (약한 벽·좌상단 우선)
//     내 화살 사망 처리 → 반격 데미지 순으로 적용 (게임: 킬 즉시, 데미지 명중 시 — 다음 행동 전 항상 완료)
//   - 확산: 예고(announced) 칸이 유효(빈칸·적 인접·비자살)하면 그 칸. 무효면 재선택 → 최악 가정으로
//     비자살 프런티어 전체 분기 (비자살이 없으면 자살 칸 전체 분기 = 강제 자충 → 포획+반격)
//   - 매 턴 벽 공격 없음 (v35 폐지). 영토/요새화 없음.
//   - 판정 [v37 유예]: 확산 레벨은 마지막 돌 후 적 턴 1회까지 실행 후 판정. 정지 레벨은 즉시 판정.
// 사용: node solver-v36.mjs [레벨목록] [--budget N] [--time S]
//   예) node solver-v36.mjs 12,13 --budget 4   → 해당 레벨을 예산 4로 검증

const EMPTY = 0, ENEMY = -1;
const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];

const LEVELS = [
  { board: 3, enemies: [[0,0]], walls: [[1,0,1],[1,1,1]], schedule: [1],     spread: true, combat: false, min: 1 },
  { board: 3, enemies: [[0,0]],                           schedule: [1,1,1], spread: true, combat: false, min: 3 },
  { board: 4, enemies: [[1,2]],       schedule: [1,1,1,1,1,1],       spread: true, combat: false, min: 6 },
  { board: 4, enemies: [[0,0],[3,3]], schedule: [1,1,1,1,1,1,1],     spread: true, combat: false, min: 7 },
  { board: 4, enemies: [[1,1],[2,3]], schedule: [1,1,1,1,1,1,1],     spread: true, combat: false, min: 7 },
  { board: 5, enemies: [[1,1]],       schedule: [1,1,1,1,1,1,1,1],   spread: true, combat: false, min: 8 },
  { board: 5, enemies: [[2,1]],       schedule: [1,1,1,1,1,1,1,1],   spread: true, combat: false, min: 8 },
  { board: 5, enemies: [[2,2]],       schedule: [1,1,1,1,1,1,1,1,1], spread: true, combat: false, min: 9 },
  { board: 3, enemies: [[0,0]], walls: [[1,0,1]], schedule: [1], spread: true, combat: true, min: 1 },
  { board: 3, enemies: [[0,0]],       schedule: [1,1,1],               spread: true, combat: true, min: 3 },
  { board: 4, enemies: [[0,0]],       schedule: [1,1,1,1],             spread: true, combat: true, min: 4 },
  { board: 4, enemies: [[1,1]],       schedule: [1,1,1,1,1,1],         spread: true, combat: true, min: 6 },
  { board: 5, enemies: [[1,1]],       schedule: [1,1,1,1,1,1,1,1],     spread: true, combat: true, min: 8 },
  { board: 5, enemies: [[2,1]],       schedule: [1,1,1,1,1,1,1,1],     spread: true, combat: true, min: 8 },
  { board: 6, enemies: [[0,0],[2,0]], hp: 2, schedule: [1,1,1,1,1,1,1,1,1], spread: true, combat: true, min: 9 },
];

class Timeout extends Error {}

function solveLevel(level, { budget, timeMs = 90000 } = {}) {
  const N = level.board, NN = N * N;
  const idx = (x, y) => y * N + x;
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

  // 포획 볼리: 게임 computeShots·captureRegions와 동일 — 킬 + (combat 시) 반격 데미지
  function capture(g) {
    const kills = [], hits = [];
    forEachRegion(g, (cells, hasEnemy, empties) => {
      if (!hasEnemy || empties > 0) return;         // 완전 밀폐만 발동
      const enemySet = new Set(cells);
      const walls = new Set();
      for (const c of enemySet) for (const n of NB[c]) if (isBlock(g[n])) walls.add(n);
      // 내 화살: 최대 매칭 (블록·적 좌상단 순)
      const wallOrder = [...walls].sort((a, b) => a - b);
      const foesOf = w => NB[w].filter(n => enemySet.has(n)).sort((a, b) => a - b);
      const matchedBy = new Map();                  // 적 → 블록
      const aug = (w, vis) => {
        for (const f of foesOf(w)) {
          if (vis.has(f)) continue;
          vis.add(f);
          if (!matchedBy.has(f) || aug(matchedBy.get(f), vis)) { matchedBy.set(f, w); return true; }
        }
        return false;
      };
      for (const w of wallOrder) aug(w, new Set());
      for (const f of matchedBy.keys()) kills.push(f);
      // 반격: 밀폐 영역의 적 전원 → 벽 최대 매칭 (약한 벽·좌상단 우선), combat 레벨만
      if (level.combat) {
        const foeOrder = [...enemySet].sort((a, b) => a - b);
        const wallsOfFoe = f => NB[f].filter(n => isBlock(g[n])).sort((a, b) => (g[a] - g[b]) || (a - b));
        const hitBy = new Map();                    // 블록 → 적
        const augC = (f, vis) => {
          for (const w of wallsOfFoe(f)) {
            if (vis.has(w)) continue;
            vis.add(w);
            if (!hitBy.has(w) || augC(hitBy.get(w), vis)) { hitBy.set(w, f); return true; }
          }
          return false;
        };
        for (const f of foeOrder) augC(f, new Set());
        for (const w of hitBy.keys()) hits.push(w);
      }
    });
    if (!kills.length) return false;
    for (const f of kills) g[f] = EMPTY;            // 사망 즉시
    for (const w of hits) { g[w]--; if (g[w] === 0) g[w] = EMPTY; }   // 반격 데미지 (명중 시 — 다음 행동 전 완료)
    return true;
  }

  function enemyCnt(g) { let n = 0; for (let i = 0; i < NN; i++) if (g[i] === ENEMY) n++; return n; }
  const adjEnemy = (g, i) => NB[i].some(n => g[n] === ENEMY);

  function frontier(g) {
    const s = new Set();
    for (let i = 0; i < NN; i++) if (g[i] === ENEMY) for (const n of NB[i]) if (g[n] === EMPTY) s.add(n);
    return [...s];
  }

  // 자살 칸: 이 칸이 자기 영역의 마지막 빈칸 (게임 isSuicideCell 동일)
  function isSuicide(g, c) {
    const seen = new Set([c]);
    const q = [c];
    let empties = 0;
    while (q.length) {
      const k = q.pop();
      if (g[k] === EMPTY) empties++;
      if (empties > 1) return false;
      for (const n of NB[k]) if (!isBlock(g[n]) && !seen.has(n)) { seen.add(n); q.push(n); }
    }
    return empties === 1;
  }

  // 확산 선택지: 비자살 프런티어 우선, 전무하면 자살 칸 (강제 자충) — 게임 pickSpreadCell 후보와 동일
  function spreadChoices(g) {
    const f = frontier(g);
    const safe = f.filter(c => !isSuicide(g, c));
    return safe.length ? safe : f;
  }

  // 적 턴: 예고 s가 유효(빈칸·적 인접·비자살, 단 전부 자살이면 유효)하면 s로 확산, 무효면 전 선택지 분기
  function enemyTurnBranches(g, s) {
    const choices = spreadChoices(g);
    let pick;
    if (s !== null && g[s] === EMPTY && adjEnemy(g, s)) {
      const sSafe = !isSuicide(g, s);
      const allSuicide = choices.length > 0 && choices.every(c => isSuicide(g, c));
      pick = (sSafe || allSuicide) ? [s] : choices;   // 예고 유효 → 확정 / 자살화 → 재선택(최악 분기)
    } else pick = choices;
    const out = [];
    for (const sc of pick) {
      const g2 = g.slice();
      g2[sc] = ENEMY;
      capture(g2);                                    // 강제 자충 → 볼리(킬+반격)
      out.push(enemyCnt(g2) === 0 ? null : g2);       // null = 이 분기 즉시 승리
    }
    return out;
  }

  // 플레이어 후보수: 적이 있는 영역의 빈칸만 (그 외 배치는 무의미 → 가지치기)
  function candidateMoves(g) {
    const out = [];
    forEachRegion(g, (cells, hasEnemy) => {
      if (hasEnemy) for (const c of cells) if (g[c] === EMPTY) out.push(c);
    });
    return out;
  }

  const memo = new Map();
  function win(g, stones, s) {
    if (Date.now() > deadline) throw new Timeout();
    nodes++;
    const key = g.join(',') + '|' + stones + '|' + s;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;

    let result = false;
    if (stones <= 0) { memo.set(key, false); return false; }   // 돌 없음 = 배치 불가 (즉시 패배)
    for (const m of candidateMoves(g)) {              // OR: 이기는 수 하나면 승
      const g2 = g.slice();
      g2[m] = level.hp || 1;   // 배치 내구도 (레벨별 hp 플래그, 기본 1)                                      // 배치 내구도 2
      capture(g2);                                    // 볼리: 킬 + 반격 데미지
      if (enemyCnt(g2) === 0) { result = true; break; }

      if (!level.spread) {                            // 정지 레벨: 적 턴 없음 → 유예 없음, 즉시 판정
        if (stones - 1 <= 0) continue;                // 마지막 돌 직후 적 잔존 → 이 수는 패배
        if (win(g2, stones - 1, null)) { result = true; break; }
        continue;
      }
      // [v37 유예] 마지막 돌 이후에도 적 턴(강제 자충 포함)은 실행 — 그 안에서 전멸하면 승
      const branches = enemyTurnBranches(g2, s);      // AND: 모든 확산 선택에서 이겨야 승
      let all = true;
      for (const g3 of branches) {
        if (g3 === null) continue;                    // 적 턴 중 전멸 → 이 분기 승
        if (stones - 1 <= 0) { all = false; break; }  // 유예 후에도 잔존 → 패배
        let annOk = true;                             // 다음 예고도 적대적 (AND)
        for (const ann of spreadChoices(g3)) {
          if (!win(g3, stones - 1, ann)) { annOk = false; break; }
        }
        if (!annOk) { all = false; break; }
      }
      if (all) { result = true; break; }
    }
    if (memo.size < 15_000_000) memo.set(key, result);
    return result;
  }

  const g0 = new Array(NN).fill(EMPTY);
  for (const [x, y] of level.enemies) g0[idx(x, y)] = ENEMY;
  if (level.walls) for (const [x, y, hp] of level.walls) g0[idx(x, y)] = hp;
  const stones = budget ?? level.schedule.reduce((a, b) => a + b, 0);

  try {
    let ok = true;
    if (!level.spread) ok = win(g0, stones, null);
    else {
      for (const ann of spreadChoices(g0)) {          // 첫 예고도 적대적
        if (!win(g0, stones, ann)) { ok = false; break; }
      }
    }
    return { status: ok ? 'PASS' : 'FAIL', nodes, states: memo.size };
  } catch (e) {
    if (e instanceof Timeout) return { status: 'TIMEOUT', nodes, states: memo.size };
    throw e;
  }
}

// ===== 실행 =====
const args = process.argv.slice(2);
const onlyIdx = args[0] && !args[0].startsWith('--') ? args[0].split(',').map(Number) : null;
const bi = args.indexOf('--budget');
const budget = bi >= 0 ? Number(args[bi + 1]) : null;
const ti = args.indexOf('--time');
const timeMs = (ti >= 0 ? Number(args[ti + 1]) : 90) * 1000;
const li = args.indexOf('--level');            // 후보 레벨 직접 검증: --level '<JSON>' --budget N
if (li >= 0) {
  const lv = JSON.parse(args[li + 1]);
  const t0 = Date.now();
  const r = solveLevel(lv, { budget, timeMs });
  console.log(`후보 (${lv.board}×${lv.board}, 예산=${budget}, combat=${lv.combat ? 'O' : 'X'}, spread=${lv.spread ? 'O' : 'X'}): ${r.status}  [${((Date.now() - t0) / 1000).toFixed(1)}s, 노드 ${r.nodes.toLocaleString()}]`);
  process.exit(0);
}

for (let i = 0; i < LEVELS.length; i++) {
  if (onlyIdx && !onlyIdx.includes(i + 1)) continue;
  const lv = LEVELS[i];
  const t0 = Date.now();
  const b = budget ?? lv.schedule.reduce((a, c) => a + c, 0);
  const r = solveLevel(lv, { budget: b, timeMs });
  console.log(`레벨 ${String(i + 1).padStart(2)} (${lv.board}×${lv.board}, 예산=${b}, combat=${lv.combat ? 'O' : 'X'}, spread=${lv.spread ? 'O' : 'X'}): ${r.status}  [${((Date.now() - t0) / 1000).toFixed(1)}s, 노드 ${r.nodes.toLocaleString()}]`);
}
