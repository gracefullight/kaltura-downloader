/** Variant stream parsed from a master m3u8 playlist */
export interface Variant {
  url: string;
  bandwidth: number;
  resolution: string;
  height: number;
  label: string;
}

/** Stored manifest info per tab + entryId */
export interface ManifestInfo {
  entryId: string;
  partnerId: string;
  masterUrl: string;
  finalUrl?: string;
  variants: Variant[];
  timestamp: number;
}

/** Captured caption/subtitle info per tab */
export interface CaptionInfo {
  captionAssetId: string;
  ks: string;
  baseUrl: string;
  /** Full download URL via action/serve */
  serveUrl: string;
}

// --- Message types: Background <-> Content Script ---

export interface ManifestReadyMessage {
  type: "MANIFEST_READY";
  entryId: string;
  variants: Pick<Variant, "label" | "resolution" | "bandwidth">[];
}

export interface GetDownloadInfoRequest {
  type: "GET_DOWNLOAD_INFO";
  entryId: string;
}

export interface GetDownloadInfoResponse {
  ok: boolean;
  masterUrl?: string;
  variants?: Pick<Variant, "url" | "label" | "resolution" | "bandwidth">[];
  captions?: CaptionInfo[];
}

export interface CaptionReadyMessage {
  type: "CAPTION_READY";
  captionAssetId: string;
}

// --- Message types: Content Script <-> Page Downloader ---

export interface PageMessage {
  source: string;
  type: string;
}

export interface StartDownloadMessage extends PageMessage {
  type: "START_DOWNLOAD";
  variantUrl: string;
  filename: string;
}

export interface AbortMessage extends PageMessage {
  type: "ABORT";
}

export interface ProgressMessage extends PageMessage {
  type: "PROGRESS";
  phase: "playlist" | "downloading" | "merging" | "saving";
  text: string;
  total?: number;
  completed?: number;
  percent?: number;
}

export interface CompleteMessage extends PageMessage {
  type: "COMPLETE";
  size: number;
  sizeMB: string;
}

export interface ErrorMessage extends PageMessage {
  type: "ERROR";
  error: string;
}
