// 레벨 15 예산 12, 시드 100개 샘플 → 5개 확보
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let z = Math.imul(seed ^ seed >>> 15, 1 | seed);
    z = z + Math.imul(z ^ z >>> 7, 61 | z) ^ z;
    return ((z ^ z >>> 14) >>> 0) / 4294967296;
  };
}
const EMPTY = 0, ENEMY = -1;
const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
class Timeout extends Error {}

function makeSpreadPicker(N, prng) {
  const idx=(x,y)=>y*N+x, inBoard=(x,y)=>x>=0&&x<N&&y>=0&&y<N;
  function isSuicide(grid,c) {
    const seen=new Set([c]),q=[c]; let empties=0;
    while(q.length){const k=q.pop(); if(grid[k]===EMPTY)empties++; if(empties>1)return false;
      const kx=k%N,ky=(k/N)|0;
      for(const[dx,dy]of DIRS){const nx=kx+dx,ny=ky+dy; if(!inBoard(nx,ny))continue; const ni=idx(nx,ny); if(grid[ni]!==undefined&&grid[ni]<=0&&!seen.has(ni)){seen.add(ni);q.push(ni);}}}
    return empties===1;
  }
  function pickSpreadCell(grid) {
    const frontier=new Set();
    for(let i=0;i<N*N;i++){if(grid[i]!==ENEMY)continue; const cx=i%N,cy=(i/N)|0;
      for(const[dx,dy]of DIRS){const nx=cx+dx,ny=cy+dy; if(inBoard(nx,ny)&&grid[idx(nx,ny)]===EMPTY)frontier.add(idx(nx,ny));}}
    if(frontier.size===0)return null;
    const weigh=(allowSuicide)=>{const out=[];
      for(const i of frontier){if(!allowSuicide&&isSuicide(grid,i))continue;
        const cx=i%N,cy=(i/N)|0; let openness=0;
        for(const[dx,dy]of DIRS){const nx=cx+dx,ny=cy+dy; if(inBoard(nx,ny)&&grid[idx(nx,ny)]===EMPTY)openness++;}
        const w=1+openness*2; for(let j=0;j<w;j++)out.push(i);}return out;};
    let weighted=weigh(false); if(weighted.length===0)weighted=weigh(true);
    return weighted[Math.floor(prng()*weighted.length)];
  }
  return{pickSpreadCell};
}

function solve(level,seed,budget,timeMs=8000){
  const N=level.board,NN=N*N,idx=(x,y)=>y*N+x,inBoard=(x,y)=>x>=0&&x<N&&y>=0&&y<N,isBlock=v=>v>0;
  const deadline=Date.now()+timeMs; let nodes=0;
  const NB=[]; for(let i=0;i<NN;i++){const x=i%N,y=(i/N)|0,ns=[]; for(const[dx,dy]of DIRS){const nx=x+dx,ny=y+dy; if(nx>=0&&nx<N&&ny>=0&&ny<N)ns.push(idx(nx,ny));} NB.push(ns);}
  const prng=mulberry32(seed); const fx=prng()<.5,fy=prng()<.5;
  const g0=new Array(NN).fill(EMPTY);
  for(const[x,y]of level.enemies)g0[idx(fx?N-1-x:x,fy?N-1-y:y)]=ENEMY;
  if(level.walls)for(const[x,y,hp]of level.walls)g0[idx(fx?N-1-x:x,fy?N-1-y:y)]=hp;
  const{pickSpreadCell}=makeSpreadPicker(N,prng);
  function forEachRegion(g,cb){const seen=new Uint8Array(NN); for(let i=0;i<NN;i++){if(isBlock(g[i])||seen[i])continue; const cells=[],q=[i];seen[i]=1;let hasEnemy=false,empties=0; while(q.length){const c=q.pop();cells.push(c);if(g[c]===ENEMY)hasEnemy=true;else if(g[c]===EMPTY)empties++;for(const n of NB[c])if(!isBlock(g[n])&&!seen[n]){seen[n]=1;q.push(n);}} cb(cells,hasEnemy,empties);}}
  function capture(g){const kills=[],hits=[];
    forEachRegion(g,(cells,hasEnemy,empties)=>{if(!hasEnemy||empties>0)return;
      const enemySet=new Set(cells),walls=new Set();
      for(const c of enemySet)for(const n of NB[c])if(isBlock(g[n]))walls.add(n);
      const wallOrder=[...walls].sort((a,b)=>a-b),foesOf=w=>NB[w].filter(n=>enemySet.has(n)).sort((a,b)=>a-b),matchedBy=new Map();
      const aug=(w,vis)=>{for(const f of foesOf(w)){if(vis.has(f))continue;vis.add(f);if(!matchedBy.has(f)||aug(matchedBy.get(f),vis)){matchedBy.set(f,w);return true;}}return false;};
      for(const w of wallOrder)aug(w,new Set()); for(const f of matchedBy.keys())kills.push(f);
      if(level.combat){const foeOrder=[...enemySet].sort((a,b)=>a-b),wallsOfFoe=f=>NB[f].filter(n=>isBlock(g[n])).sort((a,b)=>(g[a]-g[b])||(a-b)),hitBy=new Map();
        const augC=(f,vis)=>{for(const w of wallsOfFoe(f)){if(vis.has(w))continue;vis.add(w);if(!hitBy.has(w)||augC(hitBy.get(w),vis)){hitBy.set(w,f);return true;}}return false;};
        for(const f of foeOrder)augC(f,new Set()); for(const w of hitBy.keys())hits.push(w);}});
    if(!kills.length)return false; for(const f of kills)g[f]=EMPTY; for(const w of hits){g[w]--;if(g[w]===0)g[w]=EMPTY;} return true;}
  function enemyCnt(g){let n=0;for(let i=0;i<NN;i++)if(g[i]===ENEMY)n++;return n;}
  function enemyTurn(g){const next=pickSpreadCell(g);if(next===null)return[null];const g2=g.slice();g2[next]=ENEMY;capture(g2);return[enemyCnt(g2)===0?null:g2];}
  function candidateMoves(g){const out=[];forEachRegion(g,(cells,hasEnemy)=>{if(hasEnemy)for(const c of cells)if(g[c]===EMPTY)out.push(c);}); return out;}
  const memo=new Map();
  function win(g,stones){if(Date.now()>deadline)throw new Timeout();nodes++;const key=g.join(',')+`|${stones}`;const hit=memo.get(key);if(hit!==undefined)return hit;
    let result=false; if(stones<=0){memo.set(key,false);return false;}
    for(const m of candidateMoves(g)){const g2=g.slice();g2[m]=level.hp||1;capture(g2);if(enemyCnt(g2)===0){result=true;break;}
      const branches=enemyTurn(g2);let all=true;
      for(const g3 of branches){if(g3===null)continue;if(stones-1<=0){all=false;break;}if(!win(g3,stones-1)){all=false;break;}}
      if(all){result=true;break;}}
    if(memo.size<5_000_000)memo.set(key,result);return result;}
  try{return{status:win(g0,budget)?'PASS':'FAIL',nodes};}catch(e){if(e instanceof Timeout)return{status:'TIMEOUT',nodes};throw e;}
}

const LEVEL15={board:6,enemies:[[0,0],[2,0]],hp:2,spread:true,combat:true};
const BUDGET=12, TARGET=5, RANGE=100;
const found=[];

console.log(`레벨 15 예산 ${BUDGET}, 시드 ${RANGE}개 탐색 → ${TARGET}개 목표\n`);
for(let t=1;t<=RANGE&&found.length<TARGET;t++){
  const seed=1500000+t;
  const r=solve(LEVEL15,seed,BUDGET,8000);
  process.stdout.write(`\r${t}/${RANGE} 시도, 통과 ${found.length}/${TARGET}  `);
  if(r.status==='PASS') found.push(seed);
}
console.log(`\n\n결과: seeds: [${found.join(',')}]  (${found.length}개 확보)`);
