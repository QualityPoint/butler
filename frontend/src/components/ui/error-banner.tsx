import { useMemo } from "react";
import { AlertCircle } from "lucide-react";
import type { FrappeError } from "@/lib/errorHandler";
import { extractErrorMessage } from "@/lib/errorHandler";

interface ErrorBannerProps {
  error?: FrappeError | null;
  title?: string;
  className?: string;
  onDismiss?: () => void;
}

interface ParsedErrorMessage {
  message: string;
  title?: string;
  indicator?: string;
}

/**
 * Extract user-friendly error message from Frappe error
 */
function getErrorMessage(error?: FrappeError | null): string {
  if (!error) return "";
  return extractErrorMessage(error);
}

/**
 * Parse server messages into structured format
 */
function getErrorMessages(error?: FrappeError | null): ParsedErrorMessage[] {
  if (!error) return [];
  
  let messages: ParsedErrorMessage[] = [];
  
  // Try parsing _server_messages
  if (error._server_messages) {
    try {
      const parsed = JSON.parse(error._server_messages);
      messages = parsed.map((m: any) => {
        try {
          return typeof m === "string" ? JSON.parse(m) : m;
        } catch {
          return { message: m };
        }
      });
    } catch {
      // Ignore parsing errors
    }
  }
  
  // Fallback to exception
  if (messages.length === 0 && error.exception) {
    const indexOfFirstColon = error.exception.indexOf(":");
    if (indexOfFirstColon !== -1) {
      const message = error.exception.slice(indexOfFirstColon + 1).trim();
      messages = [{ message, title: "Error" }];
    }
  }
  
  // Final fallback to generic message
  if (messages.length === 0) {
    messages = [{
      message: error.message || "An error occurred",
      title: "Error",
      indicator: "red",
    }];
  }
  
  return messages;
}

/**
 * ErrorBanner Component
 * Displays server-side error messages in a visible banner
 * 
 * Use this for page-level or section-level errors where the user needs
 * to see the error persistently (e.g., failed to load data).
 * 
 * For operation errors (save, delete), prefer using toast notifications.
 * 
 * @example
 * ```tsx
 * const { data, error } = useFrappeGetDoc('Butler Service', id);
 * 
 * if (error) return <ErrorBanner error={error} />;
 * ```
 */
export function ErrorBanner({ 
  error, 
  title = "Error",
  className = "",
  onDismiss 
}: ErrorBannerProps) {
  const errorMessage = useMemo(() => getErrorMessage(error), [error]);
  const errorMessages = useMemo(() => getErrorMessages(error), [error]);
  
  if (!error) return null;
  
  return (
    <div 
      className={`rounded-lg border border-red-200 bg-red-50 p-4 ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="size-5 text-red-600 mt-0.5 shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-900 mb-1">
            {title}
          </h3>
          <div className="text-sm text-red-800">
            {errorMessages.length > 1 ? (
              <ul className="list-disc list-inside space-y-1">
                {errorMessages.map((msg, idx) => (
                  <li key={idx}>{msg.message}</li>
                ))}
              </ul>
            ) : (
              <p>{errorMessage}</p>
            )}
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-red-600 hover:text-red-800 transition-colors"
            aria-label="Dismiss error"
          >
            <svg
              className="size-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Compact version of ErrorBanner for inline display
 */
export function ErrorMessage({ 
  error, 
  className = "" 
}: { 
  error?: FrappeError | null; 
  className?: string;
}) {
  const errorMessage = useMemo(() => getErrorMessage(error), [error]);
  
  if (!error) return null;
  
  return (
    <div className={`flex items-center gap-2 text-sm text-red-600 ${className}`}>
      <AlertCircle className="size-4 shrink-0" />
      <span>{errorMessage}</span>
    </div>
  );
}
