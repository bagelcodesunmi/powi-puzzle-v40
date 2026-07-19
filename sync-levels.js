// sync-levels.js — 레벨 데이터 단일 소스 동기화
// 소스: Level/levels.json (유일한 편집 지점)
// 대상: powi-puzzle.html 의 LEVELS, level-lab.html 의 PRESETS, emotion-curve.html 의 LEVELS
// 사용: node sync-levels.js   (json 편집 후 실행하면 게임·툴·감정곡선에 반영됨. 더블클릭 실행에도 안전 — 런타임 fetch 아님)
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const JSON_PATH = path.join(ROOT, 'Level', 'levels.json');
const GAME = path.join(ROOT, 'powi-puzzle.html');
const TOOL = path.join(ROOT, 'level-lab.html');
const CURVE = path.join(ROOT, 'emotion-curve.html');

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const saves = data.saves;
if (!Array.isArray(saves) || !saves.length) { console.error('소스 json에 레벨이 없습니다.'); process.exit(1); }

// ── 툴 "파일로 내보내기" 포맷 허용 ──
// 툴 내보내기에는 게임 필드(schedule/min/seeds/spread/exactBudget)가 없다.
// 그대로 덮어써도 동작하도록 보완하되, 무엇을 추정했는지 경고를 남긴다.
// (min은 setBudget에서 가져오고, seeds가 비면 완전 랜덤 확산이 되므로 반드시 레벨랩에서 시드를 뽑아 채울 것.)
for (const s of saves) {
  const warn = [];
  if (!Number.isInteger(s.min)) {
    if (Number.isInteger(s.setBudget)) { s.min = s.setBudget; warn.push(`min 없음 → setBudget(${s.setBudget}) 사용`); }
    else { console.error(`[중단] "${s.name}"에 min도 setBudget도 없습니다. 레벨랩에서 검토 후 예산을 정해 주세요.`); process.exit(1); }
  }
  if (!Array.isArray(s.schedule) || !s.schedule.length) { s.schedule = Array(s.min).fill(1); warn.push(`schedule 없음 → [1]×${s.min} 생성`); }
  if (typeof s.spread !== 'boolean') { s.spread = true; warn.push('spread 없음 → true'); }
  if (typeof s.exactBudget !== 'boolean') { s.exactBudget = true; warn.push('exactBudget 없음 → true'); }
  if (!Array.isArray(s.seeds)) { s.seeds = []; warn.push('⚠️ seeds 없음 → 빈 배열 (완전 랜덤 확산 — 레벨랩 시드 뽑기로 채울 것)'); }
  if (warn.length) console.warn(`[보완] ${s.name}: ${warn.join(' · ')}`);
}

const xyArr = a => '[' + (a || []).map(w => `[${w.x},${w.y}]`).join(',') + ']';
const xyObj = a => '[' + (a || []).map(w => `{ x: ${w.x}, y: ${w.y} }`).join(', ') + ']';
// 적 항목: 기본 [x,y] · hp2/개체 combat이 있으면 [x,y,hp] / [x,y,hp,combat(0/1)] (게임 loadLevel 파서와 일치)
const foeArr = a => '[' + (a || []).map(e => {
  const t = [e.x, e.y];
  if (e.hp === 2 || e.combat !== undefined) t.push(e.hp === 2 ? 2 : 1);
  if (e.combat !== undefined) t.push(e.combat ? 1 : 0);
  return `[${t.join(',')}]`;
}).join(',') + ']';

// ── 게임 LEVELS 라인 ──
function gameLine(s) {
  const p = [`board: ${s.board}`, `enemies: ${foeArr(s.enemies)}`];
  if (s.walls && s.walls.length) p.push(`walls: [${s.walls.map(w => `[${w.x},${w.y},${w.hp}]`).join(',')}]`);
  if (s.rightWalls && s.rightWalls.length) p.push(`rightWalls: ${xyArr(s.rightWalls)}`);
  if (s.downWalls && s.downWalls.length) p.push(`downWalls: ${xyArr(s.downWalls)}`);
  if (s.crackedRightWalls && s.crackedRightWalls.length) p.push(`crackedRightWalls: ${xyArr(s.crackedRightWalls)}`);
  if (s.crackedDownWalls && s.crackedDownWalls.length) p.push(`crackedDownWalls: ${xyArr(s.crackedDownWalls)}`);
  if (s.hp === 2) p.push('hp: 2');
  if (s.mirror === false) p.push('mirror: false');
  p.push(`schedule: [${s.schedule.join(',')}]`, `spread: ${s.spread !== false}`, `combat: ${!!s.combat}`, `min: ${s.min}`, `exactBudget: ${!!s.exactBudget}`);
  if (s.seeds && s.seeds.length) p.push(`seeds: [${s.seeds.join(',')}]`);
  return `  { ${p.join(', ')} }, // ${s.note || ''}`.replace(/\s+$/, '');
}

// ── 툴 PRESETS 라인 (배치·기하만, 게임 필드 제외) ──
const foeObj = a => '[' + (a || []).map(e => {
  let s = `{ x: ${e.x}, y: ${e.y}`;
  if (e.hp === 2) s += ', hp: 2';
  if (e.combat !== undefined) s += `, combat: ${!!e.combat}`;
  return s + ' }';
}).join(', ') + ']';
function presetLine(s) {
  const cracked = (s.crackedRightWalls && s.crackedRightWalls.length) || (s.crackedDownWalls && s.crackedDownWalls.length)
    ? `, crackedRightWalls: ${xyObj(s.crackedRightWalls)}, crackedDownWalls: ${xyObj(s.crackedDownWalls)}` : '';
  return `  { name: '${s.name}', board: ${s.board}, combat: ${!!s.combat}, hp: ${s.hp || 1}, mirror: ${s.mirror !== false}, ` +
    `enemies: ${foeObj(s.enemies)}, walls: [${(s.walls || []).map(w => `{ x: ${w.x}, y: ${w.y}, hp: ${w.hp} }`).join(', ')}], ` +
    `rightWalls: ${xyObj(s.rightWalls)}, downWalls: ${xyObj(s.downWalls)}${cracked} },`;
}

// const NAME = [ ... ]; 블록을 통째로 교체 (const 선언 ~ 첫 '];')
function replaceArray(src, name, body) {
  const decl = `const ${name} = [`;
  const i = src.indexOf(decl);
  if (i < 0) throw new Error(`${name} 선언을 못 찾음`);
  const j = src.indexOf('];', i);
  if (j < 0) throw new Error(`${name} 닫는 '];'를 못 찾음`);
  return src.slice(0, i) + decl + '\n' + body + '\n]' + src.slice(j + 1);
}

// ── 게임 반영 ──
let game = fs.readFileSync(GAME, 'utf8');
const gameBody =
  '  // ▼ AUTO-GENERATED — Level/levels.json 에서 생성됨. 직접 편집 금지. 재생성: node sync-levels.js\n' +
  saves.map(gameLine).join('\n');
game = replaceArray(game, 'LEVELS', gameBody);
fs.writeFileSync(GAME, game);

// ── 툴 반영 (PRESETS + PRESET_VER +1) ──
let tool = fs.readFileSync(TOOL, 'utf8');
const toolBody =
  '  // ▼ AUTO-GENERATED — Level/levels.json 에서 생성됨. 직접 편집 금지. 재생성: node sync-levels.js\n' +
  saves.map(presetLine).join('\n');
tool = replaceArray(tool, 'PRESETS', toolBody);
tool = tool.replace(/const PRESET_VER = (\d+);/, (_, n) => `const PRESET_VER = ${+n + 1};`);
fs.writeFileSync(TOOL, tool);

// ── 감정곡선 반영 (save 객체 전체를 스냅샷으로 굽는다 — file:// 열기용) ──
let curve = fs.readFileSync(CURVE, 'utf8');
const curveBody =
  '// ▼ AUTO-GENERATED — Level/levels.json 에서 생성됨. 직접 편집 금지. 재생성: node sync-levels.js\n' +
  saves.map(s => '  ' + JSON.stringify(s) + ',').join('\n');
curve = replaceArray(curve, 'LEVELS', curveBody);
fs.writeFileSync(CURVE, curve);

const ver = tool.match(/const PRESET_VER = (\d+);/)[1];
console.log(`동기화 완료: ${saves.length}개 레벨 → 게임 LEVELS + 툴 PRESETS (PRESET_VER=${ver}) + 감정곡선`);
saves.forEach((s, i) => console.log(`  L${i + 1} ${s.name}: min ${s.min}, seeds [${s.seeds}], emotion ${s.emotion || '-'}`));
