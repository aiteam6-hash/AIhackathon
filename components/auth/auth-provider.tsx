"use client";
import { useEffect } from "react";
import { authService } from "@/lib/services/authService";
import { useRealAuth } from "@/lib/hooks/useSession";

/** Keeps the real Supabase session in sync with the UI. Mounted once in the root layout. */
export function AuthProvider() {
  useEffect(() => {
    let live = true;
    const refresh = async () => {
      try {
        const r = await authService.loadRealUser();
        if (live) useRealAuth.setState({ loaded: true, user: r.user, needsRole: r.needsRole });
      } catch {
        if (live) useRealAuth.setState({ loaded: true, user: null, needsRole: false });
      }
    };
    refresh();
    const off = authService.onAuthChange(refresh);
    return () => { live = false; off(); };
  }, []);
  return null;
}
