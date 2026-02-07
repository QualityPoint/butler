import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useFrappeGetDocList } from "frappe-react-sdk";
import { Button } from "@/components/retroui/Button";
import { Search, Users, Home } from "lucide-react";
import type { Customer } from "@/types/Selling/Customer";

export default function Customers() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 500); // Wait 500ms after user stops typing

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Only fetch when we have at least 2 characters
  const shouldFetch = debouncedSearch.length >= 2;

  // Fetch customers with server-side filtering
  const {
    data: customers,
    error,
    isLoading,
  } = useFrappeGetDocList<Customer>(
    "Customer",
    {
      fields: ["name", "customer_name", "mobile_no", "email_id", "customer_type", "territory"],
      filters: shouldFetch
        ? [
            [
              "customer_name",
              "like",
              `%${debouncedSearch}%`,
            ],
          ]
        : undefined,
      limit: 50,
      orderBy: {
        field: "modified",
        order: "desc",
      },
    },
    shouldFetch ? undefined : null
  );

  const handleSelectCustomer = (customer: Customer) => {
    // Navigate to facilities page with customer information
    navigate(`/facilities?lead_id=${customer.name}&facility_for=Customer`);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-primary border-4 border-border p-4 sm:p-6 shadow-xl mb-8">
          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 justify-center">
            <img
              src="/assets/butler/images/logo.svg"
              alt="Butler Logo"
              className="h-16 w-16 sm:h-20 sm:w-20 flex-shrink-0"
            />
            <div className="text-center sm:text-left max-w-xl">
              <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-head break-words">Find Your Account</h1>
              <p className="mt-1 sm:mt-2 font-sans text-sm sm:text-base break-words">
                Search for your existing customer record
              </p>
            </div>
          </div>
        </div>

        {/* Search Box */}
        <div className="bg-card border-4 border-border p-6 shadow-lg mb-6">
          <div className="space-y-4">
            <label htmlFor="search" className="block font-head text-lg">
              Search by Customer Name
            </label>
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="search"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
                  placeholder="Type at least 2 characters to search..."
                />
              </div>
            </div>
            <p className="font-sans text-sm text-muted-foreground">
              {searchTerm.length > 0 && searchTerm.length < 2
                ? `Type ${2 - searchTerm.length} more character(s) to search`
                : customers
                ? `Found ${customers.length} customer(s)`
                : "Start typing to search for customers"}
            </p>
          </div>
        </div>

        {/* Results */}
        {isLoading && (
          <div className="bg-card border-4 border-border p-8 shadow-lg text-center">
            <p className="font-head text-xl">Searching...</p>
          </div>
        )}

        {error && (
          <div className="bg-destructive border-4 border-border p-6 shadow-lg text-center">
            <p className="font-head text-xl text-white">
              Error loading results. Please try again.
            </p>
          </div>
        )}

        {!shouldFetch && !isLoading && (
          <div className="bg-card border-4 border-border p-8 shadow-lg text-center">
            <p className="font-head text-xl mb-2">Start Searching</p>
            <p className="font-sans text-muted-foreground">
              Enter customer name to find your account
            </p>
          </div>
        )}

        {shouldFetch && !isLoading && customers && customers.length === 0 && (
          <div className="bg-card border-4 border-border p-8 shadow-lg text-center">
            <p className="font-head text-xl mb-2">No customers found</p>
            <p className="font-sans text-muted-foreground">
              Try a different search term or register as new
            </p>
            <Button onClick={() => navigate("/register")} className="mt-4">
              Register as New
            </Button>
          </div>
        )}

        {!isLoading && customers && customers.length > 0 && (
          <div className="space-y-4">
            <h2 className="font-head text-2xl mb-4">Select Your Account</h2>
            {customers.map((customer) => (
              <div
                key={customer.name}
                className="bg-card border-4 border-border shadow-lg hover:shadow-xl transition-all cursor-pointer p-6"
                onClick={() => handleSelectCustomer(customer)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="bg-secondary p-3 border-4 border-border">
                      <Users className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-2xl font-head mb-2">
                        {customer.customer_name}
                      </h3>
                      <div className="space-y-1">
                        {customer.mobile_no && (
                          <p className="font-sans text-sm">
                            <span className="text-muted-foreground">Phone:</span>{" "}
                            {customer.mobile_no}
                          </p>
                        )}
                        {customer.email_id && (
                          <p className="font-sans text-sm">
                            <span className="text-muted-foreground">Email:</span>{" "}
                            {customer.email_id}
                          </p>
                        )}
                        <div className="flex gap-2 flex-wrap">
                          {customer.customer_type && (
                            <span className="px-2 py-1 bg-accent border-2 border-border text-xs font-sans">
                              {customer.customer_type}
                            </span>
                          )}
                          {customer.territory && (
                            <span className="px-2 py-1 bg-muted border-2 border-border text-xs font-sans">
                              {customer.territory}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectCustomer(customer);
                    }}
                  >
                    Select
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Back Button */}
        <div className="mt-6 flex justify-center gap-4">
          <Button
            variant="outline"
            onClick={() => navigate("/")}
          >
            <Home className="w-4 h-4 mr-2" />
            Home
          </Button>
        </div>
      </div>
    </div>
  );
}
