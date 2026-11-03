# Verysure

React Native mobile frontend and a connected Fastify backend using PostgreSQL and Prisma. Registration, sessions, product verification, wallets, reports, messaging, notifications and all five role workspaces use server data. Local development uses demo OTPs and payments; the Render test configuration uses SMTP email OTPs and simulated payments.

```text
VerySure/
  frontend/             React Native / Expo application
  backend/
    src/                Authenticated API and services
    prisma/             PostgreSQL schema, migrations and development seed
    scripts/            Test migrations and administrator provisioning
    tests/              Integration tests using a separate PostgreSQL database
    .env                Local configuration and generated secrets (ignored)
  scripts/              Windows local database start/stop helpers
  docs/                 API and implementation notes
```

Mobile application code and assets live in `frontend`; API code, Prisma migrations and server tests live in `backend`. The root `node_modules` directory is shared by the npm workspaces. Generated Prisma files and build output are generated dependencies, rather than additional copies of the app. The backend production build includes only server source; tests and setup scripts stay outside that output.

## Run on this Windows computer

Use PowerShell. Node.js 24 and PostgreSQL 17 are installed here. The setup helper manages a dedicated cluster on **127.0.0.1:55432** inside `backend/.local`; it leaves the existing PostgreSQL service on port 5432 alone.

First-time installation or setup:

```powershell
cd C:\Users\HP\Desktop\VerySure
npm install
.\scripts\setup-local-db.ps1
npm run db:generate
npm run db:migrate
npm run db:seed
```

The database and seed were configured during implementation. After a restart, run the database helper again, then use two terminals:

**Terminal 1 — backend**

```powershell
cd C:\Users\HP\Desktop\VerySure
npm run dev:backend
```

API health: http://localhost:4000/health

**Terminal 2 — Android app**

Start your Android emulator from Android Studio's Device Manager and wait for its home screen. Then:

```powershell
cd C:\Users\HP\Desktop\VerySure
npm run android
```

The root commands forward to `frontend`, so you do not need to change into that folder. If the emulator still quits during startup, fix its boot in Android Studio first; the API does not require an emulator to run.

For the browser preview, use `npm run web`. If automatic browser launch fails, use `npm start`, then open the displayed localhost address manually. If an old Metro instance is running, stop it in its terminal or select another port.

## API address for each device

The app chooses these development defaults:

| Client                   | Backend address                                                   |
| ------------------------ | ----------------------------------------------------------------- |
| Browser or iOS simulator | `http://localhost:4000`                                           |
| Android Studio emulator  | `http://10.0.2.2:4000`                                            |
| Physical phone           | Set `EXPO_PUBLIC_API_URL` to this computer's LAN IP and port 4000 |

To override, copy `frontend/.env.example` to `frontend/.env` and set `EXPO_PUBLIC_API_URL`. Restart Metro after changing it. A phone must share the network with this computer, and the API must be reachable through the firewall. Production builds require an HTTPS API URL.

## Log in and explore

Development accounts are seeded without publicly exposing their passwords. Open `backend/.env` locally and use its **SEED_PASSWORD** value for these accounts:

| Role                  | Email                      | Verysure ID |
| --------------------- | -------------------------- | ----------- |
| Consumer              | `consumer@verysure.ng`     | `104286`    |
| Retailer              | `retailer@verysure.ng`     | `104287`    |
| Approved manufacturer | `manufacturer@verysure.ng` | `104288`    |
| NAFDAC regulator      | `monitor@verysure.ng`      | `104289`    |
| Administrator         | `admin@verysure.ng`        | `104290`    |
| Pending manufacturer  | `foods@verysure.ng`        | `204291`    |
| SON regulator         | `son@verysure.ng`          | `104292`    |

Sign out to use another account. There is no public role impersonation or public regulator/admin registration. Admins can provision regulator accounts through their workspace. The seed is development-only and does not overwrite existing accounts, passwords or wallet balances on reruns.

You can also create a consumer, retailer or manufacturer account. In `OTP_PROVIDER=demo`, its expiring OTP appears on the registration screen. Passwords are hashed on the server. Native session tokens use SecureStore; browser sessions use HttpOnly cookies.

| Sample product code | Expected verdict                           |
| ------------------- | ------------------------------------------ |
| `VS-EMZR-2026-0001` | Genuine sample paracetamol                 |
| `6151234567891`     | Same sample product, EAN-13 identifier     |
| `VS-RECALL-0001`    | Fake verdict because the batch is recalled |
| `VS-BLOCKED-0001`   | Fake verdict because the code is blocked   |
| Unregistered code   | Unknown                                    |

The seeded records are test data, not evidence that an actual purchased product is genuine. New accounts get ten free verifications and an empty wallet. Seeded development accounts start with ₦200. Further scans cost ₦10. Transfers, charges and credits are recorded in PostgreSQL.

With `PAYMENT_PROVIDER=demo` and `ALLOW_DEMO_PAYMENTS=true`, create a payment and choose **Simulate successful payment**. It credits a development wallet once; no real money moves. Production startup rejects demo providers.

## Validate

```powershell
npm run typecheck
npm test
npm run build:backend
npm run build:web
cd frontend
npx expo export --platform all
```

Backend tests migrate and reset only the dedicated `verysure_test` database. They reject any test URL with a different database name. Do not point it at valuable data. Device camera, GPS, permission handling, signing and store distribution still require physical-device testing.

## Stop

Press **Ctrl+C** in each server terminal. To stop only the dedicated Verysure PostgreSQL cluster:

```powershell
.\scripts\stop-local-db.ps1
```

## Other environments and deployment

For this project's Render + Neon test deployment and Expo APK build, follow
[the deployment guide](docs/DEPLOYMENT.md). The included `render.yaml` prepares
a test backend with SMTP OTPs, demo payments and a persistent upload disk.

Use `backend/.env.example` as the configuration reference. Keep actual `.env` files and `backend/.local` private. Docker Compose is supplied as an alternative to the Windows cluster helper; it requires `POSTGRES_PASSWORD` and an available Docker engine. Do not run both database options on port 55432 at the same time.

For a deployed backend, use managed PostgreSQL, run `prisma migrate deploy`, create a dedicated admin with `npm run admin:create --workspace backend`, configure HTTPS and allowed browser origins, persist private uploads, and configure real providers. See [backend API documentation](docs/API.md) and [implementation notes](docs/IMPLEMENTATION.md).

The existing EAS profiles in `frontend/eas.json` can produce signed account-owned Android/iOS builds. No APK/IPA has been submitted or deployed to an app store.
