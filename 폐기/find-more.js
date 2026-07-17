// 여러 레벨 시드 추가 탐색
// 실행: node find-more.js <레벨번호>

function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let z = Math.imul(seed ^ seed >>> 15, 1 | seed);
    z = z + Math.imul(z ^ z >>> 7, 61 | z) ^ z;
    return ((z ^ z >>> 14) >>> 0) / 4294967296;
  };
}
const EMPTY=0,ENEMY=-1,DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
class Timeout extends Error {}
function makeSpreadPicker(N,prng){
  const idx=(x,y)=>y*N+x,inBoard=(x,y)=>x>=0&&x<N&&y>=0&&y<N;
  function isSuicide(grid,c){const seen=new Set([c]),q=[c];let empties=0;while(q.length){const k=q.pop();if(grid[k]===EMPTY)empties++;if(empties>1)return false;const kx=k%N,ky=(k/N)|0;for(const[dx,dy]of DIRS){const nx=kx+dx,ny=ky+dy;if(!inBoard(nx,ny))continue;const ni=idx(nx,ny);if(grid[ni]!==undefined&&grid[ni]<=0&&!seen.has(ni)){seen.add(ni);q.push(ni);}}}return empties===1;}
  function pickSpreadCell(grid){const frontier=new Set();for(let i=0;i<N*N;i++){if(grid[i]!==ENEMY)continue;const cx=i%N,cy=(i/N)|0;for(const[dx,dy]of DIRS){const nx=cx+dx,ny=cy+dy;if(inBoard(nx,ny)&&grid[idx(nx,ny)]===EMPTY)frontier.add(idx(nx,ny));}}if(frontier.size===0)return null;const weigh=(a)=>{const o=[];for(const i of frontier){if(!a&&isSuicide(grid,i))continue;const cx=i%N,cy=(i/N)|0;let op=0;for(const[dx,dy]of DIRS){const nx=cx+dx,ny=cy+dy;if(inBoard(nx,ny)&&grid[idx(nx,ny)]===EMPTY)op++;}const w=1+op*2;for(let j=0;j<w;j++)o.push(i);}return o;};let w=weigh(false);if(!w.length)w=weigh(true);return w[Math.floor(prng()*w.length)];}
  return{pickSpreadCell};
}
function solve(level,seed,budget,timeMs=8000){
  const N=level.board,NN=N*N,idx=(x,y)=>y*N+x,inBoard=(x,y)=>x>=0&&x<N&&y>=0&&y<N,isBlock=v=>v>0;
  const deadline=Date.now()+timeMs;let nodes=0;
  const NB=[];for(let i=0;i<NN;i++){const x=i%N,y=(i/N)|0,ns=[];for(const[dx,dy]of DIRS){const nx=x+dx,ny=y+dy;if(nx>=0&&nx<N&&ny>=0&&ny<N)ns.push(idx(nx,ny));}NB.push(ns);}
  const prng=mulberry32(seed);const fx=prng()<.5,fy=prng()<.5;
  const g0=new Array(NN).fill(EMPTY);
  for(const[x,y]of level.enemies)g0[idx(fx?N-1-x:x,fy?N-1-y:y)]=ENEMY;
  if(level.walls)for(const[x,y,hp]of level.walls)g0[idx(fx?N-1-x:x,fy?N-1-y:y)]=hp;
  const{pickSpreadCell}=makeSpreadPicker(N,prng);
  function forEachRegion(g,cb){const seen=new Uint8Array(NN);for(let i=0;i<NN;i++){if(isBlock(g[i])||seen[i])continue;const cells=[],q=[i];seen[i]=1;let hasEnemy=false,empties=0;while(q.length){const c=q.pop();cells.push(c);if(g[c]===ENEMY)hasEnemy=true;else if(g[c]===EMPTY)empties++;for(const n of NB[c])if(!isBlock(g[n])&&!seen[n]){seen[n]=1;q.push(n);}}cb(cells,hasEnemy,empties);}}
  function capture(g){const kills=[],hits=[];forEachRegion(g,(cells,hasEnemy,empties)=>{if(!hasEnemy||empties>0)return;const enemySet=new Set(cells),walls=new Set();for(const c of enemySet)for(const n of NB[c])if(isBlock(g[n]))walls.add(n);const wallOrder=[...walls].sort((a,b)=>a-b),foesOf=w=>NB[w].filter(n=>enemySet.has(n)).sort((a,b)=>a-b),matchedBy=new Map();const aug=(w,vis)=>{for(const f of foesOf(w)){if(vis.has(f))continue;vis.add(f);if(!matchedBy.has(f)||aug(matchedBy.get(f),vis)){matchedBy.set(f,w);return true;}}return false;};for(const w of wallOrder)aug(w,new Set());for(const f of matchedBy.keys())kills.push(f);if(level.combat){const foeOrder=[...enemySet].sort((a,b)=>a-b),wallsOfFoe=f=>NB[f].filter(n=>isBlock(g[n])).sort((a,b)=>(g[a]-g[b])||(a-b)),hitBy=new Map();const augC=(f,vis)=>{for(const w of wallsOfFoe(f)){if(vis.has(w))continue;vis.add(w);if(!hitBy.has(w)||augC(hitBy.get(w),vis)){hitBy.set(w,f);return true;}}return false;};for(const f of foeOrder)augC(f,new Set());for(const w of hitBy.keys())hits.push(w);}});if(!kills.length)return false;for(const f of kills)g[f]=EMPTY;for(const w of hits){g[w]--;if(g[w]===0)g[w]=EMPTY;}return true;}
  function enemyCnt(g){let n=0;for(let i=0;i<NN;i++)if(g[i]===ENEMY)n++;return n;}
  function enemyTurn(g){const next=pickSpreadCell(g);if(next===null)return[null];const g2=g.slice();g2[next]=ENEMY;capture(g2);return[enemyCnt(g2)===0?null:g2];}
  function candidateMoves(g){const out=[];forEachRegion(g,(cells,hasEnemy)=>{if(hasEnemy)for(const c of cells)if(g[c]===EMPTY)out.push(c);});return out;}
  const memo=new Map();
  function win(g,stones){if(Date.now()>deadline)throw new Timeout();nodes++;const key=g.join(',')+`|${stones}`;const hit=memo.get(key);if(hit!==undefined)return hit;let result=false;if(stones<=0){memo.set(key,false);return false;}for(const m of candidateMoves(g)){const g2=g.slice();g2[m]=level.hp||1;capture(g2);if(enemyCnt(g2)===0){result=true;break;}const branches=enemyTurn(g2);let all=true;for(const g3 of branches){if(g3===null)continue;if(stones-1<=0){all=false;break;}if(!win(g3,stones-1)){all=false;break;}}if(all){result=true;break;}}if(memo.size<5_000_000)memo.set(key,result);return result;}
  try{return{status:win(g0,budget)?'PASS':'FAIL',nodes};}catch(e){if(e instanceof Timeout)return{status:'TIMEOUT',nodes};throw e;}
}

const CONFIGS = {
  6:  { level:{board:5,enemies:[[1,1]],spread:true,combat:false}, budget:9, base:600000, exclude:[], target:5, range:100, timeMs:5000 },
  7:  { level:{board:5,enemies:[[2,1]],spread:true,combat:false}, budget:8, base:700000, exclude:[700001,700002,700003], target:1, range:50,  timeMs:8000 },
  11: { level:{board:4,enemies:[[0,0]],spread:true,combat:true},  budget:4, base:1100000,exclude:[1100001,1100002,1100003],target:1, range:50,  timeMs:5000 },
  12: { level:{board:4,enemies:[[1,1]],spread:true,combat:true},  budget:6, base:1200000,exclude:[1200001,1200002,1200003],target:1, range:50,  timeMs:5000 },
  14: { level:{board:5,enemies:[[2,1]],spread:true,combat:true},  budget:8, base:1400000,exclude:[1400001,1400004,1400005,1400006],target:1, range:100, timeMs:8000 },
  15: { level:{board:6,enemies:[[0,0],[2,0]],hp:2,spread:true,combat:true}, budget:13, base:1500000,exclude:[], target:5, range:50, timeMs:10000 },
};

const arg = Number(process.argv[2]);
const cfg = CONFIGS[arg];
if (!cfg) { console.log('사용법: node find-more.js <레벨번호>'); console.log('지원:', Object.keys(CONFIGS).join(', ')); process.exit(1); }

const excSet = new Set(cfg.exclude);
const found = [];
console.log(`레벨 ${arg} 추가 시드 탐색 (예산 ${cfg.budget}, 목표 ${cfg.target}개)\n`);
for (let t = 1; t <= cfg.range && found.length < cfg.target; t++) {
  const seed = cfg.base + t;
  if (excSet.has(seed)) continue;
  const r = solve(cfg.level, seed, cfg.budget, cfg.timeMs);
  process.stdout.write(`\r${t}/${cfg.range} 시도, 통과 ${found.length}/${cfg.target}  `);
  if (r.status === 'PASS') found.push(seed);
}
console.log(`\n결과: [${found.join(',')}]  (${found.length}개)`);
