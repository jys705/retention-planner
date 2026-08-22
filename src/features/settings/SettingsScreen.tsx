import { useRef, useState } from 'react'
import { DEFAULT_W } from '../../core/fsrs/params'
import { INTENSITY_RETENTION, type Intensity } from '../../core/policy/constraints'
import { Chip } from '../../components/Chip'
import { Expand } from '../../components/Expand'
import { nowIso, today as clockToday } from '../../lib/clock'
import { percent } from '../../lib/format'
import type { ThemePreference } from '../../lib/settings'
import {
  BackupFormatError,
  backupFilename,
  csvFilename,
  parseBackup,
  toBackup,
  toCsv,
} from '../../lib/transfer'
import { usePlanner } from '../../store/planner'

const INTENSITY_META: { key: Intensity; name: string; desc: string }[] = [
  { key: 'easy', name: '여유', desc: '가끔만 볼게요' },
  { key: 'standard', name: '표준', desc: '알맞게 볼게요' },
  { key: 'focus', name: '집중', desc: '자주 볼게요' },
  { key: 'max', name: '최대', desc: '아주 자주 볼게요' },
]

const THEMES: { key: ThemePreference; name: string }[] = [
  { key: 'system', name: '시스템' },
  { key: 'light', name: '밝게' },
  { key: 'dark', name: '어둡게' },
]

const NOTIFY_TIMES = ['09:00', '12:00', '18:00', '21:00']

export function SettingsScreen() {
  const { settings, goals, items, reviews } = usePlanner()
  const saveSetting = usePlanner((s) => s.saveSetting)
  const importAll = usePlanner((s) => s.importAll)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [paramsOpen, setParamsOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function download(name: string, text: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type }))
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    URL.revokeObjectURL(url)
  }

  function exportJson() {
    const today = clockToday()
    const backup = toBackup(
      {
        goals,
        items,
        reviews,
        settings: Object.fromEntries(
          Object.entries(settings).map(([k, v]) => [
            k,
            v === null ? '' : Array.isArray(v) ? JSON.stringify(v) : String(v),
          ])
        ),
      },
      nowIso()
    )
    download(
      backupFilename(today),
      JSON.stringify(backup, null, 2),
      'application/json'
    )
    setMessage(`항목 ${items.length}개와 평가 ${reviews.length}건을 내보냈어요.`)
  }

  function exportCsv() {
    download(csvFilename(clockToday()), toCsv(items, goals), 'text/csv')
    setMessage(`항목 ${items.length}개를 표로 내보냈어요.`)
  }

  async function importFile(file: File) {
    try {
      const backup = parseBackup(await file.text())
      await importAll(backup)
      setMessage(
        `항목 ${backup.items.length}개와 평가 ${backup.reviews.length}건을 가져왔어요.`
      )
    } catch (error) {
      setMessage(
        error instanceof BackupFormatError
          ? error.message
          : '가져오는 중에 문제가 생겼어요.'
      )
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[940px] flex-col gap-5 px-6 py-7">
      <h1 className="text-[22px] font-semibold">설정</h1>

      <section className="flex flex-col gap-5 rounded-card border border-line bg-surface px-[16px] py-[15px]">
        <h2 className="text-[13px] font-semibold">일반</h2>

        <Row
          label="기본 복습 강도"
          note="새 항목에 처음 적용되는 값이에요. 항목마다 따로 바꿀 수 있어요."
        >
          <div className="flex flex-wrap gap-[6px]">
            {INTENSITY_META.map((meta) => (
              <Chip
                key={meta.key}
                active={settings.defaultIntensity === meta.key}
                title={meta.desc}
                onClick={() => void saveSetting('defaultIntensity', meta.key)}
              >
                {meta.name}
              </Chip>
            ))}
          </div>
        </Row>

        <Row
          label="하루 최대 개수"
          note="이보다 많아지면 앞뒤 날짜로 펴서 잡아요."
        >
          <Stepper
            value={settings.dailyCap}
            suffix="개"
            min={1}
            max={200}
            onChange={(next) => void saveSetting('dailyCap', next)}
          />
        </Row>

        <Row
          label="알림 시각"
          note="이 시각에 오늘 볼 게 몇 개인지 알려드려요."
        >
          <div className="flex flex-wrap gap-[6px]">
            {NOTIFY_TIMES.map((time) => (
              <Chip
                key={time}
                active={settings.notifyAt === time}
                onClick={() => void saveSetting('notifyAt', time)}
              >
                {time}
              </Chip>
            ))}
            <Chip
              active={settings.notifyAt === null}
              onClick={() => void saveSetting('notifyAt', null)}
            >
              끄기
            </Chip>
          </div>
        </Row>

        <Row label="테마" note="시스템을 고르면 macOS 설정을 따라가요.">
          <div className="flex flex-wrap gap-[6px]">
            {THEMES.map((theme) => (
              <Chip
                key={theme.key}
                active={settings.theme === theme.key}
                onClick={() => void saveSetting('theme', theme.key)}
              >
                {theme.name}
              </Chip>
            ))}
          </div>
        </Row>

        <Row
          label="대략 목표의 여유 폭"
          note={`'두 달쯤' 같은 목표를 앞뒤로 얼마나 넓게 볼지 정해요. 지금은 앞뒤 ${Math.round(
            settings.uncertainty * 100
          )}%예요.`}
        >
          <div className="flex flex-wrap gap-[6px]">
            {[0.15, 0.25, 0.35].map((u) => (
              <Chip
                key={u}
                active={Math.abs(settings.uncertainty - u) < 1e-9}
                onClick={() => void saveSetting('uncertainty', u)}
              >
                {`앞뒤 ${Math.round(u * 100)}%`}
              </Chip>
            ))}
          </div>
        </Row>

        <Row
          label="데이터"
          note="항목, 목표, 평가 이력을 파일 하나로 옮길 수 있어요."
        >
          <div className="flex flex-wrap items-center gap-[6px]">
            <Chip onClick={exportJson}>내보내기</Chip>
            <Chip onClick={exportCsv}>표로 내보내기</Chip>
            <Chip onClick={() => fileRef.current?.click()}>가져오기</Chip>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="가져올 파일"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void importFile(file)
                event.target.value = ''
              }}
            />
          </div>
          {message ? (
            <p className="pt-2 text-[12px] text-accent">{message}</p>
          ) : null}
          <p className="pt-1 text-[11.5px] text-text-3">
            가져오면 지금 있는 내용을 덮어씁니다. 먼저 내보내 두세요.
          </p>
        </Row>
      </section>

      <Expand
        open={advancedOpen}
        onToggle={() => setAdvancedOpen((o) => !o)}
        label="고급"
        hint="대부분 그대로 두시면 돼요."
      >
        <div className="flex flex-col gap-5">
          <Row
            label="목표 기억률 기본값"
            note="목표한 날 지켜야 할 기준이에요. 높이면 더 자주 보게 되고, 낮추면 덜 봅니다. 너무 높이면 날짜를 옮길 여지가 줄어요."
          >
            <div className="flex flex-wrap gap-[6px]">
              {[0.85, 0.9, 0.95].map((r) => (
                <Chip
                  key={r}
                  active={Math.abs(settings.targetRetention - r) < 1e-9}
                  onClick={() => void saveSetting('targetRetention', r)}
                >
                  {percent(r)}
                </Chip>
              ))}
            </div>
          </Row>

          <Row
            label="최소 복습 횟수 기본값"
            note="목표한 날 전에 최소 이만큼은 보게 잡아요. 계산상 필요하지 않아도 마음이 놓이는 쪽으로 맞추는 값입니다."
          >
            <Stepper
              value={settings.minReviews}
              suffix="번"
              min={0}
              max={12}
              onChange={(next) => void saveSetting('minReviews', next)}
            />
          </Row>

          <Row
            label="목표한 날 며칠 전까지 잡을지"
            note="그 날짜 직전에는 새 복습을 잡지 않아요."
          >
            <Stepper
              value={settings.bufferDays}
              suffix="일"
              min={0}
              max={3}
              onChange={(next) => void saveSetting('bufferDays', next)}
            />
          </Row>

          <Row
            label="최대 간격"
            note="아무리 잘 외워도 이 기간 안에는 다시 보게 해요."
          >
            <div className="flex flex-wrap gap-[6px]">
              {[null, 30, 90, 180].map((days) => (
                <Chip
                  key={String(days)}
                  active={settings.maxIntervalDays === days}
                  onClick={() => void saveSetting('maxIntervalDays', days)}
                >
                  {days === null ? '제한 없음' : `${days}일`}
                </Chip>
              ))}
            </div>
          </Row>

          <Expand
            open={paramsOpen}
            onToggle={() => setParamsOpen((o) => !o)}
            label="알고리즘 파라미터"
            hint="전문가용. 건드리면 지금까지의 평가 이력과 어긋날 수 있어요."
          >
            <div className="num grid grid-cols-7 gap-2 text-[11px] text-text-3">
              {DEFAULT_W.map((w, index) => (
                <div key={index} className="rounded-ctl bg-rail px-2 py-1">
                  <div className="text-[9.5px]">{index}</div>
                  <div className="text-[11px] text-text-2">{w}</div>
                </div>
              ))}
            </div>
            <p className="pt-2 text-[11.5px] text-text-3">
              지금은 기본값이에요. 평가 이력이 넉넉히 쌓이면 이 값을 개인에 맞게
              다시 맞추는 기능을 넣을 예정입니다.
            </p>
          </Expand>
        </div>
      </Expand>

      <section className="flex flex-col gap-3 rounded-card border border-line bg-surface px-[16px] py-[15px]">
        <h2 className="text-[13px] font-semibold">이 앱이 쓰는 방식</h2>
        <p className="text-[13px] leading-relaxed text-text-2">
          다시 볼 날은 <strong className="font-semibold">FSRS</strong> 라는
          방식으로 계산합니다. 사람이 시간이 지나며 잊는 곡선을 항목마다 따로
          추정하는 방법이에요.
        </p>
        <p className="text-[13px] leading-relaxed text-text-2">
          예전에 널리 쓰던 <strong className="font-semibold">SM-2</strong> 는
          정해진 배수로 간격을 늘렸습니다. 잘 아는 것도 여러 번 보게 되고, 잘
          모르는 것은 충분히 자주 보지 못했어요.
        </p>
        <p className="text-[13px] leading-relaxed text-text-2">
          이 앱은 평가 네 단계를 그때마다 반영해서, 같은 기억률을 유지하는 데
          필요한 복습 횟수를 줄입니다. 그래서 같은 시간으로 더 오래 기억할 수
          있어요.
        </p>
        <p className="text-[12px] text-text-3">
          복습 강도를 고르면 목표 기억률이 이렇게 잡힙니다:{' '}
          {INTENSITY_META.map(
            (m) => `${m.name} ${percent(INTENSITY_RETENTION[m.key])}`
          ).join(', ')}
          .
        </p>
        <p className="text-[12px] text-text-3">
          이 화면 말고는 어디에도 이런 약어를 쓰지 않습니다. 나머지 화면은
          기억률과 날짜로만 말합니다.
        </p>
      </section>
    </div>
  )
}

function Row({
  label,
  note,
  children,
}: {
  label: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-[6px]">
      <span className="text-[13px] font-medium">{label}</span>
      {note ? (
        <span className="text-[12px] leading-relaxed text-text-3">{note}</span>
      ) : null}
      <div className="pt-[2px]">{children}</div>
    </div>
  )
}

function Stepper({
  value,
  suffix,
  min,
  max,
  onChange,
}: {
  value: number
  suffix: string
  min: number
  max: number
  onChange: (next: number) => void
}) {
  return (
    <div className="flex w-fit items-center overflow-hidden rounded-ctl border border-line-2">
      <button
        type="button"
        aria-label="줄이기"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="px-[11px] py-[5px] text-[13px] hover:bg-hover"
      >
        −
      </button>
      <span className="num min-w-[54px] text-center text-[13px]">
        {value}
        {suffix}
      </span>
      <button
        type="button"
        aria-label="늘리기"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="px-[11px] py-[5px] text-[13px] hover:bg-hover"
      >
        +
      </button>
    </div>
  )
}
