import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { State, User } from "./domain";
import {
  api,
  NetworkError,
  restoreSession,
  saveSession,
  imageUrl,
} from "./api";
import { bestEffortLocation } from "./device";
const empty: State = {
  users: [],
  manufacturers: [],
  products: [],
  batches: [],
  codes: [],
  wallets: {},
  verifications: [],
  transactions: [],
  reports: [],
  messages: [],
  notifications: [],
  payments: [],
  adverts: [],
  issuedBatches: [],
};
type Store = {
  state: State;
  user?: User;
  ready: boolean;
  busy: boolean;
  storageError: string;
  demoPayments: boolean;
  demoOtp: boolean;
  paymentProvider: string;
  paymentTestMode: boolean;
  refresh: () => Promise<void>;
  request: <T = any>(
    path: string,
    method?: string,
    data?: unknown,
  ) => Promise<T>;
  login: (identifier: string, password: string) => Promise<void>;
  register: (challengeId: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  stats?: Record<string, number>;
};
const Context = createContext<Store>(null!);
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(empty);
  const [userId, setUserId] = useState<string>();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [storageError, setError] = useState("");
  const [demoPayments, setDemoPayments] = useState(false);
  const [demoOtp, setDemoOtp] = useState(false);
  const [paymentProvider, setPaymentProvider] = useState("demo");
  const [paymentTestMode, setPaymentTestMode] = useState(false);
  const [stats, setStats] = useState<Record<string, number>>();
  const generation = useRef(0);
  async function refresh() {
    const version = generation.current;
    try {
      const data = await api<
        State & {
          actorId: string;
          demoPayments: boolean;
          demoOtp: boolean;
          paymentProvider: string;
          paymentTestMode: boolean;
          stats?: Record<string, number>;
        }
      >("/api/state");
      if (version !== generation.current) return;
      setState({
        ...data,
        reports: data.reports.map((r) => ({ ...r, photo: imageUrl(r.photo) })),
      });
      setUserId(data.actorId);
      setDemoPayments(data.demoPayments);
      setDemoOtp(data.demoOtp);
      setPaymentProvider(data.paymentProvider);
      setPaymentTestMode(data.paymentTestMode);
      setStats(data.stats);
      setError("");
    } catch (error) {
      if (error instanceof NetworkError && error.status === 401) {
        setUserId(undefined);
        setState(empty);
        await saveSession();
      } else setError((error as Error).message);
      throw error;
    }
  }
  useEffect(() => {
    (async () => {
      try {
        await restoreSession();
        const cfg = await api<{ demoPayments: boolean; demoOtp: boolean }>(
          "/api/auth/config",
        );
        setDemoPayments(cfg.demoPayments);
        setDemoOtp(cfg.demoOtp);
        await refresh();
      } catch (error) {
        if (!(error instanceof NetworkError && error.status === 401))
          setError((error as Error).message);
      } finally {
        setReady(true);
      }
    })();
  }, []);
  async function request<T>(
    path: string,
    method = "POST",
    data?: unknown,
  ): Promise<T> {
    setBusy(true);
    try {
      const result = await api<T>(path, method, data);
      // A refresh failure must not turn a committed command into a failed payment/scan.
      try {
        await refresh();
      } catch {
        /* refresh reports its error through storageError */
      }
      return result;
    } catch (error) {
      if (error instanceof NetworkError && error.status === 401) {
        await saveSession();
        setUserId(undefined);
        setState(empty);
      }
      throw error;
    } finally {
      setBusy(false);
    }
  }
  async function authenticate(path: string, data: unknown) {
    setBusy(true);
    try {
      const result = await api<{ token?: string }>(path, "POST", data);
      await saveSession(result.token);
      generation.current++;
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await api("/api/auth/logout", "POST");
    } catch (error) {
      if (!(error instanceof NetworkError && error.status === 401)) {
        setError(
          "Could not revoke your session. Check the server connection and try signing out again.",
        );
        throw error;
      }
    }
    generation.current++;
    await saveSession();
    setUserId(undefined);
    setState(empty);
    setError("");
  }
  return (
    <Context.Provider
      value={{
        state,
        user: state.users.find((u) => u.id === userId),
        ready,
        busy,
        storageError,
        demoPayments,
        demoOtp,
        paymentProvider,
        paymentTestMode,
        refresh,
        request,
        login: async (identifier, password) =>
          authenticate("/api/auth/login", {
            identifier,
            password,
            location: await bestEffortLocation(),
          }),
        register: (challengeId, code) =>
          authenticate("/api/auth/register", { challengeId, code }),
        logout,
        stats,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useStore = () => useContext(Context);
