import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import type { Device } from "../types/database";

/**
 * Shared device-fetch logic for any page keyed by :deviceId (detail, settings).
 * Distinguishes "genuinely not found" from "fetch failed" the same way in
 * both places -- duplicating this by hand across pages is exactly the kind
 * of thing that drifts back into the silent-failure bug a later fix would
 * only catch on one of the two copies.
 */
export function useDevice(deviceId: string | undefined) {
  const [device, setDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    setNotFound(false);
    setLoadError(null);

    const { data, error } = await supabase.from("devices").select("*").eq("id", deviceId).single();

    // PGRST116 ("no rows") from .single() means genuinely not found -- no
    // such device, or RLS makes it invisible, same thing from here. Any
    // other error is a real fetch failure and must not be told as "not
    // found": that reads as "not your device" and sends the owner away from
    // a device that's actually still theirs.
    if (error && error.code !== "PGRST116") {
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    if (error || !data) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setDevice(data as Device);
    setLoading(false);
  }, [deviceId]);

  useEffect(() => {
    load();
  }, [load]);

  return { device, setDevice, loading, notFound, loadError, reload: load };
}
