# Payments & E-Signature

> AgentFarm dual-provider payment infrastructure (Stripe + Razorpay) with Zoho Sign e-signature contract workflow.
> Last updated: 2026-05-10

---

## Overview

AgentFarm supports two payment providers:

| Provider | Markets | Currency |
|---|---|---|
| **Stripe** | International | USD (and others) |
| **Razorpay** | India | INR |

After a successful payment, the platform automatically:
1. Generates a contract PDF
2. Sends it to the customer via Zoho Sign for e-signature
3. Triggers Azure VM provisioning once the contract is signed

---

## Environment Variables

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Razorpay
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=rzp_secret_...
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_...

# Zoho Sign
ZOHO_CLIENT_ID=...
ZOHO_CLIENT_SECRET=...
ZOHO_SIGN_WEBHOOK_TOKEN=...
```

---

## Order Lifecycle

```
pending  ──► paid  ──► contract_sent  ──► signed  ──► provisioned
                │                │              │
                │                │              └── signatureStatus: 'signed'
                │                │                  signedAt: DateTime
                │                │
                │                └── zohoSignRequestId: string
                │                    contractSentAt: DateTime
                │                    signatureStatus: 'sent'
                │
                └── status: 'paid'
                    Invoice created
```

### Order Schema Fields

```prisma
model Order {
  id                String    @id @default(uuid())
  tenantId          String
  planId            String
  status            String    @default("pending")  // pending | paid | failed | refunded
  provider          String                         // stripe | razorpay
  externalOrderId   String?
  amountInr         Int?
  amountUsd         Int?
  currency          String
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  // Zoho Sign fields (added sprint 3)
  contractPdfUrl    String?
  zohoSignRequestId String?
  signatureStatus   String?   @default("pending")  // pending | sent | signed | failed
  signedAt          DateTime?
  contractSentAt    DateTime?

  tenant  Tenant   @relation(fields: [tenantId], references: [id])
  plan    Plan     @relation(fields: [planId], references: [id])
  invoice Invoice?
}
```

---

## Payment Providers

### Stripe (International)

**Checkout flow:**

1. Client calls `POST /api/billing/orders` with `provider: 'stripe'`
2. API gateway creates a Stripe `PaymentIntent` and returns `externalOrderId`
3. Website mounts Stripe.js Elements with the client secret
4. Customer completes payment (card, bank transfer, etc.)
5. Stripe fires `payment_intent.succeeded` webhook

**Webhook endpoint:** `POST /v1/billing/webhook/stripe`

**Verification:** `stripe.webhooks.constructEvent(rawBody, stripeSignature, STRIPE_WEBHOOK_SECRET)`

```typescript
// Example raw body handling
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
```

**Handled events:**
- `payment_intent.succeeded` — triggers full post-payment workflow

---

### Razorpay (India / INR)

**Checkout flow:**

1. Client calls `POST /api/billing/orders` with `provider: 'razorpay'`
2. API gateway creates a Razorpay order and returns `externalOrderId` + `amount`
3. Website loads Razorpay checkout script, opens payment modal
4. Customer completes payment (UPI, net banking, card)
5. Razorpay fires `payment.captured` webhook

**Webhook endpoint:** `POST /v1/billing/webhook/razorpay`

**Verification:** HMAC-SHA256 of `order_id|payment_id` using `RAZORPAY_KEY_SECRET`

```typescript
const expectedSig = crypto
  .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
  .update(`${orderId}|${paymentId}`)
  .digest('hex');
```

**Handled events:**
- `payment.captured` — triggers full post-payment workflow

---

## Post-Payment Workflow

After either provider confirms payment, the billing route triggers the following **non-blocking** workflow via `setImmediate`:

### Step 1: Mark Order Paid and Create Invoice

```typescript
await prisma.order.update({
  where: { id: orderId },
  data: { status: 'paid' }
});

await prisma.invoice.create({
  data: {
    orderId,
    tenantId,
    amountInr: order.amountInr,
    amountUsd: order.amountUsd,
    currency: order.currency,
    issuedAt: new Date()
  }
});
```

### Step 2: Generate Contract PDF

`apps/api-gateway/src/services/contract-generator.ts`

Uses **pdfkit** to generate an A4 PDF with:
- AgentFarm letterhead and branding
- Customer name, email, company
- Plan name, price, billing currency
- Contract terms and conditions
- Signature block (for Zoho Sign to attach e-signature)

```typescript
const pdfBuffer = await generateContractPdf({
  customerName: tenant.name,
  customerEmail: user.email,
  planName: plan.name,
  amountFormatted: formatAmount(order.amountInr ?? order.amountUsd!, order.currency),
  orderId: order.id,
  issuedAt: new Date().toISOString()
});
```

### Step 3: Upload to Zoho Sign

`apps/api-gateway/src/services/zoho-sign-client.ts`

```typescript
// 1. Get OAuth access token (client_credentials grant)
const token = await getZohoSignAccessToken();

// 2. Upload PDF as multipart/form-data
const uploadResult = await uploadContractDocument(token, pdfBuffer, `contract-${orderId}.pdf`);

// 3. Submit for signing (add recipient, set required fields)
const signResult = await submitDocumentForSigning(token, uploadResult.documentId, {
  recipientEmail: user.email,
  recipientName: tenant.name,
  signerRole: 'SIGNER'
});
```

### Step 4: Update Order

```typescript
await prisma.order.update({
  where: { id: orderId },
  data: {
    zohoSignRequestId: signResult.requestId,
    contractSentAt: new Date(),
    signatureStatus: 'sent'
  }
});
```

---

## Zoho Sign Client

`apps/api-gateway/src/services/zoho-sign-client.ts`

### `getZohoSignAccessToken()`

OAuth 2.0 `client_credentials` grant against Zoho's token endpoint.

```
POST https://accounts.zoho.com/oauth/v2/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=${ZOHO_CLIENT_ID}
&client_secret=${ZOHO_CLIENT_SECRET}
&scope=ZohoSign.documents.ALL
```

Returns `accessToken: string`.

**Auth header format:** `Zoho-oauthtoken {accessToken}` (not `Bearer`).

### `uploadContractDocument(accessToken, pdfBuffer, filename)`

Uploads PDF to Zoho Sign document storage using native `FormData` + `Blob`.

```
POST https://sign.zoho.com/api/v1/requests
Authorization: Zoho-oauthtoken {token}
Content-Type: multipart/form-data
```

Returns `{ documentId: string }`.

### `submitDocumentForSigning(accessToken, documentId, recipient)`

Creates a signing request with the given recipient.

```
POST https://sign.zoho.com/api/v1/requests/{documentId}/submit
Authorization: Zoho-oauthtoken {token}
```

Returns `{ requestId: string }`.

### `getDocumentStatus(accessToken, requestId)`

Polls document status.

```
GET https://sign.zoho.com/api/v1/requests/{requestId}
Authorization: Zoho-oauthtoken {token}
```

Returns `{ status: 'pending' | 'completed' | 'declined' }`.

### `downloadSignedDocument(accessToken, requestId)`

Downloads the signed PDF.

```
GET https://sign.zoho.com/api/v1/requests/{requestId}/pdf
Authorization: Zoho-oauthtoken {token}
```

Returns `Buffer`.

---

## Zoho Sign Webhook

After the customer signs the document, Zoho Sign fires a webhook to:

- **API gateway:** `POST /v1/webhooks/zoho-sign`
- **Website proxy:** `POST /api/webhooks/zoho-sign` → forwards to API gateway

### Verification

```typescript
const token = request.headers['x-zoho-webhook-token'];
if (token !== process.env.ZOHO_SIGN_WEBHOOK_TOKEN) {
  return reply.status(401).send({ error: 'UNAUTHORIZED' });
}
```

### Payload

```json
{
  "requests": {
    "request_status": "completed",
    "request_id": "zoho_request_id_here"
  }
}
```

### Handler Logic

1. Verify webhook token (401 on mismatch)
2. Ignore if `request_status !== 'completed'` (return 200, nothing to do)
3. Find `Order` where `zohoSignRequestId = request_id`
4. Update Order: `signatureStatus = 'signed'`, `signedAt = now()`
5. **Idempotency check:** if a non-failed ProvisioningJob already exists for this order → skip creation, return 200
6. Create `ProvisioningJob`:
   ```typescript
   await prisma.provisioningJob.create({
     data: {
       tenantId: order.tenantId,
       orderId: order.id,
       status: 'queued',
       triggeredBy: 'zoho_sign_webhook',
       requestedAt: new Date()
     }
   });
   ```
7. Return `{ ok: true }`

The `ProvisioningWorker` polls for `queued` jobs and drives the 11-step Azure VM provisioning state machine.

---

## Contract PDF Generator

`apps/api-gateway/src/services/contract-generator.ts`

### `generateContractPdf(params: ContractPdfParams): Promise<Buffer>`

Parameters:
```typescript
interface ContractPdfParams {
  customerName: string;
  customerEmail: string;
  planName: string;
  amountFormatted: string;  // e.g. "₹2,500" or "$29.00"
  orderId: string;
  issuedAt: string;         // ISO 8601
}
```

Output: A4 PDF `Buffer` ready for upload to Zoho Sign.

### `formatAmount(cents: number, currency: string): string`

Formats a monetary amount for display in the contract.
- INR: `₹2,500` (treats as rupees directly, not paise)
- USD: `$29.00`
- Other ISO currencies: `29.00 EUR`

---

## Provisioning Trigger

After the Zoho Sign webhook creates a `ProvisioningJob`, the `ProvisioningWorker` in `apps/api-gateway/src/services/provisioning-worker.ts` picks it up:

```
ProvisioningJob status transitions:
queued
  → validating         (validate plan, tenant, workspace)
  → creating_resources (create Azure resource group, NIC, disk)
  → configuring_network (VNet, subnet, security group)
  → deploying_vm       (ARM deployment)
  → installing_runtime (wait for cloud-init)
  → registering_bot    (register bot with API gateway)
  → health_checking    (probe /health endpoint)
  → completed

On failure at any step:
  → failed  (with failureReason, remediationHint)
  cleanup runs, audit event logged
```

**SLA:** 10-minute target. Alert if stuck > 1 hour. Hard timeout 24 hours.

---

## Testing Payments

### Stripe Test Cards

| Card Number | Scenario |
|---|---|
| `4242424242424242` | Successful payment |
| `4000000000009995` | Insufficient funds |
| `4000002500003155` | 3DS authentication required |

Use any future expiry, any 3-digit CVC.

### Razorpay Test Credentials

Use Razorpay test mode (`rzp_test_...` keys). Test UPI VPA: `success@razorpay`

### Zoho Sign Sandbox

Use Zoho Sign sandbox environment for testing:
- Register at https://sign.zoho.com (developer sandbox)
- OAuth credentials from sandbox app
- Webhook endpoint must be publicly accessible (use ngrok in local dev)

### Local Webhook Testing

To test webhooks locally:

```bash
# Stripe CLI
stripe listen --forward-to http://localhost:3000/v1/billing/webhook/stripe

# Or use ngrok for Razorpay / Zoho Sign
ngrok http 3000
# Use the ngrok URL in provider webhook settings
```

---

## Runbook: Payment Failure Recovery

### Order stuck in `pending`

1. Check payment provider dashboard for failed/expired order
2. If payment provider shows captured but order is still pending:
   - Check API gateway logs for webhook delivery errors
   - Re-trigger webhook from provider dashboard (Stripe: Developers → Webhooks → Resend)

### Contract not sent after payment

1. Check `contractSentAt` and `zohoSignRequestId` on the Order record
2. If both null, contract generation failed silently:
   - Check API gateway error logs for `setImmediate` handler
   - Manually call `generateContractPdf` + `submitDocumentForSigning` and update order
3. If `zohoSignRequestId` present but customer hasn't received email:
   - Check Zoho Sign dashboard for document status
   - Resend via Zoho Sign dashboard

### Provisioning not triggered after signing

1. Check Order `signatureStatus` — should be `'signed'`
2. Check for `ProvisioningJob` record with this `orderId`
3. If no job exists, webhook either failed delivery or token mismatch:
   - Check API gateway logs for `POST /v1/webhooks/zoho-sign`
   - Verify `ZOHO_SIGN_WEBHOOK_TOKEN` matches value in Zoho Sign dashboard
   - Manually create ProvisioningJob via `POST /v1/admin/provision` (internal scope required)
