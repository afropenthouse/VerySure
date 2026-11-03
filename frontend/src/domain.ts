export type Role =
  "consumer" | "retailer" | "manufacturer" | "monitor" | "admin";
export type Verdict = "GENUINE" | "FAKE" | "UNKNOWN";
export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  role: Role;
  company?: string;
  organization?: string;
  locationEnabled?: boolean;
  status: "active" | "suspended";
};
export type Manufacturer = {
  id: string;
  name: string;
  category: string;
  rc: string;
  status: "pending" | "approved" | "rejected";
  approval?: string;
  reason?: string;
};
export type Product = {
  id: string;
  manufacturerId: string;
  name: string;
  category: string;
  description: string;
  unit: string;
  regulatory: string;
};
export type Batch = {
  id: string;
  productId: string;
  number: string;
  quantity: number;
  manufactured: string;
  expires: string;
  status: "active" | "recalled";
};
export type Code = {
  value: string;
  batchId: string;
  type: "serial" | "barcode" | "seal" | "shape";
  blocked: boolean;
};
export type Coordinates = { latitude: number; longitude: number };
export type Verification = {
  id: string;
  userId: string;
  code: string;
  verdict: Verdict;
  reason: string;
  productId?: string;
  batchId?: string;
  chargedKobo: number;
  date: string;
  location?: Coordinates;
  details?: { product: Product; batch: Batch; manufacturer: Manufacturer };
};
export type Transaction = {
  id: string;
  userId: string;
  type: "topup" | "charge" | "transfer_in" | "transfer_out" | "admin_credit";
  amountKobo: number;
  note: string;
  date: string;
};
export type Report = {
  id: string;
  userId: string;
  product: string;
  code: string;
  description: string;
  photo?: string;
  location?: Coordinates;
  status: "open" | "investigating" | "resolved";
  date: string;
};
export type Message = {
  id: string;
  userId: string;
  manufacturerId: string;
  subject: string;
  body: string;
  reply?: string;
  date: string;
};
export type Notification = {
  id: string;
  userId: string;
  title: string;
  body: string;
  read: boolean;
  date: string;
};
export type Payment = {
  id: string;
  userId: string;
  amountKobo: number;
  method: string;
  status: "pending" | "settled" | "cancelled";
  date: string;
  checkoutUrl?: string;
};
export type State = {
  users: User[];
  manufacturers: Manufacturer[];
  products: Product[];
  batches: Batch[];
  codes: Code[];
  wallets: Record<string, { balanceKobo: number; freeUsed: number }>;
  verifications: Verification[];
  transactions: Transaction[];
  reports: Report[];
  messages: Message[];
  notifications: Notification[];
  payments: Payment[];
  adverts: { id: string; title: string; body: string; active: boolean }[];
  issuedBatches: { id: string; manufacturerId: string; number: string }[];
};
export const roles: {
  value: Role;
  title: string;
  description: string;
  icon: string;
}[] = [
  {
    value: "consumer",
    title: "Consumer",
    description: "Verify what you’re buying.",
    icon: "person-outline",
  },
  {
    value: "retailer",
    title: "Shop owner / Distributor",
    description: "Verify stock. Protect your customers.",
    icon: "storefront-outline",
  },
  {
    value: "manufacturer",
    title: "Manufacturer",
    description: "Protect your products and your brand.",
    icon: "cube-outline",
  },
  {
    value: "monitor",
    title: "Monitoring body",
    description: "NAFDAC or SON oversight.",
    icon: "shield-outline",
  },
  {
    value: "admin",
    title: "Super admin",
    description: "Manage the Verysure platform.",
    icon: "settings-outline",
  },
];
export const money = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export function amountToKobo(value: string, minimum = 1): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Enter a valid amount with up to two decimal places.");
  const kobo = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(kobo) || kobo < minimum * 100)
    throw new Error(`The minimum amount is ₦${minimum}.`);
  return kobo;
}
