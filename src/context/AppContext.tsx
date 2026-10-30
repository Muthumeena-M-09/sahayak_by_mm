import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { BUNDLED_TRANSLATIONS, DEFAULT_UI_STRINGS } from '../db/seedData.ts';
import { localizeServiceTemplates } from '../i18n/catalog.ts';
import { useNetworkAndOfflineQueue } from '../hooks/usePWAAndNetwork.ts';
import type { LanguageItem, ServiceTemplate, UserProfile } from '../types.ts';

interface RealtimeListener {
  id: string;
  cb: (event: { type: string; payload: any }) => void;
}

interface AppContextValue {
  languages: LanguageItem[];
  currentLanguage: LanguageItem;
  suggestedDeviceLangCode: string | null;
  hasChosenLanguage: boolean;
  selectLanguage: (code: string) => Promise<void>;
  t: (key: string) => string;
  tStatus: (rawStatus: string) => string;
  formatDate: (dateInput: string | Date) => string;
  formatNumber: (num: number) => string;
  formatCurrency: (amountInr: number) => string;

  authToken: string | null;
  profile: UserProfile | null;
  roles: string[];
  isAuthReady: boolean;
  isAdminOrStaff: boolean;
  signInWithGooglePopup: () => Promise<void>;
  completeOtpOrGuestSession: (token: string, profile: UserProfile, roles: string[]) => void;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updatePreferences: (patch: Partial<UserProfile>) => Promise<void>;
  apiFetch: <T = any>(url: string, init?: RequestInit) => Promise<T>;

  services: ServiceTemplate[];
  refreshServices: () => Promise<void>;
  refreshLanguages: () => Promise<void>;

  network: ReturnType<typeof useNetworkAndOfflineQueue>;
  subscribeRealtime: (cb: (event: { type: string; payload: any }) => void) => () => void;
  accentPalette: 'periwinkle' | 'terracotta';
  setAccentPalette: (next: 'periwinkle' | 'terracotta') => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const FALLBACK_EN: LanguageItem = {
  code: 'en',
  nativeName: 'English',
  englishName: 'English',
  script: 'Latin',
  direction: 'ltr',
  sttSupported: true,
  ttsSupported: true,
  fontStack: "'DM Sans', 'Plus Jakarta Sans', sans-serif",
  localeCode: 'en-IN',
  sampleGreeting: 'Welcome to Sahayak.',
  isEnabled: true,
  sortOrder: 1,
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [languages, setLanguages] = useState<LanguageItem[]>([FALLBACK_EN]);
  const [langCode, setLangCode] = useState<string>('en');
  const [hasChosenLanguage, setHasChosenLanguage] = useState<boolean>(false);
  const [uiStrings, setUiStrings] = useState<Record<string, string>>(DEFAULT_UI_STRINGS);
  const [rawServices, setRawServices] = useState<ServiceTemplate[]>([]);

  // Store auth token strictly in memory (never in localStorage)
  const [authToken, setAuthToken] = useState<string | null>(null);
  const authTokenRef = useRef<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);

  const network = useNetworkAndOfflineQueue();
  const listenersRef = useRef<RealtimeListener[]>([]);
  const [accentPalette, setAccentPaletteState] = useState<'periwinkle' | 'terracotta'>(() => {
    if (typeof window === 'undefined') return 'periwinkle';
    return window.localStorage.getItem('sahayak_accent_palette') === 'terracotta'
      ? 'terracotta'
      : 'periwinkle';
  });

  const setAccentPalette = useCallback((next: 'periwinkle' | 'terracotta') => {
    setAccentPaletteState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('sahayak_accent_palette', next);
    }
  }, []);

  const suggestedDeviceLangCode = useMemo(() => {
    if (typeof navigator === 'undefined') return null;
    const raw = (navigator.language || '').split('-')[0].toLowerCase();
    const match = languages.find((l) => l.code === raw);
    return match ? match.code : null;
  }, [languages]);

  const currentLanguage = useMemo(() => {
    return languages.find((l) => l.code === langCode) || languages[0] || FALLBACK_EN;
  }, [languages, langCode]);

  const refreshLanguages = useCallback(async () => {
    try {
      const res = await fetch('/api/public/languages');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.languages) && data.languages.length > 0) {
          setLanguages(data.languages);
        }
      }
    } catch {
      // Offline fallback keeps existing languages
    }
  }, []);

  const refreshServices = useCallback(async () => {
    try {
      const res = await fetch('/api/public/services');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.services)) {
          setRawServices(data.services);
        }
      }
    } catch {
      // Offline fallback
    }
  }, []);

  const services = useMemo(
    () => localizeServiceTemplates(rawServices, uiStrings, langCode),
    [rawServices, uiStrings, langCode]
  );

  // Load initial public registries
  useEffect(() => {
    refreshLanguages();
    refreshServices();
  }, [refreshLanguages, refreshServices]);

  // Load i18n dictionary whenever language changes (apply bundled strings synchronously in 0ms first)
  useEffect(() => {
    let active = true;
    const bundled = BUNDLED_TRANSLATIONS[langCode] || {};
    setUiStrings(langCode === 'en' ? DEFAULT_UI_STRINGS : { ...DEFAULT_UI_STRINGS, ...bundled });

    (async () => {
      try {
        const res = await fetch(`/api/public/i18n/${encodeURIComponent(langCode)}`);
        if (res.ok && active) {
          const data = await res.json();
          if (data.strings) {
            setUiStrings(data.strings);
          }
        }
      } catch {
        // Retain bundled fallback dictionary if offline
      }
    })();
    return () => {
      active = false;
    };
  }, [langCode]);

  // Apply script font stack, RTL/LTR direction, theme, and text scaling to <html>
  useEffect(() => {
    const html = document.documentElement;
    html.lang = currentLanguage.code;
    html.dir = currentLanguage.direction === 'rtl' ? 'rtl' : 'ltr';
    html.style.setProperty('--app-font-stack', currentLanguage.fontStack);
  }, [currentLanguage]);

  useEffect(() => {
    const html = document.documentElement;
    const scale = profile?.textSizeLevel || 1;
    html.setAttribute('data-text-scale', String(scale));

    const prefTheme = profile?.theme || 'system';
    const applyTheme = () => {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const shouldBeDark = prefTheme === 'dark' || (prefTheme === 'system' && prefersDark);
      html.classList.toggle('dark', shouldBeDark);
    };
    applyTheme();

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', applyTheme);
    return () => mq.removeEventListener('change', applyTheme);
  }, [profile?.textSizeLevel, profile?.theme]);

  useEffect(() => {
    const html = document.documentElement;
    if (accentPalette === 'terracotta') {
      html.setAttribute('data-palette', 'terracotta');
    } else {
      html.removeAttribute('data-palette');
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', accentPalette === 'terracotta' ? '#C1785A' : '#898AC4');
    }
  }, [accentPalette]);

  const apiFetch = useCallback(async <T = any,>(url: string, init: RequestInit = {}): Promise<T> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((init.headers as Record<string, string>) || {}),
    };
    if (authTokenRef.current) {
      headers.Authorization = `Bearer ${authTokenRef.current}`;
    }
    const res = await fetch(url, { ...init, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data as T;
  }, []);

  // Listen to Firebase Auth state changes (in-memory only; immediately exchange for backend session)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser && !authTokenRef.current?.startsWith('sahayak_session_')) {
        try {
          const idToken = await fbUser.getIdToken(false);
          const me = await fetch('/api/me', {
            headers: { Authorization: `Bearer ${idToken}` },
          });
          if (me.ok) {
            const data = await me.json();
            const activeToken = data.sessionToken || idToken;
            authTokenRef.current = activeToken;
            setAuthToken(activeToken);
            setProfile(data.profile);
            setRoles(data.roles || ['citizen']);
            if (data.profile?.preferredLanguage) {
              setLangCode(data.profile.preferredLanguage);
              setHasChosenLanguage(true);
            }
            if (data.sessionToken) {
              // Detach Firebase background STS refresh timer once backend session is active
              await signOut(auth).catch(() => {});
            }
          }
        } catch {
          // If STS refresh API is unavailable or token expired, silently sign out Firebase user
          await signOut(auth).catch(() => {});
        }
      }
      setIsAuthReady(true);
    });
    return () => unsub();
  }, []);

  const signInWithGooglePopup = useCallback(async () => {
    const cred = await signInWithPopup(auth, googleAuthProvider);
    const idToken =
      (await cred.user.getIdToken(false).catch(() => null)) ||
      (cred as any)?._tokenResponse?.idToken;
    if (!idToken) {
      throw new Error('Could not retrieve authentication token from Google Sign-In.');
    }
    const res = await fetch('/api/me', {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to verify Google account.');
    }
    const data = await res.json();
    const activeToken = data.sessionToken || idToken;
    authTokenRef.current = activeToken;
    setAuthToken(activeToken);

    if (data.sessionToken) {
      // Detach Firebase background STS refresh timer now that server session is issued
      await signOut(auth).catch(() => {});
    }

    // Persist user's chosen language if they picked one right before signing in
    if (hasChosenLanguage && langCode && data.profile?.preferredLanguage !== langCode) {
      const patchRes = await fetch('/api/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({ preferredLanguage: langCode }),
      });
      if (patchRes.ok) {
        const patched = await patchRes.json();
        setProfile(patched.profile);
      } else {
        setProfile(data.profile);
      }
    } else {
      setProfile(data.profile);
      if (data.profile?.preferredLanguage) setLangCode(data.profile.preferredLanguage);
    }
    setRoles(data.roles || ['citizen']);
    setHasChosenLanguage(true);
  }, [hasChosenLanguage, langCode]);

  const completeOtpOrGuestSession = useCallback(
    (token: string, userProfile: UserProfile, userRolesList: string[]) => {
      authTokenRef.current = token;
      setAuthToken(token);
      setProfile(userProfile);
      setRoles(userRolesList);
      if (userProfile.preferredLanguage) {
        setLangCode(userProfile.preferredLanguage);
      }
      setHasChosenLanguage(true);
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch {
      // Ignore if session was OTP/guest
    }
    authTokenRef.current = null;
    setAuthToken(null);
    setProfile(null);
    setRoles([]);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!authTokenRef.current) return;
    const data = await apiFetch<{ profile: UserProfile; roles: string[] }>('/api/me');
    setProfile(data.profile);
    setRoles(data.roles || ['citizen']);
  }, [apiFetch]);

  const updatePreferences = useCallback(
    async (patch: Partial<UserProfile>) => {
      if (patch.preferredLanguage) {
        setLangCode(patch.preferredLanguage);
      }
      if (!authTokenRef.current) {
        setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
        return;
      }
      const data = await apiFetch<{ profile: UserProfile }>('/api/me', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setProfile(data.profile);
    },
    [apiFetch]
  );

  const selectLanguage = useCallback(
    async (code: string) => {
      const bundled = BUNDLED_TRANSLATIONS[code] || {};
      setUiStrings(code === 'en' ? DEFAULT_UI_STRINGS : { ...DEFAULT_UI_STRINGS, ...bundled });
      setLangCode(code);
      setHasChosenLanguage(true);
      if (authTokenRef.current) {
        try {
          const data = await apiFetch<{ profile: UserProfile }>('/api/me', {
            method: 'PATCH',
            body: JSON.stringify({ preferredLanguage: code }),
          });
          setProfile(data.profile);
        } catch {
          // Offline tolerance
        }
      }
    },
    [apiFetch]
  );

  // Real-time WebSocket subscription with auto-reconnect
  useEffect(() => {
    if (!profile?.uid) return;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedIntentionally = false;

    const isStaff = roles.some((r) =>
      ['admin', 'content_editor', 'support_agent'].includes(r)
    );

    const connect = () => {
      if (closedIntentionally) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${window.location.host}/ws`);

      ws.onopen = () => {
        ws?.send(
          JSON.stringify({
            type: 'subscribe',
            userUid: profile.uid,
            isAdminOrAgent: isStaff,
          })
        );
      };

      ws.onmessage = (e) => {
        try {
          const parsed = JSON.parse(String(e.data));
          if (parsed?.type && parsed.type !== 'subscribed') {
            for (const l of listenersRef.current) {
              l.cb({ type: parsed.type, payload: parsed.payload });
            }
          }
        } catch {
          // Ignore malformed WS message
        }
      };

      ws.onclose = () => {
        if (!closedIntentionally) {
          reconnectTimer = setTimeout(connect, 4000);
        }
      };
    };

    connect();

    return () => {
      closedIntentionally = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        if (ws.readyState === WebSocket.CONNECTING) {
          const pendingWs = ws;
          pendingWs.onopen = () => pendingWs.close();
          pendingWs.onerror = () => {};
        } else if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }
    };
  }, [profile?.uid, roles]);

  const subscribeRealtime = useCallback(
    (cb: (event: { type: string; payload: any }) => void) => {
      const id = `${Date.now()}_${Math.random()}`;
      listenersRef.current.push({ id, cb });
      return () => {
        listenersRef.current = listenersRef.current.filter((x) => x.id !== id);
      };
    },
    []
  );

  const t = useCallback(
    (key: string): string => {
      return uiStrings[key] || DEFAULT_UI_STRINGS[key] || key;
    },
    [uiStrings]
  );

  const tStatus = useCallback(
    (rawStatus: string): string => {
      if (!rawStatus) return '';
      const norm = rawStatus.trim().toLowerCase().replace(/\s+/g, '_');
      const key = `status_val.${norm}`;
      const translated = uiStrings[key] || BUNDLED_TRANSLATIONS[langCode]?.[key];
      if (translated) return translated;
      return DEFAULT_UI_STRINGS[key] || rawStatus.replace(/_/g, ' ');
    },
    [uiStrings, langCode]
  );

  const formatDate = useCallback(
    (dateInput: string | Date): string => {
      const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
      if (isNaN(d.getTime())) return String(dateInput);
      try {
        return new Intl.DateTimeFormat(currentLanguage.localeCode || 'en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(d);
      } catch {
        return d.toLocaleDateString();
      }
    },
    [currentLanguage.localeCode]
  );

  const formatNumber = useCallback(
    (num: number): string => {
      try {
        return new Intl.NumberFormat(currentLanguage.localeCode || 'en-IN').format(num);
      } catch {
        return String(num);
      }
    },
    [currentLanguage.localeCode]
  );

  const formatCurrency = useCallback(
    (amountInr: number): string => {
      try {
        return new Intl.NumberFormat(currentLanguage.localeCode || 'en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 0,
        }).format(amountInr);
      } catch {
        return `₹${amountInr}`;
      }
    },
    [currentLanguage.localeCode]
  );

  const isAdminOrStaff = useMemo(
    () => roles.some((r) => ['admin', 'content_editor', 'support_agent'].includes(r)),
    [roles]
  );

  const value: AppContextValue = {
    languages,
    currentLanguage,
    suggestedDeviceLangCode,
    hasChosenLanguage,
    selectLanguage,
    t,
    tStatus,
    formatDate,
    formatNumber,
    formatCurrency,
    authToken,
    profile,
    roles,
    isAuthReady,
    isAdminOrStaff,
    signInWithGooglePopup,
    completeOtpOrGuestSession,
    logout,
    refreshProfile,
    updatePreferences,
    apiFetch,
    services,
    refreshServices,
    refreshLanguages,
    network,
    subscribeRealtime,
    accentPalette,
    setAccentPalette,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
