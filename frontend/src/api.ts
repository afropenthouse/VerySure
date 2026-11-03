import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000")
).replace(/\/$/, "");
const TOKEN_KEY = "verysure-session";
let token: string | undefined;
export class NetworkError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
export async function restoreSession() {
  if (Platform.OS !== "web")
    token = (await SecureStore.getItemAsync(TOKEN_KEY)) ?? undefined;
}
export async function saveSession(value?: string) {
  token = value;
  if (Platform.OS !== "web") {
    if (value) await SecureStore.setItemAsync(TOKEN_KEY, value);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}
export async function api<T = any>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (Platform.OS !== "web") headers["X-Client-Type"] = "native";
  const multipart = data instanceof FormData;
  if (data && !multipart) headers["Content-Type"] = "application/json";
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      credentials: "include",
      body: data ? (multipart ? data : JSON.stringify(data)) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new NetworkError(
      `Cannot reach the Verysure server at ${API_URL}. Check that the backend is running and your device can reach it.`,
    );
  } finally {
    clearTimeout(timeout);
  }
  const result = await response
    .json()
    .catch(() => ({ error: "Unexpected server response." }));
  if (!response.ok)
    throw new NetworkError(
      result.error || "The request could not be completed.",
      response.status,
    );
  return result;
}
export async function uploadPhoto(uri: string) {
  const data = new FormData();
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    data.append("file", await response.blob(), "report.jpg");
  } else
    data.append("file", { uri, name: "report.jpg", type: "image/jpeg" } as any);
  return api<{ photoId: string }>("/api/photos", "POST", data);
}
export function imageUrl(value?: string) {
  if (!value) return;
  const url = new URL(value, API_URL);
  return `${API_URL}${url.pathname}${url.search}`;
}
