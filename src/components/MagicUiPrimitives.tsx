import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type RefObject
} from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
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
        <span className="mono">0 B PII</span>
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
