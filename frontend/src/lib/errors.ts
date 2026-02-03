/**
 * Central export for all error handling utilities
 * Use this for cleaner imports throughout your app
 * 
 * @example
 * ```typescript
 * // Instead of multiple imports:
 * import { showSuccess } from '@/lib/errorHandler';
 * import { ErrorBanner } from '@/components/ui/error-banner';
 * 
 * // Use single import:
 * import { showSuccess, ErrorBanner } from '@/lib/errors';
 * ```
 */

// Re-export all error handler functions
export {
    type FrappeError,
    extractErrorMessage,
    showFrappeError,
    showSuccess,
    showInfo,
    showWarning,
    handleAsyncOperation,
    handleUpdate,
    handleCreate,
    handleDelete,
} from "./errorHandler";

// Re-export error UI components
export { ErrorBanner, ErrorMessage } from "@/components/ui/error-banner";

// Re-export Toaster component
export { Toaster } from "@/components/ui/sonner";
