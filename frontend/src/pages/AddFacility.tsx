import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useFrappeCreateDoc, useFrappeGetDocList } from "frappe-react-sdk";
import { Button } from "@/components/retroui/Button";
import { Home } from "lucide-react";
import { showSuccess, showWarning, showFrappeError } from "@/lib/errorHandler";
import FacilitySpecifications from "@/components/FacilitySpecifications";
import FacilityLocation from "@/components/FacilityLocation";
import L from "leaflet";
import type { Facility } from "@/types/Butler/Facility";

// Fix for default marker icon in Leaflet with React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

export default function AddFacility() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { createDoc } = useFrappeCreateDoc();

  const leadId = searchParams.get("lead_id");
  const facilityFor = searchParams.get("facility_for") || "Lead";

  // Fetch facility types
  const { data: facilityTypes, isLoading: typesLoading } =
    useFrappeGetDocList<{ name: string }>("Facility Type", {
      fields: ["name"],
      limit: 100,
    });

  const [formData, setFormData] = useState({
    facility_name: "",
    facility_type: "",
    total_area: "",
    multistorey: false,
    number_of_floors: "",
    floor_area: "",
    street: "",
    building_no: "",
    latitude: "",
    longitude: "",
    address_details: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mapPosition, setMapPosition] = useState<[number, number]>([24.7136, 46.6753]); // Default: Riyadh, Saudi Arabia

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleMultistoreyChange = (checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      multistorey: checked,
      total_area: checked ? "" : prev.total_area,
      number_of_floors: checked ? prev.number_of_floors : "",
      floor_area: checked ? prev.floor_area : "",
    }));
  };

  const handleNumberOfFloorsChange = (value: string) => {
    setFormData((prev) => {
      const floors = parseFloat(value);
      const area = parseFloat(prev.floor_area);
      return {
        ...prev,
        number_of_floors: value,
        total_area: floors && area && floors > 0 && area > 0 ? (floors * area).toString() : prev.total_area,
      };
    });
  };

  const handleFloorAreaChange = (value: string) => {
    setFormData((prev) => {
      const floors = parseFloat(prev.number_of_floors);
      const area = parseFloat(value);
      return {
        ...prev,
        floor_area: value,
        total_area: floors && area && floors > 0 && area > 0 ? (floors * area).toString() : prev.total_area,
      };
    });
  };

  const handleMapClick = (lat: number, lng: number) => {
    setMapPosition([lat, lng]);
    setFormData((prev) => ({
      ...prev,
      latitude: lat.toFixed(6),
      longitude: lng.toFixed(6),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.facility_name ||
      !formData.facility_type ||
      !formData.total_area
    ) {
      showWarning("Please fill in all required fields");
      return;
    }

    if (!leadId) {
      showWarning("Missing lead information");
      return;
    }

    setIsSubmitting(true);

    try {
      const facilityData: Partial<Facility> = {
        facility_for: facilityFor,
        party_name: leadId,
        facility_name: formData.facility_name,
        facility_type: formData.facility_type,
        total_area: parseFloat(formData.total_area),
        multistorey: formData.multistorey ? 1 : 0,
        number_of_floors: formData.multistorey && formData.number_of_floors
          ? parseInt(formData.number_of_floors)
          : undefined,
        floor_area: formData.multistorey && formData.floor_area
          ? parseFloat(formData.floor_area)
          : undefined,
        street: formData.street || undefined,
        building_no: formData.building_no || undefined,
        latitude: formData.latitude ? parseFloat(formData.latitude) : undefined,
        longitude: formData.longitude ? parseFloat(formData.longitude) : undefined,
        address_details: formData.address_details || undefined,
      };

      const newFacility = await createDoc("Facility", facilityData);
      console.log("Facility created:", newFacility);

      showSuccess("Facility added successfully!");

      // Navigate back to facilities list
      setTimeout(() => {
        navigate(`/facilities?lead_id=${leadId}&facility_for=${facilityFor}`);
      }, 1000);
    } catch (error) {
      console.error("Facility creation failed:", error);
      showFrappeError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="bg-primary border-4 border-border p-4 sm:p-6 shadow-xl mb-8">
          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 justify-center">
            <img
              src="/assets/butler/images/logo.svg"
              alt="Butler Logo"
              className="h-16 w-16 sm:h-20 sm:w-20 flex-shrink-0"
            />
            <div className="text-center sm:text-left max-w-xl">
              <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-head break-words">Add New Facility</h1>
              <p className="mt-1 sm:mt-2 font-sans text-sm sm:text-base break-words">
                Register your property or building
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="bg-card border-4 border-border p-8 shadow-lg">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Facility Name */}
            <div>
              <label htmlFor="facility_name" className="block font-head mb-2">
                Facility Name <span className="text-destructive">*</span>
              </label>
              <input
                id="facility_name"
                name="facility_name"
                type="text"
                required
                value={formData.facility_name}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
                placeholder="e.g., Main Office Building"
              />
            </div>

            {/* Facility Type */}
            <div>
              <label htmlFor="facility_type" className="block font-head mb-2">
                Facility Type <span className="text-destructive">*</span>
              </label>
              <select
                id="facility_type"
                name="facility_type"
                required
                value={formData.facility_type}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary bg-white"
                disabled={typesLoading}
              >
                <option value="">
                  {typesLoading ? "Loading..." : "Select Facility Type"}
                </option>
                {facilityTypes?.map((type) => (
                  <option key={type.name} value={type.name}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Facility Specifications */}
            <FacilitySpecifications
              multistorey={formData.multistorey}
              totalArea={formData.total_area}
              numberOfFloors={formData.number_of_floors}
              floorArea={formData.floor_area}
              onMultistoreyChange={handleMultistoreyChange}
              onTotalAreaChange={(value) => setFormData((prev) => ({ ...prev, total_area: value }))}
              onNumberOfFloorsChange={handleNumberOfFloorsChange}
              onFloorAreaChange={handleFloorAreaChange}
            />

            {/* Location Section */}
            <FacilityLocation
              mapPosition={mapPosition}
              latitude={formData.latitude}
              longitude={formData.longitude}
              street={formData.street}
              buildingNo={formData.building_no}
              addressDetails={formData.address_details}
              onMapClick={handleMapClick}
              onStreetChange={(value) => setFormData((prev) => ({ ...prev, street: value }))}
              onBuildingNoChange={(value) => setFormData((prev) => ({ ...prev, building_no: value }))}
              onAddressDetailsChange={(value) => setFormData((prev) => ({ ...prev, address_details: value }))}
            />

            {/* Submit Buttons */}
            <div className="flex flex-wrap gap-2 sm:gap-4 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/")}
                disabled={isSubmitting}
                className="text-sm sm:text-base"
              >
                <Home className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Home</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  navigate(`/facilities?lead_id=${leadId}&facility_for=${facilityFor}`)
                }
                className="flex-1 text-sm sm:text-base min-w-[80px]"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 text-base sm:text-lg min-w-[100px]"
                disabled={isSubmitting || typesLoading}
              >
                {isSubmitting ? "Adding..." : "Add Facility"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
