# Task Completion
For TypeScript extension changes:
1. Run targeted Vitest tests for changed behavior, then `bun run test`.
2. Run `bun run lint`.
3. Run `bun run build` to type-check/bundle/copy extension assets.
4. Review `git status --short` and the focused diff; preserve unrelated user changes.
5. Ensure new network/parser behavior has meaningful unit tests including malformed/empty/boundary input.
6. Confirm no secrets, HAR cookies, signed URLs, or captured authorization data were added to source/tests.