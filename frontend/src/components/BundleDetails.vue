<template>
  <div
    v-if="bundleDetails && orderType === 'Bundle'"
    class="mt-8 bg-accent border-4 border-border p-6 shadow-lg"
  >
    <h3
      class="text-xl sm:text-2xl font-head mb-4 border-b-2 border-border pb-2 break-words"
    >
      Bundle Details
    </h3>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Bundle Price -->
      <div class="p-4 bg-card border-2 border-border">
        <div class="flex justify-between items-center">
          <span class="font-head text-lg">Bundle Price:</span>
          <span class="font-sans text-2xl font-bold text-primary">
            {{ bundleDetails.bundle_price.toLocaleString() }} SAR
          </span>
        </div>
      </div>

      <!-- Amenity Requirements -->
      <div class="space-y-2">
        <h4 class="font-head text-lg mb-2">Required Amenities Progress:</h4>
        <div class="grid grid-cols-1 gap-2">
          <div
            v-for="category in bundleDetails.amenity_categories"
            :key="category.amenity_category"
            class="p-2 border-2 border-border"
            :class="
              selectedCount(category) >= category.amenity_count
                ? 'bg-green-100'
                : 'bg-background'
            "
          >
            <div class="flex justify-between items-center">
              <span class="font-sans font-medium text-sm">
                {{ category.amenity_category }}
              </span>
              <span
                class="font-head"
                :class="
                  selectedCount(category) >= category.amenity_count
                    ? 'text-green-600'
                    : 'text-muted-foreground'
                "
              >
                {{ selectedCount(category) }}/{{ category.amenity_count }}
                <template
                  v-if="selectedCount(category) >= category.amenity_count"
                >
                  ✓
                </template>
              </span>
            </div>
            <!-- Progress Bar -->
            <div class="mt-1 w-full h-1.5 bg-muted border border-border">
              <div
                class="h-full transition-all"
                :class="
                  selectedCount(category) >= category.amenity_count
                    ? 'bg-green-500'
                    : 'bg-primary'
                "
                :style="{
                  width: `${Math.min(
                    (selectedCount(category) / category.amenity_count) *
                      100,
                    100,
                  )}%`,
                }"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PackageItem } from "@/data/packages";
import type {
  BundleCategory,
  BundleDetails,
  OrderType,
} from "@/types/service";

const props = defineProps<{
  bundleDetails: BundleDetails | null;
  orderType: OrderType;
  selectedItems: PackageItem[];
}>();

function selectedCount(category: BundleCategory) {
  return props.selectedItems
    .filter((item) => item.category === category.amenity_category)
    .reduce((sum, item) => sum + item.count, 0);
}
</script>
