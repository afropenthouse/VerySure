import {
  createHmac,
  randomBytes,
  timingSafeEqual,
  scrypt as scryptCb,
} from "node:crypto";
import { promisify } from "node:util";
import { config } from "./config.js";
const scrypt = promisify(scryptCb);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${hash.toString("hex")}`;
}
export async function checkPassword(password: string, stored: string) {
  const [, salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  const target = Buffer.from(expected, "hex");
  return target.length === hash.length && timingSafeEqual(target, hash);
}
export const tokenHash = (token: string) =>
  createHmac("sha256", config.SESSION_SECRET).update(token).digest("hex");
export const otpHash = (id: string, otp: string) =>
  createHmac("sha256", config.OTP_SECRET).update(`${id}:${otp}`).digest("hex");
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function signPhoto(photoId: string, expires: number) {
  return createHmac("sha256", config.PHOTO_SIGNING_SECRET)
    .update(`${photoId}:${expires}`)
    .digest("hex");
}
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code = "REQUEST_FAILED",
  ) {
    super(message);
  }
}
export function requireValue(
  value: unknown,
  message: string,
  status = 400,
): asserts value {
  if (!value) throw new ApiError(status, message);
}
