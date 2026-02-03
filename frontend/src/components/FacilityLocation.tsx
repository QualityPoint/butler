import { MapPin } from "lucide-react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface FacilityLocationProps {
  mapPosition: [number, number];
  latitude: string;
  longitude: string;
  street: string;
  buildingNo: string;
  addressDetails: string;
  onMapClick: (lat: number, lng: number) => void;
  onStreetChange: (value: string) => void;
  onBuildingNoChange: (value: string) => void;
  onAddressDetailsChange: (value: string) => void;
}

export default function FacilityLocation({
  mapPosition,
  latitude,
  longitude,
  street,
  buildingNo,
  addressDetails,
  onMapClick,
  onStreetChange,
  onBuildingNoChange,
  onAddressDetailsChange,
}: FacilityLocationProps) {
  // Component to handle map clicks
  function LocationMarker() {
    useMapEvents({
      click(e) {
        const { lat, lng } = e.latlng;
        onMapClick(lat, lng);
      },
    });

    return <Marker position={mapPosition} />;
  }

  return (
    <div className="border-4 border-border p-6 bg-secondary/10">
      <div className="flex items-center gap-2 mb-4">
        <MapPin className="w-6 h-6 text-secondary" />
        <h2 className="text-2xl font-head">Location & Address</h2>
      </div>

      {/* Map Container */}
      <div className="mb-6">
        <label className="block font-head mb-2">Select Location on Map</label>
        <p className="text-sm text-muted-foreground mb-3 font-sans">
          Click on the map to set the facility location
        </p>
        <div className="border-4 border-border h-[400px] relative">
          <MapContainer
            center={mapPosition}
            zoom={13}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <LocationMarker />
          </MapContainer>
        </div>
      </div>

      {/* Coordinates Display */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div>
          <label htmlFor="latitude" className="block font-head mb-2">
            Latitude
          </label>
          <input
            id="latitude"
            name="latitude"
            type="text"
            value={latitude}
            readOnly
            className="w-full px-4 py-3 border-4 border-border font-sans bg-muted cursor-not-allowed"
            placeholder="Click on map"
          />
        </div>

        <div>
          <label htmlFor="longitude" className="block font-head mb-2">
            Longitude
          </label>
          <input
            id="longitude"
            name="longitude"
            type="text"
            value={longitude}
            readOnly
            className="w-full px-4 py-3 border-4 border-border font-sans bg-muted cursor-not-allowed"
            placeholder="Click on map"
          />
        </div>
      </div>

      {/* National Address Fields */}
      <div className="space-y-6">
        <h3 className="text-xl font-head">National Address</h3>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="building_no" className="block font-head mb-2">
              Building Number
            </label>
            <input
              id="building_no"
              name="building_no"
              type="text"
              value={buildingNo}
              onChange={(e) => onBuildingNoChange(e.target.value)}
              className="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
              placeholder="e.g., 123"
            />
          </div>

          <div>
            <label htmlFor="street" className="block font-head mb-2">
              Street
            </label>
            <input
              id="street"
              name="street"
              type="text"
              value={street}
              onChange={(e) => onStreetChange(e.target.value)}
              className="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
              placeholder="e.g., Main Street"
            />
          </div>
        </div>

        {/* Address Details */}
        <div>
          <label htmlFor="address_details" className="block font-head mb-2">
            Address Details
          </label>
          <textarea
            id="address_details"
            name="address_details"
            rows={3}
            value={addressDetails}
            onChange={(e) => onAddressDetailsChange(e.target.value)}
            className="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary resize-none"
            placeholder="Additional address information..."
          />
        </div>
      </div>
    </div>
  );
}
