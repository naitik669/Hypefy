import s from "./empty.module.css";

/*
 * The grey objects for each empty state. Drawn in a 160x120 box (the fishing
 * scene is wider, edge to edge). All motion lives in empty.module.css.
 */

const G1 = "#1c1c1c";
const G2 = "#262626";
const G3 = "#333";
const G4 = "#444";
const G5 = "#555";

/** Messages: a paper plane that swings, flies off and comes back. */
export function PlaneArt() {
  return (
    <svg className={s.art} viewBox="0 0 160 120" aria-hidden>
      <g className={s.planeIntro}>
        <g className={s.plane}>
          <path d="M26 58 L148 18 L96 96 Z" fill={G2} stroke={G3} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M148 18 L72 70 L96 96 Z" fill={G1} stroke={G3} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M72 70 L64 90" stroke={G3} strokeWidth="2.5" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}

/** Activity: a phone buzzes, calls out "hello?", and the echo fades. */
export function HelloArt() {
  return (
    <svg className={s.art} viewBox="0 0 160 120" aria-hidden>
      <g className={s.buzz}>
        <rect x="12" y="50" width="36" height="62" rx="8" fill={G2} stroke={G3} strokeWidth="2.5" />
        <rect x="17" y="58" width="26" height="42" rx="3" fill="#141414" />
        <rect x="24" y="104" width="12" height="3" rx="1.5" fill={G3} />
        <rect x="21" y="64" width="18" height="5" rx="2.5" fill={G3} />
      </g>
      <g className={s.vib} stroke={G4} strokeWidth="2.4" fill="none" strokeLinecap="round">
        <path d="M6 68 q-4 6 0 12 M2 64 q-6 10 0 20" />
        <path d="M54 68 q4 6 0 12 M58 64 q6 10 0 20" />
      </g>
      <g className={s.bubble}>
        <rect x="50" y="12" width="74" height="38" rx="13" fill={G2} stroke={G3} strokeWidth="2.5" />
        <path d="M60 50 L50 62 L74 50" fill={G2} stroke={G3} strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M60 48 H74" stroke={G2} strokeWidth="4" />
        <text x="87" y="37" textAnchor="middle" fontFamily="inherit" fontWeight="800" fontSize="15" fill={G5}>hello?</text>
      </g>
      <text className={s.echo1} x="134" y="66" textAnchor="middle" fontFamily="inherit" fontWeight="800" fontSize="12" fill={G4}>hello?</text>
      <text className={s.echo2} x="142" y="88" textAnchor="middle" fontFamily="inherit" fontWeight="800" fontSize="10" fill="#383838">hello?</text>
      <text className={s.echo3} x="146" y="108" textAnchor="middle" fontFamily="inherit" fontWeight="800" fontSize="8" fill="#2e2e2e">hello?</text>
    </svg>
  );
}

/** Your posts: an empty frame swinging on its nail, a "+" pulsing inside. */
export function FrameArt() {
  return (
    <svg className={`${s.art} ${s.subject}`} viewBox="0 0 160 120" aria-hidden>
      <circle cx="80" cy="8" r="4" fill={G4} />
      <g className={s.swing}>
        <path d="M80 8 L50 34 M80 8 L110 34" stroke={G3} strokeWidth="2" />
        <rect x="40" y="30" width="80" height="80" rx="6" fill={G2} stroke={G3} strokeWidth="2.5" />
        <rect x="52" y="42" width="56" height="56" rx="3" fill="#141414" stroke={G3} strokeWidth="2" strokeDasharray="4 5" />
        <path className={s.plus} d="M80 60 V80 M70 70 H90" stroke={G5} strokeWidth="3.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** Your Shots: a clapperboard that tilts, claps and settles. */
export function ClapperArt() {
  return (
    <svg className={s.art} viewBox="0 0 160 120" aria-hidden>
      <g className={s.board}>
        <rect x="30" y="46" width="100" height="64" rx="6" fill={G2} stroke={G3} strokeWidth="2.5" />
        <path d="M42 66 H118 M42 80 H100 M42 94 H84" stroke={G3} strokeWidth="3" strokeLinecap="round" />
        <g className={s.arm}>
          <rect x="28" y="26" width="104" height="18" rx="3" fill={G1} stroke={G3} strokeWidth="2.5" />
          <path d="M44 26 L36 44 M66 26 L58 44 M88 26 L80 44 M110 26 L102 44" stroke={G4} strokeWidth="5" />
        </g>
        <g className={s.clapBurst} stroke={G5} strokeWidth="2.5" strokeLinecap="round">
          <path d="M136 36 L148 30 M138 46 L152 46 M136 56 L148 62" />
        </g>
      </g>
    </svg>
  );
}

/** Saved: a locker door swings open on one lonely hanger. */
export function LockerArt() {
  return (
    <svg className={`${s.art} ${s.subject}`} viewBox="0 0 160 120" aria-hidden>
      <rect x="48" y="4" width="64" height="112" rx="6" fill="#0e0e0e" stroke={G3} strokeWidth="2.5" />
      <path d="M54 22 H106" stroke="#2a2a2a" strokeWidth="3" strokeLinecap="round" />
      <g className={s.hanger}>
        <path d="M80 22 V28 Q80 32 84 30 M80 30 L60 46 H100 Z" stroke={G4} strokeWidth="2.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      </g>
      <g className={s.lockerDoor}>
        <rect x="50" y="6" width="60" height="108" rx="5" fill={G2} stroke={G3} strokeWidth="2.5" />
        <path d="M60 18 H100 M60 24 H100 M60 30 H100 M60 36 H100" stroke={G3} strokeWidth="2.5" strokeLinecap="round" />
        <rect x="96" y="58" width="6" height="16" rx="3" fill={G4} />
      </g>
    </svg>
  );
}

/** Search: a line is cast, the hook comes back empty. Spans the full width. */
export function FishingArt() {
  return (
    <svg className={`${s.artFull} ${s.fadeIn}`} viewBox="0 0 276 156" aria-hidden>
      <g className={s.rod}>
        <path d="M-20 116 L176 50" stroke={G4} strokeWidth="4.5" strokeLinecap="round" />
        <path d="M-20 116 L30 99" stroke={G5} strokeWidth="7" strokeLinecap="round" />
        <circle cx="40" cy="96" r="6" fill={G2} stroke={G4} strokeWidth="2.5" />
        <circle cx="176" cy="50" r="2.4" fill={G5} />
        <g className={s.hang}>
          <path className={s.fishLine} d="M176 50 V168" stroke="#3a3a3a" strokeWidth="1.6" />
          <g className={s.hook}>
            <path d="M176 162 v8 a6 6 0 0 0 12 0 v-4" stroke="#666" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <circle className={s.drip} cx="182" cy="178" r="1.8" fill={G5} />
          </g>
        </g>
      </g>
      <path d="M0 124 H276 V156 H0 Z" fill="#141414" />
      <g className={s.waves}>
        <path
          d="M0 124 q10 -5 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0"
          stroke={G3}
          strokeWidth="2.5"
          fill="none"
        />
        <path d="M10 140 q10 -4 20 0 t20 0 M110 146 q10 -4 20 0 t20 0 M210 138 q10 -4 20 0 t20 0" stroke="#222" strokeWidth="2" fill="none" />
      </g>
      <ellipse className={s.ripple} cx="178" cy="124" rx="18" ry="4" fill="none" stroke={G4} strokeWidth="2" />
      <ellipse className={s.ripple2} cx="178" cy="124" rx="14" ry="3.5" fill="none" stroke={G4} strokeWidth="2" />
    </svg>
  );
}

function TvBody({ children }: { children: React.ReactNode }) {
  return (
    <>
      <path d="M62 8 L78 30 M100 6 L84 30" stroke={G4} strokeWidth="3" strokeLinecap="round" />
      <rect x="24" y="30" width="112" height="76" rx="12" fill={G2} stroke={G3} strokeWidth="2.5" />
      <rect x="34" y="40" width="74" height="56" rx="6" fill="#141414" />
      {children}
      <circle cx="122" cy="54" r="5" fill={G3} />
      <circle cx="122" cy="72" r="5" fill={G3} />
      <path d="M40 106 L34 114 M120 106 L126 114" stroke={G3} strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

/** Shows: an old TV clicks on to static and NO SIGNAL — or, for a Show
 *  that can't be shown, a rolling, tearing picture that says OFF AIR. */
export function TvArt({ offAir = false }: { offAir?: boolean }) {
  return (
    <svg className={`${s.art} ${s.subject}`} viewBox="0 0 160 120" aria-hidden>
      <defs>
        <clipPath id="empty-tv-screen">
          <rect x="34" y="40" width="74" height="56" rx="6" />
        </clipPath>
      </defs>
      <TvBody>
        {offAir ? (
          <g className={s.tvOn} clipPath="url(#empty-tv-screen)">
            <g className={s.tear}>
              <rect x="34" y="50" width="74" height="3" fill="#2a2a2a" />
              <rect x="34" y="84" width="74" height="4" fill="#2a2a2a" />
            </g>
            <rect className={s.rollBar} x="34" y="44" width="74" height="10" fill="#1e1e1e" />
            <rect x="44" y="62" width="54" height="15" rx="3" fill={G2} />
            <text x="71" y="73" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="8.5" fill="#777">OFF AIR</text>
          </g>
        ) : (
          <g className={s.tvOn}>
            <g className={s.static}>
              <rect x="40" y="46" width="10" height="3" fill={G3} />
              <rect x="58" y="52" width="16" height="3" fill={G4} />
              <rect x="44" y="60" width="8" height="3" fill={G4} />
              <rect x="80" y="48" width="12" height="3" fill={G3} />
              <rect x="66" y="68" width="20" height="3" fill={G3} />
              <rect x="42" y="78" width="14" height="3" fill={G3} />
              <rect x="86" y="82" width="10" height="3" fill={G4} />
              <rect x="60" y="86" width="8" height="3" fill={G4} />
            </g>
            <text className={s.noSignal} x="71" y="72" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="8.5" fill="#666">
              NO SIGNAL
            </text>
          </g>
        )}
      </TvBody>
    </svg>
  );
}

/** A Shot that's gone: a film reel rolls in, unspooling, and jams. */
export function ReelArt() {
  return (
    <svg className={s.art} viewBox="0 0 160 120" aria-hidden>
      <path className={s.unspool} pathLength={100} d="M156 112 Q126 112 128 96 Q130 70 92 70" stroke={G2} strokeWidth="16" fill="none" />
      <path className={s.perf} d="M92 70 Q130 70 128 96 Q126 112 150 112" stroke="#141414" strokeWidth="8" strokeDasharray="4 5" fill="none" />
      <g className={s.reelIn}>
        <g className={s.jam}>
          <g transform="translate(62 60)">
            <circle r="44" fill={G2} stroke={G3} strokeWidth="2.5" />
            <circle r="8" fill="#141414" stroke={G3} strokeWidth="2" />
            <circle cy="-24" r="10" fill="#141414" />
            <circle cy="24" r="10" fill="#141414" />
            <circle cx="-24" r="10" fill="#141414" />
            <circle cx="24" r="10" fill="#141414" />
          </g>
        </g>
      </g>
      <g className={s.strain} stroke={G5} strokeWidth="2.5" strokeLinecap="round">
        <path d="M14 22 L6 16 M10 34 L2 32 M24 12 L20 4" />
      </g>
    </svg>
  );
}

/** End of the feed: the Discover compass spins, then becomes the lime tick. */
export function CompassTickArt({ size = 64 }: { size?: number }) {
  return (
    <svg className={s.cuPop} width={size} height={size} viewBox="0 0 72 72" aria-hidden>
      <circle className={s.cuRing} cx="36" cy="36" r="30" fill="none" stroke={G3} strokeWidth="3" />
      <g className={s.cuDial}>
        <circle cx="36" cy="36" r="24" fill={G1} />
        <path d="M36 14 V18 M36 54 V58 M14 36 H18 M54 36 H58" stroke={G4} strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <g className={s.cuNeedle}>
        <path d="M36 16 L41 36 L36 56 L31 36 Z" fill={G3} />
        <path d="M36 16 L41 36 L31 36 Z" fill="#666" />
        <circle cx="36" cy="36" r="2.5" fill="#141414" />
      </g>
      <path className={s.cuCheck} d="M25 36.5 L32.5 44 L47 29" fill="none" stroke="#a3e635" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Calls: a walkie-talkie pops out, shakes, flashes red, "over… over?". */
export function WalkieArt() {
  return (
    <svg className={s.art} viewBox="0 0 160 120" aria-hidden>
      <g className={s.wkPop}>
        <g className={s.wkShake}>
          <path d="M68 30 V4" stroke={G4} strokeWidth="4" strokeLinecap="round" />
          <rect x="56" y="28" width="48" height="88" rx="10" fill={G2} stroke={G3} strokeWidth="2.5" />
          <rect x="64" y="40" width="32" height="22" rx="3" fill="#141414" />
          <path d="M66 74 H94 M66 82 H94 M66 90 H94 M66 98 H94" stroke={G3} strokeWidth="3" strokeLinecap="round" />
          <circle className={s.wkGlow} cx="92" cy="34" r="8" fill="#ef4444" />
          <circle className={s.wkLed} cx="92" cy="34" r="3" fill={G3} />
        </g>
      </g>
      <path className={s.wkCrack} d="M112 50 l6 -4 l-2 6 l6 -3" stroke={G4} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path className={s.wkCrack2} d="M112 66 l7 2 l-4 3 l7 2" stroke={G4} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <text className={s.wkOver1} x="112" y="24" fontFamily="inherit" fontWeight="800" fontSize="12" fill={G4}>over…</text>
      <text className={s.wkOver2} x="118" y="40" fontFamily="inherit" fontWeight="800" fontSize="14" fill={G5}>over?</text>
    </svg>
  );
}

/** Someone else's profile: an easel whose brush taps and leaves nothing. */
export function CanvasArt() {
  return (
    <svg className={`${s.art} ${s.subject}`} viewBox="0 0 160 120" aria-hidden>
      <path d="M60 116 L74 24 M100 116 L86 24 M80 116 V96" stroke={G3} strokeWidth="3.5" strokeLinecap="round" />
      <rect x="46" y="28" width="68" height="62" rx="3" fill="#1e1e1e" stroke={G3} strokeWidth="2.5" />
      <rect x="42" y="88" width="76" height="6" rx="2" fill={G3} />
      <g className={s.brush}>
        <path d="M124 22 L100 58" stroke={G4} strokeWidth="4" strokeLinecap="round" />
        <path d="M100 58 L94 68 L98 70 L103 60 Z" fill={G5} />
      </g>
    </svg>
  );
}

/** Someone else's profile: stage curtains twitch, a pair of eyes peeks out. */
export function CurtainsArt() {
  return (
    <svg className={`${s.art} ${s.subject}`} viewBox="0 0 160 120" aria-hidden>
      <rect x="18" y="14" width="124" height="96" rx="4" fill="#141414" />
      <g className={s.peek}>
        <circle cx="76" cy="60" r="3" fill="#666" />
        <circle cx="85" cy="60" r="3" fill="#666" />
      </g>
      <g className={s.curtainL}>
        <path d="M18 14 H80 V106 Q64 96 50 106 Q36 96 18 106 Z" fill={G2} stroke={G3} strokeWidth="2" />
        <path d="M34 18 V100 M52 18 V100 M68 18 V100" stroke={G1} strokeWidth="3" />
      </g>
      <g className={s.curtainR}>
        <path d="M80 14 H142 V106 Q124 96 110 106 Q96 96 80 106 Z" fill={G2} stroke={G3} strokeWidth="2" />
        <path d="M92 18 V100 M108 18 V100 M126 18 V100" stroke={G1} strokeWidth="3" />
      </g>
      <path d="M12 8 H148 Q146 22 132 22 Q118 14 104 22 Q90 14 80 22 Q70 14 56 22 Q42 14 28 22 Q14 22 12 8 Z" fill={G3} />
      <rect x="10" y="108" width="140" height="8" rx="2" fill={G2} />
    </svg>
  );
}

/** Someone else's profile: a cone bounces in under a COMING SOON sign. */
export function ConeArt() {
  return (
    <svg className={`${s.art} ${s.subject}`} viewBox="0 0 160 120" aria-hidden>
      <path d="M20 116 H140" stroke={G2} strokeWidth="3" strokeLinecap="round" />
      <g className={s.cone}>
        <path d="M42 112 L56 58 H66 L80 112 Z" fill={G2} stroke={G3} strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M50 88 H72 M53 74 H69" stroke="#3a3a3a" strokeWidth="6" />
        <rect x="34" y="110" width="54" height="7" rx="2" fill={G3} />
      </g>
      <path d="M104 116 V36" stroke={G3} strokeWidth="3.5" strokeLinecap="round" />
      <g className={s.sign}>
        <rect x="86" y="36" width="54" height="26" rx="4" fill={G2} stroke={G3} strokeWidth="2.5" />
        <text x="113" y="47" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="7.5" fill="#777">COMING</text>
        <text x="113" y="57" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="7.5" fill="#777">SOON</text>
      </g>
    </svg>
  );
}

/** Unread, all read: an envelope flies in, its flap shuts, a lime tick stamps on. */
export function EnvelopeArt() {
  return (
    <svg className={s.art} viewBox="0 0 160 120" aria-hidden>
      <g className={s.envIn}>
        <g className={s.envBob}>
          <rect x="30" y="34" width="100" height="68" rx="8" fill={G2} stroke={G3} strokeWidth="2.5" />
          <path d="M34 98 L70 66 M126 98 L90 66" stroke={G3} strokeWidth="2.5" strokeLinecap="round" />
          <path className={s.envFlap} d="M32 38 L80 74 L128 38" fill={G1} stroke={G3} strokeWidth="2.5" strokeLinejoin="round" />
          <g className={s.envTick}>
            <circle cx="118" cy="32" r="16" fill="#a3e635" />
            <path d="M110 32 l6 6 l10 -12" stroke="#0f1405" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </g>
      </g>
    </svg>
  );
}

/** Requests, none: the door shudders under two knocks, and "knock?" echoes off into nothing. */
export function KnockArt() {
  return (
    <svg className={s.art} viewBox="0 0 160 120" aria-hidden>
      <g className={s.subject}>
        <g className={s.doorShake}>
          <rect x="44" y="10" width="62" height="100" rx="6" fill={G2} stroke={G3} strokeWidth="2.5" />
          <rect x="54" y="22" width="42" height="30" rx="3" fill={G1} stroke={G3} strokeWidth="2" />
          <circle cx="95" cy="66" r="4" fill={G5} />
        </g>
        <rect x="36" y="108" width="78" height="8" rx="3" fill={G1} stroke={G3} strokeWidth="2" />
        {/* The impact, flashing at the door's edge on each knock. */}
        <g className={s.knockHit} stroke={G4} strokeWidth="2.4" strokeLinecap="round">
          <path d="M110 50 l7 -4 M111 60 h8 M110 70 l7 4" />
        </g>
      </g>
      <text className={s.knock1} x="120" y="40" fontFamily="inherit" fontWeight="800" fontSize="13" fill="#666">knock?</text>
      <text className={s.knock2} x="124" y="60" fontFamily="inherit" fontWeight="800" fontSize="11" fill={G4}>knock?</text>
      <text className={s.knock3} x="126" y="78" fontFamily="inherit" fontWeight="800" fontSize="9" fill="#383838">knock?</text>
    </svg>
  );
}
