import { describe, expect, it } from "vitest";
import { buildStoragePath, checkFile, safeFileName } from "./files";
import { FILE_LIMITS } from "./limits";

describe("safeFileName (Storage 키는 ASCII만)", () => {
  it("영문·숫자·점·밑줄·하이픈은 그대로 두고, 한글·공백은 줄여 확장자는 남긴다", () => {
    expect(safeFileName("a-b_c.d.zip")).toBe("a-b_c.d.zip");
    expect(safeFileName("최종 보고서 v2.PDF")).toBe("v2.pdf");
    expect(safeFileName("파일.docx")).toBe("file.docx");
    expect(safeFileName("결과(최종).pptx")).toBe("file.pptx");
  });
  it("경로 구분·위험 문자·숨김 점·연속 밑줄을 정리하고 결과는 항상 ASCII다", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\폴더\\report final.docx")).toBe("report_final.docx");
    expect(safeFileName("  .hidden file ")).toBe("hidden_file");
    expect(safeFileName("a<b>:c|d?.txt")).toBe("a_b_c_d_.txt".replace("_.txt", ".txt"));
    for (const name of ["최종 보고서.pdf", "😀emoji😀.png", "a b/c d.txt", "..", ".", " "]) expect(safeFileName(name)).toMatch(/^[A-Za-z0-9._-]+$/);
  });
  it("비면 file, 길면 확장자를 남기고 줄인다", () => {
    expect(safeFileName("///")).toBe("file");
    expect(safeFileName("")).toBe("file");
    const out = safeFileName(`${"a".repeat(200)}.pdf`);
    expect(out.length).toBe(FILE_LIMITS.nameMaxChars);
    expect(out.endsWith(".pdf")).toBe(true);
  });
});

describe("buildStoragePath / checkFile", () => {
  it("경로는 사용자·노드·무작위 값·안전한 이름으로 만든다(폴더는 둘뿐)", () => {
    const p = buildStoragePath("u-1", "n-1", "rand", "../내 파일 final.pdf");
    expect(p).toBe("u-1/n-1/rand-final.pdf");
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
