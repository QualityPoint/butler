import { useEffect } from "react";
import { useFrappeGetDocList } from "frappe-react-sdk";
import type { PackageItem } from "@/data/packages";

type OrderType = "" | "Bundle" | "Quotation" | "Amenities";

interface BundleCategory {
  amenity_category: string;
  number_of_amenities: number;
}

interface BundleDetails {
  bundle_price: number;
  amenity_categories: BundleCategory[];
}

interface BundleProps {
  orderType: OrderType;
  bundleType: string;
  bundleDetails: BundleDetails | null;
  selectedItems: PackageItem[];
  onOrderTypeChange: (orderType: OrderType) => void;
  onBundleTypeChange: (bundleType: string) => void;
  onBundleDetailsChange: (details: BundleDetails | null) => void;
  disabled?: boolean;
}

export function Bundle({
  orderType,
  bundleType,
  onOrderTypeChange,
  onBundleTypeChange,
  onBundleDetailsChange,
  disabled = false,
}: BundleProps) {
  // Fetch Butler Bundles for dropdown
  const { data: bundles } = useFrappeGetDocList<{ name: string; bundle_name: string }>(
    "Butler Bundle",
    {
      fields: ["name", "bundle_name"],
      limit: 100,
    }
  );

  // Fetch bundle details when bundle_type changes
  useEffect(() => {
    const fetchBundleDetails = async () => {
      if (bundleType && orderType === "Bundle") {
        try {
          console.log("Fetching bundle details for:", bundleType);
          const response = await fetch(
            `/api/method/butler.butler.doctype.service_order.service_order.get_bundle_details`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Frappe-CSRF-Token": (window as any).csrf_token,
              },
              body: JSON.stringify({ bundle_type: bundleType }),
            }
          );
          const data = await response.json();
          console.log("Bundle details response:", data);
          if (data.message) {
            console.log("Setting bundle details:", data.message);
            onBundleDetailsChange(data.message);
          } else {
            console.warn("No message in response:", data);
          }
        } catch (error) {
          console.error("Failed to fetch bundle details:", error);
        }
      } else {
        onBundleDetailsChange(null);
      }
    };
    fetchBundleDetails();
  }, [bundleType, orderType, onBundleDetailsChange]);

  return (
    /* Order Configuration */
    <div className="bg-card border-4 border-border p-6 shadow-lg">
      <h3 className="text-2xl font-head mb-4 border-b-2 border-border pb-2">
        Order Configuration
      </h3>

      {/* Order Type */}
      <div className="mb-4">
        <label htmlFor="order_type" className="block font-head mb-2 text-sm">
          Order Type <span className="text-destructive">*</span>
        </label>
        <select
          id="order_type"
          value={orderType}
          onChange={(e) => onOrderTypeChange(e.target.value as OrderType)}
          className="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary disabled:bg-muted disabled:cursor-not-allowed"
          disabled={disabled}
        >
          <option value="">Select Order Type</option>
          <option value="Bundle">Bundle</option>
          <option value="Quotation">Quotation</option>
          <option value="Amenities">Amenities</option>
        </select>
      </div>

      {/* Bundle Type (conditional) */}
      {orderType === "Bundle" && (
        <div className="mb-4">
          <label htmlFor="bundle_type" className="block font-head mb-2 text-sm">
            Bundle Type <span className="text-destructive">*</span>
          </label>
          <select
            id="bundle_type"
            value={bundleType}
            onChange={(e) => onBundleTypeChange(e.target.value)}
            className="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary disabled:bg-muted disabled:cursor-not-allowed"
            disabled={disabled}
          >
            <option value="">Select Bundle</option>
            {bundles?.map((bundle) => (
              <option key={bundle.name} value={bundle.name}>
                {bundle.bundle_name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

// Separate component for Bundle Details display
export function BundleDetails({
  bundleDetails,
  orderType,
  selectedItems,
}: {
  bundleDetails: BundleDetails | null;
  orderType: OrderType;
  selectedItems: PackageItem[];
}) {
  if (!bundleDetails || orderType !== "Bundle") {
    return null;
  }

  return (
    <div className="mt-8 bg-accent border-4 border-border p-6 shadow-lg">
      <h3 className="text-2xl font-head mb-4 border-b-2 border-border pb-2">
        Bundle Details
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bundle Price */}
        <div className="p-4 bg-card border-2 border-border">
          <div className="flex justify-between items-center">
            <span className="font-head text-lg">Bundle Price:</span>
            <span className="font-sans text-2xl font-bold text-primary">
              {bundleDetails.bundle_price.toLocaleString()} SAR
            </span>
          </div>
        </div>

        {/* Amenity Requirements */}
        <div className="space-y-2">
          <h4 className="font-head text-lg mb-2">Required Amenities Progress:</h4>
          <div className="grid grid-cols-1 gap-2">
            {bundleDetails.amenity_categories.map((category) => {
              const selectedCount = selectedItems
                .filter((item) => item.category === category.amenity_category)
                .reduce((sum, item) => sum + item.count, 0);
              const isComplete = selectedCount >= category.number_of_amenities;

              return (
                <div
                  key={category.amenity_category}
                  className={`p-2 border-2 border-border ${
                    isComplete ? "bg-green-100" : "bg-background"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-sans font-medium text-sm">
                      {category.amenity_category}
                    </span>
                    <span
                      className={`font-head ${
                        isComplete ? "text-green-600" : "text-muted-foreground"
                      }`}
                    >
                      {selectedCount}/{category.number_of_amenities}
                      {isComplete && " ✓"}
                    </span>
                  </div>
                  {/* Progress Bar */}
                  <div className="mt-1 w-full h-1.5 bg-muted border border-border">
                    <div
                      className={`h-full transition-all ${
                        isComplete ? "bg-green-500" : "bg-primary"
                      }`}
                      style={{
                        width: `${Math.min(
                          (selectedCount / category.number_of_amenities) * 100,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
