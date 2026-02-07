import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useFrappeGetDocList } from "frappe-react-sdk";
import { Button } from "@/components/retroui/Button";
import { Search, UserCheck, Home } from "lucide-react";
import type { Lead } from "@/types/CRM/Lead";

export default function Leads() {
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

  // Fetch leads with server-side filtering
  const {
    data: leads,
    error,
    isLoading,
  } = useFrappeGetDocList<Lead>(
    "Lead",
    {
      fields: ["name", "title", "lead_name", "mobile_no", "email_id", "status"],
      filters: shouldFetch
        ? [
            [
              "title",
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

  const handleSelectLead = (lead: Lead) => {
    // Navigate to facilities page with lead information
    navigate(`/facilities?lead_id=${lead.name}&facility_for=Lead`);
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
              <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-head break-words">Find Your Lead</h1>
              <p className="mt-1 sm:mt-2 font-sans text-sm sm:text-base break-words">
                Search for your existing lead record
              </p>
            </div>
          </div>
        </div>

        {/* Search Box */}
        <div className="bg-card border-4 border-border p-6 shadow-lg mb-6">
          <div className="space-y-4">
            <label htmlFor="search" className="block font-head text-lg">
              Search by Name
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
                : leads
                ? `Found ${leads.length} lead(s)`
                : "Start typing to search for leads"}
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
              Enter your name to find your lead record
            </p>
          </div>
        )}

        {shouldFetch && !isLoading && leads && leads.length === 0 && (
          <div className="bg-card border-4 border-border p-8 shadow-lg text-center">
            <p className="font-head text-xl mb-2">No leads found</p>
            <p className="font-sans text-muted-foreground">
              Try a different search term or register as a new lead
            </p>
            <Button onClick={() => navigate("/register")} className="mt-4">
              Register as New Lead
            </Button>
          </div>
        )}

        {!isLoading && leads && leads.length > 0 && (
          <div className="space-y-4">
            <h2 className="font-head text-2xl mb-4">Select Your Lead</h2>
            {leads.map((lead) => (
              <div
                key={lead.name}
                className="bg-card border-4 border-border shadow-lg hover:shadow-xl transition-all cursor-pointer p-6"
                onClick={() => handleSelectLead(lead)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="bg-accent p-3 border-4 border-border">
                      <UserCheck className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-2xl font-head mb-2">
                        {lead.title || lead.lead_name}
                      </h3>
                      <div className="space-y-1">
                        {lead.mobile_no && (
                          <p className="font-sans text-sm">
                            <span className="text-muted-foreground">Phone:</span>{" "}
                            {lead.mobile_no}
                          </p>
                        )}
                        {lead.email_id && (
                          <p className="font-sans text-sm">
                            <span className="text-muted-foreground">Email:</span>{" "}
                            {lead.email_id}
                          </p>
                        )}
                        {lead.status && (
                          <p className="font-sans text-sm">
                            <span className="text-muted-foreground">Status:</span>{" "}
                            <span className="px-2 py-1 bg-secondary text-white border-2 border-border text-xs">
                              {lead.status}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectLead(lead);
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
