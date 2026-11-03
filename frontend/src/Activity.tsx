import React, { useState } from "react";
import { View, Text, Pressable, Image, Switch } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useStore } from "./store";
import { api, uploadPhoto } from "./api";
import { Verification } from "./domain";
import { bestEffortLocation } from "./device";
import { Badge, Button, C, Empty, Field, Icon, S } from "./theme";
export function History({ onOpen }: { onOpen: (v: Verification) => void }) {
  const { state, user } = useStore();
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [extra, setExtra] = useState<Verification[]>([]);
  const [hasMore, setHasMore] = useState(
    state.verifications.filter((v) => v.userId === user!.id).length === 100,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const own = state.verifications.filter((v) => v.userId === user!.id);
  const all = [...own, ...extra.filter((v) => !own.some((x) => x.id === v.id))];
  const list = all.filter(
    (v) =>
      (filter === "ALL" || v.verdict === filter) &&
      `${v.code} ${state.products.find((p) => p.id === v.productId)?.name || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  async function more() {
    setLoading(true);
    try {
      const data = await api<{
        items: Verification[];
        nextCursor: string | null;
      }>(`/api/history?cursor=${encodeURIComponent(all[all.length - 1].id)}`);
      setExtra((prev) => [...prev, ...data.items]);
      setHasMore(!!data.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <View style={{ gap: 20 }}>
      <Text style={S.h1}>Your checks,{"\n"}all in one place.</Text>
      <Field
        label="Search verifications"
        placeholder="Product name or code"
        value={query}
        onChangeText={setQuery}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {["ALL", "GENUINE", "FAKE", "UNKNOWN"].map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[S.pill, { backgroundColor: filter === f ? C.ink : C.sand }]}
          >
            <Text
              style={[S.small, { color: filter === f ? "white" : C.muted }]}
            >
              {f}
            </Text>
          </Pressable>
        ))}
      </View>
      {!list.length ? (
        <Empty
          icon="time-outline"
          title="No checks here yet"
          body="Try verifying your first product, or change your search."
        />
      ) : (
        list.map((v) => (
          <Pressable key={v.id} onPress={() => onOpen(v)} style={S.card}>
            <View style={S.between}>
              <Badge text={v.verdict} />
              <Icon name="chevron-forward" size={16} />
            </View>
            <Text style={S.h3}>
              {state.products.find((p) => p.id === v.productId)?.name || v.code}
            </Text>
            <Text style={S.small}>{v.code}</Text>
            <View style={S.between}>
              <Text style={S.small}>
                {new Date(v.date).toLocaleDateString()}
              </Text>
              <Text style={S.small}>
                {v.chargedKobo ? "₦10.00" : "Free scan"}
              </Text>
            </View>
          </Pressable>
        ))
      )}
      {hasMore && (
        <Button
          secondary
          title="Load older verifications"
          onPress={more}
          busy={loading}
        />
      )}
      <Text style={S.text}>{error}</Text>
    </View>
  );
}
export function Reports({ prefill }: { prefill?: Verification }) {
  const { state, user, request } = useStore();
  const [product, setProduct] = useState(
    state.products.find((p) => p.id === prefill?.productId)?.name || "",
  );
  const [code, setCode] = useState(prefill?.code || "");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function attach(camera: boolean) {
    try {
      const permission = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted)
        return setFeedback(
          "Photo permission was not granted. You can submit without a photo.",
        );
      const result = camera
        ? await ImagePicker.launchCameraAsync({ quality: 0.5 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.5,
          });
      if (!result.canceled) setPhoto(result.assets[0].uri);
    } catch {
      setFeedback(
        "Photo capture is unavailable. Choose a photo or submit without one.",
      );
    }
  }
  async function submit() {
    if (!product.trim() || description.trim().length < 10)
      return setFeedback(
        "Enter a product name and at least ten characters describing the issue.",
      );
    setBusy(true);
    try {
      const location = user!.locationEnabled
        ? await bestEffortLocation()
        : undefined;
      const photoId = photo ? (await uploadPhoto(photo)).photoId : undefined;
      await request("/api/reports", "POST", {
        product,
        code,
        description,
        photoId,
        location,
      });
      setProduct("");
      setCode("");
      setDescription("");
      setPhoto(undefined);
      setFeedback("Report submitted. You can follow its status below.");
    } catch (e) {
      setFeedback((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 20 }}>
      <View>
        <Text style={S.eyebrow}>HELP PROTECT YOUR COMMUNITY</Text>
        <Text style={[S.h1, { marginTop: 8 }]}>
          See something?{"\n"}Say something.
        </Text>
      </View>
      <Text style={S.text}>
        Tell us about a suspicious product. Include the seller, location and
        what looked unusual.
      </Text>
      <View style={S.card}>
        <Field label="Product name" value={product} onChangeText={setProduct} />
        <Field
          label="Product code (optional)"
          value={code}
          onChangeText={setCode}
        />
        <Field
          label="What happened?"
          multiline
          value={description}
          onChangeText={setDescription}
        />
        <View style={S.row}>
          <View style={{ flex: 1 }}>
            <Button secondary title="Take photo" onPress={() => attach(true)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              secondary
              title="Choose photo"
              onPress={() => attach(false)}
            />
          </View>
        </View>
        {photo && (
          <View style={{ gap: 8 }}>
            <Image
              source={{ uri: photo }}
              style={{ height: 180, borderRadius: 12 }}
            />
            <Pressable onPress={() => setPhoto(undefined)}>
              <Text style={[S.small, { color: C.red }]}>Remove photo</Text>
            </Pressable>
          </View>
        )}
        <Button
          title="Submit report"
          onPress={submit}
          busy={busy}
          icon="flag-outline"
        />
        <Text style={S.small}>
          Your report and photo are saved to the server. Location is included
          only when you enable sharing in your profile.
        </Text>
      </View>
      {!!feedback && (
        <Text accessibilityRole="alert" style={S.text}>
          {feedback}
        </Text>
      )}
      <Text style={S.h2}>Your reports</Text>
      {state.reports
        .filter((r) => r.userId === user!.id)
        .map((r) => (
          <View key={r.id} style={S.card}>
            <View style={S.between}>
              <Text style={[S.h3, { flex: 1 }]}>{r.product}</Text>
              <Badge text={r.status} />
            </View>
            <Text style={S.text}>{r.description}</Text>
            {r.photo && (
              <Image
                source={{ uri: r.photo }}
                style={{ height: 180, borderRadius: 12 }}
                resizeMode="contain"
              />
            )}
            <Text style={S.small}>{new Date(r.date).toLocaleString()}</Text>
          </View>
        ))}
      {!state.reports.some((r) => r.userId === user!.id) && (
        <Empty
          icon="flag-outline"
          title="No reports yet"
          body="Your reports and their status will appear here."
        />
      )}
    </View>
  );
}
export function Messages() {
  const { state, user, request, busy } = useStore();
  const manufacturer = user!.role === "manufacturer";
  const canSend = ["consumer", "retailer"].includes(user!.role);
  const [selected, setSelected] = useState(
    state.manufacturers.find((m) => m.status === "approved")?.id || "",
  );
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");
  const messages = state.messages.filter((m) =>
    manufacturer ? m.manufacturerId === user!.id : m.userId === user!.id,
  );
  async function send() {
    try {
      await request("/api/messages", "POST", {
        manufacturerId: selected,
        subject,
        body,
      });
      setSubject("");
      setBody("");
      setFeedback("Message sent.");
    } catch (e) {
      setFeedback((e as Error).message);
    }
  }
  async function reply(id: string) {
    try {
      await request(`/api/messages/${id}/reply`, "POST", {
        reply: replies[id],
      });
      setFeedback("Reply sent.");
    } catch (e) {
      setFeedback((e as Error).message);
    }
  }
  return (
    <View style={{ gap: 20 }}>
      <Text style={S.h1}>
        {manufacturer ? "Your customer inbox." : "A direct line to the source."}
      </Text>
      <Text style={S.text}>
        {manufacturer
          ? "Read and reply to customer questions."
          : "Ask a manufacturer about a product or recent purchase."}
      </Text>
      {canSend && (
        <View style={S.card}>
          <Text style={S.h3}>Choose a manufacturer</Text>
          {state.manufacturers
            .filter((m) => m.status === "approved")
            .map((m) => (
              <Pressable
                key={m.id}
                onPress={() => setSelected(m.id)}
                style={S.row}
              >
                <Icon
                  name={
                    selected === m.id ? "radio-button-on" : "radio-button-off"
                  }
                  size={20}
                  color={C.red}
                />
                <Text style={[S.text, { flex: 1 }]}>{m.name}</Text>
              </Pressable>
            ))}
          <Field label="Subject" value={subject} onChangeText={setSubject} />
          <Field
            label="Your message"
            multiline
            value={body}
            onChangeText={setBody}
          />
          <Button title="Send message" onPress={send} busy={busy} />
        </View>
      )}
      {!!feedback && <Text style={S.text}>{feedback}</Text>}
      {!messages.length && (
        <Empty
          icon="chatbubbles-outline"
          title="No conversations yet"
          body="Messages and replies will appear here."
        />
      )}
      {messages.map((m) => (
        <View key={m.id} style={S.card}>
          <View style={S.between}>
            <Text style={[S.h3, { flex: 1 }]}>{m.subject}</Text>
            <Badge text={m.reply ? "Replied" : "Awaiting reply"} />
          </View>
          <Text style={S.small}>
            {manufacturer
              ? `Customer ${m.userId}`
              : state.manufacturers.find((x) => x.id === m.manufacturerId)
                  ?.name}
          </Text>
          <Text style={S.text}>{m.body}</Text>
          {m.reply && (
            <View style={[S.card, { backgroundColor: C.mint }]}>
              <Text style={[S.small, { color: C.green }]}>
                MANUFACTURER REPLY
              </Text>
              <Text style={S.text}>{m.reply}</Text>
            </View>
          )}
          {manufacturer && (
            <>
              <Field
                label="Your reply"
                multiline
                value={replies[m.id] ?? m.reply ?? ""}
                onChangeText={(v) => setReplies((r) => ({ ...r, [m.id]: v }))}
              />
              <Button
                secondary
                title="Send reply"
                busy={busy}
                disabled={!(replies[m.id] || "").trim()}
                onPress={() => reply(m.id)}
              />
            </>
          )}
          <Text style={S.small}>{new Date(m.date).toLocaleString()}</Text>
        </View>
      ))}
    </View>
  );
}
export function Alerts() {
  const { state, request } = useStore();
  const [error, setError] = useState("");
  async function read(data: unknown) {
    try {
      await request("/api/notifications/read", "POST", data);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <View style={{ gap: 18 }}>
      <Text style={S.h1}>You’re in the know.</Text>
      <Button
        secondary
        title="Mark all as read"
        onPress={() => read({ all: true })}
      />
      {!!error && <Text style={S.text}>{error}</Text>}
      {!state.notifications.length && (
        <Empty
          icon="notifications-outline"
          title="All quiet for now"
          body="Wallet updates and important news will appear here."
        />
      )}
      {state.notifications.map((n) => (
        <Pressable
          key={n.id}
          onPress={() => read({ id: n.id })}
          style={[S.card, { borderColor: n.read ? C.line : "#E1B7A9" }]}
        >
          <View style={S.row}>
            <Icon
              name={n.read ? "mail-open-outline" : "mail-unread-outline"}
              color={n.read ? C.muted : C.red}
            />
            <Text style={[S.h3, { flex: 1 }]}>{n.title}</Text>
            {!n.read && (
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: C.red,
                }}
              />
            )}
          </View>
          <Text style={S.text}>{n.body}</Text>
          <Text style={S.small}>{new Date(n.date).toLocaleString()}</Text>
        </Pressable>
      ))}
    </View>
  );
}
export function Profile() {
  const { user, request, logout, busy } = useStore();
  const [name, setName] = useState(user!.name);
  const [address, setAddress] = useState(user!.address);
  const [phone, setPhone] = useState(user!.phone);
  const [company, setCompany] = useState(user!.company || "");
  const [feedback, setFeedback] = useState("");
  async function save(locationEnabled?: boolean) {
    try {
      await request("/api/profile", "PATCH", {
        name,
        address,
        phone,
        ...(company ? { company } : {}),
        ...(locationEnabled !== undefined ? { locationEnabled } : {}),
      });
      setFeedback(
        locationEnabled === undefined
          ? "Profile updated."
          : locationEnabled
            ? "Location sharing enabled."
            : "Location sharing disabled for future scans and reports.",
      );
    } catch (e) {
      setFeedback((e as Error).message);
    }
  }
  async function toggle(value: boolean) {
    if (!value) return save(false);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.granted) await save(true);
      else
        setFeedback(
          "Location permission declined. You can continue using Verysure.",
        );
    } catch {
      setFeedback("Location is unavailable on this device.");
    }
  }
  return (
    <View style={{ gap: 20 }}>
      <Text style={S.h1}>A little about you.</Text>
      <View style={[S.card, S.row]}>
        <View
          style={[
            S.iconBox,
            {
              backgroundColor: C.rose,
              width: 58,
              height: 58,
              borderRadius: 29,
            },
          ]}
        >
          <Text style={[S.h2, { color: C.red }]}>
            {user!.name
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")}
          </Text>
        </View>
        <View>
          <Text style={S.h3}>{user!.name}</Text>
          <Text selectable style={S.small}>
            VERYSURE ID · {user!.id}
          </Text>
          <Text style={S.small}>{user!.role.toUpperCase()}</Text>
        </View>
      </View>
      <Field label="Full name" value={name} onChangeText={setName} />
      <Field
        label="Phone number"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      <Field label="Address" value={address} onChangeText={setAddress} />
      {["retailer", "manufacturer"].includes(user!.role) && (
        <Field label="Company name" value={company} onChangeText={setCompany} />
      )}
      <Text style={S.small}>Email · {user!.email}</Text>
      <Button title="Save profile" onPress={() => save()} busy={busy} />
      <View style={S.card}>
        <View style={S.between}>
          <View style={{ flex: 1 }}>
            <Text style={S.h3}>Location for safer markets</Text>
            <Text style={S.small}>Attach GPS to scans and reports.</Text>
          </View>
          <Switch
            accessibilityLabel="Enable location"
            value={!!user!.locationEnabled}
            disabled={busy}
            trackColor={{ true: C.green, false: C.line }}
            onValueChange={toggle}
          />
        </View>
        <Text style={S.text}>
          Optional. You can verify and report products without sharing your
          location.
        </Text>
      </View>
      {!!feedback && (
        <Text accessibilityRole="alert" style={S.text}>
          {feedback}
        </Text>
      )}
      <Button
        secondary
        title="Sign out"
        onPress={() => logout().catch(() => {})}
      />
      <Text style={S.small}>
        Verysure 1.0.0 · Connected to the Verysure server.
      </Text>
    </View>
  );
}
