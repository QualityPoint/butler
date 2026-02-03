# Error Handling System Documentation

## 📚 Overview

Butler uses a comprehensive error handling system built on top of **Sonner** toast notifications and **frappe-react-sdk** error responses. This system provides a DRY (Don't Repeat Yourself) approach to handling errors throughout the application.

---

## ⚡ Quick Start

**Import everything from one place:**
```typescript
import { 
  showSuccess, 
  showFrappeError,
  ErrorBanner,
  handleCreate,
  handleUpdate 
} from '@/lib/errors';
```

**Pattern Cheat Sheet:**

| Operation | Use | Example |
|-----------|-----|---------|
| **GET Document** | `ErrorBanner` | `if (error) return <ErrorBanner error={error} />` |
| **CREATE** | `handleCreate` + Toast | `await handleCreate(() => createDoc(...), 'Type')` |
| **UPDATE** | `handleUpdate` + Toast | `await handleUpdate(() => updateDoc(...), 'Type')` |
| **DELETE** | `handleDelete` + Toast | `await handleDelete(() => deleteDoc(...), 'Type')` |

---

## 🏗️ Architecture

```
frontend/src/
├── lib/
│   ├── errorHandler.ts          # Core error handling utilities
│   └── errors.ts                # Central export point
├── components/
│   └── ui/
│       ├── sonner.tsx            # Toast notification component
│       └── error-banner.tsx     # Error banner components
└── examples/
    └── error-handling-patterns.tsx  # 10+ complete examples
```

---

## 🚀 Usage Examples

### 1. Simple Import Pattern

```typescript
// Import from central location
import { 
  showSuccess, 
  showFrappeError,
  ErrorBanner,
  handleCreate 
} from '@/lib/errors';
```

### 2. Display Toast on Success

```typescript
const { createDoc } = useFrappeCreateDoc();

const handleCreate = async (data) => {
  try {
    await createDoc('Butler Service', data);
    showSuccess('Service created! 🎉');
  } catch (error) {
    showFrappeError(error);
  }
};
```

### 3. Show Banner on Load Error

```typescript
const { data, error } = useFrappeGetDoc('Butler Service', id);

if (error) return <ErrorBanner error={error} />;
return <div>{data?.name}</div>;
```

### 4. One-Line CRUD Helpers

```typescript
// Create
await handleCreate(() => createDoc('Butler Service', data), 'Service');

// Update  
await handleUpdate(() => updateDoc('Butler Service', id, data), 'Service');

// Delete
await handleDelete(() => deleteDoc('Butler Service', id), 'Service');
```

---

## 🎯 When to Use What

### Toast Notifications (Recommended)
✅ **Use for:**
- Creating documents
- Updating documents
- Deleting documents
- API calls that modify data
- Success confirmations
- Warnings and info messages

### Error Banners
✅ **Use for:**
- Failed to load page data
- Failed to load list data
- Persistent errors that need attention
- Multiple error sources on one page

---

## 📖 Detailed Guide

### Import Options

```typescript
// Option 1: Import from central location (recommended)
import { showSuccess, ErrorBanner, handleCreate } from '@/lib/errors';

// Option 2: Import individually (if needed)
import { showSuccess, handleUpdate } from '@/lib/errorHandler';
import { ErrorBanner } from '@/components/ui/error-banner';

// frappe-react-sdk hooks (from npm package)
import {
  useFrappeGetDoc,
  useFrappeGetDocList,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
  useFrappePostCall,
} from "frappe-react-sdk";
```

### Common Patterns
  useFrappeGetDocList,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
  useFrappePostCall,
} from "frappe-react-sdk";
```

### Common Patterns

**Pattern 1: GET with Error Banner**
```typescript
function ServiceDetail({ id }: { id: string }) {
  const { data, error, isLoading } = useFrappeGetDoc('Butler Service', id);

  if (error) return <ErrorBanner error={error} />;
  if (isLoading) return <div>Loading...</div>;

  return <div>{data?.name}</div>;
}
```

**Pattern 2: Create with Toast**
```typescript
function CreateService() {
  const { createDoc, loading } = useFrappeCreateDoc();

  const handleSubmit = async (formData: any) => {
    await handleCreate(
      () => createDoc('Butler Service', formData),
      'Service'
    );
  };

  return <Button onClick={handleSubmit} disabled={loading}>Create</Button>;
}
```

**Pattern 3: Update with Toast**
```typescript
function EditService({ id, data }: any) {
  const { updateDoc, loading } = useFrappeUpdateDoc();

  const handleSave = async () => {
    await handleUpdate(
      () => updateDoc('Butler Service', id, data),
      'Service'
    );
  };

  return <Button onClick={handleSave} disabled={loading}>Save</Button>;
}
```

---

## 📖 API Reference

### Toast Functions

#### `showSuccess(message, duration?)`
Display a success toast notification.

```typescript
showSuccess("Service saved successfully!");
showSuccess("Processing complete!", 5000);
```

#### `showFrappeError(error, duration?)`
Display Frappe error as toast (automatically extracts message).

```typescript
try {
  await someOperation();
} catch (error) {
  showFrappeError(error);
}
```

#### `showWarning(message, duration?)`
Display a warning toast.

```typescript
showWarning("Please select at least one item");
```

#### `showInfo(message, duration?)`
Display an info toast.

```typescript
showInfo("Processing your request...");
```

---

### Helper Functions

#### `handleAsyncOperation(operation, options?)`
Wrapper for async operations with automatic error handling.

```typescript
const result = await handleAsyncOperation(
  () => updateDoc('Butler Service', id, data),
  {
    successMessage: 'Service updated!',
    errorMessage: 'Failed to update service',
    showSuccess: true,
    showError: true,
    onSuccess: (result) => console.log(result),
    onError: (error) => console.error(error),
  }
);

// Returns: { success: boolean; data?: T; error?: any }
```

#### `handleUpdate(updateFn, docType, options?)`
Specialized helper for update operations.

```typescript
const success = await handleUpdate(
  () => updateDoc('Butler Service', 'SRV-001', { status: 'Active' }),
  'Service',
  {
    successMessage: 'Status updated!',
    fieldCount: 1
  }
);
```

#### `handleCreate(createFn, docType, options?)`
Specialized helper for create operations.

```typescript
const success = await handleCreate(
  () => createDoc('Butler Service', formData),
  'Service',
  { successMessage: 'Service created successfully!' }
);
```

#### `handleDelete(deleteFn, docType, options?)`
Specialized helper for delete operations.

```typescript
const success = await handleDelete(
  () => deleteDoc('Butler Service', 'SRV-001'),
  'Service'
);
```

---

### Error Banner Components

#### `<ErrorBanner />`
Full-featured error banner with dismiss option.

```typescript
<ErrorBanner 
  error={error} 
  title="Failed to load services"
  onDismiss={() => setError(null)}
  className="mb-4"
/>
```

#### `<ErrorMessage />`
Compact inline error message.

```typescript
<ErrorMessage error={error} className="my-2" />
```

---

## 💡 Common Patterns

### Multiple Operations
```typescript
async function processMultipleItems(items: string[]) {
  let successCount = 0;
  
  for (const item of items) {
    const result = await handleAsyncOperation(
      () => processItem(item),
      { showSuccess: false } // Don't toast each item
    );
    if (result.success) successCount++;
  }
  
  showSuccess(`Processed ${successCount} items!`);
}
```

### Form Validation
```typescript
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  
  // Client-side validation
  if (title.length < 3) {
    showWarning('Title must be at least 3 characters');
    return;
  }
  
  // Server operation
  await handleCreate(
    () => createDoc('Butler Service', { title }),
    'Service'
  );
}
```

### Complex Operations with Steps
```typescript
async function complexOperation() {
  try {
    showInfo('Step 1: Processing...');
    await step1();
    
    showInfo('Step 2: Validating...');
    await step2();
    
    showSuccess('Operation completed successfully!');
  } catch (error) {
    showFrappeError(error);
  }
}
```

---

## 🎨 Customization

### Toast Appearance
Edit `/src/components/ui/sonner.tsx` to customize:
- Position
- Icons
- Colors
- Animation
- Duration

### Error Banner Styling
Edit `/src/components/ui/error-banner.tsx` to customize:
- Border styles
- Colors
- Icons
- Layout

---

## 🔍 Error Message Extraction

The system automatically extracts clean error messages from Frappe errors:

**Input (Frappe Error):**
```
"Error Log mp012345: frappe.exceptions.ValidationError: Title is required"
```

**Output (Clean Message):**
```
"Title is required"
```

The extraction handles:
- ✅ Double-JSON encoding (`_server_messages`)
- ✅ Exception prefixes (`ValidationError:`, `PermissionError:`)
- ✅ Error log IDs (`Error Log mp012345:`)
- ✅ Module paths (`frappe.exceptions.`)
- ✅ Multiple nested prefixes

---

## 📝 Best Practices

### 1. Always Handle Errors
```typescript
// ❌ Bad
const { data } = useFrappeGetDoc('Doc', 'ID');

// ✅ Good
const { data, error, isLoading } = useFrappeGetDoc('Doc', 'ID');
if (error) return <ErrorBanner error={error} />;
```

### 2. Use Appropriate Feedback
```typescript
// ❌ Bad - Banner for mutation
<ErrorBanner error={createError} />

// ✅ Good - Toast for mutation
showFrappeError(createError);
```

### 3. Provide Context
```typescript
// ❌ Bad
showSuccess('Success!');

// ✅ Good
showSuccess('Service "Smart Lighting" created successfully!');
```

### 4. Don't Over-Toast
```typescript
// ❌ Bad - Toast every item in loop
items.forEach(item => {
  process(item);
  showSuccess('Done!'); // Too many toasts!
});

// ✅ Good - Single summary toast
const count = await processBatch(items);
showSuccess(`Processed ${count} items successfully!`);
```

---

## 🐛 Troubleshooting

### Toast Not Showing
- ✅ Check `<Toaster />` is added to `App.tsx`
- ✅ Verify import path is correct
- ✅ Check browser console for errors

### Error Not Displaying Correctly
- ✅ Use `console.log(error)` to inspect structure
- ✅ Verify error has `_server_messages` or `exception` field
- ✅ Check if error is actually a Frappe error

### Custom Error Messages Not Working
- ✅ Make sure you're using `errorMessage` option in `handleAsyncOperation`
- ✅ Or catch the error and call `toast.error()` directly

---

## 📚 Additional Resources

- [Sonner Documentation](https://sonner.emilkowal.ski/)
- [frappe-react-sdk Documentation](https://github.com/nikkothari22/frappe-react-sdk)
- [Error Handling Examples](/src/examples/error-handling-patterns.tsx)

---

## 🎓 Examples

See `/src/examples/error-handling-patterns.tsx` for 10+ complete examples covering:
1. GET with ErrorBanner
2. GET List with ErrorBanner
3. POST/Create with Toast
4. Update with Toast
5. Delete with Confirmation
6. API Call with Toast
7. Multiple Operations
8. Batch Operations
9. Form Validation
10. Multiple Error Sources

---

**Happy Coding! 🚀**
