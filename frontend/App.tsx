import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { StoreProvider, useStore } from "./src/store";
import { Auth } from "./src/Auth";
import { Scanner, Result } from "./src/Scanner";
import { Wallet } from "./src/Wallet";
import { Alerts, History, Messages, Profile, Reports } from "./src/Activity";
import { AdminTools, ManufacturerTools, MonitorTools } from "./src/Management";
import { money, roles, Verification } from "./src/domain";
import { Badge, Brand, Button, C, Icon, S } from "./src/theme";

type Screen =
  | "Home"
  | "Verify"
  | "History"
  | "Wallet"
  | "More"
  | "Report"
  | "Messages"
  | "Alerts"
  | "Profile"
  | "Workspace"
  | "Result";
function Home({
  go,
  open,
}: {
  go: (s: Screen) => void;
  open: (v: Verification) => void;
}) {
  const { state, user } = useStore();
  const wallet = state.wallets[user!.id];
  const history = state.verifications.filter((v) => v.userId === user!.id);
  const isBuyer = user!.role === "consumer" || user!.role === "retailer";
  return (
    <View style={{ gap: 25 }}>
      <View style={{ gap: 8 }}>
        <Text style={S.eyebrow}>A SAFER EVERYDAY STARTS WITH YOU</Text>
        <Text style={S.h1}>
          Hello, {user!.name.split(" ")[0]}
          <Text style={{ color: C.red }}>.</Text>
        </Text>
        <Text style={S.text}>
          {isBuyer
            ? "A little certainty goes a long way."
            : "Welcome to your Verysure workspace."}
        </Text>
      </View>
      <Pressable
        onPress={() => go(isBuyer ? "Verify" : "Workspace")}
        style={({ pressed }) => ({
          borderRadius: 24,
          padding: 25,
          backgroundColor: C.ink,
          minHeight: 255,
          overflow: "hidden",
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <View
          style={{
            position: "absolute",
            right: -40,
            top: -18,
            width: 220,
            height: 220,
            borderRadius: 110,
            borderWidth: 1,
            borderColor: "#63402D",
            transform: [{ rotate: "30deg" }],
          }}
        />
        <View
          style={{
            position: "absolute",
            right: -10,
            top: 8,
            width: 165,
            height: 165,
            borderRadius: 83,
            borderWidth: 1,
            borderColor: "#63402D",
          }}
        />
        <View
          style={{
            position: "absolute",
            right: 22,
            top: 40,
            width: 100,
            height: 100,
            borderRadius: 50,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#3D2114",
          }}
        >
          <Icon
            name={isBuyer ? "scan-outline" : "shield-checkmark-outline"}
            size={47}
            color="#DFBBA1"
          />
        </View>
        <Text
          style={[
            S.small,
            { color: "#D3A98D", letterSpacing: 2, marginBottom: 20 },
          ]}
        >
          {isBuyer ? "BEFORE YOU BUY" : "YOUR ROLE. YOUR IMPACT."}
        </Text>
        <Text
          style={[
            S.h1,
            { color: C.cream, fontSize: 31, lineHeight: 35, maxWidth: 210 },
          ]}
        >
          {isBuyer
            ? "Good products.\nNo guesswork."
            : "Build trust.\nEvery day."}
        </Text>
        <Text
          style={[
            S.text,
            { color: "#C9B7A9", marginTop: 12, maxWidth: 210, fontSize: 12 },
          ]}
        >
          {isBuyer
            ? "Scan a product code. Know what’s in your hands."
            : roles.find((r) => r.value === user!.role)?.description}
        </Text>
        <View style={[S.between, { marginTop: 23 }]}>
          <Text style={[S.h3, { color: "white", fontSize: 14 }]}>
            {isBuyer ? "Verify a product" : "Open workspace"}
          </Text>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: C.red,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="arrow-forward" color="white" size={18} />
          </View>
        </View>
      </Pressable>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Pressable
          style={[S.card, { flex: 1, padding: 17 }]}
          onPress={() => go("Wallet")}
        >
          <View style={S.between}>
            <Icon name="wallet-outline" size={21} color={C.muted} />
            <Icon name="arrow-up-right-box-outline" size={13} color={C.muted} />
          </View>
          <Text style={[S.h2, { marginTop: 6 }]}>
            {money(wallet.balanceKobo)}
          </Text>
          <Text style={S.small}>Wallet balance</Text>
        </Pressable>
        <View
          style={[
            S.card,
            {
              flex: 1,
              padding: 17,
              backgroundColor: "#EFF3E9",
              borderColor: "#DFE7D6",
            },
          ]}
        >
          <Icon name="sparkles-outline" size={21} color={C.green} />
          <Text style={[S.h2, { color: C.green, marginTop: 6 }]}>
            {Math.max(0, 10 - wallet.freeUsed)}{" "}
            <Text style={{ fontSize: 13 }}>free scans</Text>
          </Text>
          <Text style={S.small}>A little welcome gift</Text>
        </View>
      </View>
      <View style={{ gap: 16 }}>
        <Text style={S.h2}>Here to help you</Text>
        <View style={S.row}>
          {[
            { label: "Report a fake", icon: "flag-outline", screen: "Report" },
            {
              label: "Messages",
              icon: "chatbubbles-outline",
              screen: "Messages",
            },
            {
              label: "Your profile",
              icon: "person-outline",
              screen: "Profile",
            },
          ].map((item) => (
            <Pressable
              key={item.label}
              onPress={() => go(item.screen as Screen)}
              style={{ flex: 1, alignItems: "center", gap: 10 }}
            >
              <View
                style={[
                  S.iconBox,
                  {
                    width: 55,
                    height: 55,
                    borderRadius: 18,
                    backgroundColor: C.paper,
                    borderWidth: 1,
                    borderColor: C.line,
                  },
                ]}
              >
                <Icon name={item.icon} size={23} />
              </View>
              <Text style={[S.small, { color: C.ink }]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ gap: 14 }}>
        <View style={S.between}>
          <Text style={S.h2}>Recent checks</Text>
          <Pressable onPress={() => go("History")}>
            <Text style={[S.small, { color: C.red }]}>View all →</Text>
          </Pressable>
        </View>
        {history.length ? (
          history.slice(0, 3).map((v) => (
            <Pressable
              key={v.id}
              onPress={() => open(v)}
              style={[S.card, S.row, { padding: 15 }]}
            >
              <View
                style={[
                  S.iconBox,
                  {
                    backgroundColor: v.verdict === "GENUINE" ? C.mint : C.rose,
                  },
                ]}
              >
                <Icon
                  name={
                    v.verdict === "GENUINE"
                      ? "shield-checkmark-outline"
                      : "alert-circle-outline"
                  }
                  color={v.verdict === "GENUINE" ? C.green : C.red}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[S.h3, { fontSize: 14 }]}>
                  {state.products.find((p) => p.id === v.productId)?.name ||
                    "Unregistered product"}
                </Text>
                <Text style={S.small}>
                  {new Date(v.date).toLocaleDateString()}
                </Text>
              </View>
              <Badge text={v.verdict} />
            </Pressable>
          ))
        ) : (
          <View
            style={[
              S.card,
              {
                borderStyle: "dashed",
                backgroundColor: "transparent",
                alignItems: "center",
                padding: 23,
              },
            ]}
          >
            <Icon name="checkmark-done-outline" color={C.muted} size={28} />
            <Text style={S.h3}>Your first check starts a habit.</Text>
            <Text style={[S.text, { textAlign: "center", fontSize: 12 }]}>
              Verify a product and find the result right here.
            </Text>
          </View>
        )}
      </View>
      {state.adverts
        .filter((a) => a.active)
        .map((a) => (
          <View
            key={a.id}
            style={[
              S.card,
              { backgroundColor: "#EDE5D7", borderColor: "#EDE5D7" },
            ]}
          >
            <View style={S.between}>
              <Text style={[S.eyebrow, { color: "#806749", fontSize: 8 }]}>
                THE VERYSURE COMMUNITY
              </Text>
              <Text style={[S.small, { fontSize: 8 }]}>SPONSORED</Text>
            </View>
            <Text style={S.h2}>{a.title}</Text>
            <Text style={[S.text, { color: "#796751", fontSize: 12 }]}>
              {a.body}
            </Text>
          </View>
        ))}
      <View style={[S.row, { justifyContent: "center", gap: 7 }]}>
        <Icon name="shield-checkmark-outline" color={C.muted} size={13} />
        <Text style={[S.small, { fontSize: 9, letterSpacing: 1 }]}>
          MORE CERTAINTY. EVERY PURCHASE.
        </Text>
      </View>
    </View>
  );
}

function Shell() {
  const { ready, user, storageError, state, logout, demoPayments, refresh } =
    useStore();
  const [screen, setScreen] = useState<Screen>("Home");
  const [result, setResult] = useState<Verification>();
  const [reportPrefill, setReportPrefill] = useState<Verification>();
  const scroll = React.useRef<ScrollView>(null);
  React.useEffect(() => {
    setScreen("Home");
    setResult(undefined);
    setReportPrefill(undefined);
  }, [user?.id]);
  const go = (s: Screen) => {
    setScreen(s);
    void refresh().catch(() => {});
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const open = (v: Verification) => {
    setResult(v);
    go("Result");
  };
  if (!ready)
    return (
      <View
        style={[
          S.page,
          { alignItems: "center", justifyContent: "center", gap: 16 },
        ]}
      >
        <Brand />
        <ActivityIndicator color={C.red} />
      </View>
    );
  if (!user) return <Auth />;
  const isBuyer = ["consumer", "retailer"].includes(user.role);
  const nav = [
    { label: "Home", icon: "grid-outline" },
    {
      label: isBuyer ? "History" : "Workspace",
      icon: isBuyer ? "time-outline" : "briefcase-outline",
    },
    { label: "Verify", icon: "scan-outline" },
    { label: "Wallet", icon: "wallet-outline" },
    { label: "More", icon: "ellipsis-horizontal" },
  ];
  const unread = state.notifications.filter(
    (n) => n.userId === user.id && !n.read,
  ).length;
  const subpage = ![
    "Home",
    "History",
    "Workspace",
    "Verify",
    "Wallet",
    "More",
  ].includes(screen);
  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 15,
          paddingBottom: 13,
          gap: 14,
          borderBottomWidth: 1,
          borderColor: C.line,
        }}
      >
        <View style={S.between}>
          {subpage ? (
            <Pressable
              accessibilityLabel="Back to home"
              onPress={() => go("Home")}
              style={S.row}
            >
              <Icon name="arrow-back" size={21} />
              <Text style={S.h3}>
                {screen === "Result" ? "Verification result" : screen}
              </Text>
            </Pressable>
          ) : (
            <Brand />
          )}
          <Pressable
            accessibilityLabel={`Notifications, ${unread} unread`}
            onPress={() => go("Alerts")}
            style={{
              width: 40,
              height: 40,
              borderWidth: 1,
              borderColor: C.line,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="notifications-outline" size={20} />
            {unread > 0 && (
              <View
                style={{
                  position: "absolute",
                  top: 7,
                  right: 9,
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: C.red,
                  borderWidth: 1,
                  borderColor: C.cream,
                }}
              />
            )}
          </Pressable>
        </View>
      </View>
      <View
        style={{
          backgroundColor: "#F1E8DA",
          paddingHorizontal: 24,
          paddingVertical: 6,
        }}
      >
        <Text
          style={[
            S.small,
            { fontSize: 9, textAlign: "center", color: "#836B50" },
          ]}
        >
          {demoPayments
            ? "DEVELOPMENT PAYMENTS · No real money moves"
            : "CONNECTED TO VERYSURE"}
        </Text>
      </View>
      {!!storageError && (
        <Text style={[S.small, { color: C.red, padding: 10 }]}>
          {storageError}
        </Text>
      )}
      <ScrollView
        ref={scroll}
        contentContainerStyle={S.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {screen === "Home" && <Home go={go} open={open} />}
        {screen === "Verify" && <Scanner onResult={open} />}
        {screen === "Result" && result && (
          <Result
            verification={result}
            onAgain={() => go("Verify")}
            onReport={() => {
              setReportPrefill(result);
              go("Report");
            }}
          />
        )}
        {screen === "History" && <History onOpen={open} />}
        {screen === "Wallet" && <Wallet />}
        {screen === "Report" && <Reports prefill={reportPrefill} />}
        {screen === "Messages" && <Messages />}
        {screen === "Alerts" && <Alerts />}
        {screen === "Profile" && <Profile />}
        {screen === "Workspace" &&
          (user.role === "manufacturer" ? (
            <ManufacturerTools />
          ) : user.role === "monitor" ? (
            <MonitorTools />
          ) : user.role === "admin" ? (
            <AdminTools />
          ) : (
            <Home go={go} open={open} />
          ))}
        {screen === "More" && (
          <View style={{ gap: 20 }}>
            <Text style={S.h1}>A little more{"\n"}Verysure.</Text>
            <View style={S.card}>
              {[
                {
                  label: "My profile",
                  screen: "Profile",
                  icon: "person-outline",
                },
                {
                  label: "Report a product",
                  screen: "Report",
                  icon: "flag-outline",
                },
                {
                  label: "Messages",
                  screen: "Messages",
                  icon: "chatbubbles-outline",
                },
                {
                  label: "Notifications",
                  screen: "Alerts",
                  icon: "notifications-outline",
                },
                {
                  label: "Verification history",
                  screen: "History",
                  icon: "time-outline",
                },
              ].map((item, i) => (
                <View key={item.label} style={{ gap: 12 }}>
                  {i > 0 && <View style={S.divider} />}
                  <Pressable
                    onPress={() => {
                      if (item.screen === "Report") setReportPrefill(undefined);
                      go(item.screen as Screen);
                    }}
                    style={[S.row, { paddingVertical: 8 }]}
                  >
                    <Icon name={item.icon} size={21} />
                    <Text style={[S.h3, { flex: 1, fontSize: 14 }]}>
                      {item.label}
                    </Text>
                    <Icon name="chevron-forward" size={16} />
                  </Pressable>
                </View>
              ))}
            </View>
            <View style={S.card}>
              <Text style={S.h3}>Your account access</Text>
              <Text style={S.text}>
                You are signed in as {user.role}. To use another role, sign out
                and log in with that account.
              </Text>
              <Button
                secondary
                title="Refresh server data"
                onPress={() => {
                  void refresh().catch(() => {});
                }}
              />
            </View>
            <Button
              secondary
              title="Sign out"
              onPress={() => {
                void logout().catch(() => {});
              }}
            />
          </View>
        )}
      </ScrollView>
      <View
        style={{
          flexDirection: "row",
          borderTopWidth: 1,
          borderColor: C.line,
          backgroundColor: C.cream,
          paddingTop: 9,
          paddingBottom: 10,
          paddingHorizontal: 10,
        }}
      >
        {nav.map((item, i) => {
          const selected = screen === item.label;
          return (
            <Pressable
              key={item.label}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected }}
              onPress={() => go(item.label as Screen)}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                minHeight: 52,
              }}
            >
              <View
                style={
                  i === 2
                    ? {
                        width: 48,
                        height: 43,
                        borderRadius: 15,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: C.red,
                        marginTop: -16,
                        borderWidth: 4,
                        borderColor: C.cream,
                      }
                    : {}
                }
              >
                <Icon
                  name={item.icon}
                  size={i === 2 ? 24 : 21}
                  color={i === 2 ? "white" : selected ? C.red : "#9C8B7F"}
                />
              </View>
              <Text
                style={[
                  S.small,
                  { fontSize: 9, color: selected ? C.red : C.muted },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
export default function App() {
  const [loaded, fontError] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });
  if (!loaded && !fontError)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.cream,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={C.red} />
      </View>
    );
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View
        style={{ flex: 1, backgroundColor: "#EDE7DC", alignItems: "center" }}
      >
        <SafeAreaView
          style={{
            flex: 1,
            width: "100%",
            maxWidth: 520,
            backgroundColor: C.cream,
          }}
          edges={["top", "bottom"]}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <StoreProvider>
              <Shell />
            </StoreProvider>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </SafeAreaProvider>
  );
}
