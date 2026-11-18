import { Placeholder } from "@/Placeholder";

/**
 * The one tab with no TopBar: Shots is full-bleed video, as it is on the
 * web, so it owns the whole screen including the notch. The tabs layout
 * turns the header off for this route, which makes this the only screen
 * that has to pad for the top inset itself.
 */
export default function Shots() {
  return (
    <Placeholder
      ownsTopInset
      href="/shots"
      label="Shots"
      blurb="Short video, on expo-video. The biggest single reason for going native: it removes the WebView's decoder ceiling, its autoplay block and the stall when a backgrounded WebView stops decoding."
    />
  );
}
