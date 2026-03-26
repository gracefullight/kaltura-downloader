import { describe, expect, it } from "vitest";
import { sanitizeFilename } from "./filename.js";

describe("sanitizeFilename", () => {
  it("replaces unsafe characters with underscores", () => {
    expect(sanitizeFilename('my:video<>"file')).toBe("my_video_file");
  });

  it("collapses whitespace into underscores", () => {
    expect(sanitizeFilename("hello   world")).toBe("hello_world");
  });

  it("collapses multiple underscores", () => {
    expect(sanitizeFilename("a___b")).toBe("a_b");
  });

  it("truncates to 100 characters", () => {
    const long = "a".repeat(200);
    expect(sanitizeFilename(long)).toHaveLength(100);
  });

  it("handles a typical Kaltura video title", () => {
    expect(sanitizeFilename("Week 2 Lecture: Machine Learning & Intro")).toBe(
      "Week_2_Lecture_Machine_Learning_&_Intro",
    );
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeFilename("")).toBe("");
  });

  it("replaces all unsafe characters in a string of only unsafe chars", () => {
    expect(sanitizeFilename('<>:"/\\|?*')).toBe("_");
  });

  it("preserves unicode characters", () => {
    expect(sanitizeFilename("강의_제목_01")).toBe("강의_제목_01");
  });

  it("handles leading and trailing whitespace", () => {
    expect(sanitizeFilename("  hello world  ")).toBe("_hello_world_");
  });

  it("handles pipe character", () => {
    expect(sanitizeFilename("Part A | Part B")).toBe("Part_A_Part_B");
  });

  it("handles mixed unsafe chars and whitespace", () => {
    expect(sanitizeFilename('file: "name" / path')).toBe("file_name_path");
  });
});
