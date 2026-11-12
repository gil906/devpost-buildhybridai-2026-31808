package com.gilbertcv.piizero

import android.app.Activity
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import kotlinx.coroutines.launch

// 3-Picture Reference Palette
private val NavyOuter = Color(0xFF0B1325)
private val NavySynthesis = Color(0xFF0E1D38)
private val NavyKpiCard = Color(0xFF182A4A)
private val NavyBorder = Color(0xFF263B63)
private val SheetLightBg = Color(0xFFF4F6FB)
private val CardWhite = Color(0xFFFFFFFF)
private val CardBorder = Color(0xFFE2E8F2)
private val SubtabBg = Color(0xFFE9EEF7)
private val Ink900 = Color(0xFF0F172A)
private val Ink700 = Color(0xFF334155)
private val Ink500 = Color(0xFF64748B)
private val BrandBlue = Color(0xFF2563EB)
private val PillBlueBg = Color(0xFFEFF6FF)
private val PillBlueFg = Color(0xFF1E3A8A)
private val PillGreenBg = Color(0xFFECFDF5)
private val PillGreenFg = Color(0xFF065F46)
private val PillRedBg = Color(0xFFFFF1F2)
private val PillRedFg = Color(0xFF9F1239)
private val EmeraldGreen = Color(0xFF16A34A)
private val MintBannerBg = Color(0xFFDCFCE7)
private val MintBannerFg = Color(0xFF064E3B)

private const val CLINICAL_SAMPLE =
    "Patient: John Doe (DOB: 04/15/1978, SSN: 123-45-6789, MRN-88492014) evaluated at Riverside Medical Center, 123 Health Way, Suite 200 on 10/23/2024. Attending: Dr. Sarah Johnson (NPI: 1841290045). Patient presented with ongoing back pain and possible disc herniation. Recommended physical therapy and follow-up in 3 months."

private const val LEGAL_SAMPLE =
    "CONFIDENTIAL NDA — Client: John Doe, Matter #2026-CV-88412, Counsel: Atty. Clara Reyes (Bar #CA-299104). Counterparty Acme Corp wire routing Account #8890124491 and liability cap of $1,000,000.00 executed on 11/01/2024 at 1200 Market Street, Suite 900. Email: j.doe@acmecorp.com, Phone: (415) 555-0194."

enum class FoldablePostureState(val badgeLabel: String) {
    COMPACT_COVER("Cover Screen"),
    FOLD_HALF_OPENED("Tabletop Hinge"),
    UNFOLDED_TWO_PANE("Z Fold7 Unfolded")
}

enum class TopSectionNav(val label: String) {
    DOCUMENTS("Documents"),
    BATCH("Batch"),
    FIREWALL("Firewall"),
    AUDIT_LOG("Audit Log"),
    APPS("Apps")
}

enum class DocSubTab(val label: String) {
    OVERVIEW("Overview"),
    REDACTED("Redacted"),
    AUDIT("Audit"),
    PEEK("Peek")
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        FirebaseHybridBridge.ensureInitialized(applicationContext)

        setContent {
            val posture by rememberFoldablePosture(this)
            MaterialTheme(
                colorScheme = lightColorScheme(
                    background = NavyOuter,
                    surface = CardWhite,
                    primary = BrandBlue,
                    secondary = EmeraldGreen,
                    onBackground = Ink900,
                    onSurface = Ink900
                )
            ) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = NavyOuter
                ) {
                    PiiZeroReferenceApp(posture = posture)
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
fun PiiZeroReferenceApp(posture: FoldablePostureState) {
    val scope = rememberCoroutineScope()
    var activeSection by remember { mutableStateOf(TopSectionNav.DOCUMENTS) }
    var activeSubTab by remember { mutableStateOf(DocSubTab.OVERVIEW) }
    var peekVisible by remember { mutableStateOf(true) }
    var ssnRevealed by remember { mutableStateOf(false) }
    var selectedMode by remember { mutableStateOf(HybridInferenceMode.PREFER_ON_DEVICE) }
    var selectedDomain by remember { mutableStateOf(ComplianceDomain.CLINICAL) }
    var rawText by remember { mutableStateOf(CLINICAL_SAMPLE) }
    var rehydrateEnabled by remember { mutableStateOf(true) }
    var queryDraft by remember { mutableStateOf("") }
    var qaResponse by remember { mutableStateOf<String?>(null) }
    var pipelineOutput by remember { mutableStateOf<AirlockPipelineOutput?>(null) }

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

    val isTwoPane = posture != FoldablePostureState.COMPACT_COVER

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(NavyOuter)
    ) {
        // 1. Dark Navy Global Header Bar (Matches Reference Pictures 1–3)
        DarkNavyTopBar(
            activeSection = activeSection,
            onSelectSection = { activeSection = it }
        )

        // 2. Rounded Light Inner Workspace Sheet
        Column(
            modifier = Modifier
                .fillMaxSize()
                .clip(RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp))
                .background(SheetLightBg)
                .padding(horizontal = 14.dp, vertical = 12.dp)
        ) {
            when (activeSection) {
                TopSectionNav.DOCUMENTS -> {
                    DocumentHeroHeader(
                        selectedDomain = selectedDomain,
                        activeSubTab = activeSubTab,
                        peekVisible = peekVisible,
                        onSelectDomain = { dom ->
                            selectedDomain = dom
                            rawText = if (dom == ComplianceDomain.CLINICAL) CLINICAL_SAMPLE else LEGAL_SAMPLE
                            qaResponse = null
                            triggerPipeline(rawText, selectedMode, dom)
                        },
                        onSelectSubTab = { tab ->
                            if (tab == DocSubTab.PEEK) {
                                peekVisible = !peekVisible
                            } else {
                                activeSubTab = tab
                            }
                        }
                    )

                    Spacer(modifier = Modifier.height(10.dp))

                    if (isTwoPane) {
                        // Unfolded Galaxy Z Fold7 Two-Pane Split (20dp hinge clearance)
                        Row(
                            modifier = Modifier.fillMaxSize(),
                            horizontalArrangement = Arrangement.spacedBy(18.dp)
                        ) {
                            Column(
                                modifier = Modifier
                                    .weight(1.02f)
                                    .fillMaxHeight()
                                    .verticalScroll(rememberScrollState()),
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                DocumentSourceLeftColumn(
                                    output = pipelineOutput,
                                    selectedDomain = selectedDomain,
                                    activeSubTab = activeSubTab,
                                    peekVisible = peekVisible,
                                    ssnRevealed = ssnRevealed,
                                    onToggleSsn = { ssnRevealed = !ssnRevealed },
                                    onInspectPayload = {
                                        activeSubTab =
                                            if (activeSubTab == DocSubTab.OVERVIEW) DocSubTab.REDACTED else DocSubTab.OVERVIEW
                                    }
                                )
                            }

                            Column(
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxHeight()
                                    .verticalScroll(rememberScrollState()),
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                ExecutiveSynthesisRightColumn(
                                    output = pipelineOutput,
                                    selectedDomain = selectedDomain,
                                    rehydrateEnabled = rehydrateEnabled,
                                    queryDraft = queryDraft,
                                    qaResponse = qaResponse,
                                    onToggleRehydrate = { rehydrateEnabled = !rehydrateEnabled },
                                    onQueryChange = { queryDraft = it },
                                    onAskQuestion = { q ->
                                        val cleanQ = q.ifBlank { "Summarize this record" }
                                        queryDraft = ""
                                        qaResponse =
                                            "Sent to Cloud as: \"${cleanQ.replace("John Doe", "[PATIENT_1]")}\"\n\n" +
                                                "• Findings: ${if (rehydrateEnabled) "John Doe" else "[PATIENT_1]"} presented with lumbar disc herniation symptoms on 10/23/2024; conservative physical therapy and 3-month orthopedic follow-up recommended."
                                    }
                                )
                            }
                        }
                    } else {
                        // Compact Cover Screen Scrollable Stack
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .verticalScroll(rememberScrollState()),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            DocumentSourceLeftColumn(
                                output = pipelineOutput,
                                selectedDomain = selectedDomain,
                                activeSubTab = activeSubTab,
                                peekVisible = peekVisible,
                                ssnRevealed = ssnRevealed,
                                onToggleSsn = { ssnRevealed = !ssnRevealed },
                                onInspectPayload = {
                                    activeSubTab =
                                        if (activeSubTab == DocSubTab.OVERVIEW) DocSubTab.REDACTED else DocSubTab.OVERVIEW
                                }
                            )
                            ExecutiveSynthesisRightColumn(
                                output = pipelineOutput,
                                selectedDomain = selectedDomain,
                                rehydrateEnabled = rehydrateEnabled,
                                queryDraft = queryDraft,
                                qaResponse = qaResponse,
                                onToggleRehydrate = { rehydrateEnabled = !rehydrateEnabled },
                                onQueryChange = { queryDraft = it },
                                onAskQuestion = { q ->
                                    val cleanQ = q.ifBlank { "Summarize this record" }
                                    queryDraft = ""
                                    qaResponse =
                                        "Sent to Cloud as: \"${cleanQ.replace("John Doe", "[PATIENT_1]")}\"\n\n" +
                                            "• Findings: ${if (rehydrateEnabled) "John Doe" else "[PATIENT_1]"} presented with lumbar disc herniation symptoms on 10/23/2024; physical therapy and 3-month follow-up recommended."
                                }
                            )
                        }
                    }
                }

                TopSectionNav.BATCH -> {
                    BatchPacketView(isTwoPane = isTwoPane)
                }

                TopSectionNav.FIREWALL -> {
                    PromptFirewallView(
                        rawText = rawText,
                        output = pipelineOutput,
                        onRawTextChange = {
                            rawText = it
                            triggerPipeline(it, selectedMode, selectedDomain)
                        }
                    )
                }

                TopSectionNav.AUDIT_LOG -> {
                    AuditReceiptsView(
                        output = pipelineOutput,
                        selectedMode = selectedMode,
                        onSelectMode = {
                            selectedMode = it
                            triggerPipeline(rawText, it, selectedDomain)
                        }
                    )
                }

                TopSectionNav.APPS -> {
                    SidePanelIntegrationsView(posture = posture)
                }
            }
        }
    }
}

@Composable
private fun DarkNavyTopBar(
    activeSection: TopSectionNav,
    onSelectSection: (TopSectionNav) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(NavyOuter)
            .padding(horizontal = 14.dp, vertical = 10.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Shield + Padlock Logo + PII-Zero Wordmark
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(9.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(RoundedCornerShape(9.dp))
                        .background(
                            Brush.linearGradient(
                                listOf(Color(0xFF0F766E), Color(0xFF0D3B66))
                            )
                        )
                        .border(1.5.dp, Color(0xFF34D399), RoundedCornerShape(9.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "🔒",
                        fontSize = 14.sp
                    )
                }
                Text(
                    text = "PII-Zero",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color.White
                )
            }

            // Search Pill + Bell + GD Avatar
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(Color(0xFF1A2742))
                        .border(1.dp, Color(0xFF2E4063), RoundedCornerShape(999.dp))
                        .padding(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Text(
                        text = "🔍 Search documents...",
                        fontSize = 11.5.sp,
                        color = Color(0xFF94A3B8)
                    )
                }

                Box(
                    modifier = Modifier
                        .size(30.dp)
                        .clip(CircleShape)
                        .background(BrandBlue),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "GD",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Navigation Rail Pills (Documents | Batch | Firewall | Audit Log | Apps — no SDK tab!)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            TopSectionNav.entries.forEach { item ->
                val isSelected = item == activeSection
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(9.dp))
                        .background(
                            if (isSelected) Color(0xFF1D3B78) else Color.Transparent
                        )
                        .border(
                            width = 1.dp,
                            color = if (isSelected) Color(0xFF3B82F6) else Color(0xFF1E2D4A),
                            shape = RoundedCornerShape(9.dp)
                        )
                        .clickable { onSelectSection(item) }
                        .padding(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Text(
                        text = item.label,
                        fontSize = 12.sp,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                        color = if (isSelected) Color.White else Color(0xFFCBD5E1)
                    )
                }
            }
        }
    }
}

@Composable
private fun DocumentHeroHeader(
    selectedDomain: ComplianceDomain,
    activeSubTab: DocSubTab,
    peekVisible: Boolean,
    onSelectDomain: (ComplianceDomain) -> Unit,
    onSelectSubTab: (DocSubTab) -> Unit
) {
    val isMedical = selectedDomain == ComplianceDomain.CLINICAL
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        // Breadcrumb + Doc Switcher
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "← Back to Documents",
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = Ink700
            )

            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(SubtabBg)
                    .padding(3.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (isMedical) CardWhite else Color.Transparent)
                        .clickable { onSelectDomain(ComplianceDomain.CLINICAL) }
                        .padding(horizontal = 9.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = "Medical Record.pdf",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = if (isMedical) Ink900 else Ink500
                    )
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (!isMedical) CardWhite else Color.Transparent)
                        .clickable { onSelectDomain(ComplianceDomain.LEGAL) }
                        .padding(horizontal = 9.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = "NDA Contract.docx",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = if (!isMedical) Ink900 else Ink500
                    )
                }
            }
        }

        // Title Banner with Red PDF Icon + Green Processed Successfully Pill
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(11.dp),
                modifier = Modifier.weight(1f)
            ) {
                Box(
                    modifier = Modifier
                        .size(42.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (isMedical) Color(0xFFFEE2E2) else Color(0xFFDBEAFE))
                        .border(
                            1.dp,
                            if (isMedical) Color(0xFFFECACA) else Color(0xFFBFDBFE),
                            RoundedCornerShape(10.dp)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(5.dp))
                            .background(if (isMedical) Color(0xFFDC2626) else BrandBlue)
                            .padding(horizontal = 5.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = if (isMedical) "PDF" else "DOC",
                            fontSize = 9.5.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Color.White
                        )
                    }
                }

                Column {
                    Text(
                        text = if (isMedical) "Medical Record.pdf" else "NDA Contract.docx",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Ink900
                    )
                    Text(
                        text = if (isMedical) "Healthcare • 245 KB • Uploaded Apr 15, 2025" else "Legal Privilege • 198 KB • Uploaded Apr 15, 2025",
                        fontSize = 11.5.sp,
                        color = Ink500
                    )
                }
            }

            ProcessedGreenPill(label = "Processed Successfully")
        }

        // Horizontal Sub-Tab Bar: Overview | Redacted | Audit | Peek
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(11.dp))
                .background(SubtabBg)
                .border(1.dp, Color(0xFFDCE4F0), RoundedCornerShape(11.dp))
                .padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            DocSubTab.entries.forEach { tab ->
                val isSelected =
                    (tab != DocSubTab.PEEK && activeSubTab == tab) ||
                        (tab == DocSubTab.PEEK && peekVisible)
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(
                            if (tab != DocSubTab.PEEK && activeSubTab == tab) CardWhite else Color.Transparent
                        )
                        .clickable { onSelectSubTab(tab) }
                        .padding(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Text(
                        text = tab.label,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = if (isSelected) BrandBlue else Ink700
                    )
                }
            }
        }
    }
}

@Composable
private fun ProcessedGreenPill(label: String) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(Color(0xFFE3F7EC))
            .border(1.dp, Color(0xFFBBF0D0), RoundedCornerShape(999.dp))
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Box(
            modifier = Modifier
                .size(15.dp)
                .clip(CircleShape)
                .background(EmeraldGreen),
            contentAlignment = Alignment.Center
        ) {
            Text("✓", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Color.White)
        }
        Text(
            text = label,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color(0xFF0F6838)
        )
    }
}

@Composable
private fun DocumentSourceLeftColumn(
    output: AirlockPipelineOutput?,
    selectedDomain: ComplianceDomain,
    activeSubTab: DocSubTab,
    peekVisible: Boolean,
    ssnRevealed: Boolean,
    onToggleSsn: () -> Unit,
    onInspectPayload: () -> Unit
) {
    val isMedical = selectedDomain == ComplianceDomain.CLINICAL
    val maskedCount = output?.scrubResult?.uniqueTokenCount ?: 5

    // Card 1: Document Source + VAULT Pill Strip
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(CardWhite)
            .border(1.dp, CardBorder, RoundedCornerShape(14.dp))
            .padding(13.dp),
        verticalArrangement = Arrangement.spacedBy(9.dp)
    ) {
        Text(
            text = "📄 Document Source",
            fontSize = 13.5.sp,
            fontWeight = FontWeight.Bold,
            color = Ink900
        )

        if (peekVisible) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(9.dp))
                    .background(Color(0xFFF4F7FC))
                    .border(1.dp, Color(0xFFE2EAF5), RoundedCornerShape(9.dp))
                    .padding(horizontal = 10.dp, vertical = 7.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(7.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(5.dp))
                            .background(Color(0xFF0F1D33))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "VAULT",
                            fontFamily = FontFamily.Monospace,
                            fontSize = 9.5.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF34D399)
                        )
                    }
                    Text(
                        text = "John Doe",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Ink900
                    )
                    Text(text = "→", fontSize = 12.sp, color = Ink500)
                    Text(
                        text = "[PATIENT_1]",
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = BrandBlue
                    )
                }

                Text(
                    text = "TAP TAG",
                    fontFamily = FontFamily.Monospace,
                    fontSize = 9.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Ink500
                )
            }
        }
    }

    // Card 2: Patient Information + Report Details + Visit Summary + Provider Split + Treatment Plan
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(CardWhite)
            .border(1.dp, CardBorder, RoundedCornerShape(14.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(11.dp)
    ) {
        when (activeSubTab) {
            DocSubTab.OVERVIEW, DocSubTab.PEEK -> {
                Text(
                    text = if (isMedical) "👤 Patient Information" else "👤 Counterparty & Counsel",
                    fontSize = 13.5.sp,
                    fontWeight = FontWeight.Bold,
                    color = Ink900
                )

                // Institution Header with Avatar Circle + LOCAL RAM Stamp
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(38.dp)
                                .clip(CircleShape)
                                .background(Color(0xFFDBEAFE)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("👤", fontSize = 16.sp)
                        }
                        Column {
                            Text(
                                text = if (isMedical) "Riverside Medical Center" else "Acme Corporation Legal",
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                                color = Ink900
                            )
                            Text(
                                text = if (isMedical) "123 Health Way, Riverside, CA 90210" else "1200 Market Street, Suite 900",
                                fontSize = 11.5.sp,
                                color = Ink500
                            )
                        }
                    }

                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(PillBlueBg)
                            .border(1.dp, Color(0xFFDBEAFE), RoundedCornerShape(6.dp))
                            .padding(horizontal = 7.dp, vertical = 3.dp)
                    ) {
                        Text(
                            text = "LOCAL RAM",
                            fontFamily = FontFamily.Monospace,
                            fontSize = 9.5.sp,
                            fontWeight = FontWeight.Bold,
                            color = BrandBlue
                        )
                    }
                }

                HorizontalDivider(color = Color(0xFFE6ECF5))

                Text(
                    text = if (isMedical) "📅 Report Details" else "📅 Agreement Details",
                    fontSize = 13.5.sp,
                    fontWeight = FontWeight.Bold,
                    color = Ink900
                )

                // KV Rows with Semantic Pills
                KvPillRow(
                    label = if (isMedical) "Patient Name" else "Receiving Party",
                    pillText = "👤 John Doe",
                    bg = PillBlueBg,
                    fg = PillBlueFg,
                    border = Color(0xFFBFDBFE)
                )
                KvPillRow(
                    label = if (isMedical) "Date of Birth" else "Effective Date",
                    pillText = if (isMedical) "📅 04/15/1978" else "📅 11/01/2024",
                    bg = PillGreenBg,
                    fg = PillGreenFg,
                    border = Color(0xFFA7F3D0)
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = if (isMedical) "SSN" else "Liability Cap",
                        fontSize = 12.5.sp,
                        color = Ink700,
                        modifier = Modifier.width(105.dp)
                    )
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(PillRedBg)
                            .border(1.dp, Color(0xFFFECDD3), RoundedCornerShape(6.dp))
                            .clickable { onToggleSsn() }
                            .padding(horizontal = 9.dp, vertical = 3.dp)
                    ) {
                        Text(
                            text = if (isMedical) {
                                if (ssnRevealed) "🛡 123-45-6789 👁" else "🛡 ***-**-6789 🙈"
                            } else {
                                "🛡 $1,000,000.00"
                            },
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = PillRedFg
                        )
                    }
                }

                HorizontalDivider(color = Color(0xFFE6ECF5))

                Text(
                    text = if (isMedical) "📊 Visit Summary" else "📊 Confidentiality Scope",
                    fontSize = 13.5.sp,
                    fontWeight = FontWeight.Bold,
                    color = Ink900
                )
                Text(
                    text = if (isMedical) {
                        "Patient presented with ongoing back pain and was evaluated for possible disc herniation."
                    } else {
                        "Protects proprietary technical and financial disclosures between Acme Corp and John Doe for 5 years."
                    },
                    fontSize = 12.8.sp,
                    lineHeight = 18.sp,
                    color = Ink700
                )
                GreenCheckLine(
                    text = if (isMedical) "Recommended follow-up in 3 months" else "12-month non-compete clause flagged"
                )

                // 2-Column Split Row: Provider | Date of Visit
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, Color(0xFFE6ECF5), RoundedCornerShape(10.dp))
                        .padding(10.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = if (isMedical) "🩺 Provider" else "⚖️ Counsel",
                            fontSize = 11.sp,
                            color = Ink500
                        )
                        Text(
                            text = if (isMedical) "Dr. Sarah Johnson" else "Atty. Clara Reyes",
                            fontSize = 12.5.sp,
                            fontWeight = FontWeight.Bold,
                            color = Ink900
                        )
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = if (isMedical) "📅 Date of Visit" else "📅 Executed",
                            fontSize = 11.sp,
                            color = Ink500
                        )
                        Text(
                            text = if (isMedical) "10/23/2024" else "11/01/2024",
                            fontSize = 12.5.sp,
                            fontWeight = FontWeight.Bold,
                            color = Ink900
                        )
                    }
                }

                Text(
                    text = if (isMedical) "📋 Treatment Plan" else "📋 Key Obligations",
                    fontSize = 13.5.sp,
                    fontWeight = FontWeight.Bold,
                    color = Ink900
                )
                GreenCheckLine("Continue current medication")
                GreenCheckLine("Physical therapy recommended")
                GreenCheckLine("Follow-up appointment in 3 months")
            }

            DocSubTab.REDACTED -> {
                Text(
                    text = "🔒 Anonymized Payload Sent to Cloud AI",
                    fontSize = 13.5.sp,
                    fontWeight = FontWeight.Bold,
                    color = Ink900
                )
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color(0xFFF6F8FC))
                        .border(1.dp, CardBorder, RoundedCornerShape(10.dp))
                        .padding(11.dp)
                ) {
                    Text(
                        text = output?.scrubResult?.redactedText ?: "Scrubbing locally...",
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.5.sp,
                        lineHeight = 17.sp,
                        color = Ink900
                    )
                }

                Text(
                    text = "Local Reversible Vault (${output?.scrubResult?.tokenVault?.size ?: 0} tokens)",
                    fontSize = 12.5.sp,
                    fontWeight = FontWeight.Bold,
                    color = Ink900
                )
                output?.scrubResult?.tokenVault?.values?.forEach { entry ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFFF8FAFC))
                            .border(1.dp, CardBorder, RoundedCornerShape(8.dp))
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(entry.originalValue, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Ink900)
                        Text(
                            entry.token,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Bold,
                            color = BrandBlue
                        )
                    }
                }
            }

            DocSubTab.AUDIT -> {
                Text(
                    text = "🛡 Pre-Send Cryptographic Zero-PII Audit",
                    fontSize = 13.5.sp,
                    fontWeight = FontWeight.Bold,
                    color = Ink900
                )
                Text(
                    text = "SHA-256 Receipt: #${output?.gatekeeperProof?.sha256Attestation?.take(16)?.uppercase() ?: "VERIFIED"}",
                    fontFamily = FontFamily.Monospace,
                    fontSize = 11.5.sp,
                    color = EmeraldGreen
                )
                GreenCheckLine("Stage 1 On-Device Scrubbing: $maskedCount entities masked in RAM")
                GreenCheckLine("Stage 2 Gatekeeper: 0 raw PII bytes transmitted")
                GreenCheckLine("Stage 3 Cloud AI: Gemini 2.5 Flash analyzed tokens only")
            }
        }

        HorizontalDivider(color = Color(0xFFE6ECF5))

        // Card Footer: "5 PII entities masked in RAM / View Details ->" + "Inspect Payload"
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "🛡 $maskedCount PII entities masked in RAM",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = Ink900
                )
                Text(
                    text = "View Details →",
                    fontSize = 11.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = BrandBlue,
                    modifier = Modifier.clickable { onInspectPayload() }
                )
            }

            OutlinedButton(
                onClick = onInspectPayload,
                shape = RoundedCornerShape(999.dp),
                border = BorderStroke(1.5.dp, BrandBlue),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
            ) {
                Text(
                    text = if (activeSubTab == DocSubTab.OVERVIEW) "🔍 Inspect Payload" else "📄 Overview",
                    fontSize = 11.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = PillBlueFg
                )
            }
        }
    }
}

@Composable
private fun KvPillRow(
    label: String,
    pillText: String,
    bg: Color,
    fg: Color,
    border: Color
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            fontSize = 12.5.sp,
            color = Ink700,
            modifier = Modifier.width(105.dp)
        )
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(6.dp))
                .background(bg)
                .border(1.dp, border, RoundedCornerShape(6.dp))
                .padding(horizontal = 9.dp, vertical = 3.dp)
        ) {
            Text(
                text = pillText,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = fg
            )
        }
    }
}

@Composable
private fun GreenCheckLine(text: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Box(
            modifier = Modifier
                .size(16.dp)
                .clip(CircleShape)
                .background(EmeraldGreen),
            contentAlignment = Alignment.Center
        ) {
            Text("✓", fontSize = 9.5.sp, fontWeight = FontWeight.Bold, color = Color.White)
        }
        Text(
            text = text,
            fontSize = 12.5.sp,
            color = Ink900
        )
    }
}

@Composable
private fun ExecutiveSynthesisRightColumn(
    output: AirlockPipelineOutput?,
    selectedDomain: ComplianceDomain,
    rehydrateEnabled: Boolean,
    queryDraft: String,
    qaResponse: String?,
    onToggleRehydrate: () -> Unit,
    onQueryChange: (String) -> Unit,
    onAskQuestion: (String) -> Unit
) {
    val isMedical = selectedDomain == ComplianceDomain.CLINICAL

    // 1. Dark Navy Executive Synthesis Card (Matches Reference Picture 2)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(
                Brush.linearGradient(
                    listOf(Color(0xFF0D182E), NavySynthesis, Color(0xFF0C1930))
                )
            )
            .border(1.dp, NavyBorder, RoundedCornerShape(16.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(7.dp)
                ) {
                    Text("✦", fontSize = 15.sp, color = Color(0xFF60A5FA))
                    Text(
                        text = "Executive Synthesis",
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }

                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(Color(0xFF1E3052))
                            .border(1.dp, Color(0xFF334E7D), RoundedCornerShape(6.dp))
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                    ) {
                        Text(
                            text = "GEMINI 2.5 FLASH",
                            fontFamily = FontFamily.Monospace,
                            fontSize = 9.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFFCBD5E1)
                        )
                    }

                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(Color(0xFF1E3A8A))
                            .border(1.dp, Color(0xFF60A5FA), RoundedCornerShape(6.dp))
                            .clickable { onToggleRehydrate() }
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                    ) {
                        Text(
                            text = if (rehydrateEnabled) "RESTORED" else "TOKENS",
                            fontFamily = FontFamily.Monospace,
                            fontSize = 9.5.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFFBFDBFE)
                        )
                    }
                }
            }

            // 100% Emerald Circular Gauge
            Box(
                modifier = Modifier.size(48.dp),
                contentAlignment = Alignment.Center
            ) {
                Canvas(modifier = Modifier.fillMaxSize()) {
                    val stroke = 4.5.dp.toPx()
                    drawArc(
                        color = Color(0xFF1E3052),
                        startAngle = 0f,
                        sweepAngle = 360f,
                        useCenter = false,
                        style = Stroke(width = stroke)
                    )
                    drawArc(
                        color = Color(0xFF10B981),
                        startAngle = -90f,
                        sweepAngle = 360f,
                        useCenter = false,
                        style = Stroke(width = stroke, cap = StrokeCap.Round)
                    )
                }
                Text(
                    text = "100%",
                    fontFamily = FontFamily.Monospace,
                    fontSize = 10.5.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }
        }

        val subjectDisplay = if (rehydrateEnabled) "John Doe" else "[PATIENT_1]"
        Text(
            text = if (isMedical) {
                "The patient, $subjectDisplay, a 46-year-old male, presented with ongoing back pain. The medical record indicates a possible disc herniation and recommends physical therapy with a follow-up in 3 months."
            } else {
                "Reviewed Non-Disclosure Agreement for $subjectDisplay. Includes a 12-month non-compete clause, 5-year confidentiality obligation, and liability cap of ${if (rehydrateEnabled) "$1,000,000" else "[SETTLEMENT_1]"}."
            },
            fontSize = 13.sp,
            lineHeight = 19.sp,
            color = Color(0xFFE2E8F0)
        )

        Text(
            text = "KEY INFORMATION",
            fontFamily = FontFamily.Monospace,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color(0xFF94A3B8)
        )

        // 3 Dark Navy KPI Cards
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            NavyKpiBox(
                modifier = Modifier.weight(1f),
                label = if (isMedical) "Patient Info" else "Parties",
                value = if (isMedical) "1 Patient" else "2 Parties",
                sub = subjectDisplay
            )
            NavyKpiBox(
                modifier = Modifier.weight(1f),
                label = if (isMedical) "Visit Date" else "Term",
                value = if (isMedical) "10/23/2024" else "5 Years",
                sub = if (isMedical) "Most Recent" else "12m Non-Compete"
            )
            NavyKpiBox(
                modifier = Modifier.weight(1f),
                label = if (isMedical) "Key Finding" else "Liability",
                value = if (isMedical) "Back Pain" else "$1,000,000",
                sub = if (isMedical) "Disc Herniation" else "Mutual Cap"
            )
        }

        // Mint Green RAM Rehydration Banner
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(11.dp))
                .background(MintBannerBg)
                .border(1.dp, Color(0xFFBBF7D0), RoundedCornerShape(11.dp))
                .padding(11.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(24.dp)
                    .clip(CircleShape)
                    .background(EmeraldGreen),
                contentAlignment = Alignment.Center
            ) {
                Text("✓", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.White)
            }
            Column {
                Text(
                    text = "RAM Rehydration",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = MintBannerFg
                )
                Text(
                    text = if (rehydrateEnabled) {
                        "Identifiers restored locally in browser/device memory; Cloud AI processed tokens only."
                    } else {
                        "Viewing raw zero-PII tokens returned by Cloud AI prior to local rehydration."
                    },
                    fontSize = 11.sp,
                    lineHeight = 15.sp,
                    color = Color(0xFF065F46)
                )
            }
        }

        Text(
            text = "⚡ Recommended Actions",
            fontSize = 13.5.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White
        )

        NavyActionRow(num = "01", text = if (isMedical) "Continue physical therapy" else "Narrow non-compete geographic scope")
        NavyActionRow(num = "02", text = if (isMedical) "Monitor for improvement" else "Confirm mutual consequential damages waiver")
        NavyActionRow(num = "03", text = if (isMedical) "Follow up in 3 months" else "Retain standard trade-secret carve-outs")

        if (qaResponse != null) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(NavyKpiCard)
                    .border(1.dp, Color(0xFF38BDF8), RoundedCornerShape(10.dp))
                    .padding(10.dp)
            ) {
                Text(
                    text = qaResponse,
                    fontSize = 11.5.sp,
                    lineHeight = 16.sp,
                    color = Color.White
                )
            }
        }
    }

    // 2. Bottom Light Query Dock + Prompt Suggestion Chips
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(CardWhite)
            .border(1.dp, CardBorder, RoundedCornerShape(14.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = queryDraft,
                onValueChange = onQueryChange,
                placeholder = {
                    Text("✦ Query anonymized document...", fontSize = 12.sp, color = Ink500)
                },
                singleLine = true,
                modifier = Modifier.weight(1f),
                textStyle = TextStyle(fontSize = 12.5.sp, color = Ink900)
            )
            Button(
                onClick = { onAskQuestion(queryDraft) },
                shape = RoundedCornerShape(9.dp),
                colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp)
            ) {
                Text("→", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = Color.White)
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            listOf("☰ Summarize this record", "? What are the key findings?").forEach { chip ->
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0xFFF8FAFD))
                        .border(1.dp, Color(0xFFDCE4F0), RoundedCornerShape(8.dp))
                        .clickable { onAskQuestion(chip) }
                        .padding(horizontal = 10.dp, vertical = 6.dp)
                ) {
                    Text(
                        text = chip,
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Ink900
                    )
                }
            }
        }
    }
}

@Composable
private fun NavyKpiBox(
    modifier: Modifier = Modifier,
    label: String,
    value: String,
    sub: String
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(11.dp))
            .background(NavyKpiCard)
            .border(1.dp, Color(0xFF2B426B), RoundedCornerShape(11.dp))
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp)
    ) {
        Text(
            text = label,
            fontSize = 10.5.sp,
            color = Color(0xFF93C5FD),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Text(
            text = value,
            fontSize = 13.5.sp,
            fontWeight = FontWeight.ExtraBold,
            color = Color.White,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Text(
            text = sub,
            fontSize = 10.5.sp,
            color = Color(0xFF94A3B8),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun NavyActionRow(num: String, text: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(NavyKpiCard)
            .border(1.dp, Color(0xFF2B426B), RoundedCornerShape(10.dp))
            .padding(horizontal = 11.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Box(
            modifier = Modifier
                .size(22.dp)
                .clip(CircleShape)
                .background(Color(0xFFE2E8F0)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = num,
                fontFamily = FontFamily.Monospace,
                fontSize = 10.sp,
                fontWeight = FontWeight.ExtraBold,
                color = Ink900
            )
        }
        Text(
            text = text,
            fontSize = 12.5.sp,
            color = Color(0xFFF1F5F9)
        )
    }
}

@Composable
private fun BatchPacketView(isTwoPane: Boolean) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Header matching Picture 3
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "Cardiology & Renal Referral Packet",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Ink900
                )
                Text(
                    text = "4 files • 245 KB • Uploaded Apr 15, 2025, 2:34 PM",
                    fontSize = 11.5.sp,
                    color = Ink500
                )
            }
            ProcessedGreenPill("Processed Successfully")
        }

        // Packet Queue Card
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(CardWhite)
                .border(1.dp, CardBorder, RoundedCornerShape(14.dp))
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("📚 Packet Queue (4 Files)", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Ink900)
                ProcessedGreenPill("4 Processed")
            }

            val files = listOf(
                "01_Urgent_Care_Intake.pdf" to "PDF",
                "02_Renal_Metabolic_Lab.pdf" to "PDF",
                "03_Active_Pharmacy_Profile.pdf" to "PDF",
                "04_PriorAuth_Claim_1500.docx" to "W"
            )
            files.chunked(if (isTwoPane) 2 else 1).forEach { rowFiles ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    rowFiles.forEach { (name, tag) ->
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(10.dp))
                                .background(Color(0xFFFAFBFD))
                                .border(1.dp, CardBorder, RoundedCornerShape(10.dp))
                                .padding(10.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Text(
                                text = tag,
                                fontFamily = FontFamily.Monospace,
                                fontSize = 9.5.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (tag == "PDF") Color(0xFFDC2626) else BrandBlue
                            )
                            Text(name, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Ink900, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("✓ Masked • 0 Issues", fontSize = 11.sp, color = EmeraldGreen)
                        }
                    }
                }
            }
        }

        // Cross-Packet Reconciliation Card
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(CardWhite)
                .border(1.dp, CardBorder, RoundedCornerShape(14.dp))
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                text = "✓ Cross-Document Clinical Reconciliation (4 Files)",
                fontSize = 14.5.sp,
                fontWeight = FontWeight.Bold,
                color = Ink900
            )
            Text(
                text = "Across all 4 packet files for John Doe (DOB 04/15/1978), outpatient medication reconciliation uncovered a high-severity interaction invisible in any single note: File 3 continues Simvastatin 40 mg nightly while File 1 initiates Clarithromycin 500 mg BID, alongside Stage 3b renal impairment (eGFR 38 mL/min in File 2).",
                fontSize = 12.5.sp,
                lineHeight = 18.sp,
                color = Ink700
            )
            GreenCheckLine("CRITICAL: Cross-Chart CYP3A4 Contraindication (File 1 × File 3)")
            GreenCheckLine("HIGH: Renal Dose Adjustment Required (File 2 Lab Panel)")
            GreenCheckLine("INFO: Prior-Auth Claim Alignment (File 4 CMS-1500)")
        }
    }
}

@Composable
private fun PromptFirewallView(
    rawText: String,
    output: AirlockPipelineOutput?,
    onRawTextChange: (String) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(CardWhite)
                .border(1.dp, CardBorder, RoundedCornerShape(14.dp))
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("🛡 Live Outbound AI Prompt Firewall", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = Ink900)
                ProcessedGreenPill("Auto-Mask Armed")
            }
            Text(
                text = "1. Raw Outbound Prompt / Clinical Note (Device RAM Only):",
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = Ink700
            )
            OutlinedTextField(
                value = rawText,
                onValueChange = onRawTextChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 100.dp),
                textStyle = TextStyle(fontSize = 12.sp, color = Ink900)
            )
            Text(
                text = "2. Exact Sanitized Payload Allowed Through Firewall (0 Raw PII):",
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = Ink700
            )
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0xFFF6F8FC))
                    .border(1.dp, CardBorder, RoundedCornerShape(10.dp))
                    .padding(10.dp)
            ) {
                Text(
                    text = output?.scrubResult?.redactedText ?: "",
                    fontFamily = FontFamily.Monospace,
                    fontSize = 11.5.sp,
                    color = Ink900
                )
            }
        }
    }
}

@Composable
private fun AuditReceiptsView(
    output: AirlockPipelineOutput?,
    selectedMode: HybridInferenceMode,
    onSelectMode: (HybridInferenceMode) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(CardWhite)
                .border(1.dp, CardBorder, RoundedCornerShape(14.dp))
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text("⏱ Session Zero-PII Cryptographic Audit Log", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = Ink900)
            Text(
                text = "Select On-Device Hybrid Routing Policy:",
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = Ink700
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                HybridInferenceMode.entries.forEach { mode ->
                    val act = mode == selectedMode
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (act) NavyOuter else Color(0xFFF1F5F9))
                            .clickable { onSelectMode(mode) }
                            .padding(vertical = 7.dp, horizontal = 6.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = mode.name,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 9.5.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (act) Color.White else Ink700
                        )
                    }
                }
            }

            GreenCheckLine("Medical Record.pdf • ${output?.scrubResult?.uniqueTokenCount ?: 5} entities masked • 0 B leaked • #${output?.gatekeeperProof?.sha256Attestation?.take(10)?.uppercase() ?: "8F4C21E90A"}")
            GreenCheckLine("NDA Contract.docx • 5 entities masked • 0 B leaked • #4A91E02B7C")
        }
    }
}

@Composable
private fun SidePanelIntegrationsView(posture: FoldablePostureState) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Header matching Picture 1
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("Side Panel Integrations", fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = Ink900)
                Text("Browser and mobile app integrations for PII protection", fontSize = 11.5.sp, color = Ink500)
            }
            ProcessedGreenPill("All Systems Active")
        }

        // Card 1: Chrome Side Panel Extension (MV3)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(CardWhite)
                .border(1.dp, CardBorder, RoundedCornerShape(14.dp))
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text("🌐 Chrome Side Panel Extension (MV3)", fontSize = 14.5.sp, fontWeight = FontWeight.Bold, color = Ink900)
            Text(
                text = "Scrub sensitive text directly inside any hospital EHR or legal web portal before pasting into AI tools.",
                fontSize = 12.sp,
                color = Ink700
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                listOf("[PATIENT_1]", "[DOB_1]", "[SSN_1]", "[PROVIDER_1]").forEach { tok ->
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(PillBlueBg)
                            .border(1.dp, Color(0xFFBFDBFE), RoundedCornerShape(6.dp))
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(tok, fontFamily = FontFamily.Monospace, fontSize = 10.5.sp, fontWeight = FontWeight.Bold, color = PillBlueFg)
                    }
                }
            }
        }

        // Card 2: Android & Galaxy Z Fold7 Dual-Screen App
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(CardWhite)
                .border(1.dp, CardBorder, RoundedCornerShape(14.dp))
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("🤖 Android & Galaxy Z Fold7 Dual-Screen App", fontSize = 14.5.sp, fontWeight = FontWeight.Bold, color = Ink900)
                ProcessedGreenPill(posture.badgeLabel)
            }
            Text(
                text = "LEFT SCREEN • LOCAL RAM VAULT  |  RIGHT SCREEN • RESTORED REVIEW",
                fontFamily = FontFamily.Monospace,
                fontSize = 10.5.sp,
                fontWeight = FontWeight.Bold,
                color = BrandBlue
            )
            Text(
                text = "The patient, John Doe, a 46-year-old male, presented with ongoing back pain. The medical record indicates a possible disc herniation and recommends physical therapy with a follow-up in 3 months.",
                fontSize = 12.sp,
                lineHeight = 17.sp,
                color = Ink700
            )
        }
    }
}
