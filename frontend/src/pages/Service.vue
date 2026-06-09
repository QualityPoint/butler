<template>
  <div class="min-h-screen bg-background p-8">
    <div class="max-w-7xl mx-auto">
      <!-- Header -->
      <div class="bg-primary border-4 border-border p-6 shadow-xl mb-8">
        <div class="flex items-center gap-4">
          <div class="flex justify-center">
            <img
              src="/assets/butler/images/logo.svg"
              alt="Butler Logo"
              class="h-20 w-20"
            />
          </div>
          <div class="w-full max-w-2xl">
            <h1
              class="text-3xl sm:text-4xl font-head text-center break-words"
            >
              Service Packages
            </h1>
            <p class="text-center mt-2 font-sans text-base sm:text-lg break-words">
              Drag and drop items to build your custom package
            </p>
          </div>
        </div>
      </div>

      <!-- Warning if no facility selected -->
      <div
        v-if="!facilityId && !existingOrder?.facility"
        class="bg-destructive border-4 border-border p-6 shadow-lg mb-8 text-center"
      >
        <p class="font-head text-xl text-white">
          ⚠️ No facility selected. Please select a facility from the Facilities
          page first.
        </p>
      </div>

      <!-- Facility ID Display -->
      <div
        v-if="facilityId || existingOrder?.facility"
        class="bg-card border-4 border-border p-6 shadow-lg mb-8"
      >
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <label class="block font-head mb-2 text-sm">Facility</label>
            <div class="px-4 py-3 border-4 border-border font-sans bg-muted">
              {{ facilityId || existingOrder?.facility }}
            </div>
          </div>
          <Button
            variant="outline"
            class="ml-4"
            @click="isFacilityModalOpen = true"
          >
            View Details
          </Button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Left: Category Selection -->
        <div class="space-y-6">
          <div class="bg-card border-4 border-border p-6 shadow-lg">
            <h2
              class="text-2xl font-head mb-4 border-b-2 border-border pb-2 break-words"
            >
              Categories
            </h2>
            <div class="flex flex-wrap gap-3">
              <Button
                v-for="category in visibleCategories"
                :key="category.name"
                :variant="
                  selectedCategory === category.name ? 'secondary' : 'outline'
                "
                class="relative"
                @click="selectedCategory = category.name"
              >
                {{ category.category_name }}
                <span
                  v-if="
                    orderType === 'Bundle' &&
                    bundleDetails &&
                    bundleCategoryFor(category.name)
                  "
                  class="ml-2 px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded"
                >
                  {{ categorySelectedCount(category.name) }}/{{
                    bundleCategoryFor(category.name)?.number_of_amenities
                  }}
                </span>
              </Button>
              <p
                v-if="orderType === 'Bundle' && !bundleDetails"
                class="text-muted-foreground font-sans text-sm"
              >
                Please select a bundle to see available categories
              </p>
            </div>
          </div>

          <!-- Available Items -->
          <div class="bg-card border-4 border-border p-6 shadow-lg">
            <h3
              class="text-xl font-head mb-4 border-b-2 border-border pb-2 break-words line-clamp-2"
            >
              {{ selectedCategoryLabel }} Items
            </h3>
            <draggable
              :list="availableAmenities"
              :group="{ name: 'amenities', pull: 'clone', put: false }"
              :sort="false"
              :clone="cloneAmenity"
              :move="onMoveAvailable"
              item-key="name"
              filter=".amenity-disabled"
              class="flex flex-col gap-3 h-125 overflow-y-auto pr-2"
            >
              <template #item="{ element }">
                <AmenityCard
                  :amenity="element"
                  :is-selected="isAmenitySelected(element)"
                  :is-category-full="isAmenityCategoryFull(element)"
                />
              </template>
            </draggable>
          </div>
        </div>

        <!-- Right: Selected Items -->
        <div class="space-y-6">
          <Bundle
            :order-type="orderType"
            :bundle-type="bundleType"
            :disabled="!isEditable"
            @update:order-type="onOrderTypeChange"
            @update:bundle-type="onBundleTypeChange"
            @update:bundle-details="bundleDetails = $event"
          />

          <DroppableArea
            v-model="selectedItems"
            :disabled="!isEditable"
            @add="onAdd"
            @remove="handleRemoveItem"
            @increment="handleIncrementCount"
            @decrement="handleDecrementCount"
            @clear-all="handleClearAll"
          />
        </div>
      </div>

      <!-- Bundle Details - Full Width Below -->
      <BundleDetails
        :bundle-details="bundleDetails"
        :order-type="orderType"
        :selected-items="selectedItems"
      />

      <!-- Make Order Button -->
      <div v-if="isEditable" class="mt-8 flex justify-center">
        <Button
          size="lg"
          class="text-xl px-12 py-6"
          :disabled="selectedItems.length === 0 || isCreating || isUpdating"
          @click="handleMakeOrder"
        >
          {{ isEditMode ? "Update Order" : "Make Order" }}
        </Button>
      </div>
      <div
        v-if="isEditMode && !isEditable"
        class="mt-8 bg-yellow-100 border-4 border-yellow-400 p-4 text-center"
      >
        <p class="font-head text-lg">
          This order has been submitted and cannot be edited.
        </p>
      </div>

      <!-- Navigation Buttons -->
      <div class="mt-6 flex flex-wrap justify-center gap-2 sm:gap-4">
        <Button
          variant="outline"
          class="text-sm sm:text-base"
          @click="router.back()"
        >
          <ArrowLeft class="w-4 h-4 sm:mr-2" />
          <span class="hidden sm:inline">Back</span>
        </Button>
        <Button
          variant="outline"
          class="text-sm sm:text-base"
          @click="router.push('/')"
        >
          <Home class="w-4 h-4 sm:mr-2" />
          <span class="hidden sm:inline">Home</span>
        </Button>
      </div>
    </div>
  </div>

  <Congratulations
    :is-open="isModalOpen"
    :item-count="totalItemCount"
    @close="isModalOpen = false"
  />

  <FacilityDetailsModal
    :facility-id="facilityId || existingOrder?.facility || ''"
    :is-open="isFacilityModalOpen"
    @close="isFacilityModalOpen = false"
  />

  <ConfirmationDialog
    :is-open="isConfirmDialogOpen"
    :title="isEditMode ? 'Update Service Order' : 'Create Service Order'"
    :message="
      isEditMode
        ? `Are you sure you want to update this service order with ${totalItemCount} items?`
        : `Are you sure you want to create a service order for facility ${
            facilityId || existingOrder?.facility
          } with ${totalItemCount} items?`
    "
    :confirm-text="isEditMode ? 'Update Order' : 'Create Order'"
    cancel-text="Cancel"
    :is-loading="isCreating || isUpdating"
    @close="isConfirmDialogOpen = false"
    @confirm="handleConfirmOrder"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import draggable from "vuedraggable";
import { Home, ArrowLeft } from "lucide-vue-next";
import Button from "@/components/retroui/Button.vue";
import { showWarning } from "@/lib/errorHandler";
import ConfirmationDialog from "@/components/ui/ConfirmationDialog.vue";
import Congratulations from "@/components/ui/Congratulations.vue";
import FacilityDetailsModal from "@/components/FacilityDetailsModal.vue";
import Bundle from "@/components/Bundle.vue";
import BundleDetails from "@/components/BundleDetails.vue";
import AmenityCard from "@/components/service/AmenityCard.vue";
import DroppableArea from "@/components/service/DroppableArea.vue";
import type { PackageItem } from "@/data/packages";
import type {
  Amenity,
  AmenityCategory,
  BundleCategory,
  BundleDetails as BundleDetailsType,
  OrderType,
} from "@/types/service";
import {
  useFrappeGetDocList,
  useFrappeGetDoc,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
} from "@/composables/frappe";

interface ExistingOrder {
  name: string;
  facility: string;
  order_type: string;
  bundle_type?: string;
  bundle_price?: number;
  docstatus: number;
  amenities: Array<{ amenity_name: string; count: number }>;
}

const route = useRoute();
const router = useRouter();

const facilityId = computed(() => (route.query.facility_id as string) || "");
const orderId = computed(() => (route.query.order_id as string) || "");

const selectedCategory = ref<string>("");
const selectedItems = ref<PackageItem[]>([]);
const isConfirmDialogOpen = ref(false);
const isModalOpen = ref(false);
const isFacilityModalOpen = ref(false);

const orderType = ref<OrderType>("Amenities");
const bundleType = ref<string>("");
const bundleDetails = ref<BundleDetailsType | null>(null);

const { createDoc, loading: isCreating } = useFrappeCreateDoc();
const { updateDoc, loading: isUpdating } = useFrappeUpdateDoc();

// Fetch existing order if orderId is provided
const { data: existingOrder } = useFrappeGetDoc<ExistingOrder>(
  "Service Order",
  () => orderId.value || undefined,
);

const isEditMode = computed(() => !!orderId.value);
const isEditable = computed(
  () => !isEditMode.value || existingOrder.value?.docstatus === 0,
);

// Fetch Amenity Categories
const { data: amenityCategories } = useFrappeGetDocList<AmenityCategory>(
  "Amenity Category",
  {
    fields: ["name", "category_name", "description", "image"],
    limit: 100,
  },
);

// Fetch Amenities
const { data: amenities } = useFrappeGetDocList<Amenity>("Amenity", {
  fields: [
    "name",
    "amenity_name",
    "amenity_category",
    "amenity_price",
    "lines",
    "image",
    "disabled",
  ],
  filters: [["disabled", "=", 0]],
  limit: 1000,
});

const totalItemCount = computed(() =>
  selectedItems.value.reduce((sum, item) => sum + item.count, 0),
);

/* --- Effects (ported from React useEffect) --- */

// Load existing order data
watch(
  () => [existingOrder.value, amenities.value] as const,
  ([order, amenityList]) => {
    if (order && amenityList && order.amenities?.length > 0) {
      orderType.value = order.order_type as OrderType;
      if (order.bundle_type) bundleType.value = order.bundle_type;

      selectedItems.value = order.amenities.map((orderAmenity) => {
        const amenity = amenityList.find(
          (a) => a.name === orderAmenity.amenity_name,
        );
        return {
          id: orderAmenity.amenity_name,
          name: amenity?.amenity_name || orderAmenity.amenity_name,
          category: amenity?.amenity_category || "",
          count: orderAmenity.count,
        };
      });
    }
  },
  { immediate: true },
);

// Set initial category when categories are loaded
watch(
  amenityCategories,
  (cats) => {
    if (cats && cats.length > 0 && !selectedCategory.value) {
      selectedCategory.value = cats[0].name;
    }
  },
  { immediate: true },
);

// Update selected category when bundle details change
watch(
  () => [bundleDetails.value, orderType.value, amenityCategories.value] as const,
  ([details, type, cats]) => {
    if (type === "Bundle" && details && details.amenity_categories.length > 0) {
      const currentInBundle = details.amenity_categories.some(
        (bc) => bc.amenity_category === selectedCategory.value,
      );
      if (!currentInBundle) {
        selectedCategory.value = details.amenity_categories[0].amenity_category;
      }
    } else if (type !== "Bundle" && cats && cats.length > 0 && !selectedCategory.value) {
      selectedCategory.value = cats[0].name;
    }
  },
);

/* --- User-driven order/bundle changes (clear items only on user action) --- */
function onOrderTypeChange(value: OrderType) {
  orderType.value = value;
  selectedItems.value = [];
  if (value !== "Bundle") {
    bundleType.value = "";
    bundleDetails.value = null;
  }
}

function onBundleTypeChange(value: string) {
  bundleType.value = value;
  selectedItems.value = [];
}

/* --- Categories shown (bundle-filtered) --- */
const visibleCategories = computed<AmenityCategory[]>(() => {
  if (orderType.value === "Bundle" && bundleDetails.value) {
    return (amenityCategories.value ?? []).filter((cat) =>
      bundleDetails.value!.amenity_categories.some(
        (bc) => bc.amenity_category === cat.name,
      ),
    );
  }
  if (orderType.value === "Bundle" && !bundleDetails.value) return [];
  return amenityCategories.value ?? [];
});

const selectedCategoryLabel = computed(
  () =>
    amenityCategories.value?.find((cat) => cat.name === selectedCategory.value)
      ?.category_name || "Select a Category",
);

function bundleCategoryFor(categoryName: string): BundleCategory | undefined {
  return bundleDetails.value?.amenity_categories.find(
    (bc) => bc.amenity_category === categoryName,
  );
}

function categorySelectedCount(categoryName: string) {
  return selectedItems.value
    .filter((item) => item.category === categoryName)
    .reduce((sum, item) => sum + item.count, 0);
}

/* --- Available amenities for the selected category --- */
const availableAmenities = ref<Amenity[]>([]);
watch(
  () => [amenities.value, selectedCategory.value] as const,
  ([list, category]) => {
    availableAmenities.value = (list ?? []).filter(
      (amenity) => amenity.amenity_category === category,
    );
  },
  { immediate: true },
);

function isAmenitySelected(amenity: Amenity) {
  return selectedItems.value.some((item) => item.id === amenity.name);
}

function isAmenityCategoryFull(amenity: Amenity) {
  if (orderType.value !== "Bundle" || !bundleDetails.value) return false;
  const bundleCategory = bundleDetails.value.amenity_categories.find(
    (bc) => bc.amenity_category === amenity.amenity_category,
  );
  if (!bundleCategory) return false;
  const currentCount = categorySelectedCount(amenity.amenity_category);
  return currentCount >= bundleCategory.number_of_amenities;
}

/* --- Drag and drop (vuedraggable) --- */
function cloneAmenity(amenity: Amenity): PackageItem {
  return {
    id: amenity.name,
    name: amenity.amenity_name,
    category: amenity.amenity_category,
    count: 1,
  };
}

function onMoveAvailable(evt: any) {
  const amenity = evt.draggedContext.element as Amenity;
  if (isAmenitySelected(amenity) || isAmenityCategoryFull(amenity)) return false;
  return true;
}

function onAdd(evt: any) {
  const index = evt.newIndex as number;
  const item = selectedItems.value[index];
  if (!item) return;

  // Dedup safety
  const duplicates = selectedItems.value.filter((i) => i.id === item.id);
  if (duplicates.length > 1) {
    selectedItems.value.splice(index, 1);
    return;
  }

  // Bundle category limit
  if (orderType.value === "Bundle" && bundleDetails.value) {
    const bundleCategory = bundleDetails.value.amenity_categories.find(
      (bc) => bc.amenity_category === item.category,
    );
    if (bundleCategory) {
      const otherCount = selectedItems.value
        .filter((i, idx) => i.category === item.category && idx !== index)
        .reduce((sum, i) => sum + i.count, 0);
      if (otherCount >= bundleCategory.number_of_amenities) {
        showWarning(
          `Cannot add more amenities. Maximum ${bundleCategory.number_of_amenities} amenities allowed for ${item.category} category in this bundle.`,
        );
        selectedItems.value.splice(index, 1);
      }
    }
  }
}

function handleRemoveItem(itemId: string) {
  selectedItems.value = selectedItems.value.filter(
    (item) => item.id !== itemId,
  );
}

function handleClearAll() {
  selectedItems.value = [];
}

function handleIncrementCount(itemId: string) {
  selectedItems.value = selectedItems.value.map((item) =>
    item.id === itemId ? { ...item, count: item.count + 1 } : item,
  );
}

function handleDecrementCount(itemId: string) {
  selectedItems.value = selectedItems.value.map((item) =>
    item.id === itemId && item.count > 1
      ? { ...item, count: item.count - 1 }
      : item,
  );
}

/* --- Make order --- */
function handleMakeOrder() {
  if (selectedItems.value.length === 0) {
    showWarning("Please select at least one item to save");
    return;
  }
  if (!facilityId.value) {
    showWarning("No facility selected. Please select a facility first.");
    return;
  }
  if (!orderType.value) {
    showWarning("Please select an order type");
    return;
  }
  if (orderType.value === "Bundle" && !bundleType.value) {
    showWarning("Please select a bundle type");
    return;
  }

  if (orderType.value === "Bundle" && bundleDetails.value) {
    const missingCategories: string[] = [];
    const incompleteCategories: string[] = [];

    bundleDetails.value.amenity_categories.forEach((bundleCategory) => {
      const selectedCount = categorySelectedCount(
        bundleCategory.amenity_category,
      );
      if (selectedCount === 0) {
        missingCategories.push(bundleCategory.amenity_category);
      } else if (selectedCount < bundleCategory.number_of_amenities) {
        incompleteCategories.push(
          `${bundleCategory.amenity_category} (${selectedCount}/${bundleCategory.number_of_amenities})`,
        );
      }
    });

    if (missingCategories.length > 0) {
      showWarning(`Please add amenities for: ${missingCategories.join(", ")}`);
      return;
    }
    if (incompleteCategories.length > 0) {
      showWarning(
        `Please complete the required amenities for: ${incompleteCategories.join(
          ", ",
        )}`,
      );
      return;
    }
  }

  isConfirmDialogOpen.value = true;
}

async function handleConfirmOrder() {
  try {
    if (isEditMode.value && orderId.value) {
      await updateDoc("Service Order", orderId.value, {
        order_type: orderType.value,
        bundle_type: orderType.value === "Bundle" ? bundleType.value : undefined,
        bundle_price: bundleDetails.value?.bundle_price || 0,
        amenities: selectedItems.value.map((item, idx) => ({
          amenity_name: item.id,
          count: item.count,
          idx: idx + 1,
        })),
      });
    } else {
      await createDoc("Service Order", {
        facility: facilityId.value,
        order_type: orderType.value,
        bundle_type: orderType.value === "Bundle" ? bundleType.value : undefined,
        bundle_price: bundleDetails.value?.bundle_price || 0,
        order_date: new Date().toISOString().split("T")[0],
        amenities: selectedItems.value.map((item, idx) => ({
          amenity_name: item.id,
          count: item.count,
          idx: idx + 1,
        })),
      });
    }

    isConfirmDialogOpen.value = false;
    isModalOpen.value = true;
    if (!isEditMode.value) selectedItems.value = [];
  } catch (error) {
    console.error(
      isEditMode.value ? "Order update failed:" : "Order creation failed:",
      error,
    );
    showWarning(
      isEditMode.value
        ? "Failed to update order. Please try again."
        : "Failed to create order. Please try again.",
    );
  }
}
</script>
