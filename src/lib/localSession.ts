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

const LEGACY_REMOTE_AUTH_KEY = ["traqr", "supa", "base", "session"].join(".");
const listeners = new Set<() => void>();
const defaultSession: AuthSession = {
  accessToken: "local-traqr-session",
  refreshToken: null,
  expiresAt: null,
  user: {
    id: "local-traqr-user",
    email: "local@traqr.ai",
  },
};

let state: AuthState = {
  session: defaultSession,
  loading: false,
};

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

export async function initializeLocalSession() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(LEGACY_REMOTE_AUTH_KEY);
  }
  setState({
    session: defaultSession,
    loading: false,
  });
}

export function subscribeAuth(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAuthState() {
  return state;
}

export function getAccessToken() {
  return state.session?.accessToken || null;
}

export async function sendMagicLink(_email: string) {
  setState({
    session: defaultSession,
    loading: false,
  });
  return true;
}

export function signInAsLocalTestUser(email: string) {
  const session: AuthSession = {
    ...defaultSession,
    accessToken: `local-traqr-session:${email}`,
    user: {
      id: "local-traqr-user",
      email,
    },
  };
  setState({ session, loading: false });
  return session;
}

export async function signOutLocal() {
  setState({
    session: null,
    loading: false,
  });
}
