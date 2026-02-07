import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useFrappeGetDoc, useFrappeUpdateDoc, useFrappeGetDocList } from "frappe-react-sdk";
import { Button } from "@/components/retroui/Button";
import { ArrowLeft, Building2, MapPin, Layers, Edit, Save, X } from "lucide-react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { showSuccess, showWarning, showFrappeError } from "@/lib/errorHandler";
import type { Facility } from "@/types/Butler/Facility";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix for default marker icon in Leaflet with React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

export default function FacilityDetail() {
  const { facilityId } = useParams<{ facilityId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const leadId = searchParams.get("lead_id");
  const facilityFor = searchParams.get("facility_for") || "Lead";

  const [isEditMode, setIsEditMode] = useState(false);
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
  const [mapPosition, setMapPosition] = useState<[number, number]>([24.7136, 46.6753]);

  // Fetch facility data
  const {
    data: facility,
    error,
    isLoading,
    mutate,
  } = useFrappeGetDoc<Facility>("Facility", facilityId);

  // Fetch facility types
  const { data: facilityTypes } = useFrappeGetDocList<{ name: string }>("Facility Type", {
    fields: ["name"],
    limit: 100,
  });

  // Update form
  const { updateDoc, loading: isUpdating } = useFrappeUpdateDoc<Facility>();

  // Initialize form data when facility loads
  useEffect(() => {
    if (facility) {
      setFormData({
        facility_name: facility.facility_name || "",
        facility_type: facility.facility_type || "",
        total_area: facility.total_area?.toString() || "",
        multistorey: facility.multistorey === 1,
        number_of_floors: facility.number_of_floors?.toString() || "",
        floor_area: facility.floor_area?.toString() || "",
        street: facility.street || "",
        building_no: facility.building_no || "",
        latitude: facility.latitude?.toString() || "",
        longitude: facility.longitude?.toString() || "",
        address_details: facility.address_details || "",
      });

      if (facility.latitude && facility.longitude) {
        setMapPosition([facility.latitude, facility.longitude]);
      }
    }
  }, [facility]);

  const handleBack = () => {
    navigate(`/facilities?lead_id=${leadId}&facility_for=${facilityFor}`);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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
    if (isEditMode) {
      setMapPosition([lat, lng]);
      setFormData((prev) => ({
        ...prev,
        latitude: lat.toFixed(6),
        longitude: lng.toFixed(6),
      }));
    }
  };

  const handleEdit = () => {
    setIsEditMode(true);
  };

  const handleCancel = () => {
    setIsEditMode(false);
    // Reset form to original facility data
    if (facility) {
      setFormData({
        facility_name: facility.facility_name || "",
        facility_type: facility.facility_type || "",
        total_area: facility.total_area?.toString() || "",
        multistorey: facility.multistorey === 1,
        number_of_floors: facility.number_of_floors?.toString() || "",
        floor_area: facility.floor_area?.toString() || "",
        street: facility.street || "",
        building_no: facility.building_no || "",
        latitude: facility.latitude?.toString() || "",
        longitude: facility.longitude?.toString() || "",
        address_details: facility.address_details || "",
      });
      if (facility.latitude && facility.longitude) {
        setMapPosition([facility.latitude, facility.longitude]);
      }
    }
  };

  const handleSave = async () => {
    if (!formData.facility_name || !formData.facility_type || !formData.total_area) {
      showWarning("Please fill in all required fields");
      return;
    }

    if (!facilityId) return;

    try {
      const updateData: Partial<Facility> = {
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

      await updateDoc("Facility", facilityId, updateData);
      showSuccess("Facility updated successfully!");
      setIsEditMode(false);
      mutate(); // Refresh the data
    } catch (error) {
      console.error("Update failed:", error);
      showFrappeError(error);
    }
  };

  // Component to handle map clicks
  function LocationMarker() {
    useMapEvents({
      click(e) {
        if (isEditMode) {
          const { lat, lng } = e.latlng;
          handleMapClick(lat, lng);
        }
      },
    });

    return <Marker position={mapPosition} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-8 flex items-center justify-center">
        <div className="text-2xl font-head">Loading facility details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto">
          <ErrorBanner error={error} title="Failed to load facility" />
          <div className="mt-4">
            <Button onClick={handleBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Facilities
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!facility) {
    return (
      <div className="min-h-screen bg-background p-8 flex items-center justify-center">
        <div className="text-2xl font-head">Facility not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-primary border-4 border-border p-4 sm:p-6 shadow-xl mb-8">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 w-full lg:w-auto">
              <div className="bg-secondary p-4 border-4 border-border flex-shrink-0">
                <Building2 className="w-12 h-12 text-white" />
              </div>
              <div className="text-center sm:text-left flex-1 max-w-2xl">
                <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-head break-words">
                  {isEditMode ? (
                    <input
                      name="facility_name"
                      type="text"
                      value={formData.facility_name}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border-4 border-border font-head bg-white text-base sm:text-lg"
                      placeholder="Facility Name"
                    />
                  ) : (
                    facility.facility_name
                  )}
                </h1>
                <p className="mt-1 sm:mt-2 font-sans text-sm sm:text-base text-muted-foreground break-words">
                  {isEditMode ? (
                    <select
                      name="facility_type"
                      value={formData.facility_type}
                      onChange={handleInputChange}
                      className="px-4 py-2 border-4 border-border font-sans bg-white"
                    >
                      <option value="">Select Type</option>
                      {facilityTypes?.map((type) => (
                        <option key={type.name} value={type.name}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    facility.facility_type
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {isEditMode ? (
                <>
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    disabled={isUpdating}
                  >
                    <X className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={isUpdating}
                  >
                    <Save className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    {isUpdating ? "Saving..." : "Save"}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={handleBack}
                  >
                    <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    Back
                  </Button>
                  <Button
                    onClick={handleEdit}
                  >
                    <Edit className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    Edit
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left Column - Specifications */}
          <div className="border-4 border-border p-6 bg-secondary/10">
            <div className="flex items-center gap-2 mb-6">
              <Layers className="w-6 h-6 text-secondary" />
              <h2 className="text-2xl font-head">Specifications</h2>
            </div>

            <div className="space-y-6">
              {/* Multi-storey Checkbox */}
              {isEditMode && (
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="multistorey"
                    checked={formData.multistorey}
                    onChange={(e) => handleMultistoreyChange(e.target.checked)}
                    className="w-5 h-5 border-4 border-border"
                  />
                  <label htmlFor="multistorey" className="font-head text-lg cursor-pointer">
                    Multi-storey Building
                  </label>
                </div>
              )}

              {/* Multi-storey Badge (view mode) */}
              {!isEditMode && facility.multistorey === 1 && (
                <div className="px-4 py-2 bg-accent border-2 border-border font-sans inline-block">
                  Multi-storey Building
                </div>
              )}

              {/* Number of Floors (if multi-storey) */}
              {formData.multistorey && (
                <div>
                  <label htmlFor="number_of_floors" className="block font-head mb-2 text-sm">
                    Number of Floors {isEditMode && <span className="text-destructive">*</span>}
                  </label>
                  {isEditMode ? (
                    <input
                      id="number_of_floors"
                      name="number_of_floors"
                      type="number"
                      value={formData.number_of_floors}
                      onChange={(e) => handleNumberOfFloorsChange(e.target.value)}
                      className="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
                      placeholder="e.g., 3"
                      min="1"
                    />
                  ) : (
                    <div className="px-4 py-3 border-4 border-border font-sans bg-muted">
                      {facility.number_of_floors || "N/A"}
                    </div>
                  )}
                </div>
              )}

              {/* Floor Area (if multi-storey) */}
              {formData.multistorey && (
                <div>
                  <label htmlFor="floor_area" className="block font-head mb-2 text-sm">
                    Floor Area (m²) {isEditMode && <span className="text-destructive">*</span>}
                  </label>
                  {isEditMode ? (
                    <input
                      id="floor_area"
                      name="floor_area"
                      type="number"
                      step="0.01"
                      value={formData.floor_area}
                      onChange={(e) => handleFloorAreaChange(e.target.value)}
                      className="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
                      placeholder="e.g., 150.5"
                      min="0"
                    />
                  ) : (
                    <div className="px-4 py-3 border-4 border-border font-sans bg-muted">
                      {facility.floor_area ? `${facility.floor_area} m²` : "N/A"}
                    </div>
                  )}
                </div>
              )}

              {/* Total Area */}
              <div>
                <label htmlFor="total_area" className="block font-head mb-2 text-sm">
                  Total Area (m²) {isEditMode && <span className="text-destructive">*</span>}
                </label>
                {isEditMode ? (
                  <input
                    id="total_area"
                    name="total_area"
                    type="number"
                    step="0.01"
                    value={formData.total_area}
                    onChange={handleInputChange}
                    disabled={formData.multistorey}
                    className="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary disabled:bg-muted disabled:cursor-not-allowed"
                    placeholder="e.g., 500.0"
                    min="0"
                  />
                ) : (
                  <div className="px-4 py-3 border-4 border-border font-sans bg-muted">
                    {facility.total_area ? `${facility.total_area} m²` : "N/A"}
                  </div>
                )}
                {isEditMode && formData.multistorey && (
                  <p className="text-xs text-muted-foreground mt-1 font-sans">
                    Auto-calculated from floors × floor area
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Location & Address */}
          <div className="border-4 border-border p-6 bg-secondary/10">
            <div className="flex items-center gap-2 mb-6">
              <MapPin className="w-6 h-6 text-secondary" />
              <h2 className="text-2xl font-head">Location & Address</h2>
            </div>

            <div className="space-y-6">
              {/* Map */}
              <div>
                <label className="block font-head mb-2">
                  {isEditMode ? "Click on map to set location" : "Location"}
                </label>
                {isEditMode && (
                  <p className="text-sm text-muted-foreground mb-3 font-sans">
                    Click on the map to update the facility location
                  </p>
                )}
                <div className="border-4 border-border h-[300px] relative">
                  <MapContainer
                    center={mapPosition}
                    zoom={15}
                    style={{ height: "100%", width: "100%" }}
                    scrollWheelZoom={isEditMode}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <LocationMarker />
                  </MapContainer>
                </div>
              </div>

              {/* Coordinates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="latitude" className="block font-head mb-2 text-sm">
                    Latitude
                  </label>
                  <input
                    id="latitude"
                    name="latitude"
                    type="text"
                    value={formData.latitude}
                    readOnly
                    className="w-full px-4 py-3 border-4 border-border font-sans bg-muted cursor-not-allowed"
                    placeholder="Click on map"
                  />
                </div>
                <div>
                  <label htmlFor="longitude" className="block font-head mb-2 text-sm">
                    Longitude
                  </label>
                  <input
                    id="longitude"
                    name="longitude"
                    type="text"
                    value={formData.longitude}
                    readOnly
                    className="w-full px-4 py-3 border-4 border-border font-sans bg-muted cursor-not-allowed"
                    placeholder="Click on map"
                  />
                </div>
              </div>

              {/* Building Number */}
              <div>
                <label htmlFor="building_no" className="block font-head mb-2 text-sm">
                  Building Number
                </label>
                {isEditMode ? (
                  <input
                    id="building_no"
                    name="building_no"
                    type="text"
                    value={formData.building_no}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
                    placeholder="e.g., 123"
                  />
                ) : (
                  <div className="px-4 py-3 border-4 border-border font-sans bg-muted">
                    {facility.building_no || "N/A"}
                  </div>
                )}
              </div>

              {/* Street */}
              <div>
                <label htmlFor="street" className="block font-head mb-2 text-sm">
                  Street
                </label>
                {isEditMode ? (
                  <input
                    id="street"
                    name="street"
                    type="text"
                    value={formData.street}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
                    placeholder="e.g., Main Street"
                  />
                ) : (
                  <div className="px-4 py-3 border-4 border-border font-sans bg-muted">
                    {facility.street || "N/A"}
                  </div>
                )}
              </div>

              {/* Address Details */}
              <div>
                <label htmlFor="address_details" className="block font-head mb-2 text-sm">
                  Address Details
                </label>
                {isEditMode ? (
                  <textarea
                    id="address_details"
                    name="address_details"
                    rows={3}
                    value={formData.address_details}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary resize-none"
                    placeholder="Additional address information..."
                  />
                ) : (
                  <div className="px-4 py-3 border-4 border-border font-sans bg-muted min-h-[80px]">
                    {facility.address_details || "N/A"}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Metadata */}
        <div className="mt-8 border-4 border-border p-6 bg-card">
          <h3 className="font-head text-xl mb-4">Document Information</h3>
          <div className="grid md:grid-cols-3 gap-4 font-sans text-sm">
            <div>
              <span className="text-muted-foreground">Document ID:</span>{" "}
              <span className="font-bold">{facility.name}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Created:</span>{" "}
              <span className="font-bold">
                {new Date(facility.creation).toLocaleDateString()}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Modified:</span>{" "}
              <span className="font-bold">
                {new Date(facility.modified).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
