export interface Device {
  id: string;
  user_id: string;
  name: string;
  temp_min_c: number;
  temp_max_c: number;
  consecutive_breach_limit: number;
  sleep_interval_seconds: number;
  last_seen_at: string | null;
  created_at: string;
}

export interface Reading {
  id: number;
  device_id: string;
  temperature_c: number;
  battery_v: number | null;
  created_at: string;
}

export interface Alert {
  id: number;
  device_id: string;
  temperature_c: number;
  reason: string;
  created_at: string;
  acknowledged: boolean;
}
