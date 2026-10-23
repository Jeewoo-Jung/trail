import { describe, expect, it } from "vitest";
import { buildStoragePath, checkFile, safeFileName } from "./files";
import { FILE_LIMITS } from "./limits";

describe("safeFileName", () => {
  it("한글·영문·숫자·점·밑줄·하이픈은 그대로 둔다", () => {
    expect(safeFileName("최종 보고서 v2.pdf")).toBe("최종_보고서_v2.pdf");
    expect(safeFileName("a-b_c.d.zip")).toBe("a-b_c.d.zip");
  });
  it("경로 구분·위험 문자·숨김 점·연속 밑줄을 정리한다", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\폴더\\파일.docx")).toBe("파일.docx");
    expect(safeFileName("  .hidden file ")).toBe("hidden_file_");
    expect(safeFileName("a<b>:c|d?.txt")).toBe("a_b_c_d_.txt");
  });
  it("비면 file, 길면 확장자를 남기고 줄인다", () => {
    expect(safeFileName("///")).toBe("file");
    expect(safeFileName("")).toBe("file");
    const long = `${"가".repeat(200)}.pdf`;
    const out = safeFileName(long);
    expect(Array.from(out).length).toBe(FILE_LIMITS.nameMaxChars);
    expect(out.endsWith(".pdf")).toBe(true);
  });
});

describe("buildStoragePath / checkFile", () => {
  it("경로는 사용자·노드·무작위 값·안전한 이름으로 만든다(폴더는 둘뿐)", () => {
    const p = buildStoragePath("u-1", "n-1", "rand", "../내 파일.pdf");
    expect(p).toBe("u-1/n-1/rand-내_파일.pdf");
    expect(p.split("/")).toHaveLength(3);
  });
  it("크기·이름을 검사한다", () => {
    expect(checkFile({ size: 1, name: "a.txt" })).toEqual({ ok: true });
    expect(checkFile({ size: FILE_LIMITS.maxBytes, name: "a" })).toEqual({ ok: true });
    expect(checkFile({ size: FILE_LIMITS.maxBytes + 1, name: "a" }).ok).toBe(false);
    expect(checkFile({ size: 0, name: "a" }).ok).toBe(false);
    expect(checkFile({ size: 5, name: " " }).ok).toBe(false);
  });
});
