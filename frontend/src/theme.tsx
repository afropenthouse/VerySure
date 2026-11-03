import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
export const C = {
  cream: "#FAF7F1",
  paper: "#FFFFFF",
  ink: "#210C02",
  muted: "#81756E",
  line: "#E8E1D7",
  red: "#C42121",
  rose: "#F9E9E6",
  green: "#24764D",
  mint: "#EAF3EC",
  sand: "#F0EADF",
  amber: "#9B6519",
};
export const S = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.cream },
  body: { padding: 24, paddingBottom: 36, gap: 22 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  h1: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 34,
    lineHeight: 39,
    letterSpacing: -1.4,
    color: C.ink,
  },
  h2: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 22,
    letterSpacing: -0.5,
    color: C.ink,
  },
  h3: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 16, color: C.ink },
  text: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    lineHeight: 22,
    color: C.muted,
  },
  small: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
    lineHeight: 16,
    color: C.muted,
  },
  eyebrow: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 10,
    letterSpacing: 2.2,
    color: C.red,
  },
  card: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  divider: { height: 1, backgroundColor: C.line },
  input: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 14,
    minHeight: 50,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    color: C.ink,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: C.sand,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 6,
    backgroundColor: C.sand,
  },
  empty: { alignItems: "center", paddingVertical: 32, gap: 12 },
});
export function Icon({
  name,
  size = 22,
  color = C.ink,
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  return (
    <Ionicons
      name={name as keyof typeof Ionicons.glyphMap}
      size={size}
      color={color}
    />
  );
}
export function Button({
  title,
  onPress,
  secondary,
  disabled,
  busy,
  icon,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  busy?: boolean;
  icon?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        paddingHorizontal: 20,
        paddingVertical: 14,
        backgroundColor: secondary ? C.sand : C.red,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 10,
        opacity: disabled || busy ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? C.ink : "white"} />
      ) : (
        <>
          <Text
            style={[S.h3, { color: secondary ? C.ink : "white", fontSize: 14 }]}
          >
            {title}
          </Text>
          {icon && (
            <Icon name={icon} size={18} color={secondary ? C.ink : "white"} />
          )}
        </>
      )}
    </Pressable>
  );
}
export function Field({
  label,
  secureTextEntry = false,
  ...props
}: TextInputProps & { label: string }) {
  const [passwordVisible, setPasswordVisible] = React.useState(false);
  return (
    <View style={{ gap: 7 }}>
      <Text style={[S.small, { color: C.ink }]}>{label}</Text>
      <View style={{ position: "relative" }}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor="#A79B93"
          autoCapitalize={secureTextEntry ? "none" : undefined}
          autoCorrect={secureTextEntry ? false : undefined}
          {...props}
          secureTextEntry={secureTextEntry && !passwordVisible}
          style={[
            S.input,
            props.multiline && { minHeight: 110, textAlignVertical: "top" },
            props.style,
            secureTextEntry && { paddingRight: 60 },
          ]}
        />
        {secureTextEntry && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              passwordVisible ? "Hide password" : "Show password"
            }
            disabled={props.editable === false}
            onPress={() => setPasswordVisible((visible) => !visible)}
            style={({ pressed }) => ({
              position: "absolute",
              right: 4,
              top: 0,
              bottom: 0,
              width: 48,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Icon
              name={passwordVisible ? "eye-off-outline" : "eye-outline"}
              color={C.muted}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}
export function Badge({ text }: { text: string }) {
  const good = /^(GENUINE|approved|resolved|settled|active)$/i.test(text);
  const bad = /^(FAKE|rejected|recalled|suspended|blocked)$/i.test(text);
  return (
    <View
      style={[
        S.pill,
        {
          backgroundColor: good ? C.mint : bad ? C.rose : C.sand,
          alignSelf: "flex-start",
        },
      ]}
    >
      <Text
        style={[
          S.small,
          { color: good ? C.green : bad ? C.red : C.amber, fontSize: 10 },
        ]}
      >
        {text.toUpperCase()}
      </Text>
    </View>
  );
}
export function Empty({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <View style={S.empty}>
      <View style={S.iconBox}>
        <Icon name={icon} color={C.muted} />
      </View>
      <Text style={S.h3}>{title}</Text>
      <Text style={[S.text, { textAlign: "center", maxWidth: 280 }]}>
        {body}
      </Text>
    </View>
  );
}
export function Brand() {
  return (
    <View style={S.row}>
      <View
        style={{
          width: 34,
          height: 39,
          borderRadius: 11,
          backgroundColor: C.red,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Icon name="shield-checkmark" color="white" size={23} />
      </View>
      <View>
        <Text style={[S.h2, { fontSize: 22, letterSpacing: -1 }]}>
          Verysure<Text style={{ color: C.red }}>.</Text>
        </Text>
        <Text style={[S.small, { fontSize: 8, letterSpacing: 1.2 }]}>
          VERIFY BEFORE YOU BUY
        </Text>
      </View>
    </View>
  );
}
