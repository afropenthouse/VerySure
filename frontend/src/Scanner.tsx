import React, { useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { uid, Verification } from "./domain";
import { useStore } from "./store";
import { Badge, Button, C, Field, Icon, S } from "./theme";
import { bestEffortLocation } from "./device";
import { NetworkError } from "./api";
export function Scanner({ onResult }: { onResult: (v: Verification) => void }) {
  const { state, user, request, demoOtp } = useStore();
  const [permission, requestPermission] = useCameraPermissions();
  const [camera, setCamera] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const scanKey = useRef(uid());
  const attemptedCode = useRef("");
  const verify = async (value: string) => {
    if (lock.current) return;
    value = value.trim().toUpperCase();
    if (!value) {
      setError("Scan a barcode or enter a product code first.");
      return;
    }
    if (attemptedCode.current !== value) {
      scanKey.current = uid();
      attemptedCode.current = value;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const location = user!.locationEnabled
        ? await bestEffortLocation()
        : undefined;
      const result = await request<Verification>("/api/verify", "POST", {
        code: value,
        location,
        idempotencyKey: scanKey.current,
      });
      setCamera(false);
      onResult(result!);
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof NetworkError && e.status > 0 && e.status < 500)
        scanKey.current = uid();
      lock.current = false;
      setBusy(false);
    }
  };
  const wallet = state.wallets[user!.id];
  return (
    <View style={{ gap: 22 }}>
      <View style={{ gap: 8 }}>
        <Text style={S.eyebrow}>KNOW WHAT YOU’RE BUYING</Text>
        <Text style={S.h1}>A scan away{"\n"}from certainty.</Text>
        <Text style={S.text}>
          Scan a barcode or enter a code registered by its manufacturer. Codes
          outside Verysure’s database return an unknown result.
        </Text>
      </View>
      <View
        style={{
          height: 290,
          borderRadius: 24,
          overflow: "hidden",
          backgroundColor: C.ink,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {camera && permission?.granted ? (
          <CameraView
            style={{ position: "absolute", inset: 0 }}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{
              barcodeTypes: [
                "ean13",
                "ean8",
                "qr",
                "code128",
                "code39",
                "datamatrix",
                "upc_a",
                "upc_e",
              ],
            }}
            onBarcodeScanned={busy ? undefined : ({ data }) => verify(data)}
          />
        ) : (
          <>
            <View
              style={{
                flexDirection: "row",
                gap: 4,
                opacity: 0.18,
                position: "absolute",
              }}
            >
              {Array.from({ length: 36 }, (_, i) => (
                <View
                  key={i}
                  style={{
                    height: 130 + (i % 3) * 8,
                    width: i % 4 === 0 ? 5 : 2,
                    backgroundColor: "white",
                  }}
                />
              ))}
            </View>
            <View
              style={{
                width: 206,
                height: 150,
                borderWidth: 2,
                borderColor: "#DD6F5E",
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="scan-outline" size={45} color="white" />
            </View>
            <Text style={[S.small, { color: "#D6C2B5", marginTop: 20 }]}>
              BARCODES · SERIALS · SECURITY SEALS
            </Text>
          </>
        )}
        {camera && (
          <Pressable
            accessibilityLabel="Toggle flashlight"
            onPress={() => setTorch((t) => !t)}
            style={{
              position: "absolute",
              right: 16,
              bottom: 16,
              backgroundColor: "#FFFFFFDD",
              padding: 12,
              borderRadius: 40,
            }}
          >
            <Icon name={torch ? "flash" : "flash-outline"} />
          </Pressable>
        )}
      </View>
      <Button
        secondary
        title={camera ? "Close camera" : "Open camera scanner"}
        icon="camera-outline"
        onPress={async () => {
          if (camera) return setCamera(false);
          try {
            const p = permission?.granted
              ? permission
              : await requestPermission();
            if (p.granted) setCamera(true);
            else
              setError(
                "Camera access is unavailable. Enter the code manually, or enable camera access in device settings.",
              );
          } catch {
            setError("The camera is unavailable here. Enter your code below.");
          }
        }}
      />
      <View style={[S.between, { gap: 14 }]}>
        <View style={[S.divider, { flex: 1 }]} />
        <Text style={S.small}>OR ENTER CODE MANUALLY</Text>
        <View style={[S.divider, { flex: 1 }]} />
      </View>
      <Field
        label="Product code"
        placeholder="e.g. VS-EMZR-2026-0001"
        autoCapitalize="characters"
        value={code}
        onChangeText={setCode}
        onSubmitEditing={() => verify(code)}
      />
      <Button
        title="Verify product"
        icon="arrow-forward"
        onPress={() => verify(code)}
        busy={busy}
        disabled={!code.trim()}
      />
      {!!error && (
        <Text accessibilityRole="alert" style={[S.text, { color: C.red }]}>
          {error}
        </Text>
      )}
      <View
        style={[S.card, { backgroundColor: C.mint, borderColor: "#D6E5D8" }]}
      >
        <View style={S.row}>
          <Icon name="gift-outline" color={C.green} />
          <Text style={[S.h3, { color: C.green }]}>
            {Math.max(0, 10 - wallet.freeUsed)} free scans remaining
          </Text>
        </View>
        <Text style={S.small}>
          Then ₦10 per verification. You’ll always see the charge.
        </Text>
      </View>
      {demoOtp && (
        <View style={{ gap: 10 }}>
          <Text style={S.small}>SAMPLE CODES (REQUIRE SAMPLE DATA)</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[
              { label: "Genuine", code: "VS-EMZR-2026-0001" },
              { label: "Recalled", code: "VS-RECALL-0001" },
              { label: "Unknown", code: "VS-NOT-REGISTERED" },
            ].map((c) => (
              <Pressable
                key={c.label}
                onPress={() => setCode(c.code)}
                style={S.pill}
              >
                <Text style={S.small}>{c.label} ↗</Text>
              </Pressable>
            ))}
          </View>
          <Text style={S.small}>
            These codes work only when sample products have been added to this
            server.
          </Text>
        </View>
      )}
    </View>
  );
}
export function Result({
  verification: v,
  onAgain,
  onReport,
}: {
  verification: Verification;
  onAgain: () => void;
  onReport: () => void;
}) {
  const { state, demoOtp } = useStore();
  const product =
    v.details?.product ?? state.products.find((p) => p.id === v.productId);
  const batch =
    v.details?.batch ?? state.batches.find((b) => b.id === v.batchId);
  const manufacturer =
    v.details?.manufacturer ??
    state.manufacturers.find((m) => m.id === product?.manufacturerId);
  const color =
    v.verdict === "GENUINE" ? C.green : v.verdict === "FAKE" ? C.red : C.amber;
  return (
    <View style={{ gap: 22 }}>
      <View style={{ alignItems: "center", paddingVertical: 20, gap: 16 }}>
        <View
          style={{
            width: 90,
            height: 90,
            borderRadius: 45,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: v.verdict === "GENUINE" ? C.mint : C.rose,
          }}
        >
          <Icon
            name={v.verdict === "GENUINE" ? "shield-checkmark" : "alert-circle"}
            color={color}
            size={50}
          />
        </View>
        <Badge text={v.verdict} />
        <Text style={[S.h1, { textAlign: "center" }]}>
          {v.verdict === "GENUINE"
            ? "That’s peace of mind."
            : v.verdict === "FAKE"
              ? "Something isn’t right."
              : "We can’t confirm this."}
        </Text>
        <Text style={[S.text, { textAlign: "center" }]}>{v.reason}</Text>
        <Text style={S.small}>
          {demoOtp ? "DEVELOPMENT DATABASE RESULT" : "VERYSURE DATABASE RESULT"}
        </Text>
      </View>
      <View style={S.card}>
        <Text style={S.h2}>{product?.name || "Unregistered product"}</Text>
        {[
          ["Manufacturer", manufacturer?.name],
          ["Code", v.code],
          ["Batch number", batch?.number],
          ["Manufactured", batch?.manufactured],
          ["Expiry date", batch?.expires],
          ["Regulatory number", product?.regulatory],
          ["Approval number", manufacturer?.approval],
          ["Verification fee", v.chargedKobo ? "₦10.00" : "Free verification"],
        ]
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <View key={label} style={[S.between, { alignItems: "flex-start" }]}>
              <Text style={[S.small, { flex: 1 }]}>{label}</Text>
              <Text
                selectable
                style={[
                  S.small,
                  { color: C.ink, flex: 1.6, textAlign: "right" },
                ]}
              >
                {value}
              </Text>
            </View>
          ))}
      </View>
      {batch && new Date(batch.expires).getTime() < Date.now() && (
        <Text style={[S.text, { color: C.red }]}>
          This product is past its expiry date. Do not use it.
        </Text>
      )}
      {v.verdict !== "GENUINE" && (
        <Button
          title="Report this product"
          onPress={onReport}
          icon="flag-outline"
        />
      )}
      <Button
        title="Verify another product"
        secondary={v.verdict !== "GENUINE"}
        onPress={onAgain}
        icon="scan-outline"
      />
    </View>
  );
}
