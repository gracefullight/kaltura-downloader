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
});
