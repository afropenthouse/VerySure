import React, { useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useStore } from "./store";
import { api } from "./api";
import { Role, roles } from "./domain";
import { Brand, Button, C, Field, Icon, S } from "./theme";
export function Auth() {
  const { login, register, busy, storageError } = useStore();
  const [step, setStep] = useState<
    "welcome" | "role" | "register" | "otp" | "login"
  >("welcome");
  const [role, setRole] = useState<Role>("consumer");
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [otp, setOtp] = useState("");
  const [challenge, setChallenge] = useState<{
    challengeId: string;
    demoCode?: string;
  }>();
  const field = (key: string, label: string, props = {}) => (
    <Field
      key={key}
      label={label}
      value={form[key] || ""}
      onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
      {...props}
    />
  );
  const next = (s: typeof step) => {
    setError("");
    setStep(s);
  };
  async function sendCode() {
    setWorking(true);
    setError("");
    try {
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        address: form.address,
        role,
        ...(["retailer", "manufacturer"].includes(role)
          ? { company: form.company }
          : {}),
        ...(role === "manufacturer"
          ? { rc: form.rc, category: form.category }
          : {}),
      };
      setChallenge(await api("/api/auth/request-code", "POST", payload));
      setOtp("");
      next("otp");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function submit() {
    setError("");
    try {
      if (step === "otp") {
        await register(challenge!.challengeId, otp);
        setForm({});
      } else await login(form.identifier || "", form.password || "");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <ScrollView
      contentContainerStyle={S.body}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[S.between, { marginTop: 12 }]}>
        <Brand />
      </View>
      {!!storageError && (
        <Text style={[S.text, { color: C.red }]}>{storageError}</Text>
      )}
      {step === "welcome" ? (
        <>
          <View style={{ marginTop: 26, gap: 18 }}>
            <Text style={S.eyebrow}>A LITTLE CHECK. A LOT OF CERTAINTY.</Text>
            <Text
              style={[
                S.h1,
                { fontSize: 47, lineHeight: 51, letterSpacing: -2.4 },
              ]}
            >
              Know it’s genuine{"\n"}before money{"\n"}changes hands
              <Text style={{ color: C.red }}>.</Text>
            </Text>
            <Text style={S.text}>
              One scan connects consumers, retailers, manufacturers and
              regulators. Buy with confidence, wherever you shop.
            </Text>
          </View>
          <Button
            title="Start verifying"
            icon="arrow-forward"
            onPress={() => next("role")}
          />
          <Button
            secondary
            title="Log in to your account"
            onPress={() => next("login")}
          />
          <View
            style={[
              S.card,
              { padding: 0, overflow: "hidden", marginVertical: 10 },
            ]}
          >
            <View
              style={{
                padding: 18,
                backgroundColor: C.green,
                flexDirection: "row",
                gap: 10,
              }}
            >
              <Icon name="shield-checkmark-outline" color="white" size={30} />
              <View style={{ flex: 1 }}>
                <Text style={[S.h3, { color: "white" }]}>
                  Verify before you buy
                </Text>
                <Text style={[S.small, { color: "#D5E9DB" }]}>
                  A SMALL CHECK. MORE CERTAINTY.
                </Text>
              </View>
            </View>
            <View style={{ padding: 20, gap: 14 }}>
              <Text style={S.h2}>Your first 10 scans are free.</Text>
              <Text style={S.text}>
                Then ₦10 per verification, charged from your Verysure wallet.
              </Text>
            </View>
          </View>
        </>
      ) : (
        <>
          <Pressable
            onPress={() => next(step === "otp" ? "register" : "welcome")}
            style={S.row}
          >
            <Icon name="arrow-back" size={18} />
            <Text style={S.small}>Back</Text>
          </Pressable>
          <View style={{ gap: 10 }}>
            <Text style={S.eyebrow}>
              {step === "login"
                ? "WELCOME BACK"
                : "YOUR FIRST STEP TO CERTAINTY"}
            </Text>
            <Text style={S.h1}>
              {step === "role"
                ? "Made for everyone."
                : step === "otp"
                  ? "Check your code."
                  : step === "login"
                    ? "Good to see you."
                    : "Create your account."}
            </Text>
            <Text style={S.text}>
              {step === "role"
                ? "Choose how you’ll use Verysure."
                : step === "otp"
                  ? "Enter your six-digit verification code. It expires after five minutes."
                  : step === "login"
                    ? "Sign in with your email or phone and password."
                    : "A few details. A safer way to shop."}
            </Text>
          </View>
          {step === "role" && (
            <>
              <View style={{ gap: 10 }}>
                {roles
                  .filter((r) =>
                    ["consumer", "retailer", "manufacturer"].includes(r.value),
                  )
                  .map((r) => (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: role === r.value }}
                      key={r.value}
                      onPress={() => setRole(r.value)}
                      style={[
                        S.card,
                        S.row,
                        {
                          borderColor: role === r.value ? C.red : C.line,
                          padding: 16,
                        },
                      ]}
                    >
                      <View style={S.iconBox}>
                        <Icon name={r.icon} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={S.h3}>{r.title}</Text>
                        <Text style={S.small}>{r.description}</Text>
                      </View>
                      <Icon
                        name={
                          role === r.value
                            ? "radio-button-on"
                            : "radio-button-off"
                        }
                        size={19}
                        color={C.red}
                      />
                    </Pressable>
                  ))}
              </View>
              <Text style={S.small}>
                Regulator and administrator accounts are provisioned by
                authorized administrators.
              </Text>
              <Button
                title="Continue"
                onPress={() => next("register")}
                icon="arrow-forward"
              />
            </>
          )}
          {step === "register" && (
            <>
              {field("name", "Full name")}
              {field("email", "Email address", {
                keyboardType: "email-address",
                autoCapitalize: "none",
              })}
              {field("phone", "Phone number", { keyboardType: "phone-pad" })}
              {field("password", "Password", { secureTextEntry: true })}
              {field(
                "address",
                role === "consumer"
                  ? "Residential address"
                  : "Business address",
              )}
              {["retailer", "manufacturer"].includes(role) &&
                field("company", "Company name")}
              {role === "manufacturer" && (
                <>
                  {field("rc", "CAC / RC number")}
                  {field("category", "Product category")}
                </>
              )}
              <Button
                title="Send verification code"
                onPress={sendCode}
                busy={working}
              />
            </>
          )}
          {step === "otp" && (
            <>
              {challenge?.demoCode && (
                <View style={S.card}>
                  <Text style={S.small}>
                    TEST VERIFICATION CODE · FIVE MINUTES
                  </Text>
                  <Text style={[S.h1, { letterSpacing: 8 }]}>
                    {challenge.demoCode}
                  </Text>
                  <Text style={S.text}>
                    For this test, enter the code shown above.
                  </Text>
                </View>
              )}
              <Field
                label="6-digit verification code"
                keyboardType="number-pad"
                maxLength={6}
                value={otp}
                onChangeText={setOtp}
              />
              <Button
                title="Verify and create account"
                onPress={submit}
                busy={busy}
              />
              <Button
                title="Request a new code"
                secondary
                onPress={sendCode}
                busy={working}
              />
            </>
          )}
          {step === "login" && (
            <>
              {field("identifier", "Email or phone", {
                autoCapitalize: "none",
                autoComplete: "username",
              })}
              {field("password", "Password", {
                secureTextEntry: true,
                autoComplete: "current-password",
              })}
              <Button title="Log in" onPress={submit} busy={busy} />
              <Pressable onPress={() => next("role")}>
                <Text style={[S.text, { textAlign: "center" }]}>
                  New to Verysure? Create an account
                </Text>
              </Pressable>
            </>
          )}
          {!!error && (
            <Text accessibilityRole="alert" style={[S.text, { color: C.red }]}>
              {error}
            </Text>
          )}
        </>
      )}
      <Text style={[S.small, { textAlign: "center", marginTop: 8 }]}>
        PROTECTING EVERYDAY PURCHASES. TOGETHER.
      </Text>
    </ScrollView>
  );
}
