import { Navigate, Outlet } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";

export const ProtectedRoute = () => {
  const { currentUser, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-2">Butler</h1>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!currentUser || currentUser === "Guest") {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};
