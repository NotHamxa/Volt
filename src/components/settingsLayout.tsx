import { ReactNode } from "react";

export function SectionLead({ children }: { children: ReactNode }) {
    return (
        <p className="text-[12px] text-tone-400 leading-relaxed">{children}</p>
    );
}

export function GroupLabel({ children, accent = "default" }: { children: ReactNode; accent?: "default" | "danger" }) {
    return (
        <div className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${
            accent === "danger" ? "text-red-400/55" : "text-tone-220"
        }`}>
            {children}
        </div>
    );
}

export function Toggle({ checked, onChange, ariaLabel }: { checked: boolean; onChange: () => void; ariaLabel?: string }) {
    return (
        <button
            onClick={onChange}
            role="switch"
            aria-checked={checked}
            aria-label={ariaLabel}
            className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none ${
                checked ? "bg-ink border-ink" : "bg-fill-100 border-line-100"
            }`}
        >
            <span
                className={`pointer-events-none inline-block h-2.5 w-2.5 transform rounded-full shadow transition duration-200 ease-in-out mt-[1px] ${
                    checked ? "translate-x-2.5 bg-surface" : "translate-x-0.5 bg-ink/40"
                }`}
            />
        </button>
    );
}
