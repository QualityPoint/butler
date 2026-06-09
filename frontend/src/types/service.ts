export type OrderType = "" | "Bundle" | "Quotation" | "Amenities";

export interface BundleCategory {
  amenity_category: string;
  number_of_amenities: number;
}

export interface BundleDetails {
  bundle_price: number;
  amenity_categories: BundleCategory[];
}

export interface AmenityCategory {
  name: string;
  category_name: string;
  description?: string;
  image?: string;
}

export interface Amenity {
  name: string;
  amenity_name: string;
  amenity_category: string;
  amenity_price: number;
  lines: number;
  image?: string;
  disabled: number;
}
