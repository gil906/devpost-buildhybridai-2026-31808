package com.gilbertcv.piizero

import android.app.Activity
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import kotlinx.coroutines.launch

private val LedgerCanvas = Color(0xFF111C26)
private val LedgerPanel = Color(0xFF182734)
private val LedgerElevated = Color(0xFF1D2F3F)
private val LedgerBorder = Color(0xFF263849)
private val LedgerTextPrimary = Color(0xFFE6EEF5)
private val LedgerTextMuted = Color(0xFF93A8BC)
private val LedgerSafeTeal = Color(0xFF8DD6C7)
private val LedgerAmber = Color(0xFFF2CB85)
private val LedgerDanger = Color(0xFFF07167)

private const val CLINICAL_SAMPLE =
    "Patient: Elena Rostova (DOB: 1981-04-19, SSN: 412-88-9041, MRN-994821A) admitted to St. Jude Telemetry Unit on 2026-11-10. Contact: (415) 890-3312, elena.rostova@bayhealth.org, 742 Evergreen Avenue, Suite 4B. Attending Dr. Marcus Vance (NPI: 1841290045) noted atrial fibrillation on Pacemaker SN: UDI-884920-Z under Policy #HPB-7731902."

private const val LEGAL_SAMPLE =
    "CONFIDENTIAL WORK PRODUCT — Client: Viktor Kovalenko, Matter #2026-CV-88412, Counsel: Atty. Clara Reyes (Bar #CA-299104). Wire routing references Account #8890124491 and settlement reserve of $2,450,000.00 executed on 2026-10-28 at 1200 Market Street, Suite 900. Email: v.kovalenko@kovalenko-holdings.com, Phone: (212) 555-0194."

enum class FoldablePostureState(val badgeLabel: String) {
    COMPACT_COVER("COVER SCREEN // SINGLE-PANE"),
    FOLD_HALF_OPENED("TABLETOP / BOOK // HINGE-SPLIT"),
    UNFOLDED_TWO_PANE("GALAXY Z FOLD7 UNFOLDED // 2-PANE")
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        FirebaseHybridBridge.ensureInitialized(applicationContext)

        setContent {
            val posture by rememberFoldablePosture(this)
            MaterialTheme(
                colorScheme = darkColorScheme(
                    background = LedgerCanvas,
                    surface = LedgerPanel,
                    primary = LedgerSafeTeal,
                    secondary = LedgerAmber,
                    onBackground = LedgerTextPrimary,
                    onSurface = LedgerTextPrimary
                )
            ) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = LedgerCanvas
                ) {
                    PiiZeroAdaptiveApp(posture = posture)
                }
            }
        }
    }
}

@Composable
fun rememberFoldablePosture(activity: Activity): State<FoldablePostureState> {
    val configuration = LocalConfiguration.current
    val screenWidthDp = configuration.screenWidthDp
    val postureState = remember(screenWidthDp) {
        mutableStateOf(
            if (screenWidthDp >= 600) {
                FoldablePostureState.UNFOLDED_TWO_PANE
            } else {
                FoldablePostureState.COMPACT_COVER
            }
        )
    }

    LaunchedEffect(activity, screenWidthDp) {
        WindowInfoTracker.getOrCreate(activity)
            .windowLayoutInfo(activity)
            .collect { layoutInfo ->
                val foldingFeature = layoutInfo.displayFeatures
                    .filterIsInstance<FoldingFeature>()
                    .firstOrNull()

                postureState.value = when {
                    foldingFeature != null && foldingFeature.state == FoldingFeature.State.HALF_OPENED ->
                        FoldablePostureState.FOLD_HALF_OPENED
                    foldingFeature != null && foldingFeature.isSeparating ->
                        FoldablePostureState.UNFOLDED_TWO_PANE
                    screenWidthDp >= 600 ->
                        FoldablePostureState.UNFOLDED_TWO_PANE
                    else ->
                        FoldablePostureState.COMPACT_COVER
                }
            }
    }
    return postureState
}

@Composable
fun PiiZeroAdaptiveApp(posture: FoldablePostureState) {
    val scope = rememberCoroutineScope()
    var rawText by remember { mutableStateOf(CLINICAL_SAMPLE) }
    var selectedMode by remember { mutableStateOf(HybridInferenceMode.PREFER_ON_DEVICE) }
    var selectedDomain by remember { mutableStateOf(ComplianceDomain.CLINICAL) }
    var rehydrateEnabled by remember { mutableStateOf(true) }
    var activeCompactTab by remember { mutableIntStateOf(0) }
    var pipelineOutput by remember {
        mutableStateOf<AirlockPipelineOutput?>(null)
    }

    fun triggerPipeline(text: String, mode: HybridInferenceMode, domain: ComplianceDomain) {
        scope.launch {
            pipelineOutput = FirebaseHybridBridge.executeHybridPipeline(
                rawText = text,
                mode = mode,
                domain = domain
            )
        }
    }

    LaunchedEffect(Unit) {
        triggerPipeline(rawText, selectedMode, selectedDomain)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(LedgerCanvas)
            .padding(12.dp)
    ) {
        LedgerTopHeader(
            posture = posture,
            selectedMode = selectedMode,
            selectedDomain = selectedDomain,
            onModeSelected = {
                selectedMode = it
                triggerPipeline(rawText, it, selectedDomain)
            },
            onDomainSelected = {
                selectedDomain = it
                rawText = if (it == ComplianceDomain.CLINICAL) CLINICAL_SAMPLE else LEGAL_SAMPLE
                triggerPipeline(rawText, selectedMode, it)
            }
        )

        Spacer(modifier = Modifier.height(10.dp))

        KpiTelemetryStrip(output = pipelineOutput)

        Spacer(modifier = Modifier.height(10.dp))

        val isTwoPane = posture != FoldablePostureState.COMPACT_COVER
        if (isTwoPane) {
            // Hinge-aware two-pane split for Galaxy Z Fold7 / tablets (24dp hinge clearance)
            Row(
                modifier = Modifier.fillMaxSize(),
                horizontalArrangement = Arrangement.spacedBy(24.dp)
            ) {
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    SourceCapturePane(
                        rawText = rawText,
                        onRawTextChange = { rawText = it },
                        onLoadClinical = {
                            selectedDomain = ComplianceDomain.CLINICAL
                            rawText = CLINICAL_SAMPLE
                            triggerPipeline(CLINICAL_SAMPLE, selectedMode, ComplianceDomain.CLINICAL)
                        },
                        onLoadLegal = {
                            selectedDomain = ComplianceDomain.LEGAL
                            rawText = LEGAL_SAMPLE
                            triggerPipeline(LEGAL_SAMPLE, selectedMode, ComplianceDomain.LEGAL)
                        },
                        onExecute = {
                            triggerPipeline(rawText, selectedMode, selectedDomain)
                        }
                    )
                    SanitizedGatekeeperPane(output = pipelineOutput)
                }

                Column(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    TokenVaultPane(output = pipelineOutput)
                    HybridSynthesisPane(
                        output = pipelineOutput,
                        rehydrateEnabled = rehydrateEnabled,
                        onToggleRehydrate = { rehydrateEnabled = it }
                    )
                }
            }
        } else {
            // Single-pane tabbed layout for compact cover screens
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, LedgerBorder)
                    .background(LedgerPanel)
            ) {
                listOf("01 AIRLOCK INPUT", "02 TOKEN VAULT", "03 HYBRID BRIEF").forEachIndexed { idx, title ->
                    val active = activeCompactTab == idx
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .background(if (active) LedgerElevated else LedgerPanel)
                            .clickable { activeCompactTab = idx }
                            .padding(vertical = 8.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = title,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.sp,
                            fontWeight = if (active) FontWeight.Bold else FontWeight.Normal,
                            color = if (active) LedgerSafeTeal else LedgerTextMuted
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                when (activeCompactTab) {
                    0 -> {
                        SourceCapturePane(
                            rawText = rawText,
                            onRawTextChange = { rawText = it },
                            onLoadClinical = {
                                selectedDomain = ComplianceDomain.CLINICAL
                                rawText = CLINICAL_SAMPLE
                                triggerPipeline(CLINICAL_SAMPLE, selectedMode, ComplianceDomain.CLINICAL)
                            },
                            onLoadLegal = {
                                selectedDomain = ComplianceDomain.LEGAL
                                rawText = LEGAL_SAMPLE
                                triggerPipeline(LEGAL_SAMPLE, selectedMode, ComplianceDomain.LEGAL)
                            },
                            onExecute = {
                                triggerPipeline(rawText, selectedMode, selectedDomain)
                            }
                        )
                        SanitizedGatekeeperPane(output = pipelineOutput)
                    }
                    1 -> TokenVaultPane(output = pipelineOutput)
                    else -> HybridSynthesisPane(
                        output = pipelineOutput,
                        rehydrateEnabled = rehydrateEnabled,
                        onToggleRehydrate = { rehydrateEnabled = it }
                    )
                }
            }
        }
    }
}

@Composable
private fun LedgerTopHeader(
    posture: FoldablePostureState,
    selectedMode: HybridInferenceMode,
    selectedDomain: ComplianceDomain,
    onModeSelected: (HybridInferenceMode) -> Unit,
    onDomainSelected: (ComplianceDomain) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(LedgerPanel)
            .border(1.dp, LedgerBorder)
            .padding(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "PII-ZERO // HYBRID AI AIRLOCK",
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
                color = LedgerTextPrimary
            )
            Text(
                text = posture.badgeLabel,
                fontFamily = FontFamily.Monospace,
                fontSize = 10.sp,
                color = LedgerSafeTeal,
                modifier = Modifier
                    .border(1.dp, LedgerSafeTeal)
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            HybridInferenceMode.entries.forEach { mode ->
                val isSelected = mode == selectedMode
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .border(1.dp, if (isSelected) LedgerSafeTeal else LedgerBorder)
                        .background(if (isSelected) LedgerElevated else LedgerCanvas)
                        .clickable { onModeSelected(mode) }
                        .padding(vertical = 6.dp, horizontal = 4.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = mode.name,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 9.5.sp,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                        color = if (isSelected) LedgerSafeTeal else LedgerTextMuted
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(6.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            ComplianceDomain.entries.forEach { domain ->
                val isSelected = domain == selectedDomain
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .border(1.dp, if (isSelected) LedgerAmber else LedgerBorder)
                        .background(if (isSelected) LedgerElevated else LedgerCanvas)
                        .clickable { onDomainSelected(domain) }
                        .padding(vertical = 5.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = domain.displayLabel,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 10.sp,
                        color = if (isSelected) LedgerAmber else LedgerTextMuted
                    )
                }
            }
        }
    }
}

@Composable
private fun KpiTelemetryStrip(output: AirlockPipelineOutput?) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(LedgerPanel)
            .border(1.dp, LedgerBorder)
            .padding(vertical = 8.dp, horizontal = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        KpiMetricCell(
            label = "SCRUBBED SPANS",
            value = (output?.scrubResult?.totalSpansScrubbed ?: 0).toString(),
            valueColor = LedgerAmber
        )
        KpiMetricCell(
            label = "VAULT TOKENS",
            value = (output?.scrubResult?.uniqueTokenCount ?: 0).toString(),
            valueColor = LedgerSafeTeal
        )
        KpiMetricCell(
            label = "RESIDUAL PII",
            value = (output?.gatekeeperProof?.residualCount ?: 0).toString(),
            valueColor = if ((output?.gatekeeperProof?.residualCount ?: 0) == 0) LedgerSafeTeal else LedgerDanger
        )
        KpiMetricCell(
            label = "LATENCY",
            value = output?.let { "${it.latencyMs}ms" } ?: "—",
            valueColor = LedgerTextPrimary
        )
    }
}

@Composable
private fun KpiMetricCell(label: String, value: String, valueColor: Color) {
    Column {
        Text(
            text = label,
            fontFamily = FontFamily.Monospace,
            fontSize = 9.sp,
            color = LedgerTextMuted
        )
        Text(
            text = value,
            fontFamily = FontFamily.Monospace,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            color = valueColor
        )
    }
}

@Composable
private fun SourceCapturePane(
    rawText: String,
    onRawTextChange: (String) -> Unit,
    onLoadClinical: () -> Unit,
    onLoadLegal: () -> Unit,
    onExecute: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(LedgerPanel)
            .border(1.dp, LedgerBorder)
            .padding(10.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "01 // RAW CLINICAL / LEGAL INPUT",
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                color = LedgerTextMuted
            )
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(
                    onClick = onLoadClinical,
                    shape = RoundedCornerShape(0.dp),
                    border = BorderStroke(1.dp, LedgerBorder),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                ) {
                    Text("Clinical", fontFamily = FontFamily.Monospace, fontSize = 10.sp, color = LedgerTextPrimary)
                }
                OutlinedButton(
                    onClick = onLoadLegal,
                    shape = RoundedCornerShape(0.dp),
                    border = BorderStroke(1.dp, LedgerBorder),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                ) {
                    Text("Legal", fontFamily = FontFamily.Monospace, fontSize = 10.sp, color = LedgerTextPrimary)
                }
            }
        }

        Spacer(modifier = Modifier.height(6.dp))

        OutlinedTextField(
            value = rawText,
            onValueChange = onRawTextChange,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 100.dp),
            textStyle = TextStyle(
                fontFamily = FontFamily.Monospace,
                fontSize = 11.5.sp,
                color = LedgerTextPrimary
            )
        )

        Spacer(modifier = Modifier.height(8.dp))

        Button(
            onClick = onExecute,
            shape = RoundedCornerShape(0.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = LedgerSafeTeal,
                contentColor = LedgerCanvas
            ),
            modifier = Modifier.align(Alignment.End)
        ) {
            Text(
                text = "SCRUB ON-DEVICE & ANALYZE",
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Composable
private fun SanitizedGatekeeperPane(output: AirlockPipelineOutput?) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(LedgerPanel)
            .border(1.dp, LedgerBorder)
            .padding(10.dp)
    ) {
        Text(
            text = "02 // ON-DEVICE SANITIZED PAYLOAD & SHA-256 PROOF",
            fontFamily = FontFamily.Monospace,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            color = LedgerTextMuted
        )

        Spacer(modifier = Modifier.height(6.dp))

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(LedgerCanvas)
                .border(1.dp, LedgerBorder)
                .padding(8.dp)
        ) {
            Text(
                text = output?.scrubResult?.redactedText ?: "Awaiting input...",
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
                color = LedgerTextPrimary
            )
        }

        Spacer(modifier = Modifier.height(6.dp))

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(LedgerCanvas)
                .border(1.dp, LedgerSafeTeal)
                .padding(8.dp)
        ) {
            Text(
                text = if (output?.gatekeeperProof?.passed == true)
                    "GATEKEEPER ATTESTATION: ZERO RESIDUAL PII VERIFIED"
                else
                    "GATEKEEPER STANDBY",
                fontFamily = FontFamily.Monospace,
                fontSize = 10.5.sp,
                fontWeight = FontWeight.Bold,
                color = LedgerSafeTeal
            )
            Text(
                text = "SHA-256: ${output?.gatekeeperProof?.sha256Attestation ?: "—"}",
                fontFamily = FontFamily.Monospace,
                fontSize = 9.5.sp,
                color = LedgerTextMuted
            )
        }
    }
}

@Composable
private fun TokenVaultPane(output: AirlockPipelineOutput?) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(LedgerPanel)
            .border(1.dp, LedgerBorder)
            .padding(10.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = "03 // LOCAL REVERSIBLE TOKEN VAULT",
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                color = LedgerTextMuted
            )
            Text(
                text = "HARDWARE-LOCAL ONLY",
                fontFamily = FontFamily.Monospace,
                fontSize = 9.5.sp,
                color = LedgerAmber
            )
        }

        Spacer(modifier = Modifier.height(6.dp))

        val entries = output?.scrubResult?.tokenVault?.values?.toList().orEmpty()
        if (entries.isEmpty()) {
            Text(
                text = "No PII tokens vaulted.",
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
                color = LedgerTextMuted
            )
        } else {
            entries.forEach { item ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(0.5.dp, LedgerBorder)
                        .background(LedgerCanvas)
                        .padding(horizontal = 8.dp, vertical = 5.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = item.token,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 10.5.sp,
                        fontWeight = FontWeight.Bold,
                        color = LedgerAmber
                    )
                    Text(
                        text = item.category,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 10.sp,
                        color = LedgerSafeTeal
                    )
                    Text(
                        text = item.maskedPreview,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 10.sp,
                        color = LedgerTextPrimary
                    )
                }
            }
        }
    }
}

@Composable
private fun HybridSynthesisPane(
    output: AirlockPipelineOutput?,
    rehydrateEnabled: Boolean,
    onToggleRehydrate: (Boolean) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(LedgerPanel)
            .border(1.dp, LedgerBorder)
            .padding(10.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "04 // HYBRID SYNTHESIS & RE-HYDRATION",
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                color = LedgerTextMuted
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = if (rehydrateEnabled) "LOCAL RE-HYDRATED" else "CLOUD SANITIZED",
                    fontFamily = FontFamily.Monospace,
                    fontSize = 10.sp,
                    color = LedgerSafeTeal
                )
                Spacer(modifier = Modifier.width(6.dp))
                Switch(
                    checked = rehydrateEnabled,
                    onCheckedChange = onToggleRehydrate
                )
            }
        }

        Spacer(modifier = Modifier.height(6.dp))

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(LedgerCanvas)
                .border(1.dp, LedgerSafeTeal)
                .padding(10.dp)
        ) {
            val displayed = if (output == null) {
                "Executing PII-Zero Hybrid Airlock..."
            } else if (rehydrateEnabled) {
                output.localRehydratedSummary
            } else {
                output.cloudRedactedSummary
            }
            Text(
                text = displayed,
                fontFamily = FontFamily.Monospace,
                fontSize = 11.5.sp,
                color = LedgerTextPrimary
            )
        }
    }
}
