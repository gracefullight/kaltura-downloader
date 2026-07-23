# Conventions
- TypeScript uses strict typing; keep shared interfaces in `apps/ext/src/types.ts`.
- Biome formatting: 2-space indentation, 90-column line width, organized imports, recommended lint rules.
- Source identifiers and code comments remain English.
- Tests are colocated as `*.test.ts` under `apps/ext/src`.
- Network/download logic is split by browser execution context: request observation/storage in background, DOM/UI in content, page-origin fetch in downloader.
- User-visible strings must follow the project's existing localization approach; there is currently no `packages/i18n` ARB module.
- Do not edit `.agents/`; it is managed SSOT.