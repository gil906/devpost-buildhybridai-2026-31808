import React, {
  Children,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type RefObject
} from "react";
import { flushSync } from "react-dom";
import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionStyle
} from "motion/react";

/* ============================================================================
 * 1. Magic UI — DotPattern + NoiseTexture Architectural Canvas Backdrop
 *    Adapted from @magicuidesign/mcp: dot-pattern & noise-texture
 * ============================================================================ */

export const AirlockCanvasBackdrop: React.FC = () => {
  const patternId = useId();
  const noiseId = useId();

  return (
    <div className="airlock-backdrop" aria-hidden="true">
      <svg className="airlock-dot-grid" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern
            id={patternId}
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
            x="0"
            y="0"
          >
            <circle cx="1.5" cy="1.5" r="1" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>

      <svg className="airlock-noise-layer" xmlns="http://www.w3.org/2000/svg">
        <filter id={noiseId}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.65"
            numOctaves={4}
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="linear" slope="0.14" />
            <feFuncG type="linear" slope="0.14" />
            <feFuncB type="linear" slope="0.14" />
          </feComponentTransfer>
        </filter>
        <rect width="100%" height="100%" filter={`url(#${noiseId})`} opacity="0.32" />
      </svg>
    </div>
  );
};

/* ============================================================================
 * 2. Magic UI — AnimatedBeam
 *    Adapted from @magicuidesign/mcp: animated-beam
 * ============================================================================ */

export interface AnimatedBeamProps {
  className?: string;
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  curvature?: number;
  reverse?: boolean;
  pathColor?: string;
  pathWidth?: number;
  pathOpacity?: number;
  gradientStartColor?: string;
  gradientStopColor?: string;
  delay?: number;
  duration?: number;
  active?: boolean;
}

export const AnimatedBeam: React.FC<AnimatedBeamProps> = ({
  className = "",
  containerRef,
  fromRef,
  toRef,
  curvature = 0,
  reverse = false,
  duration = 2.8,
  delay = 0,
  pathColor = "#94a3b8",
  pathWidth = 1.75,
  pathOpacity = 0.28,
  gradientStartColor = "#059669",
  gradientStopColor = "#1d4ed8",
  active = true
}) => {
  const id = useId();
  const prefersReducedMotion = useReducedMotion();
  const [pathD, setPathD] = useState("");
  const [svgDimensions, setSvgDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updatePath = () => {
      if (containerRef.current && fromRef.current && toRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const rectA = fromRef.current.getBoundingClientRect();
        const rectB = toRef.current.getBoundingClientRect();

        const svgWidth = Math.max(1, containerRect.width);
        const svgHeight = Math.max(1, containerRect.height);
        setSvgDimensions({ width: svgWidth, height: svgHeight });

        const startX = rectA.left - containerRect.left + rectA.width / 2;
        const startY = rectA.top - containerRect.top + rectA.height / 2;
        const endX = rectB.left - containerRect.left + rectB.width / 2;
        const endY = rectB.top - containerRect.top + rectB.height / 2;

        const controlY = startY - curvature;
        const d = `M ${startX},${startY} Q ${(startX + endX) / 2},${controlY} ${endX},${endY}`;
        setPathD(d);
      }
    };

    const resizeObserver = new ResizeObserver(() => updatePath());
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    updatePath();
    window.addEventListener("resize", updatePath);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePath);
    };
  }, [containerRef, fromRef, toRef, curvature]);

  const gradientCoordinates = reverse
    ? { x1: ["90%", "-10%"], x2: ["100%", "0%"] }
    : { x1: ["-10%", "105%"], x2: ["5%", "115%"] };

  if (!pathD) return null;

  return (
    <svg
      fill="none"
      width={svgDimensions.width}
      height={svgDimensions.height}
      xmlns="http://www.w3.org/2000/svg"
      className={`pz-animated-beam ${className}`}
      viewBox={`0 0 ${svgDimensions.width} ${svgDimensions.height}`}
      aria-hidden="true"
    >
      <path
        d={pathD}
        stroke={pathColor}
        strokeWidth={pathWidth}
        strokeOpacity={pathOpacity}
        strokeLinecap="round"
        strokeDasharray={active ? undefined : "3 3"}
      />
      {active && !prefersReducedMotion && (
        <path
          d={pathD}
          strokeWidth={pathWidth + 0.5}
          stroke={`url(#${id})`}
          strokeOpacity="1"
          strokeLinecap="round"
        />
      )}
      <defs>
        <motion.linearGradient
          id={id}
          gradientUnits="userSpaceOnUse"
          initial={{ x1: "0%", x2: "0%", y1: "0%", y2: "0%" }}
          animate={{
            x1: gradientCoordinates.x1,
            x2: gradientCoordinates.x2,
            y1: ["0%", "0%"],
            y2: ["0%", "0%"]
          }}
          transition={{
            delay,
            duration,
            ease: [0.16, 1, 0.3, 1],
            repeat: Infinity,
            repeatDelay: 0.25
          }}
        >
          <stop stopColor={gradientStartColor} stopOpacity="0" />
          <stop stopColor={gradientStartColor} />
          <stop offset="45%" stopColor={gradientStopColor} />
          <stop offset="100%" stopColor={gradientStopColor} stopOpacity="0" />
        </motion.linearGradient>
      </defs>
    </svg>
  );
};

/* ============================================================================
 * 3. Magic UI — BorderBeam
 *    Adapted from @magicuidesign/mcp: border-beam
 * ============================================================================ */

export interface BorderBeamProps {
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  borderWidth?: number;
  reverse?: boolean;
  className?: string;
}

export const BorderBeam: React.FC<BorderBeamProps> = ({
  size = 68,
  duration = 6,
  delay = 0,
  colorFrom = "#059669",
  colorTo = "#1d4ed8",
  borderWidth = 1.5,
  reverse = false,
  className = ""
}) => {
  const prefersReducedMotion = useReducedMotion();
  if (prefersReducedMotion) return null;

  return (
    <div
      aria-hidden="true"
      className={`pz-border-beam-wrap ${className}`}
      style={{ "--beam-border-w": `${borderWidth}px` } as CSSProperties}
    >
      <motion.div
        className="pz-border-beam-runner"
        style={
          {
            width: size,
            height: size,
            offsetPath: `rect(0 auto auto 0 round ${size}px)`,
            background: `linear-gradient(90deg, transparent, ${colorFrom}, ${colorTo}, transparent)`
          } as MotionStyle
        }
        initial={{ offsetDistance: "0%" }}
        animate={{
          offsetDistance: reverse ? ["100%", "0%"] : ["0%", "100%"]
        }}
        transition={{
          repeat: Infinity,
          ease: "linear",
          duration,
          delay: -delay
        }}
      />
    </div>
  );
};

/* ============================================================================
 * 4. Magic UI — MagicCard (Interactive Pointer-Tracking Spotlight Border)
 *    Adapted from @magicuidesign/mcp: magic-card
 * ============================================================================ */

export interface MagicCardProps extends React.HTMLAttributes<HTMLElement> {
  as?: "section" | "div" | "article";
  gradientSize?: number;
  gradientColor?: string;
  gradientFrom?: string;
  gradientTo?: string;
  children: React.ReactNode;
}

export const MagicCard: React.FC<MagicCardProps> = ({
  as = "section",
  className = "",
  gradientSize = 260,
  gradientColor = "rgba(29, 78, 216, 0.045)",
  gradientFrom = "rgba(5, 150, 105, 0.42)",
  gradientTo = "rgba(29, 78, 216, 0.42)",
  children,
  ...rest
}) => {
  const mouseX = useMotionValue(-gradientSize);
  const mouseY = useMotionValue(-gradientSize);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      mouseX.set(e.clientX - rect.left);
      mouseY.set(e.clientY - rect.top);
    },
    [mouseX, mouseY]
  );

  const handlePointerLeave = useCallback(() => {
    mouseX.set(-gradientSize);
    mouseY.set(-gradientSize);
  }, [mouseX, mouseY, gradientSize]);

  const borderSpotlight = useMotionTemplate`radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px, ${gradientFrom}, ${gradientTo}, transparent 75%)`;
  const surfaceSheen = useMotionTemplate`radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px, ${gradientColor}, transparent 80%)`;

  const Tag = as;

  return (
    <Tag
      className={`pz-magic-card ${className}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      {...rest}
    >
      <motion.div
        aria-hidden="true"
        className="pz-magic-card-border"
        style={{ background: borderSpotlight }}
      />
      <motion.div
        aria-hidden="true"
        className="pz-magic-card-sheen"
        style={{ background: surfaceSheen }}
      />
      <div className="pz-magic-card-inner">{children}</div>
    </Tag>
  );
};

/* ============================================================================
 * 5. Magic UI — BlurFade
 *    Adapted from @magicuidesign/mcp: blur-fade
 * ============================================================================ */

export interface BlurFadeProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  offset?: number;
  direction?: "up" | "down" | "left" | "right";
  style?: CSSProperties;
}

export const BlurFade: React.FC<BlurFadeProps> = ({
  children,
  className = "",
  delay = 0,
  duration = 0.26,
  offset = 6,
  direction = "up",
  style
}) => {
  const prefersReducedMotion = useReducedMotion();
  if (prefersReducedMotion) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  const axis = direction === "left" || direction === "right" ? "x" : "y";
  const sign = direction === "right" || direction === "down" ? -offset : offset;

  return (
    <motion.div
      className={className}
      style={style}
      initial={{ [axis]: sign, opacity: 0, filter: "blur(5px)" }}
      animate={{ [axis]: 0, opacity: 1, filter: "blur(0px)" }}
      exit={{ [axis]: -sign * 0.5, opacity: 0, filter: "blur(3px)" }}
      transition={{
        delay,
        duration,
        ease: [0.22, 1, 0.36, 1]
      }}
    >
      {children}
    </motion.div>
  );
};

/* ============================================================================
 * 6. Magic UI — NumberTicker
 *    Adapted from @magicuidesign/mcp: number-ticker
 * ============================================================================ */

export const NumberTicker: React.FC<{
  value: number;
  className?: string;
}> = ({ value, className = "" }) => {
  const prefersReducedMotion = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(value);
  const springValue = useSpring(motionValue, { damping: 34, stiffness: 240 });

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  useEffect(() => {
    if (prefersReducedMotion) {
      if (ref.current) ref.current.textContent = String(value);
      return;
    }
    const unsub = springValue.on("change", (latest) => {
      if (ref.current) {
        ref.current.textContent = Intl.NumberFormat("en-US").format(Math.round(latest));
      }
    });
    return () => unsub();
  }, [springValue, prefersReducedMotion, value]);

  return (
    <span ref={ref} className={`pz-number-ticker ${className}`}>
      {value}
    </span>
  );
};

/* ============================================================================
 * 7. Magic UI — HyperText (Cryptographic Cipher Scramble)
 *    Adapted from @magicuidesign/mcp: hyper-text
 * ============================================================================ */

const CIPHER_CHARS = "0123456789ABCDEF#[]_";

export const HyperText: React.FC<{
  text: string;
  duration?: number;
  className?: string;
}> = ({ text, duration = 420, className = "" }) => {
  const prefersReducedMotion = useReducedMotion();
  const [display, setDisplay] = useState(text);
  const animRef = useRef<number | null>(null);

  const runScramble = useCallback(
    (target: string) => {
      if (prefersReducedMotion) {
        setDisplay(target);
        return;
      }
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
      const start = performance.now();
      const len = target.length;

      const tick = (now: number) => {
        const progress = Math.min((now - start) / duration, 1);
        const locked = progress * len;
        let next = "";
        for (let i = 0; i < len; i++) {
          const ch = target[i];
          if (ch === " " || ch === "#" || ch === "-" || i <= locked) {
            next += ch;
          } else {
            next += CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)];
          }
        }
        setDisplay(next);
        if (progress < 1) {
          animRef.current = requestAnimationFrame(tick);
        } else {
          setDisplay(target);
        }
      };

      animRef.current = requestAnimationFrame(tick);
    },
    [duration, prefersReducedMotion]
  );

  useEffect(() => {
    runScramble(text);
    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    };
  }, [text, runScramble]);

  return (
    <span
      className={`pz-hyper-text ${className}`}
      onMouseEnter={() => runScramble(text)}
    >
      {display}
    </span>
  );
};

/* ============================================================================
 * 8. Magic UI — ShimmerButton
 *    Adapted from @magicuidesign/mcp: shimmer-button
 * ============================================================================ */

export interface ShimmerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  shimmerColor?: string;
  children: React.ReactNode;
}

export const ShimmerButton: React.FC<ShimmerButtonProps> = ({
  shimmerColor = "rgba(52, 211, 153, 0.75)",
  className = "",
  children,
  ...props
}) => {
  return (
    <button
      style={{ "--shimmer-color": shimmerColor } as CSSProperties}
      className={`pz-shimmer-btn ${className}`}
      {...props}
    >
      <span className="pz-shimmer-track" aria-hidden="true">
        <span className="pz-shimmer-sweep" />
      </span>
      <span className="pz-shimmer-backdrop" aria-hidden="true" />
      <span className="pz-shimmer-content">{children}</span>
    </button>
  );
};

/* ============================================================================
 * 9. Hybrid Airlock Bridge Telemetry Widget (AnimatedBeam + NumberTicker)
 * ============================================================================ */

export const HybridAirlockBridge: React.FC<{
  totalMasked: number;
  isRunning: boolean;
  isAirgapped: boolean;
  liveFirebase: boolean;
  isOpen: boolean;
  shortSha: string;
  onToggle: () => void;
}> = ({
  totalMasked,
  isRunning,
  isAirgapped,
  liveFirebase,
  isOpen,
  shortSha,
  onToggle
}) => {
  const containerRef = useRef<HTMLButtonElement>(null);
  const enclaveNodeRef = useRef<HTMLSpanElement>(null);
  const gateNodeRef = useRef<HTMLSpanElement>(null);
  const cloudNodeRef = useRef<HTMLSpanElement>(null);

  return (
    <button
      ref={containerRef}
      type="button"
      className={`airlock-bridge-btn${isOpen ? " open" : ""}${isAirgapped ? " airgapped" : ""}`}
      aria-expanded={isOpen}
      aria-label="Hybrid AI execution summary and routing policy"
      title="Inspect or switch Firebase AI Logic Hybrid Inference routing policy"
      onClick={onToggle}
    >
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={enclaveNodeRef}
        toRef={gateNodeRef}
        duration={2.4}
        gradientStartColor="#059669"
        gradientStopColor="#0ea5e9"
        active={true}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={gateNodeRef}
        toRef={cloudNodeRef}
        duration={2.4}
        delay={0.9}
        gradientStartColor="#0ea5e9"
        gradientStopColor="#1d4ed8"
        active={!isAirgapped}
      />

      <span className="bridge-stage">
        <span ref={enclaveNodeRef} className="bridge-node enclave" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
            <rect x="4" y="4" width="16" height="12" rx="2" />
            <path d="M2 20h20" />
          </svg>
        </span>
        <span className="bridge-text">
          <span className="bridge-kicker hide-xs">ENCLAVE</span>
          <strong>
            {isRunning ? (
              "Scrubbing…"
            ) : (
              <>
                <NumberTicker value={totalMasked} /> <span className="hide-xs">PII </span>Masked
              </>
            )}
          </strong>
        </span>
      </span>

      <span className="bridge-connector" aria-hidden="true" />

      <span ref={gateNodeRef} className="bridge-zero-chip" title={`SHA-256 #${shortSha || "VERIFIED"}`}>
        <span className="live-emerald-dot" />
        <AnimatedShinyText shimmerWidth={54} className="mono pz-shiny-emerald">
          0 B PII
        </AnimatedShinyText>
      </span>

      <span className="bridge-connector" aria-hidden="true" />

      <span className={`bridge-stage ${isAirgapped ? "muted" : "cloud"}`}>
        <span ref={cloudNodeRef} className={`bridge-node ${isAirgapped ? "offline" : "cloud"}`} aria-hidden="true">
          {isAirgapped ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M17.5 19H7a4.5 4.5 0 0 1-.9-8.9A6 6 0 0 1 17.8 9a4 4 0 0 1-.3 10Z" />
            </svg>
          )}
        </span>
        <span className="bridge-text">
          <span className="bridge-kicker hide-xs">{isAirgapped ? "AIR-GAPPED" : "CLOUD AI"}</span>
          <strong>
            {isAirgapped ? "Local Only" : liveFirebase ? "Live Gemini" : "Safe Gemini"}
          </strong>
        </span>
        <span className={`bridge-chevron${isOpen ? " rotated" : ""}`} aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </span>
    </button>
  );
};

/* ============================================================================
 * 10. Magic UI — AnimatedShinyText
 *     Adapted from @magicuidesign/mcp: animated-shiny-text
 * ============================================================================ */

export const AnimatedShinyText: React.FC<{
  children: React.ReactNode;
  shimmerWidth?: number;
  className?: string;
}> = ({ children, shimmerWidth = 86, className = "" }) => {
  return (
    <span
      style={{ "--shiny-width": `${shimmerWidth}px` } as CSSProperties}
      className={`pz-animated-shiny-text ${className}`}
    >
      {children}
    </span>
  );
};

/* ============================================================================
 * 11. Magic UI — AnimatedThemeToggler (View Transitions Clip-Path Wipe)
 *     Adapted from @magicuidesign/mcp: animated-theme-toggler
 * ============================================================================ */

type ViewTransitionDoc = Document & {
  startViewTransition?: (cb: () => void) => {
    ready?: Promise<void>;
    finished?: Promise<void>;
  };
};

export const AnimatedThemeToggler: React.FC<{
  theme: "light" | "dark";
  onThemeChange: (next: "light" | "dark") => void;
  duration?: number;
  className?: string;
}> = ({ theme, onThemeChange, duration = 440, className = "" }) => {
  const isDark = theme === "dark";
  const buttonRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(false);

  const handleToggle = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn || busyRef.current) return;
    const nextTheme: "light" | "dark" = isDark ? "light" : "dark";

    const applyTheme = () => {
      document.documentElement.classList.toggle("dark", nextTheme === "dark");
      document.documentElement.setAttribute("data-theme", nextTheme);
      try {
        localStorage.setItem("piizero-theme", nextTheme);
      } catch {
        // Ignore storage errors in strict browser modes
      }
      onThemeChange(nextTheme);
    };

    const doc = document as ViewTransitionDoc;
    if (typeof doc.startViewTransition !== "function") {
      applyTheme();
      return;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxRadius = Math.hypot(Math.max(cx, vw - cx), Math.max(cy, vh - cy));
    const pxPct = `${(cx / vw) * 100}% ${(cy / vh) * 100}%`;
    const rPct = `${(maxRadius / (Math.hypot(vw, vh) / Math.SQRT2)) * 100}%`;
    const clipPath = [`circle(0% at ${pxPct})`, `circle(${rPct} at ${pxPct})`];

    busyRef.current = true;
    document.documentElement.dataset.magicuiThemeVt = "active";

    const vt = doc.startViewTransition(() => {
      flushSync(applyTheme);
    });

    vt.ready
      ?.then(() => {
        document.documentElement.animate(
          { clipPath },
          {
            duration,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "forwards",
            pseudoElement: "::view-transition-new(root)"
          }
        );
      })
      .catch(() => {});

    vt.finished
      ?.finally(() => {
        busyRef.current = false;
        delete document.documentElement.dataset.magicuiThemeVt;
      })
      .catch(() => {
        busyRef.current = false;
        delete document.documentElement.dataset.magicuiThemeVt;
      });
  }, [isDark, duration, onThemeChange]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleToggle}
      className={`pz-theme-toggler ${className}`}
      aria-label={isDark ? "Switch to Swiss Paper light theme" : "Switch to Obsidian Enclave dark theme"}
      title={isDark ? "Switch to Swiss Paper (Light)" : "Switch to Obsidian Enclave (Dark)"}
    >
      {isDark ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2.2M12 19.8V22M4.93 4.93l1.56 1.56M17.51 17.51l1.56 1.56M2 12h2.2M19.8 12H22M4.93 19.07l1.56-1.56M17.51 6.49l1.56-1.56" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
};

/* ============================================================================
 * 12. Magic UI — GlyphMatrix (Live Cryptographic Cipher Canvas)
 *     Adapted from @magicuidesign/mcp: glyph-matrix
 * ============================================================================ */

export const GlyphMatrix: React.FC<{
  glyphs?: string;
  cellSize?: number;
  mutationRate?: number;
  interval?: number;
  fadeBottom?: number;
  color?: string;
  className?: string;
}> = ({
  glyphs = "01·•#[]_ABCDEF",
  cellSize = 13,
  mutationRate = 0.045,
  interval = 110,
  fadeBottom = 0.55,
  color = "#34d399",
  className = ""
}) => {
  const prefersReducedMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rgbaRef = useRef({ r: 52, g: 211, b: 153, a: 1 });

  useEffect(() => {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    const pCtx = probe.getContext("2d");
    if (!pCtx) return;
    pCtx.fillStyle = "#34d399";
    pCtx.fillStyle = color;
    pCtx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = pCtx.getImageData(0, 0, 1, 1).data;
    rgbaRef.current = { r, g, b, a: a / 255 };
  }, [color]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cols = 0;
    let rows = 0;
    let cells: string[] = [];
    let alphas: number[] = [];
    let raf = 0;
    let last = 0;
    let stopped = false;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.max(1, Math.ceil(w / cellSize));
      rows = Math.max(1, Math.ceil(h / cellSize));
      cells = new Array(cols * rows)
        .fill(0)
        .map(() => glyphs[Math.floor(Math.random() * glyphs.length)]);
      alphas = new Array(cols * rows).fill(0).map(() => 0.06 + Math.random() * 0.28);
    };

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.font = `${cellSize - 3}px "IBM Plex Mono", ui-monospace, monospace`;
      ctx.textBaseline = "top";
      const { r, g, b, a: cAlpha } = rgbaRef.current;
      for (let y = 0; y < rows; y++) {
        const fade = fadeBottom > 0 ? 1 - (y / rows) * fadeBottom : 1;
        for (let x = 0; x < cols; x++) {
          const idx = y * cols + x;
          const alpha = alphas[idx] * fade * cAlpha;
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
          ctx.fillText(cells[idx], x * cellSize, y * cellSize);
        }
      }
    };

    const tick = (t: number) => {
      if (stopped) return;
      if (!prefersReducedMotion && t - last >= interval) {
        last = t;
        const total = cols * rows;
        const mutations = Math.max(1, Math.floor(total * mutationRate));
        for (let n = 0; n < mutations; n++) {
          const idx = Math.floor(Math.random() * total);
          cells[idx] = glyphs[Math.floor(Math.random() * glyphs.length)];
          alphas[idx] = 0.06 + Math.random() * 0.34;
        }
        draw();
      }
      raf = requestAnimationFrame(tick);
    };

    resize();
    draw();
    if (!prefersReducedMotion) {
      raf = requestAnimationFrame(tick);
    }

    const ro = new ResizeObserver(() => {
      resize();
      draw();
    });
    ro.observe(canvas);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [glyphs, cellSize, mutationRate, interval, fadeBottom, prefersReducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      className={`pz-glyph-matrix ${className}`}
      aria-hidden="true"
    />
  );
};

/* ============================================================================
 * 13. Magic UI — DiaTextReveal (Horizontal Prismatic Band Sweep)
 *     Adapted from @magicuidesign/mcp: dia-text-reveal
 * ============================================================================ */

const DIA_BAND_HALF = 18;
const DIA_START = -DIA_BAND_HALF;
const DIA_END = 100 + DIA_BAND_HALF;
const DIA_COLORS = ["#10b981", "#0ea5e9", "#2563eb", "#38bdf8"];

function buildDiaGradient(pos: number, colors: string[], textColor: string) {
  const bandStart = pos - DIA_BAND_HALF;
  const bandEnd = pos + DIA_BAND_HALF;
  if (bandStart >= 100) {
    return `linear-gradient(90deg, ${textColor}, ${textColor})`;
  }
  const parts: string[] = [];
  if (bandStart > 0) {
    parts.push(`${textColor} 0%`, `${textColor} ${bandStart.toFixed(1)}%`);
  }
  colors.forEach((c, i) => {
    const pct = bandStart + (i / (colors.length - 1)) * DIA_BAND_HALF * 2;
    parts.push(`${c} ${pct.toFixed(1)}%`);
  });
  if (bandEnd < 100) {
    parts.push(`transparent ${bandEnd.toFixed(1)}%`, `transparent 100%`);
  }
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}

export const DiaTextReveal: React.FC<{
  text: string;
  duration?: number;
  className?: string;
}> = ({ text, duration = 0.85, className = "" }) => {
  const prefersReducedMotion = useReducedMotion();
  const sweepPos = useMotionValue(prefersReducedMotion ? DIA_END : DIA_START);
  const backgroundImage = useTransform(sweepPos, (pos) =>
    buildDiaGradient(pos, DIA_COLORS, "var(--ink-900)")
  );

  useEffect(() => {
    if (prefersReducedMotion) {
      sweepPos.set(DIA_END);
      return;
    }
    sweepPos.set(DIA_START);
    const ctrl = animate(sweepPos, DIA_END, {
      duration,
      ease: [0.22, 1, 0.36, 1]
    });
    return () => ctrl.stop();
  }, [text, duration, prefersReducedMotion, sweepPos]);

  return (
    <motion.span
      className={`pz-dia-reveal ${className}`}
      style={{
        color: "transparent",
        backgroundClip: "text",
        WebkitBackgroundClip: "text",
        backgroundSize: "100% 100%",
        backgroundImage
      }}
    >
      {text}
    </motion.span>
  );
};

/* ============================================================================
 * 14. Magic UI — GlareHover (Diagonal Specular Sweep)
 *     Adapted from @magicuidesign/mcp: glare-hover
 * ============================================================================ */

export const GlareHover: React.FC<
  React.HTMLAttributes<HTMLDivElement> & {
    glareColor?: string;
    angle?: number;
    duration?: number;
  }
> = ({
  children,
  glareColor = "rgba(16, 185, 129, 0.14)",
  angle = -38,
  duration = 560,
  className = "",
  style,
  ...rest
}) => {
  return (
    <div
      className={`pz-glare-hover ${className}`}
      style={
        {
          "--gh-rgba": glareColor,
          "--gh-angle": `${angle}deg`,
          "--gh-duration": `${duration}ms`,
          ...style
        } as CSSProperties
      }
      {...rest}
    >
      {children}
    </div>
  );
};

/* ============================================================================
 * 15. Magic UI — Marquee (Pause-on-Hover Compliance Telemetry Ribbon)
 *     Adapted from @magicuidesign/mcp: marquee
 * ============================================================================ */

export const Marquee: React.FC<{
  children: React.ReactNode;
  pauseOnHover?: boolean;
  reverse?: boolean;
  repeat?: number;
  durationSec?: number;
  className?: string;
}> = ({
  children,
  pauseOnHover = true,
  reverse = false,
  repeat = 3,
  durationSec = 36,
  className = ""
}) => {
  return (
    <div
      className={`pz-marquee${pauseOnHover ? " pause-hover" : ""} ${className}`}
      style={{ "--marquee-duration": `${durationSec}s` } as CSSProperties}
    >
      {Array.from({ length: repeat }).map((_, idx) => (
        <div
          key={idx}
          aria-hidden={idx > 0 ? true : undefined}
          className={`pz-marquee-track${reverse ? " reverse" : ""}`}
        >
          {children}
        </div>
      ))}
    </div>
  );
};

/* ============================================================================
 * 16. Magic UI — RippleButton
 *     Adapted from @magicuidesign/mcp: ripple-button
 * ============================================================================ */

interface RippleWave {
  x: number;
  y: number;
  size: number;
  key: number;
}

export const RippleButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    rippleColor?: string;
  }
> = ({
  children,
  className = "",
  rippleColor = "rgba(16, 185, 129, 0.28)",
  onClick,
  ...props
}) => {
  const [ripples, setRipples] = useState<RippleWave[]>([]);
  const keyRef = useRef(0);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.15;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    keyRef.current += 1;
    const k = keyRef.current;
    setRipples((prev) => [...prev, { x, y, size, key: k }]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.key !== k));
    }, 620);
    onClick?.(e);
  };

  return (
    <button className={`pz-ripple-btn ${className}`} onClick={handleClick} {...props}>
      <span className="pz-ripple-fg">{children}</span>
      <span className="pz-ripple-layer" aria-hidden="true">
        {ripples.map((r) => (
          <span
            key={r.key}
            className="pz-ripple-circle"
            style={{
              width: r.size,
              height: r.size,
              left: r.x,
              top: r.y,
              backgroundColor: rippleColor
            }}
          />
        ))}
      </span>
    </button>
  );
};

/* ============================================================================
 * 17. Magic UI — InteractiveHoverButton (Dot-Expand + Sliding Arrow CTA)
 *     Adapted from @magicuidesign/mcp: interactive-hover-button
 * ============================================================================ */

export const InteractiveHoverButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement>
> = ({ children, className = "", ...props }) => {
  return (
    <button className={`pz-interactive-hover-btn ${className}`} {...props}>
      <span className="pz-ihb-idle">
        <span className="pz-ihb-dot" aria-hidden="true" />
        <span className="pz-ihb-label">{children}</span>
      </span>
      <span className="pz-ihb-hover" aria-hidden="true">
        <span>{children}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
};

/* ============================================================================
 * 18. Magic UI — AnimatedCircularProgressBar (SVG Radial Gauge)
 *     Adapted from @magicuidesign/mcp: animated-circular-progress-bar
 * ============================================================================ */

export const AnimatedCircularProgressBar: React.FC<{
  value: number;
  max?: number;
  min?: number;
  size?: number;
  strokeWidth?: number;
  gaugePrimaryColor?: string;
  gaugeSecondaryColor?: string;
  labelSuffix?: string;
  className?: string;
}> = ({
  value,
  max = 100,
  min = 0,
  size = 40,
  strokeWidth = 9,
  gaugePrimaryColor = "#10b981",
  gaugeSecondaryColor = "rgba(148, 163, 184, 0.22)",
  labelSuffix = "%",
  className = ""
}) => {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, Math.round(((value - min) / (max - min)) * 100)));
  const dashOffset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className={`pz-circular-gauge ${className}`}
      style={{ width: size, height: size }}
      role="meter"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg viewBox="0 0 100 100" className="pz-circular-svg" aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={gaugeSecondaryColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={gaugePrimaryColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            transform: "rotate(-90deg)",
            transformOrigin: "50% 50%",
            transition: "stroke-dashoffset 0.75s cubic-bezier(0.22, 1, 0.36, 1), stroke 0.35s ease"
          }}
        />
      </svg>
      <span className="pz-circular-label mono">
        {clamped}
        {labelSuffix}
      </span>
    </div>
  );
};

/* ============================================================================
 * 19. Magic UI — Terminal + TypingAnimation + AnimatedSpan
 *     Adapted from @magicuidesign/mcp: terminal
 * ============================================================================ */

interface TerminalSeqCtx {
  activeIndex: number;
  completeItem: (idx: number) => void;
}

const TermSequenceCtx = createContext<TerminalSeqCtx | null>(null);
const TermItemIdxCtx = createContext<number | null>(null);

export const AnimatedSpan: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => {
  const seq = useContext(TermSequenceCtx);
  const idx = useContext(TermItemIdxCtx);
  const visible = !seq || idx === null || seq.activeIndex >= idx;

  useEffect(() => {
    if (!seq || idx === null) return;
    if (seq.activeIndex === idx) {
      const t = setTimeout(() => seq.completeItem(idx), 160);
      return () => clearTimeout(t);
    }
  }, [seq, idx]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className={`pz-term-line ${className}`}
    >
      {children}
    </motion.div>
  );
};

export const TypingAnimation: React.FC<{
  children: string;
  duration?: number;
  className?: string;
}> = ({ children, duration = 16, className = "" }) => {
  const prefersReducedMotion = useReducedMotion();
  const seq = useContext(TermSequenceCtx);
  const idx = useContext(TermItemIdxCtx);
  const active = !seq || idx === null || seq.activeIndex >= idx;
  const [text, setText] = useState(prefersReducedMotion ? children : "");

  useEffect(() => {
    if (!active) {
      setText("");
      return;
    }
    if (prefersReducedMotion) {
      setText(children);
      if (seq && idx !== null && seq.activeIndex === idx) seq.completeItem(idx);
      return;
    }
    let pos = 0;
    const timer = setInterval(() => {
      pos += 1;
      setText(children.slice(0, pos));
      if (pos >= children.length) {
        clearInterval(timer);
        if (seq && idx !== null) seq.completeItem(idx);
      }
    }, duration);
    return () => clearInterval(timer);
  }, [active, children, duration, prefersReducedMotion, seq, idx]);

  if (!active) return null;
  return <div className={`pz-term-line ${className}`}>{text}</div>;
};

export const Terminal: React.FC<{
  title?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ title = "firebase-ai-airlock — zsh", children, className = "" }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const items = useMemo(() => Children.toArray(children), [children]);

  const ctx = useMemo<TerminalSeqCtx>(
    () => ({
      activeIndex,
      completeItem: (idx: number) => {
        setActiveIndex((cur) => (cur === idx ? cur + 1 : cur));
      }
    }),
    [activeIndex]
  );

  return (
    <TermSequenceCtx.Provider value={ctx}>
      <div className={`pz-terminal ${className}`}>
        <div className="pz-terminal-bar">
          <div className="pz-terminal-dots" aria-hidden="true">
            <span className="dot red" />
            <span className="dot amber" />
            <span className="dot green" />
          </div>
          <span className="pz-terminal-title mono">{title}</span>
          <button
            type="button"
            className="pz-terminal-replay mono"
            onClick={() => setActiveIndex(0)}
            title="Replay enclave trace"
          >
            ↻ Replay
          </button>
        </div>
        <pre className="pz-terminal-body mono">
          <code>
            {items.map((child, idx) => (
              <TermItemIdxCtx.Provider key={idx} value={idx}>
                {child}
              </TermItemIdxCtx.Provider>
            ))}
          </code>
        </pre>
      </div>
    </TermSequenceCtx.Provider>
  );
};

/* ============================================================================
 * 20. Magic UI — CodeComparison (Before vs After Airlock Diff View)
 *     Adapted from @magicuidesign/mcp: code-comparison
 * ============================================================================ */

export const CodeComparison: React.FC<{
  filename: string;
  beforeTitle?: string;
  afterTitle?: string;
  beforeLines: Array<{ text: string; kind?: "remove" | "neutral" }>;
  afterLines: Array<{ text: string; kind?: "add" | "neutral" }>;
}> = ({
  filename,
  beforeTitle = "BEFORE · Raw Cloud Leak",
  afterTitle = "AFTER · PII-Zero Hybrid Airlock",
  beforeLines,
  afterLines
}) => {
  return (
    <div className="pz-code-comparison">
      <div className="pz-cc-grid">
        <div className="pz-cc-pane before">
          <div className="pz-cc-header">
            <span className="mono">{filename}</span>
            <span className="pz-cc-tag danger mono">{beforeTitle}</span>
          </div>
          <pre className="pz-cc-pre mono">
            {beforeLines.map((ln, i) => (
              <div key={i} className={`pz-cc-line ${ln.kind ?? "neutral"}`}>
                <span className="pz-cc-ln">{i + 1}</span>
                <span>{ln.text}</span>
              </div>
            ))}
          </pre>
        </div>

        <div className="pz-cc-pane after">
          <div className="pz-cc-header">
            <span className="mono">{filename}</span>
            <span className="pz-cc-tag safe mono">{afterTitle}</span>
          </div>
          <pre className="pz-cc-pre mono">
            {afterLines.map((ln, i) => (
              <div key={i} className={`pz-cc-line ${ln.kind ?? "neutral"}`}>
                <span className="pz-cc-ln">{i + 1}</span>
                <span>{ln.text}</span>
              </div>
            ))}
          </pre>
        </div>
      </div>
      <div className="pz-cc-vs mono" aria-hidden="true">
        VS
      </div>
    </div>
  );
};

/* ============================================================================
 * 21. Magic UI — Safari & Android Device Mockup Frames
 *     Adapted from @magicuidesign/mcp: safari & android
 * ============================================================================ */

export const SafariMockup: React.FC<{
  url?: string;
  children: React.ReactNode;
}> = ({ url = "ehr.riverside-medical.org — PII-Zero MV3 Side Panel", children }) => {
  return (
    <div className="pz-safari-frame">
      <div className="pz-safari-chrome">
        <div className="pz-terminal-dots" aria-hidden="true">
          <span className="dot red" />
          <span className="dot amber" />
          <span className="dot green" />
        </div>
        <div className="pz-safari-url mono">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          <span>{url}</span>
        </div>
      </div>
      <div className="pz-safari-viewport">{children}</div>
    </div>
  );
};

export const AndroidMockup: React.FC<{
  unfolded?: boolean;
  children: React.ReactNode;
}> = ({ unfolded = true, children }) => {
  return (
    <div className={`pz-android-frame ${unfolded ? "unfolded" : "cover"}`}>
      <div className="pz-android-topbar" aria-hidden="true">
        <span className="mono">9:41</span>
        <span className="pz-android-camera" />
        <span className="mono">5G · 100%</span>
      </div>
      <div className="pz-android-screen">{children}</div>
      <div className="pz-android-gesture-pill" aria-hidden="true" />
    </div>
  );
};

