import React, { createContext, useState, useEffect, useCallback, useRef, useContext } from "react";
import { AppState, AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LoyaltyProgram } from "../lib/loyaltyPrograms";
import { API_URL } from "../lib/constants";

const CACHE_KEY = "loyalty_programs_cache";
const VERSION_KEY = "loyalty_programs_version";

async function fetchVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/loyalty-programs/version`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.updated_at ?? null;
  } catch {
    return null;
  }
}

async function fetchPrograms(): Promise<LoyaltyProgram[]> {
  const res = await fetch(`${API_URL}/loyalty-programs`);
  if (!res.ok) throw new Error(`Failed to fetch loyalty programs: ${res.status}`);
  const data = await res.json();
  return data.programs as LoyaltyProgram[];
}

interface LoyaltyProgramsContextValue {
  programs: LoyaltyProgram[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const LoyaltyProgramsContext = createContext<LoyaltyProgramsContextValue>({
  programs: [],
  loading: true,
  refresh: async () => {},
});

export function LoyaltyProgramsProvider({ children }: { children: React.ReactNode }) {
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  const load = useCallback(async (force = false) => {
    try {
      // Serve from cache immediately for instant startup
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached && !force) {
        try {
          setPrograms(JSON.parse(cached));
        } catch {}
      }

      // Version check against server
      const serverVersion = await fetchVersion();
      const cachedVersion = await AsyncStorage.getItem(VERSION_KEY);

      if (!serverVersion) {
        // Offline — use cached data as-is
        if (!cached) setPrograms([]);
        setLoading(false);
        return;
      }

      if (!force && cachedVersion === serverVersion && cached) {
        // Cache is current — nothing to do
        setLoading(false);
        return;
      }

      // Fetch fresh list
      const fresh = await fetchPrograms();
      setPrograms(fresh);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
      if (serverVersion) {
        await AsyncStorage.setItem(VERSION_KEY, serverVersion);
      }
    } catch (e) {
      console.warn("LoyaltyProgramsProvider: failed to load programs", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      load();
    }
  }, [load]);

  // Re-check version whenever app comes back to foreground
  // This handles silent pushes that arrive while backgrounded (iOS doesn't
  // fire the JS notification listener for content-available-only pushes)
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") {
        load();
      }
    });
    return () => sub.remove();
  }, [load]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await load(true);
  }, [load]);

  return (
    <LoyaltyProgramsContext.Provider value={{ programs, loading, refresh }}>
      {children}
    </LoyaltyProgramsContext.Provider>
  );
}

export function useLoyaltyProgramsContext(): LoyaltyProgramsContextValue {
  return useContext(LoyaltyProgramsContext);
}
