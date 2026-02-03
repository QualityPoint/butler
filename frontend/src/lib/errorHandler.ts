import { toast } from "sonner";

/**
 * Frappe Error Response Structure
 * @interface FrappeError
 */
export interface FrappeError {
    _server_messages?: string;
    exception?: string;
    exc_type?: string;
    message?: string;
    httpStatus?: number;
    httpStatusText?: string;
}

/**
 * Extract error message from Frappe error response
 * Handles multiple error formats and fallbacks gracefully
 * 
 * @param error - Frappe error object or string
 * @returns Clean, user-friendly error message
 */
export function extractErrorMessage(error: any): string {
    // Handle string errors
    if (typeof error === "string") {
        return cleanErrorMessage(error);
    }

    // Handle null/undefined
    if (!error) {
        return "An unexpected error occurred";
    }

    // Priority 1: _server_messages (most specific)
    if (error._server_messages) {
        try {
            const messages = JSON.parse(error._server_messages);
            if (Array.isArray(messages) && messages.length > 0) {
                // Messages are double-JSON encoded
                const parsed = typeof messages[0] === "string"
                    ? JSON.parse(messages[0])
                    : messages[0];

                const message = parsed.message || parsed.toString();
                return cleanErrorMessage(message);
            }
        } catch (e) {
            // If parsing fails, return raw message
            return cleanErrorMessage(error._server_messages);
        }
    }

    // Priority 2: exception field (contains full exception with type)
    if (error.exception) {
        return cleanErrorMessage(error.exception);
    }

    // Priority 3: Generic message
    if (error.message) {
        return cleanErrorMessage(error.message);
    }

    // Priority 4: exc field (legacy)
    if (error.exc) {
        try {
            const exc = JSON.parse(error.exc);
            return cleanErrorMessage(Array.isArray(exc) ? exc.join("\n") : exc);
        } catch {
            return cleanErrorMessage(error.exc);
        }
    }

    return "An unexpected error occurred";
}

/**
 * Clean error message by removing technical prefixes
 * Removes patterns like "ValidationError: ", "Error Log ID: ", etc.
 * 
 * @param message - Raw error message
 * @returns Cleaned message without technical prefixes
 */
function cleanErrorMessage(message: string): string {
    if (!message) return message;

    let cleaned = message.trim();
    let previousCleaned = '';

    // Keep removing prefixes until no more colons are found
    // Handles nested prefixes like "Error Log mp012345: frappe.exceptions.ValidationError: Actual message"
    while (cleaned !== previousCleaned && cleaned.includes(':')) {
        previousCleaned = cleaned;
        const indexOfFirstColon = cleaned.indexOf(':');

        if (indexOfFirstColon !== -1) {
            const beforeColon = cleaned.slice(0, indexOfFirstColon).trim();
            const afterColon = cleaned.slice(indexOfFirstColon + 1).trim();

            // Check if the part before colon looks like an error type/prefix
            // (contains dots, is all caps, starts with "Error", etc.)
            const isErrorPrefix =
                beforeColon.includes('.') ||
                beforeColon === beforeColon.toUpperCase() ||
                beforeColon.toLowerCase().includes('error') ||
                beforeColon.toLowerCase().includes('log') ||
                /^[A-Z][a-zA-Z]*Error$/.test(beforeColon);

            if (isErrorPrefix && afterColon) {
                cleaned = afterColon;
            } else {
                // If it doesn't look like a prefix, keep the original
                break;
            }
        }
    }

    return cleaned;
}

/**
 * Show Frappe error as a toast notification
 * Auto-adjusts duration based on error type
 * 
 * @param error - Frappe error object
 * @param duration - Optional custom duration in milliseconds (default: 5000)
 */
export function showFrappeError(error: any, duration?: number) {
    const message = extractErrorMessage(error);

    // Longer duration for validation errors (users need time to read)
    const defaultDuration =
        error?.exc_type === "ValidationError" || error?.exc_type === "LinkExistsError"
            ? 5000
            : duration ?? 4000;

    toast.error(message, { duration: defaultDuration });
}

/**
 * Show success toast notification
 * 
 * @param message - Success message to display
 * @param duration - Optional duration in milliseconds (default: 3000)
 */
export function showSuccess(message: string, duration = 3000) {
    toast.success(message, { duration });
}

/**
 * Show info toast notification
 * 
 * @param message - Info message to display
 * @param duration - Optional duration in milliseconds (default: 3000)
 */
export function showInfo(message: string, duration = 3000) {
    toast.info(message, { duration });
}

/**
 * Show warning toast notification
 * 
 * @param message - Warning message to display
 * @param duration - Optional duration in milliseconds (default: 4000)
 */
export function showWarning(message: string, duration = 4000) {
    toast.warning(message, { duration });
}

/**
 * Wrapper for async operations with automatic error handling and success notifications
 * Implements DRY principle for common CRUD operations
 * 
 * @param operation - Async function to execute
 * @param options - Configuration options
 * @returns Promise<boolean> - true if successful, false if error
 * 
 * @example
 * ```typescript
 * const success = await handleAsyncOperation(
 *   () => updateDoc('Butler Service', id, data),
 *   {
 *     successMessage: 'Service updated successfully',
 *     errorMessage: 'Failed to update service',
 *     showSuccess: true
 *   }
 * );
 * ```
 */
export async function handleAsyncOperation<T = any>(
    operation: () => Promise<T>,
    options?: {
        successMessage?: string;
        errorMessage?: string;
        showSuccess?: boolean;
        showError?: boolean;
        onSuccess?: (result: T) => void;
        onError?: (error: any) => void;
    }
): Promise<{ success: boolean; data?: T; error?: any }> {
    const {
        successMessage,
        errorMessage,
        showSuccess: shouldShowSuccess = true,
        showError: shouldShowError = true,
        onSuccess,
        onError,
    } = options || {};

    try {
        const result = await operation();

        if (shouldShowSuccess && successMessage) {
            showSuccess(successMessage);
        }

        onSuccess?.(result);

        return { success: true, data: result };
    } catch (error: any) {
        console.error("Operation error:", error);

        if (shouldShowError) {
            if (errorMessage) {
                toast.error(errorMessage);
            } else {
                showFrappeError(error);
            }
        }

        onError?.(error);

        return { success: false, error };
    }
}

/**
 * Helper for update operations with standard messaging
 * 
 * @param updateFn - Update function to execute
 * @param docType - Document type being updated
 * @param options - Optional configuration
 * @returns Promise<boolean> - true if successful
 * 
 * @example
 * ```typescript
 * await handleUpdate(
 *   () => updateDoc('Butler Service', 'SRV-001', { status: 'Active' }),
 *   'Service'
 * );
 * ```
 */
export async function handleUpdate(
    updateFn: () => Promise<any>,
    docType: string,
    options?: {
        successMessage?: string;
        fieldCount?: number;
    }
): Promise<boolean> {
    const { successMessage, fieldCount } = options || {};

    const message = successMessage ||
        (fieldCount ? `Updated ${fieldCount} field(s) successfully` : `${docType} updated successfully`);

    const result = await handleAsyncOperation(updateFn, {
        successMessage: message,
    });

    return result.success;
}

/**
 * Helper for create operations with standard messaging
 * 
 * @param createFn - Create function to execute
 * @param docType - Document type being created
 * @param options - Optional configuration
 * @returns Promise<boolean> - true if successful
 */
export async function handleCreate(
    createFn: () => Promise<any>,
    docType: string,
    options?: {
        successMessage?: string;
    }
): Promise<boolean> {
    const { successMessage } = options || {};

    const message = successMessage || `${docType} created successfully`;

    const result = await handleAsyncOperation(createFn, {
        successMessage: message,
    });

    return result.success;
}

/**
 * Helper for delete operations with standard messaging
 * 
 * @param deleteFn - Delete function to execute
 * @param docType - Document type being deleted
 * @param options - Optional configuration
 * @returns Promise<boolean> - true if successful
 */
export async function handleDelete(
    deleteFn: () => Promise<any>,
    docType: string,
    options?: {
        successMessage?: string;
    }
): Promise<boolean> {
    const { successMessage } = options || {};

    const message = successMessage || `${docType} deleted successfully`;

    const result = await handleAsyncOperation(deleteFn, {
        successMessage: message,
    });

    return result.success;
}
