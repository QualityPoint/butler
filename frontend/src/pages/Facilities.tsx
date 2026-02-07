import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useFrappeGetDocList } from "frappe-react-sdk";
import { Button } from "@/components/retroui/Button";
import { Plus, Building2, MapPin, Home, FileText } from "lucide-react";
import type { Facility } from "@/types/Butler/Facility";
import { ErrorBanner } from "@/components/ui/error-banner";

export default function Facilities() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Get lead_id from URL params (passed from Register page)
  const leadId = searchParams.get("lead_id");
  const facilityFor = searchParams.get("facility_for") || "Lead";

  // Fetch facilities for this lead
  const {
    data: facilities,
    error,
    isLoading,
    mutate,
  } = useFrappeGetDocList<Facility>("Facility", {
    fields: [
      "name",
      "facility_name",
      "facility_type",
      "total_area",
      "multistorey",
      "number_of_floors",
      "street",
      "building_no",
    ],
    filters: [
      ["facility_for", "=", facilityFor],
      ["party_name", "=", leadId],
    ],
    orderBy: {
      field: "creation",
      order: "desc",
    },
  });

  // Fetch service orders for facilities
  const { data: serviceOrders } = useFrappeGetDocList<{
    name: string;
    facility: string;
  }>("Service Order", {
    fields: ["name", "facility"],
    filters: facilities?.map(f => ["facility", "=", f.name]) || [],
    limit: 1000,
  });

  const handleAddFacility = () => {
    navigate(`/facility/new?lead_id=${leadId}&facility_for=${facilityFor}`);
  };

  const handleViewFacility = (facilityName: string) => {
    navigate(`/facility/${facilityName}?lead_id=${leadId}&facility_for=${facilityFor}`);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-primary border-4 border-border p-4 sm:p-6 shadow-xl mb-8">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
              <img
                src="/assets/butler/images/logo.svg"
                alt="Butler Logo"
                className="h-16 w-16 sm:h-20 sm:w-20 flex-shrink-0"
              />
              <div className="text-center sm:text-left max-w-xl">
                <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-head break-words">Your Facilities</h1>
                <p className="mt-1 sm:mt-2 font-sans text-sm sm:text-base break-words">
                  Manage your properties and buildings
                </p>
              </div>
            </div>
            <Button
              className="text-base sm:text-lg whitespace-nowrap"
              onClick={handleAddFacility}
              disabled={!leadId}
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              Add Facility
            </Button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <ErrorBanner error={error} title="Failed to load facilities" />
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="bg-card border-4 border-border p-12 shadow-lg text-center">
            <div className="text-2xl font-head">Loading facilities...</div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && facilities?.length === 0 && (
          <div className="bg-card border-4 border-border p-12 shadow-lg text-center space-y-6">
            <div className="flex justify-center">
              <div className="bg-muted p-8 border-4 border-border rounded-full">
                <Building2 className="w-20 h-20 text-muted-foreground" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-head">No Facilities Yet</h2>
              <p className="font-sans text-muted-foreground text-lg">
                Start by adding your first facility to manage services
              </p>
            </div>
            <Button onClick={handleAddFacility} className="text-lg">
              <Plus className="w-5 h-5 mr-2" />
              Add Your First Facility
            </Button>
          </div>
        )}

        {/* Facilities Grid */}
        {!isLoading && facilities && facilities.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {facilities.map((facility) => (
              <div
                key={facility.name}
                className="bg-card border-4 border-border shadow-lg hover:shadow-xl transition-all cursor-pointer"
                onClick={() => handleViewFacility(facility.name)}
              >
                <div className="p-6 space-y-4">
                  {/* Facility Icon */}
                  <div className="flex justify-between items-start">
                    <div className="bg-secondary p-3 border-4 border-border">
                      <Building2 className="w-8 h-8 text-white" />
                    </div>
                    {facility.multistorey === 1 && (
                      <span className="px-3 py-1 bg-accent border-2 border-border font-sans text-sm">
                        Multi-storey
                      </span>
                    )}
                  </div>

                  {/* Facility Info */}
                  <div className="space-y-2">
                    <h3 className="text-2xl font-head line-clamp-1">
                      {facility.facility_name}
                    </h3>
                    <p className="font-sans text-muted-foreground">
                      {facility.facility_type}
                    </p>
                  </div>

                  {/* Details */}
                  <div className="space-y-2 pt-2 border-t-2 border-border">
                    {facility.total_area && (
                      <div className="flex justify-between font-sans text-sm">
                        <span className="text-muted-foreground">Area:</span>
                        <span className="font-bold">
                          {facility.total_area} m²
                        </span>
                      </div>
                    )}
                    {facility.multistorey === 1 && facility.number_of_floors && (
                      <div className="flex justify-between font-sans text-sm">
                        <span className="text-muted-foreground">Floors:</span>
                        <span className="font-bold">
                          {facility.number_of_floors}
                        </span>
                      </div>
                    )}
                    {(facility.street || facility.building_no) && (
                      <div className="flex items-start gap-2 font-sans text-sm">
                        <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <span className="text-muted-foreground line-clamp-2">
                          {facility.building_no && `Bldg ${facility.building_no}`}
                          {facility.building_no && facility.street && ", "}
                          {facility.street}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    {serviceOrders?.find(order => order.facility === facility.name) ? (
                      <Button
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          const order = serviceOrders.find(o => o.facility === facility.name);
                          if (order) {
                            navigate(`/service?order_id=${order.name}`);
                          }
                        }}
                        className="col-span-2"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        View Order
                      </Button>
                    ) : (
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/service?facility_id=${facility.name}`);
                        }}
                        className="col-span-2"
                      >
                        Create Order
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Home Button - Always visible */}
        <div className="mt-6 flex justify-center">
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
