/**
 * 플러그인 기록 파일(data.json)을 읽고 쓴다.
 *
 * 옵시디언의 loadData 는 깨진 JSON 을 만나면 던지지 않고 빈 값을 준다. 그것을 '아직 기록
 * 없음' 으로 읽으면 다음 저장이 기록을 통째로 지운다. saveData 는 쓰기 실패를 삼켜서 저장이
 * 안 된 것을 알 길이 없다. 그래서 파일을 직접 다룬다.
 */
export interface DataFile {
  /** 파일이 없으면 null. 있는데 못 읽으면 던진다. */
  read(): Promise<string | null>
  /**
   * 통째로 바꿔 쓴다. 옆에 다 쓴 다음 제자리로 옮기므로 반쪽 파일이 남지 않는다.
   * 동기화 프로그램이나 옵시디언이 쓰는 도중의 파일을 읽어 가지 않는다. 실패하면 던진다.
   */
  write(text: string): Promise<void>
  /** 지금 파일을 옆에 사본으로 남긴다. 남긴 파일 이름. 파일이 없으면 null. */
  keepCopy(tag: string): Promise<string | null>
}

/** 옵시디언 데스크톱이 쥐여 주는 노드 fs 가운데 여기서 쓰는 것만. */
export interface DataFs {
  promises: {
    readFile(path: string, encoding: 'utf8'): Promise<string>
    writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>
    rename(from: string, to: string): Promise<void>
    copyFile(from: string, to: string): Promise<void>
    realpath(path: string): Promise<string>
  }
}

function missing(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'ENOENT'
}

/** 절대 경로의 파일 하나. */
export function nodeDataFile(fs: DataFs, path: string): DataFile {
  return {
    async read() {
      try {
        return await fs.promises.readFile(path, 'utf8')
      } catch (error) {
        if (missing(error)) return null
        throw error
      }
    },
    async write(text) {
      // data.json 이 다른 곳을 가리키는 링크면 그 대상에 쓴다. 링크 자리에 새 파일을 옮겨 놓으면
      // 링크가 끊기고, 링크로 이어 둔 곳(동기화 폴더 같은 것)에는 더 이상 기록이 안 간다.
      const target = await fs.promises.realpath(path).catch((error: unknown) => {
        if (missing(error)) return path
        throw error
      })
      const temp = `${target}.tmp`
      await fs.promises.writeFile(temp, text, 'utf8')
      await fs.promises.rename(temp, target)
    },
    async keepCopy(tag) {
      const copy = `${path}.${tag}`
      try {
        await fs.promises.copyFile(path, copy)
      } catch (error) {
        if (missing(error)) return null
        throw error
      }
      return copy
    },
  }
}

/**
 * 기록 파일을 JSON 으로 읽는다. 깨졌으면 던진다. 비어 있으면 깨진 것이다.
 * 메모장 같은 것이 맨 앞에 붙이는 UTF-8 표시는 떼고 읽는다.
 */
export function parseDataText(text: string): unknown {
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
}
