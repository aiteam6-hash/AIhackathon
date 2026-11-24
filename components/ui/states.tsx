import Link from "next/link";
import { RefreshCw, TriangleAlert } from "lucide-react";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function SkeletonRows({ rows = 5, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-label={label} className="space-y-0">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="py-5 border-b border-rule grid gap-3">
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonBlock({ className = "h-40" }: { className?: string }) {
  return <div role="status" aria-label="Loading"><span className="sr-only">Loading…</span><Skeleton className={`w-full ${className}`} /></div>;
}

interface EmptyProps {
  title: string;
  body: string;
  action?: { label: string; href?: string; onClick?: () => void };
}
export function EmptyState({ title, body, action }: EmptyProps) {
  return (
    <div className="border-t border-b border-rule py-14 max-w-xl">
      <h3 className="text-2xl">{title}</h3>
      <p className="text-muted mt-2 max-w-md">{body}</p>
      {action && (action.href
        ? <Link href={action.href} className="btn btn-primary mt-5">{action.label}</Link>
        : <button onClick={action.onClick} className="btn btn-primary mt-5">{action.label}</button>)}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="border border-ink p-6 max-w-xl">
      <p className="flex items-center gap-2 font-semibold"><TriangleAlert size={16} aria-hidden /> This did not load</p>
      <p className="text-muted mt-1 text-sm">{message}</p>
      {onRetry && <button onClick={onRetry} className="btn btn-sm mt-4"><RefreshCw size={14} aria-hidden /> Try again</button>}
    </div>
  );
}
