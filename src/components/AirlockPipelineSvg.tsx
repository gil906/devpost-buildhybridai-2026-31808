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
  const shortHash = sanitizedSha256 ? sanitizedSha256.slice(0, 14) + "..." : "pending";
  return (
    <div className="panel" style={{ marginBottom: "1rem", padding: "0.95rem 1.25rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.55rem",
          flexWrap: "wrap",
          gap: "0.5rem"
        }}
      >
        <span className="panel-title" style={{ fontSize: "0.78rem" }}>
          HYBRID AI AIRLOCK TRANSFER PIPELINE — ZERO-TRUST BOUNDARY TELEMETRY
        </span>
        <span className="tabular-nums" style={{ fontSize: "0.75rem", color: "var(--fg-secondary)" }}>
          Reconciliation: {totalDetected} Total = {redactedOnDevice} On-Device NER + {customPolicyCount} Policy | Outbound Raw PII: {cloudPiiBytes} B
        </span>
      </div>
      <svg
        viewBox="0 0 1140 118"
        width="100%"
        height="118"
        role="img"
        aria-label="3-Stage Hybrid AI Airlock Transfer Pipeline"
        style={{ display: "block" }}
      >
        {/* Animated Transfer Beams */}
        <line
          x1="330"
          y1="58"
          x2="430"
          y2="58"
          stroke="#263849"
          strokeWidth="3"
        />
        <line
          x1="330"
          y1="58"
          x2="430"
          y2="58"
          stroke="#f2cb85"
          strokeWidth="2.5"
          className="beam-animated"
        />
        <line
          x1="710"
          y1="58"
          x2="810"
          y2="58"
          stroke="#263849"
          strokeWidth="3"
        />
        <line
          x1="710"
          y1="58"
          x2="810"
          y2="58"
          stroke={gatePassed ? "#8dd6c7" : "#e06c75"}
          strokeWidth="2.5"
          className="beam-animated"
        />

        {/* Stage 1 Box */}
        <rect
          x="8"
          y="10"
          width="322"
          height="96"
          rx="6"
          fill="#1d2f3f"
          stroke="#8dd6c7"
          strokeWidth="1.2"
        />
        <text x="22" y="32" fill="#8dd6c7" fontSize="11" fontFamily="monospace" fontWeight="600">
          STAGE 1 · ON-DEVICE SCRUBBER &amp; EPHEMERAL VAULT
        </text>
        <text x="22" y="54" fill="#e6edf2" fontSize="12" fontWeight="600">
          Gemini Nano v4 + 18-Category HIPAA Enclave
        </text>
        <text x="22" y="74" fill="#b7c6d1" fontSize="11" fontFamily="monospace">
          Mode: {stage1Mode} | Source: on_device
        </text>
        <text x="22" y="92" fill="#f2cb85" fontSize="11" fontFamily="monospace">
          Vaulted: {totalDetected} tokens ({redactedOnDevice} NER + {customPolicyCount} policy)
        </text>

        {/* Beam 1 Label */}
        <text x="380" y="46" textAnchor="middle" fill="#f2cb85" fontSize="10" fontFamily="monospace">
          [PII_*] ONLY
        </text>
        <text x="380" y="76" textAnchor="middle" fill="#b7c6d1" fontSize="10" fontFamily="monospace">
          0 Raw PII
        </text>

        {/* Stage 2 Box */}
        <rect
          x="430"
          y="10"
          width="280"
          height="96"
          rx="6"
          fill="#1d2f3f"
          stroke={gatePassed ? "#8dd6c7" : "#e06c75"}
          strokeWidth="1.2"
        />
        <text
          x="444"
          y="32"
          fill={gatePassed ? "#8dd6c7" : "#e06c75"}
          fontSize="11"
          fontFamily="monospace"
          fontWeight="600"
        >
          STAGE 2 · SHA-256 ZERO-PII GATEKEEPER
        </text>
        <text x="444" y="54" fill="#e6edf2" fontSize="12" fontWeight="600">
          {gatePassed ? "VERIFIED ZERO-LEAK RECEIPT" : "OUTBOUND PAYLOAD BLOCKED"}
        </text>
        <text x="444" y="74" fill="#b7c6d1" fontSize="11" fontFamily="monospace">
          SHA-256: {shortHash}
        </text>
        <text x="444" y="92" fill="#8dd6c7" fontSize="11" fontFamily="monospace">
          Cloud PII Bytes Transmitted: {cloudPiiBytes} B
        </text>

        {/* Beam 2 Label */}
        <text x="760" y="46" textAnchor="middle" fill="#8dd6c7" fontSize="10" fontFamily="monospace">
          TLS + AppCheck
        </text>
        <text x="760" y="76" textAnchor="middle" fill="#b7c6d1" fontSize="10" fontFamily="monospace">
          in_cloud
        </text>

        {/* Stage 3 Box */}
        <rect
          x="810"
          y="10"
          width="322"
          height="96"
          rx="6"
          fill="#1d2f3f"
          stroke="#263849"
          strokeWidth="1.2"
        />
        <text x="824" y="32" fill="#f2cb85" fontSize="11" fontFamily="monospace" fontWeight="600">
          STAGE 3 · CLOUD GEMINI 2.5 FLASH + RE-HYDRATION
        </text>
        <text x="824" y="54" fill="#e6edf2" fontSize="12" fontWeight="600">
          Clinical Differential &amp; Legal Clause Matrix
        </text>
        <text x="824" y="74" fill="#b7c6d1" fontSize="11" fontFamily="monospace">
          SDK: GoogleAIBackend (ONLY_IN_CLOUD)
        </text>
        <text x="824" y="92" fill="#8dd6c7" fontSize="11" fontFamily="monospace">
          Local Vault Re-hydration: {rehydrateEnabled ? `ACTIVE (${restoredCount} restored)` : "SANITIZED VIEW"}
        </text>
      </svg>
    </div>
  );
};
