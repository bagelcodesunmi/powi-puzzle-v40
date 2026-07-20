# 포위퍼즐 도구 레퍼런스

> 에이전트는 작업 전 이 파일을 참조해 올바른 도구를 선택한다.
> 마지막 업데이트: 2026-07-20
> ⚠️ 현재 게임(`powi-puzzle.html`)에서 쓰지 않는 파일은 전부 `archive/`로 이동했다 (2026-07-18):
>   구버전 도구·탐색 스크립트(budget-scan*, budget-test, find-*, level-lab-v2/v3,
>   solver-v40.js, seed-validator.js — 둘 다 edge wall 미지원), 구 프로토타입(v40~v42, v43 뼈대, v41),
>   레벨-감정곡선.html. 아래 상세 설명의 해당 파일은 `archive/` 경로 기준으로 읽을 것.
> `level-lab.html`은 edge wall(rightWalls/downWalls)을 지원한다 —
>   경계벽 배치, 적대 솔버 min 산출, 시드 뽑기(미러링 포함), 예산 직접 지정까지 게임 규칙과 동일.
>   edge wall 레벨 검증 절차는 `v43-edge-wall-guide.md` §14 체크리스트를 따른다.

## 레벨 데이터 단일 소스 (2026-07-18 확정)
- **유일한 소스는 `Level/levels.json` 하나다.** 레벨 배치·min·seeds·schedule·설명(note)까지 이 파일이 전부 갖는다.
- 게임 레벨로 인식되는 이름 규칙: **`Game L숫자`** (번호 순 정렬). 다른 이름의 저장은 작업본으로만 취급.
- json 스키마(레벨당): `name, board, combat, hp, mirror, setBudget, enemies[{x,y}], walls[{x,y,hp}], rightWalls[{x,y}], downWalls[{x,y}], schedule[], spread, min, exactBudget, seeds[], note`.

### 반영 경로 (셋 다 소스는 같은 json)
1. **툴 → json 직접 저장**: level-lab의 **"게임 파일에 저장"** 버튼 (크롬/엣지, 최초 1회 `Level/levels.json` 선택).
   `Game L*` 저장만 병합 기록하고, 기존 파일의 seeds/note/schedule은 이름 기준 보존. 배치가 바뀐 레벨은 시드 재검증 경고.
2. **게임 실시간 로드**: 게임을 서버(localhost/미리보기)로 열면 `Level/levels.json`을 직접 읽는다 — **새로고침만으로 반영, sync 불필요**.
3. **더블클릭(file://) 배포용**: `node sync-levels.js` 실행 → json을 게임 `LEVELS`·툴 `PRESETS`에 굽는다 (`▼ AUTO-GENERATED` 블록, 직접 편집 금지).
   sync는 툴 내보내기 포맷(게임 필드 없음)도 허용 — min은 setBudget에서 보완하고 경고를 출력한다.
- 권장 루틴: 툴에서 편집·검토 → "게임 파일에 저장" → (서버로 연) 게임 새로고침으로 확인 → 커밋 전 `node sync-levels.js` 1회.

---

## 도구 선택 가이드

| 목적 | 사용할 도구 |
|------|------------|
| 레벨 편집 (단일 소스) | `Level/levels.json` → `node sync-levels.js`로 게임·툴·감정곡선 반영 |
| **신규 레벨 후보 탐색 (적1+벽≤2 전수 카탈로그)** | `node catalog-walls.js --query N [조건]` — 아래 상세 참조 |
| **카탈로그 시각 탐색 (보드 미리보기·필터·미러 변형)** | `catalog-viewer.html` (루트, 더블클릭 또는 서버 — 데이터는 Catalog/) |
| **레벨 헤드리스 검증 (§14 ①~③ 자동화, CLI)** | `node verify-level.js '<cfg>' [--exact --seeds --winmove]` — 아래 상세 참조 |
| 레벨 설계·검증 GUI (edge wall 포함) | `level-lab.html` (브라우저) |
| 게임 플레이 확인 | `powi-puzzle.html` (브라우저) |
| 난이도·감정 페이싱 확인 | `emotion-curve.html` (브라우저) — 예산 계단·예고봇 승률·감정 구간(도파민/스트레스/학습/전환점)을 json에서 자동 렌더링. 감정 태그는 json의 `emotion`/`tag`/`winRate` 필드로 편집 |
| 반복·지루함 위험 점검 | `emotion-curve.html` 의 **🔁 반복 경보** 섹션 — 적 위치(D4 미러 정규화)·판 구조·**구조 이식**(보드 크기만 다른 같은 로컬 패턴, 가장자리 거리 시그니처 포함)·감정 3연속을 점수화(직전 3레벨 창). **반복 상대와** 감정 반전 시 -1 완화(직전 레벨 아님). 점수 2↑ 주의·4↑ 높음. 새 레벨 추가 시 확인 (반복·다양성 정책: `curve-design-150.md`) |
| Edge wall 레벨 검증 절차 | `level-lab.html` 솔버 + `v43-edge-wall-guide.md` §14 체크리스트 |
| edge wall 없는 구 레벨 검증·시드 선별 | `archive/solver-v40.js`, `archive/seed-validator.js` |
| 구버전 예산 스캔·레벨 탐색 | `archive/` 폴더 참조 (budget-scan*, find-*) |

---

## 도구별 상세

### `catalog-walls.js` — 적1+벽≤2 전 경우의 수 카탈로그 (2026-07-18 신규, 07-19 벽2 확장)
"적 1기 + edge wall 0~1개"의 모든 배치를 대칭(D4 8변형) 중복 제거 후 전수 솔브해
`Catalog/catalog-b{N}.json`에 저장한다. 신규 레벨을 설계할 때 손으로 후보를 만드는 대신
**카탈로그에서 조건 검색**으로 시작한다. 엔진은 level-lab 워커 소스를 그대로 추출 — 게임 규칙과 드리프트 없음.

```bash
# 생성 (이미 생성돼 있으면 불필요 — b3/b4/b5 커밋됨)
node catalog-walls.js --build 4                # 4×4 (cap 6, 예고봇 800판)
node catalog-walls.js --build 5 --cap 20 --entry-timeout 300000
#   cap = 솔버 예산 상한 (min>cap은 null 기록), entry-timeout = 항목당 제한(ms, 기본 300초)
#   이어하기 지원: 재실행하면 확정 항목은 스킵, null 항목은 cap이 커졌을 때만 재계산

# 검색
node catalog-walls.js --query 4 --combat true --min 3            # 정확히 min 3
node catalog-walls.js --query 5 --combat true --bot-min 40 --bot-max 80   # 중간대
node catalog-walls.js --query 4 --min-max 5 --shielded           # 차폐 코너 포함(기본 제외)
```

*주의*:
- 카탈로그는 **대칭 대표형만** 담는다. 실제 레벨에 넣을 때 방향이 중요하면(초반 튜토리얼) 원하는 반전형으로 좌표를 변환해 쓴다.
- 예고봇 %는 800판 측정 — ±3~4%p 노이즈. 채택 전 `runs 2000+`로 재측정할 것 (레벨랩 또는 검증 스크립트).
- 벽 2개는 w2 카탈로그로 포함(2026-07-19). 벽 3개+·적 2기는 카탈로그 밖 — 스윕 스크립트로 확장.
- min은 실제값까지 계산하는 정책(cap 20) — 항목당 타임아웃(기본 300초, w2는 120초 사용) 초과분만 null(9+) 기록.
- verify-level.js/카탈로그 cfg의 enemies는 적 속성 지원: `{x,y,hp,combat}` 또는 `[x,y,hp,combat]`.
- `shieldedCorner` 플래그 = v43 가이드 §9-6 차폐 코너 (기본 검색에서 제외됨).

### `verify-level.js` — 레벨 헤드리스 검증 CLI (2026-07-19 신규)
level-lab의 워커 엔진을 추출해 **브라우저 없이** §14 체크리스트 ①~③을 수행한다.
에이전트가 직접 실행 가능 — "level-lab은 사람이 브라우저에서"라는 제약의 헤드리스 대안.

```bash
# ① min 확정 + 예고봇 승률 (2000판) + ② 정확히 N턴 + ③ 시드 탐색(미러 포함)을 한 번에
node verify-level.js '{"board":5,"enemies":[[1,3]],"downWalls":[[1,2]],"combat":true}' --cap 6 --runs 2000 --exact --seeds 900000,4

# 지정 예산 승률 (min과 다른 예산으로 잴 때)
node verify-level.js '<cfg>' --budget 5

# 보장 수 찾기 — 현재 국면에서 최악 확산에도 이기는 수 목록 (실플레이 검증 §14-④ 보조)
node verify-level.js '<cfg>' --winmove '{"stones":[[1,2]],"budget":3,"ann":[1,3]}'
```

*주의*: 5×5 심층(min 7+) 솔브는 수십 초~수 분. 시드 검증은 §14-2 한계(파티클 PRNG) 그대로 적용.
게임 규칙이 바뀌면 level-lab 워커가 바뀐 뒤 자동으로 같은 규칙을 쓴다 (추출 방식이라 드리프트 없음).

### `catalog-viewer.html` — 카탈로그 시각 탐색 GUI (2026-07-18 신규)
`Catalog/catalog-b*.json`을 읽어 후보를 (뷰어는 level-lab처럼 루트에 위치) **보드 미리보기 카드**로 보여준다.
- **서버(localhost/미리보기)로 열면** json 실시간 로드 (항상 최신).
- **더블클릭(file://)도 지원**: `Catalog/catalog-snapshot.js`(압축 스냅샷, `<script src>`는 file://에서도 로드됨)로 표시.
  스냅샷은 `--build`/`--merge` 시 자동 갱신되고, 수동 갱신은 `node catalog-walls.js --sync-viewer`.
  다른 곳으로 복사할 땐 **viewer html + Catalog/ 폴더를 함께** 옮길 것.
- 필터: 보드(3/4/5) · 전투 · min · 예고봇 대역(90%+/40~80/40미만) · 차폐 코너 포함 여부(기본 제외)
- 정렬: min ↑ / 예고봇 ↓·↑
- 카드 클릭 → 상세 패널: **좌우/상하 미러 변형 미리보기**(게임 미러링이 보여줄 4방향 확인) + 레벨 JSON 복사
- 카탈로그의 봇 %는 800판 측정 — 채택 전 2,000판 재측정 권장 (verify 스크립트 또는 level-lab)

### `solver-v40.js` — 핵심 솔버
적대적(worst-case) 방식으로 레벨 클리어 가능 여부를 검증한다.

```bash
# 전체 레벨 검증
node solver-v40.js

# 특정 레벨만 검증
node solver-v40.js 1,2,3

# 예산 지정 검증
node solver-v40.js 12,13 --budget 4

# 시간 제한 지정 (기본 90초)
node solver-v40.js 15 --time 300

# 신규 레벨 후보 JSON으로 직접 검증
node solver-v40.js --level '{"board":4,"enemies":[[1,1]],"schedule":[1,1,1,1,1,1],"spread":true,"combat":true,"min":6}' --budget 6
```

*결과 해석*:
- `PASS` ✅ — 최악의 확산에서도 예산 내 클리어 가능
- `FAIL` ❌ — 예산 내 클리어 불가
- `TIMEOUT` ⚠️ — 검증 시간 초과 (복잡한 레벨, 예산 늘리거나 구조 단순화 필요)

*주의*: 레벨 15 (6×6, 예산 9+)는 TIMEOUT 발생. 현재 solver로 검증 불가.

---

### `budget-scan.js` — 예산별 통과율 스캔
레벨을 예산 범위별로 돌려서 "예산 N이면 통과율 몇 %인지" 파악.

```bash
node budget-scan.js
node budget-scan2.js
```

*언제 사용*: 레벨의 적정 예산(min값)을 찾을 때. 특히 통과율 목표(예: 40~60%)에 맞는 예산 탐색 시.

*결과 파일*: `result_budget8.log`, `result_budget9.log` 참고

---

### `seed-validator.js` — 시드 선별기
레벨에 쓸 검증된 시드(확산 경로)를 자동으로 골라준다.

```bash
# 레벨 13, 후보 200개 중 5개 선별, 제한 30초
node seed-validator.js 13 --candidates 200 --target 5 --time 30

# 기본 실행
node seed-validator.js [레벨번호]
```

*언제 사용*: 레벨 확정 후 `schedule`에 쓸 시드 배열을 채울 때.

---

### `find-new-levels.js` — 신규 레벨 후보 탐색
조건에 맞는 새 레벨 구조를 자동으로 탐색한다.

```bash
node find-new-levels.js
```

*언제 사용*: 기획 에이전트가 새 레벨을 제안할 때 수동 설계 대신 자동 탐색.

---

### `find-lv14h.js` / `find14.js` — 레벨 14 근처 후보 탐색
레벨 14 난이도 대역(5×5, combat, 변근접)의 후보 레벨 탐색.

```bash
node find-lv14h.js
node find14.js
```

---

### `find15.js` / `find-more.js` — 레벨 15 후보 탐색
레벨 15 대역(6×6, combat, 피날레)의 후보 레벨 탐색.

```bash
node find15.js
node find-more.js
```

*현재 상태*: 레벨 15 구조 자체가 solver TIMEOUT이라 이 도구로 대안 탐색 중.

---

### `budget-test.js` — 예산 테스트 유틸
특정 조건에서 예산 범위를 빠르게 테스트하는 보조 도구.

```bash
node budget-test.js
```

---

## level-lab-v2.html / level-lab-v3.html / level-lab.html — GUI 레벨 설계 도구
브라우저에서 직접 레벨을 그리고 solver를 실행할 수 있는 GUI.
- `level-lab-v2.html`: 기존 기준 설계 도구
- `level-lab-v3.html`: v42 초반 튜토리얼 실험용
- `level-lab.html`: v43 edge wall 실험용 (도움말/가이드 반영, 편집 기능은 단계적 확장 예정)
- GUI는 사람이 브라우저에서 사용. **에이전트는 `verify-level.js`로 같은 엔진을 헤드리스 실행 가능** (2026-07-19)
- 결과를 에이전트에게 붙여넣어 주면 분석 가능

## powi-puzzle.html — edge wall 실험 플레이 파일
- 기존 baseline 흐름과 분리된 edge wall 전용 실험 파일
- 벽 실험은 이 파일에서만 수행한다
- baseline 템포/체감을 검증할 때는 `powi-puzzle-v43.html`를 사용한다

## change-checklist.md — 변경 전 확인 템플릿
- 기믹/규칙/턴 템포/레벨 구조를 바꾸기 전에 먼저 채운다
- 용어 정의, 기준선, 변경 축, 완료 기준을 작업 전에 확정하기 위한 문서

## 업데이트 규칙
새 도구 파일이 추가되면 코드 에이전트가 이 파일을 업데이트한다.
