/**
 * 내보낸 파일을 둘 곳.
 *
 * 데스크톱 앱처럼 다운로드 폴더에 쓴다. 집 컴퓨터와 회사 컴퓨터에서 같은 자리를 찾으면
 * 옮기기 쉽다. 같은 이름이 있으면 덮어쓰지 않고 번호를 붙인다.
 */
export interface Downloads {
  /** 쓴 파일의 이름을 돌려준다. 번호가 붙었으면 붙은 이름이다. */
  save(name: string, text: string): Promise<string>
}

/** 옵시디언 데스크톱이 쥐여 주는 노드 모듈 가운데 여기서 쓰는 것만. */
export interface NodeFs {
  existsSync(path: string): boolean
  promises: {
    mkdir(path: string, options: { recursive: true }): Promise<unknown>
    writeFile(
      path: string,
      data: string,
      options: { flag: 'wx'; encoding: 'utf8' }
    ): Promise<void>
  }
}

export interface NodePath {
  join(...parts: string[]): string
  basename(path: string): string
}

export interface NodeOs {
  homedir(): string
}

const FALLBACK_NAME = 'retention-planner.json'

/**
 * 같은 이름이 없을 때만 새로 만든다.
 *
 * 있는지 먼저 보고 쓰면 그 사이에 같은 이름이 생길 수 있다. 새로 만들 때만 여는 깃발로 쓴다.
 */
export async function writeNewFile(
  fs: NodeFs,
  path: NodePath,
  dir: string,
  name: string,
  text: string
): Promise<string> {
  const fileName = path.basename(name) || FALLBACK_NAME
  const dot = fileName.lastIndexOf('.')
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot) : ''
  await fs.promises.mkdir(dir, { recursive: true })
  for (let n = 0; ; n += 1) {
    const candidate = n === 0 ? fileName : `${stem} (${n})${ext}`
    try {
      await fs.promises.writeFile(path.join(dir, candidate), text, {
        flag: 'wx',
        encoding: 'utf8',
      })
      return candidate
    } catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST') throw error
    }
  }
}

/**
 * 옵시디언 데스크톱의 다운로드 폴더.
 *
 * 노드 모듈을 못 쓰는 곳이면 null 이다. 그때는 보관함 안에 둔다.
 */
export function nodeDownloads(
  load: ((id: string) => unknown) | undefined = (
    globalThis as { require?: (id: string) => unknown }
  ).require
): Downloads | null {
  if (typeof load !== 'function') return null
  try {
    const fs = load('fs') as NodeFs
    const path = load('path') as NodePath
    const os = load('os') as NodeOs
    const dir = path.join(os.homedir(), 'Downloads')
    if (!fs.existsSync(dir)) return null
    return { save: (name, text) => writeNewFile(fs, path, dir, name, text) }
  } catch {
    return null
  }
}
