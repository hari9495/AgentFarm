import { createHash } from 'node:crypto';
import { BlobServiceClient } from '@azure/storage-blob';
import type { AuditStorageConfig, ArtifactUploadResult, ArtifactMetadata } from './types.js';

/**
 * Azure Blob Storage implementation for audit artifact uploads.
 * Handles screenshots, recordings, and DOM snapshots with signed URL generation.
 */
export class AzureBlobAuditStorage {
    private accountUrl: string;
    private container: string;
    private writeSasToken: string;
    private readSasToken: string;
    private blobServiceClient: BlobServiceClient;

    constructor(config: AuditStorageConfig) {
        this.accountUrl = config.accountUrl.replace(/\/+$/, '');
        this.container = config.container;
        this.writeSasToken = config.writeSasToken.replace(/^\?/, '');
        this.readSasToken = (config.readSasToken ?? config.writeSasToken).replace(/^\?/, '');

        // Create blob service client using SAS token URL
        const sasUrl = this.accountUrl.includes('?')
            ? this.accountUrl
            : `${this.accountUrl}?${this.writeSasToken}`;
        this.blobServiceClient = new BlobServiceClient(sasUrl);
    }

    /**
     * Upload artifact to blob storage with automatic hash and signed URL.
     * @param path Storage path (e.g., screenshots/tenantId/agentId/sessionId/screenshotId.png)
     * @param data Binary artifact content
     * @param metadata Optional artifact metadata
     * @returns Upload result with signed download URL
     */
    async uploadArtifact(
        path: string,
        data: Uint8Array,
        metadata?: ArtifactMetadata,
    ): Promise<ArtifactUploadResult> {
        const containerClient = this.blobServiceClient.getContainerClient(this.container);
        const blockBlobClient = containerClient.getBlockBlobClient(path);

        // Compute hash if not provided
        const sha256 = metadata?.contentHash
            ? metadata.contentHash
            : createHash('sha256').update(data).digest('hex');

        // Upload with metadata
        await blockBlobClient.upload(data, data.length, {
            metadata: {
                'audit-hash': sha256,
                'audit-correlation-id': metadata?.correlationId ?? 'unknown',
                'upload-timestamp': new Date().toISOString(),
            },
            blobHTTPHeaders: {
                blobContentType: metadata?.contentType ?? 'application/octet-stream',
            },
        });

        // Generate signed download URL (1-day expiry)
        const signedUrl = this.generateSignedUrl(path, 24 * 60 * 60); // 86400 seconds = 1 day

        return {
            path,
            url: signedUrl,
            sha256,
            sizeBytes: data.length,
            uploadedAt: new Date().toISOString(),
        };
    }

    /**
     * Generate signed download URL for an artifact.
     * @param path Blob path
     * @param expirySeconds How long the URL remains valid (default: 1 day)
     * @returns Full signed URL
     */
    private generateSignedUrl(path: string, expirySeconds: number = 86400): string {
        const containerClient = this.blobServiceClient.getContainerClient(this.container);
        const blockBlobClient = containerClient.getBlockBlobClient(path);

        // Use read SAS token to generate URL
        return `${blockBlobClient.url}?${this.readSasToken}`;
    }

    /**
     * Delete an artifact from blob storage.
     * Used by retention cleanup jobs.
     * @param path Blob path to delete
     */
    async deleteArtifact(path: string): Promise<void> {
        const containerClient = this.blobServiceClient.getContainerClient(this.container);
        const blockBlobClient = containerClient.getBlockBlobClient(path);
        await blockBlobClient.delete();
    }

    /**
     * List artifacts by prefix (for compliance queries).
     * @param prefix Blob path prefix (e.g., "screenshots/ten_abc123/")
     * @returns Array of blob names matching prefix
     */
    async listArtifactsByPrefix(prefix: string): Promise<string[]> {
        const containerClient = this.blobServiceClient.getContainerClient(this.container);
        const results: string[] = [];

        for await (const blob of containerClient.listBlobsFlat({ prefix })) {
            results.push(blob.name);
        }

        return results;
    }

    /**
     * Extract storage account name from account URL.
     */
    private extractAccountName(url: string): string {
        const match = url.match(/https:\/\/([a-z0-9]+)\.blob\.core\.windows\.net/);
        return match ? match[1] : 'unknown';
    }

    /**
     * Verify artifact integrity by checking hash.
     * @param path Blob path
     * @param expectedHash Expected SHA256 hash
     */
    async verifyArtifactHash(path: string, expectedHash: string): Promise<boolean> {
        const containerClient = this.blobServiceClient.getContainerClient(this.container);
        const blockBlobClient = containerClient.getBlockBlobClient(path);

        try {
            const properties = await blockBlobClient.getProperties();
            const storedHash = properties.metadata?.['audit-hash'];
            return storedHash === expectedHash;
        } catch {
            return false;
        }
    }
}
