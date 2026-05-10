/**
 * Zoho Sign Client
 *
 * Provides OAuth client_credentials token acquisition and Zoho Sign API
 * operations: upload document, submit for signing, poll status, download PDF.
 *
 * Required env vars:
 *   ZOHO_CLIENT_ID       — Zoho OAuth client ID
 *   ZOHO_CLIENT_SECRET   — Zoho OAuth client secret
 */

const ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.com/oauth/v2/token';
const ZOHO_SIGN_BASE = 'https://sign.zoho.com/api/v1';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UploadContractParams = {
    pdfBuffer: Buffer;
    fileName: string;
    recipientName: string;
    recipientEmail: string;
    requestName: string;
};

export type UploadContractResult = {
    requestId: string;
    documentId: string;
};

export type DocumentStatus = {
    status: string;
    signerEmail: string;
    completedAt?: string;
};

// ---------------------------------------------------------------------------
// Token acquisition
// ---------------------------------------------------------------------------

/**
 * Fetches a short-lived access token via client_credentials grant.
 * Throws if the OAuth request fails or returns no access_token.
 */
export async function getZohoSignAccessToken(): Promise<string> {
    const clientId = process.env['ZOHO_CLIENT_ID'];
    const clientSecret = process.env['ZOHO_CLIENT_SECRET'];

    if (!clientId || !clientSecret) {
        throw new Error('ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET must be set');
    }

    const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
        scope: 'ZohoSign.documents.ALL',
    });

    const res = await fetch(`${ZOHO_ACCOUNTS_URL}?${params.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Zoho OAuth failed (${res.status}): ${body}`);
    }

    const data = await res.json() as Record<string, unknown>;
    const token = data['access_token'];
    if (typeof token !== 'string' || !token) {
        throw new Error(`Zoho OAuth returned no access_token: ${JSON.stringify(data)}`);
    }

    return token;
}

// ---------------------------------------------------------------------------
// Upload document
// ---------------------------------------------------------------------------

/**
 * Uploads a PDF to Zoho Sign and creates a signing request.
 * Returns the request ID and document ID for subsequent operations.
 */
export async function uploadContractDocument(
    params: UploadContractParams,
): Promise<UploadContractResult> {
    const token = await getZohoSignAccessToken();

    const requestData = {
        requests: {
            request_name: params.requestName,
            actions: [
                {
                    action_type: 'SIGN',
                    recipient_name: params.recipientName,
                    recipient_email: params.recipientEmail,
                    signing_order: 1,
                    verify_recipient: false,
                },
            ],
            expiration_days: 30,
            is_sequential: true,
            email_reminders: true,
        },
    };

    const form = new FormData();
    form.append('data', JSON.stringify(requestData));
    form.append(
        'file',
        new Blob([new Uint8Array(params.pdfBuffer)], { type: 'application/pdf' }),
        params.fileName,
    );

    const res = await fetch(`${ZOHO_SIGN_BASE}/requests`, {
        method: 'POST',
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
        body: form,
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Zoho Sign upload failed (${res.status}): ${body}`);
    }

    const data = await res.json() as Record<string, unknown>;
    const requests = data['requests'] as Record<string, unknown> | undefined;
    const requestId = requests?.['request_id'];
    const documents = requests?.['document_ids'] as Array<Record<string, unknown>> | undefined;
    const documentId = documents?.[0]?.['document_id'];

    if (typeof requestId !== 'string' || !requestId) {
        throw new Error(`Zoho Sign upload returned no request_id: ${JSON.stringify(data)}`);
    }
    if (typeof documentId !== 'string' && typeof documentId !== 'number') {
        throw new Error(`Zoho Sign upload returned no document_id: ${JSON.stringify(data)}`);
    }

    return { requestId, documentId: String(documentId) };
}

// ---------------------------------------------------------------------------
// Submit for signing
// ---------------------------------------------------------------------------

/**
 * Submits an uploaded document request for signing (moves it out of draft).
 * Returns true on success, false on failure.
 */
export async function submitDocumentForSigning(requestId: string): Promise<boolean> {
    const token = await getZohoSignAccessToken();

    const res = await fetch(`${ZOHO_SIGN_BASE}/requests/${requestId}/submit`, {
        method: 'POST',
        headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            'Content-Type': 'application/json',
        },
    });

    return res.ok;
}

// ---------------------------------------------------------------------------
// Get document status
// ---------------------------------------------------------------------------

/**
 * Returns current status, signer email, and completion timestamp for a request.
 */
export async function getDocumentStatus(requestId: string): Promise<DocumentStatus> {
    const token = await getZohoSignAccessToken();

    const res = await fetch(`${ZOHO_SIGN_BASE}/requests/${requestId}`, {
        method: 'GET',
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Zoho Sign status fetch failed (${res.status}): ${body}`);
    }

    const data = await res.json() as Record<string, unknown>;
    const requests = data['requests'] as Record<string, unknown> | undefined;
    const actions = requests?.['actions'] as Array<Record<string, unknown>> | undefined;
    const firstAction = actions?.[0];

    const status = (requests?.['request_status'] as string | undefined) ?? 'unknown';
    const signerEmail = (firstAction?.['recipient_email'] as string | undefined) ?? '';
    const completedAt =
        requests?.['completed_time']
            ? String(requests['completed_time'])
            : undefined;

    return { status, signerEmail, completedAt };
}

// ---------------------------------------------------------------------------
// Download signed PDF
// ---------------------------------------------------------------------------

/**
 * Downloads the signed PDF for a completed request.
 * Returns the raw PDF as a Buffer.
 */
export async function downloadSignedDocument(requestId: string): Promise<Buffer> {
    const token = await getZohoSignAccessToken();

    const res = await fetch(`${ZOHO_SIGN_BASE}/requests/${requestId}/pdf`, {
        method: 'GET',
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Zoho Sign PDF download failed (${res.status}): ${body}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
