# Butler Frontend - Frappe Integration

This document describes how the Butler frontend is connected to the Frappe server, including authentication, routing, and API integration.

## Architecture Overview

The Butler app uses **frappe-react-sdk** to communicate with the Frappe backend:

- **Frontend**: React 19 + TypeScript + Vite SPA (`/frontend/`)
- **Backend**: Python-based Frappe app (`/butler/`)
- **Build Output**: Compiled to `/butler/public/frontend/`
- **Development**: Vite dev server on port 8080 with proxy to Frappe
- **Production**: Served at `/butler` route in Frappe

## Key Components

### 1. Backend Configuration

#### API Endpoints (`butler/api/`)

**`__init__.py`** - Common API functions:

```python
@frappe.whitelist()
def sort_options(doctype):
    """Get sort options for a doctype"""
    meta = frappe.get_meta(doctype)
    return [{"label": df.label, "value": df.fieldname}
            for df in meta.fields if df.in_list_view]

@frappe.whitelist()
def get_list_fields(doctype):
    """Get list view fields for a doctype"""
    meta = frappe.get_meta(doctype)
    return [df.fieldname for df in meta.fields if df.in_list_view]
```

**`permission.py`** - Permission checks:

```python
@frappe.whitelist()
def has_app_permission():
    """Check if user has permission to access Butler app"""
    user_roles = frappe.get_roles()
    if "Administrator" in user_roles or "System Manager" in user_roles:
        return True
    if "Butler User" in user_roles:
        return frappe.has_permission("Butler", throw=False)
    return False
```

#### Context Provider (`butler/www/butler.py`)

Provides boot data to the React app:

```python
def get_context(context):
    """Return context for the butler page"""
    context.update(get_boot())
    return context

def get_boot():
    """Return boot data for the React app"""
    return {
        "frappe_version": frappe.__version__,
        "site_name": frappe.local.site,
        "csrf_token": frappe.sessions.get_csrf_token(),
        "user": frappe.session.user,
        "timezone": frappe.get_system_settings("time_zone"),
    }
```

#### Hooks (`butler/hooks.py`)

```python
# Add Butler to app launcher
add_to_apps_screen = [{
    "name": "butler",
    "logo": "/assets/butler/logo.svg",
    "title": "Butler",
    "route": "/butler",
    "has_permission": "butler.api.permission.has_app_permission"
}]

# Route React app URLs to butler.html
website_route_rules = [
    {
        'from_route': '/butler/<path:app_path>',
        'to_route': 'butler'
    }
]
```

### 2. Frontend Configuration

#### FrappeProvider (`src/App.tsx`)

Wraps the entire app and manages connection to Frappe:

```tsx
<FrappeProvider
  url={import.meta.env.VITE_FRAPPE_PATH ?? ""}
  socketPort={
    import.meta.env.VITE_SOCKET_PORT
      ? import.meta.env.VITE_SOCKET_PORT
      : undefined
  }
  siteName={getSiteName()}
>
  <UserProvider>
    <RouterProvider router={router} />
  </UserProvider>
</FrappeProvider>
```

**Site Name Detection** - Handles different Frappe versions:

```tsx
const getSiteName = () => {
  if (typeof window !== "undefined" && window.frappe?.boot?.versions?.frappe) {
    // Frappe v14 needs manual site name
    if (window.frappe.boot.versions.frappe.startsWith("14")) {
      return import.meta.env.VITE_SITE_NAME;
    }
    // v15+ provides sitename in boot
    return window.frappe?.boot?.sitename ?? import.meta.env.VITE_SITE_NAME;
  }
  return import.meta.env.VITE_SITE_NAME;
};
```

#### User Context (`src/contexts/UserContext.tsx`)

- Uses `useFrappeAuth()` hook
- Provides: `currentUser`, `isLoading`, `logout()`
- Available via `useUser()` hook in any component

#### Protected Routes (`src/components/auth/ProtectedRoute.tsx`)

- Checks authentication state
- Redirects to `/login` if not authenticated
- Shows loading state during auth check

### 3. Authentication Flow

```
1. User visits /butler
2. butler.html loads with CSRF token
3. React app initializes with FrappeProvider
4. useFrappeAuth() checks session
5. If authenticated: Show app
   If not: Redirect to /login (to be implemented)
```

### 4. Development Setup

#### Proxy Configuration (`proxyOptions.ts`)

Routes API calls to Frappe server during development:

```typescript
'^/(app|api|assets|files|private)': {
  target: 'http://127.0.0.1:8000',  // Frappe dev server
  ws: true,                          // WebSocket support
  changeOrigin: true,
}
```

#### Build Configuration (`vite.config.ts`)

- Dev server: `http://localhost:8080`
- Build output: `../butler/public/frontend/`
- Base path: `/assets/butler/frontend/`

### 5. Using frappe-react-sdk

#### Available Hooks:

**Authentication**:

```tsx
const { login, logout, currentUser, isLoading } = useFrappeAuth();
```

**Get Documents**:

```tsx
const { data, error, isLoading, mutate } = useFrappeGetDoc(
  "Doctype Name",
  "document-name",
);
```

**Get List**:

```tsx
const { data, error, isLoading } = useFrappeGetDocList("User", {
  fields: ["name", "email", "full_name"],
  filters: [["enabled", "=", 1]],
  orderBy: {
    field: "creation",
    order: "desc",
  },
  limit: 20,
});
```

**useFrappeGetCall()** - Call any whitelisted method:

```tsx
const { data, error, isLoading } = useFrappeGetCall(
  "butler.api.get_list_fields",
  { doctype: "User" },
);
```

**useFrappeCreateDoc()** - Create new document:

```tsx
const { createDoc, loading, error, reset } = useFrappeCreateDoc();

const handleCreate = async () => {
  await createDoc("Comment", {
    content: "Hello World",
    comment_type: "Comment",
  });
};
```

**useFrappeUpdateDoc()** - Update existing document:

```tsx
const { updateDoc, loading, error } = useFrappeUpdateDoc();

await updateDoc("User", "user@example.com", {
  first_name: "John",
  last_name: "Doe",
});
```

**useFrappeDeleteDoc()** - Delete document:

```tsx
const { deleteDoc, loading, error } = useFrappeDeleteDoc();
await deleteDoc("Comment", "comment-id");
```

**useFrappeFileUpload()** - Upload files:

```tsx
const { upload, progress, loading, error } = useFrappeFileUpload();

const handleUpload = async (file: File) => {
  const result = await upload(file, {
    doctype: "User",
    docname: "user@example.com",
    fieldname: "image",
    isPrivate: true,
  });
};
```

**useDebounce()** - Debounce search inputs:

```tsx
const [searchText, setSearchText] = useState("");
const debouncedSearch = useDebounce(searchText, 500);

// Use debouncedSearch in API calls
```

### 6. React Router Configuration

#### Router Setup (`src/App.tsx`):

```tsx
const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute />}>
        <Route index element={<Home />} />
        {/* Add more routes */}
      </Route>
    </>,
  ),
  {
    basename: import.meta.env.VITE_BASE_NAME
      ? `/${import.meta.env.VITE_BASE_NAME}`
      : "",
  },
);
```

**Important**:

- Development: No basename (runs at root)
- Production: basename="/butler" (served by Frappe)

### 7. API Integration Examples

#### Calling Custom Butler API:

```tsx
// In your component
const { data, error, isLoading } = useFrappeGetCall(
  "butler.api.get_list_fields",
  { doctype: "User" },
);

if (isLoading) return <div>Loading...</div>;
if (error) return <div>Error: {error.message}</div>;

return (
  <div>
    {data?.message?.map((field) => (
      <div key={field}>{field}</div>
    ))}
  </div>
);
```

#### Fetching with Filters:

```tsx
const { data: users } = useFrappeGetDocList("User", {
  fields: ["name", "full_name", "email", "enabled"],
  filters: [
    ["enabled", "=", 1],
    ["name", "!=", "Administrator"],
  ],
  limit: 100,
});
```

#### Using SWR for Caching:

```tsx
import { useSWRConfig } from "swr";

const { mutate } = useSWRConfig();

// After creating/updating, revalidate cache
await createDoc("User", data);
mutate("User-list"); // Refresh user list
```

## Development Workflow

### Starting Development:

```bash
# Terminal 1: Start Frappe server
cd ~/frappe-bench
bench start

# Terminal 2: Start React dev server
cd apps/butler/frontend
npm run dev

# Access at: http://localhost:8080/
```

### Building for Production:

```bash
# Build React app
cd apps/butler/frontend
npm run build

# Build Frappe assets
cd ~/frappe-bench
bench build --app butler

# Restart Frappe
bench restart
```

### Access in Production:

- URL: `http://your-site:8000/butler`
- Served by Frappe from `/butler/public/frontend/`

## Environment Configuration

**Development (`.env.development`)**:

```bash
# Empty - dev server runs at root path
# VITE_BASE_NAME is intentionally not set
```

**Production (`.env.production`)**:

```bash
VITE_BASE_NAME=butler
```

**Optional variables**:

```bash
VITE_FRAPPE_PATH=         # Usually empty
VITE_SOCKET_PORT=9000      # For realtime/socketio
VITE_SITE_NAME=site1.local # For multi-tenant
```

## Permission System

### Backend Permission Check:

```python
# butler/api/permission.py
@frappe.whitelist()
def has_app_permission():
    user_roles = frappe.get_roles()

    # Allow System Manager and Administrator
    if "Administrator" in user_roles or "System Manager" in user_roles:
        return True

    # Check custom Butler User role
    if "Butler User" in user_roles:
        return frappe.has_permission("Butler", throw=False)

    return False
```

### Role Setup in Frappe:

1. Go to Role List
2. Create "Butler User" role
3. Assign to users
4. Grant module permissions for "Butler"

## Troubleshooting

### Common Issues:

**1. Infinite redirect loop**

- Cause: Not logged into Frappe
- Solution: Log in at `/login` first

**2. 404 on API calls**

- Cause: Proxy not configured or Frappe not running
- Solution: Check `proxyOptions.ts` and `bench start`

**3. CORS errors**

- Cause: Wrong proxy configuration
- Solution: Ensure `changeOrigin: true` in proxy

**4. Module not found errors**

- Cause: Missing dependencies
- Solution: Run `npm install` in frontend directory

**5. CSS not loading**

- Cause: Tailwind not configured
- Solution: Check `@import "tailwindcss"` in index.css

## Next Steps

✅ **Completed**:

- Backend API structure
- Frontend authentication
- Protected routing
- RetroUI integration
- Login page
- Development environment

🔄 **In Progress**:

- Dashboard layout
- Additional pages

📋 **To Do**:

- Butler-specific DocTypes
- Estate management features
- Real-time notifications
- File management
- Reporting and analytics
- Mobile responsive design

## Resources

- [frappe-react-sdk Documentation](https://github.com/nikkothari22/frappe-react-sdk)
- [Frappe Framework Docs](https://frappeframework.com/docs)
- [React Router v6 Docs](https://reactrouter.com/)
- [Vite Documentation](https://vitejs.dev/)
- [RetroUI Components](../src/components/retroui/)

## Support

For issues or questions:

1. Check this documentation
2. Review waqf app implementation
3. Consult frappe-react-sdk examples
4. Ask in Frappe Forum
