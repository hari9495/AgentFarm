// ============================================================================
// DEVOPS FINOPS BUILDER
//
// Cloud cost optimization beyond simple estimation:
//
//   AWS   — Cost Explorer (RI utilization, Savings Plans, rightsizing, forecasts)
//            Trusted Advisor (idle resources, unattached EBS, unused EIPs)
//            EC2 Spot price history
//   Azure — Cost Management + Advisor recommendations
//   GCP   — Billing API + Recommender API
//
// All calls use the cloud CLIs (aws / az / gcloud) so no SDK dependency.
// LLM prompt synthesizes findings into a prioritized savings plan.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FinOpsProvider = 'aws' | 'azure' | 'gcp';
export type FinOpsGranularity = 'DAILY' | 'MONTHLY';

export interface RiUtilizationSummary {
    utilizationPct:   number;
    coveredHours:     number;
    totalHours:       number;
    netSavings:       number;
    onDemandCostEquiv: number;
}

export interface RightsizingRecommendation {
    instanceId:      string;
    instanceType:    string;
    recommendedType: string;
    estimatedSavingsMonthly: number;
    reason:          string;
}

export interface FinOpsFinding {
    category:       'ri_underused' | 'rightsizing' | 'idle_resource' | 'savings_plan' | 'spot_opportunity' | 'budget_alert';
    title:          string;
    estimatedSavingsMonthly: number;
    effort:         'low' | 'medium' | 'high';
    actionSql?:     string;   // CLI command to apply the recommendation
    details:        string;
}

// ---------------------------------------------------------------------------
// AWS Cost Explorer builders
// ---------------------------------------------------------------------------

export function buildAwsRiUtilizationArgs(params: {
    startDate:    string;    // YYYY-MM-DD
    endDate:      string;
    granularity?: FinOpsGranularity;
    region?:      string;
}): string[] {
    const args = ['aws', 'ce', 'get-reservation-utilization',
        '--time-period', `Start=${params.startDate},End=${params.endDate}`,
        '--granularity', params.granularity ?? 'MONTHLY',
        '--output', 'json'];
    if (params.region) args.push('--region', params.region);
    return args;
}

export function buildAwsSavingsPlanCoverageArgs(params: {
    startDate:    string;
    endDate:      string;
    granularity?: FinOpsGranularity;
    region?:      string;
}): string[] {
    const args = ['aws', 'ce', 'get-savings-plans-coverage',
        '--time-period', `Start=${params.startDate},End=${params.endDate}`,
        '--granularity', params.granularity ?? 'MONTHLY',
        '--output', 'json'];
    if (params.region) args.push('--region', params.region);
    return args;
}

export function buildAwsRightsizingArgs(params: {
    lookbackPeriod?: 'SEVEN_DAYS' | 'FOURTEEN_DAYS' | 'SIXTY_DAYS';
    benefitsConsidered?: boolean;
    region?: string;
}): string[] {
    const config = JSON.stringify({
        RecommendationTarget: 'SAME_INSTANCE_FAMILY',
        BenefitsConsidered:   params.benefitsConsidered !== false,
    });
    const args = ['aws', 'ce', 'get-rightsizing-recommendation',
        '--service', 'AmazonEC2',
        '--configuration', config,
        '--page-size', '100',
        '--output', 'json'];
    if (params.region) args.push('--region', params.region);
    return args;
}

export function buildAwsCostForecastArgs(params: {
    startDate:    string;
    endDate:      string;
    metric?:      'UNBLENDED_COST' | 'BLENDED_COST' | 'AMORTIZED_COST';
    granularity?: FinOpsGranularity;
    region?:      string;
}): string[] {
    const args = ['aws', 'ce', 'get-cost-forecast',
        '--time-period',    `Start=${params.startDate},End=${params.endDate}`,
        '--metric',         params.metric        ?? 'UNBLENDED_COST',
        '--granularity',    params.granularity   ?? 'MONTHLY',
        '--output', 'json'];
    if (params.region) args.push('--region', params.region);
    return args;
}

/** Get current month-to-date costs grouped by service. */
export function buildAwsCostBreakdownArgs(params: {
    startDate:  string;
    endDate:    string;
    groupBy?:   'SERVICE' | 'REGION' | 'INSTANCE_TYPE' | 'LINKED_ACCOUNT';
    region?:    string;
}): string[] {
    const groupBy = JSON.stringify([{ Type: 'DIMENSION', Key: params.groupBy ?? 'SERVICE' }]);
    const args = ['aws', 'ce', 'get-cost-and-usage',
        '--time-period',    `Start=${params.startDate},End=${params.endDate}`,
        '--granularity',    'MONTHLY',
        '--metrics',        'UnblendedCost',
        '--group-by',       groupBy,
        '--output', 'json'];
    if (params.region) args.push('--region', params.region);
    return args;
}

// ---------------------------------------------------------------------------
// AWS Trusted Advisor (requires Business/Enterprise support plan)
// ---------------------------------------------------------------------------

/** Well-known cost-category check IDs for Trusted Advisor. */
export const TRUSTED_ADVISOR_COST_CHECKS = {
    IDLE_LOAD_BALANCERS:     'hjLMh88uM8',
    UNDERUTILIZED_EC2:       'Qch7DwouX1',
    UNATTACHED_EBS_VOLUMES:  'DAvU99Dc4C',
    UNUSED_ELASTIC_IPS:      'Z4AUBRNSmz',
    RDS_IDLE:                'Ti39halfu8',
    RESERVED_INSTANCE_OPT:   '1iG5NDGVre',
} as const;

export function buildTrustedAdvisorArgs(checkId: string, region = 'us-east-1'): string[] {
    return ['aws', 'support', 'describe-trusted-advisor-check-result',
        '--check-id', checkId,
        '--language', 'en',
        '--output', 'json',
        '--region', region];
}

export function buildTrustedAdvisorRefreshArgs(checkId: string, region = 'us-east-1'): string[] {
    return ['aws', 'support', 'refresh-trusted-advisor-check',
        '--check-id', checkId,
        '--output', 'json',
        '--region', region];
}

// ---------------------------------------------------------------------------
// AWS Spot price history
// ---------------------------------------------------------------------------

export function buildSpotPriceHistoryArgs(params: {
    instanceTypes:  string[];    // e.g. ['m5.xlarge', 'm5.2xlarge']
    az?:            string;
    productDesc?:   string;      // default: Linux/UNIX
    startTime?:     string;
    region?:        string;
}): string[] {
    const args = ['aws', 'ec2', 'describe-spot-price-history',
        '--instance-types', ...params.instanceTypes,
        '--product-descriptions', params.productDesc ?? 'Linux/UNIX',
        '--output', 'json'];
    if (params.az)        args.push('--availability-zone', params.az);
    if (params.startTime) args.push('--start-time', params.startTime);
    if (params.region)    args.push('--region', params.region);
    return args;
}

// ---------------------------------------------------------------------------
// Azure Cost Management builders
// ---------------------------------------------------------------------------

export function buildAzureCostUsageArgs(params: {
    scope:        string;     // /subscriptions/<id> or /subscriptions/<id>/resourceGroups/<rg>
    startDate:    string;
    endDate:      string;
    subscription?: string;
}): string[] {
    const args = ['az', 'consumption', 'usage', 'list',
        '--start-date', params.startDate,
        '--end-date',   params.endDate,
        '--output', 'json'];
    if (params.subscription) args.push('--subscription', params.subscription);
    return args;
}

export function buildAzureAdvisorRecommendationsArgs(params: {
    category?:    'Cost' | 'Security' | 'Performance' | 'HighAvailability' | 'OperationalExcellence';
    subscription?: string;
}): string[] {
    const args = ['az', 'advisor', 'recommendation', 'list',
        '--category', params.category ?? 'Cost',
        '--output', 'json'];
    if (params.subscription) args.push('--subscription', params.subscription);
    return args;
}

export function buildAzureReservationUtilizationArgs(params: {
    reservationOrderId: string;
    reservationId?:     string;
    startDate:          string;
    endDate:            string;
    grain?:             'daily' | 'monthly';
    subscription?:      string;
}): string[] {
    const args = ['az', 'consumption', 'reservation', 'detail', 'list',
        '--reservation-order-id', params.reservationOrderId,
        '--start-date', params.startDate,
        '--end-date',   params.endDate,
        '--output', 'json'];
    if (params.reservationId) args.push('--reservation-id', params.reservationId);
    if (params.subscription)  args.push('--subscription', params.subscription);
    return args;
}

// ---------------------------------------------------------------------------
// GCP Billing builders
// ---------------------------------------------------------------------------

export function buildGcpBillingAccountListArgs(): string[] {
    return ['gcloud', 'billing', 'accounts', 'list', '--format=json'];
}

export function buildGcpRecommenderListArgs(params: {
    project:       string;
    location?:     string;
    recommender?:  string;    // e.g. google.compute.instance.MachineTypeRecommender
}): string[] {
    const recommender = params.recommender ?? 'google.compute.instance.MachineTypeRecommender';
    const location    = params.location    ?? 'global';
    return ['gcloud', 'recommender', 'recommendations', 'list',
        `--project=${params.project}`,
        `--location=${location}`,
        `--recommender=${recommender}`,
        '--format=json'];
}

export function buildGcpUnusedIpListArgs(project: string): string[] {
    return ['gcloud', 'compute', 'addresses', 'list',
        `--project=${project}`,
        '--filter=status=RESERVED',
        '--format=json'];
}

export function buildGcpIdleDisksArgs(project: string): string[] {
    return ['gcloud', 'compute', 'disks', 'list',
        `--project=${project}`,
        '--filter=NOT users:*',
        '--format=json'];
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

export function parseAwsRiUtilization(raw: string): RiUtilizationSummary | null {
    try {
        const json = JSON.parse(raw) as {
            Total?: {
                UtilizationsByTime?: Array<{
                    Utilization?: { UtilizationPercentage?: string; PurchasedHours?: string; UsedHours?: string };
                    AmortizedRecurringFee?: string;
                    AmortizedUpfrontFee?: string;
                    NetRISavings?: string;
                    OnDemandCostOfRIHoursUsed?: string;
                }>;
            };
        };
        const items = json.Total?.UtilizationsByTime ?? [];
        const util  = items[0]?.Utilization;
        if (!util) return null;
        return {
            utilizationPct:    parseFloat(util.UtilizationPercentage ?? '0'),
            coveredHours:      parseFloat(util.UsedHours             ?? '0'),
            totalHours:        parseFloat(util.PurchasedHours        ?? '0'),
            netSavings:        parseFloat(items[0]?.NetRISavings     ?? '0'),
            onDemandCostEquiv: parseFloat(items[0]?.OnDemandCostOfRIHoursUsed ?? '0'),
        };
    } catch {
        return null;
    }
}

export function parseAwsRightsizing(raw: string): RightsizingRecommendation[] {
    try {
        const json = JSON.parse(raw) as {
            RightsizingRecommendations?: Array<{
                CurrentInstance?: { ResourceId?: string; InstanceType?: string };
                ModifyRecommendationDetail?: {
                    TargetInstances?: Array<{
                        ResourceDetails?: { EC2ResourceDetails?: { InstanceType?: string } };
                        EstimatedMonthlySavings?: { Value?: string };
                    }>;
                };
                RightsizingType?: string;
            }>;
        };
        return (json.RightsizingRecommendations ?? []).map((r) => {
            const target = r.ModifyRecommendationDetail?.TargetInstances?.[0];
            return {
                instanceId:      r.CurrentInstance?.ResourceId                              ?? '',
                instanceType:    r.CurrentInstance?.InstanceType                            ?? '',
                recommendedType: target?.ResourceDetails?.EC2ResourceDetails?.InstanceType  ?? '',
                estimatedSavingsMonthly: parseFloat(target?.EstimatedMonthlySavings?.Value ?? '0'),
                reason:          r.RightsizingType ?? 'Modify',
            };
        });
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// LLM prompt
// ---------------------------------------------------------------------------

export function buildFinOpsPrompt(params: {
    provider:       FinOpsProvider;
    riData?:        string;
    rightsizingData?: string;
    advisorData?:   string;
    costBreakdown?: string;
    forecastData?:  string;
    budget?:        number;
}): string {
    return [
        `You are a FinOps engineer. Analyze the following cloud cost data for ${params.provider.toUpperCase()} and produce a prioritized savings plan.`,
        ``,
        params.riData        ? `RI / Savings Plan utilization:\n${params.riData.slice(0, 1500)}\n`        : '',
        params.rightsizingData ? `Rightsizing recommendations:\n${params.rightsizingData.slice(0, 1500)}\n` : '',
        params.advisorData   ? `Advisor / idle resources:\n${params.advisorData.slice(0, 1500)}\n`       : '',
        params.costBreakdown ? `Cost breakdown by service:\n${params.costBreakdown.slice(0, 1500)}\n`    : '',
        params.forecastData  ? `30-day forecast:\n${params.forecastData.slice(0, 800)}\n`                : '',
        params.budget        ? `Monthly budget target: $${params.budget}\n`                              : '',
        `For each finding provide: title, estimated monthly savings ($), effort (low/medium/high), and the CLI command to apply it.`,
        `Return a JSON array of findings sorted by estimated_savings_monthly descending:`,
        `[{ "category": "rightsizing"|"ri_underused"|"idle_resource"|"savings_plan"|"spot_opportunity", "title": string, "estimated_savings_monthly": number, "effort": "low"|"medium"|"high", "action_cli": string|null, "details": string }]`,
        `Return ONLY the JSON array — no markdown fences.`,
    ].filter(Boolean).join('\n');
}

export function parseFinOpsOutput(raw: string): FinOpsFinding[] {
    try {
        const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        const parsed = JSON.parse(cleaned) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
            .map((f) => ({
                category:                (f['category'] as FinOpsFinding['category']) ?? 'idle_resource',
                title:                   String(f['title']    ?? ''),
                estimatedSavingsMonthly: Number(f['estimated_savings_monthly'] ?? 0),
                effort:                  (f['effort'] as FinOpsFinding['effort']) ?? 'medium',
                actionSql:               f['action_cli'] ? String(f['action_cli']) : undefined,
                details:                 String(f['details']  ?? ''),
            }));
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

export function formatFinOpsReport(findings: FinOpsFinding[]): string {
    if (!findings.length) return 'No FinOps findings generated.';
    const totalSavings = findings.reduce((s, f) => s + f.estimatedSavingsMonthly, 0);
    const lines = [
        `FinOps Savings Report`,
        `Total potential monthly savings: $${totalSavings.toFixed(2)}`,
        ``,
    ];
    for (const f of findings) {
        lines.push(`[${f.category.toUpperCase()}] ${f.title}`);
        lines.push(`  Savings: $${f.estimatedSavingsMonthly.toFixed(2)}/month  Effort: ${f.effort}`);
        if (f.details) lines.push(`  ${f.details}`);
        if (f.actionSql) lines.push(`  Run: ${f.actionSql}`);
        lines.push('');
    }
    return lines.join('\n');
}
