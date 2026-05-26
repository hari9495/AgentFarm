// ============================================================================
// DEVOPS CONTAINER REGISTRY BUILDER
//
// Container registry hygiene — tag cleanup, retention policies, image mirroring:
//
//   AWS ECR    — list/delete images, put lifecycle policy
//   GHCR       — delete package versions via GitHub REST API
//   GCR / GAR  — gcloud artifacts / container images
//   ACR        — az acr repository / manifest
//   Mirror     — docker pull → retag → push to destination registry
//
// All delete operations require allow_destructive: true in the caller.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RegistryProvider = 'ecr' | 'ghcr' | 'gcr' | 'gar' | 'acr' | 'dockerhub';

export interface ImageTag {
    provider:   RegistryProvider;
    repository: string;
    tag:        string;
    digest?:    string;
    pushedAt?:  Date;
    sizeBytes?: number;
}

export interface RetentionPolicy {
    keepLatest?:     number;   // keep N most-recently-pushed tags
    keepTagPattern?: string;   // regex — tags matching this are always kept
    maxAgeDays?:     number;   // delete tags older than N days
    keepTags?:       string[]; // exact tag names to always keep (e.g. ['latest', 'stable'])
}

// ---------------------------------------------------------------------------
// ECR builders
// ---------------------------------------------------------------------------

export function buildEcrDescribeReposArgs(region?: string, registryId?: string): string[] {
    const args = ['aws', 'ecr', 'describe-repositories', '--output', 'json'];
    if (region)     args.push('--region', region);
    if (registryId) args.push('--registry-id', registryId);
    return args;
}

export function buildEcrListImagesArgs(params: {
    repository: string;
    region?:    string;
    filter?:    'TAGGED' | 'UNTAGGED';
}): string[] {
    const args = ['aws', 'ecr', 'describe-images',
        '--repository-name', params.repository,
        '--output', 'json'];
    if (params.region) args.push('--region', params.region);
    if (params.filter) args.push('--filter', `tagStatus=${params.filter}`);
    return args;
}

export function buildEcrDeleteImagesArgs(params: {
    repository:   string;
    imageDigests: string[];   // sha256:abc... digests
    region?:      string;
}): string[] {
    const ids = params.imageDigests.map((d) => `imageDigest=${d}`).join(',');
    const args = ['aws', 'ecr', 'batch-delete-image',
        '--repository-name', params.repository,
        '--image-ids', ids,
        '--output', 'json'];
    if (params.region) args.push('--region', params.region);
    return args;
}

/**
 * Build `aws ecr put-lifecycle-policy` args.
 * policyJson should be a valid ECR lifecycle policy JSON string.
 */
export function buildEcrPutLifecyclePolicyArgs(params: {
    repository:   string;
    policyJson:   string;
    region?:      string;
}): string[] {
    const args = ['aws', 'ecr', 'put-lifecycle-policy',
        '--repository-name', params.repository,
        '--lifecycle-policy-text', params.policyJson,
        '--output', 'json'];
    if (params.region) args.push('--region', params.region);
    return args;
}

/**
 * Build a standard ECR lifecycle policy JSON that keeps the N most recent
 * tagged images and deletes untagged images after 1 day.
 */
export function buildEcrLifecyclePolicyJson(params: {
    keepLatestCount?: number;   // default: 10
    maxTaggedAgeDays?: number;  // optional: expire old tagged images too
    keepTagPrefixes?: string[]; // e.g. ['v', 'release-']
}): string {
    const rules: Array<Record<string, unknown>> = [];
    let priority = 1;

    // Always keep specific prefixes
    for (const prefix of params.keepTagPrefixes ?? []) {
        rules.push({
            rulePriority: priority++,
            description:  `Keep ${prefix}* tags indefinitely`,
            selection: {
                tagStatus:     'tagged',
                tagPrefixList: [prefix],
                countType:     'imageCountMoreThan',
                countNumber:   1000,
            },
            action: { type: 'expire' },
        });
    }

    // Keep last N tagged images
    rules.push({
        rulePriority: priority++,
        description:  `Keep last ${params.keepLatestCount ?? 10} tagged images`,
        selection: {
            tagStatus:   'tagged',
            countType:   'imageCountMoreThan',
            countNumber: params.keepLatestCount ?? 10,
        },
        action: { type: 'expire' },
    });

    // Delete untagged after 1 day
    rules.push({
        rulePriority: priority++,
        description:  'Expire untagged images after 1 day',
        selection: {
            tagStatus:       'untagged',
            countType:       'sinceImagePushed',
            countUnit:       'days',
            countNumber:     1,
        },
        action: { type: 'expire' },
    });

    if (params.maxTaggedAgeDays) {
        rules.push({
            rulePriority: priority++,
            description:  `Expire tagged images older than ${params.maxTaggedAgeDays} days`,
            selection: {
                tagStatus:   'any',
                countType:   'sinceImagePushed',
                countUnit:   'days',
                countNumber: params.maxTaggedAgeDays,
            },
            action: { type: 'expire' },
        });
    }

    return JSON.stringify({ rules }, null, 2);
}

// ---------------------------------------------------------------------------
// GHCR (GitHub Container Registry) builders via REST API
// ---------------------------------------------------------------------------

export function buildGhcrListVersionsArgs(params: {
    owner:       string;
    packageName: string;
    token:       string;   // GitHub PAT or Actions token
    packageType?: string;  // default: container
    perPage?:    number;
}): string[] {
    const type = params.packageType ?? 'container';
    const url  = `https://api.github.com/users/${params.owner}/packages/${type}/${params.packageName}/versions?per_page=${params.perPage ?? 100}`;
    return ['curl', '-s', '-L', '-H', `Authorization: Bearer ${params.token}`, '-H', 'Accept: application/vnd.github+json', url];
}

export function buildGhcrDeleteVersionArgs(params: {
    owner:       string;
    packageName: string;
    versionId:   number;
    token:       string;
    packageType?: string;
}): string[] {
    const type = params.packageType ?? 'container';
    const url  = `https://api.github.com/users/${params.owner}/packages/${type}/${params.packageName}/versions/${params.versionId}`;
    return ['curl', '-s', '-L', '-X', 'DELETE', '-H', `Authorization: Bearer ${params.token}`, '-H', 'Accept: application/vnd.github+json', url];
}

// ---------------------------------------------------------------------------
// GCR / GAR (Google Artifact Registry) builders
// ---------------------------------------------------------------------------

export function buildGcloudImagesListArgs(params: {
    repository: string;   // gcr.io/project/image or us-central1-docker.pkg.dev/project/repo/image
    project?:   string;
    format?:    'json' | 'table';
}): string[] {
    return ['gcloud', 'container', 'images', 'list-tags',
        params.repository,
        `--format=${params.format ?? 'json'}`,
        ...(params.project ? ['--project', params.project] : [])];
}

export function buildGcloudImagesDeleteArgs(params: {
    imageWithDigest: string;  // gcr.io/project/image@sha256:abc
    project?:        string;
    force?:          boolean;
}): string[] {
    const args = ['gcloud', 'container', 'images', 'delete', params.imageWithDigest, '--quiet'];
    if (params.project) args.push('--project', params.project);
    if (params.force)   args.push('--force-delete-tags');
    return args;
}

export function buildGarListImagesArgs(params: {
    repository: string;   // projects/PROJECT/locations/REGION/repositories/REPO
    format?:    'json';
}): string[] {
    return ['gcloud', 'artifacts', 'docker', 'images', 'list',
        params.repository,
        `--format=${params.format ?? 'json'}`];
}

// ---------------------------------------------------------------------------
// ACR (Azure Container Registry) builders
// ---------------------------------------------------------------------------

export function buildAcrShowTagsArgs(params: {
    registry:    string;   // myregistry (without .azurecr.io)
    repository:  string;
    orderby?:    'time_desc' | 'time_asc';
    top?:        number;
    subscription?: string;
}): string[] {
    const args = ['az', 'acr', 'repository', 'show-tags',
        '--name', params.registry,
        '--repository', params.repository,
        '--output', 'json'];
    if (params.orderby) args.push('--orderby', params.orderby);
    if (params.top)     args.push('--top', String(params.top));
    if (params.subscription) args.push('--subscription', params.subscription);
    return args;
}

export function buildAcrManifestDeleteArgs(params: {
    registry:    string;
    name:        string;   // repository:tag or repository@digest
    subscription?: string;
}): string[] {
    const args = ['az', 'acr', 'manifest', 'delete',
        '--name', params.name,
        '--registry', params.registry,
        '--yes', '--output', 'json'];
    if (params.subscription) args.push('--subscription', params.subscription);
    return args;
}

export function buildAcrPurgePolicyArgs(params: {
    registry:    string;
    filter:      string;   // e.g. 'myrepo:.*' or 'myrepo:[0-9]{8}.*'
    ago:         string;   // e.g. '30d'
    keepLatest?: number;
    subscription?: string;
    dryRun?:     boolean;
}): string[] {
    const args = ['az', 'acr', 'run',
        '--registry', params.registry,
        '--cmd', [
            `acr purge --filter '${params.filter}'`,
            `--ago ${params.ago}`,
            params.keepLatest ? `--keep ${params.keepLatest}` : '',
            params.dryRun ? '--dry-run' : '',
            '--untagged',
        ].filter(Boolean).join(' '),
        '/dev/null',
    ];
    if (params.subscription) args.push('--subscription', params.subscription);
    return args;
}

// ---------------------------------------------------------------------------
// Image mirror / copy builder
// ---------------------------------------------------------------------------

/**
 * Build a sequence of Docker commands to mirror an image between registries.
 * Returns an array of command arrays (pull, tag, push).
 */
export function buildDockerMirrorCommands(params: {
    sourceImage:  string;   // e.g. docker.io/library/nginx:1.25
    destRegistry: string;   // e.g. 123456789.dkr.ecr.us-east-1.amazonaws.com
    destRepo:     string;   // e.g. nginx
    destTag?:     string;   // default: same as source tag
}): { pull: string[]; tag: string[]; push: string[] } {
    const srcTag  = params.sourceImage.split(':')[1] ?? 'latest';
    const destTag = params.destTag ?? srcTag;
    const destImage = `${params.destRegistry}/${params.destRepo}:${destTag}`;

    return {
        pull: ['docker', 'pull', params.sourceImage],
        tag:  ['docker', 'tag', params.sourceImage, destImage],
        push: ['docker', 'push', destImage],
    };
}

/**
 * Build `crane copy` args — faster than docker pull/tag/push (no local daemon needed).
 * crane is part of the Google go-containerregistry project.
 */
export function buildCraneCopyArgs(source: string, dest: string, platform?: string): string[] {
    const args = ['crane', 'copy', source, dest];
    if (platform) args.push('--platform', platform);
    return args;
}

/**
 * Build `skopeo copy` args — alternative to crane.
 */
export function buildSkopeoCopyArgs(params: {
    source: string;
    dest:   string;
    srcCreds?: string;   // user:pass
    destCreds?: string;
    platform?: string;
    all?: boolean;       // copy all architectures
}): string[] {
    const args = ['skopeo', 'copy'];
    if (params.srcCreds)  args.push('--src-creds',  params.srcCreds);
    if (params.destCreds) args.push('--dest-creds', params.destCreds);
    if (params.platform)  args.push('--override-os', 'linux', '--override-arch', params.platform);
    if (params.all)       args.push('--all');
    args.push(`docker://${params.source}`, `docker://${params.dest}`);
    return args;
}

// ---------------------------------------------------------------------------
// Retention filter helper
// ---------------------------------------------------------------------------

/**
 * Given a list of image tags and a retention policy, return which tags to delete.
 * Pure function — no side effects.
 */
export function applyRetentionPolicy(tags: ImageTag[], policy: RetentionPolicy): { keep: ImageTag[]; delete: ImageTag[] } {
    const keepSet = new Set<string>();
    const sorted  = [...tags].sort((a, b) => (b.pushedAt?.getTime() ?? 0) - (a.pushedAt?.getTime() ?? 0));

    // Always keep exact tags
    for (const t of sorted) {
        if (policy.keepTags?.includes(t.tag)) keepSet.add(t.digest ?? t.tag);
    }

    // Keep by pattern
    if (policy.keepTagPattern) {
        const re = new RegExp(policy.keepTagPattern);
        for (const t of sorted) {
            if (re.test(t.tag)) keepSet.add(t.digest ?? t.tag);
        }
    }

    // Keep latest N
    if (policy.keepLatest) {
        let kept = 0;
        for (const t of sorted) {
            if (kept >= policy.keepLatest) break;
            keepSet.add(t.digest ?? t.tag);
            kept++;
        }
    }

    // Age filter
    const cutoff = policy.maxAgeDays
        ? new Date(Date.now() - policy.maxAgeDays * 24 * 60 * 60 * 1000)
        : null;

    const keep:   ImageTag[] = [];
    const toDelete: ImageTag[] = [];

    for (const t of tags) {
        const id = t.digest ?? t.tag;
        if (keepSet.has(id)) {
            keep.push(t);
        } else if (cutoff && t.pushedAt && t.pushedAt < cutoff) {
            toDelete.push(t);
        } else if (!cutoff && !keepSet.has(id) && policy.keepLatest) {
            toDelete.push(t);
        } else {
            keep.push(t);  // no policy matched — keep by default
        }
    }

    return { keep, delete: toDelete };
}

// ---------------------------------------------------------------------------
// Output parsers
// ---------------------------------------------------------------------------

export function parseEcrImages(raw: string): ImageTag[] {
    try {
        const json = JSON.parse(raw) as { imageDetails?: Array<{ imageDigest?: string; imageTags?: string[]; imagePushedAt?: string; imageSizeInBytes?: number; repositoryName?: string }> };
        const out: ImageTag[] = [];
        for (const img of json.imageDetails ?? []) {
            const tags = img.imageTags?.length ? img.imageTags : ['<untagged>'];
            for (const tag of tags) {
                out.push({
                    provider:   'ecr',
                    repository: img.repositoryName ?? '',
                    tag,
                    digest:     img.imageDigest,
                    pushedAt:   img.imagePushedAt ? new Date(img.imagePushedAt) : undefined,
                    sizeBytes:  img.imageSizeInBytes,
                });
            }
        }
        return out;
    } catch {
        return [];
    }
}

export function formatRegistryCleanupReport(deleted: ImageTag[], kept: ImageTag[]): string {
    const totalSaved = deleted.reduce((s, t) => s + (t.sizeBytes ?? 0), 0);
    return [
        `Registry cleanup summary`,
        `  Kept:    ${kept.length} tag(s)`,
        `  Deleted: ${deleted.length} tag(s) (${(totalSaved / 1024 / 1024).toFixed(1)} MB freed)`,
        deleted.length > 0 ? `  Tags deleted: ${deleted.slice(0, 10).map((t) => t.tag).join(', ')}${deleted.length > 10 ? ' ...' : ''}` : '',
    ].filter(Boolean).join('\n');
}
