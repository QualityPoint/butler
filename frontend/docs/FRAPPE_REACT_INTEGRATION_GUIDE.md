# Complete Guide: Integrating Frappe with React Apps

A comprehensive step-by-step guide for integrating a React frontend with Frappe Framework backend. Use this as a reference for any new Frappe + React project.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Project Structure](#project-structure)
3. [Backend Setup (Frappe App)](#backend-setup-frappe-app)
4. [Frontend Setup (React + Vite)](#frontend-setup-react--vite)
5. [Authentication Integration](#authentication-integration)
6. [API Integration](#api-integration)
7. [Routing Configuration](#routing-configuration)
8. [Build & Deployment](#build--deployment)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Node.js**: v18+ (with npm/yarn)
- **Frappe Framework**: v14+ or v15+
- **Python**: 3.10+
- **Git**: For version control

### Required Knowledge

- React fundamentals
- TypeScript basics
- Frappe DocType system
- REST API concepts

---

## Project Structure

```
your_app/
├── your_app/                    # Python backend
│   ├── __init__.py
│   ├── hooks.py                 # App configuration
│   ├── modules.txt
│   ├── patches.txt
│   ├── api/                     # API endpoints
│   │   ├── __init__.py
│   │   └── permission.py
│   ├── public/                  # Static assets
│   │   └── frontend/            # React build output (auto-generated)
│   └── www/                     # Server-side pages
│       ├── your_app.html        # React app entry point
│       └── your_app.py          # Context provider
├── frontend/                    # React app
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── .env.development
│   └── .env.production
├── package.json                 # Root package.json
├── pyproject.toml
└── README.md
```

---

## Backend Setup (Frappe App)

### Step 1: Create Frappe App Structure

If you don't have an app yet:

```bash
cd ~/frappe-bench
bench new-app your_app
```

### Step 2: Configure hooks.py

Add your app to the Frappe workspace and configure routing:

```python
# your_app/hooks.py

app_name = "your_app"
app_title = "Your App"
app_publisher = "Your Company"
app_description = "Your app description"
app_icon = "octicon octicon-file-directory"
app_color = "grey"
app_email = "your@email.com"
app_license = "MIT"

# Add app to Frappe workspace app launcher
add_to_apps_screen = [
    {
        "name": "your_app",
        "logo": "/assets/your_app/logo.svg",
        "title": "Your App",
        "route": "/your_app",
        "has_permission": "your_app.api.permission.has_app_permission"
    }
]

# Route all React app URLs to your_app.html
website_route_rules = [
    {
        "from_route": "/your_app/<path:app_path>",
        "to_route": "your_app"
    }
]
```

### Step 3: Create Permission Module

```python
# your_app/api/permission.py

import frappe

@frappe.whitelist()
def has_app_permission():
    """
    Check if current user has permission to access the app.
    Customize this based on your requirements.
    """
    user_roles = frappe.get_roles()

    # Allow System Managers and Administrators
    if "System Manager" in user_roles or "Administrator" in user_roles:
        return True

    # Check for custom role (create this role in your Frappe site)
    if "Your App User" in user_roles:
        return True

    return False
```

### Step 4: Create Common API Endpoints

```python
# your_app/api/__init__.py

import frappe

@frappe.whitelist()
def get_list_fields(doctype):
    """Get fields configured for list view of a doctype"""
    meta = frappe.get_meta(doctype)
    fields = []

    for df in meta.fields:
        if df.in_list_view:
            fields.append({
                "fieldname": df.fieldname,
                "label": df.label,
                "fieldtype": df.fieldtype
            })

    return fields

@frappe.whitelist()
def sort_options(doctype):
    """Get available sort options for a doctype"""
    meta = frappe.get_meta(doctype)
    options = []

    for df in meta.fields:
        if df.in_list_view or df.in_standard_filter:
            options.append({
                "label": df.label,
                "value": df.fieldname
            })

    return options
```

### Step 5: Create Context Provider

```python
# your_app/www/your_app.py

import frappe
from frappe import _

no_cache = 1

def get_context(context):
    """
    Called when rendering your_app.html
    Provides boot data to the React app
    """

    # Check if user is logged in
    if frappe.session.user == "Guest":
        frappe.throw(_("Please login to access this page"), frappe.PermissionError)

    # Check app permission
    from your_app.api.permission import has_app_permission
    if not has_app_permission():
        frappe.throw(_("You don't have permission to access this app"), frappe.PermissionError)

    # Add boot data to context
    context.update(get_boot())

    return context

def get_boot():
    """Return boot data for the React app"""
    boot_data = {
        "frappe_version": frappe.__version__,
        "site_name": frappe.local.site,
        "user": frappe.session.user,
        "csrf_token": frappe.sessions.get_csrf_token(),
        "user_info": {
            "email": frappe.session.user,
            "full_name": frappe.get_value("User", frappe.session.user, "full_name"),
            "user_image": frappe.get_value("User", frappe.session.user, "user_image"),
            "roles": frappe.get_roles(),
        },
        "timezone": frappe.get_system_settings("time_zone") or "UTC",
        "language": frappe.local.lang or "en",
    }

    return boot_data
```

### Step 6: Create HTML Entry Point

```html
<!-- your_app/www/your_app.html -->

{% extends "templates/web.html" %} {% block title %}{{ _("Your App") }}{%
endblock %} {% block page_content %}
<div id="root"></div>

{% if dev_mode %}
<!-- Development: Load from Vite dev server -->
<script type="module" src="http://localhost:8080/@vite/client"></script>
<script type="module" src="http://localhost:8080/src/main.tsx"></script>
{% else %}
<!-- Production: Load built assets -->
<script type="module" src="/assets/your_app/frontend/index.js"></script>
<link rel="stylesheet" href="/assets/your_app/frontend/index.css" />
{% endif %}

<!-- Pass boot data to React app -->
<script>
  window.app_boot = {{ boot | tojson }};
</script>
{% endblock %}
```

---

## Frontend Setup (React + Vite)

### Step 1: Initialize React Project

```bash
cd your_app
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

### Step 2: Install Dependencies

```bash
npm install frappe-react-sdk
npm install react-router-dom
npm install swr  # Included with frappe-react-sdk

# Optional: UI libraries
npm install tailwindcss @tailwindcss/vite
npm install class-variance-authority clsx tailwind-merge
```

### Step 3: Configure Environment Files

**`.env.development`**:

```bash
# Development runs at root path
# No VITE_BASE_NAME needed
VITE_FRAPPE_PATH=
VITE_SOCKET_PORT=9000
```

**`.env.production`**:

```bash
# Production runs at /your_app
VITE_BASE_NAME=your_app
VITE_FRAPPE_PATH=
VITE_SOCKET_PORT=9000
```

### Step 4: Configure Vite Proxy

```typescript
// frontend/proxyOptions.ts

export interface ProxyOptions {
  target: string;
  ws: boolean;
  router: (req: any) => string;
  changeOrigin: boolean;
  rewrite?: (path: string) => string;
}

export const getProxyOptions = (): Record<string, ProxyOptions> => ({
  // Proxy Frappe API calls
  "^/(app|api|assets|files|private)": {
    target: "http://127.0.0.1:8000",
    ws: true,
    router: function (req) {
      const site_name = req.headers.host?.split(":")[0];
      return `http://${site_name}:8000`;
    },
    changeOrigin: true,
  },
});
```

### Step 5: Configure Vite

```typescript
// frontend/vite.config.ts

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { getProxyOptions } from "./proxyOptions";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8080,
    proxy: getProxyOptions(),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "../your_app/public/frontend",
    emptyOutDir: true,
    target: "es2015",
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
});
```

### Step 6: Configure TypeScript

```json
// frontend/tsconfig.json

{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

---

## Authentication Integration

### Step 1: Create User Context

```typescript
// frontend/src/contexts/UserContext.tsx

import { useFrappeAuth } from "frappe-react-sdk";
import { createContext, useContext, FC, PropsWithChildren } from "react";

interface UserContextProps {
  isLoading: boolean;
  currentUser: string;
  logout: () => Promise<void>;
}

export const UserContext = createContext<UserContextProps>({
  currentUser: "",
  isLoading: false,
  logout: () => Promise.resolve(),
});

export const UserProvider: FC<PropsWithChildren> = ({ children }) => {
  const { logout, currentUser, isLoading } = useFrappeAuth();

  const handleLogout = async () => {
    return logout();
  };

  return (
    <UserContext.Provider
      value={{
        isLoading,
        logout: handleLogout,
        currentUser: currentUser ?? "",
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within UserProvider");
  }
  return context;
};
```

### Step 2: Create Protected Route Component

```typescript
// frontend/src/components/auth/ProtectedRoute.tsx

import { Navigate, Outlet } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";

export const ProtectedRoute = () => {
  const { currentUser, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-2">Loading...</h1>
          <p className="text-gray-600">Please wait</p>
        </div>
      </div>
    );
  }

  if (!currentUser || currentUser === "Guest") {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};
```

### Step 3: Create Login Page

```typescript
// frontend/src/pages/auth/Login.tsx

import { useState } from "react";
import { useFrappeAuth } from "frappe-react-sdk";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useFrappeAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await login({ username, password });
      // Reload to fetch new session data
      const URL = import.meta.env.VITE_BASE_NAME
        ? `/${import.meta.env.VITE_BASE_NAME}`
        : "";
      window.location.replace(`${URL}/`);
    } catch (err: any) {
      setError(err.message || "Login failed. Please check your credentials.");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <form onSubmit={handleLogin} className="space-y-6">
          <h1 className="text-3xl font-bold text-center mb-6">
            Login to Your App
          </h1>

          <div>
            <label htmlFor="username" className="block text-sm font-medium mb-2">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={isLoading}
              className="w-full px-4 py-2 border rounded"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              className="w-full px-4 py-2 border rounded"
            />
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

---

## API Integration

### Step 1: Setup FrappeProvider

```typescript
// frontend/src/App.tsx

import {
  Route,
  RouterProvider,
  createBrowserRouter,
  createRoutesFromElements,
} from "react-router-dom";
import { FrappeProvider } from "frappe-react-sdk";
import { UserProvider } from "./contexts/UserContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import Home from "./pages/Home";
import Login from "./pages/auth/Login";

declare global {
  interface Window {
    frappe?: {
      boot?: {
        versions?: {
          frappe?: string;
        };
        sitename?: string;
      };
    };
  }
}

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute />}>
        <Route index element={<Home />} />
        {/* Add more protected routes */}
      </Route>
    </>
  ),
  {
    basename: import.meta.env.VITE_BASE_NAME
      ? `/${import.meta.env.VITE_BASE_NAME}`
      : "",
  }
);

function App() {
  const getSiteName = () => {
    if (
      typeof window !== "undefined" &&
      window.frappe?.boot?.versions?.frappe
    ) {
      if (window.frappe.boot.versions.frappe.startsWith("14")) {
        return import.meta.env.VITE_SITE_NAME;
      }
      return window.frappe?.boot?.sitename ?? import.meta.env.VITE_SITE_NAME;
    }
    return import.meta.env.VITE_SITE_NAME;
  };

  return (
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
  );
}

export default App;
```

### Step 2: Using frappe-react-sdk Hooks

#### Get Document List:

```typescript
import { useFrappeGetDocList } from "frappe-react-sdk";

function UserList() {
  const { data, error, isLoading } = useFrappeGetDocList("User", {
    fields: ["name", "email", "full_name"],
    filters: [["enabled", "=", 1]],
    orderBy: {
      field: "creation",
      order: "desc",
    },
    limit: 20,
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {data?.map((user) => (
        <li key={user.name}>{user.full_name}</li>
      ))}
    </ul>
  );
}
```

#### Get Single Document:

```typescript
import { useFrappeGetDoc } from "frappe-react-sdk";

function UserProfile({ userId }: { userId: string }) {
  const { data, error, isLoading, mutate } = useFrappeGetDoc("User", userId);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h1>{data?.full_name}</h1>
      <p>{data?.email}</p>
      <button onClick={() => mutate()}>Refresh</button>
    </div>
  );
}
```

#### Call Whitelisted Method:

```typescript
import { useFrappeGetCall } from "frappe-react-sdk";

function CustomData() {
  const { data, error, isLoading } = useFrappeGetCall(
    "your_app.api.get_list_fields",
    { doctype: "User" }
  );

  return <div>{/* Render data */}</div>;
}
```

#### Create Document:

```typescript
import { useFrappeCreateDoc } from "frappe-react-sdk";

function CreateComment() {
  const { createDoc, loading, error } = useFrappeCreateDoc();

  const handleCreate = async () => {
    try {
      await createDoc("Comment", {
        content: "New comment",
        comment_type: "Comment",
      });
      alert("Created successfully!");
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <button onClick={handleCreate} disabled={loading}>
      Create Comment
    </button>
  );
}
```

#### Update Document:

```typescript
import { useFrappeUpdateDoc } from "frappe-react-sdk";

function UpdateUser() {
  const { updateDoc, loading } = useFrappeUpdateDoc();

  const handleUpdate = async () => {
    await updateDoc("User", "user@example.com", {
      first_name: "John",
    });
  };

  return (
    <button onClick={handleUpdate} disabled={loading}>
      Update
    </button>
  );
}
```

#### Delete Document:

```typescript
import { useFrappeDeleteDoc } from "frappe-react-sdk";

function DeleteButton({ doctype, name }: { doctype: string; name: string }) {
  const { deleteDoc, loading } = useFrappeDeleteDoc();

  const handleDelete = async () => {
    if (confirm("Are you sure?")) {
      await deleteDoc(doctype, name);
    }
  };

  return (
    <button onClick={handleDelete} disabled={loading}>
      Delete
    </button>
  );
}
```

---

## Routing Configuration

### Important: Basename Handling

**Development** (localhost:8080):

- Runs at root path (`/`)
- No basename needed
- `.env.development` should NOT have `VITE_BASE_NAME`

**Production** (served by Frappe):

- Runs at `/your_app`
- Needs basename configuration
- `.env.production` should have `VITE_BASE_NAME=your_app`

### Router Setup with Conditional Basename:

```typescript
const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute />}>
        <Route index element={<Home />} />
        <Route path="about" element={<About />} />
        <Route path="users" element={<Users />} />
        <Route path="users/:id" element={<UserDetail />} />
      </Route>
    </>
  ),
  {
    // Only set basename in production
    basename: import.meta.env.VITE_BASE_NAME
      ? `/${import.meta.env.VITE_BASE_NAME}`
      : "",
  }
);
```

### Navigation in Components:

```typescript
import { Link, useNavigate } from "react-router-dom";

function Navigation() {
  const navigate = useNavigate();

  return (
    <nav>
      {/* Link component handles basename automatically */}
      <Link to="/">Home</Link>
      <Link to="/about">About</Link>
      <Link to="/users">Users</Link>

      {/* Programmatic navigation */}
      <button onClick={() => navigate("/about")}>Go to About</button>
    </nav>
  );
}
```

---

## Build & Deployment

### Development Workflow:

```bash
# Terminal 1: Start Frappe
cd ~/frappe-bench
bench start

# Terminal 2: Start React dev server
cd apps/your_app/frontend
npm run dev

# Access at: http://localhost:8080/
```

### Production Build:

```bash
# 1. Build React app
cd apps/your_app/frontend
npm run build

# 2. Build Frappe assets
cd ~/frappe-bench
bench build --app your_app

# 3. Clear cache and restart
bench clear-cache
bench restart

# Access at: http://your-site:8000/your_app
```

### Update package.json Scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0"
  }
}
```

### Root package.json (in app root):

```json
{
  "name": "your_app",
  "version": "1.0.0",
  "description": "Your App",
  "scripts": {
    "dev": "cd frontend && npm run dev",
    "build": "cd frontend && npm run build"
  }
}
```

---

## Best Practices

### 1. Error Handling

Always handle errors in API calls:

```typescript
const { data, error, isLoading } = useFrappeGetDocList("User");

if (isLoading) return <LoadingSpinner />;
if (error) return <ErrorMessage message={error.message} />;
if (!data) return <NoData />;

return <DataDisplay data={data} />;
```

### 2. Loading States

Show appropriate loading states:

```typescript
function MyComponent() {
  const { data, isLoading } = useFrappeGetDoc("User", "user@example.com");

  return (
    <div>
      {isLoading ? (
        <Skeleton />
      ) : (
        <UserProfile data={data} />
      )}
    </div>
  );
}
```

### 3. Data Revalidation

Use mutate for manual revalidation:

```typescript
const { data, mutate } = useFrappeGetDocList("User");

const handleRefresh = () => {
  mutate(); // Refetch data
};
```

### 4. Optimistic Updates

Update UI before API response:

```typescript
const { updateDoc } = useFrappeUpdateDoc();
const { mutate } = useFrappeGetDoc("User", userId);

const handleUpdate = async (newData) => {
  // Optimistic update
  mutate({ ...data, ...newData }, false);

  try {
    await updateDoc("User", userId, newData);
    mutate(); // Revalidate
  } catch (err) {
    mutate(); // Rollback
  }
};
```

### 5. Environment-Specific Code

```typescript
// Check if in development
if (import.meta.env.DEV) {
  console.log("Development mode");
}

// Check if in production
if (import.meta.env.PROD) {
  // Production-only code
}
```

### 6. Type Safety

Create TypeScript interfaces for your data:

```typescript
interface User {
  name: string;
  email: string;
  full_name: string;
  enabled: number;
  creation: string;
}

const { data } = useFrappeGetDocList<User>("User");
```

### 7. Custom Hooks

Create reusable hooks:

```typescript
// hooks/useUsers.ts
export function useUsers(filters?: any[]) {
  return useFrappeGetDocList("User", {
    fields: ["name", "email", "full_name"],
    filters: filters || [],
    limit: 100,
  });
}

// Usage
const { data: users, isLoading } = useUsers([["enabled", "=", 1]]);
```

### 8. Code Splitting

Use lazy loading for routes:

```typescript
import { lazy, Suspense } from "react";

const Users = lazy(() => import("./pages/Users"));
const About = lazy(() => import("./pages/About"));

<Route
  path="users"
  element={
    <Suspense fallback={<Loading />}>
      <Users />
    </Suspense>
  }
/>
```

---

## Troubleshooting

### Common Issues & Solutions:

#### 1. **Infinite Redirect Loop**

**Problem**: App keeps redirecting to login  
**Cause**: Not logged into Frappe  
**Solution**:

- Log in to Frappe first at `/app/login`
- Or use the custom login page at `/your_app/login`

#### 2. **404 on API Calls**

**Problem**: API calls return 404  
**Cause**: Proxy not configured or Frappe not running  
**Solution**:

- Check `proxyOptions.ts` configuration
- Ensure `bench start` is running
- Verify proxy is pointing to correct port (8000)

#### 3. **CORS Errors**

**Problem**: CORS errors in browser console  
**Cause**: Wrong proxy configuration  
**Solution**:

- Ensure `changeOrigin: true` in proxy config
- Check `target` URL is correct
- Verify Frappe is accessible at target URL

#### 4. **Module Not Found**

**Problem**: `Cannot find module '@/...'`  
**Cause**: Path alias not configured  
**Solution**:

- Check `tsconfig.json` has correct `paths` configuration
- Verify `vite.config.ts` has correct `alias` configuration
- Restart dev server after configuration changes

#### 5. **White Screen / Blank Page**

**Problem**: App shows blank white screen  
**Cause**: Multiple possible causes  
**Solutions**:

- Check browser console for errors
- Verify React is rendering: add `console.log` in App.tsx
- Check network tab for failed resource loads
- Verify basename is correct for environment
- Clear browser cache (Ctrl+Shift+R)
- Check CSS is loading correctly

#### 6. **Assets Not Loading in Production**

**Problem**: Images/CSS not loading after build  
**Cause**: Incorrect asset paths  
**Solution**:

- Use relative paths or `/assets/your_app/...`
- Don't use `@/` alias for static assets
- Verify build output directory is correct
- Run `bench build --app your_app`

#### 7. **Permission Denied Errors**

**Problem**: "You don't have permission"  
**Cause**: User lacks required role  
**Solution**:

- Check `has_app_permission()` function
- Verify user has correct role assigned
- Check DocType permissions in Frappe
- Test with Administrator role first

#### 8. **WebSocket Connection Failed**

**Problem**: Real-time updates not working  
**Cause**: WebSocket proxy not configured  
**Solution**:

- Ensure `ws: true` in proxy config
- Check `VITE_SOCKET_PORT` environment variable
- Verify Frappe socketio is running

---

## Performance Optimization

### 1. Code Splitting

```typescript
// Lazy load heavy components
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Reports = lazy(() => import("./pages/Reports"));
```

### 2. Memoization

```typescript
import { useMemo, memo } from "react";

const ExpensiveComponent = memo(({ data }) => {
  const processedData = useMemo(() => {
    return data.map(/* expensive operation */);
  }, [data]);

  return <div>{/* render */}</div>;
});
```

### 3. Debounced Search

```typescript
import { useState, useEffect } from "react";
import { useDebounce } from "frappe-react-sdk";

function SearchUsers() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);

  const { data } = useFrappeGetDocList("User", {
    filters: [["name", "like", `%${debouncedSearch}%`]],
  });

  return (
    <input
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder="Search users..."
    />
  );
}
```

### 4. Pagination

```typescript
function PaginatedList() {
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data } = useFrappeGetDocList("User", {
    limit,
    limit_start: (page - 1) * limit,
  });

  return (
    <>
      <UserList data={data} />
      <Pagination page={page} onChange={setPage} />
    </>
  );
}
```

---

## Security Considerations

### 1. Always Check Permissions Server-Side

```python
# Never trust client-side checks alone
@frappe.whitelist()
def sensitive_operation():
    if not frappe.has_permission("Doctype", "write"):
        frappe.throw("Not allowed", frappe.PermissionError)

    # Perform operation
```

### 2. Validate Input

```python
@frappe.whitelist()
def create_document(data):
    # Validate input
    if not data.get("name"):
        frappe.throw("Name is required")

    # Sanitize input
    data["name"] = frappe.scrub(data["name"])

    # Create document
    doc = frappe.get_doc(data)
    doc.insert()
    return doc
```

### 3. Use CSRF Protection

```typescript
// frappe-react-sdk handles CSRF automatically
// But for custom fetch calls:
const response = await fetch("/api/method/custom.method", {
  method: "POST",
  headers: {
    "X-Frappe-CSRF-Token": frappe.csrf_token,
  },
});
```

### 4. Don't Expose Sensitive Data

```python
# Filter sensitive fields
@frappe.whitelist()
def get_user_info(user):
    user_doc = frappe.get_doc("User", user)

    # Don't expose password or API keys
    return {
        "name": user_doc.name,
        "full_name": user_doc.full_name,
        "email": user_doc.email,
        # password, api_key, api_secret excluded
    }
```

---

## Testing

### Unit Testing React Components

```typescript
// Using Vitest
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import UserList from "./UserList";

describe("UserList", () => {
  it("renders user names", () => {
    const users = [
      { name: "user1", full_name: "User One" },
      { name: "user2", full_name: "User Two" },
    ];

    render(<UserList users={users} />);

    expect(screen.getByText("User One")).toBeInTheDocument();
    expect(screen.getByText("User Two")).toBeInTheDocument();
  });
});
```

### Integration Testing

```python
# Frappe unit test
import frappe
import unittest

class TestYourApp(unittest.TestCase):
    def test_permission_check(self):
        from your_app.api.permission import has_app_permission

        frappe.set_user("Administrator")
        self.assertTrue(has_app_permission())

        frappe.set_user("Guest")
        self.assertFalse(has_app_permission())
```

---

## Additional Resources

### Official Documentation

- [Frappe Framework](https://frappeframework.com/docs)
- [frappe-react-sdk](https://github.com/nikkothari22/frappe-react-sdk)
- [React Router](https://reactrouter.com/)
- [Vite](https://vitejs.dev/)
- [SWR](https://swr.vercel.app/)

### Example Projects

- Check the `waqf` app in your bench for reference implementation
- Look at the `butler` app for RetroUI integration

### Community

- [Frappe Forum](https://discuss.frappe.io/)
- [Frappe Discord](https://frappe.io/discord)

---

## Checklist for New Projects

Use this checklist when setting up a new Frappe + React project:

### Backend Setup

- [ ] Create Frappe app with `bench new-app`
- [ ] Configure `hooks.py` with app screen and routes
- [ ] Create `api/permission.py` with permission checks
- [ ] Create `api/__init__.py` with common endpoints
- [ ] Create `www/your_app.py` with context provider
- [ ] Create `www/your_app.html` template
- [ ] Test backend with `bench start`

### Frontend Setup

- [ ] Initialize Vite + React with TypeScript
- [ ] Install `frappe-react-sdk` and `react-router-dom`
- [ ] Create `.env.development` and `.env.production`
- [ ] Configure `proxyOptions.ts`
- [ ] Configure `vite.config.ts`
- [ ] Configure TypeScript path aliases
- [ ] Create UserContext and ProtectedRoute
- [ ] Create Login page
- [ ] Setup router with conditional basename
- [ ] Create main App.tsx with FrappeProvider
- [ ] Test dev server at `localhost:8080`

### Integration Testing

- [ ] Test authentication flow
- [ ] Test API calls with frappe-react-sdk hooks
- [ ] Test routing (dev and prod basename)
- [ ] Build for production
- [ ] Test production build in Frappe

### Deployment

- [ ] Build React app (`npm run build`)
- [ ] Build Frappe assets (`bench build --app your_app`)
- [ ] Clear cache (`bench clear-cache`)
- [ ] Restart server (`bench restart`)
- [ ] Test in production at `/your_app`

---

## Conclusion

This guide covers the complete integration of Frappe with React. Use it as a reference for:

1. ✅ Setting up new Frappe + React projects
2. ✅ Understanding the authentication flow
3. ✅ Implementing API integration
4. ✅ Configuring routing correctly
5. ✅ Building and deploying to production

For project-specific implementations, refer to:

- `butler` app for RetroUI integration
- `waqf` app for comprehensive features
- `FRAPPE_INTEGRATION.md` for Butler-specific details

**Happy coding! 🚀**
