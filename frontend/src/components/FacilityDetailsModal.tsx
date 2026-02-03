import { useFrappeGetDoc } from "frappe-react-sdk";
import { Button } from "@/components/retroui/Button";

interface FacilityDetailsModalProps {
  facilityId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function FacilityDetailsModal({
  facilityId,
  isOpen,
  onClose,
}: FacilityDetailsModalProps) {
  const { data: facilityDetails } = useFrappeGetDoc(
    "Facility",
    facilityId || "",
    facilityId && isOpen ? undefined : null
  );

  if (!isOpen || !facilityDetails) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-background border-4 border-border shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="bg-primary border-b-4 border-border p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-head text-primary-foreground">
              Facility Details
            </h2>
            <button
              onClick={onClose}
              className="text-3xl font-bold hover:opacity-70 transition-opacity text-primary-foreground"
            >
              ×
            </button>
          </div>
        </div>
        <div className="p-8 space-y-6 overflow-y-auto max-h-[calc(85vh-100px)]">
          <div className="bg-card border-4 border-border p-6 shadow-lg">
            <h3 className="font-head text-2xl mb-4 border-b-2 border-border pb-2">
              Basic Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block font-head text-sm mb-2 text-muted-foreground">
                  Facility Name
                </label>
                <p className="font-sans text-lg font-medium">
                  {facilityDetails.facility_name || "N/A"}
                </p>
              </div>
              <div>
                <label className="block font-head text-sm mb-2 text-muted-foreground">
                  Facility Type
                </label>
                <p className="font-sans text-lg font-medium">
                  {facilityDetails.facility_type || "N/A"}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-card border-4 border-border p-6 shadow-lg">
            <h3 className="font-head text-2xl mb-4 border-b-2 border-border pb-2">
              Specifications
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block font-head text-sm mb-2 text-muted-foreground">
                  Total Area
                </label>
                <p className="font-sans text-lg font-medium">
                  {facilityDetails.total_area != null
                    ? `${facilityDetails.total_area} m²`
                    : "N/A"}
                </p>
              </div>
              {facilityDetails.multistorey === 1 && (
                <>
                  <div>
                    <label className="block font-head text-sm mb-2 text-muted-foreground">
                      Floor Area
                    </label>
                    <p className="font-sans text-lg font-medium">
                      {facilityDetails.floor_area != null
                        ? `${facilityDetails.floor_area} m²`
                        : "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="block font-head text-sm mb-2 text-muted-foreground">
                      Number of Floors
                    </label>
                    <p className="font-sans text-lg font-medium">
                      {facilityDetails.number_of_floors != null
                        ? facilityDetails.number_of_floors
                        : "N/A"}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="bg-card border-4 border-border p-6 shadow-lg">
            <h3 className="font-head text-2xl mb-4 border-b-2 border-border pb-2">
              Location
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block font-head text-sm mb-2 text-muted-foreground">
                  Street
                </label>
                <p className="font-sans text-lg font-medium">
                  {facilityDetails.street || "N/A"}
                </p>
              </div>
              <div>
                <label className="block font-head text-sm mb-2 text-muted-foreground">
                  Building Number
                </label>
                <p className="font-sans text-lg font-medium">
                  {facilityDetails.building_no || "N/A"}
                </p>
              </div>
              {facilityDetails.address_details && (
                <div className="md:col-span-2">
                  <label className="block font-head text-sm mb-2 text-muted-foreground">
                    Address Details
                  </label>
                  <p className="font-sans text-lg font-medium">
                    {facilityDetails.address_details}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <Button onClick={onClose} className="flex-1 text-lg">
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
