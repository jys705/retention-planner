/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 1420, strictPort: false },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // 화면을 실제로 그려서 조작하는 시험만 브라우저 흉내를 낸다.
    // 파일 맨 위의 @vitest-environment 주석으로 켠다. 나머지는 node 에서 돈다.
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
  },
})
