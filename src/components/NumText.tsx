/** '9월 3일', '99%', '27개' 처럼 숫자로 시작하는 덩어리. */
const NUMERIC = /(\d+(?:[.,]\d+)?(?:월|일|개|번|%)?(?:\s\d+(?:[.,]\d+)?(?:월|일|개|번|%)?)*)/

/**
 * 숫자 덩어리만 등폭으로.
 *
 * 등폭 글꼴은 빈칸이 넓어서, 한글 낱말까지 등폭으로 찍으면 '목표한  날' 처럼
 * 낱말 사이가 벌어져 보인다. 숫자와 그 단위만 등폭으로 두고 나머지는 본문 글꼴이다.
 */
export function NumText({ text }: { text: string }) {
  const parts = text.split(NUMERIC)
  return (
    <>
      {parts.map((part, index) =>
        // split 에 묶음을 쓰면 홀수 자리가 잘라낸 숫자 덩어리다.
        index % 2 === 1 ? (
          <span key={index} className="num">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  )
}
