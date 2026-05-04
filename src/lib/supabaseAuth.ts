export type AuthSession = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
  user: {
    id: string;
    email: string;
  };
};

type AuthState = {
  session: AuthSession | null;
  loading: boolean;
};

const AUTH_STORAGE_KEY = "anytrace.supabase.session";
const LOCAL_DEV_SESSION_PREFIX = "local-dev-session:";
const listeners = new Set<() => void>();
let state: AuthState = {
  session: null,
  loading: true,
};
let initialized = false;

function getSupabaseAuthConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  const siteUrl = import.meta.env.VITE_SITE_URL?.trim() || window.location.origin;

  if (!url || !anonKey) {
    return null;
  }

  return {
    url,
    anonKey,
    siteUrl,
  };
}

function notify() {
  listeners.forEach((listener) => listener());
}

function setState(next: Partial<AuthState>) {
  state = {
    ...state,
    ...next,
  };
  notify();
}

function readStoredSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

function persistSession(session: AuthSession | null) {
  if (!session) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function applySession(session: AuthSession | null) {
  persistSession(session);
  setState({
    session,
    loading: false,
  });
}

function isLocalDevSession(session: AuthSession | null) {
  return !!session?.accessToken?.startsWith(LOCAL_DEV_SESSION_PREFIX);
}

function parseHashSession() {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const expiresIn = Number(params.get("expires_in") || 0);
  const userId = params.get("user_id");
  const type = params.get("type");

  if (!accessToken || !userId || !type) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
    expiresAt: expiresIn > 0 ? Date.now() + expiresIn * 1000 : null,
    user: {
      id: userId,
      email: "",
    },
  } satisfies AuthSession;
}

async function fetchCurrentUser(session: AuthSession): Promise<AuthSession | null> {
  if (isLocalDevSession(session)) {
    return session;
  }

  const config = getSupabaseAuthConfig();
  if (!config) return null;

  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const user = (await response.json()) as {
    id: string;
    email?: string | null;
  };

  return {
    ...session,
    user: {
      id: user.id,
      email: user.email || session.user.email || "",
    },
  };
}

export async function initializeSupabaseAuth() {
  if (initialized) return;
  initialized = true;

  const hashSession = parseHashSession();
  if (hashSession) {
    const enriched = await fetchCurrentUser(hashSession);
    applySession(enriched);
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    return;
  }

  const stored = readStoredSession();
  if (!stored) {
    setState({ session: null, loading: false });
    return;
  }

  const enriched = await fetchCurrentUser(stored);
  applySession(enriched);
}

export function subscribeAuth(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAuthState() {
  return state;
}

export function getSupabaseAccessToken() {
  return state.session?.accessToken || null;
}

export function isUsingLocalDevSession() {
  return isLocalDevSession(state.session);
}

export async function sendMagicLink(email: string) {
  const config = getSupabaseAuthConfig();
  if (!config) {
    throw new Error("Frontend Supabase config missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

  const response = await fetch(`${config.url}/auth/v1/otp`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      create_user: true,
      data: {},
      gotrue_meta_security: {},
      email_redirect_to: config.siteUrl,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Magic link could not be sent: ${detail}`);
  }

  return true;
}

export function signInAsLocalTestUser(email: string) {
  const session: AuthSession = {
    accessToken: `${LOCAL_DEV_SESSION_PREFIX}${email}`,
    refreshToken: null,
    expiresAt: null,
    user: {
      id: "00000000-0000-0000-0000-000000000001",
      email,
    },
  };

  applySession(session);
  return session;
}

export async function signOutSupabase() {
  const config = getSupabaseAuthConfig();
  const accessToken = state.session?.accessToken;

  if (config && accessToken && !accessToken.startsWith(LOCAL_DEV_SESSION_PREFIX)) {
    await fetch(`${config.url}/auth/v1/logout`, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    }).catch(() => undefined);
  }

  applySession(null);
}
