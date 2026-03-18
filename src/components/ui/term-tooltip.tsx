"use client";

import { useState, useRef } from "react";
import { HelpCircle } from "lucide-react";

interface LearnMoreLink {
  label: string;
  url: string;
}

interface TermTooltipProps {
  term: string;
  explanation: string;
  learnMore?: LearnMoreLink[];
  children?: React.ReactNode;
}

export function TermTooltip({ term, explanation, learnMore, children }: TermTooltipProps) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  };

  const hide = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <span className="relative inline-flex items-center gap-1">
      {children ?? <span>{term}</span>}
      <button
        type="button"
        className="text-muted-foreground hover:text-blue-400 transition-colors flex-shrink-0"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-label={`了解更多：${term}`}
      >
        <HelpCircle className="h-3 w-3" />
      </button>
      {open && (
        <div
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-popover text-popover-foreground border border-border rounded-lg shadow-xl p-3 text-sm"
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border" />
          <p className="font-semibold text-foreground mb-1">{term}</p>
          <p className="text-muted-foreground text-xs leading-relaxed">{explanation}</p>
          {learnMore && learnMore.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border space-y-1">
              <p className="text-xs text-muted-foreground font-medium">延伸閱讀</p>
              {learnMore.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-blue-400 hover:text-blue-300 hover:underline truncate"
                >
                  📖 {link.label}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
