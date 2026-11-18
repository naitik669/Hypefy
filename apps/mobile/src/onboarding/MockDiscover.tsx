import { Image, StyleSheet, Text, View } from "react-native";
import { palette, family } from "@/theme";
import { Float, Orbit, RadialFill } from "@/onboarding/motion";

/**
 * The discover slide — ten faces orbiting a Hypefy hub.
 *
 * Ported from MockDiscover in the web's IntroCarousel. The disc is 300
 * square with the ring inset 12, the hub is 68 square at radius 22, and
 * each face sits at its own angle and orbit radius from DISCOVER_BUBBLES,
 * which is copied entry for entry — angle, size, radius, bob duration and
 * bob delay, ten times over. The whole ring turns once every 48 seconds
 * and each face turns the other way by the same amount so it stays
 * upright.
 *
 * The photographs are the WEB'S files, imported across the workspace.
 *
 * Two differences, both stated rather than hidden:
 *
 *  - `object-position` on the faces. RN's cover crop always centres; the
 *    web nudges each one to keep a head in frame.
 *  - The disc's radial gradient reaches its furthest corner the way CSS's
 *    bare `circle` does, which SVG expresses as a radius rather than a
 *    keyword. See RadialFill in motion.tsx.
 *
 * The web's bubble type allows a gradient-avatar fallback for an entry
 * with no picture. All ten have one, so there is no fallback here — and a
 * test asserts that stays true rather than leaving a face to render blank.
 */

import maya from "../../../../public/onboarding/maya.webp";
import disc6 from "../../../../public/onboarding/disc6.webp";
import disc9 from "../../../../public/onboarding/disc9.webp";
import adaPfp from "../../../../public/onboarding/ada-pfp.webp";
import disc7 from "../../../../public/onboarding/disc7.webp";
import jayPfp from "../../../../public/onboarding/jay-pfp.webp";
import disc1 from "../../../../public/onboarding/disc1.webp";
import disc3 from "../../../../public/onboarding/disc3.webp";
import disc4 from "../../../../public/onboarding/disc4.jpg";
import disc5 from "../../../../public/onboarding/disc5.webp";

/** h-[300px] w-[300px] — the disc's box. */
const BOX = 300;

/** The ring turns once every 48s, and each face turns back as fast. */
const ORBIT_MS = 48_000;

type Bubble = {
  /** Where on the ring, in degrees — the web's own angles. */
  readonly deg: number;
  readonly size: number;
  /** Orbit radius, as a percentage of the box. */
  readonly r: number;
  readonly dur: number;
  readonly delay: number;
  readonly img: number;
};

/** The web's DISCOVER_BUBBLES, in the web's order. */
const BUBBLES: readonly Bubble[] = [
  { deg: -90, size: 52, r: 40, dur: 3600, delay: 0, img: maya },
  { deg: -54, size: 46, r: 41, dur: 4400, delay: 900, img: disc6 },
  { deg: -18, size: 48, r: 39, dur: 3100, delay: 400, img: disc9 },
  { deg: 18, size: 58, r: 40, dur: 4700, delay: 1300, img: adaPfp },
  { deg: 54, size: 46, r: 41, dur: 3400, delay: 200, img: disc7 },
  { deg: 90, size: 50, r: 40, dur: 4100, delay: 700, img: jayPfp },
  { deg: 126, size: 48, r: 41, dur: 3000, delay: 500, img: disc1 },
  { deg: 162, size: 46, r: 39, dur: 4600, delay: 1100, img: disc3 },
  { deg: 198, size: 50, r: 40, dur: 3800, delay: 300, img: disc4 },
  { deg: 234, size: 44, r: 41, dur: 4200, delay: 1500, img: disc5 },
];

export function MockDiscover() {
  return (
    <View style={styles.box}>
      {/* The filled dark disc */}
      <View style={styles.disc}>
        <RadialFill
          cx={0.5}
          cy={0.44}
          stops={[
            { offset: 0, color: "#1d1d1d" },
            { offset: 0.55, color: "#121212" },
            { offset: 1, color: "#0b0b0b" },
          ]}
        />
      </View>

      {/* The ring. Positions travel; the faces inside counter-rotate. */}
      <View style={styles.ring} pointerEvents="none">
        <Orbit duration={ORBIT_MS}>
          <View style={styles.ring}>
            {BUBBLES.map((b) => {
              const a = (b.deg * Math.PI) / 180;
              return (
                <View
                  key={b.deg}
                  style={{
                    position: "absolute",
                    // The web's left/top are percentages with a
                    // translate(-50%,-50%); RN has no percentage translate,
                    // so the half-size offset is taken off the margin —
                    // exact, because the size is known.
                    left: `${50 + b.r * Math.cos(a)}%`,
                    top: `${50 + b.r * Math.sin(a)}%`,
                    marginLeft: -b.size / 2,
                    marginTop: -b.size / 2,
                  }}
                >
                  <Orbit reverse duration={ORBIT_MS}>
                    <Float dur={b.dur} delay={b.delay}>
                      <View
                        style={[
                          styles.bubble,
                          {
                            width: b.size,
                            height: b.size,
                            borderRadius: b.size * 0.28, // rounded-[28%]
                          },
                        ]}
                      >
                        <Image source={b.img} style={styles.fill} resizeMode="cover" />
                      </View>
                    </Float>
                  </Orbit>
                </View>
              );
            })}
          </View>
        </Orbit>
      </View>

      {/* The hub, above the ring */}
      <View style={styles.hub}>
        <Text style={styles.hubMark}>
          H<Text style={styles.hubDot}>.</Text>
        </Text>
      </View>
    </View>
  );
}

/** h-[68px] w-[68px] on the hub. */
const HUB = 68;

const styles = StyleSheet.create({
  box: { width: BOX, height: BOX },
  // absolute inset-3 rounded-full
  disc: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 12,
    bottom: 12,
    borderRadius: (BOX - 24) / 2,
    overflow: "hidden",
  },
  // absolute inset-0
  ring: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },

  bubble: {
    overflow: "hidden",
    backgroundColor: palette.elevated,
    borderWidth: 2, // ring-2
    borderColor: "rgba(255, 255, 255, 0.1)", // ring-white/10
    // shadow-xl, as one shadow rather than four.
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },

  hub: {
    position: "absolute",
    left: BOX / 2 - HUB / 2, // left-1/2 with -translate-x-1/2
    top: BOX / 2 - HUB / 2, // top-1/2 with -translate-y-1/2
    width: HUB,
    height: HUB,
    zIndex: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22, // rounded-[22px]
    backgroundColor: "#262626",
    borderWidth: 1, // ring-1
    borderColor: "rgba(255, 255, 255, 0.15)", // ring-white/15
    // shadow-2xl
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
    elevation: 20,
  },
  hubMark: {
    color: palette.foreground,
    fontFamily: family.extrabold,
    fontSize: 30, // text-3xl
    letterSpacing: -0.75, // tracking-tight at 30px
    // The accent dot hangs to the right of the glyph, so the lockup is
    // nudged left to optically centre the H rather than the H-plus-dot box.
    transform: [{ translateX: 3 }], // translate-x-[3px]
  },
  hubDot: { color: palette.accent },

  fill: { width: "100%", height: "100%" },
});
