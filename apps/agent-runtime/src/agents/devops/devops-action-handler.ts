// ============================================================================
// DEVOPS ACTION HANDLER
// Handles all workspace_devops_* action types.
// ============================================================================

import {
    parseTerraformPlan,
    buildTfGeneratePrompt,
    parseTfGenerateOutput,
    buildIacSecurityPrompt,
    parseIacSecurityFindings,
    summariseTfPlan,
} from './devops-tf-builder.js';

import {
    buildK8sGeneratePrompt,
    parseK8sManifests,
    parseK8sRolloutStatus,
    buildK8sLogAnalysisPrompt,
    parseLogAnalysis,
    buildDockerCommands,
    buildDockerfilePrompt,
} from './devops-k8s-builder.js';

import {
    buildHelmInstallArgs,
    buildHelmRollbackArgs,
    buildHelmDiffArgs,
    buildHelmChartPrompt,
    parseHelmChartOutput,
    parseHelmDiff,
    buildEnvValuesContent,
} from './devops-helm-builder.js';

import {
    computeDoraMetrics,
} from './devops-dora-metrics.js';

import {
    pollK8sReadiness,
    runHttpHealthChecks,
    triggerRollback,
    triggerHelmRollback,
    formatVerificationReport,
} from './devops-deploy-verifier.js';

import {
    parseGitLog,
    buildGitLogCommand,
    buildReleaseNotes,
    buildGitHubReleasePayload,
} from './devops-release-builder.js';

import {
    buildTrivyScanArgs,
    buildGrypeScanArgs,
    buildSnykScanArgs,
    parseTrivyScanOutput,
    parseGrypeScanOutput,
    parseSnykScanOutput,
    buildScanRemediationPrompt,
    parseScanRemediation,
} from './devops-security-scanner.js';

import {
    buildPipelinePrompt,
    parsePipelineOutput,
    defaultCiJobs,
} from './devops-pipeline-generator.js';

import type { PipelineProvider, PipelineJobSpec, PipelineTriggerConfig } from './devops-pipeline-generator.js';

import {
    buildInfracostBreakdownArgs,
    parseInfracostOutput,
    buildTfDriftCheckArgs,
    parseTfDriftOutput,
    formatCostReport,
    formatDriftReport,
} from './devops-cost-estimator.js';

import {
    buildK8sSecretApplyArgs,
    buildK8sGetSecretArgs,
    buildK8sAnnotateSecretArgs,
    buildVaultKvPutArgs,
    buildVaultKvGetArgs,
    buildAwsRotateSecretArgs,
    buildAwsPutSecretValueArgs,
    buildCertGetArgs,
    buildCertRenewArgs,
    parseCertInfo,
    parseK8sSecretInfo,
    formatRotationReport,
    formatCertReport,
} from './devops-secret-manager.js';

import type { SecretRotationResult, CertRenewalResult } from './devops-secret-manager.js';

import {
    buildAwsCliArgs,
    buildAzCliArgs,
    buildGcloudArgs,
    parseCloudCliOutput,
    summariseCloudResult,
    isDestructiveAws,
    isDestructiveAz,
    isDestructiveGcloud,
} from './devops-cloud-cli-builder.js';

import {
    buildTfStateMvArgs,
    buildTfStateRmArgs,
    buildTfImportArgs,
    buildTfStatePullArgs,
    buildTfStatePushArgs,
    buildTfStateUnlockArgs,
    buildTfStateListArgs,
    buildTfStateShowArgs,
    parseTfStateList,
    parseTfStatePull,
    extractLockId,
    buildTfStateOpPrompt,
    parseTfStateOpPlan,
} from './devops-tf-state-builder.js';

import {
    buildRoleYaml,
    buildClusterRoleYaml,
    buildRoleBindingYaml,
    buildClusterRoleBindingYaml,
    buildServiceAccountYaml,
    buildKubectlApplyArgs,
    buildKubectlCanIArgs,
    buildRbacGeneratePrompt,
    parseRbacManifests,
    buildRbacAuditChecks,
} from './devops-k8s-rbac-builder.js';

import {
    buildGrafanaDashboardPrompt,
    parseGrafanaDashboard,
    buildGrafanaDashboardApiPayload,
    buildAlertRulePrompt,
    parseAlertRuleOutput,
    buildPrometheusRuleCrd,
    buildDatadogMonitorPayload,
    buildPagerDutyServicePayload,
} from './devops-observability-builder.js';

import type { GrafanaPanel, PrometheusAlertRule } from './devops-observability-builder.js';

import {
    buildBlueGreenManifests,
    buildBlueGreenSwitchArgs,
    buildScaleDownArgs,
    buildArgoRolloutsManifest,
    buildArgoRolloutsPromoteArgs,
    buildArgoRolloutsAbortArgs,
    buildArgoRolloutsStatusArgs,
    buildIstioTrafficSplitManifests,
    buildDeploymentStrategyPrompt,
    parseDeploymentStrategyOutput,
} from './devops-deployment-strategy-builder.js';

import type { CanaryStep } from './devops-deployment-strategy-builder.js';

import {
    buildArgoCdSyncArgs,
    buildArgoCdRollbackArgs,
    buildArgoCdHistoryArgs,
    buildArgoCdGetArgs,
    buildArgoCdListArgs,
    buildArgoCdDiffArgs,
    buildArgoCdSetArgs,
    buildArgoCdWaitArgs,
    buildArgoCdApplicationYaml,
    parseArgoCdAppStatus,
    parseArgoCdAppList,
    summariseArgoCdApps,
    buildArgoCdAppPrompt,
} from './devops-argocd-builder.js';

import {
    buildHpaYaml,
    buildVpaYaml,
    buildResourceQuotaYaml,
    buildKubectlGetHpaArgs,
    buildKubectlScaleArgs,
    buildKubectlPatchHpaArgs,
    buildKubectlGetVpaArgs,
    buildCaStatusArgs,
    parseHpaStatus,
    buildAutoscalerPrompt,
    parseAutoscalerOutput,
} from './devops-k8s-autoscaler-builder.js';

import type { HpaSpec, VpaSpec, ResourceQuotaSpec } from './devops-k8s-autoscaler-builder.js';

import {
    buildKubectlExecArgs,
    buildGetPodNameArgs,
    buildDbMigrationExecArgs,
    buildPgDumpExecArgs,
    buildPsqlExecArgs,
    buildRedisExecArgs,
    buildMongoExecArgs,
    buildK8sJobYaml,
    buildKubectlCreateJobArgs,
    buildKubectlWaitJobArgs,
    buildKubectlLogsJobArgs,
    buildKubectlDeleteJobArgs,
    parseJobStatus,
    buildMigrationJobPrompt,
} from './devops-k8s-exec-builder.js';

import type { K8sJobSpec } from './devops-k8s-exec-builder.js';

import {
    buildRoute53ChangeBatch,
    buildRoute53ChangeArgs,
    buildRoute53ListRecordsArgs,
    buildRoute53ListZonesArgs,
    buildCloudFlareDnsArgs,
    buildAzDnsArgs,
    buildGcloudDnsArgs,
    buildAlbListenerRuleArgs,
    buildAlbDescribeListenersArgs,
    buildAlbDescribeTargetGroupHealthArgs,
    buildKubectlPatchIngressArgs,
    buildIngressYaml,
    buildAcmRequestCertArgs,
    buildAcmDescribeCertArgs,
    parseRoute53Records,
    parseCloudFlareDnsRecords,
    parseAcmCertStatus,
} from './devops-dns-lb-builder.js';

import type { DnsProvider, DnsRecordType } from './devops-dns-lb-builder.js';

import {
    buildIstioVirtualServiceYaml,
    buildIstioDestinationRuleYaml,
    buildIstioPeerAuthYaml,
    buildIstioAuthzPolicyYaml,
    buildIstioGatewayYaml,
    buildLinkerdServiceProfileYaml,
    buildIstioCtlAnalyzeArgs,
    buildIstioCtlProxyStatusArgs,
    buildIstioCtlProxyConfigArgs,
    buildLinkerdCheckArgs,
    buildLinkerdInjectArgs,
    buildLinkerdStatArgs,
    buildServiceMeshPrompt,
    parseServiceMeshOutput,
} from './devops-service-mesh-builder.js';

import type { MeshProvider, IstioRetryPolicy, IstioCircuitBreaker } from './devops-service-mesh-builder.js';

import {
    calculateErrorBudget,
    buildBurnRateAlerts,
    buildSlothSloYaml,
    buildPyrraObjectiveYaml,
    buildSloAlertRulesCrd,
    formatErrorBudgetReport,
    buildSloPrompt,
    parseSloOutput,
} from './devops-slo-builder.js';

import type { SloSpec } from './devops-slo-builder.js';

import {
    buildKubeBenchArgs,
    buildKubeBenchJobYaml,
    buildKubeBenchLogsArgs,
    buildFalcoRulesYaml,
    buildFalcoRulesConfigMapYaml,
    FALCO_HARDENED_RULES,
    buildFalcoStatusArgs,
    buildFalcoLogsArgs,
    buildFalcoRestartArgs,
    parseKubeBenchOutput,
    parseFalcoAlerts,
    formatComplianceReport,
    buildComplianceScanPrompt,
    buildFalcoRulePrompt,
} from './devops-compliance-scanner.js';

import type { FalcoRule, ComplianceTarget } from './devops-compliance-scanner.js';

import {
    buildEcrListImagesArgs,
    buildEcrDeleteImagesArgs,
    buildEcrPutLifecyclePolicyArgs,
    buildEcrLifecyclePolicyJson,
    buildGhcrListVersionsArgs,
    buildGhcrDeleteVersionArgs,
    buildGcloudImagesListArgs,
    buildGcloudImagesDeleteArgs,
    buildAcrShowTagsArgs,
    buildAcrPurgePolicyArgs,
    buildDockerMirrorCommands,
    buildCraneCopyArgs,
    buildSkopeoCopyArgs,
    applyRetentionPolicy,
    parseEcrImages,
    formatRegistryCleanupReport,
    buildEcrDescribeReposArgs,
} from './devops-registry-builder.js';

import type { RegistryProvider, RetentionPolicy } from './devops-registry-builder.js';

import {
    buildK6Script,
    buildK6RunArgs,
    buildGatlingArgs,
    buildJMeterArgs,
    parseK6Output,
    compareBenchmarks,
    formatLoadTestReport,
    buildK6ScriptPrompt,
    buildGatlingScriptPrompt,
    parseLoadTestScriptOutput,
} from './devops-load-test-builder.js';

import type { LoadTestScenario } from './devops-load-test-builder.js';

import {
    buildPrometheusInstantQueryArgs,
    buildPrometheusRangeQueryArgs,
    buildLokiRangeQueryArgs,
    buildElasticsearchSearchArgs,
    buildElasticsearchQueryDsl,
    buildDatadogMetricQueryArgs,
    buildDatadogLogsQueryArgs,
    buildCloudWatchGetMetricArgs,
    buildCloudWatchLogsInsightsStartArgs,
    buildCloudWatchLogsInsightsResultArgs,
    parsePrometheusResult,
    parseLokiResult,
    parseCloudWatchResult,
    parseMetricsAnalysis,
    buildMetricsAnalysisPrompt,
    formatMetricsReport,
} from './devops-metrics-query-builder.js';

import {
    buildExplainAnalyzeArgs,
    buildIndexAdvisorArgs,
    buildVacuumAnalyzeArgs,
    buildShowLocksArgs,
    buildKillBackendArgs,
    buildTableBloatArgs,
    buildPatroniStatusArgs,
    buildPatroniSwitchoverArgs,
    buildPatroniFailoverArgs,
    buildPatroniPauseResumeArgs,
    buildReplicationLagArgs,
    buildSlowQueryArgs,
    buildExplainAnalysisPrompt,
    buildIndexAdvisorPrompt,
    parseExplainOutput,
    parsePatroniStatus,
    formatDbAdminReport,
} from './devops-db-admin-builder.js';

import {
    buildAwsRiUtilizationArgs,
    buildAwsSavingsPlanCoverageArgs,
    buildAwsRightsizingArgs,
    buildAwsCostForecastArgs,
    buildAwsCostBreakdownArgs,
    buildTrustedAdvisorArgs,
    buildTrustedAdvisorRefreshArgs,
    buildSpotPriceHistoryArgs,
    buildAzureCostUsageArgs,
    buildAzureAdvisorRecommendationsArgs,
    buildAzureReservationUtilizationArgs,
    buildGcpBillingAccountListArgs,
    buildGcpRecommenderListArgs,
    buildGcpUnusedIpListArgs,
    buildGcpIdleDisksArgs,
    buildFinOpsPrompt,
    parseAwsRiUtilization,
    parseAwsRightsizing,
    parseFinOpsOutput,
    formatFinOpsReport,
    TRUSTED_ADVISOR_COST_CHECKS,
} from './devops-finops-builder.js';

import {
    buildArgoCdClusterListArgs,
    buildArgoCdClusterAddArgs,
    buildArgoCdClusterRemoveArgs,
    buildArgoCdClusterGetArgs,
    buildKubectlMultiContextArgs,
    buildKubectlGetContextsArgs,
    buildKubectlClusterInfoArgs,
    buildApplicationSetYaml,
    buildAppOfAppsYaml,
    buildCapiClusterYaml,
    buildFleetGitRepoYaml,
    buildFleetStatusArgs,
    parseArgoCdClusterList,
    formatFleetStatus,
    buildFleetPrompt,
    parseFleetOutput,
} from './devops-fleet-builder.js';

import type { ApplicationSetSpec, AppOfAppsSpec } from './devops-fleet-builder.js';

import {
    buildWinrsArgs,
    buildInvokeCommandArgs,
    buildTestWsManArgs,
    buildDscApplyArgs,
    buildDscTestArgs,
    buildDscGetArgs,
    buildDscStatusArgs,
    buildAdGetUserArgs,
    buildAdNewUserArgs,
    buildAdDisableUserArgs,
    buildAdResetPasswordArgs,
    buildAdRemoveUserArgs,
    buildAdGetGroupMembersArgs,
    buildAdAddGroupMemberArgs,
    buildIisListSitesArgs,
    buildIisStartSiteArgs,
    buildIisStopSiteArgs,
    buildIisRestartAppPoolArgs,
    buildIisGetAppPoolsArgs,
    buildGetWinEventArgs,
    buildGetWindowsUpdateArgs,
    buildInstallWindowsUpdateArgs,
    buildCheckPendingRebootArgs,
    buildGetServiceArgs,
    buildRestartServiceArgs,
    buildStopServiceArgs,
    parseWindowsUpdateList,
    parseIisSites,
    buildWindowsAnalysisPrompt,
    parseWindowsAnalysisOutput,
    formatWindowsReport,
} from './devops-windows-builder.js';

import type { WinRmTarget, EventLogQuery } from './devops-windows-builder.js';

import {
    buildPodChaosYaml,
    buildNetworkChaosYaml,
    buildStressChaosYaml,
    buildDnsChaosYaml,
    buildChaosMeshListArgs,
    buildChaosMeshDeleteArgs,
    buildChaosMeshPauseArgs,
    buildChaosMeshResumeArgs,
    buildFisCreateTemplateArgs,
    buildFisStartExperimentArgs,
    buildFisStopExperimentArgs,
    buildFisGetExperimentArgs,
    buildFisListExperimentsArgs,
    buildFisEc2StopTemplateJson,
    buildLitmusChaosEngineYaml,
    buildLitmusResultArgs,
    buildLitmusStopArgs,
    parseChaosMeshResults,
    parseFisExperiment,
    buildChaosPrompt,
    parseChaosDesign,
    formatChaosReport,
} from './devops-chaos-builder.js';

import type { ChaosExperimentSpec, NetworkChaosParams, StressChaosParams } from './devops-chaos-builder.js';

import {
    buildAirflowTriggerDagArgs,
    buildAirflowGetDagRunArgs,
    buildAirflowListDagRunsArgs,
    buildAirflowGetTaskLogsArgs,
    buildAirflowPauseDagArgs,
    buildAirflowListDagsArgs,
    buildMlflowListExperimentsArgs,
    buildMlflowSearchRunsArgs,
    buildMlflowGetRunArgs,
    buildMlflowRegisterModelArgs,
    buildMlflowTransitionModelStageArgs,
    buildMlflowCliRunsListArgs,
    buildMlflowCliArtifactListArgs,
    buildSageMakerListEndpointsArgs,
    buildSageMakerDescribeEndpointArgs,
    buildSageMakerUpdateEndpointArgs,
    buildSageMakerDeleteEndpointArgs,
    buildSageMakerListTrainingJobsArgs,
    buildSageMakerDescribeTrainingJobArgs,
    buildSageMakerStopTrainingJobArgs,
    buildDbtRunArgs,
    buildDbtTestArgs,
    buildDbtSourceFreshnessArgs,
    buildDbtDocsGenerateArgs,
    buildKfpListPipelinesArgs,
    buildKfpRunPipelineArgs,
    buildKfpGetRunArgs,
    buildKfpStopRunArgs,
    parseAirflowDagRun,
    parseMlflowRuns,
    parseSageMakerEndpoints,
    parseDbtRunResults,
    buildMlopsAnalysisPrompt,
    formatMlopsReport,
} from './devops-mlops-builder.js';

import {
    buildKubectlCordonArgs,
    buildKubectlUncordonArgs,
    buildKubectlDrainArgs,
    buildKubectlTaintNodeArgs,
    buildKubectlGetNodeArgs,
    buildKubectlQuarantineLabelArgs,
    buildQuarantineNetworkPolicyYaml,
    buildKubectlDeletePodArgs,
    buildKubectlDeletePodsByLabelArgs,
    buildKubectlDescribePodArgs,
    buildKubectlLogsArgs as buildIncidentLogsArgs,
    buildKubectlExecEnvArgs,
    buildKubectlGetEventsArgs,
    buildJstackCaptureArgs,
    buildProcNetTcpArgs,
    buildElasticSiemQueryArgs,
    buildSplunkSearchArgs,
    buildFalcoLogsArgs as buildIncidentFalcoLogsArgs,
    parseFalcoAlerts as parseIncidentFalcoAlerts,
    parseElasticSiemResults,
    buildIncidentContainmentPrompt,
    parseIncidentContainmentPlan,
    formatIncidentReport,
} from './devops-incident-contain-builder.js';

import {
    resolveCommandArgv,
    parseCommandsInput,
    buildDebugSessionAnalysisPrompt,
    parseDebugSessionAnalysis,
    formatDebugSessionReport,
} from './devops-debug-session-builder.js';

import type { DebugCommand, DebugCommandResult, DebugSessionResult } from './devops-debug-session-builder.js';

import {
    buildPingArgs,
    buildTracerouteArgs,
    buildDnsLookupArgs,
    buildNslookupArgs,
    buildPortCheckArgs,
    buildNmapPortCheckArgs,
    buildHttpCheckArgs,
    buildHttpCheckWithBodyArgs,
    buildMtrArgs,
    buildArpTableArgs,
    buildRouteTableArgs,
    buildSslCheckArgs,
    buildIperf3Args,
    parsePingOutput,
    parseTracerouteOutput,
    parseDnsOutput,
    parseHttpCheckOutput,
    parseSslCertOutput,
    formatNetDiagReport,
} from './devops-net-diag-builder.js';

import {
    buildDashboardTask,
    buildHandoffSummaryPrompt,
    parseHandoffSummaryOutput,
    getEscalationDefaults,
    formatHandoffReport,
    formatSlackHandoffNotification,
} from './devops-human-handoff-builder.js';

import type { EscalationType, HandoffSeverity, DashboardTask } from './devops-human-handoff-builder.js';

import {
    parseRunbookDefinition,
    executeRunbook,
    buildRunbookGenerationPrompt,
    parseRunbookGenerationOutput,
} from './devops-runbook-builder.js';

import {
    buildKubectlPortForwardPodArgs,
    buildKubectlPortForwardServiceArgs,
    buildKubectlPortForwardDeploymentArgs,
    buildSshLocalTunnelArgs,
    buildSshRemoteTunnelArgs,
    buildSshDynamicTunnelArgs,
    buildSshProxyJumpArgs,
    buildListPortForwardsArgs,
    buildKillPortForwardByPidArgs,
    buildFindPortPidArgs,
    parseActiveTunnels,
    formatTunnelReport,
} from './devops-tunnel-builder.js';

import {
    buildPrometheusReloadArgs,
    buildPrometheusQuitArgs,
    buildPrometheusHealthyArgs,
    buildPrometheusReadyArgs,
    buildPrometheusTargetsArgs,
    buildPrometheusRulesApiArgs,
    buildPrometheusAlertsApiArgs,
    buildPrometheusConfigApiArgs,
    buildPrometheusRuntimeApiArgs,
    buildPrometheusTsdbArgs,
    buildPrometheusFlagsApiArgs,
    buildPrometheusDeleteSeriesArgs,
    buildPrometheusCleanTombstonesArgs,
    buildPrometheusSnapshotArgs,
    parsePrometheusTargets,
    parsePrometheusRulesApi,
    parsePrometheusAlerts,
    formatPrometheusTargetReport,
    formatPrometheusAlertReport,
} from './devops-prometheus-mgmt-builder.js';

import {
    buildVaultLeaseRenewArgs,
    buildVaultLeaseRevokeArgs,
    buildVaultLeaseLookupArgs,
    buildVaultLeaseRevokeByPrefixArgs,
    buildVaultLeaseListArgs,
    buildVaultDynamicReadArgs,
    buildVaultAwsCredsArgs,
    buildVaultDbCredsArgs,
    buildVaultPkiIssueArgs,
    buildVaultSshSignArgs,
    buildVaultKvMetadataArgs,
    buildVaultTokenCreateArgs,
    buildVaultTokenRenewArgs,
    buildVaultTokenRevokeArgs,
    buildVaultTokenLookupArgs,
    buildVaultTokenCapabilitiesArgs,
    parseVaultLease,
    parseVaultDynamicCreds,
    parseVaultTokenInfo,
    parseVaultPkiCert,
    formatVaultLeaseReport,
} from './devops-vault-dynamic-builder.js';

import {
    buildArgoSubmitArgs,
    buildArgoGetArgs,
    buildArgoListArgs,
    buildArgoLogsArgs,
    buildArgoRetryArgs,
    buildArgoResubmitArgs,
    buildArgoTerminateArgs,
    buildArgoStopArgs,
    buildArgoDeleteArgs,
    buildArgoWatchArgs,
    buildArgoLintArgs,
    buildArgoTemplateListArgs,
    buildArgoTemplateGetArgs,
    buildArgoTemplateCreateArgs,
    buildArgoTemplateDeleteArgs,
    buildArgoCronListArgs,
    buildArgoCronCreateArgs,
    buildArgoCronSuspendArgs,
    buildArgoCronResumeArgs,
    buildArgoCronDeleteArgs,
    buildWorkflowYaml,
    buildArgoWorkflowGeneratePrompt,
    parseArgoWorkflowStatus,
    parseArgoWorkflowList,
    formatArgoWorkflowReport,
} from './devops-argo-workflow-builder.js';

import {
    buildBackstageEntityGetArgs,
    buildBackstageEntityListArgs,
    buildBackstageEntitySearchArgs,
    buildBackstageEntityRefArgs,
    buildBackstageComponentInfoArgs,
    buildBackstageOwnerComponentsArgs,
    buildBackstageApiListArgs,
    buildBackstageResourceListArgs,
    buildBackstageSystemListArgs,
    buildBackstageTechDocsArgs,
    buildBackstageHealthArgs,
    parseBackstageEntity,
    parseBackstageEntityList,
    formatBackstageEntityReport,
    formatBackstageEntityListReport,
} from './devops-backstage-builder.js';

import {
    buildSlackChannelCreateArgs,
    buildSlackChannelInviteArgs,
    buildSlackChannelTopicArgs,
    buildSlackChannelArchiveArgs,
    buildSlackChannelInfoArgs,
    buildSlackChannelListArgs,
    buildSlackMessagePostArgs,
    buildSlackMessageUpdateArgs,
    buildSlackPinAddArgs,
    buildSlackPinRemoveArgs,
    buildSlackUserLookupArgs,
    buildIncidentChannelName,
    buildWarRoomWelcomeMessage,
    buildIncidentStatusUpdateBlocks,
    buildIncidentResolutionMessage,
    parseSlackChannel,
    parseSlackChannelList,
    parseSlackMessage,
    parseSlackUserId,
    formatSlackIncidentChannelReport,
    formatWarRoomCreatedReport,
} from './devops-slack-incident-builder.js';

import type { IncidentWarRoomSpec } from './devops-slack-incident-builder.js';

import {
    buildMetricWatchSpec,
    buildLogWatchSpec,
    buildEndpointWatchSpec,
    buildPrometheusInstantQueryArgs as buildMonitorPrometheusQueryArgs,
    buildLogWatchArgs,
    buildEndpointCheckArgs,
    buildEndpointBodyCheckArgs,
    evaluateMetricResult,
    evaluateLogResult,
    evaluateEndpointResult,
    buildMonitorReport,
    formatMonitorReport,
    buildMonitorAlertMessage,
} from './devops-scheduled-monitor-builder.js';

import type { MonitorSpec, MonitorCheckResult } from './devops-scheduled-monitor-builder.js';

import {
    assembleIncidentContext,
    buildIncidentTriagePrompt,
    parseTriageSuggestion,
    buildEnrichedAlertSummary,
    selectRelevantPastIncidents,
    computeNoiseScore,
} from './devops-incident-context-builder.js';

import type { RawAlert, PastIncident, ServiceContext, IncidentContext } from './devops-incident-context-builder.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DevopsActionType =
    // ── Terraform ─────────────────────────────────────────────────────────────
    | 'workspace_devops_tf_plan'
    | 'workspace_devops_tf_apply'
    | 'workspace_devops_tf_validate'
    | 'workspace_devops_tf_generate'
    // ── Kubernetes ────────────────────────────────────────────────────────────
    | 'workspace_devops_k8s_deploy'
    | 'workspace_devops_k8s_rollback'
    | 'workspace_devops_k8s_status'
    | 'workspace_devops_k8s_logs'
    | 'workspace_devops_k8s_generate'
    // ── Docker ────────────────────────────────────────────────────────────────
    | 'workspace_devops_docker_build'
    | 'workspace_devops_docker_push'
    // ── CI/CD ─────────────────────────────────────────────────────────────────
    | 'workspace_devops_pipeline_trigger'
    | 'workspace_devops_pipeline_status'
    // ── Incident & reporting ──────────────────────────────────────────────────
    | 'workspace_devops_incident_triage'
    | 'workspace_devops_standup_report'
    // ── Helm (Gap 1) ──────────────────────────────────────────────────────────
    | 'workspace_devops_helm_install'
    | 'workspace_devops_helm_rollback'
    | 'workspace_devops_helm_diff'
    | 'workspace_devops_helm_generate'
    // ── DORA Metrics (Gap 2) ──────────────────────────────────────────────────
    | 'workspace_devops_dora_metrics'
    // ── Post-Deploy Verification (Gap 3) ──────────────────────────────────────
    | 'workspace_devops_deploy_verify'
    // ── Environment Promotion (Gap 4) ─────────────────────────────────────────
    | 'workspace_devops_env_promote'
    // ── Release Notes (Gap 5) ─────────────────────────────────────────────────
    | 'workspace_devops_release_notes'
    // ── Container Security Scan (Gap 6) ───────────────────────────────────────
    | 'workspace_devops_image_scan'
    // ── Pipeline Config Generation (Gap 7) ────────────────────────────────────
    | 'workspace_devops_pipeline_generate'
    // ── Cost Estimation (Gap 8) ───────────────────────────────────────────────
    | 'workspace_devops_cost_estimate'
    // ── Drift Detection (Gap 9) ───────────────────────────────────────────────
    | 'workspace_devops_drift_check'
    // ── Secret Rotation & Cert Renewal (Gap 10) ───────────────────────────────
    | 'workspace_devops_secret_rotate'
    | 'workspace_devops_cert_renew'
    // ── P1 Gap 1 — Cloud CLI ─────────────────────────────────────────────────
    | 'workspace_devops_aws_cli'
    | 'workspace_devops_az_cli'
    | 'workspace_devops_gcloud_cli'
    // ── P1 Gap 2 — Terraform State Management ────────────────────────────────
    | 'workspace_devops_tf_state'
    // ── P1 Gap 3 — Kubernetes RBAC ───────────────────────────────────────────
    | 'workspace_devops_k8s_rbac'
    // ── P1 Gap 4 — Observability Management ──────────────────────────────────
    | 'workspace_devops_grafana_dashboard'
    | 'workspace_devops_alert_rule'
    // ── P1 Gap 5 — Deployment Strategy Builder ───────────────────────────────
    | 'workspace_devops_blue_green'
    | 'workspace_devops_canary'
    // ── P2 Gap 6 — ArgoCD / GitOps ───────────────────────────────────────────
    | 'workspace_devops_argocd'
    // ── P2 Gap 7 — HPA / VPA / Autoscaler ────────────────────────────────────
    | 'workspace_devops_k8s_autoscale'
    // ── P2 Gap 8 — Database / exec-into-pod ──────────────────────────────────
    | 'workspace_devops_k8s_exec'
    // ── P2 Gap 9 — DNS & Load Balancer ───────────────────────────────────────
    | 'workspace_devops_dns'
    | 'workspace_devops_lb'
    // ── P2 Gap 10 — Service Mesh (Istio / Linkerd) ───────────────────────────
    | 'workspace_devops_service_mesh'
    // ── P3 Gap 11 — SLO / Error Budgets ──────────────────────────────────────
    | 'workspace_devops_slo'
    // ── P3 Gap 12 — CIS Compliance Scanning ──────────────────────────────────
    | 'workspace_devops_compliance_scan'
    // ── P3 Gap 13 — Container Registry Hygiene ───────────────────────────────
    | 'workspace_devops_registry'
    // ── P3 Gap 14 — Load / Performance Testing ───────────────────────────────
    | 'workspace_devops_load_test'
    // ── P4 Gap 15 — Live Metrics Querying ────────────────────────────────────
    | 'workspace_devops_metrics_query'
    // ── P4 Gap 16 — Database Administration ──────────────────────────────────
    | 'workspace_devops_db_admin'
    // ── P4 Gap 17 — FinOps / Cost Optimization ───────────────────────────────
    | 'workspace_devops_finops'
    // ── P4 Gap 18 — Fleet / Multi-Cluster Management ─────────────────────────
    | 'workspace_devops_fleet'
    // ── P5 Gap 19 — Windows Server Administration ─────────────────────────────
    | 'workspace_devops_windows'
    // ── P5 Gap 20 — Chaos Engineering ────────────────────────────────────────
    | 'workspace_devops_chaos'
    // ── P5 Gap 21 — MLOps Pipeline Management ────────────────────────────────
    | 'workspace_devops_mlops'
    // ── P5 Gap 22 — Incident Containment ─────────────────────────────────────
    | 'workspace_devops_incident_contain'
    // ── Bucket 2 Gap 1 — Interactive Debug Session ────────────────────────
    | 'workspace_devops_debug_session'
    // ── Bucket 2 Gap 5 — Runbook Executor ────────────────────────────────
    | 'workspace_devops_runbook_execute'
    // ── Bucket 3 — Network Diagnostics ───────────────────────────────────
    | 'workspace_devops_net_diag'
    // ── Bucket 3 — Human Handoff / Dashboard Escalation ──────────────────
    | 'workspace_devops_human_handoff'
    // ── Wave 1 Gap 1 — Port-forward / SSH Tunnel ─────────────────────────
    | 'workspace_devops_tunnel'
    // ── Wave 1 Gap 2 — Prometheus Management API ─────────────────────────
    | 'workspace_devops_prometheus_mgmt'
    // ── Wave 1 Gap 3 — Vault Dynamic Secrets ─────────────────────────────
    | 'workspace_devops_vault_dynamic'
    // ── Wave 1 Gap 4 — Argo Workflows ────────────────────────────────────
    | 'workspace_devops_argo_workflow'
    // ── Wave 1 Gap 5 — Backstage Catalog ─────────────────────────────────
    | 'workspace_devops_backstage'
    // ── Wave 1 Gap 6 — Slack Incident Channel ────────────────────────────
    | 'workspace_devops_slack_incident'
    // ── Wave 2 Gap 1 — Scheduled Monitor ─────────────────────────────────
    | 'workspace_devops_scheduled_monitor'
    // ── Wave 2 Gap 2 — Incident Context / Noise Filter ───────────────────
    | 'workspace_devops_incident_context';

export const DEVOPS_ACTION_TYPES = new Set<DevopsActionType>([
    'workspace_devops_tf_plan',
    'workspace_devops_tf_apply',
    'workspace_devops_tf_validate',
    'workspace_devops_tf_generate',
    'workspace_devops_k8s_deploy',
    'workspace_devops_k8s_rollback',
    'workspace_devops_k8s_status',
    'workspace_devops_k8s_logs',
    'workspace_devops_k8s_generate',
    'workspace_devops_docker_build',
    'workspace_devops_docker_push',
    'workspace_devops_pipeline_trigger',
    'workspace_devops_pipeline_status',
    'workspace_devops_incident_triage',
    'workspace_devops_standup_report',
    'workspace_devops_helm_install',
    'workspace_devops_helm_rollback',
    'workspace_devops_helm_diff',
    'workspace_devops_helm_generate',
    'workspace_devops_dora_metrics',
    'workspace_devops_deploy_verify',
    'workspace_devops_env_promote',
    'workspace_devops_release_notes',
    'workspace_devops_image_scan',
    'workspace_devops_pipeline_generate',
    'workspace_devops_cost_estimate',
    'workspace_devops_drift_check',
    'workspace_devops_secret_rotate',
    'workspace_devops_cert_renew',
    'workspace_devops_aws_cli',
    'workspace_devops_az_cli',
    'workspace_devops_gcloud_cli',
    'workspace_devops_tf_state',
    'workspace_devops_k8s_rbac',
    'workspace_devops_grafana_dashboard',
    'workspace_devops_alert_rule',
    'workspace_devops_blue_green',
    'workspace_devops_canary',
    'workspace_devops_argocd',
    'workspace_devops_k8s_autoscale',
    'workspace_devops_k8s_exec',
    'workspace_devops_dns',
    'workspace_devops_lb',
    'workspace_devops_service_mesh',
    'workspace_devops_slo',
    'workspace_devops_compliance_scan',
    'workspace_devops_registry',
    'workspace_devops_load_test',
    'workspace_devops_metrics_query',
    'workspace_devops_db_admin',
    'workspace_devops_finops',
    'workspace_devops_fleet',
    'workspace_devops_windows',
    'workspace_devops_chaos',
    'workspace_devops_mlops',
    'workspace_devops_incident_contain',
    'workspace_devops_debug_session',
    'workspace_devops_runbook_execute',
    'workspace_devops_net_diag',
    'workspace_devops_human_handoff',
    'workspace_devops_tunnel',
    'workspace_devops_prometheus_mgmt',
    'workspace_devops_vault_dynamic',
    'workspace_devops_argo_workflow',
    'workspace_devops_backstage',
    'workspace_devops_slack_incident',
    'workspace_devops_scheduled_monitor',
    'workspace_devops_incident_context',
]);

export function isDevopsActionType(at: string): at is DevopsActionType {
    return DEVOPS_ACTION_TYPES.has(at as DevopsActionType);
}

/**
 * Per-action operational guardrails — moved here from the classification system
 * prompt (was ~2,600 tokens of seldom-relevant rules sent on every routing call).
 *
 * These rules are enforced at execution time. Each entry is an array of
 * safety constraints for that action type. The executor can surface them in
 * pre-flight validation or inject them into LLM sub-calls when relevant.
 */
export const OPERATIONAL_GUARDRAILS: Partial<Record<DevopsActionType, string[]>> = {
    workspace_devops_prometheus_mgmt: [
        'Never run sub_action=quit outside an explicitly approved emergency maintenance window.',
        'Always verify target health (sub_action=healthy) before issuing reload.',
        'Never delete_series on production without an approved payload — set allow_destructive guard.',
        'Always snapshot TSDB before running clean_tombstones on production.',
    ],
    workspace_devops_argo_workflow: [
        'Always run sub_action=list before submit to check for existing duplicate workflows.',
        'Never terminate a running workflow without first inspecting its logs.',
        'Never delete a cron workflow without confirming it is suspended first.',
        'Always lint a workflow YAML before apply (sub_action=lint).',
    ],
    workspace_devops_vault_dynamic: [
        'Never revoke_prefix on a live path without first listing leases to assess blast radius.',
        'Always lookup a lease before renewing to confirm it has not already expired.',
        'Never create tokens with policies broader than the task requires.',
        'Always use token_capabilities to verify access before requesting credentials.',
    ],
    workspace_devops_k8s_rbac: [
        'Never generate cluster-wide roles when namespace-scoped roles are sufficient.',
        'Always audit existing RBAC before applying new bindings.',
        'Never grant wildcard resource or verb permissions.',
    ],
    workspace_devops_db_admin: [
        'Never run patroni_failover or patroni_switchover without human approval — always route=approval.',
        'Never vacuum FULL on a table without verifying an exclusive lock is safe at that time.',
        'Always show_locks before killing backends to understand the dependency chain.',
        'Never run allow_destructive=true operations without an approved task payload.',
    ],
    workspace_devops_chaos: [
        'Never inject chaos into production clusters without an explicit approved experiment plan.',
        'Always record the blast radius (affected pods / nodes) before starting any chaos action.',
        'Never run fis_start or litmus experiments without a rollback plan in the task payload.',
        'Always pause/resume rather than delete when stopping an in-progress chaos experiment.',
    ],
    workspace_devops_incident_contain: [
        'Never cordon or drain a node without verifying workloads can be safely rescheduled.',
        'Never delete_pod in production without checking whether it is the only replica.',
        'Always apply deny_all_policy only to the specific affected namespace, never cluster-wide.',
        'Never use allow_destructive=true without route=approval in the task decision.',
    ],
    workspace_devops_fleet: [
        'Never cluster_remove a production cluster without human confirmation.',
        'Always cluster_list before cluster_add to avoid duplicate registrations.',
        'Never kubectl_multi with destructive commands across all clusters simultaneously.',
    ],
    workspace_devops_tf_apply: [
        'Never set auto_approve=true in a task payload — the ApprovalEnforcer must gate every apply.',
        'Always run tf_plan immediately before tf_apply and include the plan output in the approval record.',
        'Never apply against production without a var_file that scopes the workspace correctly.',
    ],
    workspace_devops_secret_rotate: [
        'Always verify the current secret is in use before rotation to avoid service outages.',
        'Never rotate Kubernetes secrets without checking which pods mount them first.',
        'Always store the old value in a backup path before overwriting (when backend supports it).',
    ],
    workspace_devops_image_scan: [
        'Always fail the pipeline if scanner reports CRITICAL severity unfixed vulnerabilities.',
        'Never ignore_unfixed=true on production image promotions without an approved exception.',
    ],
    workspace_devops_pipeline_trigger: [
        'Never trigger a production pipeline without verifying the ref points to a reviewed commit.',
        'Always check pipeline_status after trigger to confirm it started successfully.',
    ],
    workspace_devops_aws_cli: [
        'Never set allow_destructive=true without route=approval.',
        'Always scope --region explicitly; never rely on default region for production operations.',
        'Never run IAM or org-level operations without a destructive=true flag and approval gate.',
    ],
    workspace_devops_az_cli: [
        'Never set allow_destructive=true without route=approval.',
        'Always specify --subscription explicitly for production operations.',
    ],
    workspace_devops_gcloud_cli: [
        'Never set allow_destructive=true without route=approval.',
        'Always specify --project explicitly; never rely on gcloud default project in automation.',
    ],
    workspace_devops_tf_state: [
        'Never run state mv, rm, or import without a dry_run=true preview first.',
        'Always pull current state before any mutation to ensure no concurrent modifications.',
        'Never unlock a state lock without first identifying who holds it and why.',
    ],
    workspace_devops_helm_install: [
        'Always use atomic=true for production installs so failed releases auto-rollback.',
        'Always helm_diff before install/upgrade in production to preview the changeset.',
        'Never skip dry_run=true on first-time chart installs in a new namespace.',
    ],
    workspace_devops_env_promote: [
        'Always verify the from_environment deployment is healthy before promoting.',
        'Never promote directly from dev to production — staging must be an intermediate step.',
    ],
    workspace_devops_cert_renew: [
        'Always run check_only=true first to confirm cert expiry before attempting renewal.',
        'Never renew a cert without verifying the new cert will be accepted by all dependent services.',
    ],
    workspace_devops_registry: [
        'Never delete_images or purge without dry_run=true preview showing affected digests.',
        'Always set keep_latest or keep_tag_prefixes to prevent accidental deletion of all tags.',
        'Never allow_destructive=true without route=approval.',
    ],
    workspace_devops_windows: [
        'Never run allow_destructive=true operations on Windows hosts without approval.',
        'Always test_wsm connectivity before issuing remote commands.',
        'Never install_updates with auto_reboot=true on production without a maintenance window.',
    ],
    workspace_devops_mlops: [
        'Never transition an MLflow model to Production without a prior Staging validation run.',
        'Never delete a SageMaker endpoint during peak traffic — always check endpoint status first.',
        'Always stop training jobs gracefully before sagemaker_stop_training if checkpoints matter.',
    ],
    workspace_devops_load_test: [
        'Never run load tests against production with vus > 100 without an approved test plan.',
        'Always set thresholds so the test fails fast if error_rate or p99 latency exceeds limits.',
    ],
};

export type DevopsActionResult = { ok: boolean; output: string; errorOutput?: string; [key: string]: unknown };

type SubResult      = { ok: boolean; output: string; errorOutput?: string };
type ExecuteActionFn = (actionType: string, payload: Record<string, unknown>) => Promise<SubResult>;
type RunCommandFn   = (args: string[], cwd: string, timeoutMs?: number) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
type LlmCallFn      = (prompt: string, systemPrompt?: string) => Promise<string>;

export interface DevopsActionParams {
    actionType:       DevopsActionType;
    tenantId:         string;
    botId:            string;
    taskId:           string;
    payload:          Record<string, unknown>;
    workspaceDir:     string;
    executeAction:    ExecuteActionFn;
    runCommand?:      RunCommandFn;
    callLlm?:         LlmCallFn;
    /** Optional — when provided, RAG context is fetched and injected into every LLM call. */
    gatewayBaseUrl?:  string;
    serviceToken?:    string;
    workspaceId?:     string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeJson(obj: Record<string, unknown>): DevopsActionResult {
    return { ok: true, output: JSON.stringify(obj) };
}
function str(v: unknown, fallback = ''): string { return typeof v === 'string' ? v.trim() : fallback; }
function num(v: unknown, fallback = 0):  number { return typeof v === 'number' ? v : fallback; }
async function callLlmSafe(fn: LlmCallFn | undefined, prompt: string, sys?: string): Promise<string> {
    if (!fn) return '';
    try { return await fn(prompt, sys); } catch { return ''; }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function handleDevopsAction(params: DevopsActionParams): Promise<DevopsActionResult> {
    const { actionType, payload, workspaceDir, executeAction, runCommand,
            callLlm: rawCallLlm, gatewayBaseUrl, serviceToken, workspaceId, tenantId, botId } = params;

    // RAG pre-flight — wrap callLlm so every LLM call receives ops context
    let callLlm = rawCallLlm;
    if (rawCallLlm && gatewayBaseUrl && serviceToken && workspaceId) {
        try {
            const { buildDevOpsRagContext } = await import('./devops-rag-retriever.js');
            const { deriveMemoryConfig } = await import('@agentfarm/memory-service');
            const ragCtx = await buildDevOpsRagContext(
                {
                    tenantId, botId,
                    serviceOrComponent: String(payload['service'] ?? payload['component'] ?? actionType),
                    contextDescription: String(payload['description'] ?? ''),
                    documentType: 'runbook',
                },
                gatewayBaseUrl, serviceToken, workspaceId, deriveMemoryConfig(actionType),
            );
            if (ragCtx.contextBlock) {
                callLlm = (prompt: string, sys?: string): Promise<string> =>
                    rawCallLlm(prompt, sys ? `${sys}\n\n${ragCtx.contextBlock}` : ragCtx.contextBlock);
            }
        } catch { /* non-fatal — proceed without RAG */ }
    }

    switch (actionType) {

        // ====================================================================
        // workspace_devops_tf_plan
        // payload: working_dir? (default: workspaceDir), var_file?
        // ====================================================================
        case 'workspace_devops_tf_plan': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const tfDir  = str(payload['working_dir'], workspaceDir);
            const varFile = str(payload['var_file']);
            const args   = ['terraform', 'plan', '-no-color', ...(varFile ? [`-var-file=${varFile}`] : [])];
            const result = await runCommand(args, tfDir, 120_000);
            const plan   = parseTerraformPlan(result.stdout + result.stderr);
            const { score, riskLevel } = summariseTfPlan(plan);
            return safeJson({
                to_create: plan.toCreate, to_update: plan.toUpdate,
                to_destroy: plan.toDestroy, to_replace: plan.toReplace,
                has_destroy: plan.hasDestroy, risk_level: riskLevel,
                score, changes: plan.changes, summary: plan.summary,
                exit_code: result.exitCode,
            });
        }

        // ====================================================================
        // workspace_devops_tf_apply  [HIGH RISK — ApprovalEnforcer intercepts]
        // payload: working_dir?, var_file?, auto_approve? (default: false)
        // ====================================================================
        case 'workspace_devops_tf_apply': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const tfDir    = str(payload['working_dir'], workspaceDir);
            const varFile  = str(payload['var_file']);
            const autoApprove = payload['auto_approve'] === true;
            const args = [
                'terraform', 'apply', '-no-color',
                ...(autoApprove ? ['-auto-approve'] : []),
                ...(varFile ? [`-var-file=${varFile}`] : []),
            ];
            const result = await runCommand(args, tfDir, 300_000);
            const ok     = result.exitCode === 0;
            return safeJson({
                ok, exit_code: result.exitCode,
                output_tail: result.stdout.slice(-2000),
                summary: ok ? 'Terraform apply completed successfully.' : `Terraform apply failed (exit ${result.exitCode}).`,
            });
        }

        // ====================================================================
        // workspace_devops_tf_validate
        // payload: working_dir?, scan_security? (default: true)
        // ====================================================================
        case 'workspace_devops_tf_validate': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const tfDir    = str(payload['working_dir'], workspaceDir);
            const doScan   = payload['scan_security'] !== false;
            const result   = await runCommand(['terraform', 'validate', '-no-color'], tfDir, 60_000);
            const valid    = result.exitCode === 0;
            let findings: ReturnType<typeof parseIacSecurityFindings> = [];
            if (doScan && callLlm) {
                const tfRead = await executeAction('workspace_read_file', { file_path: `${tfDir}/main.tf` });
                if (tfRead.ok) {
                    const provider = str(payload['provider'], 'aws');
                    const raw      = await callLlmSafe(callLlm, buildIacSecurityPrompt(tfRead.output, provider), 'You are a cloud security engineer.');
                    findings = parseIacSecurityFindings(raw);
                }
            }
            const criticalCount = findings.filter((f) => f.severity === 'critical').length;
            return safeJson({
                valid, exit_code: result.exitCode,
                security_findings: findings, critical_count: criticalCount,
                finding_count: findings.length,
                summary: `Terraform ${valid ? 'valid' : 'invalid'}. Security: ${criticalCount} critical, ${findings.length} total finding(s).`,
            });
        }

        // ====================================================================
        // workspace_devops_tf_generate
        // payload: description (required), provider?, region?, environment?, output_dir?
        // ====================================================================
        case 'workspace_devops_tf_generate': {
            const description = str(payload['description']);
            if (!description) return { ok: false, output: '', errorOutput: 'description is required' };
            const provider    = str(payload['provider'], 'aws');
            const region      = str(payload['region']);
            const environment = str(payload['environment']);
            const outputDir   = str(payload['output_dir'], 'infra');
            const prompt      = buildTfGeneratePrompt({ description, provider, region, environment });
            const llmRaw      = await callLlmSafe(callLlm, prompt, 'You are a senior DevOps engineer. Return valid HCL only.');
            const files       = parseTfGenerateOutput(llmRaw);
            const written: string[] = [];
            for (const f of files) {
                const fp = `${outputDir}/${f.filename}`;
                await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                written.push(fp);
            }
            return safeJson({
                provider, region, environment,
                files_written: written, file_count: written.length,
                summary: `Generated ${written.length} Terraform file(s) in ${outputDir}/ for ${provider}.`,
            });
        }

        // ====================================================================
        // workspace_devops_k8s_deploy  [HIGH RISK]
        // payload: manifest_path? | manifest_dir?, namespace?, dry_run?
        // ====================================================================
        case 'workspace_devops_k8s_deploy': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const manifestPath = str(payload['manifest_path']);
            const manifestDir  = str(payload['manifest_dir'], workspaceDir);
            const namespace    = str(payload['namespace'], 'default');
            const dryRun       = payload['dry_run'] === true;
            const target       = manifestPath || manifestDir;
            const args         = [
                'kubectl', 'apply', '-f', target, '-n', namespace,
                ...(dryRun ? ['--dry-run=client'] : []),
            ];
            const result = await runCommand(args, workspaceDir, 120_000);
            const ok     = result.exitCode === 0;
            return safeJson({
                ok, namespace, dry_run: dryRun, exit_code: result.exitCode,
                output: result.stdout.slice(0, 2000),
                summary: ok
                    ? `Deployed to namespace "${namespace}"${dryRun ? ' (dry run)' : ''}.`
                    : `kubectl apply failed: ${result.stderr.slice(0, 200)}`,
            });
        }

        // ====================================================================
        // workspace_devops_k8s_rollback  [HIGH RISK]
        // payload: deployment (required), namespace?
        // ====================================================================
        case 'workspace_devops_k8s_rollback': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const deployment = str(payload['deployment']);
            if (!deployment) return { ok: false, output: '', errorOutput: 'deployment is required' };
            const namespace  = str(payload['namespace'], 'default');
            const result     = await runCommand(
                ['kubectl', 'rollout', 'undo', `deployment/${deployment}`, '-n', namespace],
                workspaceDir, 60_000,
            );
            const ok = result.exitCode === 0;
            return safeJson({
                ok, deployment, namespace,
                output: result.stdout,
                summary: ok ? `Rolled back deployment/${deployment} in ${namespace}.` : result.stderr.slice(0, 200),
            });
        }

        // ====================================================================
        // workspace_devops_k8s_status
        // payload: namespace?, deployment?
        // ====================================================================
        case 'workspace_devops_k8s_status': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const namespace  = str(payload['namespace'], 'default');
            const deployment = str(payload['deployment']);
            const args = deployment
                ? ['kubectl', 'rollout', 'status', `deployment/${deployment}`, '-n', namespace]
                : ['kubectl', 'get', 'pods', '-n', namespace, '--no-headers'];
            const result = await runCommand(args, workspaceDir, 30_000);
            const status = deployment
                ? parseK8sRolloutStatus(result.stdout, deployment, namespace)
                : null;
            return safeJson({
                ok: result.exitCode === 0,
                namespace, deployment: deployment || null,
                status, raw: result.stdout.slice(0, 2000),
                summary: status
                    ? `${deployment}: ${status.ready ? 'ready' : 'not ready'} (${status.available}/${status.desired})`
                    : result.stdout.slice(0, 200),
            });
        }

        // ====================================================================
        // workspace_devops_k8s_logs
        // payload: pod? | deployment? (required one), namespace?, tail_lines?
        // ====================================================================
        case 'workspace_devops_k8s_logs': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const pod        = str(payload['pod']);
            const deployment = str(payload['deployment']);
            const namespace  = str(payload['namespace'], 'default');
            const tail       = num(payload['tail_lines'], 200);
            const target     = pod ? pod : `deployment/${deployment}`;
            if (!pod && !deployment) return { ok: false, output: '', errorOutput: 'pod or deployment is required' };
            const result  = await runCommand(
                ['kubectl', 'logs', target, '-n', namespace, `--tail=${tail}`, '--timestamps'],
                workspaceDir, 30_000,
            );
            const logs    = result.stdout;
            let analysis  = null;
            if (callLlm && logs.length > 100) {
                const appName = pod || deployment;
                const raw     = await callLlmSafe(callLlm, buildK8sLogAnalysisPrompt(logs, appName), 'You are a senior SRE.');
                analysis      = parseLogAnalysis(raw);
            }
            return safeJson({
                ok: result.exitCode === 0,
                target, namespace, lines_fetched: logs.split('\n').length,
                logs: logs.slice(-3000),
                analysis,
                summary: analysis
                    ? `Logs analysed: ${analysis.errorCount} error(s), severity ${analysis.severity}. Root cause: ${analysis.rootCause}`
                    : `Fetched ${logs.split('\n').length} log lines from ${target}.`,
            });
        }

        // ====================================================================
        // workspace_devops_k8s_generate
        // payload: description (required), app_name, image, namespace?, port?,
        //          replicas?, ingress?, environment?, output_dir?
        // ====================================================================
        case 'workspace_devops_k8s_generate': {
            const description = str(payload['description']);
            const appName     = str(payload['app_name'], 'my-app');
            const image       = str(payload['image'], `${appName}:latest`);
            const namespace   = str(payload['namespace'], 'default');
            const port        = typeof payload['port']     === 'number' ? payload['port']     : 8080;
            const replicas    = typeof payload['replicas'] === 'number' ? payload['replicas'] : 2;
            const ingress     = payload['ingress'] === true;
            const environment = str(payload['environment'], 'production');
            const outputDir   = str(payload['output_dir'], 'k8s');
            const prompt      = buildK8sGeneratePrompt({ description, appName, image, namespace, port, replicas, ingress, environment });
            const llmRaw      = await callLlmSafe(callLlm, prompt, 'You are a senior Kubernetes engineer. Return valid YAML only.');
            const manifests   = parseK8sManifests(llmRaw);
            const written: string[] = [];
            for (const m of manifests) {
                const fp = `${outputDir}/${m.filename}`;
                await executeAction('workspace_write_file', { file_path: fp, content: m.content });
                written.push(fp);
            }
            return safeJson({
                app_name: appName, image, namespace, replicas, port,
                files_written: written, file_count: written.length,
                summary: `Generated ${written.length} K8s manifest(s) for ${appName} in ${outputDir}/.`,
            });
        }

        // ====================================================================
        // workspace_devops_docker_build
        // payload: image_name (required), tag?, registry?, dockerfile?, build_args?
        // ====================================================================
        case 'workspace_devops_docker_build': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const imageName  = str(payload['image_name']);
            if (!imageName) return { ok: false, output: '', errorOutput: 'image_name is required' };
            const tag        = str(payload['tag'], 'latest');
            const registry   = str(payload['registry']);
            const dockerfile = str(payload['dockerfile'], 'Dockerfile');
            const buildArgs  = typeof payload['build_args'] === 'object' && payload['build_args'] !== null
                ? payload['build_args'] as Record<string, string>
                : {};
            const { buildCmd, fullImage } = buildDockerCommands({ imageName, tag, registry, dockerfile, buildArgs });
            const result = await runCommand(buildCmd, workspaceDir, 300_000);
            const ok     = result.exitCode === 0;
            return safeJson({
                ok, image: fullImage, exit_code: result.exitCode,
                output: (result.stdout + result.stderr).slice(-2000),
                summary: ok ? `Docker image built: ${fullImage}` : `Docker build failed (exit ${result.exitCode}).`,
            });
        }

        // ====================================================================
        // workspace_devops_docker_push
        // payload: image_name (required), tag?, registry?
        // ====================================================================
        case 'workspace_devops_docker_push': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const imageName = str(payload['image_name']);
            if (!imageName) return { ok: false, output: '', errorOutput: 'image_name is required' };
            const tag       = str(payload['tag'], 'latest');
            const registry  = str(payload['registry']);
            const { tagCmd, pushCmd, fullImage } = buildDockerCommands({ imageName, tag, registry });
            if (tagCmd) await runCommand(tagCmd, workspaceDir, 30_000);
            const result = await runCommand(pushCmd, workspaceDir, 300_000);
            const ok     = result.exitCode === 0;
            return safeJson({
                ok, image: fullImage, exit_code: result.exitCode,
                summary: ok ? `Pushed ${fullImage} to registry.` : `Docker push failed (exit ${result.exitCode}).`,
            });
        }

        // ====================================================================
        // workspace_devops_pipeline_trigger  [HIGH RISK]
        // payload: pipeline (required), ref?, provider? (github_actions|gitlab_ci)
        // ====================================================================
        case 'workspace_devops_pipeline_trigger': {
            const pipeline = str(payload['pipeline']);
            const ref      = str(payload['ref'], 'main');
            const provider = str(payload['provider'], 'github_actions');
            if (!pipeline) return { ok: false, output: '', errorOutput: 'pipeline is required' };
            // Trigger via connector
            const connResult = await executeAction('workspace_connector_test', {
                connector: provider, action: 'trigger_pipeline',
                pipeline, ref,
            });
            return safeJson({
                ok: connResult.ok, pipeline, ref, provider,
                summary: connResult.ok
                    ? `Pipeline "${pipeline}" triggered on ${provider} (ref: ${ref}).`
                    : `Pipeline trigger failed: ${connResult.errorOutput ?? 'unknown error'}`,
            });
        }

        // ====================================================================
        // workspace_devops_pipeline_status
        // payload: pipeline (required), run_id?, provider?
        // ====================================================================
        case 'workspace_devops_pipeline_status': {
            const pipeline = str(payload['pipeline']);
            const runId    = str(payload['run_id']);
            const provider = str(payload['provider'], 'github_actions');
            if (!pipeline) return { ok: false, output: '', errorOutput: 'pipeline is required' };
            const connResult = await executeAction('workspace_ci_status_poll', {
                connector: provider, pipeline, run_id: runId || undefined,
            });
            return safeJson({
                ok: connResult.ok, pipeline, run_id: runId, provider,
                raw: connResult.output,
                summary: connResult.ok ? connResult.output.slice(0, 200) : 'Status check failed.',
            });
        }

        // ====================================================================
        // workspace_devops_incident_triage
        // payload: log_source? (file_path | raw_logs), service_name, alert_description?
        // ====================================================================
        case 'workspace_devops_incident_triage': {
            const serviceName      = str(payload['service_name'], 'unknown-service');
            const alertDescription = str(payload['alert_description']);
            const logFilePath      = str(payload['log_path']);
            let   rawLogs          = str(payload['raw_logs']);
            if (!rawLogs && logFilePath) {
                const fileResult = await executeAction('workspace_read_file', { file_path: logFilePath });
                rawLogs = fileResult.ok ? fileResult.output : '';
            }
            if (!rawLogs && !alertDescription)
                return { ok: false, output: '', errorOutput: 'raw_logs or log_path or alert_description is required' };
            const prompt = rawLogs
                ? buildK8sLogAnalysisPrompt(rawLogs, serviceName)
                : `Triage this incident alert for ${serviceName}: ${alertDescription}. Return JSON with rootCause, remediations, severity, affectedDeps, errorCount.`;
            const llmRaw  = await callLlmSafe(callLlm, prompt, 'You are a senior SRE conducting incident triage.');
            const analysis = rawLogs ? parseLogAnalysis(llmRaw) : { rootCause: llmRaw.slice(0, 200), remediations: [], severity: 'medium' as const, affectedDeps: [], errorCount: 0 };
            return safeJson({
                service_name: serviceName,
                severity: analysis.severity,
                root_cause: analysis.rootCause,
                affected_deps: analysis.affectedDeps,
                remediations: analysis.remediations,
                error_count: analysis.errorCount,
                summary: `Incident triage for ${serviceName}: ${analysis.severity} severity. Root cause: ${analysis.rootCause}`,
            });
        }

        // ====================================================================
        // workspace_devops_standup_report
        // payload: bot_name?, team_name?, recent_deployments?, incidents?,
        //          pipeline_pass_rate?, infra_changes?
        // ====================================================================
        case 'workspace_devops_standup_report': {
            const botName      = str(payload['bot_name'],  'DevOps Agent');
            const teamName     = str(payload['team_name'], 'Engineering');
            const deployments  = Array.isArray(payload['recent_deployments']) ? (payload['recent_deployments'] as string[]) : [];
            const incidents    = Array.isArray(payload['incidents'])           ? (payload['incidents']           as string[]) : [];
            const passRate     = typeof payload['pipeline_pass_rate'] === 'number' ? payload['pipeline_pass_rate'] : null;
            const infraChanges = str(payload['infra_changes']);
            const prompt = [
                `Generate a professional DevOps standup for ${botName} presenting to ${teamName}.`,
                deployments.length > 0 ? `Recent deployments: ${deployments.join(', ')}` : '',
                incidents.length > 0   ? `Active incidents: ${incidents.join(', ')}`     : 'No active incidents.',
                passRate !== null       ? `Pipeline pass rate: ${passRate}%`              : '',
                infraChanges           ? `Infrastructure changes: ${infraChanges}`        : '',
                ``,
                `Format: Yesterday | Today | Blockers | Infrastructure health`,
            ].filter(Boolean).join('\n');
            const spokenText = (await callLlmSafe(callLlm, prompt, 'You are a DevOps agent reporting status. Be concise and data-driven.'))
                || `${botName} standup: ${deployments.length} deployment(s), ${incidents.length} incident(s).`;
            // Post the standup to the team channel when requested. Routine → no
            // gate; fail-safe (a post failure still returns the summary).
            let posted: { posted: boolean; channel?: string; reason?: string } | undefined;
            if (payload['post'] === true) {
                const channel = str(payload['channel']).trim();
                if (!channel) {
                    posted = { posted: false, reason: 'post=true requires payload.channel' };
                } else {
                    const r = await executeAction('workspace_slack_notify', { channel, message: spokenText });
                    posted = r.ok ? { posted: true, channel } : { posted: false, reason: r.errorOutput ?? 'slack post failed' };
                }
            }
            return safeJson({
                bot_name: botName, team_name: teamName,
                deployments, incidents, pipeline_pass_rate: passRate,
                spoken_text: spokenText,
                summary: `DevOps standup generated for ${teamName}.`,
                ...(posted ? { posted } : {}),
            });
        }

        // ====================================================================
        // workspace_devops_helm_install  [HIGH RISK]
        // payload: release_name (required), chart (required), namespace?,
        //          version?, values_files?, set_values?, atomic?, timeout?
        // ====================================================================
        case 'workspace_devops_helm_install': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const releaseName = str(payload['release_name']);
            const chart       = str(payload['chart']);
            if (!releaseName) return { ok: false, output: '', errorOutput: 'release_name is required' };
            if (!chart)       return { ok: false, output: '', errorOutput: 'chart is required' };
            const namespace   = str(payload['namespace'], 'default');
            const version     = str(payload['version']);
            const valuesFiles = Array.isArray(payload['values_files'])
                ? (payload['values_files'] as string[]) : [];
            const setValues   = typeof payload['set_values'] === 'object' && payload['set_values'] !== null
                ? (payload['set_values'] as Record<string, string>) : {};
            const atomic      = payload['atomic'] !== false;
            const timeout     = str(payload['timeout'], '5m0s');
            const dryRun      = payload['dry_run'] === true;
            const args        = buildHelmInstallArgs({
                releaseName, chart, namespace,
                version:     version || undefined,
                valuesFiles: valuesFiles.length > 0 ? valuesFiles : undefined,
                setValues:   Object.keys(setValues).length > 0 ? setValues : undefined,
                atomic, wait: true, timeout,
                createNamespace: payload['create_namespace'] === true,
                dryRun,
            });
            const result = await runCommand(args, workspaceDir, 300_000);
            const ok     = result.exitCode === 0;
            return safeJson({
                ok, release_name: releaseName, chart, namespace, dry_run: dryRun,
                exit_code: result.exitCode,
                output: result.stdout.slice(0, 2000),
                summary: ok
                    ? `Helm release "${releaseName}" deployed to namespace "${namespace}"${dryRun ? ' (dry-run)' : ''}.`
                    : `Helm install failed: ${result.stderr.slice(0, 300)}`,
            });
        }

        // ====================================================================
        // workspace_devops_helm_rollback  [HIGH RISK]
        // payload: release_name (required), namespace?, revision?
        // ====================================================================
        case 'workspace_devops_helm_rollback': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const releaseName = str(payload['release_name']);
            if (!releaseName) return { ok: false, output: '', errorOutput: 'release_name is required' };
            const namespace   = str(payload['namespace'], 'default');
            const revision    = typeof payload['revision'] === 'number' ? payload['revision'] : undefined;
            const args        = buildHelmRollbackArgs({
                releaseName, namespace, revision, wait: true,
            });
            const result = await runCommand(args, workspaceDir, 180_000);
            const ok     = result.exitCode === 0;
            return safeJson({
                ok, release_name: releaseName, namespace, revision: revision ?? 'previous',
                output: result.stdout,
                summary: ok
                    ? `Helm release "${releaseName}" rolled back to ${revision !== undefined ? `revision ${revision}` : 'previous version'}.`
                    : `Helm rollback failed: ${result.stderr.slice(0, 300)}`,
            });
        }

        // ====================================================================
        // workspace_devops_helm_diff
        // payload: release_name (required), chart (required), namespace?,
        //          version?, values_files?, set_values?
        // ====================================================================
        case 'workspace_devops_helm_diff': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const releaseName = str(payload['release_name']);
            const chart       = str(payload['chart']);
            if (!releaseName) return { ok: false, output: '', errorOutput: 'release_name is required' };
            if (!chart)       return { ok: false, output: '', errorOutput: 'chart is required' };
            const namespace   = str(payload['namespace'], 'default');
            const version     = str(payload['version']);
            const valuesFiles = Array.isArray(payload['values_files'])
                ? (payload['values_files'] as string[]) : [];
            const setValues   = typeof payload['set_values'] === 'object' && payload['set_values'] !== null
                ? (payload['set_values'] as Record<string, string>) : {};
            const args        = buildHelmDiffArgs({
                releaseName, chart, namespace,
                version:     version || undefined,
                valuesFiles: valuesFiles.length > 0 ? valuesFiles : undefined,
                setValues:   Object.keys(setValues).length > 0 ? setValues : undefined,
            });
            const result = await runCommand(args, workspaceDir, 60_000);
            const diff   = parseHelmDiff(result.stdout + result.stderr);
            return safeJson({
                ok: result.exitCode === 0,
                release_name: releaseName, chart, namespace,
                has_changes:    diff.hasChanges,
                added_count:    diff.addedCount,
                removed_count:  diff.removedCount,
                modified_count: diff.modifiedCount,
                summary:        diff.summary,
                diff:           diff.rawDiff.slice(0, 3000),
            });
        }

        // ====================================================================
        // workspace_devops_helm_generate
        // payload: app_name (required), description (required), image (required),
        //          port?, replicas?, namespace?, environment?, ingress?,
        //          hpa?, pdb?, output_dir?
        // ====================================================================
        case 'workspace_devops_helm_generate': {
            const appName     = str(payload['app_name']);
            const description = str(payload['description']);
            const image       = str(payload['image']);
            if (!appName)     return { ok: false, output: '', errorOutput: 'app_name is required' };
            if (!description) return { ok: false, output: '', errorOutput: 'description is required' };
            if (!image)       return { ok: false, output: '', errorOutput: 'image is required' };
            const port        = typeof payload['port']     === 'number' ? payload['port']     : 8080;
            const replicas    = typeof payload['replicas'] === 'number' ? payload['replicas'] : 2;
            const namespace   = str(payload['namespace'],   'default');
            const environment = str(payload['environment'], 'production');
            const ingress     = payload['ingress'] === true;
            const hpa         = payload['hpa']     === true;
            const pdb         = payload['pdb']     === true;
            const outputDir   = str(payload['output_dir'], `helm/${appName}`);
            const prompt      = buildHelmChartPrompt({ appName, description, image, port, replicas, namespace, environment, ingress, hpa, pdb });
            const llmRaw      = await callLlmSafe(callLlm, prompt, 'You are a senior Kubernetes/Helm engineer. Return valid JSON only.');
            const files       = parseHelmChartOutput(llmRaw);
            const written: string[] = [];
            for (const f of files) {
                const fp = `${outputDir}/${f.filename}`;
                await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                written.push(fp);
            }
            return safeJson({
                app_name: appName, image, namespace, replicas, port,
                files_written: written, file_count: written.length,
                summary: `Generated ${written.length} Helm chart file(s) for "${appName}" in ${outputDir}/.`,
            });
        }

        // ====================================================================
        // workspace_devops_dora_metrics
        // payload: deployments (required — array of DeploymentRecord),
        //          period_days? (default: 30)
        // ====================================================================
        case 'workspace_devops_dora_metrics': {
            const rawDeploys = payload['deployments'];
            if (!Array.isArray(rawDeploys)) return { ok: false, output: '', errorOutput: 'deployments array is required' };
            const periodDays  = typeof payload['period_days'] === 'number' ? payload['period_days'] : 30;
            const metrics     = computeDoraMetrics(rawDeploys as Parameters<typeof computeDoraMetrics>[0], periodDays);
            return safeJson({
                overall_level:       metrics.overallLevel,
                deploy_freq_level:   metrics.deploymentFrequency.level,
                lead_time_level:     metrics.leadTimeForChanges.level,
                cfr_level:           metrics.changeFailureRate.level,
                mttr_level:          metrics.mttr.level,
                deploys_per_day:     metrics.deploymentFrequency.deploysPerDay,
                lead_time_median_min: metrics.leadTimeForChanges.medianMinutes,
                cfr_pct:             metrics.changeFailureRate.percentage,
                mttr_median_min:     metrics.mttr.medianMinutes,
                sample_size:         metrics.sampleSize,
                period_days:         metrics.periodDays,
                formatted_report:    metrics.formattedReport,
                summary: `DORA: ${metrics.overallLevel.toUpperCase()} — DF ${metrics.deploymentFrequency.level}, LT ${metrics.leadTimeForChanges.level}, CFR ${metrics.changeFailureRate.level}, MTTR ${metrics.mttr.level}`,
            });
        }

        // ====================================================================
        // workspace_devops_deploy_verify
        // payload: deployment (required), namespace?, health_checks? (array),
        //          max_wait_seconds?, auto_rollback? (default: false)
        //          use_helm? (default: false), release_name?
        // ====================================================================
        case 'workspace_devops_deploy_verify': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const deployment = str(payload['deployment']);
            if (!deployment) return { ok: false, output: '', errorOutput: 'deployment is required' };
            const namespace      = str(payload['namespace'], 'default');
            const maxWait        = typeof payload['max_wait_seconds'] === 'number' ? payload['max_wait_seconds'] : 180;
            const autoRollback   = payload['auto_rollback'] === true;
            const useHelm        = payload['use_helm'] === true;
            const releaseName    = str(payload['release_name'], deployment);
            const started        = Date.now();

            // 1. Poll K8s readiness
            const k8sReady = await pollK8sReadiness({
                deployment, namespace, workspaceDir, runCommand, maxWaitSeconds: maxWait,
            });

            // 2. Run HTTP health checks
            const rawHealthChecks = Array.isArray(payload['health_checks'])
                ? (payload['health_checks'] as Array<{ endpoint: string; expected_status?: number; body_contains?: string; timeout_ms?: number }>)
                : [];
            const hcConfigs = rawHealthChecks.map((hc) => ({
                endpoint:             hc.endpoint,
                expectedStatusCode:   hc.expected_status,
                expectedBodyContains: hc.body_contains,
                timeoutMs:            hc.timeout_ms,
            }));
            const healthChecks = hcConfigs.length > 0
                ? await runHttpHealthChecks(hcConfigs, fetch)
                : [];

            // 3. Determine overall health
            const allHealthy   = k8sReady.ready && healthChecks.every((h) => h.healthy);
            let rolledBack     = false;
            let rollbackReason = '';
            let rollbackOutput = '';

            if (!allHealthy && autoRollback) {
                rollbackReason = k8sReady.ready ? 'HTTP health checks failed' : 'K8s readiness timeout';
                const rb = useHelm
                    ? await triggerHelmRollback({ releaseName, namespace, workspaceDir, runCommand, reason: rollbackReason })
                    : await triggerRollback({ deployment, namespace, workspaceDir, runCommand, reason: rollbackReason });
                rolledBack     = rb.ok;
                rollbackOutput = rb.output;
            }

            const durationSeconds = Math.round((Date.now() - started) / 1000);
            const verifyResult = {
                healthy: allHealthy, healthChecks, k8sReadiness: k8sReady,
                rolledBack, rollbackReason: rollbackReason || undefined,
                rollbackOutput: rollbackOutput || undefined,
                durationSeconds, report: '',
            };
            verifyResult.report = formatVerificationReport(verifyResult);

            return safeJson({
                healthy:          allHealthy,
                k8s_ready:        k8sReady.ready,
                http_checks_ok:   healthChecks.every((h) => h.healthy),
                rolled_back:      rolledBack,
                rollback_reason:  rollbackReason || null,
                duration_seconds: durationSeconds,
                report:           verifyResult.report,
                summary: allHealthy
                    ? `Deployment "${deployment}" is healthy after ${durationSeconds}s.`
                    : `Deployment "${deployment}" is UNHEALTHY after ${durationSeconds}s.${rolledBack ? ' Auto-rollback triggered.' : ''}`,
            });
        }

        // ====================================================================
        // workspace_devops_env_promote
        // payload: release_name (required), from_environment (required),
        //          to_environment (required), chart?, image_tag?,
        //          values_base_dir? (default: 'helm/envs'), namespace?
        // ====================================================================
        case 'workspace_devops_env_promote': {
            const releaseName   = str(payload['release_name']);
            const fromEnv       = str(payload['from_environment']);
            const toEnv         = str(payload['to_environment']);
            if (!releaseName) return { ok: false, output: '', errorOutput: 'release_name is required' };
            if (!fromEnv)     return { ok: false, output: '', errorOutput: 'from_environment is required' };
            if (!toEnv)       return { ok: false, output: '', errorOutput: 'to_environment is required' };
            const imageTag      = str(payload['image_tag'], 'latest');
            const valuesBaseDir = str(payload['values_base_dir'], 'helm/envs');
            const namespace     = str(payload['namespace'], toEnv);
            const replicas      = typeof payload['replicas'] === 'number' ? payload['replicas'] : 2;
            const ingressHost   = str(payload['ingress_host']);
            const resourceCpu   = str(payload['resource_cpu']);
            const resourceMem   = str(payload['resource_memory']);

            // Generate values override file for target environment
            const valuesContent = buildEnvValuesContent({
                environment: toEnv,
                replicas,
                imageTag,
                ingressHost: ingressHost || undefined,
                resources: (resourceCpu && resourceMem)
                    ? { cpu: resourceCpu, memory: resourceMem }
                    : undefined,
            });
            const valuesFilePath = `${valuesBaseDir}/${toEnv}/values.yaml`;
            await executeAction('workspace_write_file', { file_path: valuesFilePath, content: valuesContent });

            return safeJson({
                release_name:     releaseName,
                from_environment: fromEnv,
                to_environment:   toEnv,
                image_tag:        imageTag,
                namespace,
                values_file:      valuesFilePath,
                summary: `Promotion from "${fromEnv}" → "${toEnv}" prepared. Values written to ${valuesFilePath}. Run helm_install with values_files: ["${valuesFilePath}"] to complete.`,
            });
        }

        // ====================================================================
        // workspace_devops_release_notes
        // payload: version (required), previous_version (required),
        //          git_log_output? | (from_ref + to_ref for auto-fetch),
        //          draft?, prerelease?, target_branch?
        // ====================================================================
        case 'workspace_devops_release_notes': {
            const version         = str(payload['version']);
            const previousVersion = str(payload['previous_version']);
            if (!version)         return { ok: false, output: '', errorOutput: 'version is required' };
            if (!previousVersion) return { ok: false, output: '', errorOutput: 'previous_version is required' };

            // Fetch git log if not provided
            let gitLogRaw = str(payload['git_log_output']);
            if (!gitLogRaw && runCommand) {
                const fromRef = str(payload['from_ref'], previousVersion);
                const toRef   = str(payload['to_ref'], 'HEAD');
                const logArgs = buildGitLogCommand(fromRef, toRef);
                const result  = await runCommand(logArgs, workspaceDir, 30_000);
                gitLogRaw     = result.stdout;
            }
            const commits  = parseGitLog(gitLogRaw);
            const notes    = buildReleaseNotes({ version, previousVersion, commits });
            const ghPayload = buildGitHubReleasePayload({
                version, notes,
                draft:        payload['draft']      === true,
                prerelease:   payload['prerelease']  === true,
                targetBranch: str(payload['target_branch']) || undefined,
            });
            return safeJson({
                version,         previous_version: previousVersion,
                total_commits:   notes.totalCommits,
                breaking_count:  notes.breaking.length,
                feature_count:   notes.features.length,
                fix_count:       notes.bugFixes.length,
                formatted_markdown: notes.formattedMarkdown,
                github_payload:  ghPayload,
                summary: `Release notes for ${version}: ${notes.totalCommits} commit(s), ${notes.breaking.length} breaking, ${notes.features.length} feature(s), ${notes.bugFixes.length} fix(es).`,
            });
        }

        // ====================================================================
        // workspace_devops_image_scan
        // payload: image (required), scanner? (trivy|grype|snyk, default: trivy),
        //          severity_filter? (array), ignore_unfixed?
        // ====================================================================
        case 'workspace_devops_image_scan': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const image    = str(payload['image']);
            if (!image)    return { ok: false, output: '', errorOutput: 'image is required' };
            const scanner  = (str(payload['scanner'], 'trivy')) as 'trivy' | 'grype' | 'snyk';
            const ignoreUnfixed = payload['ignore_unfixed'] === true;

            let scanArgs: string[];
            if (scanner === 'trivy') {
                scanArgs = buildTrivyScanArgs(image, { ignoreUnfixed });
            } else if (scanner === 'grype') {
                scanArgs = buildGrypeScanArgs(image, { onlyFixed: ignoreUnfixed });
            } else {
                scanArgs = buildSnykScanArgs(image);
            }

            const result = await runCommand(scanArgs, workspaceDir, 300_000);
            let scanResult;
            if (scanner === 'trivy') {
                scanResult = parseTrivyScanOutput(result.stdout, image);
            } else if (scanner === 'grype') {
                scanResult = parseGrypeScanOutput(result.stdout, image);
            } else {
                scanResult = parseSnykScanOutput(result.stdout, image);
            }

            // LLM remediation advice for critical/high findings
            let remediation = null;
            if (callLlm && (scanResult.critical > 0 || scanResult.high > 0)) {
                const prompt = buildScanRemediationPrompt(scanResult);
                const raw    = await callLlmSafe(callLlm, prompt, 'You are a container security engineer. Return JSON only.');
                remediation  = parseScanRemediation(raw);
            }

            return safeJson({
                image, scanner,
                total:       scanResult.total,
                critical:    scanResult.critical,
                high:        scanResult.high,
                medium:      scanResult.medium,
                low:         scanResult.low,
                fixable:     scanResult.fixable,
                risk_level:  scanResult.riskLevel,
                report:      scanResult.formattedReport,
                remediation,
                summary: `Image scan (${scanner}): ${scanResult.total} finding(s) — ${scanResult.critical} critical, ${scanResult.high} high, ${scanResult.medium} medium. Risk: ${scanResult.riskLevel}.`,
            });
        }

        // ====================================================================
        // workspace_devops_pipeline_generate
        // payload: provider (required), repo_name (required), language (required),
        //          description?, jobs?, triggers?, output_dir?
        // ====================================================================
        case 'workspace_devops_pipeline_generate': {
            const provider  = (str(payload['provider'], 'github_actions')) as PipelineProvider;
            const repoName  = str(payload['repo_name']);
            const language  = str(payload['language'], 'Node.js');
            if (!repoName) return { ok: false, output: '', errorOutput: 'repo_name is required' };
            const description = str(payload['description'], `CI/CD pipeline for ${repoName}`);
            const rawJobs     = Array.isArray(payload['jobs']) ? payload['jobs'] : null;
            const jobs        = rawJobs ? (rawJobs as PipelineJobSpec[]) : defaultCiJobs(language);
            const rawTriggers = typeof payload['triggers'] === 'object' && payload['triggers'] !== null
                ? (payload['triggers'] as PipelineTriggerConfig)
                : { onPush: true, onPr: true, branches: ['main'] } satisfies PipelineTriggerConfig;
            const outputDir   = str(payload['output_dir'], '.');

            const prompt   = buildPipelinePrompt({ provider, repoName, description, language, jobs, triggers: rawTriggers });
            const llmRaw   = await callLlmSafe(callLlm, prompt, 'You are a senior DevOps engineer. Return valid JSON only.');
            const parsed   = parsePipelineOutput(llmRaw, provider);
            const written: string[] = [];
            for (const f of parsed.files) {
                const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                written.push(fp);
            }
            return safeJson({
                provider, repo_name: repoName, language,
                files_written: written, file_count: written.length,
                summary: written.length > 0
                    ? `Generated ${written.length} pipeline config(s) for ${provider}: ${written.join(', ')}`
                    : `No pipeline files generated for ${provider}.`,
            });
        }

        // ====================================================================
        // workspace_devops_cost_estimate
        // payload: working_dir? (default: workspaceDir), tf_vars_file?,
        //          currency? (default: USD), plan_file?
        // ====================================================================
        case 'workspace_devops_cost_estimate': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const tfDir      = str(payload['working_dir'], workspaceDir);
            const tfVarsFile = str(payload['tf_vars_file']);
            const currency   = str(payload['currency'], 'USD');
            const args       = buildInfracostBreakdownArgs({
                tfDir,
                tfVarsFile: tfVarsFile || undefined,
                currency:   currency || undefined,
            });
            const result  = await runCommand(args, tfDir, 180_000);
            if (result.exitCode !== 0) {
                return safeJson({
                    ok: false, exit_code: result.exitCode,
                    error: result.stderr.slice(0, 500),
                    summary: `Infracost failed (exit ${result.exitCode}): ${result.stderr.slice(0, 200)}`,
                });
            }
            const estimate = parseInfracostOutput(result.stdout);
            if (!estimate) {
                return safeJson({
                    ok: false, raw: result.stdout.slice(0, 500),
                    summary: 'Failed to parse Infracost output.',
                });
            }
            return safeJson({
                ok: true,
                total_monthly_cost: estimate.totalMonthlyCost,
                past_monthly_cost:  estimate.pastMonthlyCost,
                diff_monthly_cost:  estimate.diffMonthlyCost,
                currency:           estimate.currency,
                project_count:      estimate.projects.length,
                report:             estimate.formattedReport,
                summary: `Estimated cost: ${estimate.currency} ${estimate.totalMonthlyCost.toFixed(2)}/month${
                    estimate.diffMonthlyCost !== undefined
                        ? ` (${estimate.diffMonthlyCost >= 0 ? '+' : ''}${estimate.diffMonthlyCost.toFixed(2)} change)`
                        : ''
                }.`,
            });
        }

        // ====================================================================
        // workspace_devops_drift_check
        // payload: working_dir? (default: workspaceDir), tf_vars_file?, plan_file?
        // ====================================================================
        case 'workspace_devops_drift_check': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const tfDir      = str(payload['working_dir'], workspaceDir);
            const tfVarsFile = str(payload['tf_vars_file']);
            const planFile   = str(payload['plan_file']);
            const args       = buildTfDriftCheckArgs({
                tfDir,
                tfVarsFile: tfVarsFile || undefined,
                planFile:   planFile   || undefined,
            });
            const result = await runCommand(args, tfDir, 180_000);
            const drift  = parseTfDriftOutput(result.stdout + result.stderr, result.exitCode);
            const report = formatDriftReport(drift);
            return safeJson({
                has_drift:     drift.hasDrift,
                add_count:     drift.addCount,
                change_count:  drift.changeCount,
                destroy_count: drift.destroyCount,
                exit_code:     result.exitCode,
                report,
                summary: drift.summary,
            });
        }

        // ====================================================================
        // workspace_devops_secret_rotate
        // payload: secret_name (required), backend (required: kubernetes|vault|aws),
        //          namespace? (k8s), new_value?, key_values? (object),
        //          aws_region?, vault_mount?
        // ====================================================================
        case 'workspace_devops_secret_rotate': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const secretName = str(payload['secret_name']);
            const backend    = (str(payload['backend'], 'kubernetes')) as 'kubernetes' | 'vault' | 'aws_secrets_manager';
            if (!secretName) return { ok: false, output: '', errorOutput: 'secret_name is required' };
            const results: SecretRotationResult[] = [];

            if (backend === 'kubernetes') {
                const namespace  = str(payload['namespace'], 'default');
                const keyValues  = typeof payload['key_values'] === 'object' && payload['key_values'] !== null
                    ? (payload['key_values'] as Record<string, string>) : {};
                const newValue   = str(payload['new_value']);

                if (Object.keys(keyValues).length === 0 && newValue) {
                    keyValues['value'] = newValue;
                }
                if (Object.keys(keyValues).length === 0) {
                    return { ok: false, output: '', errorOutput: 'key_values or new_value is required for kubernetes backend' };
                }

                // kubectl create secret --dry-run | kubectl apply
                const dryRunArgs = buildK8sSecretApplyArgs({ name: secretName, namespace, data: keyValues });
                const dryRunRes  = await runCommand(dryRunArgs, workspaceDir, 15_000);
                let ok = dryRunRes.exitCode === 0;
                if (ok) {
                    const applyRes = await runCommand(['kubectl', 'apply', '-f', '-'], workspaceDir, 15_000);
                    ok = applyRes.exitCode === 0;
                }

                // Annotate with rotation timestamp
                await runCommand(
                    buildK8sAnnotateSecretArgs({ name: secretName, namespace, annotations: { 'agentfarm.dev/last-rotated': new Date().toISOString() } }),
                    workspaceDir, 10_000,
                ).catch(() => null);

                results.push({ backend: 'kubernetes', secretName, namespace, ok, output: dryRunRes.stdout, summary: ok ? `K8s secret "${secretName}" rotated in namespace "${namespace}".` : `K8s secret rotation failed: ${dryRunRes.stderr.slice(0, 200)}` });

            } else if (backend === 'vault') {
                const vaultPath  = str(payload['vault_path'], secretName);
                const vaultMount = str(payload['vault_mount'], 'secret');
                const keyValues  = typeof payload['key_values'] === 'object' && payload['key_values'] !== null
                    ? (payload['key_values'] as Record<string, string>) : {};
                if (Object.keys(keyValues).length === 0) {
                    return { ok: false, output: '', errorOutput: 'key_values is required for vault backend' };
                }
                const putArgs  = buildVaultKvPutArgs({ path: vaultPath, data: keyValues, mount: vaultMount });
                const putResult = await runCommand(putArgs, workspaceDir, 30_000);
                const ok = putResult.exitCode === 0;
                // Fetch new version
                const getResult  = await runCommand(buildVaultKvGetArgs(vaultPath, vaultMount), workspaceDir, 10_000);
                const metaMatch  = getResult.stdout.match(/"version"\s*:\s*(\d+)/);
                const newVersion = metaMatch ? metaMatch[1] : undefined;
                results.push({ backend: 'vault', secretName, ok, newVersion, output: putResult.stdout, summary: ok ? `Vault secret "${vaultPath}" rotated (v${newVersion ?? '?'}).` : `Vault rotation failed: ${putResult.stderr.slice(0, 200)}` });

            } else {
                // aws_secrets_manager
                const region    = str(payload['aws_region']);
                const newValue  = str(payload['new_value']);
                if (!newValue)  return { ok: false, output: '', errorOutput: 'new_value is required for aws_secrets_manager backend' };
                const putArgs   = buildAwsPutSecretValueArgs({ secretId: secretName, secretValue: newValue, region: region || undefined });
                const putResult = await runCommand(putArgs, workspaceDir, 30_000);
                const ok        = putResult.exitCode === 0;
                results.push({ backend: 'aws_secrets_manager', secretName, ok, output: putResult.stdout, summary: ok ? `AWS secret "${secretName}" rotated.` : `AWS rotation failed: ${putResult.stderr.slice(0, 200)}` });
            }

            const report = formatRotationReport(results);
            const allOk  = results.every((r) => r.ok);
            return safeJson({
                ok: allOk, backend, secret_name: secretName,
                results, report,
                summary: allOk ? `Secret "${secretName}" rotated successfully.` : `Secret rotation failed for "${secretName}".`,
            });
        }

        // ====================================================================
        // workspace_devops_cert_renew
        // payload: cert_name (required), namespace? (default: default),
        //          check_only? (default: false)
        // ====================================================================
        case 'workspace_devops_cert_renew': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const certName  = str(payload['cert_name']);
            if (!certName)  return { ok: false, output: '', errorOutput: 'cert_name is required' };
            const namespace = str(payload['namespace'], 'default');
            const checkOnly = payload['check_only'] === true;

            // 1. Get current cert status
            const getResult  = await runCommand(buildCertGetArgs(certName, namespace), workspaceDir, 15_000);
            const certInfo   = parseCertInfo(getResult.stdout);
            const results: CertRenewalResult[] = [certInfo];

            // 2. If check_only or cert is about to expire (<30 days), trigger renewal
            const needsRenewal = certInfo.daysRemaining !== undefined && certInfo.daysRemaining < 30;

            if (!checkOnly && needsRenewal) {
                const renewResult = await runCommand(buildCertRenewArgs(certName, namespace), workspaceDir, 30_000);
                results.push({
                    ...certInfo,
                    ok:      renewResult.exitCode === 0,
                    output:  renewResult.stdout,
                    summary: renewResult.exitCode === 0
                        ? `Certificate "${certName}" renewal triggered.`
                        : `Certificate renewal failed: ${renewResult.stderr.slice(0, 200)}`,
                });
            }

            const report     = formatCertReport(results);
            const latestInfo = results[results.length - 1] ?? certInfo;

            return safeJson({
                cert_name:     certName,
                namespace,
                ok:            latestInfo.ok,
                not_after:     certInfo.notAfter ?? null,
                days_remaining: certInfo.daysRemaining ?? null,
                renewal_triggered: !checkOnly && needsRenewal,
                report,
                summary: latestInfo.summary,
            });
        }

        // ====================================================================
        // workspace_devops_aws_cli
        // payload: service (required), operation (required), flags?, region?,
        //          profile?, allow_destructive? (default: false)
        // ====================================================================
        case 'workspace_devops_aws_cli': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const service   = str(payload['service']);
            const operation = str(payload['operation']);
            if (!service)   return { ok: false, output: '', errorOutput: 'service is required' };
            if (!operation) return { ok: false, output: '', errorOutput: 'operation is required' };

            if (isDestructiveAws(operation) && payload['allow_destructive'] !== true) {
                return { ok: false, output: '', errorOutput: `Operation "${operation}" is destructive. Set allow_destructive: true to proceed.` };
            }

            const flags  = typeof payload['flags'] === 'object' && payload['flags'] !== null
                ? (payload['flags'] as Record<string, string>) : {};
            const args   = buildAwsCliArgs({
                service, operation,
                flags,
                region:  str(payload['region']) || undefined,
                profile: str(payload['profile']) || undefined,
            });
            const result = await runCommand(args, workspaceDir, 60_000);
            const parsed = parseCloudCliOutput(result.stdout, 'aws', service, operation);
            return safeJson({
                ok:        result.exitCode === 0,
                provider:  'aws', service, operation,
                parsed:    parsed.parsed,
                raw:       result.stdout.slice(0, 4000),
                exit_code: result.exitCode,
                summary:   summariseCloudResult({ ...parsed, ok: result.exitCode === 0 }),
            });
        }

        // ====================================================================
        // workspace_devops_az_cli
        // payload: group (required), subcommand (required), flags?,
        //          subscription?, allow_destructive? (default: false)
        // ====================================================================
        case 'workspace_devops_az_cli': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const group      = str(payload['group']);
            const subcommand = str(payload['subcommand']);
            if (!group)      return { ok: false, output: '', errorOutput: 'group is required' };
            if (!subcommand) return { ok: false, output: '', errorOutput: 'subcommand is required' };

            if (isDestructiveAz(subcommand) && payload['allow_destructive'] !== true) {
                return { ok: false, output: '', errorOutput: `Subcommand "${subcommand}" is destructive. Set allow_destructive: true to proceed.` };
            }

            const flags = typeof payload['flags'] === 'object' && payload['flags'] !== null
                ? (payload['flags'] as Record<string, string>) : {};
            const args  = buildAzCliArgs({
                group, subcommand, flags,
                subscription: str(payload['subscription']) || undefined,
            });
            const result = await runCommand(args, workspaceDir, 60_000);
            const parsed = parseCloudCliOutput(result.stdout, 'azure', group, subcommand);
            return safeJson({
                ok:        result.exitCode === 0,
                provider:  'azure', group, subcommand,
                parsed:    parsed.parsed,
                raw:       result.stdout.slice(0, 4000),
                exit_code: result.exitCode,
                summary:   summariseCloudResult({ ...parsed, ok: result.exitCode === 0 }),
            });
        }

        // ====================================================================
        // workspace_devops_gcloud_cli
        // payload: component (required), subcommand (required), flags?,
        //          project?, zone?, region?, allow_destructive? (default: false)
        // ====================================================================
        case 'workspace_devops_gcloud_cli': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const component  = str(payload['component']);
            const subcommand = str(payload['subcommand']);
            if (!component)  return { ok: false, output: '', errorOutput: 'component is required' };
            if (!subcommand) return { ok: false, output: '', errorOutput: 'subcommand is required' };

            // subcommand may be "instances list" — check first word
            const firstWord = subcommand.split(' ')[0] ?? subcommand;
            if (isDestructiveGcloud(firstWord) && payload['allow_destructive'] !== true) {
                return { ok: false, output: '', errorOutput: `Subcommand "${subcommand}" is destructive. Set allow_destructive: true to proceed.` };
            }

            const flags = typeof payload['flags'] === 'object' && payload['flags'] !== null
                ? (payload['flags'] as Record<string, string>) : {};
            const args  = buildGcloudArgs({
                component, subcommand, flags,
                project: str(payload['project']) || undefined,
                zone:    str(payload['zone'])    || undefined,
                region:  str(payload['region'])  || undefined,
            });
            const result = await runCommand(args, workspaceDir, 60_000);
            const parsed = parseCloudCliOutput(result.stdout, 'gcp', component, subcommand);
            return safeJson({
                ok:        result.exitCode === 0,
                provider:  'gcp', component, subcommand,
                parsed:    parsed.parsed,
                raw:       result.stdout.slice(0, 4000),
                exit_code: result.exitCode,
                summary:   summariseCloudResult({ ...parsed, ok: result.exitCode === 0 }),
            });
        }

        // ====================================================================
        // workspace_devops_tf_state
        // payload: operation (required: mv|rm|import|pull|list|show|unlock|push),
        //          source?, destination?, address?, id?, lock_id?,
        //          local_state_path?, working_dir?, dry_run?
        // ====================================================================
        case 'workspace_devops_tf_state': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const operation = str(payload['operation']);
            const tfDir     = str(payload['working_dir'], workspaceDir);
            if (!operation) return { ok: false, output: '', errorOutput: 'operation is required (mv|rm|import|pull|list|show|unlock|push)' };

            switch (operation) {
                case 'mv': {
                    const source = str(payload['source']);
                    const dest   = str(payload['destination']);
                    if (!source || !dest) return { ok: false, output: '', errorOutput: 'source and destination required for mv' };
                    const args   = buildTfStateMvArgs({ source, destination: dest });
                    const result = await runCommand(args, tfDir, 60_000);
                    return safeJson({ ok: result.exitCode === 0, operation: 'mv', source, destination: dest, exit_code: result.exitCode, output: result.stdout, summary: result.exitCode === 0 ? `Moved "${source}" → "${dest}"` : result.stderr.slice(0, 200) });
                }
                case 'rm': {
                    const address = str(payload['address']);
                    if (!address) return { ok: false, output: '', errorOutput: 'address required for rm' };
                    const dryRun  = payload['dry_run'] === true;
                    const args    = buildTfStateRmArgs({ address, dryRun });
                    const result  = await runCommand(args, tfDir, 60_000);
                    return safeJson({ ok: result.exitCode === 0, operation: 'rm', address, dry_run: dryRun, exit_code: result.exitCode, output: result.stdout, summary: result.exitCode === 0 ? `Removed "${address}" from state${dryRun ? ' (dry-run)' : ''}.` : result.stderr.slice(0, 200) });
                }
                case 'import': {
                    const address = str(payload['address']);
                    const id      = str(payload['id']);
                    if (!address || !id) return { ok: false, output: '', errorOutput: 'address and id required for import' };
                    const args    = buildTfImportArgs({ address, id });
                    const result  = await runCommand(args, tfDir, 120_000);
                    return safeJson({ ok: result.exitCode === 0, operation: 'import', address, id, exit_code: result.exitCode, output: result.stdout, summary: result.exitCode === 0 ? `Imported "${id}" as "${address}".` : result.stderr.slice(0, 200) });
                }
                case 'pull': {
                    const args   = buildTfStatePullArgs();
                    const result = await runCommand(args, tfDir, 30_000);
                    const parsed = parseTfStatePull(result.stdout);
                    return safeJson({ ok: result.exitCode === 0, operation: 'pull', resource_count: parsed?.resources.length ?? 0, state: parsed, summary: parsed ? `State pulled: ${parsed.resources.length} resource(s).` : 'Failed to parse state.' });
                }
                case 'list': {
                    const address = str(payload['address']) || undefined;
                    const args    = buildTfStateListArgs(address);
                    const result  = await runCommand(args, tfDir, 30_000);
                    const items   = parseTfStateList(result.stdout);
                    return safeJson({ ok: result.exitCode === 0, operation: 'list', resources: items, count: items.length, summary: `${items.length} resource(s) in state.` });
                }
                case 'show': {
                    const address = str(payload['address']);
                    if (!address) return { ok: false, output: '', errorOutput: 'address required for show' };
                    const args    = buildTfStateShowArgs(address);
                    const result  = await runCommand(args, tfDir, 30_000);
                    return safeJson({ ok: result.exitCode === 0, operation: 'show', address, output: result.stdout, summary: result.exitCode === 0 ? `Shown state for "${address}".` : result.stderr.slice(0, 200) });
                }
                case 'unlock': {
                    const lockId = str(payload['lock_id']);
                    if (!lockId) return { ok: false, output: '', errorOutput: 'lock_id required for unlock' };
                    const args   = buildTfStateUnlockArgs(lockId);
                    const result = await runCommand(args, tfDir, 30_000);
                    return safeJson({ ok: result.exitCode === 0, operation: 'unlock', lock_id: lockId, exit_code: result.exitCode, summary: result.exitCode === 0 ? `Lock ${lockId} released.` : result.stderr.slice(0, 200) });
                }
                case 'push': {
                    const localPath = str(payload['local_state_path']);
                    if (!localPath) return { ok: false, output: '', errorOutput: 'local_state_path required for push' };
                    const force  = payload['force'] === true;
                    const args   = buildTfStatePushArgs(localPath, force);
                    const result = await runCommand(args, tfDir, 60_000);
                    return safeJson({ ok: result.exitCode === 0, operation: 'push', local_state_path: localPath, force, exit_code: result.exitCode, summary: result.exitCode === 0 ? 'State pushed successfully.' : result.stderr.slice(0, 200) });
                }
                case 'llm_plan': {
                    // Use LLM to determine the right state operations from natural language
                    const userIntent = str(payload['intent']);
                    if (!userIntent) return { ok: false, output: '', errorOutput: 'intent required for llm_plan' };
                    const listResult = await runCommand(buildTfStateListArgs(), tfDir, 30_000);
                    const stateList  = parseTfStateList(listResult.stdout);
                    const prompt     = buildTfStateOpPrompt({ userIntent, stateList, operation: (str(payload['op_type'], 'mv')) as 'mv' | 'rm' | 'import' });
                    const llmRaw     = await callLlmSafe(callLlm, prompt, 'You are a Terraform state expert. Return JSON only.');
                    const plan       = parseTfStateOpPlan(llmRaw);
                    return safeJson({ ok: true, operation: 'llm_plan', operations: plan.operations, explanation: plan.explanation, summary: plan.explanation });
                }
                default:
                    return { ok: false, output: '', errorOutput: `Unknown tf_state operation: ${operation}` };
            }
        }

        // ====================================================================
        // workspace_devops_k8s_rbac
        // payload: action (generate|apply|audit), service_name (required for generate),
        //          namespace (required), description? (for LLM generate),
        //          aws_role_arn? (IRSA), cluster_wide?, output_dir?
        // ====================================================================
        case 'workspace_devops_k8s_rbac': {
            const rbacAction  = str(payload['action'], 'generate');
            const namespace   = str(payload['namespace'], 'default');
            const serviceName = str(payload['service_name']);
            const outputDir   = str(payload['output_dir'], '.');

            if (rbacAction === 'generate') {
                if (!serviceName) return { ok: false, output: '', errorOutput: 'service_name required for generate' };

                let files: Array<{ filename: string; content: string }> = [];

                if (callLlm && str(payload['description'])) {
                    // LLM-driven generation from description
                    const prompt  = buildRbacGeneratePrompt({
                        serviceName,
                        namespace,
                        description:  str(payload['description']),
                        awsRoleArn:   str(payload['aws_role_arn']) || undefined,
                        clusterWide:  payload['cluster_wide'] === true,
                    });
                    const llmRaw  = await callLlmSafe(callLlm, prompt, 'You are a Kubernetes security engineer. Return JSON only.');
                    files = parseRbacManifests(llmRaw);
                } else {
                    // Direct YAML generation without LLM
                    const awsRoleArn = str(payload['aws_role_arn']) || undefined;
                    const sa   = buildServiceAccountYaml({ name: serviceName, namespace, awsRoleArn });
                    const role = payload['cluster_wide'] === true
                        ? buildClusterRoleYaml({ name: `${serviceName}-role`, rules: [{ apiGroups: [''], resources: ['pods', 'configmaps'], verbs: ['get', 'list', 'watch'] }] })
                        : buildRoleYaml({ name: `${serviceName}-role`, namespace, rules: [{ apiGroups: [''], resources: ['pods', 'configmaps'], verbs: ['get', 'list', 'watch'] }] });
                    const binding = payload['cluster_wide'] === true
                        ? buildClusterRoleBindingYaml({ name: `${serviceName}-rolebinding`, clusterRole: `${serviceName}-role`, subjects: [{ kind: 'ServiceAccount', name: serviceName, namespace }] })
                        : buildRoleBindingYaml({ name: `${serviceName}-rolebinding`, namespace, roleName: `${serviceName}-role`, subjects: [{ kind: 'ServiceAccount', name: serviceName }] });
                    files = [
                        { filename: `${serviceName}-serviceaccount.yaml`, content: sa },
                        { filename: `${serviceName}-role.yaml`,           content: role },
                        { filename: `${serviceName}-rolebinding.yaml`,    content: binding },
                    ];
                }

                const written: string[] = [];
                for (const f of files) {
                    const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                    await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                    written.push(fp);
                }
                return safeJson({ ok: true, action: 'generate', service_name: serviceName, namespace, files_written: written, file_count: written.length, summary: `Generated ${written.length} RBAC manifest(s) for "${serviceName}".` });
            }

            if (rbacAction === 'apply') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const manifestPath = str(payload['manifest_path']);
                if (!manifestPath) return { ok: false, output: '', errorOutput: 'manifest_path required for apply' };
                const args   = buildKubectlApplyArgs(manifestPath, namespace);
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'apply', namespace, exit_code: result.exitCode, output: result.stdout, summary: result.exitCode === 0 ? `RBAC manifests applied.` : result.stderr.slice(0, 200) });
            }

            if (rbacAction === 'audit') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const checks  = buildRbacAuditChecks(serviceName, namespace);
                const results: Array<{ verb: string; resource: string; allowed: boolean }> = [];
                for (const c of checks) {
                    const r = await runCommand(c.args, workspaceDir, 10_000);
                    results.push({ verb: c.verb, resource: c.resource, allowed: r.stdout.trim() === 'yes' });
                }
                const allowed = results.filter((r) => r.allowed).length;
                return safeJson({ ok: true, action: 'audit', service_account: serviceName, namespace, checks: results, allowed_count: allowed, total_count: results.length, summary: `${serviceName}: ${allowed}/${results.length} permission checks passed.` });
            }

            return { ok: false, output: '', errorOutput: `Unknown rbac action: ${rbacAction}` };
        }

        // ====================================================================
        // workspace_devops_grafana_dashboard
        // payload: action (generate|push), service_or_app (required),
        //          description?, metrics? (array), namespace?, datasource?,
        //          grafana_url?, grafana_api_key?, folder_id?, output_file?
        // ====================================================================
        case 'workspace_devops_grafana_dashboard': {
            const dashAction   = str(payload['action'], 'generate');
            const serviceOrApp = str(payload['service_or_app']);
            if (!serviceOrApp) return { ok: false, output: '', errorOutput: 'service_or_app is required' };

            const metrics = Array.isArray(payload['metrics'])
                ? (payload['metrics'] as string[]) : [`${serviceOrApp}_requests_total`, `${serviceOrApp}_request_duration_seconds`];

            const panels = Array.isArray(payload['panels'])
                ? (payload['panels'] as GrafanaPanel[]) : undefined;

            const prompt = buildGrafanaDashboardPrompt({
                serviceOrApp,
                description:  str(payload['description'], `Dashboard for ${serviceOrApp}`),
                metrics,
                namespace:    str(payload['namespace']) || undefined,
                datasource:   str(payload['datasource']) || undefined,
                panels,
            });

            const llmRaw  = await callLlmSafe(callLlm, prompt, 'You are a Grafana dashboard expert. Return valid Grafana dashboard JSON only.');
            const dashboard = parseGrafanaDashboard(llmRaw);

            if (!dashboard) {
                return safeJson({ ok: false, action: dashAction, service_or_app: serviceOrApp, summary: 'Failed to generate Grafana dashboard JSON from LLM output.' });
            }

            const outFile = str(payload['output_file'], `${serviceOrApp}-dashboard.json`);
            await executeAction('workspace_write_file', { file_path: outFile, content: JSON.stringify(dashboard, null, 2) });

            // Optionally push to Grafana API
            if (dashAction === 'push') {
                const grafanaUrl    = str(payload['grafana_url']);
                const grafanaApiKey = str(payload['grafana_api_key']);
                const folderId      = num(payload['folder_id'], 0);
                if (!grafanaUrl || !grafanaApiKey) {
                    return safeJson({ ok: false, action: 'push', service_or_app: serviceOrApp, summary: 'grafana_url and grafana_api_key required for push.' });
                }
                const apiPayload = buildGrafanaDashboardApiPayload(dashboard, folderId);
                if (runCommand) {
                    const curlArgs = ['curl', '-s', '-X', 'POST', `${grafanaUrl}/api/dashboards/db`,
                        '-H', 'Content-Type: application/json',
                        '-H', `Authorization: Bearer ${grafanaApiKey}`,
                        '-d', JSON.stringify(apiPayload)];
                    const result = await runCommand(curlArgs, workspaceDir, 30_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'push', service_or_app: serviceOrApp, response: result.stdout.slice(0, 500), file_written: outFile, summary: result.exitCode === 0 ? `Dashboard pushed to Grafana for "${serviceOrApp}".` : result.stderr.slice(0, 200) });
                }
            }

            return safeJson({ ok: true, action: 'generate', service_or_app: serviceOrApp, file_written: outFile, panel_count: Array.isArray(dashboard['panels']) ? (dashboard['panels'] as unknown[]).length : 0, summary: `Grafana dashboard generated for "${serviceOrApp}" → ${outFile}` });
        }

        // ====================================================================
        // workspace_devops_alert_rule
        // payload: backend (prometheus|datadog|pagerduty, default: prometheus),
        //          service_or_app (required), description?, namespace?,
        //          slos? (array), output_dir?, name?
        //          [datadog] critical_threshold?, warning_threshold?, notify_channels?
        //          [pagerduty] escalation_policy_id?, urgency?
        // ====================================================================
        case 'workspace_devops_alert_rule': {
            const backend      = str(payload['backend'], 'prometheus') as 'prometheus' | 'datadog' | 'pagerduty';
            const serviceOrApp = str(payload['service_or_app']);
            if (!serviceOrApp) return { ok: false, output: '', errorOutput: 'service_or_app is required' };
            const outputDir    = str(payload['output_dir'], '.');

            if (backend === 'prometheus') {
                // Check if direct rules were provided, otherwise use LLM
                const directGroups = Array.isArray(payload['groups']) ? (payload['groups'] as Array<{ name: string; rules: PrometheusAlertRule[] }>) : null;

                let files: Array<{ filename: string; content: string }>;
                if (directGroups) {
                    const ruleName = str(payload['name'], `${serviceOrApp}-alert-rules`);
                    const namespace = str(payload['namespace'], 'default');
                    const crd = buildPrometheusRuleCrd({ name: ruleName, namespace, groups: directGroups });
                    files = [{ filename: `${ruleName}.yaml`, content: crd }];
                } else {
                    const slos = Array.isArray(payload['slos']) ? (payload['slos'] as Array<{ metric: string; threshold: number; window: string }>) : undefined;
                    const prompt  = buildAlertRulePrompt({ serviceOrApp, description: str(payload['description'], `Alerting rules for ${serviceOrApp}`), namespace: str(payload['namespace']) || undefined, slos });
                    const llmRaw  = await callLlmSafe(callLlm, prompt, 'You are a Prometheus alerting expert. Return JSON only.');
                    files = parseAlertRuleOutput(llmRaw);
                }

                const written: string[] = [];
                for (const f of files) {
                    const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                    await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                    written.push(fp);
                }
                return safeJson({ ok: true, backend, service: serviceOrApp, files_written: written, file_count: written.length, summary: `Generated ${written.length} Prometheus alert rule file(s) for "${serviceOrApp}".` });
            }

            if (backend === 'datadog') {
                const notifyChannels = Array.isArray(payload['notify_channels']) ? (payload['notify_channels'] as string[]) : undefined;
                const monitor = buildDatadogMonitorPayload({
                    name:               str(payload['name'], `${serviceOrApp} error rate`),
                    service:            serviceOrApp,
                    description:        str(payload['description'], `Monitor for ${serviceOrApp}`),
                    criticalThreshold:  typeof payload['critical_threshold'] === 'number' ? payload['critical_threshold'] as number : undefined,
                    warningThreshold:   typeof payload['warning_threshold']  === 'number' ? payload['warning_threshold']  as number : undefined,
                    notifyChannels,
                });
                const outFile = str(payload['output_file'], `${serviceOrApp}-datadog-monitor.json`);
                await executeAction('workspace_write_file', { file_path: outFile, content: JSON.stringify(monitor, null, 2) });
                return safeJson({ ok: true, backend, service: serviceOrApp, monitor, file_written: outFile, summary: `Datadog monitor payload generated for "${serviceOrApp}".` });
            }

            if (backend === 'pagerduty') {
                const escalationPolicyId = str(payload['escalation_policy_id']);
                if (!escalationPolicyId) return { ok: false, output: '', errorOutput: 'escalation_policy_id required for pagerduty backend' };
                const service = buildPagerDutyServicePayload({
                    name:               str(payload['name'], serviceOrApp),
                    description:        str(payload['description'], `PagerDuty service for ${serviceOrApp}`),
                    escalationPolicyId,
                    urgency:            (str(payload['urgency'], 'high')) as 'high' | 'low',
                });
                const outFile = str(payload['output_file'], `${serviceOrApp}-pagerduty-service.json`);
                await executeAction('workspace_write_file', { file_path: outFile, content: JSON.stringify(service, null, 2) });
                return safeJson({ ok: true, backend, service: serviceOrApp, pd_service: service, file_written: outFile, summary: `PagerDuty service payload generated for "${serviceOrApp}".` });
            }

            return { ok: false, output: '', errorOutput: `Unknown alert_rule backend: ${backend}` };
        }

        // ====================================================================
        // workspace_devops_blue_green
        // payload: action (generate|switch|scale_down),
        //          app_name (required), namespace, blue_image, green_image,
        //          port, replicas?, to_color? (for switch), output_dir?
        // ====================================================================
        case 'workspace_devops_blue_green': {
            const bgAction  = str(payload['action'], 'generate');
            const appName   = str(payload['app_name']);
            const namespace = str(payload['namespace'], 'default');
            if (!appName)   return { ok: false, output: '', errorOutput: 'app_name is required' };

            if (bgAction === 'generate') {
                const blueImage  = str(payload['blue_image']);
                const greenImage = str(payload['green_image']);
                const port       = num(payload['port'], 8080);
                const outputDir  = str(payload['output_dir'], '.');
                if (!blueImage || !greenImage) {
                    // Fall back to LLM-based generation
                    const prompt = buildDeploymentStrategyPrompt({
                        appName,
                        description:  str(payload['description'], `Blue/green deployment for ${appName}`),
                        strategy:     'blue_green',
                        image:        greenImage || blueImage || `${appName}:latest`,
                        port:         port || 8080,
                        namespace,
                        currentImage: blueImage || undefined,
                        replicas:     num(payload['replicas'], 2),
                    });
                    const llmRaw = await callLlmSafe(callLlm, prompt, 'You are a Kubernetes deployment expert. Return JSON only.');
                    const parsed = parseDeploymentStrategyOutput(llmRaw);
                    const written: string[] = [];
                    for (const f of parsed) {
                        const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                        await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                        written.push(fp);
                    }
                    return safeJson({ ok: true, action: 'generate', strategy: 'blue_green', app_name: appName, files_written: written, summary: `Generated ${written.length} blue/green manifest(s) for "${appName}" via LLM.` });
                }

                const manifests = buildBlueGreenManifests({
                    appName, namespace, blueImage, greenImage, port,
                    replicas: num(payload['replicas'], 2),
                    resources: payload['resources'] ? (payload['resources'] as { cpu: string; memory: string }) : undefined,
                });
                const written: string[] = [];
                for (const f of manifests) {
                    const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                    await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                    written.push(fp);
                }
                return safeJson({ ok: true, action: 'generate', strategy: 'blue_green', app_name: appName, files_written: written, file_count: written.length, summary: `Generated ${written.length} blue/green manifests for "${appName}".` });
            }

            if (bgAction === 'switch') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const toColor = (str(payload['to_color'], 'green')) as 'blue' | 'green';
                const args    = buildBlueGreenSwitchArgs({ appName, namespace, toColor });
                const result  = await runCommand(args, workspaceDir, 15_000);
                return safeJson({ ok: result.exitCode === 0, action: 'switch', app_name: appName, to_color: toColor, exit_code: result.exitCode, output: result.stdout, summary: result.exitCode === 0 ? `Active service for "${appName}" switched to ${toColor}.` : result.stderr.slice(0, 200) });
            }

            if (bgAction === 'scale_down') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const color  = (str(payload['color'], 'blue')) as 'blue' | 'green';
                const args   = buildScaleDownArgs(appName, color, namespace);
                const result = await runCommand(args, workspaceDir, 15_000);
                return safeJson({ ok: result.exitCode === 0, action: 'scale_down', app_name: appName, color, exit_code: result.exitCode, output: result.stdout, summary: result.exitCode === 0 ? `Scaled down "${appName}-${color}" to 0 replicas.` : result.stderr.slice(0, 200) });
            }

            return { ok: false, output: '', errorOutput: `Unknown blue_green action: ${bgAction}` };
        }

        // ====================================================================
        // workspace_devops_canary
        // payload: action (generate|promote|abort|status),
        //          app_name (required), namespace, image, port, replicas?,
        //          use_argo_rollouts? (default: true), use_istio?,
        //          steps? (CanaryStep array), stable_weight?, canary_weight?,
        //          output_dir?, watch? (for status)
        // ====================================================================
        case 'workspace_devops_canary': {
            const canaryAction = str(payload['action'], 'generate');
            const appName      = str(payload['app_name']);
            const namespace    = str(payload['namespace'], 'default');
            if (!appName)      return { ok: false, output: '', errorOutput: 'app_name is required' };

            if (canaryAction === 'generate') {
                const image    = str(payload['image'], `${appName}:latest`);
                const port     = num(payload['port'], 8080);
                const outputDir = str(payload['output_dir'], '.');
                const useArgo  = payload['use_argo_rollouts'] !== false;
                const useIstio = payload['use_istio'] === true;
                const steps    = Array.isArray(payload['steps']) ? (payload['steps'] as CanaryStep[]) : undefined;

                if (useIstio) {
                    const stableWeight = num(payload['stable_weight'], 90);
                    const canaryWeight = num(payload['canary_weight'], 10);
                    const manifests = buildIstioTrafficSplitManifests({ appName, namespace, stableWeight, canaryWeight, port });
                    const written: string[] = [];
                    for (const f of manifests) {
                        const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                        await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                        written.push(fp);
                    }
                    return safeJson({ ok: true, action: 'generate', strategy: 'canary_istio', app_name: appName, stable_weight: stableWeight, canary_weight: canaryWeight, files_written: written, summary: `Generated Istio canary traffic split for "${appName}" (${stableWeight}/${canaryWeight}).` });
                }

                if (useArgo) {
                    const manifest = buildArgoRolloutsManifest({ appName, namespace, image, port, replicas: num(payload['replicas'], 3), steps });
                    const fileName = `${appName}-rollout.yaml`;
                    const fp       = outputDir !== '.' ? `${outputDir}/${fileName}` : fileName;
                    await executeAction('workspace_write_file', { file_path: fp, content: manifest });
                    return safeJson({ ok: true, action: 'generate', strategy: 'canary_argo', app_name: appName, file_written: fp, step_count: steps?.length ?? 9, summary: `Generated Argo Rollouts canary manifest for "${appName}" → ${fp}` });
                }

                // LLM-driven fallback
                const prompt = buildDeploymentStrategyPrompt({ appName, description: str(payload['description'], `Canary deployment for ${appName}`), strategy: 'canary', image, port, namespace, replicas: num(payload['replicas'], 3), useArgoRollouts: useArgo, useIstio });
                const llmRaw = await callLlmSafe(callLlm, prompt, 'You are a Kubernetes deployment expert. Return JSON only.');
                const parsed = parseDeploymentStrategyOutput(llmRaw);
                const written: string[] = [];
                for (const f of parsed) {
                    const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                    await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                    written.push(fp);
                }
                return safeJson({ ok: true, action: 'generate', strategy: 'canary', app_name: appName, files_written: written, summary: `Generated ${written.length} canary manifest(s) for "${appName}" via LLM.` });
            }

            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };

            if (canaryAction === 'promote') {
                const fullPromote = payload['full_promote'] === true;
                const args        = buildArgoRolloutsPromoteArgs(appName, namespace, fullPromote);
                const result      = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'promote', app_name: appName, full_promote: fullPromote, exit_code: result.exitCode, summary: result.exitCode === 0 ? `Canary rollout "${appName}" promoted${fullPromote ? ' (full)' : ''}.` : result.stderr.slice(0, 200) });
            }

            if (canaryAction === 'abort') {
                const args   = buildArgoRolloutsAbortArgs(appName, namespace);
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'abort', app_name: appName, exit_code: result.exitCode, summary: result.exitCode === 0 ? `Canary rollout "${appName}" aborted and rolled back.` : result.stderr.slice(0, 200) });
            }

            if (canaryAction === 'status') {
                const watch  = payload['watch'] === true;
                const args   = buildArgoRolloutsStatusArgs(appName, namespace, watch);
                const result = await runCommand(args, workspaceDir, watch ? 120_000 : 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'status', app_name: appName, output: result.stdout, summary: result.exitCode === 0 ? `Rollout status for "${appName}" retrieved.` : result.stderr.slice(0, 200) });
            }

            return { ok: false, output: '', errorOutput: `Unknown canary action: ${canaryAction}` };
        }

        // ====================================================================
        // workspace_devops_argocd
        // payload: action (sync|rollback|get|list|diff|set|wait|generate_app),
        //          app_name (required for most), namespace?, prune?, force?,
        //          async?, dry_run?, revision?, history_id?, output_dir?
        //          [set] image?, helm_values?, target_revision?
        //          [generate_app] repo_url, target_revision, path, dest_namespace
        // ====================================================================
        case 'workspace_devops_argocd': {
            if (!runCommand && str(payload['action'], 'sync') !== 'generate_app') {
                return { ok: false, output: '', errorOutput: 'runCommand not available' };
            }
            const argoAction = str(payload['action'], 'sync');
            const appName    = str(payload['app_name']);
            const namespace  = str(payload['namespace']) || undefined;

            if (argoAction === 'sync') {
                if (!appName) return { ok: false, output: '', errorOutput: 'app_name required for sync' };
                const args   = buildArgoCdSyncArgs({
                    appName, namespace,
                    prune:    payload['prune']    === true,
                    force:    payload['force']    === true,
                    async:    payload['async']    === true,
                    dryRun:   payload['dry_run']  === true,
                    revision: str(payload['revision']) || undefined,
                });
                const result = await runCommand!(args, workspaceDir, 180_000);
                const ok     = result.exitCode === 0;
                // Optionally wait for healthy after sync
                if (ok && !payload['async'] && !payload['dry_run']) {
                    const waitArgs   = buildArgoCdWaitArgs({ appName, namespace, health: true, timeout: 120 });
                    await runCommand!(waitArgs, workspaceDir, 130_000).catch(() => null);
                }
                return safeJson({ ok, action: 'sync', app_name: appName, exit_code: result.exitCode, output: result.stdout.slice(0, 2000), summary: ok ? `ArgoCD app "${appName}" synced successfully.` : result.stderr.slice(0, 200) });
            }

            if (argoAction === 'rollback') {
                if (!appName) return { ok: false, output: '', errorOutput: 'app_name required for rollback' };
                const historyId = num(payload['history_id'], 0);
                if (!historyId) {
                    // List history first so the caller knows available IDs
                    const histArgs = buildArgoCdHistoryArgs(appName, namespace);
                    const histRes  = await runCommand!(histArgs, workspaceDir, 30_000);
                    return safeJson({ ok: histRes.exitCode === 0, action: 'history', app_name: appName, history: histRes.stdout, summary: `Provide history_id from the above history to rollback "${appName}".` });
                }
                const args   = buildArgoCdRollbackArgs({ appName, historyId, prune: payload['prune'] === true, namespace });
                const result = await runCommand!(args, workspaceDir, 120_000);
                return safeJson({ ok: result.exitCode === 0, action: 'rollback', app_name: appName, history_id: historyId, exit_code: result.exitCode, summary: result.exitCode === 0 ? `ArgoCD app "${appName}" rolled back to revision ${historyId}.` : result.stderr.slice(0, 200) });
            }

            if (argoAction === 'get') {
                if (!appName) return { ok: false, output: '', errorOutput: 'app_name required for get' };
                const args   = buildArgoCdGetArgs(appName, namespace, 'json');
                const result = await runCommand!(args, workspaceDir, 30_000);
                const appStatus = parseArgoCdAppStatus(result.stdout);
                return safeJson({ ok: result.exitCode === 0, action: 'get', app: appStatus, raw: result.stdout.slice(0, 2000), summary: appStatus ? `App "${appName}": health=${appStatus.health}, sync=${appStatus.sync}` : 'Could not parse app status.' });
            }

            if (argoAction === 'list') {
                const args   = buildArgoCdListArgs({ namespace, project: str(payload['project']) || undefined });
                const result = await runCommand!(args, workspaceDir, 30_000);
                const apps   = parseArgoCdAppList(result.stdout);
                return safeJson({ ok: result.exitCode === 0, action: 'list', apps, app_count: apps.length, summary: summariseArgoCdApps(apps) });
            }

            if (argoAction === 'diff') {
                if (!appName) return { ok: false, output: '', errorOutput: 'app_name required for diff' };
                const args   = buildArgoCdDiffArgs(appName, { revision: str(payload['revision']) || undefined, namespace });
                const result = await runCommand!(args, workspaceDir, 60_000);
                const hasDiff = result.stdout.trim().length > 0;
                return safeJson({ ok: result.exitCode === 0, action: 'diff', app_name: appName, has_diff: hasDiff, diff: result.stdout.slice(0, 3000), summary: hasDiff ? `App "${appName}" has pending changes.` : `App "${appName}" is in sync.` });
            }

            if (argoAction === 'set') {
                if (!appName) return { ok: false, output: '', errorOutput: 'app_name required for set' };
                const helmValues = Array.isArray(payload['helm_values']) ? (payload['helm_values'] as Array<{ name: string; value: string }>) : [];
                const args   = buildArgoCdSetArgs({
                    appName, namespace,
                    image:            str(payload['image'])             || undefined,
                    targetRevision:   str(payload['target_revision'])   || undefined,
                    kustomizeImage:   str(payload['kustomize_image'])   || undefined,
                    helmValues:       helmValues.length ? helmValues : undefined,
                });
                const result = await runCommand!(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'set', app_name: appName, exit_code: result.exitCode, summary: result.exitCode === 0 ? `App "${appName}" parameters updated.` : result.stderr.slice(0, 200) });
            }

            if (argoAction === 'generate_app') {
                const repoUrl        = str(payload['repo_url']);
                const targetRevision = str(payload['target_revision'], 'main');
                const path           = str(payload['path'], '.');
                const destNamespace  = str(payload['dest_namespace'], 'default');
                const outputDir      = str(payload['output_dir'], '.');
                if (!repoUrl) return { ok: false, output: '', errorOutput: 'repo_url required for generate_app' };

                const useArgoLlm = callLlm && str(payload['description']);
                let files: Array<{ filename: string; content: string }> = [];

                if (useArgoLlm) {
                    const prompt = buildArgoCdAppPrompt({ appName: appName || 'my-app', description: str(payload['description']), repoUrl, targetRevision, destNamespace, syncPolicy: 'auto', helmChart: payload['helm_chart'] === true, kustomize: payload['kustomize'] === true });
                    const llmRaw = await callLlmSafe(callLlm, prompt, 'You are a GitOps expert. Return JSON only.');
                    try {
                        const cleaned = llmRaw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
                        files = JSON.parse(cleaned) as Array<{ filename: string; content: string }>;
                    } catch { /* fall through */ }
                }

                if (!files.length) {
                    const yaml = buildArgoCdApplicationYaml({ appName: appName || 'my-app', repoUrl, targetRevision, path, destNamespace, syncPolicy: 'auto', prune: true, selfHeal: true, namespace: str(payload['argocd_namespace'], 'argocd') });
                    files = [{ filename: `${appName || 'my-app'}-argocd-app.yaml`, content: yaml }];
                }

                const written: string[] = [];
                for (const f of files) {
                    const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                    await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                    written.push(fp);
                }
                return safeJson({ ok: true, action: 'generate_app', app_name: appName, files_written: written, summary: `Generated ArgoCD Application manifest(s): ${written.join(', ')}` });
            }

            return { ok: false, output: '', errorOutput: `Unknown argocd action: ${argoAction}` };
        }

        // ====================================================================
        // workspace_devops_k8s_autoscale
        // payload: action (generate|patch_hpa|scale|get_hpa|get_vpa|ca_status),
        //          app_name (required for generate/scale), namespace,
        //          [generate] description?, environment?, current_cpu?, current_memory?,
        //          [patch_hpa] hpa_name, min_replicas?, max_replicas?,
        //          [scale] kind?, replicas,
        //          output_dir?
        // ====================================================================
        case 'workspace_devops_k8s_autoscale': {
            const scaleAction = str(payload['action'], 'generate');
            const appName     = str(payload['app_name']);
            const namespace   = str(payload['namespace'], 'default');
            const outputDir   = str(payload['output_dir'], '.');

            if (scaleAction === 'generate') {
                if (!appName) return { ok: false, output: '', errorOutput: 'app_name required for generate' };

                let files: Array<{ filename: string; content: string }> = [];

                if (callLlm && str(payload['description'])) {
                    const prompt = buildAutoscalerPrompt({
                        appName, namespace,
                        description:    str(payload['description']),
                        currentCpu:     str(payload['current_cpu'])    || undefined,
                        currentMemory:  str(payload['current_memory']) || undefined,
                        p99Latency:     str(payload['p99_latency'])    || undefined,
                        errorRate:      str(payload['error_rate'])     || undefined,
                        peakRps:        typeof payload['peak_rps'] === 'number' ? payload['peak_rps'] as number : undefined,
                        environment:    (str(payload['environment'], 'production')) as 'production' | 'staging' | 'development',
                    });
                    const llmRaw = await callLlmSafe(callLlm, prompt, 'You are a Kubernetes capacity engineer. Return JSON only.');
                    files = parseAutoscalerOutput(llmRaw);
                }

                if (!files.length) {
                    // Direct YAML generation
                    const hpaSpec: HpaSpec = {
                        name: `${appName}-hpa`, namespace,
                        targetKind: 'Deployment', targetName: appName,
                        minReplicas: num(payload['min_replicas'], 2),
                        maxReplicas: num(payload['max_replicas'], 10),
                        metrics: [{ type: 'Resource', resourceName: 'cpu', averageUtilization: num(payload['cpu_target'], 70) }],
                        scaleDownStabilizationWindowSeconds: 300,
                    };
                    const hpaYaml = buildHpaYaml(hpaSpec);
                    files = [{ filename: `${appName}-hpa.yaml`, content: hpaYaml }];

                    if (payload['vpa'] !== false) {
                        const vpaSpec: VpaSpec = { name: `${appName}-vpa`, namespace, targetKind: 'Deployment', targetName: appName, updateMode: 'Off' };
                        files.push({ filename: `${appName}-vpa.yaml`, content: buildVpaYaml(vpaSpec) });
                    }
                }

                const written: string[] = [];
                for (const f of files) {
                    const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                    await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                    written.push(fp);
                }
                return safeJson({ ok: true, action: 'generate', app_name: appName, namespace, files_written: written, summary: `Generated ${written.length} autoscaling manifest(s) for "${appName}".` });
            }

            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };

            if (scaleAction === 'patch_hpa') {
                const hpaName = str(payload['hpa_name'], `${appName}-hpa`);
                const args    = buildKubectlPatchHpaArgs({ name: hpaName, namespace, minReplicas: typeof payload['min_replicas'] === 'number' ? payload['min_replicas'] as number : undefined, maxReplicas: typeof payload['max_replicas'] === 'number' ? payload['max_replicas'] as number : undefined });
                const result  = await runCommand(args, workspaceDir, 15_000);
                return safeJson({ ok: result.exitCode === 0, action: 'patch_hpa', hpa_name: hpaName, namespace, exit_code: result.exitCode, summary: result.exitCode === 0 ? `HPA "${hpaName}" patched.` : result.stderr.slice(0, 200) });
            }

            if (scaleAction === 'scale') {
                if (!appName) return { ok: false, output: '', errorOutput: 'app_name required for scale' };
                const replicas = num(payload['replicas'], 1);
                const kind     = (str(payload['kind'], 'deployment')) as 'deployment' | 'statefulset' | 'replicaset';
                const args     = buildKubectlScaleArgs({ kind, name: appName, namespace, replicas });
                const result   = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'scale', app_name: appName, namespace, replicas, exit_code: result.exitCode, summary: result.exitCode === 0 ? `${kind} "${appName}" scaled to ${replicas} replica(s).` : result.stderr.slice(0, 200) });
            }

            if (scaleAction === 'get_hpa') {
                const args   = buildKubectlGetHpaArgs(namespace, str(payload['hpa_name']) || undefined);
                const result = await runCommand(args, workspaceDir, 15_000);
                const hpas   = parseHpaStatus(result.stdout);
                return safeJson({ ok: result.exitCode === 0, action: 'get_hpa', namespace, hpas, count: hpas.length, summary: `${hpas.length} HPA(s) found in namespace "${namespace}".` });
            }

            if (scaleAction === 'get_vpa') {
                const args   = buildKubectlGetVpaArgs(namespace, str(payload['vpa_name']) || undefined);
                const result = await runCommand(args, workspaceDir, 15_000);
                return safeJson({ ok: result.exitCode === 0, action: 'get_vpa', namespace, raw: result.stdout.slice(0, 2000), summary: `VPA status retrieved for namespace "${namespace}".` });
            }

            if (scaleAction === 'ca_status') {
                const nsArg  = str(payload['ca_namespace'], 'kube-system');
                const args   = buildCaStatusArgs(nsArg);
                const result = await runCommand(args, workspaceDir, 15_000);
                return safeJson({ ok: result.exitCode === 0, action: 'ca_status', output: result.stdout, summary: 'Cluster Autoscaler status retrieved.' });
            }

            if (scaleAction === 'generate_quota') {
                if (!appName) return { ok: false, output: '', errorOutput: 'app_name required for generate_quota' };
                const quotaSpec: ResourceQuotaSpec = {
                    name: `${appName}-quota`, namespace,
                    requests: { cpu: str(payload['requests_cpu'], '4'), memory: str(payload['requests_memory'], '8Gi') },
                    limits:   { cpu: str(payload['limits_cpu'],   '8'), memory: str(payload['limits_memory'],   '16Gi') },
                    pods: num(payload['max_pods'], 20),
                };
                const yaml = buildResourceQuotaYaml(quotaSpec);
                const fp   = outputDir !== '.' ? `${outputDir}/${appName}-quota.yaml` : `${appName}-quota.yaml`;
                await executeAction('workspace_write_file', { file_path: fp, content: yaml });
                return safeJson({ ok: true, action: 'generate_quota', namespace, file_written: fp, summary: `ResourceQuota for "${namespace}" written to ${fp}.` });
            }

            return { ok: false, output: '', errorOutput: `Unknown k8s_autoscale action: ${scaleAction}` };
        }

        // ====================================================================
        // workspace_devops_k8s_exec
        // payload: action (exec|migrate|pg_dump|psql|redis|mongo|job_create|job_run),
        //          pod (required for exec actions, OR label_selector),
        //          namespace, command? (array), container?,
        //          [migrate] framework?, custom_command?,
        //          [pg_dump] database, user?, format?,
        //          [psql] database, sql,
        //          [redis] operation, pattern?,
        //          [mongo] database, js_script,
        //          [job_create/job_run] job_name, image, job_command (array)
        // ====================================================================
        case 'workspace_devops_k8s_exec': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const execAction     = str(payload['action'], 'exec');
            const namespace      = str(payload['namespace'], 'default');
            const labelSelector  = str(payload['label_selector']);
            let   pod            = str(payload['pod']);

            // Resolve pod name from label selector if not given directly
            if (!pod && labelSelector) {
                const podNameResult = await runCommand(buildGetPodNameArgs(labelSelector, namespace), workspaceDir, 10_000);
                pod = podNameResult.stdout.trim();
                if (!pod) return { ok: false, output: '', errorOutput: `No pod found for selector "${labelSelector}" in namespace "${namespace}"` };
            }

            if (execAction === 'exec') {
                if (!pod) return { ok: false, output: '', errorOutput: 'pod or label_selector required for exec' };
                const command = Array.isArray(payload['command']) ? (payload['command'] as string[]) : ['sh', '-c', str(payload['shell_command'], 'echo hello')];
                const args    = buildKubectlExecArgs({ pod, namespace, command, container: str(payload['container']) || undefined });
                const result  = await runCommand(args, workspaceDir, num(payload['timeout_seconds'], 60) * 1000);
                return safeJson({ ok: result.exitCode === 0, action: 'exec', pod, namespace, exit_code: result.exitCode, stdout: result.stdout.slice(0, 4000), stderr: result.stderr.slice(0, 1000), summary: result.exitCode === 0 ? `Command executed in pod "${pod}".` : result.stderr.slice(0, 200) });
            }

            if (execAction === 'migrate') {
                if (!pod) return { ok: false, output: '', errorOutput: 'pod or label_selector required for migrate' };
                const framework  = (str(payload['framework'], 'custom')) as 'prisma' | 'flyway' | 'alembic' | 'liquibase' | 'custom';
                const customCmd  = Array.isArray(payload['custom_command']) ? (payload['custom_command'] as string[]) : undefined;
                const args       = buildDbMigrationExecArgs({ pod, namespace, framework, customCommand: customCmd, container: str(payload['container']) || undefined });
                const result     = await runCommand(args, workspaceDir, 300_000);
                return safeJson({ ok: result.exitCode === 0, action: 'migrate', pod, namespace, framework, exit_code: result.exitCode, output: result.stdout.slice(0, 4000), summary: result.exitCode === 0 ? `Migration (${framework}) completed in pod "${pod}".` : result.stderr.slice(0, 200) });
            }

            if (execAction === 'pg_dump') {
                if (!pod) return { ok: false, output: '', errorOutput: 'pod or label_selector required for pg_dump' };
                const database = str(payload['database']);
                if (!database) return { ok: false, output: '', errorOutput: 'database required for pg_dump' };
                const args   = buildPgDumpExecArgs({ pod, namespace, database, user: str(payload['user']) || undefined, format: (str(payload['format'], 'plain')) as 'plain' | 'custom', outputPath: str(payload['output_path']) || undefined, container: str(payload['container']) || undefined, noOwner: payload['no_owner'] !== false, noAcl: payload['no_acl'] !== false });
                const result = await runCommand(args, workspaceDir, 600_000);
                return safeJson({ ok: result.exitCode === 0, action: 'pg_dump', pod, namespace, database, exit_code: result.exitCode, output_size: result.stdout.length, summary: result.exitCode === 0 ? `pg_dump of "${database}" completed (${result.stdout.length} bytes).` : result.stderr.slice(0, 200) });
            }

            if (execAction === 'psql') {
                if (!pod) return { ok: false, output: '', errorOutput: 'pod or label_selector required for psql' };
                const database = str(payload['database']);
                const sql      = str(payload['sql']);
                if (!database || !sql) return { ok: false, output: '', errorOutput: 'database and sql required for psql' };
                const args   = buildPsqlExecArgs({ pod, namespace, database, sql, user: str(payload['user']) || undefined, container: str(payload['container']) || undefined });
                const result = await runCommand(args, workspaceDir, 60_000);
                return safeJson({ ok: result.exitCode === 0, action: 'psql', pod, namespace, database, exit_code: result.exitCode, output: result.stdout.slice(0, 4000), summary: result.exitCode === 0 ? 'SQL executed successfully.' : result.stderr.slice(0, 200) });
            }

            if (execAction === 'redis') {
                if (!pod) return { ok: false, output: '', errorOutput: 'pod or label_selector required for redis' };
                const operation = (str(payload['redis_operation'], 'info')) as 'flushdb' | 'flushall' | 'del_pattern' | 'info' | 'custom';
                const args      = buildRedisExecArgs({ pod, namespace, operation, pattern: str(payload['pattern']) || undefined, customCommand: Array.isArray(payload['custom_command']) ? (payload['custom_command'] as string[]) : undefined, container: str(payload['container']) || undefined });
                const result    = await runCommand(args, workspaceDir, 60_000);
                return safeJson({ ok: result.exitCode === 0, action: 'redis', pod, namespace, operation, exit_code: result.exitCode, output: result.stdout.slice(0, 2000), summary: result.exitCode === 0 ? `Redis "${operation}" completed in pod "${pod}".` : result.stderr.slice(0, 200) });
            }

            if (execAction === 'mongo') {
                if (!pod) return { ok: false, output: '', errorOutput: 'pod or label_selector required for mongo' };
                const database  = str(payload['database']);
                const jsScript  = str(payload['js_script']);
                if (!database || !jsScript) return { ok: false, output: '', errorOutput: 'database and js_script required for mongo' };
                const args   = buildMongoExecArgs({ pod, namespace, database, jsScript, container: str(payload['container']) || undefined });
                const result = await runCommand(args, workspaceDir, 60_000);
                return safeJson({ ok: result.exitCode === 0, action: 'mongo', pod, namespace, database, exit_code: result.exitCode, output: result.stdout.slice(0, 2000), summary: result.exitCode === 0 ? 'MongoDB script executed successfully.' : result.stderr.slice(0, 200) });
            }

            if (execAction === 'job_run') {
                // Full lifecycle: generate YAML → apply → wait → logs → (optionally delete)
                const jobName   = str(payload['job_name']);
                const image     = str(payload['image']);
                const jobCmd    = Array.isArray(payload['job_command']) ? (payload['job_command'] as string[]) : [];
                if (!jobName || !image || !jobCmd.length) return { ok: false, output: '', errorOutput: 'job_name, image, and job_command required for job_run' };

                const jobSpec: K8sJobSpec = {
                    jobName, namespace, image,
                    command: jobCmd,
                    ttlSeconds:    num(payload['ttl_seconds'], 300),
                    backoffLimit:  num(payload['backoff_limit'], 0),
                    serviceAccount: str(payload['service_account']) || undefined,
                    envVars:       typeof payload['env_vars'] === 'object' && payload['env_vars'] !== null ? (payload['env_vars'] as Record<string, string>) : undefined,
                };
                const jobYaml = buildK8sJobYaml(jobSpec);
                const jobFile = `/tmp/${jobName}-job.yaml`;
                await executeAction('workspace_write_file', { file_path: jobFile, content: jobYaml });

                // Apply
                const applyResult = await runCommand(buildKubectlCreateJobArgs(jobFile, namespace), workspaceDir, 15_000);
                if (applyResult.exitCode !== 0) return safeJson({ ok: false, action: 'job_run', job_name: jobName, phase: 'apply', exit_code: applyResult.exitCode, summary: applyResult.stderr.slice(0, 200) });

                // Wait for completion
                const timeout    = num(payload['timeout_seconds'], 300);
                const waitResult = await runCommand(buildKubectlWaitJobArgs(jobName, namespace, timeout), workspaceDir, (timeout + 10) * 1000);
                const succeeded  = waitResult.exitCode === 0;

                // Get logs
                const logsResult = await runCommand(buildKubectlLogsJobArgs(jobName, namespace), workspaceDir, 15_000);

                // Optionally delete job after run
                if (payload['delete_after'] !== false) {
                    await runCommand(buildKubectlDeleteJobArgs(jobName, namespace), workspaceDir, 10_000).catch(() => null);
                }

                return safeJson({ ok: succeeded, action: 'job_run', job_name: jobName, namespace, succeeded, logs: logsResult.stdout.slice(0, 4000), summary: succeeded ? `Job "${jobName}" completed successfully.` : `Job "${jobName}" failed or timed out.` });
            }

            return { ok: false, output: '', errorOutput: `Unknown k8s_exec action: ${execAction}` };
        }

        // ====================================================================
        // workspace_devops_dns
        // payload: action (list|create|update|delete|list_zones|request_cert|describe_cert),
        //          provider (route53|cloudflare|azure|gcp, required),
        //          [route53] hosted_zone_id, name, type, value, ttl?
        //          [cloudflare] zone_id, api_token, name, type, content, record_id?
        //          [azure] zone, resource_group, type, name?, value?, subscription?
        //          [gcp] zone (managed zone name), name, type, data, project?
        //          [request_cert] domain, alternate_names?, region?
        //          allow_destructive? (required for delete)
        // ====================================================================
        case 'workspace_devops_dns': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const dnsAction  = str(payload['action'], 'list');
            const provider   = (str(payload['provider'], 'route53')) as DnsProvider;

            if (dnsAction === 'delete' && payload['allow_destructive'] !== true) {
                return { ok: false, output: '', errorOutput: 'DNS record deletion requires allow_destructive: true' };
            }

            if (provider === 'route53') {
                const hostedZoneId = str(payload['hosted_zone_id']);
                if (!hostedZoneId) return { ok: false, output: '', errorOutput: 'hosted_zone_id required for route53' };

                if (dnsAction === 'list_zones') {
                    const result = await runCommand(buildRoute53ListZonesArgs(), workspaceDir, 30_000);
                    return safeJson({ ok: result.exitCode === 0, provider, action: 'list_zones', raw: result.stdout.slice(0, 4000), summary: 'Route53 hosted zones listed.' });
                }
                if (dnsAction === 'list') {
                    const result  = await runCommand(buildRoute53ListRecordsArgs(hostedZoneId), workspaceDir, 30_000);
                    const records = parseRoute53Records(result.stdout);
                    return safeJson({ ok: result.exitCode === 0, provider, action: 'list', records, count: records.length, summary: `${records.length} record(s) in zone "${hostedZoneId}".` });
                }

                const name  = str(payload['name']);
                const type  = (str(payload['type'], 'A')) as DnsRecordType;
                const value = str(payload['value']);
                const ttl   = num(payload['ttl'], 300);
                const action53 = dnsAction === 'delete' ? 'DELETE' : 'UPSERT';
                const batch  = buildRoute53ChangeBatch({ action: action53, name, type, value, ttl });
                const batchJson = JSON.stringify(batch);
                const args   = buildRoute53ChangeArgs(hostedZoneId, batchJson);
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, provider, action: dnsAction, name, type, value, exit_code: result.exitCode, summary: result.exitCode === 0 ? `Route53 record ${name} (${type}) ${dnsAction}d.` : result.stderr.slice(0, 200) });
            }

            if (provider === 'cloudflare') {
                const zoneId    = str(payload['zone_id']);
                const apiToken  = str(payload['api_token']);
                if (!zoneId || !apiToken) return { ok: false, output: '', errorOutput: 'zone_id and api_token required for cloudflare' };
                const args   = buildCloudFlareDnsArgs({ operation: dnsAction as 'create' | 'update' | 'delete' | 'list', zoneId, apiToken, name: str(payload['name']) || undefined, type: str(payload['type']) as DnsRecordType || undefined, content: str(payload['content']) || undefined, ttl: num(payload['ttl'], 1), proxied: payload['proxied'] === true, recordId: str(payload['record_id']) || undefined });
                const result = await runCommand(args, workspaceDir, 30_000);
                const records = dnsAction === 'list' ? parseCloudFlareDnsRecords(result.stdout) : undefined;
                return safeJson({ ok: result.exitCode === 0, provider, action: dnsAction, records, exit_code: result.exitCode, raw: result.stdout.slice(0, 2000), summary: `Cloudflare DNS ${dnsAction} completed.` });
            }

            if (provider === 'azure') {
                const zone          = str(payload['zone']);
                const resourceGroup = str(payload['resource_group']);
                if (!zone || !resourceGroup) return { ok: false, output: '', errorOutput: 'zone and resource_group required for azure' };
                const args   = buildAzDnsArgs({ operation: dnsAction as 'create' | 'update' | 'delete' | 'list', zone, resourceGroup, type: (str(payload['type'], 'A')) as DnsRecordType, name: str(payload['name']) || undefined, ipv4Address: str(payload['ipv4_address']) || undefined, cname: str(payload['cname']) || undefined, txtValue: str(payload['txt_value']) || undefined, ttl: num(payload['ttl'], 300), subscription: str(payload['subscription']) || undefined });
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, provider, action: dnsAction, exit_code: result.exitCode, raw: result.stdout.slice(0, 2000), summary: `Azure DNS ${dnsAction} completed.` });
            }

            if (provider === 'gcp') {
                const zone    = str(payload['zone']);
                if (!zone) return { ok: false, output: '', errorOutput: 'zone (managed zone name) required for gcp' };
                const args   = buildGcloudDnsArgs({ operation: dnsAction as 'add-record-set' | 'delete' | 'list', zone, name: str(payload['name']) || undefined, type: (str(payload['type'], 'A')) as DnsRecordType, ttl: num(payload['ttl'], 300), data: str(payload['data']) || undefined, project: str(payload['project']) || undefined });
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, provider, action: dnsAction, exit_code: result.exitCode, raw: result.stdout.slice(0, 2000), summary: `GCP Cloud DNS ${dnsAction} completed.` });
            }

            // ACM cert actions (provider-agnostic under dns action set)
            if (dnsAction === 'request_cert') {
                const domain = str(payload['domain']);
                if (!domain) return { ok: false, output: '', errorOutput: 'domain required for request_cert' };
                const alternateNames = Array.isArray(payload['alternate_names']) ? (payload['alternate_names'] as string[]) : undefined;
                const args   = buildAcmRequestCertArgs({ domain, alternateNames, validationMethod: 'DNS', region: str(payload['region']) || undefined });
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'request_cert', domain, exit_code: result.exitCode, raw: result.stdout.slice(0, 1000), summary: result.exitCode === 0 ? `ACM cert requested for "${domain}".` : result.stderr.slice(0, 200) });
            }
            if (dnsAction === 'describe_cert') {
                const certArn = str(payload['cert_arn']);
                if (!certArn) return { ok: false, output: '', errorOutput: 'cert_arn required for describe_cert' };
                const args   = buildAcmDescribeCertArgs(certArn, str(payload['region']) || undefined);
                const result = await runCommand(args, workspaceDir, 30_000);
                const certStatus = parseAcmCertStatus(result.stdout);
                return safeJson({ ok: result.exitCode === 0, action: 'describe_cert', cert: certStatus, summary: certStatus ? `ACM cert "${certStatus.domainName}": ${certStatus.status}` : 'Could not parse cert status.' });
            }

            return { ok: false, output: '', errorOutput: `Unknown dns action: ${dnsAction}` };
        }

        // ====================================================================
        // workspace_devops_lb
        // payload: action (describe_listeners|describe_target_health|create_rule|
        //                   modify_rule|delete_rule|patch_ingress|generate_ingress),
        //          [alb] listener_arn, region?
        //          [create_rule] priority, condition_field, condition_values, target_group_arn
        //          [delete_rule] rule_arn — requires allow_destructive: true
        //          [patch_ingress] name, namespace, annotations (object)
        //          [generate_ingress] name, namespace, host, service_name, service_port,
        //                              tls_secret_name?, annotations?, ingress_class?, output_dir?
        // ====================================================================
        case 'workspace_devops_lb': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const lbAction = str(payload['action'], 'describe_listeners');

            if (lbAction === 'delete_rule' && payload['allow_destructive'] !== true) {
                return { ok: false, output: '', errorOutput: 'Listener rule deletion requires allow_destructive: true' };
            }

            if (lbAction === 'describe_listeners') {
                const lbArn = str(payload['load_balancer_arn']);
                if (!lbArn) return { ok: false, output: '', errorOutput: 'load_balancer_arn required for describe_listeners' };
                const args   = buildAlbDescribeListenersArgs(lbArn, str(payload['region']) || undefined);
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'describe_listeners', raw: result.stdout.slice(0, 4000), summary: 'ALB/NLB listeners described.' });
            }

            if (lbAction === 'describe_target_health') {
                const tgArn = str(payload['target_group_arn']);
                if (!tgArn) return { ok: false, output: '', errorOutput: 'target_group_arn required' };
                const args   = buildAlbDescribeTargetGroupHealthArgs(tgArn, str(payload['region']) || undefined);
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'describe_target_health', raw: result.stdout.slice(0, 2000), summary: 'Target group health described.' });
            }

            if (lbAction === 'create_rule' || lbAction === 'modify_rule') {
                const listenerArn      = str(payload['listener_arn']);
                if (!listenerArn) return { ok: false, output: '', errorOutput: 'listener_arn required' };
                const conditionValues  = Array.isArray(payload['condition_values']) ? (payload['condition_values'] as string[]) : [];
                const args   = buildAlbListenerRuleArgs({
                    operation:       lbAction === 'create_rule' ? 'create' : 'modify',
                    listenerArn,
                    priority:        num(payload['priority'], 100),
                    conditionField:  (str(payload['condition_field'], 'path-pattern')) as 'host-header' | 'path-pattern',
                    conditionValues,
                    targetGroupArn:  str(payload['target_group_arn']) || undefined,
                    ruleArn:         str(payload['rule_arn']) || undefined,
                    region:          str(payload['region']) || undefined,
                });
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: lbAction, exit_code: result.exitCode, raw: result.stdout.slice(0, 1000), summary: result.exitCode === 0 ? `Listener rule ${lbAction}d.` : result.stderr.slice(0, 200) });
            }

            if (lbAction === 'delete_rule') {
                const ruleArn = str(payload['rule_arn']);
                if (!ruleArn) return { ok: false, output: '', errorOutput: 'rule_arn required for delete_rule' };
                const args   = buildAlbListenerRuleArgs({ operation: 'delete', listenerArn: '', ruleArn, region: str(payload['region']) || undefined });
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'delete_rule', rule_arn: ruleArn, exit_code: result.exitCode, summary: result.exitCode === 0 ? `Listener rule deleted.` : result.stderr.slice(0, 200) });
            }

            if (lbAction === 'patch_ingress') {
                const ingressName   = str(payload['name']);
                const namespace     = str(payload['namespace'], 'default');
                const annotations   = typeof payload['annotations'] === 'object' && payload['annotations'] !== null
                    ? (payload['annotations'] as Record<string, string>) : {};
                if (!ingressName) return { ok: false, output: '', errorOutput: 'name required for patch_ingress' };
                const args   = buildKubectlPatchIngressArgs({ name: ingressName, namespace, annotations });
                const result = await runCommand(args, workspaceDir, 15_000);
                return safeJson({ ok: result.exitCode === 0, action: 'patch_ingress', ingress: ingressName, namespace, exit_code: result.exitCode, summary: result.exitCode === 0 ? `Ingress "${ingressName}" annotations updated.` : result.stderr.slice(0, 200) });
            }

            if (lbAction === 'generate_ingress') {
                const name        = str(payload['name']);
                const namespace   = str(payload['namespace'], 'default');
                const host        = str(payload['host']);
                const serviceName = str(payload['service_name']);
                const servicePort = num(payload['service_port'], 80);
                if (!name || !host || !serviceName) return { ok: false, output: '', errorOutput: 'name, host, and service_name required for generate_ingress' };
                const annotations = typeof payload['annotations'] === 'object' && payload['annotations'] !== null ? (payload['annotations'] as Record<string, string>) : {};
                const yaml = buildIngressYaml({ name, namespace, host, serviceName, servicePort, tlsSecretName: str(payload['tls_secret_name']) || undefined, annotations, ingressClass: str(payload['ingress_class']) || undefined, pathPrefix: str(payload['path_prefix']) || undefined });
                const outputDir = str(payload['output_dir'], '.');
                const fp = outputDir !== '.' ? `${outputDir}/${name}-ingress.yaml` : `${name}-ingress.yaml`;
                await executeAction('workspace_write_file', { file_path: fp, content: yaml });
                return safeJson({ ok: true, action: 'generate_ingress', name, namespace, file_written: fp, summary: `Ingress manifest for "${host}" written to ${fp}.` });
            }

            return { ok: false, output: '', errorOutput: `Unknown lb action: ${lbAction}` };
        }

        // ====================================================================
        // workspace_devops_service_mesh
        // payload: action (generate|apply|analyze|proxy_status|proxy_config|
        //                   linkerd_check|linkerd_stat),
        //          provider (istio|linkerd, default: istio),
        //          app_name, namespace,
        //          [generate] services (array), features (object), description?, output_dir?
        //          [apply] manifest_path
        //          [analyze] files? (array)
        //          [proxy_status/proxy_config] pod, config_type?
        //          [linkerd_stat] resource_type?, resource_name?
        // ====================================================================
        case 'workspace_devops_service_mesh': {
            const meshAction = str(payload['action'], 'generate');
            const provider   = (str(payload['provider'], 'istio')) as MeshProvider;
            const appName    = str(payload['app_name']);
            const namespace  = str(payload['namespace'], 'default');
            const outputDir  = str(payload['output_dir'], '.');

            if (meshAction === 'generate') {
                if (!appName) return { ok: false, output: '', errorOutput: 'app_name required for generate' };

                const services   = Array.isArray(payload['services'])
                    ? (payload['services'] as Array<{ name: string; port: number; version?: string }>)
                    : [{ name: appName, port: num(payload['port'], 8080) }];

                const featuresRaw = typeof payload['features'] === 'object' && payload['features'] !== null
                    ? (payload['features'] as Record<string, unknown>) : {};

                let files: Array<{ filename: string; content: string }> = [];

                if (callLlm && str(payload['description'])) {
                    const prompt = buildServiceMeshPrompt({
                        provider, appName, namespace,
                        description: str(payload['description']),
                        services,
                        features: {
                            retries:       featuresRaw['retries']        !== false,
                            circuitBreaker: featuresRaw['circuit_breaker'] === true,
                            mtls:          featuresRaw['mtls']           === true,
                            rateLimiting:  featuresRaw['rate_limiting']  === true,
                            faultInjection: featuresRaw['fault_injection'] === true,
                            canaryTraffic: typeof featuresRaw['canary_traffic'] === 'object' && featuresRaw['canary_traffic'] !== null
                                ? (featuresRaw['canary_traffic'] as { stablePercent: number; canaryPercent: number }) : undefined,
                        },
                    });
                    const llmRaw = await callLlmSafe(callLlm, prompt, 'You are a service mesh expert. Return JSON only.');
                    files = parseServiceMeshOutput(llmRaw);
                }

                if (!files.length && provider === 'istio') {
                    // Direct YAML generation for common Istio patterns
                    const retryPolicy: IstioRetryPolicy | undefined = featuresRaw['retries'] !== false
                        ? { attempts: 3, perTryTimeout: '2s', retryOn: '5xx,gateway-error,reset' } : undefined;

                    const cbSpec: IstioCircuitBreaker | undefined = featuresRaw['circuit_breaker'] === true
                        ? { consecutiveGatewayErrors: 5, interval: '10s', baseEjectionTime: '30s', maxEjectionPercent: 10 } : undefined;

                    for (const svc of services) {
                        const vs = buildIstioVirtualServiceYaml({
                            name: `${svc.name}-vs`, namespace,
                            hosts: [svc.name],
                            timeout: str(payload['timeout'], '30s') || undefined,
                            retries: retryPolicy,
                            routes: [{ destinations: [{ host: svc.name, port: svc.port }] }],
                        });
                        files.push({ filename: `${svc.name}-virtual-service.yaml`, content: vs });

                        const dr = buildIstioDestinationRuleYaml({
                            name: `${svc.name}-dr`, namespace, host: svc.name,
                            loadBalancer: 'LEAST_CONN',
                            circuitBreaker: cbSpec,
                            mtls: featuresRaw['mtls'] === true ? 'STRICT' : undefined,
                        });
                        files.push({ filename: `${svc.name}-destination-rule.yaml`, content: dr });
                    }

                    if (featuresRaw['mtls'] === true) {
                        const pa = buildIstioPeerAuthYaml({ name: `${namespace}-mtls`, namespace, mode: 'STRICT' });
                        files.push({ filename: `${namespace}-peer-auth.yaml`, content: pa });
                    }
                }

                if (!files.length && provider === 'linkerd') {
                    for (const svc of services) {
                        const sp = buildLinkerdServiceProfileYaml({
                            name: `${svc.name}.${namespace}.svc.cluster.local`, namespace,
                            routes: [{ name: 'all-routes', condition: { pathRegex: '.*' }, timeout: str(payload['timeout'], '10s'), isRetryable: featuresRaw['retries'] !== false }],
                        });
                        files.push({ filename: `${svc.name}-service-profile.yaml`, content: sp });
                    }
                }

                const written: string[] = [];
                for (const f of files) {
                    const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                    await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                    written.push(fp);
                }
                return safeJson({ ok: true, action: 'generate', provider, app_name: appName, namespace, files_written: written, file_count: written.length, summary: `Generated ${written.length} ${provider} service mesh manifest(s) for "${appName}".` });
            }

            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };

            if (meshAction === 'apply') {
                const manifestPath = str(payload['manifest_path']);
                if (!manifestPath) return { ok: false, output: '', errorOutput: 'manifest_path required for apply' };
                const args   = ['kubectl', 'apply', '-f', manifestPath, '-n', namespace];
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'apply', provider, namespace, exit_code: result.exitCode, summary: result.exitCode === 0 ? 'Service mesh manifests applied.' : result.stderr.slice(0, 200) });
            }

            if (meshAction === 'analyze' && provider === 'istio') {
                const files  = Array.isArray(payload['files']) ? (payload['files'] as string[]) : undefined;
                const args   = buildIstioCtlAnalyzeArgs(namespace, files);
                const result = await runCommand(args, workspaceDir, 60_000);
                return safeJson({ ok: result.exitCode === 0, action: 'analyze', provider, output: result.stdout.slice(0, 3000), summary: result.exitCode === 0 ? `Istio analysis: no issues found.` : `Istio analysis found issues.` });
            }

            if (meshAction === 'proxy_status' && provider === 'istio') {
                const pod    = str(payload['pod']) || undefined;
                const args   = buildIstioCtlProxyStatusArgs(pod, namespace);
                const result = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'proxy_status', provider, output: result.stdout.slice(0, 3000), summary: 'Istio proxy status retrieved.' });
            }

            if (meshAction === 'proxy_config' && provider === 'istio') {
                const pod        = str(payload['pod']);
                if (!pod) return { ok: false, output: '', errorOutput: 'pod required for proxy_config' };
                const configType = (str(payload['config_type'], 'all')) as 'listener' | 'route' | 'cluster' | 'endpoint' | 'all';
                const args       = buildIstioCtlProxyConfigArgs(pod, namespace, configType);
                const result     = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'proxy_config', provider, pod, config_type: configType, output: result.stdout.slice(0, 4000), summary: `Proxy config (${configType}) for "${pod}" retrieved.` });
            }

            if (meshAction === 'linkerd_check' && provider === 'linkerd') {
                const args   = buildLinkerdCheckArgs(payload['pre_install'] === true);
                const result = await runCommand(args, workspaceDir, 60_000);
                return safeJson({ ok: result.exitCode === 0, action: 'linkerd_check', provider, output: result.stdout.slice(0, 3000), summary: result.exitCode === 0 ? 'Linkerd check passed.' : 'Linkerd check found issues.' });
            }

            if (meshAction === 'linkerd_stat' && provider === 'linkerd') {
                const resourceType = (str(payload['resource_type'], 'deployment')) as 'deployment' | 'pod' | 'namespace' | 'daemonset';
                const args         = buildLinkerdStatArgs(resourceType, namespace, str(payload['resource_name']) || undefined);
                const result       = await runCommand(args, workspaceDir, 30_000);
                return safeJson({ ok: result.exitCode === 0, action: 'linkerd_stat', provider, resource_type: resourceType, output: result.stdout.slice(0, 3000), summary: `Linkerd stat for ${resourceType} in "${namespace}" retrieved.` });
            }

            return { ok: false, output: '', errorOutput: `Unknown service_mesh action: ${meshAction}` };
        }

        // ====================================================================
        // workspace_devops_slo
        // payload: action (calculate|generate_sloth|generate_pyrra|generate_alerts|
        //                   generate_all|burn_rate_alerts),
        //          [calculate] objective (number), window_days, current_error_rate, elapsed_days?
        //          [generate_*] name, namespace, service, description, objective,
        //                       objective_type?, window?, good_metric, total_metric, output_dir?
        //          [generate_all] also calls LLM if description provided
        // ====================================================================
        case 'workspace_devops_slo': {
            const sloAction = str(payload['action'], 'calculate');

            if (sloAction === 'calculate') {
                const objective        = num(payload['objective'], 99.9);
                const windowDays       = num(payload['window_days'], 30);
                const currentErrorRate = typeof payload['current_error_rate'] === 'number'
                    ? (payload['current_error_rate'] as number) : 0;
                const elapsedDays = typeof payload['elapsed_days'] === 'number'
                    ? (payload['elapsed_days'] as number) : undefined;
                const status = calculateErrorBudget(objective, windowDays, currentErrorRate, elapsedDays);
                return safeJson({ ok: true, action: 'calculate', status, report: formatErrorBudgetReport(status), summary: `SLO ${objective}% (${windowDays}d): ${status.status.toUpperCase()}, burn rate ${status.burnRate.toFixed(2)}x` });
            }

            if (sloAction === 'burn_rate_alerts') {
                const sloName    = str(payload['slo_name'], 'my-slo');
                const objective  = num(payload['objective'], 99.9);
                const window     = str(payload['window'], '30d');
                const alerts     = buildBurnRateAlerts(sloName, objective, window);
                return safeJson({ ok: true, action: 'burn_rate_alerts', slo_name: sloName, alert_count: alerts.length, alerts, summary: `${alerts.length} multi-window burn-rate alert(s) generated for "${sloName}".` });
            }

            // All generate_* actions need a SloSpec
            const name       = str(payload['name'], 'my-slo');
            const namespace  = str(payload['namespace'], 'default');
            const service    = str(payload['service'], name);
            const description = str(payload['description'], `SLO for ${service}`);
            const objective   = num(payload['objective'], 99.9);
            const window      = str(payload['window'], '30d');
            const goodMetric  = str(payload['good_metric']);
            const totalMetric = str(payload['total_metric']);
            const outputDir   = str(payload['output_dir'], '.');

            if ((sloAction.startsWith('generate') || sloAction === 'generate_all') && callLlm && str(payload['description']) && !goodMetric) {
                const metrics = Array.isArray(payload['metrics']) ? (payload['metrics'] as string[]) : [];
                const prompt  = buildSloPrompt({
                    service, namespace, description: str(payload['description']),
                    metrics,
                    currentP99:       str(payload['current_p99'])        || undefined,
                    currentErrorRate: str(payload['current_error_rate']) || undefined,
                    environment:      (str(payload['environment'], 'production')) as 'production' | 'staging',
                });
                const llmRaw = await callLlmSafe(callLlm, prompt, 'You are an SRE expert. Return JSON only.');
                const files  = parseSloOutput(llmRaw);
                const written: string[] = [];
                for (const f of files) {
                    const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                    await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                    written.push(fp);
                }
                return safeJson({ ok: true, action: sloAction, service, files_written: written, summary: `Generated ${written.length} SLO file(s) for "${service}" via LLM.` });
            }

            if (!goodMetric || !totalMetric) {
                return { ok: false, output: '', errorOutput: 'good_metric and total_metric required for SLO generation (or provide description + metrics for LLM generation)' };
            }

            const spec: SloSpec = {
                name, namespace, service, description, objective, window,
                objectiveType: (str(payload['objective_type'], 'availability')) as SloSpec['objectiveType'],
                sli: { name: `${name}-sli`, description, sloName: name, goodMetric, totalMetric },
                labels: typeof payload['labels'] === 'object' && payload['labels'] !== null ? (payload['labels'] as Record<string, string>) : undefined,
            };

            const files: Array<{ filename: string; content: string }> = [];

            if (sloAction === 'generate_sloth' || sloAction === 'generate_all') {
                files.push({ filename: `${name}-sloth.yaml`, content: buildSlothSloYaml(spec) });
            }
            if (sloAction === 'generate_pyrra' || sloAction === 'generate_all') {
                files.push({ filename: `${name}-pyrra.yaml`, content: buildPyrraObjectiveYaml(spec) });
            }
            if (sloAction === 'generate_alerts' || sloAction === 'generate_all') {
                files.push({ filename: `${name}-prometheus-rule.yaml`, content: buildSloAlertRulesCrd(spec) });
            }
            if (!files.length) {
                return { ok: false, output: '', errorOutput: `Unknown slo action: ${sloAction}` };
            }

            const written: string[] = [];
            for (const f of files) {
                const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                written.push(fp);
            }
            return safeJson({ ok: true, action: sloAction, slo_name: name, service, objective, window, files_written: written, summary: `Generated ${written.length} SLO manifest(s) for "${service}" (${objective}% over ${window}).` });
        }

        // ====================================================================
        // workspace_devops_compliance_scan
        // payload: action (run_kube_bench|run_kube_bench_job|get_job_logs|
        //                   falco_status|falco_logs|falco_generate_rules|
        //                   falco_apply_rules|falco_hardened_rules),
        //          namespace?, targets? (array), output_format?, image_tag?
        //          [falco_generate_rules] description, threat, service
        //          [falco_apply_rules] rules_file | rules (FalcoRule[])
        //          [run_kube_bench] analyze_failures? (calls LLM), service, environment?
        // ====================================================================
        case 'workspace_devops_compliance_scan': {
            const compAction = str(payload['action'], 'run_kube_bench');
            const namespace  = str(payload['namespace'], 'kube-system');

            if (compAction === 'run_kube_bench') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const targets = Array.isArray(payload['targets']) ? (payload['targets'] as ComplianceTarget[]) : undefined;
                const args    = buildKubeBenchArgs({ targets, outputFormat: 'json' });
                const result  = await runCommand(args, workspaceDir, 300_000);
                const parsed  = parseKubeBenchOutput(result.stdout);
                const report  = formatComplianceReport(parsed);
                let remediation = null;
                if (callLlm && payload['analyze_failures'] !== false && parsed.totals.fail > 0) {
                    const service  = str(payload['service'], 'cluster');
                    const env      = (str(payload['environment'], 'production')) as 'production' | 'staging';
                    const failedChecks = parsed.controls.flatMap((c) => c.tests.filter((t) => t.result === 'FAIL'));
                    const prompt   = buildComplianceScanPrompt({ service, failedChecks, environment: env });
                    remediation    = await callLlmSafe(callLlm, prompt, 'You are a Kubernetes security expert. Return JSON only.');
                }
                return safeJson({ ok: result.exitCode === 0, action: 'run_kube_bench', totals: parsed.totals, controls: parsed.controls.length, report, remediation, summary: `kube-bench: ${parsed.totals.pass} PASS, ${parsed.totals.fail} FAIL, ${parsed.totals.warn} WARN` });
            }

            if (compAction === 'run_kube_bench_job') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const targets   = Array.isArray(payload['targets']) ? (payload['targets'] as ComplianceTarget[]) : undefined;
                const jobYaml   = buildKubeBenchJobYaml({ namespace, imageTag: str(payload['image_tag']) || undefined, targets });
                const jobFile   = `/tmp/kube-bench-job.yaml`;
                await executeAction('workspace_write_file', { file_path: jobFile, content: jobYaml });
                const applyRes  = await runCommand(['kubectl', 'apply', '-f', jobFile], workspaceDir, 15_000);
                return safeJson({ ok: applyRes.exitCode === 0, action: 'run_kube_bench_job', namespace, job_file: jobFile, exit_code: applyRes.exitCode, summary: applyRes.exitCode === 0 ? `kube-bench Job created in "${namespace}". Use get_job_logs to retrieve results.` : applyRes.stderr.slice(0, 200) });
            }

            if (compAction === 'get_job_logs') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const args   = buildKubeBenchLogsArgs(namespace);
                const result = await runCommand(args, workspaceDir, 30_000);
                const parsed = parseKubeBenchOutput(result.stdout);
                const report = formatComplianceReport(parsed);
                return safeJson({ ok: result.exitCode === 0, action: 'get_job_logs', totals: parsed.totals, report, raw: result.stdout.slice(0, 4000), summary: `kube-bench logs: ${parsed.totals.pass} PASS, ${parsed.totals.fail} FAIL` });
            }

            if (compAction === 'falco_status') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const ns     = str(payload['falco_namespace'], 'falco');
                const args   = buildFalcoStatusArgs(ns);
                const result = await runCommand(args, workspaceDir, 15_000);
                return safeJson({ ok: result.exitCode === 0, action: 'falco_status', namespace: ns, raw: result.stdout.slice(0, 2000), summary: result.exitCode === 0 ? 'Falco DaemonSet status retrieved.' : result.stderr.slice(0, 200) });
            }

            if (compAction === 'falco_logs') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const ns     = str(payload['falco_namespace'], 'falco');
                const tail   = num(payload['tail_lines'], 200);
                const args   = buildFalcoLogsArgs(ns, tail);
                const result = await runCommand(args, workspaceDir, 30_000);
                const alerts = parseFalcoAlerts(result.stdout);
                return safeJson({ ok: result.exitCode === 0, action: 'falco_logs', namespace: ns, alerts, alert_count: alerts.length, raw: result.stdout.slice(0, 4000), summary: `Falco: ${alerts.length} alert(s) found.` });
            }

            if (compAction === 'falco_hardened_rules') {
                const ns     = str(payload['falco_namespace'], 'falco');
                const cmName = str(payload['configmap_name'], 'falco-hardened-rules');
                const yaml   = buildFalcoRulesConfigMapYaml(FALCO_HARDENED_RULES, { name: cmName, namespace: ns });
                const outputDir = str(payload['output_dir'], '.');
                const fp     = outputDir !== '.' ? `${outputDir}/${cmName}.yaml` : `${cmName}.yaml`;
                await executeAction('workspace_write_file', { file_path: fp, content: yaml });
                return safeJson({ ok: true, action: 'falco_hardened_rules', file_written: fp, rule_count: FALCO_HARDENED_RULES.length, summary: `${FALCO_HARDENED_RULES.length} hardened Falco rules written to ${fp}.` });
            }

            if (compAction === 'falco_generate_rules') {
                if (!callLlm) return { ok: false, output: '', errorOutput: 'LLM not available for rule generation' };
                const service     = str(payload['service'], 'my-service');
                const description = str(payload['description']);
                const threat      = str(payload['threat']);
                if (!description || !threat) return { ok: false, output: '', errorOutput: 'description and threat required for falco_generate_rules' };
                const ns       = str(payload['falco_namespace'], 'falco');
                const prompt   = buildFalcoRulePrompt({ service, description, threat, namespace: ns });
                const llmRaw   = await callLlmSafe(callLlm, prompt, 'You are a Falco security expert. Return JSON only.');
                const files    = parseLoadTestScriptOutput(llmRaw); // same JSON array shape { filename, content }
                const outputDir = str(payload['output_dir'], '.');
                const written: string[] = [];
                for (const f of files) {
                    const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                    await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                    written.push(fp);
                }
                return safeJson({ ok: true, action: 'falco_generate_rules', service, files_written: written, summary: `Generated ${written.length} Falco rule file(s) for "${service}".` });
            }

            if (compAction === 'falco_apply_rules') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const ns = str(payload['falco_namespace'], 'falco');
                // Apply rules from file path
                const rulesFile = str(payload['rules_file']);
                if (rulesFile) {
                    const applyArgs    = ['kubectl', 'apply', '-f', rulesFile, '-n', ns];
                    const applyResult  = await runCommand(applyArgs, workspaceDir, 15_000);
                    if (!applyResult.exitCode) {
                        await runCommand(buildFalcoRestartArgs(ns), workspaceDir, 30_000).catch(() => null);
                    }
                    return safeJson({ ok: applyResult.exitCode === 0, action: 'falco_apply_rules', namespace: ns, rules_file: rulesFile, exit_code: applyResult.exitCode, summary: applyResult.exitCode === 0 ? `Falco rules applied from "${rulesFile}". DaemonSet restarted.` : applyResult.stderr.slice(0, 200) });
                }
                // Apply inline rules
                const rulesRaw = payload['rules'];
                if (!Array.isArray(rulesRaw)) return { ok: false, output: '', errorOutput: 'rules_file or rules array required' };
                const rules   = rulesRaw as FalcoRule[];
                const cmName  = str(payload['configmap_name'], 'falco-custom-rules');
                const yaml    = buildFalcoRulesConfigMapYaml(rules, { name: cmName, namespace: ns });
                const tmpFile = `/tmp/${cmName}.yaml`;
                await executeAction('workspace_write_file', { file_path: tmpFile, content: yaml });
                const applyResult = await runCommand(['kubectl', 'apply', '-f', tmpFile, '-n', ns], workspaceDir, 15_000);
                if (applyResult.exitCode === 0) {
                    await runCommand(buildFalcoRestartArgs(ns), workspaceDir, 30_000).catch(() => null);
                }
                return safeJson({ ok: applyResult.exitCode === 0, action: 'falco_apply_rules', namespace: ns, rule_count: rules.length, exit_code: applyResult.exitCode, summary: applyResult.exitCode === 0 ? `${rules.length} Falco rule(s) applied. DaemonSet restarted.` : applyResult.stderr.slice(0, 200) });
            }

            return { ok: false, output: '', errorOutput: `Unknown compliance_scan action: ${compAction}` };
        }

        // ====================================================================
        // workspace_devops_registry
        // payload: action (list_images|list_repos|delete_images|put_lifecycle_policy|
        //                   list_versions|delete_version|list_gcr|delete_gcr|
        //                   show_acr_tags|purge_acr|mirror_image|crane_copy|
        //                   apply_retention),
        //          provider (ecr|ghcr|gcr|gar|acr), repository,
        //          [ecr] region?, registry_id?
        //          [delete_images] image_digests (array) — requires allow_destructive: true
        //          [put_lifecycle_policy] keep_latest?, max_age_days?, keep_tag_prefixes?
        //          [ghcr] owner, package_name, token, version_id?
        //          [acr] registry, filter?, ago?, keep_latest?, dry_run?
        //          [mirror] source_image, dest_registry, dest_repo, dest_tag?, tool?
        //          [apply_retention] tags (ImageTag[]), retention_policy (RetentionPolicy)
        // ====================================================================
        case 'workspace_devops_registry': {
            const regAction  = str(payload['action'], 'list_images');
            const provider   = (str(payload['provider'], 'ecr')) as RegistryProvider;
            const repository = str(payload['repository']);

            const isDestructive = ['delete_images', 'delete_version', 'delete_gcr', 'purge_acr'].includes(regAction);
            if (isDestructive && payload['allow_destructive'] !== true) {
                return { ok: false, output: '', errorOutput: `Registry delete operations require allow_destructive: true` };
            }

            if (provider === 'ecr') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const region = str(payload['region']) || undefined;

                if (regAction === 'list_repos') {
                    const args   = buildEcrDescribeReposArgs(region, str(payload['registry_id']) || undefined);
                    const result = await runCommand(args, workspaceDir, 30_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'list_repos', provider, raw: result.stdout.slice(0, 4000), summary: 'ECR repositories listed.' });
                }

                if (!repository) return { ok: false, output: '', errorOutput: 'repository required for ECR operations' };

                if (regAction === 'list_images') {
                    const args   = buildEcrListImagesArgs({ repository, region, filter: (str(payload['filter']) as 'TAGGED' | 'UNTAGGED') || undefined });
                    const result = await runCommand(args, workspaceDir, 30_000);
                    const images = parseEcrImages(result.stdout);
                    return safeJson({ ok: result.exitCode === 0, action: 'list_images', provider, repository, image_count: images.length, images: images.slice(0, 50), summary: `${images.length} image(s) in ECR repo "${repository}".` });
                }

                if (regAction === 'delete_images') {
                    const digests = Array.isArray(payload['image_digests']) ? (payload['image_digests'] as string[]) : [];
                    if (!digests.length) return { ok: false, output: '', errorOutput: 'image_digests array required for delete_images' };
                    const args   = buildEcrDeleteImagesArgs({ repository, imageDigests: digests, region });
                    const result = await runCommand(args, workspaceDir, 30_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'delete_images', provider, repository, deleted_count: digests.length, exit_code: result.exitCode, summary: result.exitCode === 0 ? `Deleted ${digests.length} image(s) from "${repository}".` : result.stderr.slice(0, 200) });
                }

                if (regAction === 'put_lifecycle_policy') {
                    const policyJson = buildEcrLifecyclePolicyJson({
                        keepLatestCount:  num(payload['keep_latest'], 10),
                        maxTaggedAgeDays: typeof payload['max_age_days'] === 'number' ? (payload['max_age_days'] as number) : undefined,
                        keepTagPrefixes:  Array.isArray(payload['keep_tag_prefixes']) ? (payload['keep_tag_prefixes'] as string[]) : undefined,
                    });
                    const args   = buildEcrPutLifecyclePolicyArgs({ repository, policyJson, region });
                    const result = await runCommand(args, workspaceDir, 30_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'put_lifecycle_policy', provider, repository, exit_code: result.exitCode, policy: JSON.parse(policyJson), summary: result.exitCode === 0 ? `ECR lifecycle policy applied to "${repository}".` : result.stderr.slice(0, 200) });
                }

                if (regAction === 'apply_retention') {
                    // List images, apply retention, delete what's unwanted
                    const listArgs   = buildEcrListImagesArgs({ repository, region });
                    const listResult = await runCommand(listArgs, workspaceDir, 30_000);
                    const images     = parseEcrImages(listResult.stdout);
                    const policy: RetentionPolicy = {
                        keepLatest:      typeof payload['keep_latest']       === 'number' ? (payload['keep_latest'] as number)       : undefined,
                        keepTagPattern:  str(payload['keep_tag_pattern'])    || undefined,
                        maxAgeDays:      typeof payload['max_age_days']      === 'number' ? (payload['max_age_days'] as number)      : undefined,
                        keepTags:        Array.isArray(payload['keep_tags']) ? (payload['keep_tags'] as string[]) : undefined,
                    };
                    const { keep, delete: toDelete } = applyRetentionPolicy(images, policy);
                    const report = formatRegistryCleanupReport(toDelete, keep);
                    if (!toDelete.length || payload['dry_run'] === true) {
                        return safeJson({ ok: true, action: 'apply_retention', dry_run: payload['dry_run'] === true, provider, repository, kept: keep.length, to_delete: toDelete.length, report, summary: payload['dry_run'] ? `Dry run: ${toDelete.length} image(s) would be deleted.` : 'Nothing to delete.' });
                    }
                    const digests = toDelete.filter((t) => t.digest).map((t) => t.digest as string);
                    if (digests.length) {
                        const delArgs   = buildEcrDeleteImagesArgs({ repository, imageDigests: digests, region });
                        await runCommand(delArgs, workspaceDir, 60_000);
                    }
                    return safeJson({ ok: true, action: 'apply_retention', provider, repository, kept: keep.length, deleted: toDelete.length, report, summary: report });
                }
            }

            if (provider === 'ghcr') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const owner       = str(payload['owner']);
                const packageName = str(payload['package_name'], repository);
                const token       = str(payload['token']);
                if (!owner || !token) return { ok: false, output: '', errorOutput: 'owner and token required for ghcr' };

                if (regAction === 'list_versions') {
                    const args   = buildGhcrListVersionsArgs({ owner, packageName, token, perPage: num(payload['per_page'], 100) });
                    const result = await runCommand(args, workspaceDir, 30_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'list_versions', provider, package: packageName, raw: result.stdout.slice(0, 4000), summary: `GHCR versions listed for "${packageName}".` });
                }

                if (regAction === 'delete_version') {
                    const versionId = num(payload['version_id'], 0);
                    if (!versionId) return { ok: false, output: '', errorOutput: 'version_id required for delete_version' };
                    const args   = buildGhcrDeleteVersionArgs({ owner, packageName, versionId, token });
                    const result = await runCommand(args, workspaceDir, 15_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'delete_version', provider, package: packageName, version_id: versionId, exit_code: result.exitCode, summary: result.exitCode === 0 ? `GHCR version ${versionId} of "${packageName}" deleted.` : result.stderr.slice(0, 200) });
                }
            }

            if (provider === 'gcr' || provider === 'gar') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };

                if (regAction === 'list_gcr') {
                    if (!repository) return { ok: false, output: '', errorOutput: 'repository required' };
                    const args   = buildGcloudImagesListArgs({ repository, project: str(payload['project']) || undefined });
                    const result = await runCommand(args, workspaceDir, 30_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'list_gcr', provider, repository, raw: result.stdout.slice(0, 4000), summary: `GCR images listed for "${repository}".` });
                }

                if (regAction === 'delete_gcr') {
                    const imageWithDigest = str(payload['image_with_digest']);
                    if (!imageWithDigest) return { ok: false, output: '', errorOutput: 'image_with_digest required' };
                    const args   = buildGcloudImagesDeleteArgs({ imageWithDigest, project: str(payload['project']) || undefined, force: payload['force'] === true });
                    const result = await runCommand(args, workspaceDir, 30_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'delete_gcr', provider, image: imageWithDigest, exit_code: result.exitCode, summary: result.exitCode === 0 ? `GCR image deleted: ${imageWithDigest}` : result.stderr.slice(0, 200) });
                }
            }

            if (provider === 'acr') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const registry = str(payload['registry']);
                if (!registry) return { ok: false, output: '', errorOutput: 'registry required for ACR' };

                if (regAction === 'show_acr_tags') {
                    const args   = buildAcrShowTagsArgs({ registry, repository: repository || str(payload['repo']), orderby: 'time_desc', top: num(payload['top'], 50) || undefined, subscription: str(payload['subscription']) || undefined });
                    const result = await runCommand(args, workspaceDir, 30_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'show_acr_tags', provider, registry, repository, raw: result.stdout.slice(0, 4000), summary: `ACR tags listed for "${registry}/${repository}".` });
                }

                if (regAction === 'purge_acr') {
                    const filter = str(payload['filter'], `${repository}:.*`);
                    const ago    = str(payload['ago'], '30d');
                    const args   = buildAcrPurgePolicyArgs({ registry, filter, ago, keepLatest: typeof payload['keep_latest'] === 'number' ? (payload['keep_latest'] as number) : undefined, dryRun: payload['dry_run'] === true, subscription: str(payload['subscription']) || undefined });
                    const result = await runCommand(args, workspaceDir, 120_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'purge_acr', provider, registry, filter, ago, dry_run: payload['dry_run'] === true, exit_code: result.exitCode, raw: result.stdout.slice(0, 2000), summary: result.exitCode === 0 ? `ACR purge completed for "${registry}" (filter: ${filter}, ago: ${ago}).` : result.stderr.slice(0, 200) });
                }
            }

            // Mirror / copy actions (provider-agnostic)
            if (regAction === 'mirror_image') {
                const sourceImage  = str(payload['source_image']);
                const destRegistry = str(payload['dest_registry']);
                const destRepo     = str(payload['dest_repo'], repository);
                const tool         = str(payload['tool'], 'docker');
                if (!sourceImage || !destRegistry || !destRepo) return { ok: false, output: '', errorOutput: 'source_image, dest_registry, and dest_repo required for mirror_image' };

                if (tool === 'crane') {
                    if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                    const destTag   = str(payload['dest_tag']) || undefined;
                    const destImage = `${destRegistry}/${destRepo}${destTag ? ':' + destTag : ''}`;
                    const args      = buildCraneCopyArgs(sourceImage, destImage, str(payload['platform']) || undefined);
                    const result    = await runCommand(args, workspaceDir, 300_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'mirror_image', tool: 'crane', source: sourceImage, dest: destImage, exit_code: result.exitCode, summary: result.exitCode === 0 ? `crane copy ${sourceImage} → ${destImage}` : result.stderr.slice(0, 200) });
                }

                if (tool === 'skopeo') {
                    if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                    const destTag   = str(payload['dest_tag']) || undefined;
                    const destImage = `${destRegistry}/${destRepo}${destTag ? ':' + destTag : ''}`;
                    const args      = buildSkopeoCopyArgs({ source: sourceImage, dest: destImage, srcCreds: str(payload['src_creds']) || undefined, destCreds: str(payload['dest_creds']) || undefined, all: payload['all'] === true });
                    const result    = await runCommand(args, workspaceDir, 300_000);
                    return safeJson({ ok: result.exitCode === 0, action: 'mirror_image', tool: 'skopeo', source: sourceImage, dest: destImage, exit_code: result.exitCode, summary: result.exitCode === 0 ? `skopeo copy ${sourceImage} → ${destImage}` : result.stderr.slice(0, 200) });
                }

                // Default: docker pull / tag / push
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const { pull, tag, push } = buildDockerMirrorCommands({ sourceImage, destRegistry, destRepo, destTag: str(payload['dest_tag']) || undefined });
                await runCommand(pull, workspaceDir, 300_000);
                await runCommand(tag,  workspaceDir, 10_000);
                const pushResult = await runCommand(push, workspaceDir, 300_000);
                const destImage  = push[push.length - 1];
                return safeJson({ ok: pushResult.exitCode === 0, action: 'mirror_image', tool: 'docker', source: sourceImage, dest: destImage, exit_code: pushResult.exitCode, summary: pushResult.exitCode === 0 ? `Docker mirror ${sourceImage} → ${destImage}` : pushResult.stderr.slice(0, 200) });
            }

            if (regAction === 'crane_copy') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const source = str(payload['source']);
                const dest   = str(payload['dest']);
                if (!source || !dest) return { ok: false, output: '', errorOutput: 'source and dest required for crane_copy' };
                const args   = buildCraneCopyArgs(source, dest, str(payload['platform']) || undefined);
                const result = await runCommand(args, workspaceDir, 300_000);
                return safeJson({ ok: result.exitCode === 0, action: 'crane_copy', source, dest, exit_code: result.exitCode, summary: result.exitCode === 0 ? `crane copy ${source} → ${dest}` : result.stderr.slice(0, 200) });
            }

            return { ok: false, output: '', errorOutput: `Unknown registry action: ${regAction} for provider: ${provider}` };
        }

        // ====================================================================
        // workspace_devops_load_test
        // payload: action (generate_k6|generate_gatling_script|run_k6|run_gatling|
        //                   run_jmeter|compare),
        //          [generate_k6] base_url (required), scenario_name?, vus?, duration?,
        //                        endpoints? (array of {method,path,body?,headers?,expectedStatus?,name?}),
        //                        thresholds? (array of {metric,condition}), description?
        //          [run_k6] script_path (required), output_json?, env_vars?
        //          [run_gatling] simulation_class (required), results_dir?, jvm_opts?, gatling_home?
        //          [run_jmeter] jmx_path (required), results_path?, report_dir?,
        //                        properties?, threads?, duration_seconds?
        //          [compare] baseline (LoadTestResult), current (LoadTestResult),
        //                    regression_threshold?
        // ====================================================================
        case 'workspace_devops_load_test': {
            const ltAction = str(payload['action'], 'generate_k6');

            if (ltAction === 'generate_k6') {
                const baseUrl   = str(payload['base_url']) || str(payload['target_url'], 'http://localhost:8080');
                const outputDir = str(payload['output_dir'], '.');

                const scenarioName = str(payload['scenario_name'], 'load-test');
                const vus          = typeof payload['vus']      === 'number' ? (payload['vus'] as number) : 10;
                const duration     = str(payload['duration'], '5m');
                const rampUpTime   = str(payload['ramp_up_time']) || undefined;

                const rawEndpoints = Array.isArray(payload['endpoints'])
                    ? (payload['endpoints'] as Array<{method?:string;path:string;body?:string;headers?:Record<string,string>;expectedStatus?:number;name?:string}>)
                    : [{ method: str(payload['http_method'], 'GET'), path: str(payload['path'], '/'), body: str(payload['body']) || undefined, expectedStatus: typeof payload['expected_status'] === 'number' ? (payload['expected_status'] as number) : 200 }];

                const endpoints = rawEndpoints.map((e) => ({
                    method:         (e.method ?? 'GET').toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
                    path:           e.path,
                    body:           e.body,
                    headers:        e.headers,
                    expectedStatus: e.expectedStatus ?? 200,
                    name:           e.name,
                }));

                const rawThresholds = Array.isArray(payload['thresholds'])
                    ? (payload['thresholds'] as Array<{metric:string;condition:string}>)
                    : undefined;

                const scenario: LoadTestScenario = { name: scenarioName, baseUrl, endpoints, vus, duration, rampUpTime, thresholds: rawThresholds };

                if (callLlm && str(payload['description'])) {
                    const prompt = buildK6ScriptPrompt({ scenario, description: str(payload['description']), advanced: payload['advanced'] === true });
                    const llmRaw = await callLlmSafe(callLlm, prompt, 'You are a performance testing expert. Return JSON only.');
                    const files  = parseLoadTestScriptOutput(llmRaw);
                    if (files.length) {
                        const written: string[] = [];
                        for (const f of files) {
                            const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                            await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                            written.push(fp);
                        }
                        return safeJson({ ok: true, action: 'generate_k6', files_written: written, summary: `Generated ${written.length} k6 script file(s) via LLM.` });
                    }
                }

                // Direct script generation
                const script     = buildK6Script(scenario);
                const scriptName = `${scenarioName}.js`;
                const fp         = outputDir !== '.' ? `${outputDir}/${scriptName}` : scriptName;
                await executeAction('workspace_write_file', { file_path: fp, content: script });
                return safeJson({ ok: true, action: 'generate_k6', file_written: fp, summary: `k6 script written to ${fp}.` });
            }

            if (ltAction === 'generate_gatling_script') {
                if (!callLlm) return { ok: false, output: '', errorOutput: 'LLM not available' };
                const baseUrl   = str(payload['base_url']) || str(payload['target_url']);
                const outputDir = str(payload['output_dir'], '.');
                if (!baseUrl) return { ok: false, output: '', errorOutput: 'base_url required' };

                const scenarioName = str(payload['scenario_name'], 'gatling-test');
                const rawEndpoints = Array.isArray(payload['endpoints'])
                    ? (payload['endpoints'] as Array<{method?:string;path:string;body?:string;headers?:Record<string,string>;expectedStatus?:number;name?:string}>)
                    : [{ method: 'GET', path: '/' }];
                const endpoints = rawEndpoints.map((e) => ({
                    method: (e.method ?? 'GET').toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
                    path: e.path, body: e.body, headers: e.headers, expectedStatus: e.expectedStatus ?? 200, name: e.name,
                }));
                const scenario: LoadTestScenario = {
                    name: scenarioName, baseUrl, endpoints,
                    vus:         typeof payload['vus'] === 'number' ? (payload['vus'] as number) : undefined,
                    duration:    str(payload['duration']) || undefined,
                    rampUpTime:  str(payload['ramp_up_time']) || undefined,
                };
                const prompt = buildGatlingScriptPrompt({ scenario, description: str(payload['description']) || 'Load test', packageName: str(payload['package_name']) || undefined });
                const llmRaw = await callLlmSafe(callLlm, prompt, 'You are a Gatling expert. Return JSON only.');
                const files  = parseLoadTestScriptOutput(llmRaw);
                const written: string[] = [];
                for (const f of files) {
                    const fp = outputDir !== '.' ? `${outputDir}/${f.filename}` : f.filename;
                    await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                    written.push(fp);
                }
                return safeJson({ ok: true, action: 'generate_gatling_script', files_written: written, summary: `Generated ${written.length} Gatling script file(s).` });
            }

            if (ltAction === 'run_k6') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const scriptPath = str(payload['script_path']);
                if (!scriptPath) return { ok: false, output: '', errorOutput: 'script_path required for run_k6' };
                const outputJson = str(payload['output_json']) || undefined;
                const envVars    = typeof payload['env_vars'] === 'object' && payload['env_vars'] !== null
                    ? (payload['env_vars'] as Record<string, string>) : undefined;
                const args   = buildK6RunArgs({ scriptPath, outputJson, envVars });
                const result = await runCommand(args, workspaceDir, num(payload['timeout_minutes'], 30) * 60_000);
                const scenarioName = str(payload['scenario_name'], 'k6-run');
                const ltr    = parseK6Output(outputJson ? '' : result.stdout, scenarioName);
                const report = formatLoadTestReport(ltr);
                return safeJson({ ok: result.exitCode === 0, action: 'run_k6', script: scriptPath, exit_code: result.exitCode, result: ltr, report, summary: `k6 run: ${result.exitCode === 0 ? 'passed' : 'failed'} — p95=${(ltr.p95Ms ?? 0).toFixed(0)}ms errors=${((ltr.errorRate ?? 0) * 100).toFixed(2)}%` });
            }

            if (ltAction === 'run_gatling') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const simulationClass = str(payload['simulation_class']);
                if (!simulationClass) return { ok: false, output: '', errorOutput: 'simulation_class required for run_gatling' };
                const args   = buildGatlingArgs({
                    simulationClass,
                    resultsDir:  str(payload['results_dir'])  || undefined,
                    jvmOpts:     str(payload['jvm_opts'])     || undefined,
                    gatlingHome: str(payload['gatling_home']) || undefined,
                    envVars:     typeof payload['env_vars'] === 'object' && payload['env_vars'] !== null ? (payload['env_vars'] as Record<string, string>) : undefined,
                });
                const result = await runCommand(args, workspaceDir, num(payload['timeout_minutes'], 30) * 60_000);
                return safeJson({ ok: result.exitCode === 0, action: 'run_gatling', simulation: simulationClass, exit_code: result.exitCode, output_tail: result.stdout.slice(-2000), summary: result.exitCode === 0 ? `Gatling simulation "${simulationClass}" completed.` : result.stderr.slice(0, 200) });
            }

            if (ltAction === 'run_jmeter') {
                if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
                const jmxPath = str(payload['jmx_path']) || str(payload['plan_path']);
                if (!jmxPath) return { ok: false, output: '', errorOutput: 'jmx_path required for run_jmeter' };
                const properties = typeof payload['properties'] === 'object' && payload['properties'] !== null
                    ? (payload['properties'] as Record<string, string>) : undefined;
                const args   = buildJMeterArgs({
                    jmxPath,
                    resultsPath: str(payload['results_path']) || undefined,
                    reportDir:   str(payload['report_dir'])   || undefined,
                    properties,
                    threads:     typeof payload['threads']           === 'number' ? (payload['threads'] as number)           : undefined,
                    duration:    typeof payload['duration_seconds']  === 'number' ? (payload['duration_seconds'] as number)  : undefined,
                    jmeterHome:  str(payload['jmeter_home'])         || undefined,
                });
                const result = await runCommand(args, workspaceDir, num(payload['timeout_minutes'], 60) * 60_000);
                return safeJson({ ok: result.exitCode === 0, action: 'run_jmeter', jmx: jmxPath, exit_code: result.exitCode, output_tail: result.stdout.slice(-2000), summary: result.exitCode === 0 ? `JMeter plan "${jmxPath}" completed.` : result.stderr.slice(0, 200) });
            }

            if (ltAction === 'compare') {
                const baseline = payload['baseline'] as Parameters<typeof compareBenchmarks>[0] | undefined;
                const current  = payload['current']  as Parameters<typeof compareBenchmarks>[1] | undefined;
                if (!baseline || !current) return { ok: false, output: '', errorOutput: 'baseline and current LoadTestResult objects required for compare' };
                const threshold  = typeof payload['regression_threshold'] === 'number' ? (payload['regression_threshold'] as number) : undefined;
                const comparison = compareBenchmarks(baseline, current, threshold);
                return safeJson({ ok: true, action: 'compare', comparison, regression: comparison.regression, summary: `Load test comparison: ${comparison.regression ? 'REGRESSION DETECTED' : 'no regression'}. p99 change: ${comparison.deltaPercent.toFixed(1)}%` });
            }

            return { ok: false, output: '', errorOutput: `Unknown load_test action: ${ltAction}` };
        }

        // ====================================================================
        // workspace_devops_metrics_query
        // payload: provider (prometheus|loki|elasticsearch|datadog|cloudwatch),
        //          action  (instant|range|logs|label_values|logs_insights_start|
        //                   logs_insights_result|analyze),
        //          url/prometheus_url/loki_url/es_url (backend URL),
        //          query, start?, end?, step?,
        //          bearer_token?, api_key?, app_key?, basic_auth?,
        //          query_id? (for logs_insights_result)
        // ====================================================================
        case 'workspace_devops_metrics_query': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const mqProvider = str(payload['provider'], 'prometheus');
            const mqAction   = str(payload['action'],   'instant');

            if (mqProvider === 'prometheus') {
                if (mqAction === 'instant') {
                    const args = buildPrometheusInstantQueryArgs({
                        prometheusUrl: str(payload['url'] ?? payload['prometheus_url'], ''),
                        query:         str(payload['query'], ''),
                        time:          str(payload['time'])       || undefined,
                        bearerToken:   str(payload['bearer_token']) || undefined,
                    });
                    const result = await runCommand(args, workspaceDir);
                    const parsed = parsePrometheusResult(result.stdout, str(payload['query'], ''));
                    return safeJson({ ok: result.exitCode === 0, provider: 'prometheus', action: 'instant', result: parsed, summary: `Prometheus instant query returned ${parsed.dataPoints.length} data point(s).` });
                }
                if (mqAction === 'range') {
                    const args = buildPrometheusRangeQueryArgs({
                        prometheusUrl: str(payload['url'] ?? payload['prometheus_url'], ''),
                        query:         str(payload['query'], ''),
                        start:         str(payload['start'], ''),
                        end:           str(payload['end'],   ''),
                        step:          str(payload['step'],  '60s'),
                        bearerToken:   str(payload['bearer_token']) || undefined,
                    });
                    const result = await runCommand(args, workspaceDir);
                    const parsed = parsePrometheusResult(result.stdout, str(payload['query'], ''));
                    return safeJson({ ok: result.exitCode === 0, provider: 'prometheus', action: 'range', result: parsed, summary: `Prometheus range query returned ${parsed.dataPoints.length} data point(s).` });
                }
                if (mqAction === 'analyze') {
                    const parsed = parsePrometheusResult(str(payload['raw_data'], ''), str(payload['query'], ''));
                    const prompt = buildMetricsAnalysisPrompt({
                        query:   str(payload['query'],   ''),
                        result:  parsed,
                        context: str(payload['context'], ''),
                        service: str(payload['service']) || undefined,
                    });
                    const llmOut  = await callLlmSafe(callLlm, prompt);
                    const analysis = parseMetricsAnalysis(llmOut);
                    return safeJson({ ok: true, analysis, report: formatMetricsReport(parsed, analysis) });
                }
            }

            if (mqProvider === 'loki') {
                const args = buildLokiRangeQueryArgs({
                    lokiUrl:     str(payload['url'] ?? payload['loki_url'], ''),
                    query:       str(payload['query'], ''),
                    start:       str(payload['start'])      || undefined,
                    end:         str(payload['end'])        || undefined,
                    limit:       typeof payload['limit'] === 'number' ? (payload['limit'] as number) : undefined,
                    bearerToken: str(payload['bearer_token']) || undefined,
                });
                const result = await runCommand(args, workspaceDir);
                const parsed = parseLokiResult(result.stdout, str(payload['query'], ''));
                return safeJson({ ok: result.exitCode === 0, provider: 'loki', result: parsed, summary: `Loki query returned ${parsed.dataPoints.length} log line(s).` });
            }

            if (mqProvider === 'elasticsearch') {
                const dslBody = str(payload['body']) || buildElasticsearchQueryDsl({
                    message:  str(payload['message'])  || undefined,
                    level:    str(payload['level'])    as ('ERROR' | 'WARN' | 'INFO' | 'DEBUG') || undefined,
                    service:  str(payload['service'])  || undefined,
                    traceId:  str(payload['trace_id']) || undefined,
                    from:     str(payload['start'])    || undefined,
                    to:       str(payload['end'])      || undefined,
                    size:     typeof payload['size'] === 'number' ? (payload['size'] as number) : undefined,
                });
                const args = buildElasticsearchSearchArgs({
                    url:       str(payload['url'] ?? payload['es_url'], ''),
                    index:     str(payload['index'], '_all'),
                    body:      dslBody,
                    apiKey:    str(payload['api_key'])   || undefined,
                    basicAuth: str(payload['basic_auth']) || undefined,
                });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, provider: 'elasticsearch', raw: result.stdout.slice(0, 3000) });
            }

            if (mqProvider === 'datadog') {
                if (mqAction === 'logs') {
                    const args = buildDatadogLogsQueryArgs({
                        apiKey:  str(payload['api_key'],  ''),
                        appKey:  str(payload['app_key'],  ''),
                        query:   str(payload['query'],    ''),
                        from:    str(payload['start'],    ''),
                        to:      str(payload['end'],      ''),
                        limit:   typeof payload['limit'] === 'number' ? (payload['limit'] as number) : undefined,
                        site:    str(payload['site'])    || undefined,
                    });
                    const result = await runCommand(args, workspaceDir);
                    return safeJson({ ok: result.exitCode === 0, provider: 'datadog', action: 'logs', raw: result.stdout.slice(0, 3000) });
                }
                const args = buildDatadogMetricQueryArgs({
                    apiKey:   str(payload['api_key'],  ''),
                    appKey:   str(payload['app_key'],  ''),
                    query:    str(payload['query'],    ''),
                    fromUnix: num(payload['from_unix'], Math.floor(Date.now() / 1000) - 3600),
                    toUnix:   num(payload['to_unix'],   Math.floor(Date.now() / 1000)),
                    site:     str(payload['site'])     || undefined,
                });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, provider: 'datadog', action: 'metrics', raw: result.stdout.slice(0, 3000) });
            }

            if (mqProvider === 'cloudwatch') {
                if (mqAction === 'logs_insights_start') {
                    const args = buildCloudWatchLogsInsightsStartArgs({
                        logGroup:  str(payload['log_group'],  ''),
                        query:     str(payload['query'],      ''),
                        startTime: num(payload['start_time'], Math.floor(Date.now() / 1000) - 3600),
                        endTime:   num(payload['end_time'],   Math.floor(Date.now() / 1000)),
                        region:    str(payload['region'])     || undefined,
                    });
                    const result = await runCommand(args, workspaceDir);
                    let queryId = '';
                    try { queryId = (JSON.parse(result.stdout) as { queryId?: string })['queryId'] ?? ''; } catch { /* ignore */ }
                    return safeJson({ ok: result.exitCode === 0, action: 'logs_insights_start', query_id: queryId });
                }
                if (mqAction === 'logs_insights_result') {
                    const args = buildCloudWatchLogsInsightsResultArgs(
                        str(payload['query_id'], ''),
                        str(payload['region'])  || undefined,
                    );
                    const result = await runCommand(args, workspaceDir);
                    return safeJson({ ok: result.exitCode === 0, action: 'logs_insights_result', raw: result.stdout.slice(0, 3000) });
                }
                const args = buildCloudWatchGetMetricArgs({
                    namespace:   str(payload['namespace'],   'AWS/EC2'),
                    metricName:  str(payload['metric_name'], 'CPUUtilization'),
                    dimensions:  typeof payload['dimensions'] === 'object' && payload['dimensions'] !== null ? (payload['dimensions'] as Record<string, string>) : {},
                    period:      num(payload['period'],       60),
                    stat:        str(payload['stat'],         'Average'),
                    startTime:   str(payload['start_time'],   new Date(Date.now() - 3600_000).toISOString()),
                    endTime:     str(payload['end_time'],     new Date().toISOString()),
                    region:      str(payload['region'])       || undefined,
                });
                const result = await runCommand(args, workspaceDir);
                const parsed = parseCloudWatchResult(result.stdout);
                return safeJson({ ok: result.exitCode === 0, provider: 'cloudwatch', result: parsed, summary: `CloudWatch returned ${parsed.dataPoints.length} data point(s).` });
            }

            return { ok: false, output: '', errorOutput: `Unknown metrics_query provider: ${mqProvider}` };
        }

        // ====================================================================
        // workspace_devops_db_admin
        // payload: action (explain|index_advice|vacuum|show_locks|kill_backend|
        //                   table_bloat|slow_queries|replication_lag|
        //                   patroni_status|patroni_switchover|patroni_failover|
        //                   patroni_pause|patroni_resume),
        //          pod (required), namespace, container?, db_name?,
        //          query? (for explain), pid? (for kill_backend),
        //          patroni_config_path?, leader?, candidate?
        // ====================================================================
        case 'workspace_devops_db_admin': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const dbAction   = str(payload['action'],    'show_locks');
            const dbPod      = str(payload['pod'],       '');
            const dbNs       = str(payload['namespace'], 'default');
            const dbDatabase = str(payload['db_name'],   'postgres');
            const dbCont     = str(payload['container']) || undefined;
            const dbCluster  = str(payload['cluster'])   || dbPod;

            if (!dbPod) return { ok: false, output: '', errorOutput: 'pod is required for db_admin' };

            if (dbAction === 'explain') {
                const query = str(payload['query'], '');
                if (!query) return { ok: false, output: '', errorOutput: 'query is required for explain' };
                const args   = buildExplainAnalyzeArgs({ pod: dbPod, namespace: dbNs, database: dbDatabase, query, container: dbCont });
                const result = await runCommand(args, workspaceDir);
                const plan   = parseExplainOutput(result.stdout);
                if (plan && payload['llm_analyze'] === true) {
                    const prompt = buildExplainAnalysisPrompt({ query, explainJson: result.stdout, database: dbDatabase });
                    const llmOut = await callLlmSafe(callLlm, prompt);
                    return safeJson({ ok: result.exitCode === 0, action: 'explain', plan, llm_analysis: llmOut });
                }
                return safeJson({ ok: result.exitCode === 0, action: 'explain', plan, raw: result.stdout.slice(0, 2000) });
            }

            if (dbAction === 'index_advice') {
                const args   = buildIndexAdvisorArgs({ pod: dbPod, namespace: dbNs, database: dbDatabase, container: dbCont });
                const result = await runCommand(args, workspaceDir);
                const prompt = buildIndexAdvisorPrompt({ database: dbDatabase, tableStats: result.stdout });
                const llmOut = await callLlmSafe(callLlm, prompt);
                return safeJson({ ok: result.exitCode === 0, action: 'index_advice', llm_analysis: llmOut, raw: result.stdout.slice(0, 1000) });
            }

            if (dbAction === 'vacuum') {
                if (payload['allow_destructive'] !== true) return { ok: false, output: '', errorOutput: 'allow_destructive: true required for vacuum' };
                const args   = buildVacuumAnalyzeArgs({
                    pod: dbPod, namespace: dbNs, database: dbDatabase, container: dbCont,
                    table:   str(payload['table'])   || undefined,
                    verbose: payload['verbose'] === true,
                    full:    payload['full']    === true,
                });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'vacuum', output: result.stdout.slice(0, 1000) });
            }

            if (dbAction === 'show_locks') {
                const args   = buildShowLocksArgs({ pod: dbPod, namespace: dbNs, database: dbDatabase, container: dbCont });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'show_locks', raw: result.stdout.slice(0, 3000) });
            }

            if (dbAction === 'kill_backend') {
                if (payload['allow_destructive'] !== true) return { ok: false, output: '', errorOutput: 'allow_destructive: true required for kill_backend' };
                const pid  = num(payload['pid'], 0);
                if (!pid) return { ok: false, output: '', errorOutput: 'pid is required for kill_backend' };
                const args   = buildKillBackendArgs({ pod: dbPod, namespace: dbNs, database: dbDatabase, pid, force: payload['terminate'] === true, container: dbCont });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'kill_backend', pid });
            }

            if (dbAction === 'table_bloat') {
                const args   = buildTableBloatArgs({ pod: dbPod, namespace: dbNs, database: dbDatabase, container: dbCont });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'table_bloat', raw: result.stdout.slice(0, 3000) });
            }

            if (dbAction === 'slow_queries') {
                const args   = buildSlowQueryArgs({ pod: dbPod, namespace: dbNs, database: dbDatabase, container: dbCont });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'slow_queries', raw: result.stdout.slice(0, 3000) });
            }

            if (dbAction === 'replication_lag') {
                const args   = buildReplicationLagArgs({ pod: dbPod, namespace: dbNs, database: dbDatabase, container: dbCont });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'replication_lag', raw: result.stdout.slice(0, 2000) });
            }

            if (dbAction === 'patroni_status') {
                const args   = buildPatroniStatusArgs({ pod: dbPod, namespace: dbNs, container: dbCont, configFile: str(payload['patroni_config_path']) || undefined });
                const result = await runCommand(args, workspaceDir);
                const status = parsePatroniStatus(result.stdout);
                return safeJson({ ok: result.exitCode === 0, action: 'patroni_status', status, summary: formatDbAdminReport({ action: 'patroni_status', patroni: status }) });
            }

            if (dbAction === 'patroni_switchover') {
                if (payload['allow_destructive'] !== true) return { ok: false, output: '', errorOutput: 'allow_destructive: true required for patroni_switchover' };
                const leader = str(payload['leader'], '');
                if (!leader) return { ok: false, output: '', errorOutput: 'leader is required for patroni_switchover' };
                const args   = buildPatroniSwitchoverArgs({ pod: dbPod, namespace: dbNs, cluster: dbCluster, leader, candidate: str(payload['candidate']) || undefined, container: dbCont });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'patroni_switchover', output: result.stdout.slice(0, 500) });
            }

            if (dbAction === 'patroni_failover') {
                if (payload['allow_destructive'] !== true) return { ok: false, output: '', errorOutput: 'allow_destructive: true required for patroni_failover' };
                const args   = buildPatroniFailoverArgs({ pod: dbPod, namespace: dbNs, cluster: dbCluster, candidate: str(payload['candidate']) || undefined, container: dbCont });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'patroni_failover', output: result.stdout.slice(0, 500) });
            }

            if (dbAction === 'patroni_pause' || dbAction === 'patroni_resume') {
                const action = dbAction === 'patroni_pause' ? 'pause' : 'resume';
                const args   = buildPatroniPauseResumeArgs({ pod: dbPod, namespace: dbNs, cluster: dbCluster, action, container: dbCont });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: dbAction });
            }

            return { ok: false, output: '', errorOutput: `Unknown db_admin action: ${dbAction}` };
        }

        // ====================================================================
        // workspace_devops_finops
        // payload: provider (aws|azure|gcp),
        //          action  (ri_utilization|savings_plan_coverage|rightsizing|
        //                   cost_forecast|cost_breakdown|trusted_advisor|
        //                   spot_prices|advisor_recommendations|ri_utilization_azure|
        //                   billing_accounts|recommender|unused_ips|idle_disks|analyze),
        //          start_date?, end_date?, region?, granularity?,
        //          group_by?, instance_types?, check_id?, budget?,
        //          project?, subscription?, scope?
        // ====================================================================
        case 'workspace_devops_finops': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const foProvider = str(payload['provider'], 'aws') as 'aws' | 'azure' | 'gcp';
            const foAction   = str(payload['action'],   'cost_breakdown');
            const foRegion   = str(payload['region'])  || undefined;
            const foStart    = str(payload['start_date'], new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10));
            const foEnd      = str(payload['end_date'],   new Date().toISOString().slice(0, 10));

            if (foAction === 'analyze') {
                const prompt = buildFinOpsPrompt({
                    provider:          foProvider,
                    riData:            str(payload['ri_data'])           || undefined,
                    rightsizingData:   str(payload['rightsizing_data'])   || undefined,
                    advisorData:       str(payload['advisor_data'])       || undefined,
                    costBreakdown:     str(payload['cost_breakdown'])     || undefined,
                    forecastData:      str(payload['forecast_data'])      || undefined,
                    budget:            typeof payload['budget'] === 'number' ? (payload['budget'] as number) : undefined,
                });
                const llmOut  = await callLlmSafe(callLlm, prompt);
                const findings = parseFinOpsOutput(llmOut);
                return safeJson({ ok: true, action: 'analyze', findings, report: formatFinOpsReport(findings) });
            }

            let foArgs: string[];
            if (foProvider === 'aws') {
                if (foAction === 'ri_utilization') {
                    foArgs = buildAwsRiUtilizationArgs({ startDate: foStart, endDate: foEnd, region: foRegion });
                } else if (foAction === 'savings_plan_coverage') {
                    foArgs = buildAwsSavingsPlanCoverageArgs({ startDate: foStart, endDate: foEnd, region: foRegion });
                } else if (foAction === 'rightsizing') {
                    foArgs = buildAwsRightsizingArgs({ region: foRegion });
                } else if (foAction === 'cost_forecast') {
                    foArgs = buildAwsCostForecastArgs({ startDate: foStart, endDate: foEnd, region: foRegion });
                } else if (foAction === 'cost_breakdown') {
                    foArgs = buildAwsCostBreakdownArgs({ startDate: foStart, endDate: foEnd, groupBy: str(payload['group_by']) as ('SERVICE') || undefined, region: foRegion });
                } else if (foAction === 'trusted_advisor') {
                    const checkId = str(payload['check_id']) || TRUSTED_ADVISOR_COST_CHECKS.UNDERUTILIZED_EC2;
                    // Refresh first
                    await runCommand(buildTrustedAdvisorRefreshArgs(checkId, foRegion ?? 'us-east-1'), workspaceDir);
                    foArgs = buildTrustedAdvisorArgs(checkId, foRegion ?? 'us-east-1');
                } else if (foAction === 'spot_prices') {
                    const instanceTypes = Array.isArray(payload['instance_types']) ? (payload['instance_types'] as string[]) : ['m5.large'];
                    foArgs = buildSpotPriceHistoryArgs({ instanceTypes, region: foRegion });
                } else {
                    return { ok: false, output: '', errorOutput: `Unknown AWS finops action: ${foAction}` };
                }
            } else if (foProvider === 'azure') {
                if (foAction === 'cost_breakdown') {
                    foArgs = buildAzureCostUsageArgs({ scope: str(payload['scope'], ''), startDate: foStart, endDate: foEnd, subscription: str(payload['subscription']) || undefined });
                } else if (foAction === 'advisor_recommendations') {
                    foArgs = buildAzureAdvisorRecommendationsArgs({ subscription: str(payload['subscription']) || undefined });
                } else if (foAction === 'ri_utilization_azure') {
                    foArgs = buildAzureReservationUtilizationArgs({ reservationOrderId: str(payload['reservation_order_id'], ''), startDate: foStart, endDate: foEnd, subscription: str(payload['subscription']) || undefined });
                } else {
                    return { ok: false, output: '', errorOutput: `Unknown Azure finops action: ${foAction}` };
                }
            } else {
                if (foAction === 'billing_accounts') {
                    foArgs = buildGcpBillingAccountListArgs();
                } else if (foAction === 'recommender') {
                    foArgs = buildGcpRecommenderListArgs({ project: str(payload['project'], ''), location: str(payload['location']) || undefined });
                } else if (foAction === 'unused_ips') {
                    foArgs = buildGcpUnusedIpListArgs(str(payload['project'], ''));
                } else if (foAction === 'idle_disks') {
                    foArgs = buildGcpIdleDisksArgs(str(payload['project'], ''));
                } else {
                    return { ok: false, output: '', errorOutput: `Unknown GCP finops action: ${foAction}` };
                }
            }

            const foResult = await runCommand(foArgs, workspaceDir);
            const foOut    = foResult.stdout.slice(0, 3000);
            return safeJson({ ok: foResult.exitCode === 0, provider: foProvider, action: foAction, raw: foOut });
        }

        // ====================================================================
        // workspace_devops_fleet
        // payload: action (cluster_list|cluster_add|cluster_remove|cluster_get|
        //                   applicationset_yaml|app_of_apps_yaml|capi_yaml|
        //                   fleet_gitrepo_yaml|fleet_status|kubectl_multi|
        //                   get_contexts|cluster_info|generate),
        //          Various params per action type (see builder for details)
        // ====================================================================
        case 'workspace_devops_fleet': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const flAction = str(payload['action'], 'cluster_list');

            if (flAction === 'cluster_list') {
                const args   = buildArgoCdClusterListArgs(str(payload['namespace']) || undefined);
                const result = await runCommand(args, workspaceDir);
                const clusters = parseArgoCdClusterList(result.stdout);
                return safeJson({ ok: result.exitCode === 0, clusters, summary: formatFleetStatus(clusters) });
            }

            if (flAction === 'cluster_add') {
                const args = buildArgoCdClusterAddArgs({
                    context:    str(payload['context'],   ''),
                    name:       str(payload['name'])      || undefined,
                    namespace:  str(payload['namespace']) || undefined,
                    inCluster:  payload['in_cluster'] === true,
                    upsert:     payload['upsert'] === true,
                });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'cluster_add', output: result.stdout.slice(0, 500) });
            }

            if (flAction === 'cluster_remove') {
                if (payload['allow_destructive'] !== true) return { ok: false, output: '', errorOutput: 'allow_destructive: true required for cluster_remove' };
                const args   = buildArgoCdClusterRemoveArgs(str(payload['cluster_name'], ''), str(payload['namespace']) || undefined);
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'cluster_remove', output: result.stdout.slice(0, 500) });
            }

            if (flAction === 'cluster_get') {
                const args   = buildArgoCdClusterGetArgs(str(payload['cluster_name'], ''));
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'cluster_get', raw: result.stdout.slice(0, 2000) });
            }

            if (flAction === 'applicationset_yaml') {
                const spec = payload['spec'] as ApplicationSetSpec | undefined;
                if (!spec) return { ok: false, output: '', errorOutput: 'spec (ApplicationSetSpec) required' };
                const yaml = buildApplicationSetYaml(spec);
                return safeJson({ ok: true, action: 'applicationset_yaml', yaml });
            }

            if (flAction === 'app_of_apps_yaml') {
                const spec = payload['spec'] as AppOfAppsSpec | undefined;
                if (!spec) return { ok: false, output: '', errorOutput: 'spec (AppOfAppsSpec) required' };
                const yaml = buildAppOfAppsYaml(spec);
                return safeJson({ ok: true, action: 'app_of_apps_yaml', yaml });
            }

            if (flAction === 'capi_yaml') {
                const yaml = buildCapiClusterYaml({
                    name:              str(payload['name'],         ''),
                    namespace:         str(payload['namespace'],    'default'),
                    k8sVersion:        str(payload['k8s_version'],  'v1.29.2'),
                    controlPlaneCount: typeof payload['control_plane_count'] === 'number' ? (payload['control_plane_count'] as number) : undefined,
                    workerCount:       typeof payload['worker_count']        === 'number' ? (payload['worker_count']        as number) : undefined,
                    provider:          str(payload['provider']) as ('aws' | 'azure' | 'gcp') || undefined,
                });
                return safeJson({ ok: true, action: 'capi_yaml', yaml });
            }

            if (flAction === 'fleet_gitrepo_yaml') {
                const yaml = buildFleetGitRepoYaml({
                    name:      str(payload['name'],      ''),
                    namespace: str(payload['namespace'], 'fleet-default'),
                    repoUrl:   str(payload['repo_url'],  ''),
                    revision:  str(payload['revision'],  'main'),
                    paths:     Array.isArray(payload['paths']) ? (payload['paths'] as string[]) : undefined,
                    targets:   Array.isArray(payload['targets']) ? (payload['targets'] as Array<{ name?: string; clusterSelector?: Record<string, string> }>) : undefined,
                });
                return safeJson({ ok: true, action: 'fleet_gitrepo_yaml', yaml });
            }

            if (flAction === 'fleet_status') {
                const args   = buildFleetStatusArgs(str(payload['namespace']) || undefined);
                const result = await runCommand(args, workspaceDir);
                const clusters = parseArgoCdClusterList(result.stdout);
                return safeJson({ ok: result.exitCode === 0, clusters, summary: formatFleetStatus(clusters) });
            }

            if (flAction === 'kubectl_multi') {
                const ctxArgs = Array.isArray(payload['kubectl_args']) ? (payload['kubectl_args'] as string[]) : [];
                const args    = buildKubectlMultiContextArgs({
                    context:    str(payload['context'],    ''),
                    args:       ctxArgs,
                    kubeconfig: str(payload['kubeconfig']) || undefined,
                });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'kubectl_multi', output: result.stdout.slice(0, 3000) });
            }

            if (flAction === 'get_contexts') {
                const args   = buildKubectlGetContextsArgs(str(payload['kubeconfig']) || undefined);
                const result = await runCommand(args, workspaceDir);
                const contexts = result.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
                return safeJson({ ok: result.exitCode === 0, contexts });
            }

            if (flAction === 'cluster_info') {
                const args   = buildKubectlClusterInfoArgs(str(payload['context'], ''), str(payload['kubeconfig']) || undefined);
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, output: result.stdout.slice(0, 1000) });
            }

            if (flAction === 'generate') {
                const prompt  = buildFleetPrompt({
                    description:  str(payload['description'],   ''),
                    clusters:     Array.isArray(payload['clusters']) ? (payload['clusters'] as Array<{ name: string; environment: string; region?: string }>) : [],
                    repoUrl:      str(payload['repo_url'],      ''),
                    appsBasePath: str(payload['apps_base_path']) || undefined,
                });
                const llmOut = await callLlmSafe(callLlm, prompt);
                const files  = parseFleetOutput(llmOut);
                return safeJson({ ok: true, action: 'generate', files, count: files.length });
            }

            return { ok: false, output: '', errorOutput: `Unknown fleet action: ${flAction}` };
        }

        // ====================================================================
        // workspace_devops_windows
        // payload: action (winrs|invoke_command|test_wsm|dsc_apply|dsc_test|
        //                   dsc_get|dsc_status|ad_get_user|ad_new_user|
        //                   ad_disable|ad_reset_password|ad_remove|
        //                   ad_group_members|ad_add_group_member|
        //                   iis_list|iis_start|iis_stop|iis_restart_pool|
        //                   iis_get_pools|get_events|get_updates|
        //                   install_updates|check_reboot|
        //                   get_service|restart_service|stop_service|analyze),
        //          host?, username?, password?, https?
        // ====================================================================
        case 'workspace_devops_windows': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const winAction = str(payload['action'], 'get_events');
            const winTarget: WinRmTarget | undefined = payload['host'] ? {
                host:        str(payload['host'],     ''),
                port:        typeof payload['port']   === 'number' ? (payload['port']   as number) : undefined,
                https:       payload['https'] === true,
                username:    str(payload['username']) || undefined,
                password:    str(payload['password']) || undefined,
                skipCaCheck: payload['skip_ca_check'] === true,
            } : undefined;

            if (winAction === 'winrs') {
                if (!winTarget) return { ok: false, output: '', errorOutput: 'host required for winrs' };
                const args   = buildWinrsArgs({ target: winTarget, command: str(payload['command'], '') });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, output: result.stdout.slice(0, 3000) });
            }

            if (winAction === 'invoke_command') {
                if (!winTarget) return { ok: false, output: '', errorOutput: 'host required for invoke_command' };
                const args   = buildInvokeCommandArgs({ target: winTarget, scriptBlock: str(payload['script_block'], '') });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, output: result.stdout.slice(0, 3000) });
            }

            if (winAction === 'test_wsm') {
                if (!winTarget) return { ok: false, output: '', errorOutput: 'host required for test_wsm' };
                const args   = buildTestWsManArgs(winTarget);
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, reachable: result.exitCode === 0 });
            }

            if (winAction === 'dsc_apply') {
                const args = buildDscApplyArgs({
                    name:      str(payload['name'],     ''),
                    mofPath:   str(payload['mof_path'], ''),
                    wait:      payload['wait'] !== false,
                    force:     payload['force'] === true,
                    verbose:   payload['verbose'] === true,
                });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'dsc_apply', output: result.stdout.slice(0, 1000) });
            }

            if (winAction === 'dsc_test') {
                const args   = buildDscTestArgs({ name: str(payload['name'], ''), mofPath: '' });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'dsc_test', raw: result.stdout.slice(0, 2000) });
            }

            if (winAction === 'get_events') {
                const evQuery: EventLogQuery = {
                    logName:   str(payload['log_name'],  'System'),
                    level:     typeof payload['level'] === 'number' ? (payload['level'] as EventLogQuery['level']) : undefined,
                    source:    str(payload['source'])    || undefined,
                    startTime: str(payload['start_time']) || undefined,
                    endTime:   str(payload['end_time'])   || undefined,
                    maxEvents: typeof payload['max_events'] === 'number' ? (payload['max_events'] as number) : 50,
                };
                const args   = buildGetWinEventArgs(evQuery);
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'get_events', raw: result.stdout.slice(0, 3000) });
            }

            if (winAction === 'get_updates') {
                const args   = buildGetWindowsUpdateArgs(winTarget);
                const result = await runCommand(args, workspaceDir);
                const updates = parseWindowsUpdateList(result.stdout);
                return safeJson({ ok: result.exitCode === 0, updates, count: updates.length, reboot_required: updates.some((u) => u.rebootRequired) });
            }

            if (winAction === 'install_updates') {
                if (payload['allow_destructive'] !== true) return { ok: false, output: '', errorOutput: 'allow_destructive: true required for install_updates' };
                const args = buildInstallWindowsUpdateArgs({ target: winTarget, kbArticleId: str(payload['kb']) || undefined, autoReboot: payload['auto_reboot'] === true });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'install_updates', output: result.stdout.slice(0, 1000) });
            }

            if (winAction === 'check_reboot') {
                const args   = buildCheckPendingRebootArgs(winTarget);
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, raw: result.stdout.slice(0, 500) });
            }

            if (winAction === 'iis_list') {
                const args   = buildIisListSitesArgs(winTarget);
                const result = await runCommand(args, workspaceDir);
                const sites  = parseIisSites(result.stdout);
                return safeJson({ ok: result.exitCode === 0, sites });
            }

            if (winAction === 'iis_start') {
                const args = buildIisStartSiteArgs(str(payload['site_name'], ''), winTarget);
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'iis_start' });
            }

            if (winAction === 'iis_stop') {
                if (payload['allow_destructive'] !== true) return { ok: false, output: '', errorOutput: 'allow_destructive: true required for iis_stop' };
                const args = buildIisStopSiteArgs(str(payload['site_name'], ''), winTarget);
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'iis_stop' });
            }

            if (winAction === 'iis_restart_pool') {
                const args = buildIisRestartAppPoolArgs(str(payload['app_pool_name'], ''), winTarget);
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'iis_restart_pool' });
            }

            if (winAction === 'get_service') {
                const args = buildGetServiceArgs(str(payload['service_name'], ''), winTarget);
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, raw: result.stdout.slice(0, 1000) });
            }

            if (winAction === 'restart_service') {
                const args = buildRestartServiceArgs(str(payload['service_name'], ''), winTarget);
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'restart_service' });
            }

            if (winAction === 'ad_get_user') {
                const args = buildAdGetUserArgs(str(payload['sam_account_name'], ''));
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, raw: result.stdout.slice(0, 2000) });
            }

            if (winAction === 'ad_disable') {
                if (payload['allow_destructive'] !== true) return { ok: false, output: '', errorOutput: 'allow_destructive: true required for ad_disable' };
                const args = buildAdDisableUserArgs(str(payload['sam_account_name'], ''));
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'ad_disable' });
            }

            if (winAction === 'analyze') {
                const prompt = buildWindowsAnalysisPrompt({
                    task:      str(payload['task'], 'diagnose and resolve the issue'),
                    eventLogs: str(payload['event_logs'])  || undefined,
                    dscStatus: str(payload['dsc_status'])  || undefined,
                    iisInfo:   str(payload['iis_info'])    || undefined,
                    services:  str(payload['services'])    || undefined,
                    updates:   str(payload['updates'])     || undefined,
                });
                const llmOut = await callLlmSafe(callLlm, prompt);
                const analysis = parseWindowsAnalysisOutput(llmOut);
                return safeJson({ ok: true, action: 'analyze', analysis, report: formatWindowsReport({ host: str(payload['host'], 'unknown'), ...analysis ?? {} }) });
            }

            return { ok: false, output: '', errorOutput: `Unknown windows action: ${winAction}` };
        }

        // ====================================================================
        // workspace_devops_chaos
        // payload: action (pod_chaos|network_chaos|stress_chaos|dns_chaos|
        //                   list|delete|pause|resume|
        //                   fis_start|fis_stop|fis_get|fis_list|fis_template|
        //                   litmus_engine|litmus_result|litmus_stop|
        //                   generate),
        //          namespace, spec?, network?, stress?, provider?
        // ====================================================================
        case 'workspace_devops_chaos': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const chaosAction = str(payload['action'], 'list');
            const chaosNs     = str(payload['namespace'], 'default');

            if (chaosAction === 'list') {
                const args   = buildChaosMeshListArgs(chaosNs);
                const result = await runCommand(args, workspaceDir);
                const results = parseChaosMeshResults(result.stdout);
                return safeJson({ ok: result.exitCode === 0, experiments: results, count: results.length });
            }

            if (chaosAction === 'delete') {
                if (payload['allow_destructive'] !== true) return { ok: false, output: '', errorOutput: 'allow_destructive: true required for chaos delete' };
                const args   = buildChaosMeshDeleteArgs({
                    name:      str(payload['name'],      ''),
                    namespace: chaosNs,
                    kind:      str(payload['kind'],      'PodChaos') as ChaosExperimentSpec['kind'],
                });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'chaos_delete' });
            }

            if (chaosAction === 'pause') {
                const args   = buildChaosMeshPauseArgs({ name: str(payload['name'], ''), namespace: chaosNs, kind: str(payload['kind'], 'PodChaos') as ChaosExperimentSpec['kind'] });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'chaos_pause' });
            }

            if (chaosAction === 'resume') {
                const args   = buildChaosMeshResumeArgs({ name: str(payload['name'], ''), namespace: chaosNs, kind: str(payload['kind'], 'PodChaos') as ChaosExperimentSpec['kind'] });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'chaos_resume' });
            }

            if (chaosAction === 'pod_chaos') {
                if (payload['allow_destructive'] !== true) return { ok: false, output: '', errorOutput: 'allow_destructive: true required for pod_chaos injection' };
                const chaosSpec = payload['spec'] as ChaosExperimentSpec | undefined;
                if (!chaosSpec) return { ok: false, output: '', errorOutput: 'spec required for pod_chaos' };
                const yaml = buildPodChaosYaml({
                    spec:          chaosSpec,
                    action:        str(payload['pod_action'], 'pod-kill') as 'pod-kill' | 'pod-failure' | 'container-kill',
                    containerName: str(payload['container_name']) || undefined,
                });
                return safeJson({ ok: true, action: 'pod_chaos', yaml });
            }

            if (chaosAction === 'network_chaos') {
                if (payload['allow_destructive'] !== true) return { ok: false, output: '', errorOutput: 'allow_destructive: true required for network_chaos injection' };
                const chaosSpec = payload['spec'] as ChaosExperimentSpec | undefined;
                if (!chaosSpec) return { ok: false, output: '', errorOutput: 'spec required for network_chaos' };
                const network = (payload['network'] ?? {}) as NetworkChaosParams;
                const yaml = buildNetworkChaosYaml({
                    spec:    chaosSpec,
                    action:  str(payload['network_action'], 'delay') as 'delay' | 'loss' | 'duplicate' | 'corrupt' | 'partition',
                    network,
                });
                return safeJson({ ok: true, action: 'network_chaos', yaml });
            }

            if (chaosAction === 'stress_chaos') {
                if (payload['allow_destructive'] !== true) return { ok: false, output: '', errorOutput: 'allow_destructive: true required for stress_chaos injection' };
                const chaosSpec = payload['spec'] as ChaosExperimentSpec | undefined;
                if (!chaosSpec) return { ok: false, output: '', errorOutput: 'spec required for stress_chaos' };
                const stress = (payload['stress'] ?? {}) as StressChaosParams;
                const yaml = buildStressChaosYaml({ spec: chaosSpec, stress });
                return safeJson({ ok: true, action: 'stress_chaos', yaml });
            }

            if (chaosAction === 'dns_chaos') {
                if (payload['allow_destructive'] !== true) return { ok: false, output: '', errorOutput: 'allow_destructive: true required for dns_chaos injection' };
                const chaosSpec = payload['spec'] as ChaosExperimentSpec | undefined;
                if (!chaosSpec) return { ok: false, output: '', errorOutput: 'spec required for dns_chaos' };
                const yaml = buildDnsChaosYaml({
                    spec:     chaosSpec,
                    action:   str(payload['dns_action'], 'error') as 'error' | 'random',
                    patterns: Array.isArray(payload['patterns']) ? (payload['patterns'] as string[]) : undefined,
                });
                return safeJson({ ok: true, action: 'dns_chaos', yaml });
            }

            if (chaosAction === 'fis_start') {
                if (payload['allow_destructive'] !== true) return { ok: false, output: '', errorOutput: 'allow_destructive: true required for fis_start' };
                const args   = buildFisStartExperimentArgs({ templateId: str(payload['template_id'], ''), region: str(payload['region']) || undefined });
                const result = await runCommand(args, workspaceDir);
                const exp    = parseFisExperiment(result.stdout);
                return safeJson({ ok: result.exitCode === 0, action: 'fis_start', experiment: exp });
            }

            if (chaosAction === 'fis_stop') {
                const args   = buildFisStopExperimentArgs(str(payload['experiment_id'], ''), str(payload['region']) || undefined);
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'fis_stop', raw: result.stdout.slice(0, 500) });
            }

            if (chaosAction === 'fis_get') {
                const args   = buildFisGetExperimentArgs(str(payload['experiment_id'], ''), str(payload['region']) || undefined);
                const result = await runCommand(args, workspaceDir);
                const exp    = parseFisExperiment(result.stdout);
                return safeJson({ ok: result.exitCode === 0, experiment: exp });
            }

            if (chaosAction === 'fis_list') {
                const args   = buildFisListExperimentsArgs(str(payload['region']) || undefined);
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, raw: result.stdout.slice(0, 3000) });
            }

            if (chaosAction === 'fis_template') {
                const templateJson = buildFisEc2StopTemplateJson({
                    name:        str(payload['name'],    'chaos-ec2-stop'),
                    roleArn:     str(payload['role_arn'], ''),
                    instanceIds: Array.isArray(payload['instance_ids']) ? (payload['instance_ids'] as string[]) : [],
                    durationSec: typeof payload['duration_sec'] === 'number' ? (payload['duration_sec'] as number) : undefined,
                });
                return safeJson({ ok: true, action: 'fis_template', template_json: templateJson });
            }

            if (chaosAction === 'litmus_engine') {
                if (payload['allow_destructive'] !== true) return { ok: false, output: '', errorOutput: 'allow_destructive: true required for litmus experiments' };
                const yaml = buildLitmusChaosEngineYaml({
                    name:         str(payload['name'],          ''),
                    namespace:    chaosNs,
                    appLabel:     str(payload['app_label'],     'app=myapp'),
                    appNs:        str(payload['app_namespace'], 'default'),
                    appKind:      str(payload['app_kind'],      'Deployment'),
                    experiments:  Array.isArray(payload['experiments']) ? (payload['experiments'] as string[]) : ['pod-delete'],
                    serviceAccount: str(payload['service_account']) || undefined,
                });
                return safeJson({ ok: true, action: 'litmus_engine', yaml });
            }

            if (chaosAction === 'generate') {
                const prompt  = buildChaosPrompt({
                    description: str(payload['description'], ''),
                    target:      str(payload['target'],      ''),
                    hypothesis:  str(payload['hypothesis'],  ''),
                    currentState: str(payload['current_state']) || undefined,
                    provider:    str(payload['provider']) as ('chaos-mesh' | 'fis' | 'litmus') || undefined,
                });
                const llmOut = await callLlmSafe(callLlm, prompt);
                const design = parseChaosDesign(llmOut);
                return safeJson({ ok: true, action: 'generate', design, report: formatChaosReport({ experiment: str(payload['target'], 'experiment'), phase: 'design', design }) });
            }

            return { ok: false, output: '', errorOutput: `Unknown chaos action: ${chaosAction}` };
        }

        // ====================================================================
        // workspace_devops_mlops
        // payload: action (airflow_trigger|airflow_get_run|airflow_list_runs|
        //                   airflow_logs|airflow_pause|airflow_list_dags|
        //                   mlflow_experiments|mlflow_runs|mlflow_get_run|
        //                   mlflow_register|mlflow_transition|
        //                   sagemaker_list_endpoints|sagemaker_describe_endpoint|
        //                   sagemaker_update_endpoint|sagemaker_delete_endpoint|
        //                   sagemaker_training_jobs|sagemaker_stop_training|
        //                   dbt_run|dbt_test|dbt_freshness|dbt_docs|
        //                   kfp_pipelines|kfp_run|kfp_get_run|kfp_stop|analyze),
        //          airflow_url?, tracking_uri?, host (for kfp)?
        // ====================================================================
        case 'workspace_devops_mlops': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const mlAction = str(payload['action'], 'airflow_list_dags');

            if (mlAction === 'airflow_trigger') {
                const args = buildAirflowTriggerDagArgs({
                    baseUrl:  str(payload['airflow_url'], ''),
                    dagId:    str(payload['dag_id'],      ''),
                    conf:     typeof payload['conf'] === 'object' && payload['conf'] !== null ? (payload['conf'] as Record<string, unknown>) : undefined,
                    username: str(payload['username']) || undefined,
                    password: str(payload['password']) || undefined,
                });
                const result = await runCommand(args, workspaceDir);
                const dagRun = parseAirflowDagRun(result.stdout);
                return safeJson({ ok: result.exitCode === 0, dag_run: dagRun });
            }

            if (mlAction === 'airflow_get_run') {
                const args = buildAirflowGetDagRunArgs({
                    baseUrl:  str(payload['airflow_url'], ''),
                    dagId:    str(payload['dag_id'],      ''),
                    dagRunId: str(payload['dag_run_id'],  ''),
                    username: str(payload['username'])    || undefined,
                    password: str(payload['password'])    || undefined,
                });
                const result = await runCommand(args, workspaceDir);
                const dagRun = parseAirflowDagRun(result.stdout);
                return safeJson({ ok: result.exitCode === 0, dag_run: dagRun });
            }

            if (mlAction === 'airflow_logs') {
                const args = buildAirflowGetTaskLogsArgs({
                    baseUrl:       str(payload['airflow_url'], ''),
                    dagId:         str(payload['dag_id'],      ''),
                    dagRunId:      str(payload['dag_run_id'],  ''),
                    taskId:        str(payload['task_id'],     ''),
                    taskTryNumber: typeof payload['try_number'] === 'number' ? (payload['try_number'] as number) : undefined,
                    username:      str(payload['username'])    || undefined,
                    password:      str(payload['password'])    || undefined,
                });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, logs: result.stdout.slice(0, 3000) });
            }

            if (mlAction === 'airflow_list_dags') {
                const args = buildAirflowListDagsArgs({
                    baseUrl:    str(payload['airflow_url'], ''),
                    username:   str(payload['username']) || undefined,
                    password:   str(payload['password']) || undefined,
                });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, raw: result.stdout.slice(0, 3000) });
            }

            if (mlAction === 'airflow_pause') {
                const args = buildAirflowPauseDagArgs({
                    baseUrl:  str(payload['airflow_url'], ''),
                    dagId:    str(payload['dag_id'],      ''),
                    pause:    payload['pause'] !== false,
                    username: str(payload['username'])    || undefined,
                    password: str(payload['password'])    || undefined,
                });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'airflow_pause' });
            }

            if (mlAction === 'mlflow_experiments') {
                const args = buildMlflowListExperimentsArgs(str(payload['tracking_uri'], ''), str(payload['token']) || undefined);
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, raw: result.stdout.slice(0, 3000) });
            }

            if (mlAction === 'mlflow_runs') {
                const args = buildMlflowSearchRunsArgs({
                    trackingUri:    str(payload['tracking_uri'], ''),
                    experimentIds:  Array.isArray(payload['experiment_ids']) ? (payload['experiment_ids'] as string[]) : [],
                    filter:         str(payload['filter'])   || undefined,
                    maxResults:     typeof payload['max_results'] === 'number' ? (payload['max_results'] as number) : undefined,
                    token:          str(payload['token'])    || undefined,
                });
                const result = await runCommand(args, workspaceDir);
                const runs   = parseMlflowRuns(result.stdout);
                return safeJson({ ok: result.exitCode === 0, runs, count: runs.length });
            }

            if (mlAction === 'mlflow_get_run') {
                const args = buildMlflowGetRunArgs(str(payload['tracking_uri'], ''), str(payload['run_id'], ''), str(payload['token']) || undefined);
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, raw: result.stdout.slice(0, 3000) });
            }

            if (mlAction === 'mlflow_transition') {
                const args = buildMlflowTransitionModelStageArgs({
                    trackingUri: str(payload['tracking_uri'], ''),
                    name:        str(payload['model_name'],  ''),
                    version:     str(payload['version'],     ''),
                    stage:       str(payload['stage'], 'Staging') as 'Staging' | 'Production' | 'Archived',
                    token:       str(payload['token']) || undefined,
                });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'mlflow_transition', raw: result.stdout.slice(0, 500) });
            }

            if (mlAction === 'sagemaker_list_endpoints') {
                const args = buildSageMakerListEndpointsArgs({
                    region:        str(payload['region'])        || undefined,
                    statusEquals:  str(payload['status_equals']) as ('InService') || undefined,
                    nameContains:  str(payload['name_contains']) || undefined,
                });
                const result = await runCommand(args, workspaceDir);
                const endpoints = parseSageMakerEndpoints(result.stdout);
                return safeJson({ ok: result.exitCode === 0, endpoints, count: endpoints.length });
            }

            if (mlAction === 'sagemaker_describe_endpoint') {
                const args   = buildSageMakerDescribeEndpointArgs(str(payload['endpoint_name'], ''), str(payload['region']) || undefined);
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, raw: result.stdout.slice(0, 2000) });
            }

            if (mlAction === 'sagemaker_delete_endpoint') {
                if (payload['allow_destructive'] !== true) return { ok: false, output: '', errorOutput: 'allow_destructive: true required for sagemaker_delete_endpoint' };
                const args   = buildSageMakerDeleteEndpointArgs(str(payload['endpoint_name'], ''), str(payload['region']) || undefined);
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'sagemaker_delete_endpoint' });
            }

            if (mlAction === 'sagemaker_training_jobs') {
                const args   = buildSageMakerListTrainingJobsArgs({ region: str(payload['region']) || undefined, statusEquals: str(payload['status_equals']) as ('InProgress') || undefined });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, raw: result.stdout.slice(0, 3000) });
            }

            if (mlAction === 'sagemaker_stop_training') {
                const args   = buildSageMakerStopTrainingJobArgs(str(payload['job_name'], ''), str(payload['region']) || undefined);
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'sagemaker_stop_training' });
            }

            if (mlAction === 'dbt_run') {
                const args = buildDbtRunArgs({
                    projectDir:  str(payload['project_dir'])  || undefined,
                    target:      str(payload['target'])       || undefined,
                    models:      Array.isArray(payload['models'])  ? (payload['models']  as string[]) : undefined,
                    exclude:     Array.isArray(payload['exclude']) ? (payload['exclude'] as string[]) : undefined,
                    fullRefresh: payload['full_refresh'] === true,
                    threads:     typeof payload['threads'] === 'number' ? (payload['threads'] as number) : undefined,
                });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'dbt_run', output: result.stdout.slice(0, 2000) });
            }

            if (mlAction === 'dbt_test') {
                const args = buildDbtTestArgs({
                    projectDir: str(payload['project_dir']) || undefined,
                    target:     str(payload['target'])      || undefined,
                    models:     Array.isArray(payload['models']) ? (payload['models'] as string[]) : undefined,
                });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'dbt_test', output: result.stdout.slice(0, 2000) });
            }

            if (mlAction === 'dbt_freshness') {
                const args   = buildDbtSourceFreshnessArgs({ projectDir: str(payload['project_dir']) || undefined, target: str(payload['target']) || undefined });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'dbt_freshness', output: result.stdout.slice(0, 2000) });
            }

            if (mlAction === 'kfp_pipelines') {
                const args   = buildKfpListPipelinesArgs({ host: str(payload['host'], ''), token: str(payload['token']) || undefined });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, raw: result.stdout.slice(0, 3000) });
            }

            if (mlAction === 'kfp_run') {
                const args = buildKfpRunPipelineArgs({
                    host:          str(payload['host'],        ''),
                    pipelineId:    str(payload['pipeline_id'], ''),
                    name:          str(payload['run_name'],    'agent-run'),
                    params:        typeof payload['params'] === 'object' && payload['params'] !== null ? (payload['params'] as Record<string, string>) : undefined,
                    experimentId:  str(payload['experiment_id']) || undefined,
                    token:         str(payload['token'])         || undefined,
                });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'kfp_run', raw: result.stdout.slice(0, 1000) });
            }

            if (mlAction === 'kfp_stop') {
                const args   = buildKfpStopRunArgs(str(payload['host'], ''), str(payload['run_id'], ''), str(payload['token']) || undefined);
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'kfp_stop' });
            }

            if (mlAction === 'analyze') {
                const prompt = buildMlopsAnalysisPrompt({
                    task:           str(payload['task'],          'diagnose the MLOps issue'),
                    airflowData:    str(payload['airflow_data'])  || undefined,
                    mlflowData:     str(payload['mlflow_data'])   || undefined,
                    sagemakerData:  str(payload['sagemaker_data']) || undefined,
                    dbtData:        str(payload['dbt_data'])      || undefined,
                    context:        str(payload['context'])       || undefined,
                });
                const llmOut = await callLlmSafe(callLlm, prompt);
                return safeJson({ ok: true, action: 'analyze', llm_analysis: llmOut });
            }

            return { ok: false, output: '', errorOutput: `Unknown mlops action: ${mlAction}` };
        }

        // ====================================================================
        // workspace_devops_incident_contain
        // payload: action (cordon|uncordon|drain|taint|get_node|
        //                   quarantine_pod|deny_all_policy|delete_pod|
        //                   describe_pod|pod_logs|pod_env|pod_events|
        //                   jstack|elastic_siem|splunk|falco_logs|analyze),
        //          node_name?, pod_name?, namespace?,
        //          label_selector?, quarantine?, allow_destructive?
        // ====================================================================
        case 'workspace_devops_incident_contain': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const icAction = str(payload['action'], 'describe_pod');
            const icNs     = str(payload['namespace'], 'default');

            if (icAction === 'cordon') {
                if (payload['allow_destructive'] !== true) return { ok: false, output: '', errorOutput: 'allow_destructive: true required for cordon' };
                const args   = buildKubectlCordonArgs(str(payload['node_name'], ''));
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'cordon', node: str(payload['node_name'], ''), rollback: `kubectl uncordon ${str(payload['node_name'], '')}` });
            }

            if (icAction === 'uncordon') {
                const args   = buildKubectlUncordonArgs(str(payload['node_name'], ''));
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'uncordon' });
            }

            if (icAction === 'drain') {
                if (payload['allow_destructive'] !== true) return { ok: false, output: '', errorOutput: 'allow_destructive: true required for drain' };
                const args = buildKubectlDrainArgs({
                    nodeName:           str(payload['node_name'],    ''),
                    ignoreDaemonSets:   payload['ignore_daemonsets'] !== false,
                    deleteEmptyDirData: payload['delete_emptydir_data'] === true,
                    force:              payload['force'] === true,
                    gracePeriodSec:     typeof payload['grace_period_sec'] === 'number' ? (payload['grace_period_sec'] as number) : undefined,
                });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'drain', node: str(payload['node_name'], ''), rollback: `kubectl uncordon ${str(payload['node_name'], '')}` });
            }

            if (icAction === 'taint') {
                if (payload['allow_destructive'] !== true) return { ok: false, output: '', errorOutput: 'allow_destructive: true required for taint' };
                const args   = buildKubectlTaintNodeArgs({
                    nodeName: str(payload['node_name'], ''),
                    key:      str(payload['taint_key'],    'incident'),
                    value:    str(payload['taint_value'])  || undefined,
                    effect:   str(payload['taint_effect'], 'NoSchedule') as 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute',
                    remove:   payload['remove'] === true,
                });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'taint' });
            }

            if (icAction === 'get_node') {
                const args   = buildKubectlGetNodeArgs(str(payload['node_name']) || undefined);
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, raw: result.stdout.slice(0, 3000) });
            }

            if (icAction === 'quarantine_pod') {
                if (payload['allow_destructive'] !== true) return { ok: false, output: '', errorOutput: 'allow_destructive: true required for quarantine_pod' };
                const args   = buildKubectlQuarantineLabelArgs({ podName: str(payload['pod_name'], ''), namespace: icNs, quarantine: payload['quarantine'] !== false });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'quarantine_pod', rollback: `kubectl label pod ${str(payload['pod_name'], '')} -n ${icNs} quarantine-` });
            }

            if (icAction === 'deny_all_policy') {
                const yaml = buildQuarantineNetworkPolicyYaml(icNs);
                return safeJson({ ok: true, action: 'deny_all_policy', yaml, note: 'Apply this NetworkPolicy before labelling pods with quarantine=true' });
            }

            if (icAction === 'delete_pod') {
                if (payload['allow_destructive'] !== true) return { ok: false, output: '', errorOutput: 'allow_destructive: true required for delete_pod' };
                let args: string[];
                if (payload['label_selector']) {
                    args = buildKubectlDeletePodsByLabelArgs({ namespace: icNs, labelSelector: str(payload['label_selector'], ''), gracePeriod: typeof payload['grace_period'] === 'number' ? (payload['grace_period'] as number) : undefined });
                } else {
                    args = buildKubectlDeletePodArgs({ podName: str(payload['pod_name'], ''), namespace: icNs, gracePeriod: typeof payload['grace_period'] === 'number' ? (payload['grace_period'] as number) : undefined, force: payload['force'] === true });
                }
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, action: 'delete_pod' });
            }

            if (icAction === 'describe_pod') {
                const args   = buildKubectlDescribePodArgs(str(payload['pod_name'], ''), icNs);
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, describe: result.stdout.slice(0, 4000) });
            }

            if (icAction === 'pod_logs') {
                const args = buildIncidentLogsArgs({
                    podName:    str(payload['pod_name'],  ''),
                    namespace:  icNs,
                    container:  str(payload['container']) || undefined,
                    previous:   payload['previous'] === true,
                    tailLines:  typeof payload['tail_lines'] === 'number' ? (payload['tail_lines'] as number) : 200,
                    sinceTime:  str(payload['since_time'])  || undefined,
                    timestamps: true,
                });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, logs: result.stdout.slice(0, 4000) });
            }

            if (icAction === 'pod_env') {
                const args   = buildKubectlExecEnvArgs(str(payload['pod_name'], ''), icNs, str(payload['container']) || undefined);
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, env: result.stdout.slice(0, 2000) });
            }

            if (icAction === 'pod_events') {
                const args   = buildKubectlGetEventsArgs({ namespace: icNs, involvedObject: str(payload['pod_name']) || undefined });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, raw: result.stdout.slice(0, 3000) });
            }

            if (icAction === 'jstack') {
                const args   = buildJstackCaptureArgs({ podName: str(payload['pod_name'], ''), namespace: icNs, container: str(payload['container']) || undefined });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, thread_dump: result.stdout.slice(0, 4000) });
            }

            if (icAction === 'elastic_siem') {
                const args = buildElasticSiemQueryArgs({
                    url:       str(payload['url'],   ''),
                    index:     str(payload['index'], 'logs-*'),
                    query:     str(payload['query'], ''),
                    from:      str(payload['from'])   || undefined,
                    to:        str(payload['to'])     || undefined,
                    size:      typeof payload['size'] === 'number' ? (payload['size'] as number) : undefined,
                    apiKey:    str(payload['api_key'])   || undefined,
                    basicAuth: str(payload['basic_auth']) || undefined,
                });
                const result = await runCommand(args, workspaceDir);
                const events  = parseElasticSiemResults(result.stdout);
                return safeJson({ ok: result.exitCode === 0, events, count: events.length });
            }

            if (icAction === 'splunk') {
                const args = buildSplunkSearchArgs({
                    splunkUrl:    str(payload['splunk_url'],  ''),
                    search:       str(payload['search'],      ''),
                    username:     str(payload['username'],    ''),
                    password:     str(payload['password'],    ''),
                    earliestTime: str(payload['earliest_time']) || undefined,
                    latestTime:   str(payload['latest_time'])   || undefined,
                });
                const result = await runCommand(args, workspaceDir);
                return safeJson({ ok: result.exitCode === 0, raw: result.stdout.slice(0, 3000) });
            }

            if (icAction === 'falco_logs') {
                const args = buildIncidentFalcoLogsArgs({
                    podName:   str(payload['pod_name'],  ''),
                    namespace: str(payload['namespace']) || undefined,
                    tailLines: typeof payload['tail_lines'] === 'number' ? (payload['tail_lines'] as number) : undefined,
                    sinceTime: str(payload['since_time'])  || undefined,
                });
                const result = await runCommand(args, workspaceDir);
                const alerts  = parseIncidentFalcoAlerts(result.stdout);
                const critical = alerts.filter((a) => ['Emergency', 'Alert', 'Critical', 'Error'].includes(a.priority));
                return safeJson({ ok: result.exitCode === 0, alerts: alerts.slice(0, 50), critical_count: critical.length });
            }

            if (icAction === 'analyze') {
                const falcoRaw     = str(payload['falco_logs'])   || '';
                const falcoAlerts  = falcoRaw ? parseIncidentFalcoAlerts(falcoRaw) : [];
                const siemRaw      = str(payload['siem_events'])  || '';
                const siemEvents   = siemRaw  ? parseElasticSiemResults(siemRaw)  : [];
                const prompt = buildIncidentContainmentPrompt({
                    description:    str(payload['description'],     ''),
                    affectedPods:   Array.isArray(payload['affected_pods'])  ? (payload['affected_pods']  as string[]) : undefined,
                    affectedNodes:  Array.isArray(payload['affected_nodes']) ? (payload['affected_nodes'] as string[]) : undefined,
                    falcoAlerts:    falcoAlerts.length ? falcoAlerts : undefined,
                    siemEvents:     siemEvents.length  ? siemEvents  : undefined,
                    podDescribe:    str(payload['pod_describe']) || undefined,
                    podLogs:        str(payload['pod_logs'])     || undefined,
                    k8sEvents:      str(payload['k8s_events'])   || undefined,
                    severity:       str(payload['severity']) as ('p1' | 'p2' | 'p3') || undefined,
                });
                const llmOut = await callLlmSafe(callLlm, prompt);
                const plan   = parseIncidentContainmentPlan(llmOut);
                return safeJson({ ok: true, action: 'analyze', plan, report: formatIncidentReport({ description: str(payload['description'], ''), plan, falcoAlerts: falcoAlerts.length ? falcoAlerts : undefined }) });
            }

            return { ok: false, output: '', errorOutput: `Unknown incident_contain action: ${icAction}` };
        }

        // ====================================================================
        // workspace_devops_debug_session
        // payload:
        //   commands        — array of DebugCommand objects or shell strings
        //   abort_on_failure? (default true)
        //   analyze?          (default false) — run LLM synthesis at end
        //   context?          — incident context string for LLM prompt
        //   max_output_chars? (default 4000) — per-command stdout cap
        // ====================================================================
        case 'workspace_devops_debug_session': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };

            const rawCmds        = payload['commands'];
            const commands       = parseCommandsInput(rawCmds);
            if (commands.length === 0) {
                return { ok: false, output: '', errorOutput: 'workspace_devops_debug_session: no commands provided' };
            }

            const abortOnFailure  = payload['abort_on_failure'] !== false; // default true
            const analyze         = payload['analyze'] === true;
            const context         = str(payload['context']) || undefined;
            const maxOutputChars  = num(payload['max_output_chars'], 4000);

            const results:   DebugCommandResult[] = [];
            let   executed   = 0;
            let   succeeded  = 0;
            let   failed     = 0;
            let   abortedAt: string | undefined;

            for (const cmd of commands) {
                const argv = resolveCommandArgv(cmd as DebugCommand);
                if (argv.length === 0) continue;

                const timeoutMs = typeof (cmd as DebugCommand).timeout_ms === 'number'
                    ? (cmd as DebugCommand).timeout_ms!
                    : 30_000;

                const start = Date.now();
                const res   = await runCommand(argv, workspaceDir, timeoutMs);
                const durationMs = Date.now() - start;

                const stdout    = res.stdout.slice(0, maxOutputChars);
                const truncated = res.stdout.length > maxOutputChars;

                executed++;
                const ok = res.exitCode === 0;
                if (ok) { succeeded++; } else { failed++; }

                results.push({
                    id:         (cmd as DebugCommand).id,
                    label:      (cmd as DebugCommand).label,
                    argv,
                    exitCode:   res.exitCode,
                    stdout,
                    stderr:     res.stderr.slice(0, 1000),
                    durationMs,
                    ok,
                    truncated,
                });

                if (!ok && abortOnFailure) {
                    abortedAt = (cmd as DebugCommand).id ?? argv.join(' ').slice(0, 60);
                    break;
                }
            }

            let summary: string | undefined;
            if (analyze && results.length > 0) {
                const prompt = buildDebugSessionAnalysisPrompt(results, context);
                const llmOut = await callLlmSafe(callLlm, prompt);
                if (llmOut) {
                    const analysis = parseDebugSessionAnalysis(llmOut);
                    summary = `Root cause: ${analysis.rootCause}\nNext steps:\n${analysis.nextSteps.map((s) => `- ${s}`).join('\n')}\nConfidence: ${analysis.confidence}`;
                }
            }

            const session: DebugSessionResult = {
                totalCommands: commands.length,
                executed,
                succeeded,
                failed,
                abortedAt,
                results,
                summary,
            };

            const report = formatDebugSessionReport(session);
            return safeJson({ ok: !abortedAt && failed === 0, ...session, report });
        }

        // ====================================================================
        // workspace_devops_runbook_execute
        // payload:
        //   runbook         — RunbookDefinition as JSON string or object
        //   generate?       — if true, use LLM to generate runbook from
        //                     objective string instead of parsing runbook
        //   objective?      — objective string when generate=true
        //   max_steps?      — safety limit (default 50)
        // ====================================================================
        case 'workspace_devops_runbook_execute': {
            const maxSteps  = num(payload['max_steps'], 50);
            const generate  = payload['generate'] === true;

            let runbookDef;
            if (generate) {
                const objective   = str(payload['objective'], '');
                if (!objective) {
                    return { ok: false, output: '', errorOutput: 'workspace_devops_runbook_execute: objective required when generate=true' };
                }
                const prompt = buildRunbookGenerationPrompt(
                    objective,
                    undefined,
                    str(payload['context']) || undefined,
                );
                const llmOut = await callLlmSafe(callLlm, prompt);
                runbookDef   = parseRunbookGenerationOutput(llmOut);
                if (!runbookDef) {
                    return { ok: false, output: '', errorOutput: 'workspace_devops_runbook_execute: LLM did not return a valid runbook definition' };
                }
            } else {
                try {
                    runbookDef = parseRunbookDefinition(payload['runbook']);
                } catch (e) {
                    return { ok: false, output: '', errorOutput: `workspace_devops_runbook_execute: ${(e as Error).message}` };
                }
            }

            const result = await executeRunbook(runbookDef, executeAction, maxSteps);
            return safeJson({
                ok:             result.ok,
                name:           result.name,
                steps_total:    result.stepsTotal,
                steps_executed: result.stepsExecuted,
                succeeded:      result.stepsSucceeded,
                failed:         result.stepsFailed,
                aborted_at:     result.abortedAt,
                results:        result.results,
                report:         result.report,
            });
        }

        // ====================================================================
        // workspace_devops_net_diag
        // payload:
        //   action          — ping | traceroute | dns_lookup | port_check |
        //                     http_check | mtr | arp_table | route_table |
        //                     ssl_check | bandwidth_test
        //   host            — target host / URL
        //   count?          — ping packet count
        //   record_type?    — DNS record type (A, MX, TXT, ...)
        //   port?           — port number for port_check / ssl_check
        //   method?         — HTTP method for http_check
        //   timeout?        — per-command timeout seconds
        //   duration?       — iperf3 test duration seconds
        //   max_hops?       — traceroute/mtr max hops
        //   server?         — DNS resolver for dns_lookup
        //   ipv6?           — use IPv6 ping
        //   use_tcp?        — traceroute TCP mode
        //   insecure?       — curl -k
        //   follow_redirects? — curl -L
        //   report_cycles?  — MTR report cycles
        //   no_dns?         — MTR no DNS resolution
        // ====================================================================
        case 'workspace_devops_net_diag': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const diagAction = str(payload['action'], 'ping');
            const host       = str(payload['host']);
            if (!host) return { ok: false, output: '', errorOutput: 'workspace_devops_net_diag: host is required' };

            if (diagAction === 'ping') {
                const args = buildPingArgs({
                    host,
                    count:    typeof payload['count']    === 'number' ? payload['count']    as number : undefined,
                    deadline: typeof payload['deadline'] === 'number' ? payload['deadline'] as number : undefined,
                    interval: typeof payload['interval'] === 'number' ? payload['interval'] as number : undefined,
                    ipv6:     payload['ipv6'] === true,
                });
                const result = await runCommand(args, workspaceDir, 30_000);
                const ping   = parsePingOutput(result.stdout, host);
                return safeJson({ ok: result.exitCode === 0, action: 'ping', ...ping,
                    report: formatNetDiagReport({ action: 'ping', host, results: ping }) });
            }

            if (diagAction === 'traceroute') {
                const args = buildTracerouteArgs({
                    host,
                    max_hops: typeof payload['max_hops'] === 'number' ? payload['max_hops'] as number : undefined,
                    timeout:  typeof payload['timeout']  === 'number' ? payload['timeout']  as number : undefined,
                    use_tcp:  payload['use_tcp'] === true,
                });
                const result = await runCommand(args, workspaceDir, 60_000);
                const hops   = parseTracerouteOutput(result.stdout);
                return safeJson({ ok: result.exitCode === 0, action: 'traceroute', host, hops, hop_count: hops.length,
                    report: formatNetDiagReport({ action: 'traceroute', host, results: hops }) });
            }

            if (diagAction === 'dns_lookup') {
                const args = buildDnsLookupArgs({
                    host,
                    record_type: str(payload['record_type']) || undefined,
                    server:      str(payload['server'])      || undefined,
                    short:       payload['short'] === true,
                    timeout:     typeof payload['timeout'] === 'number' ? payload['timeout'] as number : undefined,
                });
                const result  = await runCommand(args, workspaceDir, 20_000);
                const records = parseDnsOutput(result.stdout);
                return safeJson({ ok: result.exitCode === 0, action: 'dns_lookup', host, records, record_count: records.length,
                    raw: result.stdout.slice(0, 2000) });
            }

            if (diagAction === 'port_check') {
                const port = typeof payload['port'] === 'number' ? payload['port'] as number : 80;
                const args = buildPortCheckArgs({
                    host, port,
                    timeout: typeof payload['timeout'] === 'number' ? payload['timeout'] as number : undefined,
                    udp:     payload['udp'] === true,
                });
                const result = await runCommand(args, workspaceDir, 15_000);
                const open   = result.exitCode === 0;
                return safeJson({ ok: true, action: 'port_check', host, port, open,
                    proto: payload['udp'] === true ? 'udp' : 'tcp',
                    summary: `${host}:${port} is ${open ? 'OPEN' : 'CLOSED'}` });
            }

            if (diagAction === 'http_check') {
                const url  = host.startsWith('http') ? host : `https://${host}`;
                const args = buildHttpCheckArgs({
                    url,
                    method:           str(payload['method']) || undefined,
                    timeout:          typeof payload['timeout'] === 'number' ? payload['timeout'] as number : undefined,
                    follow_redirects: payload['follow_redirects'] !== false,
                    insecure:         payload['insecure'] === true,
                });
                const result = await runCommand(args, workspaceDir, 30_000);
                const check  = parseHttpCheckOutput(result.stdout, url);
                return safeJson({ action: 'http_check', ...check });
            }

            if (diagAction === 'mtr') {
                const args = buildMtrArgs({
                    host,
                    report_cycles: typeof payload['report_cycles'] === 'number' ? payload['report_cycles'] as number : undefined,
                    max_hops:      typeof payload['max_hops'] === 'number' ? payload['max_hops'] as number : undefined,
                    no_dns:        payload['no_dns'] === true,
                });
                const result = await runCommand(args, workspaceDir, 120_000);
                return safeJson({ ok: result.exitCode === 0, action: 'mtr', host, raw: result.stdout.slice(0, 3000) });
            }

            if (diagAction === 'arp_table') {
                const result = await runCommand(buildArpTableArgs(), workspaceDir, 10_000);
                return safeJson({ ok: result.exitCode === 0, action: 'arp_table', raw: result.stdout.slice(0, 2000) });
            }

            if (diagAction === 'route_table') {
                const result = await runCommand(buildRouteTableArgs({ ipv6: payload['ipv6'] === true }), workspaceDir, 10_000);
                return safeJson({ ok: result.exitCode === 0, action: 'route_table', raw: result.stdout.slice(0, 2000) });
            }

            if (diagAction === 'ssl_check') {
                const port = typeof payload['port'] === 'number' ? payload['port'] as number : 443;
                const args = buildSslCheckArgs({ host, port, sni: str(payload['sni']) || undefined });
                // openssl s_client reads from stdin; pass /dev/null to terminate immediately
                const full_args = [...args, '</dev/null'];
                // run as a shell one-liner via sh -c to handle the stdin redirect
                const shArgs  = ['sh', '-c', `echo "" | openssl s_client -connect ${host}:${port} -servername ${str(payload['sni']) || host} -showcerts 2>&1`];
                const result  = await runCommand(shArgs, workspaceDir, 15_000);
                const cert    = parseSslCertOutput(result.stdout + result.stderr);
                return safeJson({ ok: result.exitCode === 0 && cert !== null, action: 'ssl_check', host, port, cert,
                    expired: cert?.expired ?? null, days_until_expiry: cert?.days_until_expiry ?? null });
            }

            if (diagAction === 'bandwidth_test') {
                const args = buildIperf3Args({
                    host,
                    port:     typeof payload['port']     === 'number' ? payload['port']     as number : undefined,
                    duration: typeof payload['duration'] === 'number' ? payload['duration'] as number : undefined,
                    parallel: typeof payload['parallel'] === 'number' ? payload['parallel'] as number : undefined,
                    reverse:  payload['reverse'] === true,
                    udp:      payload['udp'] === true,
                });
                const result = await runCommand(args, workspaceDir, 120_000);
                let parsed: unknown = result.stdout.slice(0, 3000);
                try { parsed = JSON.parse(result.stdout); } catch { /* use raw */ }
                return safeJson({ ok: result.exitCode === 0, action: 'bandwidth_test', host, result: parsed });
            }

            return { ok: false, output: '', errorOutput: `Unknown net_diag action: ${diagAction}` };
        }

        // ====================================================================
        // workspace_devops_human_handoff
        // Escalates to the customer dashboard when the agent cannot proceed.
        //
        // payload:
        //   escalation_type — approval_required | interactive_session |
        //                     hardware_access | vendor_escalation |
        //                     customer_communication | novel_incident |
        //                     multi_team_coordination | persistent_monitoring |
        //                     budget_decision | context_required |
        //                     security_breach | regulatory_compliance
        //   severity        — p1 | p2 | p3 | p4 (default: p3)
        //   title           — short dashboard task title (required)
        //   summary?        — 2-4 sentence explanation; LLM-generated if omitted
        //   situation?      — raw description used for LLM summary generation
        //   context_gathered? — what the agent already knows
        //   required_actions? — string[] of things the human must do
        //   recommended_steps? — string[] of recommended next steps
        //   artifacts?      — Record<string,string> key-value pairs (logs, plans, etc.)
        //   agent_context?  — arbitrary key-value for continuity
        //   resume_action?  — { action_type, payload } to resume automation after resolution
        // ====================================================================
        case 'workspace_devops_human_handoff': {
            const escalationType = str(payload['escalation_type'], 'approval_required') as EscalationType;
            const severity       = str(payload['severity'], 'p3') as HandoffSeverity;
            const title          = str(payload['title']) || `Human input required — ${escalationType.replace(/_/g, ' ')}`;
            const rawSituation   = str(payload['situation']) || str(payload['summary']);
            const contextGathered = str(payload['context_gathered']) || undefined;

            // Required/recommended actions — use payload values, or LLM, or defaults
            let summary          = str(payload['summary']) || '';
            let required_actions: string[]  = Array.isArray(payload['required_actions'])
                ? (payload['required_actions'] as string[]) : [];
            let recommended_steps: string[] = Array.isArray(payload['recommended_steps'])
                ? (payload['recommended_steps'] as string[]) : [];

            // If summary or actions are missing, try LLM first, then fall back to defaults
            if (!summary || required_actions.length === 0) {
                if (rawSituation) {
                    const prompt  = buildHandoffSummaryPrompt({ escalation_type: escalationType, situation: rawSituation, context_gathered: contextGathered });
                    const llmOut  = await callLlmSafe(callLlm, prompt);
                    if (llmOut) {
                        const parsed = parseHandoffSummaryOutput(llmOut);
                        if (!summary && parsed.summary) { summary = parsed.summary; }
                        if (required_actions.length === 0 && parsed.required_actions.length > 0) {
                            required_actions = parsed.required_actions;
                        }
                        if (recommended_steps.length === 0 && parsed.recommended_steps.length > 0) {
                            recommended_steps = parsed.recommended_steps;
                        }
                    }
                }
                if (!summary) { summary = rawSituation || title; }
                if (required_actions.length === 0) {
                    const defaults = getEscalationDefaults(escalationType);
                    required_actions  = defaults.required_actions;
                    if (recommended_steps.length === 0) { recommended_steps = defaults.recommended_steps; }
                }
            }

            const artifacts: Record<string, string> = {};
            if (payload['artifacts'] && typeof payload['artifacts'] === 'object' && !Array.isArray(payload['artifacts'])) {
                for (const [k, v] of Object.entries(payload['artifacts'] as Record<string, unknown>)) {
                    artifacts[k] = String(v);
                }
            }

            const agentContext: Record<string, unknown> = {};
            if (payload['agent_context'] && typeof payload['agent_context'] === 'object') {
                Object.assign(agentContext, payload['agent_context']);
            }

            const resumeRaw = payload['resume_action'];
            const resumeAction = resumeRaw && typeof resumeRaw === 'object' && !Array.isArray(resumeRaw)
                ? resumeRaw as { action_type: string; payload: Record<string, unknown> }
                : undefined;

            const task: DashboardTask = buildDashboardTask({
                title,
                escalation_type:  escalationType,
                severity,
                summary,
                context_gathered: contextGathered,
                required_actions,
                recommended_steps,
                artifacts,
                agent_context:    agentContext,
                resume_action:    resumeAction,
            });

            const report = formatHandoffReport(task);
            const slackNotification = formatSlackHandoffNotification(task);

            return safeJson({
                ok:                true,
                action:            'human_handoff',
                dashboard_task:    task,
                report,
                slack_notification: slackNotification,
                message:           `Dashboard task created: "${task.title}" [${task.id}] — severity ${task.severity}, type ${task.escalation_type}`,
            });
        }

        // ── workspace_devops_tunnel ──────────────────────────────────────────────
        case 'workspace_devops_tunnel': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const sub   = str(payload['sub_action'], 'list_forwards');
            const ns    = str(payload['namespace']);

            if (sub === 'list_forwards') {
                const r = await runCommand(buildListPortForwardsArgs(), workspaceDir);
                const tunnels = parseActiveTunnels(r.stdout);
                return safeJson({ ok: r.exitCode === 0, action: 'list_forwards', tunnels, report: formatTunnelReport(tunnels), output: r.stdout });
            }

            if (sub === 'kill_forward') {
                const pid = num(payload['pid'], 0);
                if (!pid) return { ok: false, output: '', errorOutput: 'pid required for kill_forward' };
                const r = await runCommand(buildKillPortForwardByPidArgs(pid), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'kill_forward', pid, output: r.stdout, errorOutput: r.stderr });
            }

            if (sub === 'find_port') {
                const port = num(payload['local_port'], 0);
                if (!port) return { ok: false, output: '', errorOutput: 'local_port required for find_port' };
                const r = await runCommand(buildFindPortPidArgs(port), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'find_port', port, output: r.stdout });
            }

            if (sub === 'kubectl_forward') {
                const resourceType = str(payload['resource_type'], 'pod');
                const name = str(payload['name'], '');
                const ports = Array.isArray(payload['ports'])
                    ? (payload['ports'] as Array<{ local: number; remote: number }>)
                    : [{ local: num(payload['local_port'], 8080), remote: num(payload['remote_port'], 80) }];
                const address = str(payload['address']);
                let args: string[];
                if (resourceType === 'service' || resourceType === 'svc') {
                    args = buildKubectlPortForwardServiceArgs({ service: name, namespace: ns || undefined, ports, address: address || undefined });
                } else if (resourceType === 'deployment' || resourceType === 'deploy') {
                    args = buildKubectlPortForwardDeploymentArgs({ deployment: name, namespace: ns || undefined, ports, address: address || undefined });
                } else {
                    args = buildKubectlPortForwardPodArgs({ pod: name, namespace: ns || undefined, ports, address: address || undefined });
                }
                const r = await runCommand(args, workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'kubectl_forward', output: r.stdout, errorOutput: r.stderr });
            }

            if (sub === 'ssh_local') {
                const args = buildSshLocalTunnelArgs({
                    localPort:  num(payload['local_port'],  8080),
                    remoteHost: str(payload['remote_host'], 'localhost'),
                    remotePort: num(payload['remote_port'], 80),
                    sshHost:    str(payload['ssh_host'],    'localhost'),
                    sshUser:    str(payload['ssh_user'],    'root'),
                    sshPort:    payload['ssh_port'] ? num(payload['ssh_port'], 22) : undefined,
                    keyFile:    str(payload['key_file']) || undefined,
                    background: payload['background'] === true,
                });
                const r = await runCommand(args, workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'ssh_local', output: r.stdout, errorOutput: r.stderr });
            }

            if (sub === 'ssh_remote') {
                const args = buildSshRemoteTunnelArgs({
                    remotePort: num(payload['remote_port'], 80),
                    localHost:  str(payload['local_host'],  'localhost'),
                    localPort:  num(payload['local_port'],  8080),
                    sshHost:    str(payload['ssh_host'],    'localhost'),
                    sshUser:    str(payload['ssh_user'],    'root'),
                    sshPort:    payload['ssh_port'] ? num(payload['ssh_port'], 22) : undefined,
                    keyFile:    str(payload['key_file']) || undefined,
                    background: payload['background'] === true,
                });
                const r = await runCommand(args, workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'ssh_remote', output: r.stdout, errorOutput: r.stderr });
            }

            if (sub === 'ssh_dynamic') {
                const args = buildSshDynamicTunnelArgs({
                    localPort: num(payload['local_port'], 1080),
                    sshHost:   str(payload['ssh_host'],   'localhost'),
                    sshUser:   str(payload['ssh_user'],   'root'),
                    sshPort:   payload['ssh_port'] ? num(payload['ssh_port'], 22) : undefined,
                    keyFile:   str(payload['key_file']) || undefined,
                    background: payload['background'] === true,
                });
                const r = await runCommand(args, workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'ssh_dynamic', output: r.stdout, errorOutput: r.stderr });
            }

            if (sub === 'ssh_proxy_jump') {
                const args = buildSshProxyJumpArgs({
                    targetHost: str(payload['target_host'], ''),
                    targetUser: str(payload['target_user'], 'root'),
                    jumpHost:   str(payload['jump_host'],   ''),
                    jumpUser:   str(payload['jump_user'],   'root'),
                    targetPort: payload['target_port'] ? num(payload['target_port'], 22) : undefined,
                    jumpPort:   payload['jump_port']   ? num(payload['jump_port'],   22) : undefined,
                    keyFile:    str(payload['key_file']) || undefined,
                    remoteCmd:  str(payload['remote_cmd']) || undefined,
                });
                const r = await runCommand(args, workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'ssh_proxy_jump', output: r.stdout, errorOutput: r.stderr });
            }

            return { ok: false, output: '', errorOutput: `Unknown tunnel sub_action: ${sub}` };
        }

        // ── workspace_devops_prometheus_mgmt ─────────────────────────────────────
        case 'workspace_devops_prometheus_mgmt': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const sub   = str(payload['sub_action'], 'healthy');
            const url   = str(payload['url'], 'http://localhost:9090');
            const token = str(payload['token']) || undefined;

            const simpleGets: Record<string, () => string[]> = {
                healthy:  () => buildPrometheusHealthyArgs({ url }),
                ready:    () => buildPrometheusReadyArgs({ url }),
                config:   () => buildPrometheusConfigApiArgs({ url, token }),
                runtime:  () => buildPrometheusRuntimeApiArgs({ url, token }),
                tsdb:     () => buildPrometheusTsdbArgs({ url, token }),
                flags:    () => buildPrometheusFlagsApiArgs({ url, token }),
            };

            if (simpleGets[sub]) {
                const r = await runCommand(simpleGets[sub]!(), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: sub, output: r.stdout });
            }

            if (sub === 'reload') {
                const r = await runCommand(buildPrometheusReloadArgs({ url, token }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'reload', output: r.stdout });
            }

            if (sub === 'quit') {
                const r = await runCommand(buildPrometheusQuitArgs({ url, token }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'quit', output: r.stdout });
            }

            if (sub === 'targets') {
                const state = str(payload['state']) as 'active' | 'dropped' | 'any' | undefined;
                const r = await runCommand(buildPrometheusTargetsArgs({ url, token, state: state || undefined }), workspaceDir);
                const parsed = parsePrometheusTargets(r.stdout);
                return safeJson({ ok: r.exitCode === 0, action: 'targets', ...parsed, report: formatPrometheusTargetReport(parsed.active) });
            }

            if (sub === 'rules') {
                const type = str(payload['type']) as 'alert' | 'record' | undefined;
                const r = await runCommand(buildPrometheusRulesApiArgs({ url, token, type: type || undefined }), workspaceDir);
                const groups = parsePrometheusRulesApi(r.stdout);
                return safeJson({ ok: r.exitCode === 0, action: 'rules', groups, output: r.stdout });
            }

            if (sub === 'alerts') {
                const r = await runCommand(buildPrometheusAlertsApiArgs({ url, token }), workspaceDir);
                const alerts = parsePrometheusAlerts(r.stdout);
                return safeJson({ ok: r.exitCode === 0, action: 'alerts', alerts, report: formatPrometheusAlertReport(alerts) });
            }

            if (sub === 'delete_series') {
                const matchers = Array.isArray(payload['matchers'])
                    ? (payload['matchers'] as string[])
                    : [str(payload['matcher'], '')].filter(Boolean);
                const r = await runCommand(buildPrometheusDeleteSeriesArgs({
                    url, token,
                    matchers,
                    start: str(payload['start']) || undefined,
                    end:   str(payload['end'])   || undefined,
                }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'delete_series', output: r.stdout });
            }

            if (sub === 'clean_tombstones') {
                const r = await runCommand(buildPrometheusCleanTombstonesArgs({ url, token }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'clean_tombstones', output: r.stdout });
            }

            if (sub === 'snapshot') {
                const r = await runCommand(buildPrometheusSnapshotArgs({ url, token, skipHead: payload['skip_head'] === true }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'snapshot', output: r.stdout });
            }

            return { ok: false, output: '', errorOutput: `Unknown prometheus_mgmt sub_action: ${sub}` };
        }

        // ── workspace_devops_vault_dynamic ───────────────────────────────────────
        case 'workspace_devops_vault_dynamic': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const sub   = str(payload['sub_action'], 'token_lookup');
            const token = str(payload['token']) || undefined;
            const addr  = str(payload['addr'])  || undefined;

            if (sub === 'lease_renew') {
                const r = await runCommand(buildVaultLeaseRenewArgs({ leaseId: str(payload['lease_id'], ''), increment: payload['increment'] ? num(payload['increment'], 3600) : undefined, token, addr }), workspaceDir);
                const lease = parseVaultLease(r.stdout);
                return safeJson({ ok: r.exitCode === 0, action: 'lease_renew', lease, report: lease ? formatVaultLeaseReport(lease) : undefined, output: r.stdout });
            }

            if (sub === 'lease_revoke') {
                const r = await runCommand(buildVaultLeaseRevokeArgs({ leaseId: str(payload['lease_id'], ''), force: payload['force'] === true, token, addr }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'lease_revoke', output: r.stdout });
            }

            if (sub === 'lease_lookup') {
                const r = await runCommand(buildVaultLeaseLookupArgs({ leaseId: str(payload['lease_id'], ''), token, addr }), workspaceDir);
                const lease = parseVaultLease(r.stdout);
                return safeJson({ ok: r.exitCode === 0, action: 'lease_lookup', lease, output: r.stdout });
            }

            if (sub === 'lease_revoke_prefix') {
                const r = await runCommand(buildVaultLeaseRevokeByPrefixArgs({ prefix: str(payload['prefix'], ''), force: payload['force'] === true, token, addr }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'lease_revoke_prefix', output: r.stdout });
            }

            if (sub === 'lease_list') {
                const r = await runCommand(buildVaultLeaseListArgs({ prefix: str(payload['prefix'], ''), token, addr }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'lease_list', output: r.stdout });
            }

            if (sub === 'read_dynamic') {
                const r = await runCommand(buildVaultDynamicReadArgs({ path: str(payload['path'], ''), token, addr, format: 'json' }), workspaceDir);
                const creds = parseVaultDynamicCreds(r.stdout);
                return safeJson({ ok: r.exitCode === 0, action: 'read_dynamic', creds, output: r.stdout });
            }

            if (sub === 'aws_creds') {
                const r = await runCommand(buildVaultAwsCredsArgs({ role: str(payload['role'], ''), mount: str(payload['mount']) || undefined, token, addr, ttl: str(payload['ttl']) || undefined }), workspaceDir);
                const creds = parseVaultDynamicCreds(r.stdout);
                return safeJson({ ok: r.exitCode === 0, action: 'aws_creds', creds, output: r.stdout });
            }

            if (sub === 'db_creds') {
                const r = await runCommand(buildVaultDbCredsArgs({ role: str(payload['role'], ''), mount: str(payload['mount']) || undefined, token, addr }), workspaceDir);
                const creds = parseVaultDynamicCreds(r.stdout);
                return safeJson({ ok: r.exitCode === 0, action: 'db_creds', creds, output: r.stdout });
            }

            if (sub === 'pki_issue') {
                const r = await runCommand(buildVaultPkiIssueArgs({
                    role:       str(payload['role'],        ''),
                    commonName: str(payload['common_name'], ''),
                    mount:      str(payload['mount'])  || undefined,
                    ttl:        str(payload['ttl'])    || undefined,
                    altNames:   Array.isArray(payload['alt_names'])  ? payload['alt_names'] as string[]  : undefined,
                    ipSans:     Array.isArray(payload['ip_sans'])    ? payload['ip_sans']   as string[]  : undefined,
                    token, addr,
                }), workspaceDir);
                const cert = parseVaultPkiCert(r.stdout);
                return safeJson({ ok: r.exitCode === 0, action: 'pki_issue', cert, output: r.stdout });
            }

            if (sub === 'ssh_sign') {
                const r = await runCommand(buildVaultSshSignArgs({
                    role:           str(payload['role'],            ''),
                    publicKeyPath:  str(payload['public_key_path'], ''),
                    mount:          str(payload['mount']) || undefined,
                    validPrincipals: Array.isArray(payload['valid_principals']) ? payload['valid_principals'] as string[] : undefined,
                    ttl:            str(payload['ttl']) || undefined,
                    token, addr,
                }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'ssh_sign', output: r.stdout });
            }

            if (sub === 'kv_metadata') {
                const r = await runCommand(buildVaultKvMetadataArgs({ path: str(payload['path'], ''), mount: str(payload['mount']) || undefined, token, addr }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'kv_metadata', output: r.stdout });
            }

            if (sub === 'token_create') {
                const r = await runCommand(buildVaultTokenCreateArgs({
                    policies:    Array.isArray(payload['policies']) ? payload['policies'] as string[] : undefined,
                    ttl:         str(payload['ttl'])          || undefined,
                    displayName: str(payload['display_name']) || undefined,
                    numUses:     payload['num_uses'] ? num(payload['num_uses'], 0) : undefined,
                    renewable:   payload['renewable'] !== false,
                    noParent:    payload['no_parent'] === true,
                    token, addr,
                }), workspaceDir);
                const info = parseVaultTokenInfo(r.stdout);
                return safeJson({ ok: r.exitCode === 0, action: 'token_create', token_info: info, output: r.stdout });
            }

            if (sub === 'token_renew') {
                const r = await runCommand(buildVaultTokenRenewArgs({ token, increment: str(payload['increment']) || undefined, self: payload['self'] === true, addr }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'token_renew', output: r.stdout });
            }

            if (sub === 'token_revoke') {
                const revokeToken = str(payload['revoke_token']) || token || '';
                const r = await runCommand(buildVaultTokenRevokeArgs({ token: revokeToken, self: payload['self'] === true, addr }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'token_revoke', output: r.stdout });
            }

            if (sub === 'token_lookup') {
                const r = await runCommand(buildVaultTokenLookupArgs({ token, self: payload['self'] === true, addr }), workspaceDir);
                const info = parseVaultTokenInfo(r.stdout);
                return safeJson({ ok: r.exitCode === 0, action: 'token_lookup', token_info: info, output: r.stdout });
            }

            if (sub === 'token_capabilities') {
                const r = await runCommand(buildVaultTokenCapabilitiesArgs({ path: str(payload['path'], ''), token, addr }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'token_capabilities', output: r.stdout });
            }

            return { ok: false, output: '', errorOutput: `Unknown vault_dynamic sub_action: ${sub}` };
        }

        // ── workspace_devops_argo_workflow ───────────────────────────────────────
        case 'workspace_devops_argo_workflow': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const sub = str(payload['sub_action'], 'list');
            const ns  = str(payload['namespace']) || undefined;

            if (sub === 'list') {
                const r = await runCommand(buildArgoListArgs({ namespace: ns, status: str(payload['status']) as any || undefined, output: 'json' }), workspaceDir);
                const workflows = parseArgoWorkflowList(r.stdout);
                return safeJson({ ok: r.exitCode === 0, action: 'list', workflows, report: formatArgoWorkflowReport(workflows) });
            }

            if (sub === 'get') {
                const r = await runCommand(buildArgoGetArgs({ name: str(payload['name'], ''), namespace: ns, output: 'json' }), workspaceDir);
                const wf = parseArgoWorkflowStatus(r.stdout);
                return safeJson({ ok: r.exitCode === 0, action: 'get', workflow: wf, output: r.stdout });
            }

            if (sub === 'logs') {
                const r = await runCommand(buildArgoLogsArgs({
                    name:       str(payload['name'], ''),
                    namespace:  ns,
                    tailLines:  payload['tail_lines'] ? num(payload['tail_lines'], 100) : undefined,
                    container:  str(payload['container']) || undefined,
                    since:      str(payload['since'])     || undefined,
                }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'logs', output: r.stdout });
            }

            if (sub === 'submit') {
                const yamlContent = str(payload['yaml']) || str(payload['workflow_yaml']);
                const args = buildArgoSubmitArgs({
                    file:           yamlContent ? undefined : str(payload['file']) || undefined,
                    namespace:      ns,
                    entrypoint:     str(payload['entrypoint']) || undefined,
                    parameters:     typeof payload['parameters'] === 'object' && !Array.isArray(payload['parameters'])
                                        ? payload['parameters'] as Record<string, string> : undefined,
                    wait:           payload['wait'] === true,
                    log:            payload['log']  === true,
                    serviceAccount: str(payload['service_account']) || undefined,
                });
                const r = await runCommand(args, workspaceDir, yamlContent ? undefined : undefined);
                return safeJson({ ok: r.exitCode === 0, action: 'submit', output: r.stdout, errorOutput: r.stderr });
            }

            if (sub === 'retry') {
                const r = await runCommand(buildArgoRetryArgs({ name: str(payload['name'], ''), namespace: ns, restartSuccessful: payload['restart_successful'] === true }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'retry', output: r.stdout });
            }

            if (sub === 'resubmit') {
                const r = await runCommand(buildArgoResubmitArgs({ name: str(payload['name'], ''), namespace: ns, memoized: payload['memoized'] === true }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'resubmit', output: r.stdout });
            }

            if (sub === 'terminate') {
                const r = await runCommand(buildArgoTerminateArgs({ name: str(payload['name'], ''), namespace: ns }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'terminate', output: r.stdout });
            }

            if (sub === 'stop') {
                const r = await runCommand(buildArgoStopArgs({ name: str(payload['name'], ''), namespace: ns, message: str(payload['message']) || undefined, nodeField: str(payload['node_field']) || undefined }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'stop', output: r.stdout });
            }

            if (sub === 'delete') {
                const r = await runCommand(buildArgoDeleteArgs({ name: str(payload['name']) || undefined, namespace: ns, completed: payload['completed'] === true, resubmitted: payload['resubmitted'] === true }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'delete', output: r.stdout });
            }

            if (sub === 'watch') {
                const r = await runCommand(buildArgoWatchArgs({ name: str(payload['name'], ''), namespace: ns, deadline: str(payload['deadline']) || undefined }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'watch', output: r.stdout });
            }

            if (sub === 'lint') {
                const r = await runCommand(buildArgoLintArgs({ file: str(payload['file'], '-'), strict: payload['strict'] === true }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'lint', output: r.stdout, errorOutput: r.stderr });
            }

            if (sub === 'template_list') {
                const r = await runCommand(buildArgoTemplateListArgs({ namespace: ns, output: 'json' }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'template_list', output: r.stdout });
            }

            if (sub === 'template_get') {
                const r = await runCommand(buildArgoTemplateGetArgs({ name: str(payload['name'], ''), namespace: ns, output: 'json' }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'template_get', output: r.stdout });
            }

            if (sub === 'template_create') {
                const r = await runCommand(buildArgoTemplateCreateArgs({ file: str(payload['file'], '-'), namespace: ns }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'template_create', output: r.stdout });
            }

            if (sub === 'template_delete') {
                const r = await runCommand(buildArgoTemplateDeleteArgs({ name: str(payload['name'], ''), namespace: ns }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'template_delete', output: r.stdout });
            }

            if (sub === 'cron_list') {
                const r = await runCommand(buildArgoCronListArgs({ namespace: ns, output: 'json' }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'cron_list', output: r.stdout });
            }

            if (sub === 'cron_create') {
                const r = await runCommand(buildArgoCronCreateArgs({ file: str(payload['file'], '-'), namespace: ns }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'cron_create', output: r.stdout });
            }

            if (sub === 'cron_suspend') {
                const r = await runCommand(buildArgoCronSuspendArgs({ name: str(payload['name'], ''), namespace: ns }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'cron_suspend', output: r.stdout });
            }

            if (sub === 'cron_resume') {
                const r = await runCommand(buildArgoCronResumeArgs({ name: str(payload['name'], ''), namespace: ns }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'cron_resume', output: r.stdout });
            }

            if (sub === 'cron_delete') {
                const r = await runCommand(buildArgoCronDeleteArgs({ name: str(payload['name'], ''), namespace: ns }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'cron_delete', output: r.stdout });
            }

            if (sub === 'generate') {
                const prompt = buildArgoWorkflowGeneratePrompt(str(payload['description'], ''), str(payload['context']) || undefined);
                const raw    = await callLlmSafe(callLlm, prompt);
                return safeJson({ ok: !!raw, action: 'generate', yaml: raw, output: raw });
            }

            return { ok: false, output: '', errorOutput: `Unknown argo_workflow sub_action: ${sub}` };
        }

        // ── workspace_devops_backstage ───────────────────────────────────────────
        case 'workspace_devops_backstage': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const sub     = str(payload['sub_action'], 'entity_get');
            const baseUrl = str(payload['base_url'], 'http://localhost:7007');
            const token   = str(payload['token']) || undefined;

            if (sub === 'entity_get' || sub === 'component_info') {
                const args = sub === 'component_info'
                    ? buildBackstageComponentInfoArgs({ baseUrl, name: str(payload['name'], ''), namespace: str(payload['namespace']) || undefined, token })
                    : buildBackstageEntityGetArgs({ baseUrl, kind: str(payload['kind'], 'Component'), name: str(payload['name'], ''), namespace: str(payload['namespace']) || undefined, token });
                const r = await runCommand(args, workspaceDir);
                const entity = parseBackstageEntity(r.stdout);
                return safeJson({ ok: r.exitCode === 0 && !!entity, action: sub, entity, report: entity ? formatBackstageEntityReport(entity) : r.stdout });
            }

            if (sub === 'entity_list' || sub === 'owner_components' || sub === 'api_list' || sub === 'resource_list' || sub === 'system_list') {
                let args: string[];
                if (sub === 'owner_components') {
                    args = buildBackstageOwnerComponentsArgs({ baseUrl, owner: str(payload['owner'], ''), token });
                } else if (sub === 'api_list') {
                    args = buildBackstageApiListArgs({ baseUrl, lifecycle: str(payload['lifecycle']) || undefined, token });
                } else if (sub === 'resource_list') {
                    args = buildBackstageResourceListArgs({ baseUrl, type: str(payload['type']) || undefined, token });
                } else if (sub === 'system_list') {
                    args = buildBackstageSystemListArgs({ baseUrl, token });
                } else {
                    args = buildBackstageEntityListArgs({ baseUrl, kind: str(payload['kind']) || undefined, owner: str(payload['owner']) || undefined, lifecycle: str(payload['lifecycle']) || undefined, type: str(payload['type']) || undefined, namespace: str(payload['namespace']) || undefined, limit: payload['limit'] ? num(payload['limit'], 100) : undefined, token });
                }
                const r       = await runCommand(args, workspaceDir);
                const entities = parseBackstageEntityList(r.stdout);
                return safeJson({ ok: r.exitCode === 0, action: sub, entities, report: formatBackstageEntityListReport(entities) });
            }

            if (sub === 'entity_search') {
                const r = await runCommand(buildBackstageEntitySearchArgs({ baseUrl, query: str(payload['query'], ''), kind: str(payload['kind']) || undefined, limit: payload['limit'] ? num(payload['limit'], 20) : undefined, token }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'entity_search', output: r.stdout });
            }

            if (sub === 'entity_ref') {
                const refs = Array.isArray(payload['refs']) ? payload['refs'] as string[] : [str(payload['ref'], '')].filter(Boolean);
                const r = await runCommand(buildBackstageEntityRefArgs({ baseUrl, refs, token }), workspaceDir);
                const entities = parseBackstageEntityList(r.stdout);
                return safeJson({ ok: r.exitCode === 0, action: 'entity_ref', entities });
            }

            if (sub === 'techdocs_get') {
                const r = await runCommand(buildBackstageTechDocsArgs({ baseUrl, kind: str(payload['kind'], 'Component'), name: str(payload['name'], ''), namespace: str(payload['namespace']) || undefined, token }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'techdocs_get', output: r.stdout });
            }

            if (sub === 'health') {
                const r = await runCommand(buildBackstageHealthArgs({ baseUrl }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'health', output: r.stdout });
            }

            return { ok: false, output: '', errorOutput: `Unknown backstage sub_action: ${sub}` };
        }

        // ── workspace_devops_slack_incident ──────────────────────────────────────
        case 'workspace_devops_slack_incident': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const sub   = str(payload['sub_action'], 'channel_info');
            const token = str(payload['token'], '');
            if (!token) return { ok: false, output: '', errorOutput: 'Slack token required (payload.token)' };

            if (sub === 'channel_create') {
                const r = await runCommand(buildSlackChannelCreateArgs({ token, name: str(payload['name'], ''), isPrivate: payload['is_private'] === true }), workspaceDir);
                const ch = parseSlackChannel(r.stdout);
                return safeJson({ ok: r.exitCode === 0 && !!ch?.id, action: 'channel_create', channel: ch });
            }

            if (sub === 'channel_invite') {
                const users = Array.isArray(payload['users']) ? payload['users'] as string[] : [str(payload['user'], '')].filter(Boolean);
                const r = await runCommand(buildSlackChannelInviteArgs({ token, channel: str(payload['channel'], ''), users }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'channel_invite', output: r.stdout });
            }

            if (sub === 'channel_topic') {
                const r = await runCommand(buildSlackChannelTopicArgs({ token, channel: str(payload['channel'], ''), topic: str(payload['topic'], '') }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'channel_topic', output: r.stdout });
            }

            if (sub === 'channel_archive') {
                const r = await runCommand(buildSlackChannelArchiveArgs({ token, channel: str(payload['channel'], '') }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'channel_archive', output: r.stdout });
            }

            if (sub === 'channel_info') {
                const r = await runCommand(buildSlackChannelInfoArgs({ token, channel: str(payload['channel'], '') }), workspaceDir);
                const ch = parseSlackChannel(r.stdout);
                return safeJson({ ok: r.exitCode === 0, action: 'channel_info', channel: ch, report: ch ? formatSlackIncidentChannelReport(ch) : r.stdout });
            }

            if (sub === 'channel_list') {
                const r = await runCommand(buildSlackChannelListArgs({ token, limit: payload['limit'] ? num(payload['limit'], 200) : undefined, excludeArchived: payload['exclude_archived'] !== false }), workspaceDir);
                const channels = parseSlackChannelList(r.stdout);
                return safeJson({ ok: r.exitCode === 0, action: 'channel_list', channels });
            }

            if (sub === 'message_post') {
                const r = await runCommand(buildSlackMessagePostArgs({
                    token,
                    channel:   str(payload['channel'],  ''),
                    text:      str(payload['text'],     ''),
                    threadTs:  str(payload['thread_ts']) || undefined,
                    username:  str(payload['username'])  || undefined,
                    iconEmoji: str(payload['icon_emoji']) || undefined,
                }), workspaceDir);
                const msg = parseSlackMessage(r.stdout);
                return safeJson({ ok: r.exitCode === 0 && !!msg?.ts, action: 'message_post', message: msg });
            }

            if (sub === 'message_update') {
                const r = await runCommand(buildSlackMessageUpdateArgs({ token, channel: str(payload['channel'], ''), ts: str(payload['ts'], ''), text: str(payload['text'], '') }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'message_update', output: r.stdout });
            }

            if (sub === 'pin_message') {
                const r = await runCommand(buildSlackPinAddArgs({ token, channel: str(payload['channel'], ''), ts: str(payload['ts'], '') }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'pin_message', output: r.stdout });
            }

            if (sub === 'unpin_message') {
                const r = await runCommand(buildSlackPinRemoveArgs({ token, channel: str(payload['channel'], ''), ts: str(payload['ts'], '') }), workspaceDir);
                return safeJson({ ok: r.exitCode === 0, action: 'unpin_message', output: r.stdout });
            }

            if (sub === 'user_lookup') {
                const r = await runCommand(buildSlackUserLookupArgs({ token, email: str(payload['email'], '') }), workspaceDir);
                const userId = parseSlackUserId(r.stdout);
                return safeJson({ ok: r.exitCode === 0 && !!userId, action: 'user_lookup', user_id: userId });
            }

            if (sub === 'war_room_setup') {
                const spec: IncidentWarRoomSpec = {
                    incidentId:   str(payload['incident_id'],  `inc-${Date.now()}`),
                    severity:     (str(payload['severity'], 'p2') as 'p1' | 'p2' | 'p3' | 'p4'),
                    title:        str(payload['title'],        'Incident'),
                    responders:   Array.isArray(payload['responders']) ? payload['responders'] as string[] : [],
                    service:      str(payload['service'])       || undefined,
                    runbookUrl:   str(payload['runbook_url'])   || undefined,
                    dashboardUrl: str(payload['dashboard_url']) || undefined,
                };
                const channelName = buildIncidentChannelName(spec);
                const createR  = await runCommand(buildSlackChannelCreateArgs({ token, name: channelName, isPrivate: true }), workspaceDir);
                const ch       = parseSlackChannel(createR.stdout);
                if (!ch?.id) return safeJson({ ok: false, action: 'war_room_setup', errorOutput: `Failed to create channel: ${createR.stdout}` });

                let invitedCount = 0;
                if (spec.responders.length > 0) {
                    await runCommand(buildSlackChannelInviteArgs({ token, channel: ch.id, users: spec.responders }), workspaceDir);
                    invitedCount = spec.responders.length;
                }

                const topic   = `[${spec.severity.toUpperCase()}] ${spec.title} | ID: ${spec.incidentId}`;
                await runCommand(buildSlackChannelTopicArgs({ token, channel: ch.id, topic }), workspaceDir);

                const welcome = buildWarRoomWelcomeMessage(spec);
                const msgR    = await runCommand(buildSlackMessagePostArgs({ token, channel: ch.id, text: welcome }), workspaceDir);
                const msg     = parseSlackMessage(msgR.stdout);

                let pinnedTs: string | undefined;
                if (msg?.ts) {
                    await runCommand(buildSlackPinAddArgs({ token, channel: ch.id, ts: msg.ts }), workspaceDir);
                    pinnedTs = msg.ts;
                }

                const result = { channelId: ch.id, channelName: ch.name, pinnedTs, invitedCount };
                return safeJson({ ok: true, action: 'war_room_setup', ...result, report: formatWarRoomCreatedReport(result) });
            }

            return { ok: false, output: '', errorOutput: `Unknown slack_incident sub_action: ${sub}` };
        }

        // ── workspace_devops_scheduled_monitor ───────────────────────────────────
        case 'workspace_devops_scheduled_monitor': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const sub = str(payload['sub_action'], 'evaluate');

            if (sub === 'create_metric_watch') {
                const spec = buildMetricWatchSpec({
                    id:            str(payload['id'],   `monitor-${Date.now()}`),
                    name:          str(payload['name'], 'Metric Monitor'),
                    description:   str(payload['description']) || undefined,
                    query:         str(payload['query'],        ''),
                    prometheusUrl: str(payload['prometheus_url'], 'http://localhost:9090'),
                    warnThreshold: payload['warn_threshold'] ? num(payload['warn_threshold'], 0) : undefined,
                    critThreshold: payload['crit_threshold'] ? num(payload['crit_threshold'], 0) : undefined,
                    comparison:    (str(payload['comparison'], '>') as '>' | '<' | '>=' | '<=' | '=='),
                    severity:      (str(payload['severity'], 'warning') as 'critical' | 'warning' | 'info'),
                });
                return safeJson({ ok: true, action: 'create_metric_watch', spec });
            }

            if (sub === 'create_log_watch') {
                const spec = buildLogWatchSpec({
                    id:          str(payload['id'],   `monitor-${Date.now()}`),
                    name:        str(payload['name'], 'Log Monitor'),
                    description: str(payload['description']) || undefined,
                    pattern:     str(payload['pattern'], ''),
                    source:      (str(payload['source'], 'kubectl') as 'kubectl' | 'journald' | 'file'),
                    target:      str(payload['target'], ''),
                    namespace:   str(payload['namespace']) || undefined,
                    sinceSeconds: payload['since_seconds'] ? num(payload['since_seconds'], 300) : undefined,
                    severity:    (str(payload['severity'], 'warning') as 'critical' | 'warning' | 'info'),
                    suppressIfContains: Array.isArray(payload['suppress_if_contains']) ? payload['suppress_if_contains'] as string[] : undefined,
                });
                return safeJson({ ok: true, action: 'create_log_watch', spec });
            }

            if (sub === 'create_endpoint_watch') {
                const spec = buildEndpointWatchSpec({
                    id:             str(payload['id'],   `monitor-${Date.now()}`),
                    name:           str(payload['name'], 'Endpoint Monitor'),
                    description:    str(payload['description']) || undefined,
                    url:            str(payload['url'],  ''),
                    method:         (str(payload['method'], 'GET') as 'GET' | 'POST' | 'HEAD'),
                    expectedStatus: num(payload['expected_status'], 200),
                    warnLatencyMs:  payload['warn_latency_ms'] ? num(payload['warn_latency_ms'], 0) : undefined,
                    critLatencyMs:  payload['crit_latency_ms'] ? num(payload['crit_latency_ms'], 0) : undefined,
                    bodyContains:   str(payload['body_contains']) || undefined,
                    tlsCheck:       payload['tls_check'] !== false,
                    severity:       (str(payload['severity'], 'critical') as 'critical' | 'warning' | 'info'),
                });
                return safeJson({ ok: true, action: 'create_endpoint_watch', spec });
            }

            if (sub === 'evaluate') {
                const specRaw = payload['spec'];
                if (!specRaw || typeof specRaw !== 'object') {
                    return { ok: false, output: '', errorOutput: 'spec required for evaluate' };
                }
                const spec = specRaw as MonitorSpec;
                let checkResult: MonitorCheckResult;

                if (spec.kind === 'metric') {
                    const r = await runCommand(buildMonitorPrometheusQueryArgs({ prometheusUrl: spec.prometheusUrl, query: spec.query }), workspaceDir);
                    checkResult = evaluateMetricResult(spec, r.stdout);
                } else if (spec.kind === 'log') {
                    const r = await runCommand(buildLogWatchArgs(spec), workspaceDir);
                    checkResult = evaluateLogResult(spec, r.stdout);
                } else {
                    const r = await runCommand(spec.bodyContains ? buildEndpointBodyCheckArgs(spec) : buildEndpointCheckArgs(spec), workspaceDir);
                    checkResult = evaluateEndpointResult(spec, r.stdout);
                }

                return safeJson({ ok: true, action: 'evaluate', result: checkResult, alert_message: checkResult.status !== 'ok' ? buildMonitorAlertMessage(checkResult, spec.severity) : undefined });
            }

            if (sub === 'report') {
                const results = Array.isArray(payload['results'])
                    ? payload['results'] as MonitorCheckResult[]
                    : [];
                const report = buildMonitorReport(results);
                return safeJson({ ok: true, action: 'report', report, formatted: formatMonitorReport(report) });
            }

            return { ok: false, output: '', errorOutput: `Unknown scheduled_monitor sub_action: ${sub}` };
        }

        // ── workspace_devops_incident_context ────────────────────────────────────
        case 'workspace_devops_incident_context': {
            const sub = str(payload['sub_action'], 'build_context');

            const alertRaw = payload['alert'];
            if (!alertRaw || typeof alertRaw !== 'object') {
                return { ok: false, output: '', errorOutput: 'alert object required' };
            }
            const alert = alertRaw as RawAlert;

            const pastRaw = Array.isArray(payload['past_incidents']) ? payload['past_incidents'] as PastIncident[] : [];
            const serviceRaw = payload['service'] && typeof payload['service'] === 'object'
                ? payload['service'] as ServiceContext : undefined;

            if (sub === 'build_context' || sub === 'enrich') {
                const relevant = selectRelevantPastIncidents(alert, pastRaw, num(payload['top_n'], 5));
                const ctx      = assembleIncidentContext({ alert, service: serviceRaw, pastIncidents: relevant });
                return safeJson({ ok: true, action: sub, context: ctx, report: buildEnrichedAlertSummary(ctx) });
            }

            if (sub === 'noise_filter') {
                const { score, reason } = computeNoiseScore(alert, pastRaw);
                return safeJson({ ok: true, action: 'noise_filter', noise_score: score, reason, is_noise: score > 0.6 });
            }

            if (sub === 'suggest_triage') {
                const relevant = selectRelevantPastIncidents(alert, pastRaw, num(payload['top_n'], 5));
                const ctx      = assembleIncidentContext({ alert, service: serviceRaw, pastIncidents: relevant });
                const prompt   = buildIncidentTriagePrompt(ctx);
                const raw      = await callLlmSafe(callLlm, prompt);
                const triage   = raw ? parseTriageSuggestion(raw) : null;
                const report   = buildEnrichedAlertSummary(ctx, triage ?? undefined);
                return safeJson({ ok: true, action: 'suggest_triage', context: ctx, triage, report });
            }

            return { ok: false, output: '', errorOutput: `Unknown incident_context sub_action: ${sub}` };
        }
    }
}

// ---------------------------------------------------------------------------
// Post-decision hooks — call after operator approval / rejection
// ---------------------------------------------------------------------------

export async function onDevOpsArtifactApproved(params: {
    tenantId: string; botId?: string; workspaceId: string; taskId: string;
    artifactTitle: string; documentType: import('./devops-rag-retriever.js').DevOpsDocumentType;
    content: string; sourceUrl?: string;
    gatewayBaseUrl: string; serviceToken: string;
}): Promise<void> {
    try {
        const { ingestApprovedOpsArtifact } = await import('./devops-rag-retriever.js');
        await ingestApprovedOpsArtifact({ ...params });
    } catch { /* non-fatal */ }
}

export async function onDevOpsFeedbackReceived(params: {
    tenantId: string; workspaceId: string; taskId: string; incidentId: string;
    feedbackReasons: string[];
    gatewayBaseUrl: string; serviceToken: string;
}): Promise<void> {
    try {
        const { ingestDevOpsFeedback, GatewayDevOpsLessonStore } = await import('./devops-lesson-pipeline.js');
        const store = new GatewayDevOpsLessonStore(params.gatewayBaseUrl, params.serviceToken);
        await ingestDevOpsFeedback(
            { tenantId: params.tenantId, workspaceId: params.workspaceId, taskId: params.taskId, incidentId: params.incidentId, documentType: 'any', actionType: 'feedback', correlationId: params.taskId },
            params.feedbackReasons.map((body) => ({ body })),
            store,
        );
    } catch { /* non-fatal */ }
}
