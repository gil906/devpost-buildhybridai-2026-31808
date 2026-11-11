package com.gilbertcv.piizero

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PiiAirlockEngineTest {

    @Test
    fun scrubText_redactsHipaaIdentifiersAndPopulatesReversibleVault() {
        val raw =
            "Patient: Elena Rostova (DOB: 1981-04-19, SSN: 412-88-9041, MRN-994821A) contacted via (415) 890-3312 and elena.rostova@bayhealth.org at 742 Evergreen Avenue, Suite 4B."
        val res = PiiAirlockEngine.scrubText(raw, ComplianceDomain.CLINICAL)

        assertFalse(res.redactedText.contains("412-88-9041"))
        assertFalse(res.redactedText.contains("MRN-994821A"))
        assertFalse(res.redactedText.contains("elena.rostova@bayhealth.org"))
        assertFalse(res.redactedText.contains("Elena Rostova"))
        assertTrue(res.redactedText.contains("[PII_SSN_1]"))
        assertTrue(res.redactedText.contains("[PII_MRN_1]"))
        assertTrue(res.redactedText.contains("[PII_EMAIL_1]"))
        assertTrue(res.redactedText.contains("[PII_PERSON_1]"))
        assertTrue(res.uniqueTokenCount >= 6)
    }

    @Test
    fun verifyZeroPiiGatekeeper_passesSanitizedPayloadAndRejectsLeakedPii() {
        val raw = "Client: Viktor Kovalenko, Matter #2026-CV-88412, SSN 551-22-9104, Settlement $2,450,000.00"
        val scrubbed = PiiAirlockEngine.scrubText(raw, ComplianceDomain.LEGAL)

        val cleanProof = PiiAirlockEngine.verifyZeroPiiGatekeeper(scrubbed.redactedText)
        assertTrue(cleanProof.passed)
        assertEquals(0, cleanProof.residualCount)
        assertEquals(64, cleanProof.sha256Attestation.length)

        val leakedProof = PiiAirlockEngine.verifyZeroPiiGatekeeper(
            scrubbed.redactedText + " leaked raw SSN 551-22-9104"
        )
        assertFalse(leakedProof.passed)
        assertTrue(leakedProof.residualCount >= 1)
    }

    @Test
    fun rehydrateResponse_restoresLocalVaultTokensInCloudSummary() {
        val raw = "Patient: Elena Rostova (MRN-994821A) scheduled on 2026-11-15."
        val scrubbed = PiiAirlockEngine.scrubText(raw, ComplianceDomain.CLINICAL)
        val cloudText = "Discharge summary ready for [PII_PERSON_1] (Record [PII_MRN_1]) on [PII_DATE_1]."
        val hydrated = PiiAirlockEngine.rehydrateResponse(cloudText, scrubbed.tokenVault)

        assertTrue(hydrated.hydratedText.contains("Elena Rostova"))
        assertTrue(hydrated.hydratedText.contains("MRN-994821A"))
        assertTrue(hydrated.hydratedText.contains("2026-11-15"))
        assertEquals(3, hydrated.restoredTokenCount)
    }
}
