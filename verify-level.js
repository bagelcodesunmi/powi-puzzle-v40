// verify-level.js — 레벨 헤드리스 검증 CLI (v43 가이드 §14 체크리스트 ①~③ 자동화)
// 엔진은 level-lab.html의 워커 소스를 그대로 추출해 사용 — 게임/툴 규칙과 드리프트 없음.
//
// 사용법:
//   ① min 확정 + 예고봇 승률:
//      node verify-level.js '{"board":5,"enemies":[[1,3]],"downWalls":[[1,2]],"combat":true}' --cap 6 --runs 2000
//   ② 정확히 N턴 확인 (min-1 예산 우호 확산 5000판 0승이어야 학습 레벨 적합):
//      ... --exact
//   ③ 시드 탐색 (base+1부터 순차, solveWithSeed PASS만 채택 — 미러 반전 포함):
//      ... --seeds 900000,4        (base, 개수)
//   지정 예산 승률 (min 대신):  --budget 5
//   보장 수 찾기 (현재 국면에서 최악 확산에도 이기는 수 — 실플레이 검증용):
//      node verify-level.js '<cfg>' --winmove '{"stones":[[1,2]],"budget":3,"ann":[1,3]}'
//      cfg의 enemies는 "현재" 적 칸 전부, stones는 내 돌, ann은 예고 칸(없으면 null)
//
// cfg 필드: board, enemies[[x,y]], rightWalls[[x,y]], downWalls[[x,y]], walls[[x,y,hp]], combat, hp, mirror(시드 검증용)
const fs = require('fs');
const path = require('path');
const LAB = path.join(__dirname, 'level-lab.html');

let code = fs.readFileSync(LAB, 'utf8').match(/<script type="text\/worker" id="workerSrc">([\s\S]*?)<\/script>/)[1];
code = code.replace(/const P = t => self\.postMessage[\s\S]*$/, '');
const eng = new Function('self', code + `
return { solveMin, mcStats, solveWithSeed, makeCtx, capture, isSuicide, spreadChoices, candidateMoves, foeCells, spawnFoe };`)({ postMessage() {} });

const args = process.argv.slice(2);
if (!args[0] || args[0].startsWith('--')) {
  console.log('사용법은 파일 상단 주석 참조. 첫 인자로 cfg JSON을 넘기세요.');
  process.exit(1);
}
const cfg = JSON.parse(args[0]);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const cap = parseInt(opt('--cap', '8'), 10);
const runs = parseInt(opt('--runs', '2000'), 10);
const budget = args.includes('--budget') ? parseInt(opt('--budget'), 10) : null;

// ── 보장 수 모드: 현재 국면에서 최악 확산에도 승리가 보장되는 수 목록 ──
if (args.includes('--winmove')) {
  const st = JSON.parse(opt('--winmove'));
  const N = cfg.board, EMPTY = 0;
  const C = eng.makeCtx(N, cfg.rightWalls || [], cfg.downWalls || []);
  const b0 = new Array(N * N).fill(EMPTY);
  for (const e of eng.foeCells(cfg)) b0[e.y * N + e.x] = e.v;   // 적 속성(hp·combat) 인코딩 포함
  for (const [x, y] of st.stones || []) b0[y * N + x] = 1;
  const ann0 = st.ann ? st.ann[1] * N + st.ann[0] : null;
  const enemyCnt = bb => { let n = 0; for (const v of bb) if (v < 0) n++; return n; };
  const memo = new Map();
  function win(b, stones, s) {
    if (stones <= 0) return false;
    const key = b.join(',') + '|' + stones + '|' + s;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let result = false;
    for (const m of eng.candidateMoves(b, C)) if (winWith(b, stones, s, m)) { result = true; break; }
    if (memo.size < 4000000) memo.set(key, result);
    return result;
  }
  function winWith(b, stones, s, m) {
    const g2 = b.slice(); g2[m] = 1;
    eng.capture(g2, C, false);                     // 속성은 셀 값에 인코딩 (foeCells)
    if (enemyCnt(g2) === 0) return true;
    const choices0 = eng.spreadChoices(g2, C);
    const sValid = s !== null && g2[s] === EMPTY && C.nbrs[s].some(n => g2[n] < 0);
    let pick;
    if (sValid) {
      const sSafe = !eng.isSuicide(g2, C, s);
      const allSui = choices0.length > 0 && choices0.every(c => eng.isSuicide(g2, C, c));
      pick = (sSafe || allSui) ? [s] : choices0;
    } else pick = choices0;
    if (!pick.length) return win(g2, stones - 1, null);   // 적 확산 불가(정지): 무행동 후 계속
    for (const sc of pick) {
      const g3 = g2.slice(); g3[sc] = eng.spawnFoe(g2, C, sc);
      eng.capture(g3, C, false);
      if (enemyCnt(g3) === 0) continue;
      if (stones - 1 <= 0) return false;
      const anns = eng.spreadChoices(g3, C);       // 예고 없음 = 정지 상태로 계속
      if (!anns.length) { if (!win(g3, stones - 1, null)) return false; continue; }
      for (const ann of anns) if (!win(g3, stones - 1, ann)) return false;
    }
    return true;
  }
  const good = [];
  for (const m of eng.candidateMoves(b0, C)) if (winWith(b0, st.budget, ann0, m)) good.push([m % N, (m / N) | 0]);
  console.log(JSON.stringify({ guaranteed: good }));
  process.exit(0);
}

// ── 기본 모드: 솔버 min + 예고봇 + (옵션) 정확성·시드 ──
(async () => {
  const out = {};
  const t0 = Date.now();
  const r = eng.solveMin(cfg, Math.max(cap, budget || 0), null);
  out.solver = { min: r.min, nodes: r.nodes, ms: Date.now() - t0 };
  const useBudget = budget ?? r.min;
  if (useBudget != null) {
    const mc = eng.mcStats(cfg, useBudget, runs);
    out.bot = { budget: useBudget, runs, winRate: +(mc.winRate * 100).toFixed(1), median: mc.median };
    if (r.min != null && budget != null && budget !== r.min) {
      const mcMin = eng.mcStats(cfg, r.min, runs);
      out.botAtMin = { budget: r.min, winRate: +(mcMin.winRate * 100).toFixed(1) };
    }
    if (args.includes('--exact') && useBudget > 1) {
      const mcLess = eng.mcStats(cfg, useBudget - 1, 5000);
      out.exactCheck = { budget: useBudget - 1, runs: 5000, wins: mcLess.wins, ok: mcLess.wins === 0 };
    }
  }
  const seedSpec = opt('--seeds', null);
  if (seedSpec && useBudget != null) {
    const [baseS, cntS] = seedSpec.split(',');
    const base = parseInt(baseS, 10), want = parseInt(cntS || '3', 10);
    const mulberry32 = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let z = Math.imul(s ^ s >>> 15, 1 | s); z = z + Math.imul(z ^ z >>> 7, 61 | z) ^ z; return ((z ^ z >>> 14) >>> 0) / 4294967296; };
    const found = [];
    for (let t = 1; t <= 3000 && found.length < want; t++) {
      const seed = base + t;
      if (eng.solveWithSeed(cfg, seed, useBudget, Date.now() + 20000) === 'PASS') {
        let fx = false, fy = false;
        if (cfg.mirror !== false) { const p = mulberry32(seed); fx = p() < .5; fy = p() < .5; }
        found.push({ seed, fx, fy });
      }
    }
    out.seeds = { budget: useBudget, found };
  }
  console.log(JSON.stringify(out, null, 1));
})();
