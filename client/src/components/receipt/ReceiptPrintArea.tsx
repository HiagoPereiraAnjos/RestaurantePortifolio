import { cn } from "@/lib/utils";

/**
 * In-page print area.
 * Rendered in the DOM to avoid popup blockers.
 * Visible only in print mode.
 */
export function ReceiptPrintArea({
  title,
  text,
  className,
}: {
  title?: string;
  text: string;
  className?: string;
}) {
  return (
    <div id="print-receipt" className={cn("hidden print:block print:p-3", className)}>
      {title ? <h1 className="font-mono text-sm mb-2">{title}</h1> : null}
      <pre className="font-mono text-xs whitespace-pre-wrap leading-tight">{text}</pre>
    </div>
  );
}
