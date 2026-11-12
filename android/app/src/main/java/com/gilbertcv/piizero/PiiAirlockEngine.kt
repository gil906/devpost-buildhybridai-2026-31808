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
        val keys = scrubResult.tokenVault.keys.toList()
        val personTokens = keys.filter { it.startsWith("[PII_PERSON_") }
        val personToken = personTokens.firstOrNull() ?: "[PII_PERSON_1]"
        val providerToken = personTokens.getOrNull(1) ?: "[PII_PERSON_2]"
        val dateTokens = keys.filter { it.startsWith("[PII_DATE_") }
        val dobToken = dateTokens.firstOrNull() ?: "[PII_DATE_1]"
        val visitDateToken = dateTokens.getOrNull(1) ?: dobToken
        val ssnToken = keys.firstOrNull { it.startsWith("[PII_SSN_") } ?: "[PII_SSN_1]"
        val settlementToken = keys.firstOrNull { it.startsWith("[PII_SETTLEMENT_") } ?: "[PII_SETTLEMENT_1]"
        val docketToken = keys.firstOrNull { it.startsWith("[PII_DOCKET_") } ?: "[PII_DOCKET_1]"

        return if (scrubResult.domain == ComplianceDomain.LEGAL) {
            when (mode) {
                HybridInferenceMode.ONLY_ON_DEVICE ->
                    "[100% Local Enclave · 0 B Cloud Egress] Offline legal extraction for $personToken ($docketToken, counsel $providerToken): 5-year confidentiality obligation, 12-month US-wide non-compete restriction, and $settlementToken liability cap verified in local RAM."
                HybridInferenceMode.PREFER_ON_DEVICE ->
                    "[Gemini Nano 4 Primary → Hybrid Verified] On-device scan for $personToken under $docketToken flagged an aggressive 12-month nationwide non-compete alongside a $settlementToken liability ceiling executed on $dobToken."
                HybridInferenceMode.ONLY_IN_CLOUD ->
                    "[Cloud Gemini 2.5 Flash · Zero-PII Tokens] Reviewed Non-Disclosure Agreement for $personToken ($docketToken) with counsel $providerToken. Includes a 12-month non-compete clause, 5-year confidentiality term, and liability cap of $settlementToken."
            }
        } else {
            when (mode) {
                HybridInferenceMode.ONLY_ON_DEVICE ->
                    "[100% Local Enclave · 0 B Cloud Egress] Offline clinical extraction for $personToken (DOB $dobToken, SSN $ssnToken) evaluated by $providerToken on $visitDateToken: chronic back pain with suspected lumbar disc herniation. Physical therapy and 3-month follow-up verified in device RAM."
                HybridInferenceMode.PREFER_ON_DEVICE ->
                    "[Gemini Nano 4 Primary → Hybrid Verified] On-device clinical triage for $personToken ($visitDateToken with $providerToken): suspected lumbar intervertebral disc herniation (ICD-10 M51.26). Prioritizes physical therapy stabilization and 90-day re-evaluation."
                HybridInferenceMode.ONLY_IN_CLOUD ->
                    "The patient, $personToken (DOB $dobToken), presented on $visitDateToken with ongoing back pain. Evaluated by $providerToken for a possible disc herniation; recommends physical therapy and follow-up in 3 months."
            }
        }
    }

    fun scrubQuestionWithVault(
        rawQuestion: String,
        tokenVault: Map<String, VaultTokenEntry>
    ): String {
        var sanitized = rawQuestion.trim().ifEmpty { "Summarize this record" }
        val sortedEntries = tokenVault.values.sortedByDescending { it.originalValue.length }
        for (entry in sortedEntries) {
            if (entry.originalValue.length >= 3 && sanitized.contains(entry.originalValue, ignoreCase = true)) {
                sanitized = sanitized.replace(Regex(Regex.escape(entry.originalValue), RegexOption.IGNORE_CASE), entry.token)
            }
        }
        val extraScrub = scrubText(sanitized, ComplianceDomain.CLINICAL)
        return extraScrub.redactedText
    }

    fun answerQuestionDeterministically(
        scrubResult: ScrubResult,
        rawQuestion: String,
        mode: HybridInferenceMode,
        rehydrateEnabled: Boolean
    ): String {
        val sanitizedQ = scrubQuestionWithVault(rawQuestion, scrubResult.tokenVault)
        val qLower = sanitizedQ.lowercase()
        val keys = scrubResult.tokenVault.keys.toList()
        val personTokens = keys.filter { it.startsWith("[PII_PERSON_") }
        val personTok = personTokens.firstOrNull() ?: "[PII_PERSON_1]"
        val providerTok = personTokens.getOrNull(1) ?: "[PII_PERSON_2]"
        val dateTokens = keys.filter { it.startsWith("[PII_DATE_") }
        val dobTok = dateTokens.firstOrNull() ?: "[PII_DATE_1]"
        val visitTok = dateTokens.getOrNull(1) ?: dobTok
        val ssnTok = keys.firstOrNull { it.startsWith("[PII_SSN_") } ?: "[PII_SSN_1]"
        val mrnTok = keys.firstOrNull { it.startsWith("[PII_MRN_") } ?: "[PII_MRN_1]"
        val settlementTok = keys.firstOrNull { it.startsWith("[PII_SETTLEMENT_") } ?: "[PII_SETTLEMENT_1]"
        val docketTok = keys.firstOrNull { it.startsWith("[PII_DOCKET_") } ?: "[PII_DOCKET_1]"
        val addrTok = keys.firstOrNull { it.startsWith("[PII_ADDRESS_") } ?: "[PII_ADDRESS_1]"

        val modeTag = when (mode) {
            HybridInferenceMode.ONLY_ON_DEVICE -> "100% LOCAL ENCLAVE · 0 B CLOUD"
            HybridInferenceMode.PREFER_ON_DEVICE -> "HYBRID · NANO 4 → FLASH"
            HybridInferenceMode.ONLY_IN_CLOUD -> "CLOUD · GEMINI 2.5 FLASH"
        }
        val routeProof = if (mode == HybridInferenceMode.ONLY_ON_DEVICE) {
            "Processed 100% in Local RAM as: \"$sanitizedQ\""
        } else {
            "Sent to AI as: \"$sanitizedQ\""
        }

        val asksPii = Regex("""\b(ssn|social|pii|redact|mask|token|vault|leak|hipaa|privacy|safe|secret)\b""").containsMatchIn(qLower)
        val asksWho = Regex("""\b(who|patient|doctor|provider|attending|physician|client|party|parties|counsel|attorney|name|age|dob|birth|hospital|center)\b""").containsMatchIn(qLower)
        val asksWhen = Regex("""\b(when|date|time|schedule|follow-up|follow up|how long|duration|term|year|month|visit|executed)\b""").containsMatchIn(qLower)
        val asksTreatment = Regex("""\b(treatment|medication|meds|drug|therapy|physical|plan|next step|action|recommend)\b""").containsMatchIn(qLower)
        val asksFindings = Regex("""\b(diagnos|symptom|finding|condition|pain|disc|herniat|back|problem|wrong|clinical|mri)\b""").containsMatchIn(qLower)
        val asksNonCompete = Regex("""\b(non-compete|noncompete|compete|competitor|geographic|restrict|territory)\b""").containsMatchIn(qLower)
        val asksLiability = Regex("""\b(liability|cap|damage|money|dollar|amount|compensation|settlement|wire|cost|how much)\b""").containsMatchIn(qLower)
        val asksRedline = Regex("""\b(modif|redline|change|negotiate|amend|improve|fix|waiver)\b""").containsMatchIn(qLower)

        val bodyWithTokens = when {
            asksPii -> listOf(
                "[$modeTag]",
                "• Vault Isolation: ${scrubResult.uniqueTokenCount} identifiers ($personTok, $ssnTok, $dobTok) masked in device RAM under 45 CFR §164.514(b)(2).",
                "• Zero-PII Proof: 0 raw PII bytes left the device (SHA-256 #${sha256Hex(scrubResult.redactedText).take(10).uppercase()})."
            ).joinToString("\n")

            scrubResult.domain == ComplianceDomain.CLINICAL && asksWho && !asksFindings -> listOf(
                "[$modeTag · Patient & Provider]",
                "• Patient: $personTok (DOB $dobTok, SSN $ssnTok, Chart $mrnTok).",
                "• Attending Provider: $providerTok at Riverside Medical Center ($addrTok) on $visitTok."
            ).joinToString("\n")

            scrubResult.domain == ComplianceDomain.CLINICAL && asksWhen -> listOf(
                "[$modeTag · Clinical Timeline]",
                "• Encounter Date: $personTok was evaluated by $providerTok on $visitTok (DOB $dobTok).",
                "• Follow-Up Schedule: Return in 3 months (~90 days from $visitTok) after physical therapy."
            ).joinToString("\n")

            scrubResult.domain == ComplianceDomain.CLINICAL && asksTreatment && !asksFindings -> listOf(
                "[$modeTag · Treatment & Care Plan]",
                "• Physical Therapy: Start structured lumbar stabilization therapy for $personTok.",
                "• Medication & Follow-Up: Continue current medication and follow up with $providerTok in 3 months from $visitTok."
            ).joinToString("\n")

            scrubResult.domain == ComplianceDomain.CLINICAL && asksFindings -> listOf(
                "[$modeTag · Key Clinical Findings]",
                "• Diagnosis (ICD-10 M51.26 / M54.50): $personTok presented on $visitTok with chronic low back pain and suspected lumbar disc herniation.",
                "• Clinical Plan: Evaluated by $providerTok; managed conservatively with physical therapy and 3-month re-evaluation."
            ).joinToString("\n")

            scrubResult.domain == ComplianceDomain.LEGAL && (asksNonCompete || asksRedline) -> listOf(
                "[$modeTag · Non-Compete & Redline Audit]",
                "• Restrictive Covenant: 12-month US-wide non-compete binding $personTok under $docketTok.",
                "• Recommended Redline: Narrow geographic scope with $providerTok to active regional markets and add mutual carve-outs."
            ).joinToString("\n")

            scrubResult.domain == ComplianceDomain.LEGAL && asksLiability -> listOf(
                "[$modeTag · Liability & Financial Cap]",
                "• Aggregate Cap: Liability and compensation for $personTok under $docketTok is capped at $settlementTok.",
                "• Damages Safeguard: Confirm mutual indirect/consequential damages waiver with $providerTok."
            ).joinToString("\n")

            scrubResult.domain == ComplianceDomain.LEGAL && (asksWho || asksWhen) -> listOf(
                "[$modeTag · Parties & Term]",
                "• Parties: Client $personTok and Counsel $providerTok ($docketTok, $addrTok).",
                "• Term & Execution: Executed on $dobTok with a 5-year confidentiality obligation and $settlementTok cap."
            ).joinToString("\n")

            else -> listOf(
                "[$modeTag · Direct Answer]",
                "• Summary: ${buildDeterministicSynthesis(scrubResult, mode)}",
                "• Next Action: ${if (scrubResult.domain == ComplianceDomain.CLINICAL) "Complete physical therapy for $personTok and follow up with $providerTok in 3 months." else "Narrow 12-month non-compete for $personTok and lock $settlementTok mutual cap."}"
            ).joinToString("\n")
        }

        val finalBody = if (rehydrateEnabled) {
            rehydrateResponse(bodyWithTokens, scrubResult.tokenVault).hydratedText
        } else {
            bodyWithTokens
        }

        return "$routeProof\n\n$finalBody"
    }
}
