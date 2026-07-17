// sync-levels.js — 레벨 데이터 단일 소스 동기화
// 소스: Level/level-lab-v2-saves.json (유일한 편집 지점)
// 대상: powi-puzzle-v43-edge-test.html 의 LEVELS, level-lab-v4.html 의 PRESETS
// 사용: node sync-levels.js   (json 편집 후 실행하면 게임·툴에 반영됨. 더블클릭 실행에도 안전 — 런타임 fetch 아님)
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const JSON_PATH = path.join(ROOT, 'Level', 'level-lab-v2-saves.json');
const GAME = path.join(ROOT, 'powi-puzzle-v43-edge-test.html');
const TOOL = path.join(ROOT, 'level-lab-v4.html');

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const saves = data.saves;
if (!Array.isArray(saves) || !saves.length) { console.error('소스 json에 레벨이 없습니다.'); process.exit(1); }

const xyArr = a => '[' + (a || []).map(w => `[${w.x},${w.y}]`).join(',') + ']';
const xyObj = a => '[' + (a || []).map(w => `{ x: ${w.x}, y: ${w.y} }`).join(', ') + ']';

// ── 게임 LEVELS 라인 ──
function gameLine(s) {
  const p = [`board: ${s.board}`, `enemies: ${xyArr(s.enemies)}`];
  if (s.walls && s.walls.length) p.push(`walls: [${s.walls.map(w => `[${w.x},${w.y},${w.hp}]`).join(',')}]`);
  if (s.rightWalls && s.rightWalls.length) p.push(`rightWalls: ${xyArr(s.rightWalls)}`);
  if (s.downWalls && s.downWalls.length) p.push(`downWalls: ${xyArr(s.downWalls)}`);
  if (s.hp === 2) p.push('hp: 2');
  if (s.mirror === false) p.push('mirror: false');
  p.push(`schedule: [${s.schedule.join(',')}]`, `spread: ${s.spread !== false}`, `combat: ${!!s.combat}`, `min: ${s.min}`, `exactBudget: ${!!s.exactBudget}`);
  if (s.seeds && s.seeds.length) p.push(`seeds: [${s.seeds.join(',')}]`);
  return `  { ${p.join(', ')} }, // ${s.note || ''}`.replace(/\s+$/, '');
}

// ── 툴 PRESETS 라인 (배치·기하만, 게임 필드 제외) ──
function presetLine(s) {
  return `  { name: '${s.name}', board: ${s.board}, combat: ${!!s.combat}, hp: ${s.hp || 1}, mirror: ${s.mirror !== false}, ` +
    `enemies: ${xyObj(s.enemies)}, walls: [${(s.walls || []).map(w => `{ x: ${w.x}, y: ${w.y}, hp: ${w.hp} }`).join(', ')}], ` +
    `rightWalls: ${xyObj(s.rightWalls)}, downWalls: ${xyObj(s.downWalls)} },`;
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
  '  // ▼ AUTO-GENERATED — Level/level-lab-v2-saves.json 에서 생성됨. 직접 편집 금지. 재생성: node sync-levels.js\n' +
  saves.map(gameLine).join('\n');
game = replaceArray(game, 'LEVELS', gameBody);
fs.writeFileSync(GAME, game);

// ── 툴 반영 (PRESETS + PRESET_VER +1) ──
let tool = fs.readFileSync(TOOL, 'utf8');
const toolBody =
  '  // ▼ AUTO-GENERATED — Level/level-lab-v2-saves.json 에서 생성됨. 직접 편집 금지. 재생성: node sync-levels.js\n' +
  saves.map(presetLine).join('\n');
tool = replaceArray(tool, 'PRESETS', toolBody);
tool = tool.replace(/const PRESET_VER = (\d+);/, (_, n) => `const PRESET_VER = ${+n + 1};`);
fs.writeFileSync(TOOL, tool);

const ver = tool.match(/const PRESET_VER = (\d+);/)[1];
console.log(`동기화 완료: ${saves.length}개 레벨 → 게임 LEVELS + 툴 PRESETS (PRESET_VER=${ver})`);
saves.forEach((s, i) => console.log(`  L${i + 1} ${s.name}: min ${s.min}, seeds [${s.seeds}]`));
