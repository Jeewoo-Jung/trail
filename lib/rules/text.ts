// 글자 수를 센다. NFC로 합친 뒤 코드 포인트 단위로 세서, 자모가 풀려 있는 한글이나 이모지가 섞여도 사람이 세는 글자 수와 맞춘다.
export function countChars(text: string): number {
  return Array.from(text.normalize("NFC")).length;
}
