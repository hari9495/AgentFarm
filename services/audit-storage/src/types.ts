/**
 * Configuration for Azure Blob audit storage.
 */
export interface AuditStorageConfig {
    accountUrl: string;           // e.g., https://myaccount.blob.core.windows.net
    container: string;            // e.g., 'audit-artifacts'
    writeSasToken: string;        // SAS token with write permissions
    readSasToken?: string;        // SAS token with read permissions (defaults to write token)
}

/**
 * Result of uploading an artifact to blob storage.
 */
export interface ArtifactUploadResult {
    path: string;                 // Storage path (e.g., screenshots/ten_xxx/agt_xxx/ses_xxx/scr_xxx.png)
    url: string;                  // Full signed URL for download
    sha256: string;               // SHA256 hash of uploaded content
    sizeBytes: number;            // Size in bytes
    uploadedAt: string;           // ISO 8601 timestamp
}

/**
 * Artifact metadata for storage operations.
 */
export interface ArtifactMetadata {
    contentType: string;          // e.g., 'image/png', 'video/mp4'
    contentHash?: string;         // SHA256 hash (computed if not provided)
    correlationId?: string;       // For audit tracing
}
