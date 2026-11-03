import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Linking, AppState } from "react-native";
import { amountToKobo, money, uid, type Payment } from "./domain";
import { api } from "./api";
import { useStore } from "./store";
import { Badge, Button, C, Empty, Field, Icon, S } from "./theme";
export function Wallet() {
  const {
    state,
    user,
    request,
    busy,
    demoPayments,
    paymentProvider,
    paymentTestMode,
    refresh,
  } = useStore();
  const [mode, setMode] = useState<"overview" | "topup" | "transfer">(
    "overview",
  );
  const [amount, setAmount] = useState("500");
  const [recipient, setRecipient] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [method, setMethod] = useState("Moniepoint transfer");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [requestKey, setRequestKey] = useState(uid);
  const wallet = state.wallets[user!.id];
  const transactions = state.transactions;
  const payments = state.payments;
  const pending = useRef(payments);
  pending.current = payments;
  const checking = useRef(false);
  useEffect(() => {
    let active = true;
    async function checkPending() {
      if (checking.current) return;
      checking.current = true;
      try {
        for (const payment of pending.current
          .filter((p) => p.provider === "paystack" && p.status === "pending")
          .slice(0, 5)) {
          if (!active) break;
          const result = await api<{ status: string }>(
            `/api/payments/${payment.id}/verify`,
            "POST",
          );
          if (active && result.status === "settled")
            setFeedback("Payment confirmed. Your wallet has been credited.");
        }
        if (active) await refresh();
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        checking.current = false;
      }
    }
    void checkPending();
    const listener = AppState.addEventListener("change", (value) => {
      if (value === "active") void checkPending();
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, [user?.id]);
  function changeMode(m: typeof mode) {
    setMode(m);
    setError("");
    setFeedback("");
    setRequestKey(uid());
  }
  async function submit() {
    setError("");
    try {
      const amountKobo = amountToKobo(amount, mode === "topup" ? 100 : 1);
      if (mode === "transfer") {
        await request("/api/wallet/transfer", "POST", {
          recipientId: recipient,
          amountKobo,
          idempotencyKey: requestKey,
        });
        setFeedback(
          `${money(amountKobo)} transferred to ${recipientName || recipient}.`,
        );
      } else {
        const payment = await request<Payment>("/api/payments", "POST", {
          amountKobo,
          method: paymentProvider === "paystack" ? "Paystack checkout" : method,
          idempotencyKey: requestKey,
        });
        setFeedback(
          demoPayments
            ? "Development payment created. Simulate settlement below."
            : "Payment created. Open the secure checkout to continue.",
        );
        if (payment.checkoutUrl) {
          try {
            await Linking.openURL(payment.checkoutUrl);
          } catch {
            setError(
              "Payment saved. Use Open secure checkout below to continue.",
            );
          }
        }
      }
      setMode("overview");
      setRequestKey(uid());
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function paymentAction(path: string, success: string) {
    try {
      const result = await request<{ status?: string }>(path);
      setFeedback(
        path.endsWith("/verify") && result.status !== "settled"
          ? `Payment is ${result.status || "pending"}. Complete checkout, then check again.`
          : success,
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <View style={{ gap: 22 }}>
      <View>
        <Text style={S.eyebrow}>READY FOR YOUR NEXT CHECK</Text>
        <Text style={[S.h1, { marginTop: 8 }]}>Your wallet.</Text>
      </View>
      {paymentTestMode && (
        <View style={[S.card, { backgroundColor: C.mint }]}>
          <Text style={S.text}>
            Paystack test mode. Checkout works with Paystack test payment
            details; no real money is charged.
          </Text>
        </View>
      )}
      <View
        style={[
          S.card,
          { backgroundColor: C.ink, borderColor: C.ink, padding: 24, gap: 20 },
        ]}
      >
        <View style={S.between}>
          <Text style={[S.small, { color: "#CFBBB0", letterSpacing: 1.5 }]}>
            AVAILABLE BALANCE
          </Text>
          <Icon name="wallet-outline" color="#CFBBB0" />
        </View>
        <Text style={[S.h1, { color: "white", fontSize: 43 }]}>
          {money(wallet.balanceKobo)}
        </Text>
        <View style={[S.divider, { backgroundColor: "#563B2F" }]} />
        <View style={S.between}>
          <Text style={[S.small, { color: "#CFBBB0" }]}>VERYSURE ID</Text>
          <Text selectable style={[S.h3, { color: "white", letterSpacing: 3 }]}>
            {user!.id}
          </Text>
        </View>
      </View>
      <View style={S.row}>
        <View style={{ flex: 1 }}>
          <Button
            title="Add money"
            icon="add"
            onPress={() => changeMode("topup")}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Transfer"
            icon="arrow-up-right-box-outline"
            secondary
            onPress={() => changeMode("transfer")}
          />
        </View>
      </View>
      {!!feedback && (
        <View style={[S.card, { backgroundColor: C.mint }]}>
          <Text style={[S.text, { color: C.green }]}>{feedback}</Text>
        </View>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={[S.text, { color: C.red }]}>
          {error}
        </Text>
      )}
      {mode !== "overview" && (
        <View style={S.card}>
          <View style={S.between}>
            <Text style={S.h2}>
              {mode === "topup" ? "Add funds" : "Send to a Verysure ID"}
            </Text>
            <Pressable
              accessibilityLabel="Close wallet form"
              onPress={() => changeMode("overview")}
            >
              <Icon name="close" />
            </Pressable>
          </View>
          {mode === "transfer" && (
            <>
              <Field
                label="Recipient’s 6-digit Verysure ID"
                keyboardType="number-pad"
                maxLength={6}
                value={recipient}
                onChangeText={(v) => {
                  setRecipient(v);
                  setRecipientName("");
                  setRequestKey(uid());
                }}
              />
              <Button
                secondary
                title="Check recipient"
                onPress={async () => {
                  try {
                    const result = await api<{ name: string }>(
                      `/api/wallet/recipient/${recipient}`,
                    );
                    setRecipientName(result.name);
                    setError("");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              />
              {!!recipientName && <Text style={S.h3}>{recipientName}</Text>}
            </>
          )}
          <Field
            label="Amount (₦)"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={(v) => {
              setAmount(v);
              setRequestKey(uid());
            }}
          />
          {mode === "topup" && (
            <>
              {paymentProvider !== "paystack" && (
                <View style={{ gap: 8 }}>
                  {["Moniepoint transfer", "International card"].map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => {
                        setMethod(m);
                        setRequestKey(uid());
                      }}
                      style={[S.row, S.pill, { padding: 14 }]}
                    >
                      <Icon
                        name={
                          method === m ? "radio-button-on" : "radio-button-off"
                        }
                        color={C.red}
                        size={18}
                      />
                      <Text style={S.text}>{m}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <Text style={S.small}>
                Minimum ₦100.{" "}
                {demoPayments
                  ? "Development provider enabled. No real money moves."
                  : paymentProvider === "paystack"
                    ? "Pay securely through Paystack using the channels available at checkout."
                    : "Payments use the provider’s secure checkout."}
              </Text>
            </>
          )}
          <Button
            title={mode === "topup" ? "Create payment" : "Confirm transfer"}
            onPress={submit}
            busy={busy}
          />
        </View>
      )}
      {!!payments.length && (
        <View style={{ gap: 12 }}>
          <Text style={S.h2}>Payments</Text>
          {payments.map((p) => (
            <View key={p.id} style={S.card}>
              <View style={S.between}>
                <Text style={S.h3}>{money(p.amountKobo)}</Text>
                <Badge text={p.status} />
              </View>
              <Text selectable style={S.small}>
                {p.id}
              </Text>
              <Text style={S.small}>{p.method}</Text>
              {p.status === "pending" && (
                <>
                  {p.provider === "demo" && demoPayments ? (
                    <Button
                      title="Simulate successful payment"
                      secondary
                      busy={busy}
                      onPress={() =>
                        paymentAction(
                          `/api/payments/${p.id}/confirm-demo`,
                          "Development payment settled. Wallet credited.",
                        )
                      }
                    />
                  ) : (
                    p.checkoutUrl && (
                      <Button
                        title="Open secure checkout"
                        onPress={() => Linking.openURL(p.checkoutUrl!)}
                      />
                    )
                  )}
                  {p.provider === "paystack" && (
                    <Button
                      title="Check payment"
                      secondary
                      busy={busy}
                      onPress={() =>
                        paymentAction(
                          `/api/payments/${p.id}/verify`,
                          "Payment confirmed. Wallet credited.",
                        )
                      }
                    />
                  )}
                  {p.provider !== "paystack" && (
                    <Button
                      secondary
                      title="Cancel payment"
                      busy={busy}
                      onPress={() =>
                        paymentAction(
                          `/api/payments/${p.id}/cancel`,
                          "Payment cancelled.",
                        )
                      }
                    />
                  )}
                </>
              )}
            </View>
          ))}
        </View>
      )}
      <View style={S.between}>
        <Text style={S.h2}>Activity</Text>
        <Text style={S.small}>Latest {transactions.length} transactions</Text>
      </View>
      {!transactions.length ? (
        <Empty
          icon="receipt-outline"
          title="A fresh start"
          body="Top-ups, transfers, and paid verifications will appear here."
        />
      ) : (
        <View style={S.card}>
          {transactions.map((t, i) => (
            <View key={t.id} style={{ gap: 14 }}>
              {i > 0 && <View style={S.divider} />}
              <View style={S.row}>
                <View style={S.iconBox}>
                  <Icon
                    name={t.amountKobo > 0 ? "arrow-down" : "arrow-up"}
                    color={t.amountKobo > 0 ? C.green : C.ink}
                    size={19}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={S.h3}>{t.note}</Text>
                  <Text style={S.small}>
                    {new Date(t.date).toLocaleString()}
                  </Text>
                </View>
                <Text
                  style={[S.h3, { color: t.amountKobo > 0 ? C.green : C.ink }]}
                >
                  {t.amountKobo > 0 ? "+" : "−"}
                  {money(Math.abs(t.amountKobo))}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
