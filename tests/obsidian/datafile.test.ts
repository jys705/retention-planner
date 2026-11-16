import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  promises,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nodeDataFile, parseDataText, type DataFs } from '../../obsidian/src/datafile'

let dir: string
let path: string

beforeEach(() => {
  // macOS 의 임시 폴더는 /private 아래를 가리키는 링크다. 쓰기가 링크를 풀어 실제 경로에 쓰므로 실제 경로로 둔다.
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'rp-data-')))
  path = join(dir, 'data.json')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const fs = { promises } as unknown as DataFs

describe('기록 파일(data.json) 읽고 쓰기', () => {
  it('파일이 없으면 null 이다. 깨졌다고 보지 않는다', async () => {
    expect(await nodeDataFile(fs, path).read()).toBeNull()
  })

  it('있는 그대로의 글을 읽는다. 깨진 글도 고치지 않고 돌려준다', async () => {
    writeFileSync(path, '{ 깨진', 'utf8')
    expect(await nodeDataFile(fs, path).read()).toBe('{ 깨진')
  })

  it('없어서가 아닌 까닭으로 못 읽으면 던진다', async () => {
    // 폴더를 파일처럼 읽으면 EISDIR 이다. 빈 기록으로 보면 다음 저장이 기록을 지운다.
    await expect(nodeDataFile(fs, dir).read()).rejects.toThrow()
  })

  it('옆에 다 쓴 다음 제자리로 옮긴다. 쓰다 만 파일도 남은 임시 파일도 없다', async () => {
    const steps: string[] = []
    const watched: DataFs = {
      promises: {
        readFile: (p, e) => promises.readFile(p, e),
        writeFile: async (p, d, e) => {
          steps.push(`write ${p.slice(dir.length + 1)}`)
          await promises.writeFile(p, d, e)
        },
        rename: async (a, b) => {
          steps.push(`rename ${a.slice(dir.length + 1)} ${b.slice(dir.length + 1)}`)
          await promises.rename(a, b)
        },
        copyFile: (a, b) => promises.copyFile(a, b),
        realpath: (p) => promises.realpath(p),
      },
    }
    writeFileSync(path, '옛것', 'utf8')
    await nodeDataFile(watched, path).write('{"items":[]}')
    expect(steps).toEqual(['write data.json.tmp', 'rename data.json.tmp data.json'])
    expect(readFileSync(path, 'utf8')).toBe('{"items":[]}')
    expect(readdirSync(dir)).toEqual(['data.json'])
  })

  it('data.json 이 다른 곳을 가리키는 링크면 링크를 끊지 않고 그 대상에 쓴다', async () => {
    const elsewhere = join(dir, 'linked')
    mkdirSync(elsewhere)
    const target = join(elsewhere, 'data.json')
    writeFileSync(target, '옛것', 'utf8')
    symlinkSync(target, path)

    const file = nodeDataFile(fs, path)
    await file.write('{"items":[]}')
    expect(lstatSync(path).isSymbolicLink()).toBe(true)
    expect(readFileSync(target, 'utf8')).toBe('{"items":[]}')
    expect(await file.read()).toBe('{"items":[]}')
    expect(readdirSync(elsewhere)).toEqual(['data.json'])
  })

  it('못 쓰면 던진다. 저장이 안 된 것을 알아야 알릴 수 있다', async () => {
    await expect(nodeDataFile(fs, join(dir, '없는 폴더', 'data.json')).write('{}')).rejects.toThrow()
  })

  it('지금 파일을 옆에 사본으로 남긴다. 파일이 없으면 남길 것도 없다', async () => {
    const file = nodeDataFile(fs, path)
    expect(await file.keepCopy('broken-1')).toBeNull()
    writeFileSync(path, '{ 반쯤', 'utf8')
    const copy = await file.keepCopy('broken-1')
    expect(copy).toBe(`${path}.broken-1`)
    expect(readFileSync(copy!, 'utf8')).toBe('{ 반쯤')
    // 원래 파일은 그대로다.
    expect(readFileSync(path, 'utf8')).toBe('{ 반쯤')
  })
})

describe('기록 글 읽기', () => {
  it('깨진 JSON 과 빈 글은 던진다', () => {
    expect(() => parseDataText('{ 깨진')).toThrow()
    expect(() => parseDataText('')).toThrow()
    expect(parseDataText('{"items":[]}')).toEqual({ items: [] })
  })
})
