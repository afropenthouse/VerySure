import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
const testUrl = process.env.TEST_DATABASE_URL;
assert.ok(
  testUrl && new URL(testUrl).pathname === "/verysure_test",
  "Tests only run against the dedicated verysure_test database.",
);
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testUrl;
process.env.UPLOAD_DIR = "./.local/test-uploads";
process.env.PAYMENT_WEBHOOK_SECRET = "integration-test-webhook-secret-only";
const { db } = await import("../src/db.js");
const { buildApp } = await import("../src/app.js");
const { seedDatabase } = await import("../prisma/seed.js");
const { hashPassword, checkPassword } = await import("../src/security.js");
const { config } = await import("../src/config.js");
const app = await buildApp({ logger: false });
const tokens: Record<string, string> = {};
const accounts = [
  "consumer",
  "retailer",
  "manufacturer",
  "monitor",
  "admin",
  "foods",
  "son",
];
const auth = (account = "consumer") => ({
  authorization: `Bearer ${tokens[account]}`,
});
const send = (
  url: string,
  payload: unknown,
  account = "consumer",
  method: "POST" | "PATCH" = "POST",
) =>
  app.inject({
    method,
    url,
    headers: auth(account),
    payload: payload as Record<string, unknown>,
  });
before(async () => {
  // Guard above deliberately precedes the only destructive operation, against a test-only database.
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "AuditLog", "IssuedBatch", "Advert", "Notification", "Message", "Report", "Photo", "Payment", "Verification", "Transfer", "WalletTransaction", "ProductCode", "Batch", "Product", "Manufacturer", "Session", "OtpChallenge", "Wallet", "User" CASCADE',
  );
  await seedDatabase();
  for (const account of accounts) {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "x-client-type": "native" },
      payload: {
        identifier: `${account}@verysure.ng`,
        password: process.env.SEED_PASSWORD,
      },
    });
    assert.equal(response.statusCode, 200, response.body);
    tokens[account] = response.json().token;
  }
});
after(async () => {
  await app.close();
  await db.$disconnect();
});
test("real password hashing, protected endpoints and scoped snapshots", async () => {
  const hash = await hashPassword("Example-password-123");
  assert.ok(await checkPassword("Example-password-123", hash));
  assert.equal(await checkPassword("wrong", hash), false);
  assert.equal((await app.inject({ url: "/api/state" })).statusCode, 401);
  const response = await app.inject({ url: "/api/state", headers: auth() });
  assert.equal(response.statusCode, 200);
  const state = response.json();
  assert.equal(state.users.length, 1);
  assert.equal(state.users[0].id, "104286");
  assert.ok(!response.body.includes("passwordHash"));
  assert.equal(state.codes.length, 0);
  assert.equal(Object.keys(state.wallets).length, 1);
  const forbidden = await send("/api/admin/credits", {
    userId: "104286",
    amountKobo: 10000,
    note: "unauthorized",
    idempotencyKey: randomUUID(),
  });
  assert.equal(forbidden.statusCode, 403);
  const suspendedRole = await send("/api/monitor/issue-batch", {
    manufacturerId: "104288",
  });
  assert.equal(suspendedRole.statusCode, 403);
});
test("OTP is single use, wrong attempts persist, and public registration cannot grant privileged roles", async () => {
  const payload = {
    name: "Integration Consumer",
    email: "integration@example.test",
    phone: "08099990000",
    password: "Example-password-123",
    address: "Test address",
    role: "consumer",
  };
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/request-code",
        payload: { ...payload, role: "admin" },
      })
    ).statusCode,
    400,
  );
  const challenge = await app.inject({
    method: "POST",
    url: "/api/auth/request-code",
    payload,
  });
  assert.equal(challenge.statusCode, 200, challenge.body);
  const { challengeId, demoCode } = challenge.json();
  const wrong = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { challengeId, code: demoCode === "000000" ? "111111" : "000000" },
  });
  assert.equal(wrong.statusCode, 400);
  assert.equal(
    (await db.otpChallenge.findUniqueOrThrow({ where: { id: challengeId } }))
      .attempts,
    1,
  );
  const [a, b] = await Promise.all(
    [1, 2].map(() =>
      app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { "x-client-type": "native" },
        payload: { challengeId, code: demoCode },
      }),
    ),
  );
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 400]);
  assert.equal(await db.user.count({ where: { email: payload.email } }), 1);
});
test("15 concurrent scans consume exactly ten free scans and charge exactly five", async () => {
  await db.wallet.update({
    where: { userId: "104286" },
    data: { balanceKobo: 20000, freeUsed: 0 },
  });
  const responses = await Promise.all(
    Array.from({ length: 15 }, () =>
      send("/api/verify", {
        code: "VS-EMZR-2026-0001",
        idempotencyKey: randomUUID(),
      }),
    ),
  );
  assert.ok(
    responses.every((r) => r.statusCode === 200),
    responses.map((r) => r.body).join("\n"),
  );
  const wallet = await db.wallet.findUniqueOrThrow({
    where: { userId: "104286" },
  });
  assert.equal(wallet.balanceKobo, 15000);
  assert.equal(wallet.freeUsed, 10);
  assert.equal(
    await db.walletTransaction.count({
      where: { userId: "104286", type: "charge" },
    }),
    5,
  );
  const duplicateKey = randomUUID();
  const [first, second] = await Promise.all(
    [1, 2].map(() =>
      send("/api/verify", {
        code: "VS-RECALL-0001",
        idempotencyKey: duplicateKey,
      }),
    ),
  );
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().id, second.json().id);
  assert.equal(first.json().verdict, "FAKE");
  assert.equal(
    (await db.wallet.findUniqueOrThrow({ where: { userId: "104286" } }))
      .balanceKobo,
    14000,
  );
});
test("insufficient funds reject scans with no verification or ledger write", async () => {
  await db.wallet.update({
    where: { userId: "104286" },
    data: { balanceKobo: 999, freeUsed: 10 },
  });
  const count = await db.verification.count();
  const response = await send("/api/verify", {
    code: "unknown",
    idempotencyKey: randomUUID(),
  });
  assert.equal(response.statusCode, 402);
  assert.equal(await db.verification.count(), count);
});
test("concurrent transfers cannot overdraw and both ledger sides balance", async () => {
  await db.wallet.update({
    where: { userId: "104286" },
    data: { balanceKobo: 20000 },
  });
  await db.wallet.update({
    where: { userId: "104287" },
    data: { balanceKobo: 0 },
  });
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      send("/api/wallet/transfer", {
        recipientId: "104287",
        amountKobo: 5000,
        idempotencyKey: randomUUID(),
      }),
    ),
  );
  assert.equal(results.filter((r) => r.statusCode === 200).length, 4);
  assert.equal(results.filter((r) => r.statusCode === 402).length, 6);
  assert.equal(
    (await db.wallet.findUniqueOrThrow({ where: { userId: "104286" } }))
      .balanceKobo,
    0,
  );
  assert.equal(
    (await db.wallet.findUniqueOrThrow({ where: { userId: "104287" } }))
      .balanceKobo,
    20000,
  );
  const ledger = await db.walletTransaction.aggregate({
    where: { type: { in: ["transfer_in", "transfer_out"] } },
    _sum: { amountKobo: true },
  });
  assert.equal(ledger._sum.amountKobo, 0);
  const idem = randomUUID();
  const [a, b] = await Promise.all(
    [1, 2].map(() =>
      send(
        "/api/wallet/transfer",
        { recipientId: "104286", amountKobo: 1000, idempotencyKey: idem },
        "retailer",
      ),
    ),
  );
  assert.equal(a.statusCode, 200);
  assert.equal(a.json().id, b.json().id);
});
test("demo settlement is idempotent, owned and cancellation prevents credit", async () => {
  const created = await send("/api/payments", {
    amountKobo: 10000,
    method: "Moniepoint transfer",
    idempotencyKey: randomUUID(),
  });
  assert.equal(created.statusCode, 200);
  const id = created.json().id;
  assert.equal(
    (await send(`/api/payments/${id}/confirm-demo`, {}, "retailer")).statusCode,
    404,
  );
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      send(`/api/payments/${id}/confirm-demo`, {}),
    ),
  );
  assert.ok(results.every((r) => r.statusCode === 200));
  assert.equal(
    await db.walletTransaction.count({ where: { reference: id } }),
    1,
  );
  const pending = (
    await send("/api/payments", {
      amountKobo: 10000,
      method: "International card",
      idempotencyKey: randomUUID(),
    })
  ).json();
  await send(`/api/payments/${pending.id}/cancel`, {});
  assert.equal(
    (await send(`/api/payments/${pending.id}/confirm-demo`, {})).statusCode,
    409,
  );
});
test("payment webhook rejects unsigned or mismatched payloads and safely replays", async () => {
  const id = `VS-PAY-${randomUUID()}`;
  await db.payment.create({
    data: {
      id,
      userId: "104286",
      amountKobo: 10000,
      method: "International card",
      provider: "gateway",
      externalRef: "provider-event-1",
      idempotencyKey: randomUUID(),
    },
  });
  const event = {
    reference: id,
    amountKobo: 10000,
    currency: "NGN",
    status: "success",
    externalRef: "provider-event-1",
  };
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/payments/webhook",
        payload: event,
      })
    ).statusCode,
    401,
  );
  async function deliver(payload: unknown) {
    const raw = JSON.stringify(payload);
    return app.inject({
      method: "POST",
      url: "/api/payments/webhook",
      headers: {
        "content-type": "application/json",
        "x-verysure-signature": createHmac(
          "sha512",
          process.env.PAYMENT_WEBHOOK_SECRET!,
        )
          .update(raw)
          .digest("hex"),
      },
      payload: raw,
    });
  }
  assert.equal(
    (await deliver({ ...event, amountKobo: 20000 })).statusCode,
    409,
  );
  assert.equal((await deliver(event)).statusCode, 200);
  assert.equal((await deliver(event)).json().alreadySettled, true);
  assert.equal(
    await db.walletTransaction.count({ where: { reference: id } }),
    1,
  );
});
test("manufacturer approval and ownership gates protect product/code operations", async () => {
  const product = {
    name: "Test Zinc",
    category: "Medicines",
    unit: "20 tablets",
    regulatory: "TEST-001",
    description: "Integration test product",
  };
  assert.equal((await send("/api/products", product, "foods")).statusCode, 403);
  const created = await send("/api/products", product, "manufacturer");
  assert.equal(created.statusCode, 200, created.body);
  const batch = await send(
    "/api/batches",
    {
      productId: created.json().id,
      number: "TEST-BATCH-001",
      quantity: 3,
      manufactured: "2026-10-01",
      expires: "2029-10-01",
      type: "serial",
    },
    "manufacturer",
  );
  assert.equal(batch.statusCode, 200, batch.body);
  assert.equal(
    await db.productCode.count({ where: { batchId: batch.json().id } }),
    3,
  );
  const ownCode = await db.productCode.findFirstOrThrow({
    where: { batchId: batch.json().id },
  });
  assert.equal(
    (
      await send(
        `/api/codes/${ownCode.value}`,
        { blocked: true },
        "foods",
        "PATCH",
      )
    ).statusCode,
    403,
  );
  const review = await send(
    "/api/monitor/manufacturers/204291/review",
    { status: "approved" },
    "monitor",
  );
  assert.equal(review.statusCode, 200, review.body);
  assert.ok(review.json().approval);
  assert.match(review.json().approval, /^NAFDAC-APP-\d{4}-\d{5}$/);
  assert.equal(
    (
      await send(
        "/api/monitor/issue-batch",
        { manufacturerId: "204291" },
        "monitor",
      )
    ).statusCode,
    200,
  );
});
test("reports, manufacturer replies, notifications and admin workflow persist across users", async () => {
  const report = await send("/api/reports", {
    product: "Suspected product",
    code: "TEST",
    description: "Suspicious packaging and seal at test location.",
  });
  assert.equal(report.statusCode, 200);
  const id = report.json().id;
  assert.equal(
    (
      await send(
        `/api/admin/reports/${id}`,
        { status: "investigating" },
        "retailer",
        "PATCH",
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await send(
        `/api/admin/reports/${id}`,
        { status: "investigating" },
        "admin",
        "PATCH",
      )
    ).statusCode,
    200,
  );
  const message = await send("/api/messages", {
    manufacturerId: "104288",
    subject: "Packaging question",
    body: "Can you confirm this packaging?",
  });
  assert.equal(message.statusCode, 200);
  assert.equal(
    (
      await send(
        `/api/messages/${message.json().id}/reply`,
        { reply: "Please check the code." },
        "foods",
      )
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await send(
        `/api/messages/${message.json().id}/reply`,
        { reply: "Please check the code." },
        "manufacturer",
      )
    ).statusCode,
    200,
  );
  const state = (
    await app.inject({ url: "/api/state", headers: auth() })
  ).json();
  assert.equal(
    state.reports.find((r: any) => r.id === id).status,
    "investigating",
  );
  assert.ok(state.messages.some((m: any) => m.reply));
  assert.ok(
    state.notifications.some((n: any) => n.title === "A manufacturer replied"),
  );
});
test("location consent, cookie CSRF protection and suspended session revocation", async () => {
  await db.wallet.update({
    where: { userId: "104286" },
    data: { balanceKobo: 20000 },
  });
  const scan = await send("/api/verify", {
    code: "NOT-REGISTERED",
    location: { latitude: 6.4, longitude: 3.4 },
    idempotencyKey: randomUUID(),
  });
  assert.equal(scan.statusCode, 200);
  assert.equal(scan.json().location, undefined);
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      identifier: "retailer@verysure.ng",
      password: process.env.SEED_PASSWORD,
    },
  });
  const cookie = login.cookies[0];
  assert.ok(cookie.httpOnly);
  assert.equal(login.json().token, undefined);
  const csrf = await app.inject({
    method: "PATCH",
    url: "/api/profile",
    headers: {
      cookie: `vs_session=${cookie.value}`,
      origin: "https://untrusted.example",
    },
    payload: { name: "X", phone: "08012345001", address: "X" },
  });
  assert.equal(csrf.statusCode, 403);
  const suspended = await send(
    "/api/admin/users/104287",
    { status: "suspended" },
    "admin",
    "PATCH",
  );
  assert.equal(suspended.statusCode, 200);
  assert.equal(
    (await app.inject({ url: "/api/state", headers: auth("retailer") }))
      .statusCode,
    401,
  );
});
test("private photo uploads validate bytes and expire signed links", async () => {
  const sharp = (await import("sharp")).default;
  const png = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "#c42121" },
  })
    .png()
    .toBuffer();
  async function upload(data: Buffer) {
    const boundary = `test-${randomUUID()}`;
    const bytes = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="evidence.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      data,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return app.inject({
      method: "POST",
      url: "/api/photos",
      headers: {
        ...auth(),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: bytes,
    });
  }
  assert.equal((await upload(Buffer.from("not an image"))).statusCode, 400);
  assert.equal(
    (await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')))
      .statusCode,
    400,
  );
  const response = await upload(png);
  assert.equal(response.statusCode, 200, response.body);
  const photoId = response.json().photoId;
  const persistedPhoto = await db.photo.findUniqueOrThrow({
    where: { id: photoId },
  });
  assert.ok(
    persistedPhoto.data?.length,
    "Photo bytes must persist in PostgreSQL on Render Free",
  );
  const forbidden = await send(
    "/api/reports",
    {
      product: "Other account",
      description: "This photo belongs to a different account.",
      photoId,
    },
    "manufacturer",
  );
  assert.equal(forbidden.statusCode, 403);
  const report = await send("/api/reports", {
    product: "Photo evidence",
    description: "Photo upload integration test report.",
    photoId,
  });
  assert.equal(report.statusCode, 200);
  const state = (
    await app.inject({ url: "/api/state", headers: auth() })
  ).json();
  const signed = new URL(
    state.reports.find((r: any) => r.id === report.json().id).photo,
  );
  const image = await app.inject({ url: signed.pathname + signed.search });
  assert.equal(image.statusCode, 200);
  assert.equal(image.headers["content-type"], "image/jpeg");
  assert.equal(
    (
      await app.inject({
        url: `/api/photos/${photoId}?expires=1&signature=${"0".repeat(64)}`,
      })
    ).statusCode,
    403,
  );
});

test("Paystack checkout, owner-only verification, signed webhooks and retries credit once", async () => {
  const original = { ...config };
  Object.assign(config, {
    PAYMENT_PROVIDER: "paystack",
    PAYSTACK_SECRET_KEY: "sk_test_integrationOnly",
    ALLOW_DEMO_PAYMENTS: false,
  });
  let initialized = 0;
  let transactionStatus = "pending";
  let amount = 12500;
  const fetchMock = mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, init?: RequestInit) => {
      const address = String(url);
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer sk_test_integrationOnly",
      );
      if (address.endsWith("/initialize")) {
        initialized++;
        const body = JSON.parse(String(init?.body));
        assert.equal(body.currency, "NGN");
        assert.equal(body.amount, "12500");
        assert.ok(
          body.callback_url.endsWith("/api/payments/paystack/callback"),
        );
        return new Response(
          JSON.stringify({
            status: true,
            data: {
              reference: body.reference,
              authorization_url: "https://checkout.paystack.com/test-checkout",
            },
          }),
        );
      }
      assert.ok(
        address.startsWith("https://api.paystack.co/transaction/verify/"),
      );
      return new Response(
        JSON.stringify({
          status: true,
          data: {
            reference: address.split("/").pop(),
            amount,
            currency: "NGN",
            domain: "test",
            status: transactionStatus,
          },
        }),
      );
    },
  );
  try {
    const input = {
      amountKobo: 12500,
      method: "Paystack checkout",
      idempotencyKey: randomUUID(),
    };
    const responses = await Promise.all([
      send("/api/payments", input),
      send("/api/payments", input),
    ]);
    for (const response of responses)
      assert.equal(response.statusCode, 200, response.body);
    const payment = responses[0].json();
    assert.equal(payment.id, responses[1].json().id);
    assert.equal(initialized, 1);
    assert.equal(payment.provider, "paystack");
    assert.equal(
      (await send(`/api/payments/${payment.id}/confirm-demo`, {})).statusCode,
      403,
    );
    assert.equal(
      (await send(`/api/payments/${payment.id}/cancel`, {})).statusCode,
      409,
    );
    assert.equal(
      (await send(`/api/payments/${payment.id}/verify`, {}, "manufacturer"))
        .statusCode,
      404,
    );
    const before = await db.wallet.findUniqueOrThrow({
      where: { userId: "104286" },
    });
    const pending = await send(`/api/payments/${payment.id}/verify`, {});
    assert.equal(pending.json().status, "pending");
    assert.equal(
      (await db.wallet.findUniqueOrThrow({ where: { userId: "104286" } }))
        .balanceKobo,
      before.balanceKobo,
    );
    transactionStatus = "success";
    amount = 25000;
    assert.equal(
      (await send(`/api/payments/${payment.id}/verify`, {})).statusCode,
      409,
    );
    amount = 12500;
    const event = {
      event: "charge.success",
      data: {
        reference: payment.id,
        status: "success",
        amount,
        currency: "NGN",
        domain: "test",
      },
    };
    async function webhook(payload: unknown, valid = true) {
      const raw = JSON.stringify(payload);
      return app.inject({
        method: "POST",
        url: "/api/payments/paystack/webhook",
        headers: {
          "content-type": "application/json",
          "x-paystack-signature": valid
            ? createHmac("sha512", config.PAYSTACK_SECRET_KEY!)
                .update(raw)
                .digest("hex")
            : "0".repeat(128),
        },
        payload: raw,
      });
    }
    assert.equal((await webhook(event, false)).statusCode, 401);
    assert.equal(
      (await webhook({ ...event, data: { ...event.data, currency: "USD" } }))
        .statusCode,
      409,
    );
    assert.equal(
      (await webhook({ ...event, data: { ...event.data, domain: "live" } }))
        .statusCode,
      409,
    );
    assert.equal(
      (await webhook({ ...event, data: { ...event.data, amount: 25000 } }))
        .statusCode,
      409,
    );
    const outcomes = await Promise.all([
      webhook(event),
      webhook(event),
      send(`/api/payments/${payment.id}/verify`, {}),
    ]);
    for (const outcome of outcomes)
      assert.equal(outcome.statusCode, 200, outcome.body);
    assert.equal(
      (await db.wallet.findUniqueOrThrow({ where: { userId: "104286" } }))
        .balanceKobo,
      before.balanceKobo + 12500,
    );
    assert.equal(
      await db.walletTransaction.count({
        where: { reference: payment.id, type: "topup" },
      }),
      1,
    );
    const callback = await app.inject({
      url: `/api/payments/paystack/callback?reference=${payment.id}`,
    });
    assert.equal(callback.statusCode, 200);
    assert.match(callback.body, /Payment confirmed/);
    assert.ok(!callback.body.includes("consumer@"));
    assert.equal(
      (await webhook({ event: "unrelated.event", data: {} })).statusCode,
      200,
    );
    assert.equal(
      (
        await webhook({
          ...event,
          data: { ...event.data, reference: "other-merchant-checkout" },
        })
      ).statusCode,
      200,
    );
  } finally {
    fetchMock.mock.restore();
    Object.assign(config, original);
  }
});

test("fresh manufacturer approval, issued batch and consumer/retailer verification work without sample products", async () => {
  const original = { ...config };
  Object.assign(config, {
    OTP_PROVIDER: "resend",
    RESEND_API_KEY: "test-email-key",
    OTP_FROM: "Verysure <test@example.com>",
  });
  let mailedCode = "";
  const fetchMock = mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(url), "https://api.resend.com/emails");
      const body = JSON.parse(String(init?.body));
      mailedCode = body.text.match(/\b\d{6}\b/)[0];
      return new Response(JSON.stringify({ id: randomUUID() }));
    },
  );
  async function register(
    role: "consumer" | "retailer" | "manufacturer",
    index: number,
  ) {
    const requested = await app.inject({
      method: "POST",
      url: "/api/auth/request-code",
      payload: {
        name: `Workflow ${role}`,
        email: `workflow-${role}@example.com`,
        phone: `0805555500${index}`,
        password: "Workflow-test-password-2026",
        address: "Workflow test address",
        role,
        ...(role !== "consumer" ? { company: `Workflow ${role}` } : {}),
        ...(role === "manufacturer"
          ? { rc: "RC-WORKFLOW", category: "Food & beverages" }
          : {}),
      },
    });
    assert.equal(requested.statusCode, 200, requested.body);
    assert.equal(requested.json().demoCode, undefined);
    const activated = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { "x-client-type": "native" },
      payload: { challengeId: requested.json().challengeId, code: mailedCode },
    });
    assert.equal(activated.statusCode, 200, activated.body);
    const token = activated.json().token;
    const state = await app.inject({
      url: "/api/state",
      headers: { authorization: `Bearer ${token}` },
    });
    return { token, id: state.json().actorId };
  }
  const call = (
    token: string,
    url: string,
    payload: object,
    method: "POST" | "PATCH" = "POST",
  ) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  try {
    const manufacturer = await register("manufacturer", 1);
    const buyer = await register("consumer", 2);
    const retailer = await register("retailer", 3);
    const productInput = {
      name: "Workflow bottled water",
      category: "Food & beverages",
      unit: "50cl",
      regulatory: "WORKFLOW-WATER-001",
    };
    assert.equal(
      (await call(manufacturer.token, "/api/products", productInput))
        .statusCode,
      403,
    );
    const provisioned = await send(
      "/api/admin/monitor-users",
      {
        id: "888888",
        name: "Workflow SON",
        email: "workflow-son@example.com",
        phone: "08055555004",
        password: "Workflow-monitor-password-2026",
        address: "Workflow regulator address",
        organization: "SON",
      },
      "admin",
    );
    assert.equal(provisioned.statusCode, 200, provisioned.body);
    const monitorLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "x-client-type": "native" },
      payload: {
        identifier: "workflow-son@example.com",
        password: "Workflow-monitor-password-2026",
      },
    });
    assert.equal(monitorLogin.statusCode, 200);
    const monitor = monitorLogin.json().token;
    const approved = await call(
      monitor,
      `/api/monitor/manufacturers/${manufacturer.id}/review`,
      { status: "approved" },
    );
    assert.equal(approved.statusCode, 200, approved.body);
    const issued = await call(monitor, "/api/monitor/issue-batch", {
      manufacturerId: manufacturer.id,
    });
    assert.equal(issued.statusCode, 200, issued.body);
    const product = await call(
      manufacturer.token,
      "/api/products",
      productInput,
    );
    assert.equal(product.statusCode, 200, product.body);
    const batch = await call(manufacturer.token, "/api/batches", {
      productId: product.json().id,
      number: issued.json().number,
      quantity: 1,
      manufactured: "2026-10-01",
      expires: "2028-10-01",
      type: "serial",
      codes: ["VS-WORKFLOW-WATER-0001"],
    });
    assert.equal(batch.statusCode, 200, batch.body);
    for (const actor of [buyer, retailer]) {
      const scan = await call(actor.token, "/api/verify", {
        code: " vs-workflow-water-0001 ",
        idempotencyKey: randomUUID(),
      });
      assert.equal(scan.statusCode, 200, scan.body);
      assert.equal(scan.json().verdict, "GENUINE");
      assert.equal(scan.json().details.product.name, productInput.name);
      assert.equal(scan.json().details.manufacturer.id, manufacturer.id);
      assert.equal(scan.json().chargedKobo, 0);
    }
    assert.equal(
      (
        await call(
          manufacturer.token,
          "/api/codes/VS-WORKFLOW-WATER-0001",
          { blocked: true },
          "PATCH",
        )
      ).statusCode,
      200,
    );
    const blocked = await call(buyer.token, "/api/verify", {
      code: "VS-WORKFLOW-WATER-0001",
      idempotencyKey: randomUUID(),
    });
    assert.equal(blocked.json().verdict, "FAKE");
    const unknown = await call(buyer.token, "/api/verify", {
      code: "UNREGISTERED-WATER",
      idempotencyKey: randomUUID(),
    });
    assert.equal(unknown.json().verdict, "UNKNOWN");
  } finally {
    fetchMock.mock.restore();
    Object.assign(config, original);
  }
});
test("bulk batches create 5000 unique codes, paginate privately and roll back duplicate codes", async () => {
  const created = await send(
    "/api/batches",
    {
      productId: "sample-p1",
      number: "BULK-TEST-5000",
      quantity: 5000,
      manufactured: "2026-10-01",
      expires: "2029-10-01",
      type: "serial",
    },
    "manufacturer",
  );
  assert.equal(created.statusCode, 200, created.body);
  const batchId = created.json().id;
  assert.equal(await db.productCode.count({ where: { batchId } }), 5000);
  const page = await app.inject({
    url: `/api/manufacturer/codes?batchId=${batchId}`,
    headers: auth("manufacturer"),
  });
  assert.equal(page.statusCode, 200);
  assert.equal(page.json().items.length, 100);
  assert.ok(page.json().nextCursor);
  const other = await app.inject({
    url: `/api/manufacturer/codes?batchId=${batchId}`,
    headers: auth("foods"),
  });
  assert.equal(other.statusCode, 200);
  assert.equal(other.json().items.length, 0);
  const batchCount = await db.batch.count();
  const codeCount = await db.productCode.count();
  const collision = await send(
    "/api/batches",
    {
      productId: "sample-p1",
      number: "DUPLICATE-TEST",
      quantity: 2,
      manufactured: "2026-10-01",
      expires: "2029-10-01",
      type: "serial",
      codes: ["NEW-TEST-CODE", "VS-EMZR-2026-0001"],
    },
    "manufacturer",
  );
  assert.equal(collision.statusCode, 409);
  assert.equal(await db.batch.count(), batchCount);
  assert.equal(await db.productCode.count(), codeCount);
});
