# Verysure connected implementation

Updated 2 November 2026. The repository now contains `frontend` (React Native / Expo) and `backend` (Fastify, PostgreSQL and Prisma). Root npm workspaces keep the original `npm run android` and `npm start` commands working.

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

Local `backend/.env` uses demo OTP and payment adapters. The database and authentication are real. Resend and SMTP email delivery and a configurable payment-bridge contract are implemented. The Render test configuration selects SMTP email OTPs and simulated payments. SMTP transport tests cover TLS, delivery failures and private API errors; live delivery from Render still needs verification. Production provider credentials and the vendor-specific payment adapter must be configured before launch. SMS delivery remains a future adapter. See [DEPLOYMENT.md](DEPLOYMENT.md) for Render, Neon and Expo APK setup.

Sample product data is for development and cannot establish the authenticity of a real purchase. Generated sample EAN-13 values do not grant a GS1 allocation. Shape identifiers do not provide image-based shape recognition.

## Validation

The backend integration suite uses a separate `verysure_test` PostgreSQL database. It checks password verification, scoped data and unauthorized roles; concurrent one-use OTP claims; 15 concurrent scans consuming exactly ten free checks and five paid checks; rejected unaffordable scans; concurrent transfers without overdrafts; balanced ledgers; repeat-key scan/transfer handling; payment ownership, replay, cancellation and signed-webhook amount checks; manufacturer approval/ownership; reports, replies and notifications; cookie-origin checks, suspension revocation and location consent; photo decoding, ownership and expiring signed URLs.

Frontend tests cover money-entry validation and kobo display precision. End-to-end browser review covered server registration with a development OTP, cookie session establishment and verification of a seeded product through the API. Type checking, backend compilation and mobile/web bundle checks are recorded in the delivery handoff.

The twelve PostgreSQL integration cases also include a 5,000-code batch, private code pagination and duplicate-code rollback. The backend runtime dependency audit returned zero reported vulnerabilities on 2 November 2026. The full workspace audit still reports 25 findings (three high, 21 moderate, one low) through the existing Expo SDK 55 and React Native tooling tree. Resolving those requires a separately validated mobile SDK/toolchain upgrade; no forced major upgrade was applied during backend integration.

## Operational limits and remaining work

- Physical Android/iOS camera, GPS, permission and secure-storage checks; signed APK/IPA builds and app-store distribution still require device/account-owned testing.
- Live OTP/payment providers are not activated. There is no real settlement or SMS delivery with the supplied development configuration.
- Map analytics, offline verification and national-scale infrastructure remain PRD roadmap items. Full production load/security testing is still required; local integration results do not establish nationwide capacity.
- Recent dashboard collections are bounded; verification history has pagination. Administrative search/pagination beyond those bounded views is a future scale improvement.
- Private photos use local persistent storage. Multiple API instances require shared/object storage. Rate limiting currently uses one process's memory; use a shared store when scaling.
- Wallets use integer kobo with an explicit maximum balance of ₦20,000,000 and per-operation maximum of ₦1,000,000. Expanding those limits requires a deliberate BigInt/API migration.
- Six-digit public user IDs have a finite namespace; the PRD's 200-million-user ambition cannot be met by globally unique six-digit IDs without changing the identifier design.

Configuration, route contracts and production prerequisites are documented in [API.md](API.md). The main [README](../README.md) contains startup commands and test-account details.
