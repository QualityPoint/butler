# Butler Quick Reference

Quick reference card for common Butler frontend operations.

## 🚀 Error Handling

```typescript
// Import
import { showSuccess, ErrorBanner, handleCreate } from '@/lib/errors';

// Toast notifications
showSuccess('Operation completed!');
showFrappeError(error);
showWarning('Check your input');
showInfo('Processing...');

// Error banners
if (error) return <ErrorBanner error={error} />;
{error && <ErrorMessage error={error} />}

// CRUD helpers (one-liner)
await handleCreate(() => createDoc('DocType', data), 'DocType');
await handleUpdate(() => updateDoc('DocType', id, data), 'DocType');
await handleDelete(() => deleteDoc('DocType', id), 'DocType');
```

[Full Error Handling Guide →](ERROR_HANDLING.md)

---

## 🔌 Frappe Integration

```typescript
// Import hooks
import {
  useFrappeGetDoc,
  useFrappeGetDocList,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappePostCall,
} from 'frappe-react-sdk';

// GET document
const { data, error, isLoading } = useFrappeGetDoc('DocType', 'doc-id');

// GET list
const { data, error } = useFrappeGetDocList('DocType', {
  fields: ['name', 'title'],
  filters: [['status', '=', 'Active']],
  limit: 100,
});

// CREATE
const { createDoc, loading, error } = useFrappeCreateDoc();
await createDoc('DocType', { field: 'value' });

// UPDATE
const { updateDoc, loading } = useFrappeUpdateDoc();
await updateDoc('DocType', 'doc-id', { field: 'new-value' });

// POST (custom method)
const { call, loading, error } = useFrappePostCall('app.api.method');
await call({ param: 'value' });
```

[Full Frappe Integration Guide →](FRAPPE_INTEGRATION.md)

---

## 🎨 RetroUI Components

```bash
# Install new component
npx shadcn@latest add 'https://retroui.dev/r/badge.json'
```

```typescript
// Import and use
import { Button } from '@/components/retroui/Button';

<Button>Primary</Button>
<Button variant="outline">Outline</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="destructive">Delete</Button>
```

**Available Components**: Button, Badge, Avatar, Card, Dialog, Input, Alert, and more.

[Full RetroUI Guide →](RETROUI_SETUP.md)

---

## 📁 Project Structure

```
src/
├── lib/
│   ├── errorHandler.ts    # Error utilities
│   ├── errors.ts           # Central exports
│   └── utils.ts            # Other utilities
├── components/
│   ├── ui/                 # Reusable UI
│   ├── auth/               # Auth components
│   ├── retroui/            # RetroUI components
│   └── service/            # Feature components
├── pages/
│   ├── Home.tsx
│   ├── Service.tsx
│   └── auth/
├── contexts/
│   └── UserContext.tsx
└── examples/
    └── error-handling-patterns.tsx
```

---

## 🔑 Common Patterns

### Protected Route
```typescript
<Route path="/" element={<ProtectedRoute />}>
  <Route index element={<Home />} />
  <Route path="service" element={<Service />} />
</Route>
```

### User Context
```typescript
import { useUser } from '@/contexts/UserContext';

const { currentUser, isLoading, logout } = useUser();
```

### Form with Validation
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  if (!isValid) {
    showWarning('Please check your input');
    return;
  }
  
  await handleCreate(
    () => createDoc('DocType', formData),
    'DocType'
  );
};
```

---

## 🛠️ Development

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Lint code
npm run lint
```

**Dev Server**: http://localhost:8080  
**API Proxy**: Auto-proxies to Frappe backend  
**Build Output**: `../butler/public/frontend/`

---

## 📚 More Resources

- [Error Handling Guide](ERROR_HANDLING.md) - Complete error handling system
- [Frappe Integration](FRAPPE_INTEGRATION.md) - Backend integration details
- [Frappe React Guide](FRAPPE_REACT_INTEGRATION_GUIDE.md) - Step-by-step guide
- [RetroUI Setup](RETROUI_SETUP.md) - Design system docs
- [Code Examples](../src/examples/) - Working code examples

---

**Need help?** Check the [docs README](README.md) for a complete guide index.
