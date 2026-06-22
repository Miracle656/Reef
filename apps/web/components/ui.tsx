import { forwardRef } from "react";
import { cn } from "@/lib/utils";

// ---- Button ----------------------------------------------------------------

type ButtonVariant = "primary" | "accent" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "lift bg-ink text-on-ink shadow-[var(--shadow-glass)]",
  accent: "lift bg-accent text-on-accent shadow-[var(--shadow-glass)]",
  outline: "lift bg-surface-glass backdrop-blur-xl border border-[color:var(--glass-border)] text-ink shadow-[var(--shadow-glass)]",
  danger: "lift bg-danger text-white shadow-[var(--shadow-glass)]",
  ghost: "text-ink hover:bg-surface-muted transition-colors",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-14 px-7 text-base",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold select-none disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";

// ---- Card (frosted glass) --------------------------------------------------

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass", className)} {...props} />;
}

// ---- Input / Textarea ------------------------------------------------------

const fieldBase =
  "w-full rounded-2xl bg-surface-glass backdrop-blur-xl border border-[color:var(--glass-border)] px-4 text-[15px] " +
  "placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)] transition";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn("h-11", fieldBase, className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn("py-3 resize-none", fieldBase, className)} {...props} />,
);
Textarea.displayName = "Textarea";

// ---- Avatar (circle) -------------------------------------------------------

export function Avatar({ src, name, size = 44 }: { src?: string | null; name: string; size?: number }) {
  const initials = name.replace(/^@/, "").slice(0, 2).toUpperCase();
  return (
    <span
      className="inline-grid place-items-center overflow-hidden rounded-full border border-[color:var(--glass-border)] bg-surface-muted font-bold text-ink shadow-[var(--shadow-glass)]"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}

// ---- Spinner / Badge -------------------------------------------------------

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)}
      aria-label="loading"
    />
  );
}

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-surface-glass backdrop-blur-xl border border-[color:var(--glass-border)] px-3 py-1 text-xs font-medium",
        className,
      )}
      {...props}
    />
  );
}
