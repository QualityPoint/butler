import { useNavigate } from "react-router-dom";
import { Button } from "@/components/retroui/Button";
import { UserPlus, Users, UserCheck, LogOut } from "lucide-react";
import { useUser } from "@/contexts/UserContext";

export default function CustomerType() {
  const navigate = useNavigate();
  const { logout } = useUser();

  const handleCustomerTypeSelection = (type: "customer" | "lead" | "new") => {
    if (type === "customer") {
      // Navigate to customer lookup/login
      navigate("/customers");
    } else if (type === "lead") {
      // Navigate to lead lookup
      navigate("/leads");
    } else {
      // Navigate to new customer registration
      navigate("/register");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="max-w-6xl w-full">
        {/* Header */}
        <div className="bg-primary border-4 border-border p-4 sm:p-6 shadow-xl mb-8">
          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 justify-between">
            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
              <img
                src="/assets/butler/images/logo.svg"
                alt="Butler Logo"
                className="h-16 w-16 sm:h-20 sm:w-20 flex-shrink-0"
              />
              <div className="text-center sm:text-left max-w-2xl">
                <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-head break-words">
                  Welcome to Butler
                </h1>
                <p className="mt-1 sm:mt-2 font-sans text-sm sm:text-base break-words">
                  Please select your account type
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={logout}
              className="whitespace-nowrap"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        {/* Selection Cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Existing Customer */}
          <div className="bg-card border-4 border-border shadow-lg hover:shadow-xl transition-shadow">
            <div className="p-6 space-y-6">
              <div className="flex justify-center">
                <div className="bg-secondary p-6 border-4 border-border rounded-full">
                  <Users className="w-16 h-16 text-white" />
                </div>
              </div>
              
              <div className="text-center space-y-3">
                <h2 className="text-2xl font-head">Customer</h2>
                <p className="font-sans text-muted-foreground">
                  Already registered as a customer? Access your account and
                  manage your services.
                </p>
              </div>

              <Button
                className="w-full text-lg"
                variant="secondary"
                onClick={() => handleCustomerTypeSelection("customer")}
              >
                Continue as Customer
              </Button>
            </div>
          </div>

          {/* Existing Lead */}
          <div className="bg-card border-4 border-border shadow-lg hover:shadow-xl transition-shadow">
            <div className="p-6 space-y-6">
              <div className="flex justify-center">
                <div className="bg-accent p-6 border-4 border-border rounded-full">
                  <UserCheck className="w-16 h-16 text-black" />
                </div>
              </div>
              
              <div className="text-center space-y-3">
                <h2 className="text-2xl font-head">Lead</h2>
                <p className="font-sans text-muted-foreground">
                  Previously registered as a lead? Continue your registration
                  and manage facilities.
                </p>
              </div>

              <Button
                className="w-full text-lg"
                onClick={() => handleCustomerTypeSelection("lead")}
              >
                Continue as Lead
              </Button>
            </div>
          </div>

          {/* New Registration */}
          <div className="bg-card border-4 border-border shadow-lg hover:shadow-xl transition-shadow">
            <div className="p-6 space-y-6">
              <div className="flex justify-center">
                <div className="bg-primary p-6 border-4 border-border rounded-full">
                  <UserPlus className="w-16 h-16 text-black" />
                </div>
              </div>
              
              <div className="text-center space-y-3">
                <h2 className="text-3xl font-head">New Registration</h2>
                <p className="font-sans text-muted-foreground">
                  First time here? Register now to start building your custom
                  service package.
                </p>
              </div>

              <Button
                className="w-full text-lg"
                onClick={() => handleCustomerTypeSelection("new")}
              >
                Register Now
              </Button>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-8 text-center">
          <p className="font-sans text-sm text-muted-foreground">
            Need help? Contact our support team for assistance
          </p>
        </div>
      </div>
    </div>
  );
}
