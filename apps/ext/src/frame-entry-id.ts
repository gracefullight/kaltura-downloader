/**
 * Resolve the video id for a player frame so multi-video pages download the
 * matching stream (not the tab's most recently seen manifest).
 *
 * - Kaltura: `/entryId/{id}/` or `/entryid/{id}/`
 * - Hotmart embed: `/embed/{videoId}` (matches m3u8 `/video/{videoId}/`)
 * - Hotmart media path: `/video/{videoId}/...`
 */
export function resolveFrameEntryId(pathname: string): string {
  const kaltura = pathname.match(/entryid\/([^/]+)/i)?.[1];
  if (kaltura) return kaltura;

  const hotmartEmbed = pathname.match(/\/embed\/([^/?#]+)/i)?.[1];
  if (hotmartEmbed) return decodeURIComponent(hotmartEmbed);

  const hotmartVideo = pathname.match(/\/video\/([^/]+)\//i)?.[1];
  if (hotmartVideo) return decodeURIComponent(hotmartVideo);

  return "";
}
