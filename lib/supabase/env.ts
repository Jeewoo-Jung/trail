// Supabase 주소와 공개용 키를 읽는다. 둘 다 브라우저에 공개돼도 되는 값이다. (DESIGN.md §6.3)
// NEXT_PUBLIC_ 변수는 아래처럼 이름을 그대로 적어야 브라우저용 코드에도 값이 들어간다.
export function supabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase 주소나 공개용 키가 설정되지 않았습니다. NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY를 .env.local에 넣어 주세요.",
    );
  }
  return { url, key };
}
