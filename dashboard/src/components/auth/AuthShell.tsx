import type { ReactNode } from "react";
import InstrumentMark from "../InstrumentMark";

/**
 * Page frame shared by sign-in and password reset. Anchored near the top
 * rather than vertically centred: with centring, every error or notice that
 * mounted re-centred the whole card and the header jumped 40-90px.
 */
export default function AuthShell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="min-h-screen bg-panel-950 px-4 pb-12 pt-[12vh] sm:pt-[16vh]">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <InstrumentMark size={48} />
          <p className="whitespace-nowrap text-lg font-semibold uppercase tracking-wider text-panel-200 sm:text-xl sm:tracking-wide">
            Fermentation Monitor
          </p>
        </div>
        {children}
        {footer && <div className="mt-4 text-center text-sm text-panel-400">{footer}</div>}
      </div>
    </main>
  );
}
