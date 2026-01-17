import { useFrappeAuth } from "frappe-react-sdk";
import { createContext, useContext } from "react";
import type { FC, PropsWithChildren } from "react";

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

// Add custom hook for easier usage
export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within UserProvider");
  }
  return context;
};
