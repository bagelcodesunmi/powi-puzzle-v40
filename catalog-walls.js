// catalog-walls.js — "적 1기 + edge wall 0~1개" 전 경우의 수 카탈로그 생성/검색
// 엔진은 level-lab.html의 워커 소스를 그대로 추출해 사용 (게임 규칙과 드리프트 없음).
//
// 생성: node catalog-walls.js --build 4            (4×4, combat 양쪽, 대칭 중복 제거)
//       node catalog-walls.js --build 5 --cap 6    (5×5, min>6 은 "min: null"로 기록)
//       옵션: --runs 800 (예고봇 판수) --cap 6 (솔버 예산 상한)
//       결과: Level/catalog-b{N}.json
// 검색: node catalog-walls.js --query 4 --combat true --min 3 --bot-min 90
//       옵션: --min N (정확히) --min-max N --bot-min % --bot-max % --combat true|false
//
// 카탈로그는 대칭 대표형만 담는다 — 실제 레벨로 쓸 때는 미러링이 알아서 4변형을 보여주므로
// 방향이 중요하면 원하는 반전을 직접 골라 배치하면 된다.
// shieldedCorner=true 는 v43 가이드 §9-6 차폐 코너(코너 적 옆면 벽) — 초반 레벨 사용 금지 표시.
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const LAB = path.join(ROOT, 'level-lab.html');

let code = fs.readFileSync(LAB, 'utf8').match(/<script type="text\/worker" id="workerSrc">([\s\S]*?)<\/script>/)[1];
code = code.replace(/const P = t => self\.postMessage[\s\S]*$/, '');
// 대량 배치용 메모 상한 축소 (정확성 불변 — 캐시 크기만 줄임): 병렬 샤드에서 메모리 스래싱으로
// 타임아웃 체크(3만 노드 주기)가 수 시간씩 밀리는 문제 방지 (2026-07-19)
code = code.replace('memo.size < 4000000', 'memo.size < 400000');
const eng = new Function('self', code + 'return { solveMin, mcStats };')({ postMessage() {} });

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };

// 카탈로그 스냅샷을 catalog-snapshot.js로 굽는다 (file:// 더블클릭 지원 — <script src>는 file://에서도 로드됨).
// 압축 배열 포맷: [combat, ex, ey, wallsStr('d2,1|r0,0'), min(-1=null), bot(-1=없음), median(-1), flags(1=차폐,2=타임아웃)]
function syncViewer() {
  const OUT = path.join(ROOT, 'catalog-snapshot.js');
  const boards = {};
  for (const f of fs.readdirSync(path.join(ROOT, 'Level'))) {
    const m2 = f.match(/^catalog-b(\d+)(w2)?\.json$/);
    if (!m2) continue;
    const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'Level', f), 'utf8'));
    if (!boards[m2[1]]) boards[m2[1]] = [];
    boards[m2[1]].push(...cat.entries.map(r => {
      const ws = r.walls || (r.wall ? [r.wall] : []);
      return [
        r.combat ? 1 : 0, r.enemy[0], r.enemy[1],
        ws.map(w => w.type + w.x + ',' + w.y).join('|'),
        r.min ?? -1,
        r.bot !== undefined ? r.bot : -1,
        r.botMedian ?? -1,
        (r.shieldedCorner ? 1 : 0) | (r.timedOut ? 2 : 0),
      ];
    }));   // 벽1(b{N})·벽2(b{N}w2) 병합
  }
  const snap = { builtAt: new Date().toISOString(), boards };
  fs.writeFileSync(OUT, `// AUTO-GENERATED — node catalog-walls.js --sync-viewer 로 재생성. 직접 편집 금지.\nwindow.CATALOG_SNAPSHOT = ${JSON.stringify(snap)};\n`);
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`viewer 스냅샷 갱신: catalog-snapshot.js (${kb}KB, 보드 ${Object.keys(boards).join(', ')})`);
}

// ── 대칭 정규화: D4 8변형에서 최소 직렬화를 대표형으로 ──
// 벽은 인접 셀 쌍으로 표현해 변환 후 다시 rightWall/downWall로 복원한다.
function transforms(N) {
  const t = [];
  for (const flip of [false, true])
    for (let rot = 0; rot < 4; rot++)
      t.push(([x, y]) => {
        if (flip) x = N - 1 - x;
        for (let r = 0; r < rot; r++) { const nx = N - 1 - y, ny = x; x = nx; y = ny; }
        return [x, y];
      });
  return t;
}
const wKey = w => `${w.type}${w.x},${w.y}`;
function mapWall(tf, wall) {
  const a = tf([wall.x, wall.y]);
  const b = tf(wall.type === 'r' ? [wall.x + 1, wall.y] : [wall.x, wall.y + 1]);
  if (a[1] === b[1]) return { type: 'r', x: Math.min(a[0], b[0]), y: a[1] };
  return { type: 'd', x: a[0], y: Math.min(a[1], b[1]) };
}
function canonical(N, enemy, walls) {  // walls: {type:'r'|'d', x, y} 배열 (0~n개)
  let best = null, bestCfg = null;
  for (const tf of transforms(N)) {
    const e = tf(enemy);
    const ws = walls.map(w => mapWall(tf, w)).sort((a, z) => wKey(a) < wKey(z) ? -1 : 1);
    const key = `${e[0]},${e[1]}|${ws.length ? ws.map(wKey).join('|') : '-'}`;
    if (best === null || key < best) { best = key; bestCfg = { enemy: e, walls: ws }; }
  }
  return { key: best, cfg: bestCfg };
}
function isShieldedCorner(N, [ex, ey], walls) {  // 코너 적의 옆면(인접 면)에 벽
  const corner = (ex === 0 || ex === N - 1) && (ey === 0 || ey === N - 1);
  if (!corner) return false;
  return (walls || []).some(wall => {
    const cells = wall.type === 'r'
      ? [[wall.x, wall.y], [wall.x + 1, wall.y]]
      : [[wall.x, wall.y], [wall.x, wall.y + 1]];
    return cells.some(([x, y]) => x === ex && y === ey);
  });
}

if (args.includes('--build')) {
  const N = parseInt(opt('--build'), 10);
  const cap = parseInt(opt('--cap', '6'), 10);
  const runs = parseInt(opt('--runs', '800'), 10);
  const entryTimeout = parseInt(opt('--entry-timeout', '300000'), 10);  // 항목당 솔브 제한 (ms)
  const shard = opt('--shard', null);                                   // "i/k": k개 프로세스 병렬 실행용
  const [shardI, shardK] = shard ? shard.split('/').map(Number) : [0, 1];
  const wallsN = parseInt(opt('--walls', '1'), 10);                     // 1 = 벽 0~1개, 2 = 정확히 벽 2개 (별도 파일 w2)
  const allWalls = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N - 1; x++) allWalls.push({ type: 'r', x, y });
  for (let y = 0; y < N - 1; y++) for (let x = 0; x < N; x++) allWalls.push({ type: 'd', x, y });
  const seen = new Set(); const combos = [];
  for (let ey = 0; ey < N; ey++) for (let ex = 0; ex < N; ex++) {
    const sets = wallsN === 2
      ? allWalls.flatMap((a, i) => allWalls.slice(i + 1).map(b => [a, b]))
      : [[], ...allWalls.map(w => [w])];
    for (const ws of sets) {
      const { key, cfg } = canonical(N, [ex, ey], ws);
      if (seen.has(key)) continue;
      seen.add(key);
      combos.push(cfg);
    }
  }
  const suffix = wallsN === 2 ? 'w2' : '';
  const mainFile = path.join(ROOT, 'Level', `catalog-b${N}${suffix}.json`);
  const file = shard ? path.join(ROOT, 'Level', `catalog-b${N}${suffix}.shard${shardI}.json`) : mainFile;
  const wallsOf = r => r.walls || (r.wall ? [r.wall] : []);
  const rkey = r => `${r.combat}|${r.enemy[0]},${r.enemy[1]}|${wallsOf(r).length ? wallsOf(r).map(wKey).join('|') : '-'}`;
  // 이어하기 규칙: min 확정 항목은 유지. min null(cap 초과·타임아웃) 항목은
  // 지금 cap이 그때보다 크면 재계산, 아니면 유지. 샤드 실행 시 본 파일의 유효 항목도 스킵 대상.
  const out = [];
  const doneKeys = new Set();
  const loadInto = (f, keepRecords) => {
    if (!fs.existsSync(f)) return;
    for (const r of JSON.parse(fs.readFileSync(f, 'utf8')).entries) {
      const redo = r.min === null && (r.cap === undefined || r.cap < cap);
      if (redo) continue;
      if (keepRecords) out.push(r);
      doneKeys.add(rkey(r));
    }
  };
  loadInto(file, true);
  if (shard) loadInto(mainFile, false);
  console.log(`${N}×${N}: 대표형 ${combos.length}개 × combat 2 = ${combos.length * 2} solve (cap ${cap}, runs ${runs}${shard ? `, 샤드 ${shard}` : ''}, 기존 ${doneKeys.size}개 스킵)`);
  const save = () => fs.writeFileSync(file, JSON.stringify({ board: N, cap, runs, builtAt: new Date().toISOString(), entries: out }, null, 1));
  let done = 0, idx = -1;
  for (const combat of [false, true]) {
    for (const { enemy, walls } of combos) {
      idx++;
      if (shard && idx % shardK !== shardI) continue;
      const rec0 = { board: N, combat, enemy };
      if (walls.length === 1) rec0.wall = walls[0];        // 벽1 카탈로그 하위호환 필드
      else if (walls.length >= 2) rec0.walls = walls;
      else rec0.wall = null;
      if (doneKeys.has(rkey(rec0))) continue;
      const cfg = {
        board: N, enemies: [enemy], combat,
        rightWalls: walls.filter(w => w.type === 'r').map(w => [w.x, w.y]),
        downWalls: walls.filter(w => w.type === 'd').map(w => [w.x, w.y]),
      };
      const t0 = Date.now();
      const deadline = t0 + entryTimeout;
      let r, timedOut = false;
      try {
        r = eng.solveMin(cfg, cap, () => { if (Date.now() > deadline) throw new Error('entry-timeout'); });
      } catch (e) {
        if (e.message !== 'entry-timeout') throw e;
        r = { min: null }; timedOut = true;
      }
      const rec = {
        ...rec0,
        min: r.min, cap, solveMs: Date.now() - t0,
        shieldedCorner: isShieldedCorner(N, enemy, walls),
      };
      if (timedOut) rec.timedOut = true;
      if (r.min !== null) {
        const mc = eng.mcStats(cfg, r.min, runs);
        rec.bot = +(mc.winRate * 100).toFixed(1);
        rec.botMedian = mc.median;
      }
      out.push(rec);
      done++;
      save();
      console.log(`  +${done} enemy ${enemy} wall ${walls.length ? walls.map(wKey).join('|') : '-'} combat ${combat} → min ${r.min}${timedOut ? ' (timeout)' : ''}, ${Date.now() - t0}ms`);
    }
  }
  save();
  console.log(`저장: ${file} (${out.length}개 항목)`);
  if (!shard) syncViewer();   // 샤드 실행은 병합(--merge) 시점에 굽는다
} else if (args.includes('--merge')) {
  // 샤드 파일들을 본 카탈로그로 병합: min 확정 > 높은 cap의 null 순으로 우선. --walls 2 는 w2 파일 대상.
  const N = parseInt(opt('--merge'), 10);
  const suffix = parseInt(opt('--walls', '1'), 10) === 2 ? 'w2' : '';
  const mainFile = path.join(ROOT, 'Level', `catalog-b${N}${suffix}.json`);
  const wallsOf = r => r.walls || (r.wall ? [r.wall] : []);
  const rkey = r => `${r.combat}|${r.enemy[0]},${r.enemy[1]}|${wallsOf(r).length ? wallsOf(r).map(wKey).join('|') : '-'}`;
  const best = new Map();
  const rank = r => (r.min !== null ? 1e9 : (r.cap || 0));
  const files = [mainFile, ...fs.readdirSync(path.join(ROOT, 'Level')).filter(f => f.startsWith(`catalog-b${N}${suffix}.shard`)).map(f => path.join(ROOT, 'Level', f))];
  let maxCap = 0, runsV = 800;
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const cat = JSON.parse(fs.readFileSync(f, 'utf8'));
    maxCap = Math.max(maxCap, cat.cap || 0); runsV = cat.runs || runsV;
    for (const r of cat.entries) {
      const k = rkey(r);
      if (!best.has(k) || rank(r) > rank(best.get(k))) best.set(k, r);
    }
  }
  const entries = [...best.values()];
  fs.writeFileSync(mainFile, JSON.stringify({ board: N, cap: maxCap, runs: runsV, builtAt: new Date().toISOString(), entries }, null, 1));
  for (const f of files.slice(1)) fs.unlinkSync(f);
  console.log(`병합 완료: ${mainFile} (${entries.length}개 항목, 샤드 ${files.length - 1}개 삭제)`);
  syncViewer();
} else if (args.includes('--sync-viewer')) {
  syncViewer();
} else if (args.includes('--query')) {
  const N = parseInt(opt('--query'), 10);
  const suffix = parseInt(opt('--walls', '1'), 10) === 2 ? 'w2' : '';
  const file = path.join(ROOT, 'Level', `catalog-b${N}${suffix}.json`);
  const cat = JSON.parse(fs.readFileSync(file, 'utf8'));
  let rows = cat.entries;
  if (args.includes('--combat')) rows = rows.filter(r => r.combat === (opt('--combat') === 'true'));
  if (args.includes('--min')) rows = rows.filter(r => r.min === parseInt(opt('--min'), 10));
  if (args.includes('--min-max')) rows = rows.filter(r => r.min !== null && r.min <= parseInt(opt('--min-max'), 10));
  if (args.includes('--bot-min')) rows = rows.filter(r => r.bot !== undefined && r.bot >= parseFloat(opt('--bot-min')));
  if (args.includes('--bot-max')) rows = rows.filter(r => r.bot !== undefined && r.bot <= parseFloat(opt('--bot-max')));
  if (!args.includes('--shielded')) rows = rows.filter(r => !r.shieldedCorner);
  rows.sort((a, b) => (a.min ?? 99) - (b.min ?? 99) || (b.bot ?? 0) - (a.bot ?? 0));
  for (const r of rows) {
    const ws = r.walls || (r.wall ? [r.wall] : []);
    const w = ws.length ? ws.map(x => `${x.type === 'r' ? 'rightWall' : 'downWall'} [${x.x},${x.y}]`).join(' + ') : '벽 없음';
    console.log(`enemy [${r.enemy}] · ${w} · combat ${r.combat} → min ${r.min ?? '>cap'} · 예고봇 ${r.bot ?? '-'}% (median ${r.botMedian ?? '-'})${r.shieldedCorner ? ' ⚠️차폐코너' : ''}`);
  }
  console.log(`— ${rows.length}개 일치 (카탈로그 ${cat.entries.length}개, cap ${cat.cap}, runs ${cat.runs})`);
} else {
  console.log('사용법: node catalog-walls.js --build N [--cap 6 --runs 800] | --query N [--combat true --min 3 --bot-min 90 --bot-max 100 --min-max 5 --shielded]');
}
