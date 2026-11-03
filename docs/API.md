# Verysure API

The backend is a Fastify REST API with PostgreSQL 17 and Prisma ORM 7.10.1. Development base URL: `http://localhost:4000`. All JSON mutations use `Content-Type: application/json`; IDs in URL paths must be URL-encoded.

## Authentication and errors

Register through an expiring OTP challenge or sign in with an existing account. Browser clients use a 30-day HttpOnly, SameSite Strict `vs_session` cookie. Native clients set `X-Client-Type: native` during login/registration to receive an opaque token, then send `Authorization: Bearer <token>`. Only a token hash is stored in PostgreSQL. Tokens are stored in native SecureStore; the web client relies on cookies rather than localStorage.

Cookie-authenticated mutations require an `Origin` in `CORS_ORIGINS`. Native bearer requests do not require a browser Origin. Passwords use salted scrypt. Suspended users cannot authenticate; suspension revokes existing sessions.

Errors return `{ "error": "Readable explanation", "code": "OPTIONAL_MACHINE_CODE" }`. Typical statuses: 400 invalid input, 401 missing/expired session, 402 insufficient funds, 403 forbidden role/ownership, 404 absent record, 409 conflict. Payloads are validated with Zod and reject unknown fields.

## Accounts and state

| Method and route               | Input or purpose                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /health`                  | Checks database connectivity                                                                                                                     |
| `GET /api/auth/config`         | Reports whether development OTP/payment providers are enabled                                                                                    |
| `POST /api/auth/request-code`  | `name`, `email`, `phone`, `password`, `address`, `role`; retailer/manufacturer also require `company`, manufacturer requires `rc` and `category` |
| `POST /api/auth/register`      | `challengeId`, six-digit `code`; creates user, wallet and session                                                                                |
| `POST /api/auth/login`         | `identifier` (email/phone), `password`, optional `location`                                                                                      |
| `POST /api/auth/logout`        | Revokes the current session and clears the cookie                                                                                                |
| `GET /api/state`               | Role-scoped data for the authenticated mobile workspace                                                                                          |
| `PATCH /api/profile`           | `name`, `phone`, `address`, optional `company`, `locationEnabled`                                                                                |
| `GET /api/history?cursor=<id>` | Own verification history; 50 items and `nextCursor`                                                                                              |

Public registration accepts only `consumer`, `retailer` and `manufacturer`. The OTP expires after five minutes and permits at most five incorrect attempts. It can activate only one account, including under concurrent requests. Demo OTP responses include `demoCode`; SMTP and Resend responses do not. SMTP requires `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` with `OTP_PROVIDER=smtp`. Port 465 uses implicit TLS; other ports require STARTTLS. Provider errors are returned without SMTP responses or credentials.

`/api/state` contains no passwords, session tokens or OTP hashes. Consumers and retailers receive their own account, wallet, history, reports, messages and notifications. Manufacturers receive their own product codes and inbox. Regulators receive oversight records and relevant scanner contact details. Administrators receive platform records and aggregate counts. Ordinary clients never receive the global product-code list or other users' wallets. Recent collections are bounded (normally 100 records; directory/user/product collections up to 500). Use history pagination for older checks; broader administrative pagination remains a scale-out improvement.

## Verification and wallets

| Method and route                      | Input                                                |
| ------------------------------------- | ---------------------------------------------------- |
| `POST /api/verify`                    | `code`, `idempotencyKey`, optional `location`        |
| `GET /api/wallet/recipient/:id`       | Resolves an active six-digit public ID to its name   |
| `POST /api/wallet/transfer`           | `recipientId`, `amountKobo`, `idempotencyKey`        |
| `POST /api/payments`                  | `amountKobo`, `method`, `idempotencyKey`             |
| `POST /api/payments/:id/cancel`       | Cancels an owned pending payment                     |
| `POST /api/payments/:id/confirm-demo` | Development-only settlement of an owned demo payment |

`location` is `{ "latitude": 6.4, "longitude": 3.4 }`. It is retained only when the authenticated profile has enabled location sharing. Login location follows the same consent rule.

All amounts are integer kobo. The first ten verifications are free; subsequent scans cost 1,000 kobo. All verdicts consume a verification, including Unknown. Transfers have a minimum of 100 kobo; top-ups have a minimum of 10,000 kobo. Each payment, transfer or admin credit is limited to 100,000,000 kobo (₦1,000,000), and wallets are capped at 2,000,000,000 kobo (₦20,000,000) to stay within the database integer limits. These are implementation limits, not additional PRD commitments.

Use a unique request key between 12 and 100 characters. Retain it when retrying the same financial request after a network failure. Reusing a key with a changed payload returns a conflict. Wallet row locks serialize free-quota and balance changes. Transfers lock both wallets in a stable order and create equal, opposite ledger entries in the same transaction. PostgreSQL check constraints prevent negative balances and invalid quotas/amounts.

Payment `method` is `Moniepoint transfer` or `International card`. In development, these labels select a simulated provider; they do not call Moniepoint or a card network.

## Private photos and activity

| Method and route                                | Input                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| `POST /api/photos`                              | Multipart upload with one JPEG, PNG or WebP file, maximum 5 MB            |
| `GET /api/photos/:id?expires=...&signature=...` | Short-lived signed URL minted only through an authorized data response    |
| `POST /api/reports`                             | `product`, optional `code`, `description`, optional `photoId`, `location` |
| `POST /api/messages`                            | `manufacturerId`, `subject`, `body` (consumer/retailer)                   |
| `POST /api/messages/:id/reply`                  | `reply` (the owning manufacturer)                                         |
| `POST /api/notifications/read`                  | `{ "id": "..." }` or `{ "all": true }`                                    |

Photos are decoded with a pixel limit, resized, stripped of metadata and re-encoded as JPEG. User-supplied filenames do not control storage paths. Files live under private `UPLOAD_DIR`; there is no public static-upload directory. Report records store a photo ID. Signed photo URLs expire after ten minutes and must be refreshed through `/api/state`. A report cannot attach another user's upload. Persist the upload directory in deployment and include it in backups; an object-storage adapter can replace this local private storage for multiple API instances.

## Manufacturers, regulators and administrators

| Method and route                             | Access and input                                                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/products`                         | Approved manufacturer: `name`, `category`, `description`, `unit`, `regulatory`                                                            |
| `POST /api/batches`                          | Approved manufacturer: `productId`, `number`, `quantity`, `manufactured`, `expires`, `type`, optional `codes` array                       |
| `PATCH /api/batches/:id`                     | Owning approved manufacturer: `status` = `active` / `recalled`                                                                            |
| `PATCH /api/codes/:id`                       | Owning approved manufacturer: `blocked` boolean                                                                                           |
| `POST /api/monitor/manufacturers/:id/review` | Regulator/admin: `status` = `approved` / `rejected`; rejection requires `reason`                                                          |
| `POST /api/monitor/issue-batch`              | Regulator/admin: `manufacturerId`                                                                                                         |
| `PATCH /api/admin/users/:id`                 | Admin: `status` = `active` / `suspended`                                                                                                  |
| `PATCH /api/admin/manufacturers/:id`         | Admin: `status` = `pending` / `approved` / `rejected`                                                                                     |
| `PATCH /api/admin/reports/:id`               | Admin: `status` = `open` / `investigating` / `resolved`                                                                                   |
| `POST /api/admin/credits`                    | Admin: `userId`, `amountKobo`, `note`, `idempotencyKey`                                                                                   |
| `POST /api/admin/adverts`                    | Admin: `title`, `body`                                                                                                                    |
| `PATCH /api/admin/adverts/:id`               | Admin: `active` boolean                                                                                                                   |
| `POST /api/admin/monitor-users`              | Admin: unique six-digit `id`, `name`, `email`, `phone`, initial `password` (12+ characters), `address`, `organization` = `NAFDAC` / `SON` |

Batch dates use real `YYYY-MM-DD` calendar dates. Expiry must follow manufacture. Quantity is 1–5,000, with exactly one unique code per unit. Duplicate codes roll back the entire batch. Generated values support serials, EAN-13, seals and shape identifiers. Real products need licensed barcode allocations; this implementation does not recognize physical shapes from photographs. Reserved official batch numbers must have been issued to that manufacturer. Privileged status and credit operations write audit records.

Provision the first deployment administrator with `npm run admin:create --workspace backend`, setting `ADMIN_EMAIL`, `ADMIN_PASSWORD` (16+ characters), `ADMIN_NAME`, `ADMIN_PHONE`, `ADMIN_ADDRESS` in the backend environment. The command refuses to alter an existing account. Public registration cannot create admins or regulators.

## Provider configuration

Default requested development settings:

```dotenv
OTP_PROVIDER=demo
PAYMENT_PROVIDER=demo
ALLOW_DEMO_PAYMENTS=true
```

`OTP_PROVIDER=resend` uses `RESEND_API_KEY` and `OTP_FROM` for actual email delivery. SMS delivery is not implemented; add a provider adapter when the selected SMS service is known.

`PAYMENT_PROVIDER=gateway` calls an HTTPS server-to-server bridge using `PAYMENT_INITIATE_URL` and `PAYMENT_API_KEY`. It sends `{ reference, amountKobo, currency: "NGN", method, email }` with the payment reference as an idempotency key and expects `{ externalRef, checkoutUrl }`. This is a bridge contract, not a completed vendor-specific Moniepoint integration.

The bridge posts to `POST /api/payments/webhook` with the exact JSON bytes signed as HMAC-SHA512 using `PAYMENT_WEBHOOK_SECRET`, in the `X-Verysure-Signature` header. Payload:

```json
{
  "reference": "VS-PAY-...",
  "amountKobo": 10000,
  "currency": "NGN",
  "status": "success",
  "externalRef": "provider-reference"
}
```

The server verifies the signature, amount, reference, provider and payment state before crediting. Replays return `alreadySettled: true` without a second credit. Missing secrets or unsigned payloads are rejected even in development. Adapt this bridge to the chosen provider's documented authentication, checkout and event formats before accepting real money.

Production startup rejects development providers, enabled demo settlement, placeholder secrets and non-HTTPS public API URLs. In production use independently generated secrets, restrict CORS, terminate HTTPS at a trusted proxy, and configure proxy/rate-limit storage deliberately. Current IP limits are held in memory for one API instance; multi-instance deployment needs a shared rate-limit store. Do not expose the development database or use the sample seed in production.

Manufacturer code pagination: `GET /api/manufacturer/codes` accepts optional `cursor` and `batchId` query values. It returns 100 owned codes per page with `nextCursor`. The manufacturer Codes screen can load successive pages.
