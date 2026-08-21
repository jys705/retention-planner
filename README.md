# retention-planner

공부한 일을 한 줄로 적어두면 언제 다시 봐야 할지 계산해주는 macOS 개인용 학습 플래너.
복습은 앱 밖에서 하고, 끝나면 돌아와 네 단계로 자가평가만 하면 다음 복습일이 다시 잡힙니다.
목표 시점을 정해두면 그날까지 기억이 가장 높게 올라오도록 일정을 역산하고, 같은 날에
복습이 몰리지 않게 날짜를 펴줍니다.

## 스택

Tauri v2, React 19, TypeScript 5, Vite, Tailwind v4, Recharts, Zustand, SQLite, Vitest.

## 설치와 실행

```bash
pnpm install
pnpm dev
```

브라우저에서 바로 열립니다. 데스크탑 앱으로 빌드하려면 [Rust](https://rustup.rs) 를 설치한 뒤:

```bash
pnpm tauri build
```

검사와 빌드:

```bash
pnpm verify
pnpm build
```

## 알고리즘

간격 계산은 [FSRS-6](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm) 를 씁니다.
구현은 [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs) 와 대조하는 골든 테스트로 검증합니다.
