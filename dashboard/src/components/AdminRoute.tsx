import { Navigate } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * Nest inside ProtectedRoute, not standalone -- this only checks admin
 * status, not whether there's a session at all (ProtectedRoute already
 * redirects to /login before this ever mounts).
 */
export default function AdminRoute({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("is_admin").then(({ data }) => {
      if (!cancelled) setIsAdmin(Boolean(data));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (isAdmin === null) {
    return <div className="p-8 text-panel-400">Loading…</div>;
  }

  if (!isAdmin) {
    return <Navigate to="/devices" replace />;
  }

  return <>{children}</>;
}
