interface FacilitySpecificationsProps {
  multistorey: boolean;
  totalArea: string;
  numberOfFloors: string;
  floorArea: string;
  onMultistoreyChange: (checked: boolean) => void;
  onTotalAreaChange: (value: string) => void;
  onNumberOfFloorsChange: (value: string) => void;
  onFloorAreaChange: (value: string) => void;
}

export default function FacilitySpecifications({
  multistorey,
  totalArea,
  numberOfFloors,
  floorArea,
  onMultistoreyChange,
  onTotalAreaChange,
  onNumberOfFloorsChange,
  onFloorAreaChange,
}: FacilitySpecificationsProps) {
  return (
    <div className="space-y-6">
      {/* Total Area */}
      <div>
        <label htmlFor="total_area" className="block font-head mb-2">
          Total Area (m²) <span className="text-destructive">*</span>
        </label>
        <input
          id="total_area"
          name="total_area"
          type="number"
          step="0.01"
          min="0.01"
          required
          value={totalArea}
          onChange={(e) => onTotalAreaChange(e.target.value)}
          readOnly={multistorey}
          className={`w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary ${
            multistorey ? "bg-muted cursor-not-allowed" : ""
          }`}
          placeholder="e.g., 500"
        />
        {multistorey && (
          <p className="text-sm text-muted-foreground mt-2 font-sans">
            Auto-calculated: Floor Area × Number of Floors
          </p>
        )}
      </div>

      {/* Multi-storey Checkbox */}
      <div className="flex items-center gap-3">
        <input
          id="multistorey"
          name="multistorey"
          type="checkbox"
          checked={multistorey}
          onChange={(e) => onMultistoreyChange(e.target.checked)}
          className="w-6 h-6 border-4 border-border"
        />
        <label htmlFor="multistorey" className="font-head text-lg">
          Multi-storey Building
        </label>
      </div>

      {/* Number of Floors and Floor Area (conditional) */}
      {multistorey && (
        <div className="grid md:grid-cols-2 gap-6 p-6 border-4 border-border bg-secondary/10">
          <div>
            <label htmlFor="number_of_floors" className="block font-head mb-2">
              Number of Floors <span className="text-destructive">*</span>
            </label>
            <input
              id="number_of_floors"
              name="number_of_floors"
              type="number"
              min="2"
              required={multistorey}
              value={numberOfFloors}
              onChange={(e) => onNumberOfFloorsChange(e.target.value)}
              className="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
              placeholder="e.g., 5"
            />
            <p className="text-sm text-muted-foreground mt-2 font-sans">
              Must be greater than 1
            </p>
          </div>

          <div>
            <label htmlFor="floor_area" className="block font-head mb-2">
              Floor Area (m²) <span className="text-destructive">*</span>
            </label>
            <input
              id="floor_area"
              name="floor_area"
              type="number"
              step="0.01"
              min="0.01"
              required={multistorey}
              value={floorArea}
              onChange={(e) => onFloorAreaChange(e.target.value)}
              className="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
              placeholder="e.g., 150"
            />
            <p className="text-sm text-muted-foreground mt-2 font-sans">
              Area per floor
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
