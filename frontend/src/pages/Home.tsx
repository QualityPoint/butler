import { useState } from "react";
import { Link } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/retroui/Button";
import reactLogo from "../assets/react.svg";

function Home() {
  const [count, setCount] = useState(0);
  const { currentUser, logout } = useUser();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout error:", error);
      // On error (including CSRF), redirect to login page
      window.location.href = "/login";
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-center gap-8 mb-8">
          <a href="https://vitejs.dev" target="_blank">
            <img src="/vite.svg" className="h-24 w-24" alt="Vite logo" />
          </a>
          <a href="https://reactjs.org" target="_blank">
            <img src={reactLogo} className="h-24 w-24" alt="React logo" />
          </a>
        </div>

        <h1 className="text-6xl font-head text-center mb-8 border-4 border-border bg-primary p-6 shadow-xl">
          Butler
        </h1>

        <div className="bg-card border-4 border-border p-8 shadow-lg mb-6">
          <p className="text-xl mb-4 font-sans">
            Welcome,{" "}
            <strong className="font-head text-primary">{currentUser}</strong>!
          </p>

          <div className="flex flex-wrap gap-4">
            <Button onClick={() => setCount((count) => count + 1)}>
              Count is {count}
            </Button>

            <Link to="/service">
              <Button variant="secondary">Service Packages</Button>
            </Link>

            <Button variant="outline" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>

        <div className="bg-accent border-4 border-border p-6 shadow-md text-center">
          <p className="font-head text-lg">
            🚀 Connected to Frappe Framework with RetroUI Design!
          </p>
        </div>
      </div>
    </div>
  );
}

export default Home;
