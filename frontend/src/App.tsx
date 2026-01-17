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
import Service from "./pages/Service";
import Login from "./pages/auth/Login";
import "./App.css";

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
        <Route path="service" element={<Service />} />
        {/* Add more protected routes here */}
      </Route>
    </>,
  ),
  {
    basename: import.meta.env.VITE_BASE_NAME
      ? `/${import.meta.env.VITE_BASE_NAME}`
      : "",
  },
);

function App() {
  // Get site name based on Frappe version
  const getSiteName = () => {
    // @ts-ignore
    if (
      typeof window !== "undefined" &&
      window.frappe?.boot?.versions?.frappe
    ) {
      // @ts-ignore
      if (window.frappe.boot.versions.frappe.startsWith("14")) {
        return import.meta.env.VITE_SITE_NAME;
      }
      // @ts-ignore
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
