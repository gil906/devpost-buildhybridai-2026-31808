import React from "react";
import type { InferenceMode } from "../engine/firebaseHybridSdk";

interface AirlockPipelineSvgProps {
  stage1Mode: InferenceMode;
  totalDetected: number;
  redactedOnDevice: number;
  customPolicyCount: number;
  cloudPiiBytes: number;
  sanitizedSha256: string;
  gatePassed: boolean;
  restoredCount: number;
  rehydrateEnabled: boolean;
}

export const AirlockPipelineSvg: React.FC<AirlockPipelineSvgProps> = ({
  stage1Mode,
  totalDetected,
  redactedOnDevice,
  customPolicyCount,
  cloudPiiBytes,
  sanitizedSha256,
  gatePassed,
  restoredCount,
  rehydrateEnabled
}) => {
  const shortDigest = sanitizedSha256 ? sanitizedSha256.slice(0, 12) : "pending";
  const modeReadable =
    stage1Mode === "only_on_device"
      ? "Only on-device"
      : stage1Mode === "prefer_on_device"
      ? "Prefer on-device"
      : "Sanitized cloud";

  return (
    <div className="card" style={{ padding: "14px 18px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "10px",
          flexWrap: "wrap",
          gap: "8px"
        }}
      >
        <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--fg-primary)" }}>
          Client-to-cloud trust boundary
        </span>
        <span className="tabular-nums" style={{ fontSize: "12px", color: "var(--fg-muted)" }}>
          {totalDetected} tokens mapped ({redactedOnDevice} HIPAA/legal + {customPolicyCount} policy) · SHA-256 {shortDigest}
        </span>
      </div>

      <svg
        viewBox="0 0 1120 124"
        width="100%"
        height="124"
        role="img"
        aria-label="Client device trust boundary to Firebase AI Logic cloud pipeline"
        style={{ display: "block" }}
      >
        {/* Client Device Trust Zone Enclosure */}
        <rect
          x="2"
          y="4"
          width="704"
          height="116"
          rx="8"
          fill="var(--bg-deep)"
          stroke="var(--border-strong)"
          strokeWidth="1"
        />
        <text
          x="16"
          y="22"
          fill="var(--fg-muted)"
          fontSize="11"
          fontFamily="var(--font-sans)"
          fontWeight="500"
        >
          Client device memory (raw PHI &amp; client names stay inside this boundary)
        </text>

        {/* Node 1: On-device Scrubber */}
        <rect
          x="16"
          y="34"
          width="318"
          height="74"
          rx="6"
          fill="var(--bg-card)"
          stroke="var(--border-hairline)"
          strokeWidth="1"
        />
        <text x="30" y="54" fill="var(--fg-primary)" fontSize="12.5" fontFamily="var(--font-sans)" fontWeight="500">
          1. On-device entity scrubber &amp; RAM vault
        </text>
        <text x="30" y="74" fill="var(--fg-secondary)" fontSize="11.5" fontFamily="var(--font-mono)">
          Gemini Nano · {modeReadable}
        </text>
        <text x="30" y="94" fill="var(--accent-amber)" fontSize="11.5" fontFamily="var(--font-mono)">
          Map&lt;token, raw&gt; holds {totalDetected} reversible entries
        </text>

        {/* Connector 1 -> 2 */}
        <line x1="334" y1="71" x2="386" y2="71" stroke="var(--border-strong)" strokeWidth="1.25" />
        <polygon points="386,71 380,67.5 380,74.5" fill="var(--fg-muted)" />

        {/* Node 2: SHA-256 Gatekeeper */}
        <rect
          x="388"
          y="34"
          width="302"
          height="74"
          rx="6"
          fill="var(--bg-card)"
          stroke="var(--border-hairline)"
          strokeWidth="1"
        />
        <circle
          cx="404"
          cy="50"
          r="4"
          fill={gatePassed ? "var(--accent-positive)" : "var(--accent-danger)"}
        />
        <text x="415" y="54" fill="var(--fg-primary)" fontSize="12.5" fontFamily="var(--font-sans)" fontWeight="500">
          2. Pre-socket SHA-256 gatekeeper
        </text>
        <text x="402" y="74" fill="var(--fg-secondary)" fontSize="11.5" fontFamily="var(--font-mono)">
          Digest {shortDigest}… · {gatePassed ? "verified clean" : "blocked"}
        </text>
        <text
          x="402"
          y="94"
          fill={gatePassed ? "var(--accent-positive)" : "var(--accent-danger)"}
          fontSize="11.5"
          fontFamily="var(--font-mono)"
        >
          Outbound raw PII: {cloudPiiBytes} B
        </text>

        {/* Network TLS Boundary Divider */}
        <line
          x1="744"
          y1="6"
          x2="744"
          y2="118"
          stroke="var(--border-strong)"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
        <text
          x="744"
          y="18"
          textAnchor="middle"
          fill="var(--fg-muted)"
          fontSize="10.5"
          fontFamily="var(--font-mono)"
        >
          TLS wire
        </text>

        {/* Forward Wire Arrow (Sanitized [PII_*] only) */}
        <line x1="690" y1="58" x2="796" y2="58" stroke="var(--accent-positive)" strokeWidth="1.4" />
        <polygon points="796,58 790,54.5 790,61.5" fill="var(--accent-positive)" />
        <text x="744" y="50" textAnchor="middle" fill="var(--accent-positive)" fontSize="10.5" fontFamily="var(--font-mono)">
          [PII_*] only
        </text>

        {/* Return Wire Arrow (Re-hydration) */}
        <line x1="796" y1="86" x2="690" y2="86" stroke="var(--fg-muted)" strokeWidth="1.2" />
        <polygon points="690,86 696,82.5 696,89.5" fill="var(--fg-muted)" />
        <text x="744" y="102" textAnchor="middle" fill="var(--fg-muted)" fontSize="10.5" fontFamily="var(--font-mono)">
          {rehydrateEnabled ? `restored (${restoredCount})` : "raw tokens"}
        </text>

        {/* Node 3: Cloud Gemini 2.5 Flash */}
        <rect
          x="798"
          y="24"
          width="318"
          height="88"
          rx="8"
          fill="var(--bg-card)"
          stroke="var(--border-hairline)"
          strokeWidth="1"
        />
        <text x="814" y="46" fill="var(--fg-primary)" fontSize="12.5" fontFamily="var(--font-sans)" fontWeight="500">
          3. Cloud Gemini 2.5 Flash synthesis
        </text>
        <text x="814" y="66" fill="var(--fg-secondary)" fontSize="11.5" fontFamily="var(--font-mono)">
          Firebase AI Logic · GoogleAIBackend
        </text>
        <text x="814" y="86" fill="var(--fg-secondary)" fontSize="11.5" fontFamily="var(--font-sans)">
          Reasons over clinical &amp; legal structure
        </text>
        <text x="814" y="102" fill="var(--fg-muted)" fontSize="11" fontFamily="var(--font-mono)">
          Zero raw identifiers ever enter prompt context
        </text>
      </svg>
    </div>
  );
};
