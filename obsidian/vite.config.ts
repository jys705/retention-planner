import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { packageCss } from './build/scopeCss.ts'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * 옵시디언이 읽는 세 파일을 만든다. main.js, styles.css, manifest.json.
 *
 * 앱 스타일은 앱 뿌리 안으로 가둔다. 앞에는 옵시디언 CSS 를 걷는 규칙을, 뒤에는 옵시디언
 * 그릇을 다듬는 규칙을 붙인다.
 * 가둔 결과에 뿌리 밖을 고르는 선택자가 하나라도 남으면 빌드를 멈춘다.
 */
function obsidianPackage(): Plugin {
  return {
    name: 'retention-planner:obsidian-package',
    apply: 'build',
    // Vite 가 스타일 파일을 다 만든 뒤에 받아야 한다.
    enforce: 'post',
    generateBundle(_options, bundle) {
      const sheets = Object.values(bundle).filter(
        (file) => file.type === 'asset' && file.fileName.endsWith('.css')
      )
      if (sheets.length === 0) throw new Error('앱 스타일이 만들어지지 않았다.')
      const appCss = sheets
        .map((file) => (file.type === 'asset' ? String(file.source) : ''))
        .join('\n')
      for (const file of sheets) delete bundle[file.fileName]

      // 옵시디언 CSS 를 걷는 규칙은 앱 CSS 앞에, 옵시디언 그릇을 다듬는 규칙은 뒤에 둔다.
      // 뿌리 밖을 고르는 선택자가 남거나 뿌리 선택자가 어긋나면 빌드를 멈춘다.
      this.emitFile({
        type: 'asset',
        fileName: 'styles.css',
        source: packageCss(
          appCss,
          readFileSync(resolve(here, 'src/reset.css'), 'utf8'),
          readFileSync(resolve(here, 'src/host.css'), 'utf8')
        ),
      })

      const manifest = JSON.parse(readFileSync(resolve(here, 'manifest.json'), 'utf8'))
      const pkg = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8'))
      if (manifest.version !== pkg.version) {
        throw new Error(
          `manifest.json 의 버전(${manifest.version})이 package.json(${pkg.version})과 다르다.`
        )
      }
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), obsidianPackage()],
  // 옵시디언은 앱 폴더를 public 처럼 읽지 않는다. 데스크톱 앱의 아이콘을 따라 넣지 않는다.
  publicDir: false,
  define: {
    // 라이브러리로 빌드하면 이 값을 바꾸지 않는다. 안 바꾸면 React 의 개발판이 같이 들어간다.
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: false,
    sourcemap: false,
    lib: {
      entry: resolve(here, 'src/main.tsx'),
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      // 옵시디언이 쥐여 주는 것은 묶지 않는다.
      external: ['obsidian', 'electron', /^@codemirror\//, /^@lezer\//],
      output: {
        exports: 'default',
        // 옵시디언은 main.js 하나만 읽는다. 나눠 둔 화면도 한 파일에 넣는다.
        codeSplitting: false,
      },
    },
  },
})
