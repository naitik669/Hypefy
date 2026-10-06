import { MAX_SHOT_MB, MAX_SHOW_MB } from "@/lib/video-poster";
import { isAllowedVideo, isVideoFile } from "@/lib/video-mime";

/**
 * Can this file become a Shot or a Show at all?
 *
 * Asked the moment it is chosen. It used to be asked on the last screen, so
 * a clip that was never going to upload was trimmed, given a cover and
 * captioned first, and refused at the Post button.
 *
 * Returns what is wrong, in words for the person who picked it, or null.
 */
export function pickProblem(
  file: { type?: string; name?: string; size: number },
  mode: "shot" | "show",
): string | null {
  const video = isVideoFile(file);
  if (mode === "shot" && !video) return "A Shot is a video. Choose a video.";
  if (video && !isAllowedVideo(file)) {
    return "That video format isn't supported. Try MP4, WebM or MOV.";
  }
  const maxMb = mode === "show" ? MAX_SHOW_MB : MAX_SHOT_MB;
  if (file.size > maxMb * 1024 * 1024) {
    const mb = (file.size / 1024 / 1024).toFixed(0);
    return `That's ${mb}MB. ${mode === "show" ? "Shows" : "Shots"} can be up to ${maxMb}MB.`;
  }
  return null;
}
