# Verysure connected implementation

Updated 3 November 2026. The repository contains `frontend` (React Native / Expo) and `backend` (Fastify, PostgreSQL and Prisma). Root npm workspaces keep `npm run android` and `npm start` working.

## Implemented

- Server-side registration, five-minute OTP challenges with attempt limits and atomic one-use consumption, salted scrypt password hashing and revocable 30-day sessions.
- Consumer/retailer/manufacturer public registration; administrator-provisioned regulators and a separate first-admin command. No public privileged-role switching.
- Native SecureStore bearer tokens and browser HttpOnly cookies, browser-origin checks, input validation, IP rate limits and scoped response DTOs.
- PostgreSQL product verification with provenance and Genuine/Fake/Unknown verdicts; ten free checks, then ₦10 per check. Server-controlled location consent.
- Transactional quota/balance changes, stable wallet row locks, balanced transfer ledgers, retry-safe scans/transfers/credits and idempotent payment settlement. Database constraints protect money, quotas and batch dates.
- Persistent reports, private processed photo uploads with expiring URLs, manufacturer messaging/replies, read/unread notifications and editable profiles.
- Approved-manufacturer product/batch creation, bulk code inserts, recalled batches, blocked codes and rejection of codes already registered elsewhere.
- Regulatory application approval/rejection, approval numbers, official batch-number issuance, batch register and sightings with optional map links.
- Admin counts, user suspension/activation, manufacturer status management, report workflow, wallet credits, adverts, regulator provisioning and audit records for sensitive operations.
- Development seed accounts, environment examples, database migrations, Docker Compose and Windows helpers for a dedicated PostgreSQL cluster.

All UI mutations now call explicit backend endpoints. No local demo store or client-submitted database snapshot is used to authorize or apply changes. Passwords, role assignments, verdicts, quota consumption and settlement remain server-controlled.

## Development providers

Local development can use explicit demo adapters. Paystack hosted checkout now supports initialization, server-side verification, signed webhooks and automatic/manual payment checks. The supplied test key successfully initialized a sandbox checkout; its TEST success scenario was completed and verified through the backend, crediting a local test wallet exactly once. This is not a live-money test. SMTP and Resend email delivery are implemented; Render Free requires the HTTPS Resend adapter and a verified sender for all testers. These email credentials still need configuration. SMS remains a future adapter. See [DEPLOYMENT.md](DEPLOYMENT.md).

Sample product data is for development and cannot establish the authenticity of a real purchase. Generated sample EAN-13 values do not grant a GS1 allocation. Shape identifiers do not provide image-based shape recognition.

## Validation

The backend integration suite uses a separate `verysure_test` PostgreSQL database. It checks password verification, scoped data and unauthorized roles; concurrent one-use OTP claims; 15 concurrent scans consuming exactly ten free checks and five paid checks; rejected unaffordable scans; concurrent transfers without overdrafts; balanced ledgers; repeat-key scan/transfer handling; payment ownership, replay, cancellation and signed-webhook amount checks; manufacturer approval/ownership; reports, replies and notifications; cookie-origin checks, suspension revocation and location consent; photo decoding, ownership and expiring signed URLs.

Frontend tests cover money-entry validation and kobo display precision. End-to-end browser review covered server registration with a development OTP, cookie session establishment and verification of a seeded product through the API. Type checking, backend compilation and mobile/web bundle checks are recorded in the delivery handoff.

The PostgreSQL integration cases also include Paystack concurrency/signature/amount/mode checks, new consumer/retailer/manufacturer registration with a mocked email transport, regulator provisioning and a fresh product's approval-to-verification workflow, plus a 5,000-code batch and private pagination. External email delivery must still be tested with configured sender credentials. The backend runtime dependency audit returned zero reported vulnerabilities on 2 November 2026; the full workspace audit previously reported Expo/RN tooling findings, which require a separately validated SDK upgrade.

## Operational limits and remaining work

- Physical Android/iOS camera, GPS, permission and secure-storage checks still require device acceptance testing; store distribution is not configured.
- Paystack test credentials do not charge real money. Live keys, live webhooks, real email sender credentials and separate live wallet data are required before customer launch. SMS delivery is not implemented.
- Map analytics, offline verification and national-scale infrastructure remain PRD roadmap items. Full production load/security testing is still required; local integration results do not establish nationwide capacity.
- Recent dashboard collections are bounded; verification history has pagination. Administrative search/pagination beyond those bounded views is a future scale improvement.
- Private photos now default to PostgreSQL bytes and survive Render Free restarts. Legacy local-file records still require their original files. Monitor database storage and use private object storage for larger volumes. Rate limiting uses one process's memory; use a shared store when scaling.
- Wallets use integer kobo with an explicit maximum balance of ₦20,000,000 and per-operation maximum of ₦1,000,000. Expanding those limits requires a deliberate BigInt/API migration.
- Six-digit public user IDs have a finite namespace; the PRD's 200-million-user ambition cannot be met by globally unique six-digit IDs without changing the identifier design.

Configuration, route contracts and production prerequisites are documented in [API.md](API.md). The main [README](../README.md) contains startup commands and test-account details.
