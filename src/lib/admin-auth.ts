import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "ludos_admin_session";
const SESSION_SECONDS = 60 * 60 * 12;

function secret() {
  const value = process.env.ADMIN_PASSWORD;
  if (!value || value.length < 16) return null;
  return value;
}

function signature(payload: string, key: string) {
  return createHmac("sha256", key).update(payload).digest("hex");
}

export function createAdminSession() {
  const key = secret();
  if (!key) throw new Error("ADMIN_PASSWORD musi być ustawione i mieć co najmniej 16 znaków.");
  const payload = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  return `${payload}.${signature(payload, key)}`;
}

export function isValidAdminSession(value?: string) {
  const key = secret();
  if (!key || !value) return false;
  const [payload, supplied, extra] = value.split(".");
  if (!payload || !supplied || extra || !/^\d+$/.test(payload)) return false;
  if (Number(payload) <= Math.floor(Date.now() / 1000)) return false;
  const expected = signature(payload, key);
  const a = Buffer.from(supplied, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function hasAdminSession() {
  const store = await cookies();
  return isValidAdminSession(store.get(ADMIN_COOKIE)?.value);
}

export function adminPasswordConfigured() {
  return Boolean(secret());
}
