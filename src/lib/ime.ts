/**
 * 한글을 조합하는 중에 누른 Enter.
 *
 * 그 Enter 는 조합을 끝내는 키이기도 하다. 그 자리에서 칸을 비우면 조합이 끝나며 마지막
 * 글자가 빈 칸에 다시 들어간다. 옵시디언 같은 크롬 계열에서 그렇다. 조합이 끝난 뒤의
 * 값을 읽어 적는다. 조합을 끝내며 Enter 가 한 번 더 오면 그때는 칸이 이미 비어 있다.
 */
export function submitAfterComposition(
  input: HTMLInputElement,
  submit: (value: string) => void
): void {
  setTimeout(() => submit(input.value), 0)
}
