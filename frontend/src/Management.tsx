import React, { useState } from "react";
import { Image, Linking, Pressable, Text, View } from "react-native";
import { useStore } from "./store";
import { amountToKobo, money, uid, type Code } from "./domain";
import { api } from "./api";
import { Badge, Button, C, Empty, Field, Icon, S } from "./theme";
function Tabs({
  items,
  current,
  onChange,
}: {
  items: string[];
  current: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {items.map((t) => (
        <Pressable
          key={t}
          accessibilityRole="tab"
          accessibilityLabel={t}
          accessibilityState={{ selected: current === t }}
          onPress={() => onChange(t)}
          style={[S.pill, { backgroundColor: current === t ? C.ink : C.sand }]}
        >
          <Text style={[S.small, { color: current === t ? "white" : C.ink }]}>
            {t}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
function useActions() {
  const { request, busy } = useStore();
  const [feedback, setFeedback] = useState("");
  async function run(
    path: string,
    method = "POST",
    data?: unknown,
    message = "Saved.",
  ) {
    try {
      await request(path, method, data);
      setFeedback(message);
      return true;
    } catch (e) {
      setFeedback((e as Error).message);
      return false;
    }
  }
  return { run, busy, feedback, setFeedback };
}
export function ManufacturerTools() {
  const { state, user } = useStore();
  const { run, busy, feedback, setFeedback } = useActions();
  const profile = state.manufacturers.find((m) => m.id === user!.id);
  const [tab, setTab] = useState("Products");
  const [form, setForm] = useState<Record<string, string>>({
    quantity: "10",
    type: "serial",
  });
  const [opened, setOpened] = useState(false);
  const products = state.products.filter((p) => p.manufacturerId === user!.id);
  const batches = state.batches.filter((b) =>
    products.some((p) => p.id === b.productId),
  );
  const [loadedCodes, setLoadedCodes] = useState<Code[] | null>(null);
  const [codeCursor, setCodeCursor] = useState<string | null>(null);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const codes = loadedCodes ?? state.codes;
  async function loadCodes(cursor?: string) {
    setLoadingCodes(true);
    try {
      const result = await api<{ items: Code[]; nextCursor: string | null }>(
        `/api/manufacturer/codes${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      setLoadedCodes((prev) =>
        cursor ? [...(prev || []), ...result.items] : result.items,
      );
      setCodeCursor(result.nextCursor);
    } catch (e) {
      setFeedback((e as Error).message);
    } finally {
      setLoadingCodes(false);
    }
  }
  React.useEffect(() => {
    if (tab === "Codes") void loadCodes();
  }, [tab]);
  const field = (key: string, label: string, props = {}) => (
    <Field
      key={key}
      label={label}
      value={form[key] || ""}
      onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
      {...props}
    />
  );
  async function save() {
    const payload =
      tab === "Products"
        ? {
            name: form.name,
            category: form.category,
            unit: form.unit,
            regulatory: form.regulatory,
            description: form.description || "",
          }
        : {
            productId: form.product,
            number: form.batch,
            quantity: Number(form.quantity),
            manufactured: form.manufactured,
            expires: form.expires,
            type: form.type,
            ...(form.pasted?.trim()
              ? {
                  codes: form.pasted
                    .toUpperCase()
                    .split(/[\s,;]+/)
                    .filter(Boolean),
                }
              : {}),
          };
    if (
      await run(
        tab === "Products" ? "/api/products" : "/api/batches",
        "POST",
        payload,
        tab === "Products" ? "Product registered." : "Batch and codes created.",
      )
    ) {
      setOpened(false);
      setForm({ quantity: "10", type: "serial" });
    }
  }
  if (!profile)
    return (
      <Empty
        icon="business-outline"
        title="Profile unavailable"
        body="Please refresh your account."
      />
    );
  if (profile.status !== "approved")
    return (
      <View style={{ gap: 20 }}>
        <Text style={S.h1}>Your brand’s{"\n"}next chapter.</Text>
        <View style={S.card}>
          <Badge text={profile.status} />
          <Text style={S.h2}>{profile.name}</Text>
          <Text style={S.text}>
            {profile.status === "pending"
              ? "Your application is awaiting regulatory review. Product and code operations unlock after approval."
              : `Your application was rejected. ${profile.reason || ""}`}
          </Text>
          <Text style={S.small}>CAC / RC · {profile.rc}</Text>
        </View>
      </View>
    );
  return (
    <View style={{ gap: 20 }}>
      <Text style={S.eyebrow}>MANUFACTURER WORKSPACE</Text>
      <Text style={S.h1}>Protect what{"\n"}you make.</Text>
      <View style={S.card}>
        <View style={S.between}>
          <Text style={[S.h3, { flex: 1 }]}>{profile.name}</Text>
          <Badge text={profile.status} />
        </View>
        <Text selectable style={S.small}>
          {profile.approval}
        </Text>
      </View>
      <Tabs
        items={["Products", "Batches", "Codes"]}
        current={tab}
        onChange={(t) => {
          setTab(t);
          setOpened(false);
          setFeedback("");
        }}
      />
      {tab !== "Codes" && (
        <Button
          title={
            tab === "Products" ? "Register a product" : "Create batch & codes"
          }
          icon="add"
          onPress={() => setOpened((o) => !o)}
        />
      )}
      {!!feedback && (
        <Text accessibilityRole="alert" style={S.text}>
          {feedback}
        </Text>
      )}
      {opened && (
        <View style={S.card}>
          {tab === "Products" ? (
            <>
              {field("name", "Product name")}
              {field("category", "Category")}
              {field("unit", "Unit / pack size")}
              {field("regulatory", "Regulatory number")}
              {field("description", "Description", { multiline: true })}
            </>
          ) : (
            <>
              <Text style={S.h3}>Choose product</Text>
              {products.map((p) => (
                <Pressable
                  key={p.id}
                  style={S.row}
                  onPress={() => setForm((f) => ({ ...f, product: p.id }))}
                >
                  <Icon
                    name={
                      form.product === p.id
                        ? "radio-button-on"
                        : "radio-button-off"
                    }
                    size={19}
                    color={C.red}
                  />
                  <Text style={S.text}>{p.name}</Text>
                </Pressable>
              ))}
              {field("batch", "Batch number")}
              {state.issuedBatches.map((b) => (
                <Pressable
                  key={b.id}
                  onPress={() => setForm((f) => ({ ...f, batch: b.number }))}
                >
                  <Text style={[S.small, { color: C.red }]}>
                    Use issued number: {b.number}
                  </Text>
                </Pressable>
              ))}
              {field("quantity", "Quantity (maximum 5,000)", {
                keyboardType: "number-pad",
              })}
              {field("manufactured", "Manufacture date (YYYY-MM-DD)", {
                placeholder: "2026-10-01",
              })}
              {field("expires", "Expiry date (YYYY-MM-DD)", {
                placeholder: "2029-10-01",
              })}
              <Text style={S.small}>CODE FORMAT</Text>
              <Tabs
                items={["serial", "barcode", "seal", "shape"]}
                current={form.type}
                onChange={(v) => setForm((f) => ({ ...f, type: v }))}
              />
              {field("pasted", "Or paste your own codes (one per line)", {
                multiline: true,
                autoCapitalize: "characters",
              })}
              <Text style={S.small}>
                Generated barcode values are development examples. Use your
                licensed GS1 allocation for real products. Shape codes are
                identifiers, not visual shape recognition.
              </Text>
            </>
          )}
          <Button
            title={tab === "Products" ? "Register product" : "Create batch"}
            onPress={save}
            busy={busy}
          />
        </View>
      )}
      {tab === "Products" &&
        products.map((p) => (
          <View key={p.id} style={S.card}>
            <View style={S.row}>
              <View style={S.iconBox}>
                <Icon name="cube-outline" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.h3}>{p.name}</Text>
                <Text style={S.small}>
                  {p.category} · {p.unit}
                </Text>
              </View>
            </View>
            <Text style={S.text}>{p.description}</Text>
            <Text style={S.small}>REGULATORY NUMBER · {p.regulatory}</Text>
          </View>
        ))}
      {tab === "Batches" &&
        batches.map((b) => (
          <View key={b.id} style={S.card}>
            <Badge text={b.status} />
            <Text style={S.h3}>
              {products.find((p) => p.id === b.productId)?.name}
            </Text>
            <Text selectable style={S.small}>
              {b.number}
            </Text>
            <Text style={S.text}>
              {b.quantity} units · {b.manufactured} → {b.expires}
            </Text>
            <Button
              secondary
              busy={busy}
              title={
                b.status === "active" ? "Recall batch" : "Reactivate batch"
              }
              onPress={() =>
                run(`/api/batches/${b.id}`, "PATCH", {
                  status: b.status === "active" ? "recalled" : "active",
                })
              }
            />
          </View>
        ))}
      {tab === "Codes" && (
        <>
          <Text style={S.text}>Showing {codes.length} registered codes.</Text>
          {codes.map((c) => (
            <View key={c.value} style={S.card}>
              <Text selectable style={S.h3}>
                {c.value}
              </Text>
              <View style={S.between}>
                <Text style={S.small}>{c.type.toUpperCase()}</Text>
                <Badge text={c.blocked ? "Blocked" : "Active"} />
              </View>
              <Text style={S.small}>
                {batches.find((b) => b.id === c.batchId)?.number}
              </Text>
              <Button
                secondary
                busy={busy}
                title={c.blocked ? "Unblock code" : "Block code"}
                onPress={async () => {
                  if (
                    await run(
                      `/api/codes/${encodeURIComponent(c.value)}`,
                      "PATCH",
                      {
                        blocked: !c.blocked,
                      },
                    )
                  )
                    setLoadedCodes(
                      (prev) =>
                        prev?.map((code) =>
                          code.value === c.value
                            ? { ...code, blocked: !c.blocked }
                            : code,
                        ) ?? null,
                    );
                }}
              />
            </View>
          ))}
          {codeCursor && (
            <Button
              secondary
              title="Load more codes"
              busy={loadingCodes}
              onPress={() => loadCodes(codeCursor)}
            />
          )}
        </>
      )}
      {((tab === "Products" && !products.length) ||
        (tab === "Batches" && !batches.length) ||
        (tab === "Codes" && !codes.length)) && (
        <Empty
          icon="cube-outline"
          title={`No ${tab.toLowerCase()} yet`}
          body="Register a product, then create a batch to generate codes."
        />
      )}
    </View>
  );
}
export function MonitorTools() {
  const { state, user } = useStore();
  const { run, busy, feedback } = useActions();
  const [tab, setTab] = useState("Applications");
  const [reason, setReason] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("All");
  const [gps, setGps] = useState(false);
  const sightings = state.verifications.filter(
    (v) =>
      v.verdict !== "GENUINE" &&
      (filter === "All" || v.verdict === filter.toUpperCase()) &&
      (!gps || v.location),
  );
  return (
    <View style={{ gap: 20 }}>
      <Text style={S.eyebrow}>
        {user!.organization || "REGULATOR"} · REGULATORY WORKSPACE
      </Text>
      <Text style={S.h1}>Safer markets{"\n"}start here.</Text>
      <Tabs
        items={["Applications", "Manufacturers", "Batch register", "Sightings"]}
        current={tab}
        onChange={setTab}
      />
      {!!feedback && (
        <Text accessibilityRole="alert" style={S.text}>
          {feedback}
        </Text>
      )}
      {(tab === "Applications" || tab === "Manufacturers") &&
        state.manufacturers
          .filter((m) =>
            tab === "Applications" ? m.status === "pending" : true,
          )
          .map((m) => (
            <View key={m.id} style={S.card}>
              <View style={S.between}>
                <Text style={[S.h3, { flex: 1 }]}>{m.name}</Text>
                <Badge text={m.status} />
              </View>
              <Text style={S.text}>
                {m.category} · {m.rc}
              </Text>
              {m.approval && (
                <Text selectable style={S.small}>
                  {m.approval}
                </Text>
              )}
              {m.status === "pending" && (
                <>
                  <Button
                    title="Approve & issue number"
                    busy={busy}
                    onPress={() =>
                      run(
                        `/api/monitor/manufacturers/${m.id}/review`,
                        "POST",
                        { status: "approved" },
                        "Manufacturer approved and notified.",
                      )
                    }
                  />
                  <Field
                    label="Rejection reason"
                    value={reason[m.id] || ""}
                    onChangeText={(v) =>
                      setReason((r) => ({ ...r, [m.id]: v }))
                    }
                  />
                  <Button
                    secondary
                    title="Reject application"
                    busy={busy}
                    onPress={() =>
                      run(
                        `/api/monitor/manufacturers/${m.id}/review`,
                        "POST",
                        { status: "rejected", reason: reason[m.id] },
                        "Application rejected with your reason.",
                      )
                    }
                  />
                </>
              )}
              {m.status === "approved" && (
                <Button
                  secondary
                  title="Issue official batch number"
                  busy={busy}
                  onPress={() =>
                    run(
                      "/api/monitor/issue-batch",
                      "POST",
                      { manufacturerId: m.id },
                      "Batch number issued and manufacturer notified.",
                    )
                  }
                />
              )}
            </View>
          ))}
      {tab === "Applications" &&
        !state.manufacturers.some((m) => m.status === "pending") && (
          <Empty
            icon="checkmark-done-outline"
            title="All caught up"
            body="There are no applications awaiting review."
          />
        )}
      {tab === "Batch register" && (
        <>
          {state.issuedBatches.map((b) => (
            <View key={b.id} style={S.card}>
              <Badge text="Issued" />
              <Text selectable style={S.h3}>
                {b.number}
              </Text>
              <Text style={S.text}>
                {
                  state.manufacturers.find((m) => m.id === b.manufacturerId)
                    ?.name
                }
              </Text>
            </View>
          ))}
          {state.batches.map((b) => (
            <View key={b.id} style={S.card}>
              <Badge text={b.status} />
              <Text style={S.h3}>
                {state.products.find((p) => p.id === b.productId)?.name}
              </Text>
              <Text style={S.small}>{b.number}</Text>
              <Text style={S.text}>
                {b.quantity} units · {b.manufactured} → {b.expires}
              </Text>
            </View>
          ))}
        </>
      )}
      {tab === "Sightings" && (
        <>
          <Tabs
            items={["All", "Fake", "Unknown"]}
            current={filter}
            onChange={setFilter}
          />
          <Pressable onPress={() => setGps((v) => !v)} style={S.row}>
            <Icon name={gps ? "checkbox" : "square-outline"} color={C.red} />
            <Text style={S.text}>Only sightings with GPS</Text>
          </Pressable>
          {!sightings.length && (
            <Empty
              icon="location-outline"
              title="No sightings in this view"
              body="Fake and unknown scans appear here. Location is included only with consent."
            />
          )}
          {sightings.map((v) => {
            const scanner = state.users.find((u) => u.id === v.userId);
            return (
              <View key={v.id} style={S.card}>
                <Badge text={v.verdict} />
                <Text selectable style={S.h3}>
                  {v.code}
                </Text>
                <Text style={S.text}>{v.reason}</Text>
                <View style={S.divider} />
                <Text style={S.small}>
                  SCANNER · {scanner?.name} · {scanner?.id}
                </Text>
                <Text style={S.small}>
                  {scanner?.phone} · {scanner?.address}
                </Text>
                <Text style={S.small}>{new Date(v.date).toLocaleString()}</Text>
                {v.location ? (
                  <Button
                    secondary
                    title="View location on map"
                    onPress={() =>
                      Linking.openURL(
                        `https://www.google.com/maps?q=${v.location!.latitude},${v.location!.longitude}`,
                      )
                    }
                  />
                ) : (
                  <Text style={S.small}>No GPS location shared</Text>
                )}
              </View>
            );
          })}
          <Text style={S.h2}>Consumer reports</Text>
          {state.reports
            .filter((r) => !gps || r.location)
            .map((r) => (
              <View key={r.id} style={S.card}>
                <Badge text={r.status} />
                <Text style={S.h3}>{r.product}</Text>
                <Text style={S.text}>{r.description}</Text>
                {r.photo && (
                  <Image
                    source={{ uri: r.photo }}
                    style={{ height: 180, borderRadius: 12 }}
                    resizeMode="contain"
                  />
                )}
                {r.location && (
                  <Button
                    secondary
                    title="View report location"
                    onPress={() =>
                      Linking.openURL(
                        `https://www.google.com/maps?q=${r.location!.latitude},${r.location!.longitude}`,
                      )
                    }
                  />
                )}
              </View>
            ))}
        </>
      )}
    </View>
  );
}
export function AdminTools() {
  const { state, user, stats } = useStore();
  const { run, busy, feedback, setFeedback } = useActions();
  const [tab, setTab] = useState("Overview");
  const [form, setForm] = useState<Record<string, string>>({
    organization: "NAFDAC",
  });
  const [creditKey, setCreditKey] = useState(uid);
  const field = (key: string, label: string, props = {}) => (
    <Field
      key={key}
      label={label}
      value={form[key] || ""}
      onChangeText={(v) => {
        setForm((f) => ({ ...f, [key]: v }));
        setCreditKey(uid());
      }}
      {...props}
    />
  );
  return (
    <View style={{ gap: 20 }}>
      <Text style={S.eyebrow}>PLATFORM ADMINISTRATION</Text>
      <Text style={S.h1}>The bigger picture.</Text>
      <Tabs
        items={[
          "Overview",
          "Users",
          "Manufacturers",
          "Verifications",
          "Reports",
          "Wallet credits",
          "Adverts",
          "Regulators",
        ]}
        current={tab}
        onChange={(t) => {
          setTab(t);
          setFeedback("");
        }}
      />
      {!!feedback && (
        <Text accessibilityRole="alert" style={S.text}>
          {feedback}
        </Text>
      )}
      {tab === "Overview" && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {[
            ["Users", stats?.users ?? state.users.length],
            ["Manufacturers", stats?.manufacturers ?? 0],
            ["Products", stats?.products ?? 0],
            ["Verifications", stats?.verifications ?? 0],
            ["Reports", stats?.reports ?? 0],
            ["Open reports", stats?.openReports ?? 0],
          ].map(([label, value]) => (
            <View key={label} style={[S.card, { width: "47%" }]}>
              <Text style={S.h1}>{value}</Text>
              <Text style={S.small}>{label}</Text>
            </View>
          ))}
        </View>
      )}
      {tab === "Users" &&
        state.users.map((u) => (
          <View key={u.id} style={S.card}>
            <Text style={S.h3}>{u.name}</Text>
            <Text style={S.small}>
              {u.email} · {u.id} · {u.role}
            </Text>
            <Badge text={u.status} />
            {u.id !== user!.id && (
              <Button
                secondary
                busy={busy}
                title={u.status === "active" ? "Suspend user" : "Activate user"}
                onPress={() =>
                  run(`/api/admin/users/${u.id}`, "PATCH", {
                    status: u.status === "active" ? "suspended" : "active",
                  })
                }
              />
            )}
          </View>
        ))}
      {tab === "Manufacturers" &&
        state.manufacturers.map((m) => (
          <View key={m.id} style={S.card}>
            <Text style={S.h3}>{m.name}</Text>
            <Badge text={m.status} />
            <Tabs
              items={["pending", "approved", "rejected"]}
              current={m.status}
              onChange={(status) =>
                run(`/api/admin/manufacturers/${m.id}`, "PATCH", { status })
              }
            />
          </View>
        ))}
      {tab === "Verifications" &&
        (state.verifications.length ? (
          state.verifications.map((v) => (
            <View key={v.id} style={S.card}>
              <Badge text={v.verdict} />
              <Text selectable style={S.h3}>
                {v.code}
              </Text>
              <Text style={S.small}>
                User {v.userId} · {new Date(v.date).toLocaleString()}
              </Text>
              <Text style={S.text}>{v.reason}</Text>
              <Text style={S.small}>
                Fee: {money(v.chargedKobo)} · GPS:{" "}
                {v.location
                  ? `${v.location.latitude}, ${v.location.longitude}`
                  : "Not shared"}
              </Text>
            </View>
          ))
        ) : (
          <Empty
            icon="scan-outline"
            title="No verifications yet"
            body="Product scans appear here."
          />
        ))}
      {tab === "Reports" &&
        (state.reports.length ? (
          state.reports.map((r) => (
            <View key={r.id} style={S.card}>
              <Text style={S.h3}>{r.product}</Text>
              <Text style={S.small}>
                {r.code} · Reporter {r.userId}
              </Text>
              <Text style={S.text}>{r.description}</Text>
              {r.photo && (
                <Image
                  source={{ uri: r.photo }}
                  style={{ height: 220, borderRadius: 12 }}
                  resizeMode="contain"
                />
              )}
              <Text style={S.small}>
                GPS:{" "}
                {r.location
                  ? `${r.location.latitude}, ${r.location.longitude}`
                  : "Not shared"}
              </Text>
              <Tabs
                items={["open", "investigating", "resolved"]}
                current={r.status}
                onChange={(status) =>
                  run(`/api/admin/reports/${r.id}`, "PATCH", { status })
                }
              />
            </View>
          ))
        ) : (
          <Empty
            icon="flag-outline"
            title="No reports yet"
            body="Consumer reports appear here for review."
          />
        ))}
      {tab === "Wallet credits" && (
        <View style={S.card}>
          {field("recipient", "User’s 6-digit Verysure ID", {
            keyboardType: "number-pad",
            maxLength: 6,
          })}
          {field("amount", "Amount (₦)", { keyboardType: "decimal-pad" })}
          {field("note", "Credit note")}
          <Button
            title="Credit wallet"
            busy={busy}
            onPress={async () => {
              try {
                const amountKobo = amountToKobo(form.amount || "");
                if (
                  await run(
                    "/api/admin/credits",
                    "POST",
                    {
                      userId: form.recipient,
                      amountKobo,
                      note: form.note || "Admin credit",
                      idempotencyKey: creditKey,
                    },
                    "Wallet credited and ledger updated.",
                  )
                ) {
                  setForm({});
                  setCreditKey(uid());
                }
              } catch (e) {
                setFeedback((e as Error).message);
              }
            }}
          />
        </View>
      )}
      {tab === "Adverts" && (
        <>
          <View style={S.card}>
            {field("title", "Advert title")}
            {field("body", "Advert body", { multiline: true })}
            <Button
              title="Create sponsored advert"
              busy={busy}
              onPress={async () => {
                if (
                  await run(
                    "/api/admin/adverts",
                    "POST",
                    { title: form.title, body: form.body },
                    "Advert created.",
                  )
                )
                  setForm({});
              }}
            />
          </View>
          {state.adverts.map((a) => (
            <View key={a.id} style={S.card}>
              <Badge text={a.active ? "Active" : "Inactive"} />
              <Text style={S.h3}>{a.title}</Text>
              <Text style={S.text}>{a.body}</Text>
              <Button
                secondary
                busy={busy}
                title={a.active ? "Deactivate advert" : "Activate advert"}
                onPress={() =>
                  run(`/api/admin/adverts/${a.id}`, "PATCH", {
                    active: !a.active,
                  })
                }
              />
            </View>
          ))}
        </>
      )}
      {tab === "Regulators" && (
        <View style={S.card}>
          <Text style={S.h3}>Provision a regulator account</Text>
          {field("id", "Unique 6-digit Verysure ID", {
            keyboardType: "number-pad",
            maxLength: 6,
          })}
          {field("name", "Full name")}
          {field("email", "Email address", { autoCapitalize: "none" })}
          {field("phone", "Phone number")}
          {field("address", "Organization address")}
          {field("password", "Initial password (12+ characters)", {
            secureTextEntry: true,
          })}
          <Tabs
            items={["NAFDAC", "SON"]}
            current={form.organization || "NAFDAC"}
            onChange={(organization) =>
              setForm((f) => ({ ...f, organization }))
            }
          />
          <Button
            title="Create regulator account"
            busy={busy}
            onPress={async () => {
              if (
                await run(
                  "/api/admin/monitor-users",
                  "POST",
                  {
                    id: form.id,
                    name: form.name,
                    email: form.email,
                    phone: form.phone,
                    address: form.address,
                    password: form.password,
                    organization: form.organization || "NAFDAC",
                  },
                  "Regulator account created. Share its credentials securely.",
                )
              )
                setForm({ organization: "NAFDAC" });
            }}
          />
        </View>
      )}
    </View>
  );
}
