import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { loadTempUnit, saveTempUnit, type TempUnit } from "./units";

interface TempUnitContextValue {
  unit: TempUnit;
  toggle: () => void;
}

const TempUnitContext = createContext<TempUnitContextValue>({ unit: "C", toggle: () => {} });

// Mirrors lib/auth.tsx's provider shape. One instance at the app root means
// toggling on the devices list and toggling on a device detail page stay in
// sync -- there's one unit preference, not one per page.
export function TempUnitProvider({ children }: { children: ReactNode }) {
  const [unit, setUnit] = useState<TempUnit>(() => loadTempUnit());

  const toggle = useCallback(() => {
    setUnit((prev) => {
      const next = prev === "C" ? "F" : "C";
      saveTempUnit(next);
      return next;
    });
  }, []);

  return <TempUnitContext.Provider value={{ unit, toggle }}>{children}</TempUnitContext.Provider>;
}

export function useTempUnit() {
  return useContext(TempUnitContext);
}
