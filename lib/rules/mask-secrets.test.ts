import { describe, expect, it } from "vitest";
import { MASK, maskSecrets } from "./mask-secrets";

// 가짜 키는 실행할 때 조립한다. 소스에 키 모양 글자가 그대로 남지 않게 하려는 것이다.
const NOISE = "aB3dE5fG7hJ9kL2mN4pQ6rS8tU1vW0xY";
const fake = (prefix: string, length: number) =>
  prefix + NOISE.repeat(Math.ceil(length / NOISE.length)).slice(0, length);

const fakeJwt = () => [fake("eyJ", 30), fake("eyJ", 40), NOISE].join(".");


describe("가려야 하는 것", () => {
  it.each([
    ["sk- 키", fake("sk-", 40)],
    ["sk-ant- 처럼 하이픈이 섞인 키", fake("sk-ant-api03-", 60)],
    ["GitHub ghp_ 토큰", fake("ghp_", 36)],
    ["Supabase sbp_ 토큰", fake("sbp_", 40)],
    ["Vercel vcp_ 토큰", fake("vcp_", 60)],
    ["점으로 이어진 eyJ 토큰(JWT)", fakeJwt()],
    ["점 없이 긴 eyJ 문자열", fake("eyJ", 60)],
  ])("%s", (_name, secret) => {
    const result = maskSecrets(`키는 ${secret} 입니다`);
    expect(result.text).toBe(`키는 ${MASK} 입니다`);
    expect(result.count).toBe(1);
    expect(result.text).not.toContain(secret);
  });

  it("Bearer 뒤의 긴 문자열은 Bearer는 남기고 문자열만 가린다", () => {
    const token = fake("", 40);
    const result = maskSecrets(`Authorization: Bearer ${token}`);
    expect(result.text).toBe(`Authorization: Bearer ${MASK}`);
    expect(result.count).toBe(1);
  });

  it("bearer를 소문자로 써도, 줄바꿈으로 떨어져 있어도 가린다", () => {
    const token = fake("", 40);
    expect(maskSecrets(`bearer ${token}`).text).toBe(`bearer ${MASK}`);
    expect(maskSecrets(`Bearer\n${token}`).text).toBe(`Bearer ${MASK}`);
  });

  it("Bearer 뒤가 JWT여도 한 번만 세고 가린다", () => {
    const result = maskSecrets(`Bearer ${fakeJwt()}`);
    expect(result.text).toBe(`Bearer ${MASK}`);
    expect(result.count).toBe(1);
  });

  it("따옴표, 괄호, = 바로 뒤에 붙어 있어도 가린다", () => {
    const secret = fake("sk-", 40);
    expect(maskSecrets(`("${secret}")`).text).toBe(`("${MASK}")`);
    expect(maskSecrets(`API_KEY=${secret}`).text).toBe(`API_KEY=${MASK}`);
    expect(maskSecrets(`키:${secret},끝`).text).toBe(`키:${MASK},끝`);
    expect(maskSecrets(secret).text).toBe(MASK);
  });

  it("하이픈·밑줄 바로 뒤에 이어 붙은 토큰도 가린다", () => {
    expect(maskSecrets(`token-${fake("vcp_", 40)}`).text).toBe(`token-${MASK}`);
    expect(maskSecrets(`gh_${fake("ghp_", 36)}`).text).toBe(`gh_${MASK}`);
    expect(maskSecrets(`x-${fake("sk-", 40)}`).text).toBe(`x-${MASK}`);
  });

  it("한 글에 여러 개 있으면 모두 가리고 개수를 센다", () => {
    const text = `${fake("sk-", 40)} 그리고 ${fake("ghp_", 36)}\n${fake("vcp_", 40)}`;
    const result = maskSecrets(text);
    expect(result.count).toBe(3);
    expect(result.text).toBe(`${MASK} 그리고 ${MASK}\n${MASK}`);
  });

  it("같은 글에 두 번 적용해도 결과가 같다", () => {
    const once = maskSecrets(`a ${fake("sk-", 40)} b Bearer ${fake("", 40)}`);
    const twice = maskSecrets(once.text);
    expect(twice.text).toBe(once.text);
    expect(twice.count).toBe(0);
  });
});

describe("건드리면 안 되는 것 (지나치게 가리지 않기)", () => {
  it.each([
    ["한글 문장", "오늘 회의에서 임베딩 비교 결론을 냈다."],
    ["빈 글", ""],
    ["단어 안에 들어 있는 sk-", "task-management-system-version-2-final-release"],
    ["ask- 로 시작하는 말", "ask-me-anything-about-the-project-2024-edition"],
    ["숫자 없는 긴 sk- 단어", "sk-learn-pipeline-example-code-for-beginners"],
    ["짧은 sk- 값", "sk-abc123"],
    ["짧은 ghp_ 값", "ghp_abc123"],
    ["접두어만 설명하는 글", "키는 sk- 나 ghp_ 로 시작한다고 적혀 있다"],
    ["Bearer만 있는 설명", "Bearer 토큰은 헤더에 넣는다"],
    ["짧은 Bearer 뒤 값", "Bearer token"],
    ["숫자 없는 Bearer 설명 글", "Bearer authentication-scheme-header"],
    ["UUID", "id: 123e4567-e89b-12d3-a456-426614174000"],
    ["git 커밋 해시", "커밋 a5964aa 와 e9dbb53e1f2a3b4c5d6e7f8091a2b3c4d5e6f708"],
    ["주소", "https://example.com/docs/getting-started/authentication-and-authorization-guide"],
    ["짧은 eyJ", "eyJhbGciOiJ"],
  ])("%s", (_name, text) => {
    const result = maskSecrets(text);
    expect(result.text).toBe(text);
    expect(result.count).toBe(0);
  });
});

describe("maskSecrets: 추가한 모양", () => {
  const rnd = "aB3dE5fG7hJ9kL2mN4pQ6rS8tU1vW";
  const cases: [string, string][] = [
    ["sb_secret_", "sb_secret_" + rnd],
    ["github_pat_", "github_pat_" + "11ABCDEFG0" + rnd],
    ["gho_", "gho_" + rnd],
    ["ghs_", "ghs_" + rnd],
    ["AKIA", "AKIA" + "IOSFODNN7EXAMPL3"],
    ["AIza", "AIza" + "SyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q"],
    ["xoxb-", "xoxb-" + "123456789012-abcdefghijkl"],
  ];
  it.each(cases)("%s 모양을 가린다", (_name, secret) => {
    const r = maskSecrets(`키는 ${secret} 입니다`);
    expect(r.text).toBe("키는 ●●● 입니다");
    expect(r.count).toBe(1);
  });
  it("password=값, api_key: 값은 이름을 남기고 값만 가린다", () => {
    expect(maskSecrets("password=hunter2hunter2").text).toBe("password=●●●");
    expect(maskSecrets('api_key: "ab12cd34ef56"').text).toBe('api_key: "●●●"');
    expect(maskSecrets("TOKEN = ZZ9988776655").text).toBe("TOKEN = ●●●");
  });
  it("설명 글은 가리지 않는다 (값에 숫자가 없거나 8자 미만, 한글 값)", () => {
    for (const ok of ["password: 변경하기로 했다", "token: abcdefghij", "secret=short1", "토큰 한도: 100000 tokens", "the password policy requires length"]) {
      expect(maskSecrets(ok).text).toBe(ok);
    }
  });
  it("같은 글에 다시 적용해도 결과가 같다", () => {
    const once = maskSecrets(`password=hunter2hunter2 ${"gho_" + rnd}`).text;
    expect(maskSecrets(once).text).toBe(once);
  });
});
