/** 짧고 충돌하지 않는 id. 개인용 로컬 앱이라 이 정도면 충분하다. */
export function newId(prefix: string): string {
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  return `${prefix}_${random}`
}
