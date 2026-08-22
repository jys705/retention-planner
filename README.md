# retention-planner

**공부한 일을 한 줄로 적어두면, 언제 다시 봐야 할지 계산해주는 macOS 학습 플래너.**

복습은 앱 밖에서 합니다. 원래 보던 문제집이나 노트를 펴고, 다 본 뒤에 돌아와서
얼마나 기억났는지 네 단계 중 하나만 고르면 다음 복습일이 다시 잡힙니다.
시험 날짜를 정해두면 그날까지 기억이 가장 높게 올라오도록 일정을 역산하고,
같은 날에 복습이 몰리지 않게 날짜를 펴줍니다.

```
10월 1일 목요일                                          전체 기억률  84%

  3 개  오늘 볼 항목
  밀린 것 1개

  [ ]  AWS SCS-C03 1~10번 문제 풀이     중요           71%   오늘   AWS SCS-C03
  [ ]  AWS SCS-C03 11~20번 문제 풀이                   84%   오늘   AWS SCS-C03
  [ ]  정보보안 개념 1~3               날짜 조정됨     90%   8일 지남
  +    한 줄 적기
```

체크하면 화면 전환 없이 그 줄이 열리고, 각 단추가 "이걸 누르면 언제 다시 보는지"를
미리 보여줍니다.

```
  얼마나 기억났나요?                              1~4 키로 바로 평가

  다시              어려움             알맞음            쉬움
  거의 기억 안 남    여러 번 막힘        무난             바로 나옴
  내일              3일 뒤             8일 뒤            15일 뒤
```

## 이런 점이 다릅니다

**콘텐츠를 담지 않습니다.** 카드도 덱도 없습니다. 제목 한 줄과 다음에 볼 날짜만 챙깁니다.
적는 데 드는 마찰이 0에 가까워야 매일 쓸 수 있기 때문입니다.

**목표 시점을 세 가지로 받습니다.** 날짜가 확실하면 `정확한 날짜`, 아직 모르면 `대략`,
그냥 계속 기억하고 싶으면 `정해두지 않음`. `대략`은 점이 아니라 구간으로 다룹니다.
`2개월쯤`을 고르면 이른 쪽까지 준비를 끝내고 늦은 쪽까지 그 상태를 유지하도록 잡습니다.

**같은 날에 몰리지 않게 폅니다.** 같은 시험을 향하는 항목 스무 개를 그냥 두면
시험 직전 이삼일에 전부 쌓입니다. 각 항목마다 "목표한 날 기억률을 지키면서 옮길 수 있는
날짜 범위"를 구하고 그 안에서 고르게 나눕니다. 옮긴 항목에는 그렇다고 표시가 붙습니다.

**100% 로컬입니다.** 계정도 네트워크 호출도 없습니다. SQLite 파일 하나에 들어갑니다.

**화면에 어려운 말을 쓰지 않습니다.** 안정성, 난이도 점수, 알고리즘 이름 같은 것은
화면에 나오지 않습니다. 기억률과 날짜로만 이야기합니다.

## 시작하기

```bash
pnpm install
pnpm dev
```

브라우저에서 바로 열립니다. 이 상태로도 모든 기능이 돌아가고, 적어둔 것은 브라우저에 남습니다.

## 데스크탑 앱으로 빌드

[Rust](https://rustup.rs)와 Xcode가 필요합니다.

```bash
pnpm tauri build
```

결과물은 두 개가 나옵니다.

```
src-tauri/target/release/bundle/macos/retention-planner.app
src-tauri/target/release/bundle/dmg/retention-planner_0.1.0_aarch64.dmg
```

서명하지 않은 앱이라 처음 열 때 한 번 격리 속성을 지워야 합니다.

```bash
xattr -dr com.apple.quarantine src-tauri/target/release/bundle/macos/retention-planner.app
```

데스크탑 앱에서는 데이터가 SQLite 파일로 들어갑니다.

```
~/Library/Application Support/dev.jys705.retention-planner/retention-planner.db
```

## 개발

```bash
pnpm verify   # 타입 검사, lint, 테스트
pnpm test     # 테스트만
pnpm build    # 웹 번들
```

테스트는 두 갈래입니다. `tests/golden/`과 `tests/policy/` 같은 쪽은 순수 계산을 값으로 확인하고,
`tests/scenarios/` 쪽은 실제 화면을 그려서 사람처럼 누르고 화면에 뜬 글자로 확인합니다.

## 스택

Tauri v2, React 19, TypeScript 5, Vite, Tailwind v4, Recharts, Zustand, SQLite, Vitest.

## 알고리즘

간격 계산은 [FSRS-6](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm)를 씁니다.
그 위에 목표 시점 제약과 몰림 방지 층을 얹었습니다.

구현이 맞는지는 [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs)와 대조해서 확인합니다.
무작위 평가 시퀀스 10,000개를 두 구현에 똑같이 먹이고 기억 지속력, 체감 난이도, 다음 간격이
`1e-9` 안에서 일치하는지 봅니다.
