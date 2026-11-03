# Verysure: Render, Paystack and Android acceptance testing

Backend: https://verysure.onrender.com. Expo project: @afropethouse/verysure-mobile.

## Render settings

Your existing service uses Root Directory `backend/`:

- Build: `npm install --include=dev && npx prisma generate && npm run build`
- Start: `npm run db:migrate && npm start`
- Health check: `/health` (now checks that the User table exists).

Keep existing database URLs and signing secrets. Both DATABASE_URL and DIRECT_URL
must target the same Neon branch/database. Set these environment variables:

```dotenv
NODE_ENV=development
HOST=0.0.0.0
TRUST_PROXY_HOPS=1
PUBLIC_API_URL=https://verysure.onrender.com
PAYMENT_PROVIDER=paystack
ALLOW_DEMO_PAYMENTS=false
PAYSTACK_SECRET_KEY=YOUR_PRIVATE_PAYSTACK_SECRET_KEY
PHOTO_STORAGE=database
```

Render supplies PORT. Actual secrets stay in ignored local files or Render.
The private backend/.env.render file has the supplied test secret. Never copy
backend credentials into frontend/.env.example. Only EXPO_PUBLIC_API_URL belongs
in frontend configuration.

The root render.yaml offers a new Blueprint setup using the workspace root.
A Git push does not update an existing manual service's environment/settings.
Do not create a duplicate service just to change your current configuration.

## Paystack dashboard

Set the webhook for the same test/live mode as your secret:

https://verysure.onrender.com/api/payments/paystack/webhook

Checkout callback (also supplied automatically on each initialization):

https://verysure.onrender.com/api/payments/paystack/callback

Hosted checkout uses only the server secret. No Paystack key is needed in the
APK. Only a signed successful webhook or server-to-server verification of the
expected NGN amount/reference credits the wallet. Retries and simultaneous
confirmations credit once. The app checks pending payments on return and offers
Check payment. Closing checkout does not cancel a payment that could still
succeed at Paystack.

The supplied sk_test_ key processes sandbox payments. Use the checkout's TEST
success/declined scenarios. Test credits are not real deposits. For live money,
activate Paystack, configure sk_live_ and live webhooks, configure real email
and set NODE_ENV=production. Use a separate Neon branch/database for live
customer wallets; do not carry demo/test balances into live operation.

## Email OTP on Render Free

Gmail SMTP is blocked on Render Free. For real emails configure Resend HTTPS:

```dotenv
OTP_PROVIDER=resend
RESEND_API_KEY=YOUR_RESEND_API_KEY
OTP_FROM=Verysure <noreply@YOUR-VERIFIED-DOMAIN>
```

Verify your domain in Resend. Its onboarding@resend.dev sender only sends to
your Resend account email, so it cannot serve all testers. Real email delivery
still requires the user's working API key and verified sender. There is no
silent fallback from failed email delivery to demo codes. OTP_PROVIDER=demo
remains available only for local/testing and does not verify email ownership.

## Report photos

Migration 20261103000000_persistent_photo_data adds private bytes in PostgreSQL.
New uploads use PHOTO_STORAGE=database by default and survive Render restarts.
Existing local-file records work if their original files still exist; files
already erased by Render cannot be recovered. Images remain resized, stripped
of metadata and accessed through signed expiring URLs. Monitor Neon storage;
for larger volumes use a private object-storage adapter.

## First administrator and other roles

Public registration supports consumer, retailer and manufacturer. Provision
an administrator with backend/scripts/create-admin.ts. It never changes an
existing account's role/password. Render Free has no Shell; run locally:

1. In private backend/.env.render, set ADMIN_EMAIL, ADMIN_PASSWORD (16+ chars),
   ADMIN_NAME, ADMIN_PHONE and ADMIN_ADDRESS. Use valid provider settings.
2. From backend/ run:

```powershell
npx tsx --env-file=.env.render scripts/create-admin.ts
```

3. Remove temporary ADMIN_* values afterward. Sign in as admin and provision
   NAFDAC/SON accounts through the app. Share account credentials privately.

A manufacturer registers, a regulator/admin approves it and issues a batch
number, then the manufacturer registers products and creates batch/unit codes.
Consumers and retailers verify those codes. Unregistered supermarket barcodes
return UNKNOWN; they cannot truthfully be declared genuine just because they scan.

## Updated APK

Wallet and scanner changes need version 1.0.1 / Android version code 2. Use the
existing EAS keystore so it can install over the previous app:

```powershell
cd C:\Users\HP\Desktop\VerySure\frontend
npx eas-cli@latest env:set --name EXPO_PUBLIC_API_URL --value https://verysure.onrender.com --environment preview --visibility plaintext
npx eas-cli@latest build --platform android --profile preview
```

Deploy matching backend changes/migrations before using database photo storage.
No Expo login is required to run the APK after installation.

## Acceptance checks

- Register using a delivered email OTP; sign in/out and confirm role permissions.
- Approve a fresh manufacturer, issue a batch, create a product/code and scan
  as consumer/retailer. Test blocked, recalled and unknown codes.
- Complete Paystack TEST checkout. Return and check the wallet. Repeat Check
  payment and confirm exactly one credit. Transfer to another Verysure ID.
- Submit a photo report, restart Render and check the photo still opens.
- Send a manufacturer message/reply and check notification/report status updates.
- Confirm ordinary users cannot perform administrator or regulator actions.

Render Free sleeps after inactivity. The app allows requests up to 90 seconds
and retains keys for safe manual retries. Camera/GPS and live-money behavior
still need device/production acceptance testing.

References: [Paystack verification](https://paystack.com/docs/payments/verify-payments/),
[Paystack webhooks](https://paystack.com/docs/payments/webhooks/),
[Render Free](https://render.com/docs/free),
[Resend sender requirements](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).
