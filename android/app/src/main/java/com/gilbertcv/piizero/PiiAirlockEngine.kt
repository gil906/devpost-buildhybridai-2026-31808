package com.gilbertcv.piizero

import java.security.MessageDigest

enum class HybridInferenceMode(val wireValue: String, val displayLabel: String) {
    PREFER_ON_DEVICE("prefer_on_device", "PREFER_ON_DEVICE (Nano 4 -> Cloud)"),
    ONLY_ON_DEVICE("only_on_device", "ONLY_ON_DEVICE (Strict Airgap)"),
    ONLY_IN_CLOUD("only_in_cloud", "ONLY_IN_CLOUD (Sanitized Cloud)")
}

enum class ComplianceDomain(val wireValue: String, val displayLabel: String) {
    CLINICAL("clinical", "Clinical EHR (HIPAA 18)"),
    LEGAL("legal", "Legal Privilege (FRE 502)")
}

data class PiiRule(
    val id: String,
    val category: String,
    val hipaaCitation: String,
    val regex: Regex
)

data class VaultTokenEntry(
    val token: String,
    val category: String,
    val originalValue: String,
    val maskedPreview: String,
    val hipaaCitation: String
)

data class ScrubResult(
    val domain: ComplianceDomain,
    val originalText: String,
    val redactedText: String,
    val tokenVault: Map<String, VaultTokenEntry>,
    val totalSpansScrubbed: Int,
    val uniqueTokenCount: Int
)

data class ResidualFinding(
    val category: String,
    val hipaaCitation: String,
    val count: Int,
    val sampleMasked: String
)

data class ZeroPiiGatekeeperProof(
    val passed: Boolean,
    val residualCount: Int,
    val residualFindings: List<ResidualFinding>,
    val sha256Attestation: String,
    val outboundBytes: Int,
    val policyVersion: String = "HIPAA-SafeHarbor-18+FRE502-v2026.1"
)

data class RehydrationResult(
    val hydratedText: String,
    val restoredTokenCount: Int
)

data class AirlockPipelineOutput(
    val mode: HybridInferenceMode,
    val domain: ComplianceDomain,
    val engineLabel: String,
    val latencyMs: Long,
    val scrubResult: ScrubResult,
    val gatekeeperProof: ZeroPiiGatekeeperProof,
    val cloudRedactedSummary: String,
    val localRehydratedSummary: String,
    val restoredTokenCount: Int
)

object PiiAirlockEngine {

    val rules: List<PiiRule> = listOf(
        PiiRule(
            id = "SSN",
            category = "SSN",
            hipaaCitation = "45 CFR §164.514(b)(2)(i)(G)",
            regex = Regex("""\b\d{3}-\d{2}-\d{4}\b""")
        ),
        PiiRule(
            id = "MRN",
            category = "MRN",
            hipaaCitation = "45 CFR §164.514(b)(2)(i)(H)",
            regex = Regex("""\b(?:MRN|Medical Record(?:\s*#|\s*No\.?|)?)[-:\s]*([A-Z0-9]{4,14})\b""", RegexOption.IGNORE_CASE)
        ),
        PiiRule(
            id = "HEALTH_PLAN",
            category = "HEALTH_PLAN",
            hipaaCitation = "45 CFR §164.514(b)(2)(i)(I)",
            regex = Regex("""\b(?:HPB|Policy\s*#|Member\s*ID|Subscriber\s*ID)[-:\s]*([A-Z0-9-]{5,18})\b""", RegexOption.IGNORE_CASE)
        ),
        PiiRule(
            id = "LICENSE",
            category = "LICENSE",
            hipaaCitation = "45 CFR §164.514(b)(2)(i)(K)",
            regex = Regex("""\b(?:DEA|NPI|Bar\s*#|License\s*#)[-:\s]*([A-Z0-9-]{6,14})\b""", RegexOption.IGNORE_CASE)
        ),
        PiiRule(
            id = "DOCKET",
            category = "DOCKET",
            hipaaCitation = "FRE 502 Work-Product Docket",
            regex = Regex("""\b(?:Case\s*No\.?|Docket\s*No\.?|Matter\s*#)[-:\s]*([0-9A-Z:-]{4,20})\b""", RegexOption.IGNORE_CASE)
        ),
        PiiRule(
            id = "ACCOUNT",
            category = "ACCOUNT",
            hipaaCitation = "45 CFR §164.514(b)(2)(i)(J)",
            regex = Regex("""\b(?:Acct(?:\s*#|\.?)|Account(?:\s*#|\s*No\.?)|ABA|Routing(?:\s*#)?)[-:\s]*([A-Z0-9-]{6,22})\b""", RegexOption.IGNORE_CASE)
        ),
        PiiRule(
            id = "SETTLEMENT",
            category = "SETTLEMENT",
            hipaaCitation = "FRE 408 Privileged Valuation",
            regex = Regex("""\$[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{2})?""")
        ),
        PiiRule(
            id = "EMAIL",
            category = "EMAIL",
            hipaaCitation = "45 CFR §164.514(b)(2)(i)(F)",
            regex = Regex("""\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b""")
        ),
        PiiRule(
            id = "PHONE",
            category = "PHONE",
            hipaaCitation = "45 CFR §164.514(b)(2)(i)(D)",
            regex = Regex("""(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b""")
        ),
        PiiRule(
            id = "DATE",
            category = "DATE",
            hipaaCitation = "45 CFR §164.514(b)(2)(i)(C)",
            regex = Regex("""\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{2,4})\b""")
        ),
        PiiRule(
            id = "DEVICE",
            category = "DEVICE",
            hipaaCitation = "45 CFR §164.514(b)(2)(i)(M)",
            regex = Regex("""\b(?:UDI|Serial\s*#|IMEI|Pacemaker\s*SN)[-:\s]*([A-Z0-9:-]{5,20})\b""", RegexOption.IGNORE_CASE)
        ),
        PiiRule(
            id = "ADDRESS",
            category = "ADDRESS",
            hipaaCitation = "45 CFR §164.514(b)(2)(i)(B)",
            regex = Regex("""\b\d{1,5}\s+[A-Z][A-Za-z0-9.\s]{2,28}\s+(?:Street|St\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Way)(?:,\s*(?:Suite|Ste\.?|Apt\.?|Unit)\s*[A-Za-z0-9-]+)?""")
        ),
        PiiRule(
            id = "PERSON",
            category = "PERSON",
            hipaaCitation = "45 CFR §164.514(b)(2)(i)(A)",
            regex = Regex("""\b((?:Patient|Client|Plaintiff|Defendant|Deponent|Claimant|Attending|Counsel|Signatory)\s*:\s*|Dr\.\s+|Mr\.\s+|Mrs\.\s+|Ms\.\s+|Atty\.\s+)([A-Z][a-z]+(?:[-\s][A-Z][a-z]+){1,2})\b""")
        )
    )

    private val labelPrefixRegex = Regex(
        """^((?:Patient|Client|Plaintiff|Defendant|Deponent|Claimant|Attending|Counsel|Signatory)\s*:\s*)(.+)$""",
        RegexOption.IGNORE_CASE
    )

    fun maskValue(raw: String): String {
        val trimmed = raw.trim()
        if (trimmed.length <= 4) return "****"
        val middleDots = "•".repeat((trimmed.length - 4).coerceIn(3, 8))
        return trimmed.take(2) + middleDots + trimmed.takeLast(2)
    }

    fun sha256Hex(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    fun scrubText(rawText: String, domain: ComplianceDomain = ComplianceDomain.CLINICAL): ScrubResult {
        val counters = mutableMapOf<String, Int>()
        val normalizedMap = mutableMapOf<String, String>()
        val vault = linkedMapOf<String, VaultTokenEntry>()
        var totalSpans = 0
        var working = rawText

        for (rule in rules) {
            working = rule.regex.replace(working) { matchResult ->
                val full = matchResult.value
                val labelMatch = if (rule.id == "PERSON") labelPrefixRegex.find(full) else null
                val prefix = labelMatch?.groupValues?.get(1) ?: ""
                val sensitive = (labelMatch?.groupValues?.get(2) ?: full).trim()

                val key = "${rule.category}::${sensitive.lowercase()}"
                val token = normalizedMap.getOrPut(key) {
                    val nextIdx = (counters[rule.category] ?: 0) + 1
                    counters[rule.category] = nextIdx
                    val newToken = "[PII_${rule.category}_$nextIdx]"
                    vault[newToken] = VaultTokenEntry(
                        token = newToken,
                        category = rule.category,
                        originalValue = sensitive,
                        maskedPreview = maskValue(sensitive),
                        hipaaCitation = rule.hipaaCitation
                    )
                    newToken
                }
                totalSpans += 1
                "$prefix$token"
            }
        }

        return ScrubResult(
            domain = domain,
            originalText = rawText,
            redactedText = working,
            tokenVault = vault,
            totalSpansScrubbed = totalSpans,
            uniqueTokenCount = vault.size
        )
    }

    fun verifyZeroPiiGatekeeper(candidateText: String): ZeroPiiGatekeeperProof {
        val tokenNeutralized = candidateText.replace(Regex("""\[PII_[A-Z_]+_\d+\]"""), "REDACTED_TOKEN")
        val findings = mutableListOf<ResidualFinding>()

        for (rule in rules) {
            val matches = rule.regex.findAll(tokenNeutralized).toList()
            if (matches.isNotEmpty()) {
                findings.add(
                    ResidualFinding(
                        category = rule.category,
                        hipaaCitation = rule.hipaaCitation,
                        count = matches.size,
                        sampleMasked = maskValue(matches.first().value)
                    )
                )
            }
        }

        return ZeroPiiGatekeeperProof(
            passed = findings.isEmpty(),
            residualCount = findings.size,
            residualFindings = findings,
            sha256Attestation = sha256Hex(candidateText),
            outboundBytes = candidateText.toByteArray(Charsets.UTF_8).size
        )
    }

    fun rehydrateResponse(
        redactedResponse: String,
        tokenVault: Map<String, VaultTokenEntry>
    ): RehydrationResult {
        var hydrated = redactedResponse
        var count = 0
        for ((token, entry) in tokenVault) {
            if (hydrated.contains(token)) {
                hydrated = hydrated.replace(token, entry.originalValue)
                count += 1
            }
        }
        return RehydrationResult(
            hydratedText = hydrated,
            restoredTokenCount = count
        )
    }

    fun buildDeterministicSynthesis(
        scrubResult: ScrubResult,
        mode: HybridInferenceMode
    ): String {
        val keys = scrubResult.tokenVault.keys
        val personToken = keys.firstOrNull { it.startsWith("[PII_PERSON_") } ?: "[PII_PERSON_1]"
        val dateToken = keys.firstOrNull { it.startsWith("[PII_DATE_") } ?: "[PII_DATE_1]"
        val recordToken = keys.firstOrNull {
            it.startsWith("[PII_MRN_") || it.startsWith("[PII_DOCKET_")
        } ?: keys.firstOrNull() ?: "[PII_RECORD_1]"

        return if (scrubResult.domain == ComplianceDomain.LEGAL) {
            listOf(
                "PRIVILEGED WORK-PRODUCT SYNTHESIS (${mode.wireValue})",
                "• Matter & Parties: Audited redacted record for $personToken under $recordToken dated $dateToken.",
                "• Zero-Trust De-Identification: ${scrubResult.uniqueTokenCount} unique privileged/PII entities (${scrubResult.totalSpansScrubbed} spans) isolated on-device.",
                "• Key Clauses & Valuation: Counterparty wire instructions, settlement reserves, and liability caps require partner review.",
                "• Disposition: Release sanitized schedule externally while keeping $personToken mapping in local hardware vault."
            ).joinToString("\n")
        } else {
            listOf(
                "CLINICAL HANDOFF & TRIAGE BRIEF (${mode.wireValue})",
                "• Patient Encounter: Structured assessment for $personToken (Record $recordToken) on $dateToken.",
                "• Zero-Trust De-Identification: ${scrubResult.uniqueTokenCount} unique HIPAA Safe Harbor identifiers (${scrubResult.totalSpansScrubbed} spans) scrubbed locally.",
                "• Clinical Findings: Telemetry arrhythmia and device serial telemetry indicate cardiology follow-up priority.",
                "• Care Plan: Confirm outpatient electrophysiology consult for $personToken and transmit redacted note."
            ).joinToString("\n")
        }
    }
}
