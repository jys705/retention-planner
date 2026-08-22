# retention-planner

**공부한 일을 한 줄로 적어두면, 언제 다시 봐야 할지 계산해주는 macOS 학습 플래너.**

복습은 앱 밖에서 합니다. 원래 진행하던 공부를 마친 뒤에 돌아와서
자가 평가 네 단계(거의 기억 안 남, 어려움, 보통, 쉬움) 중 하나만 고르면 다음 복습일이 다시 잡힙니다.
목표 날짜를 정해두면 그날까지 기억이 가장 높게 올라오도록 일정을 역산하고,
예외적으로 목표 날 이전에 복습이 몰리지 않게 날짜를 분산시켜 줍니다.

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

[FSRS-6](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm) 엔진 위에
목표 시점 제약과 몰림 방지 층을 얹었습니다. 스케줄 계산은 전부 순수 함수이고 현재 시각을 인자로 받습니다.

**엔진.** 파라미터 21개짜리 DSR 모델. 항목마다 기억 지속력 `S`와 체감 난이도 `D`를 들고 있습니다.

```
factor  = 0.9^(-1 / w20) - 1
R(t, S) = (1 + factor * t / S)^(-w20)          t일 뒤 회상률
I(r, S) = (S / factor) * (r^(-1 / w20) - 1)    회상률 r 까지의 간격
```

감쇠 지수 `w20`도 학습된 파라미터입니다. 복습 강도는 `r`을 고르는 다이얼입니다.
여유 0.85, 표준 0.90, 집중 0.94, 최대 0.97.

**제약.** 목표 시점 세 모드를 구간 하나로 통일한 뒤 상한 넷을 겹치고 가장 짧은 것을 씁니다.

```
I = clamp(min(I_base, I_ready, I_sessions, I_maxcap), 1, 36500)
```

| 상한 | 뜻 |
|---|---|
| `I_base` | FSRS 가 원하는 간격 |
| `I_ready` | 마감선에서 버퍼를 뺀 날을 넘지 않게 |
| `I_sessions` | 목표 전에 최소 횟수를 채우게 |
| `I_maxcap` | 아무리 잘 외워도 이 기간 안에는 |

어느 것이 이겼는지 기록해서 "왜 오늘인가"에 화면이 답합니다.

**몰림 방지.** 같은 목표를 향하는 항목은 그냥 두면 마감 직전에 쌓입니다.
항목마다 마무리 복습을 옮겨도 되는 구간을 구합니다.

```
L = 마감선 - 버퍼
E = min { d : R(마감선 - d, S_good(d)) >= 목표 기억률 }
```

목표한 날 회상률이 복습일에 단조 증가하므로 `E`는 이분 탐색으로 찾습니다.
배정은 EDF, 구간 안에서 가장 한산한 날, 지역 개선 100회. 무작위성이 없어 같은 입력이면
같은 결과가 나옵니다. 그 위에 모든 목표를 합친 하루 상한이 한 번 더 돌지만 `[E, L]` 밖으로는
나가지 않습니다.

**검증.** 무작위 평가 시퀀스 10,000개를 [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs)와
대조해 `S`, `D`, 다음 간격이 `1e-9` 안에서 일치하는지 봅니다. 같은 날 두 번 기록하는 경로는
FSRS-5와 수식이 달라 전용 대조를 따로 둡니다. 나머지는 속성 테스트로 덮습니다.
`R(0,S)=1`, `R(S,S)=0.9`, `R`은 `t`에 단조 감소, 성공하면 `S`가 줄지 않음, `1 <= D <= 10`,
분산 결과가 모두 자기 구간 안에 있고 두 번 돌려 같은지.
