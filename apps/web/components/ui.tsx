import { forwardRef } from "react";
import { cn } from "@/lib/utils";

// ---- Button ----------------------------------------------------------------

type ButtonVariant = "primary" | "accent" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "neo neo-press bg-ink text-on-ink",
  accent: "neo neo-press bg-accent text-on-accent",
  outline: "neo neo-press bg-surface text-ink",
  danger: "neo neo-press bg-danger text-white",
  ghost: "bg-transparent text-ink hover:bg-surface-muted rounded-md transition-colors",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
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
        "inline-flex items-center justify-center gap-2 font-semibold disabled:opacity-50 disabled:pointer-events-none select-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";

// ---- Card ------------------------------------------------------------------

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("neo bg-surface", className)} {...props} />;
}

// ---- Input / Textarea ------------------------------------------------------

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-md border-2 border-border-strong bg-surface px-3 text-sm",
        "placeholder:text-ink-faint focus:outline-none focus:shadow-[var(--shadow-neo-sm)] transition-shadow",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-md border-2 border-border-strong bg-surface px-3 py-2 text-sm resize-none",
        "placeholder:text-ink-faint focus:outline-none focus:shadow-[var(--shadow-neo-sm)] transition-shadow",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

// ---- Avatar ----------------------------------------------------------------

export function Avatar({ src, name, size = 40 }: { src?: string | null; name: string; size?: number }) {
  const initials = name.replace(/^@/, "").slice(0, 2).toUpperCase();
  return (
    <span
      className="inline-grid place-items-center overflow-hidden rounded-md border-2 border-border-strong bg-surface-muted font-bold text-ink"
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
      className={cn("inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink border-t-transparent", className)}
      aria-label="loading"
    />
  );
}

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border-strong bg-surface px-2 py-0.5 text-xs font-medium",
        className,
      )}
      {...props}
    />
  );
}
