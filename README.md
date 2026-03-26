# Kaltura Downloader

Kaltura(KAF) 플레이어에서 HLS 영상을 다운로드하는 Chrome 확장 프로그램.

영상 아래에 다운로드 버튼이 생기고, 클릭하면 세그먼트를 병렬로 받아 하나의 파일로 합쳐 줍니다.

## 기능

- Kaltura playManifest(m3u8) 자동 감지
- 화질 선택 (1080p, 720p 등)
- HLS 세그먼트 6개 동시 다운로드 + 자동 재시도
- 진행률 표시
- m3u8 URL 복사 (ffmpeg 수동 다운로드용)

## 설치

### GitHub Releases

1. [Releases](https://github.com/gracefullight/kaltura-downloader/releases)에서 최신 zip 다운로드
2. 압축 해제
3. Chrome → `chrome://extensions` → 개발자 모드 ON
4. "압축 해제된 확장 프로그램을 로드합니다" → 압축 해제한 폴더 선택

### 직접 빌드

```bash
bun install
bun run build
```

`apps/ext/dist/` 폴더를 Chrome에 로드합니다.

## 사용법

1. KAF Kaltura 페이지 접속
2. 영상 재생
3. 플레이어 아래 **Download** 버튼 클릭
4. 화질 선택 → 다운로드 시작

출력 형식은 `.ts`(MPEG-TS)입니다. MP4로 변환하려면:

```bash
ffmpeg -i video.ts -c copy video.mp4
```

## 구조

```
apps/ext/           Chrome 확장 프로그램
├── src/
│   ├── background.ts   playManifest m3u8 감지 및 화질 파싱
│   ├── content.ts      다운로드 UI 및 메시지 브릿지 (ISOLATED world)
│   ├── downloader.ts   HLS 세그먼트 다운로드 (MAIN world)
│   ├── parser.ts       m3u8 마스터/미디어 플레이리스트 파서
│   ├── filename.ts     파일명 정리
│   └── types.ts        공유 타입 정의
├── tsup.config.ts
└── tsconfig.json
```

## 개발

```bash
bun install
bun run dev         # watch 모드
bun run test        # vitest
bun run lint        # biome
```

## 동작 원리

1. **background** — `webRequest`로 `playManifest` m3u8 요청 감지, 마스터 플레이리스트를 파싱해서 화질별 variant URL 추출
2. **content** (ISOLATED world) — 플레이어 아래에 다운로드 버튼 삽입, background와 downloader 사이 메시지 중계
3. **downloader** (MAIN world) — 페이지 origin으로 실행되어 CloudFront 서명된 세그먼트를 `fetch`로 받고, 합쳐서 Blob URL로 저장

MAIN world를 쓰는 이유: 영상 플레이어와 동일한 CORS 권한을 그대로 사용하기 위해서입니다.

## License

MIT
