// Package data from Packages.csv
export interface PackageItem {
  id: string;
  name: string;
  category: string;
  count: number;
}

export const packageCategories = [
  "Comfort",
  "Hospitality",
  "Efficient",
  "Entertainment",
  "Security",
] as const;

export type PackageCategory = (typeof packageCategories)[number];

export const packageData: Record<PackageCategory, string[]> = {
  Comfort: [
    "Master Bedroom",
    "Bedroom",
    "Living area",
    "Dressings",
    "Kitchen",
    "Home Office",
    "Balcony",
    "wardrobe",
    "Makeup",
    "Kitchener",
    "Dinning",
    "kids",
  ],
  Hospitality: [
    "Majlis",
    "Dewaniyah",
    "guest Dinning",
    "Fountain",
    "Outdoor Setting Area",
    "Celebration hall",
    "guest Entrance",
    "guest room",
    "guest Washroom",
    "guest Corridors",
    "guest WC's",
  ],
  Efficient: [
    "Washroom",
    "Laundry",
    "Storage",
    "Courtyard",
    "Home Front",
    "Stairs",
    "Corridors",
    "Entrance",
    "roof",
    "shawer",
    "landscape",
    "WC's",
  ],
  Entertainment: [
    "Pool",
    "Gym",
    "barber",
    "Cinema",
    "Cigar Lounge",
    "Bar",
    "Bowling",
    "Yoga",
    "Library",
    "Drawing",
    "Toys room",
    "Gamming room",
    "Spa",
    "Outdoor Sport Area",
    "Billiards",
    "Jacuuzi",
    "suna",
    "Mini Mosque",
    "Music room",
  ],
  Security: [
    "cctv",
    "intercom",
    "Security Kitchen",
    "Pool Security",
    "door lock",
  ],
};

// Generate items with unique IDs
export const getAllPackageItems = (): PackageItem[] => {
  const items: PackageItem[] = [];

  Object.entries(packageData).forEach(([category, itemNames]) => {
    itemNames.forEach((name) => {
      items.push({
        id: `${category.toLowerCase()}-${name.toLowerCase().replace(/\s+/g, "-")}`,
        name,
        category,
        count: 1,
      });
    });
  });

  return items;
};
