<template>
  <!-- Order Configuration -->
  <div class="bg-card border-4 border-border p-6 shadow-lg">
    <h3
      class="text-xl sm:text-2xl font-head mb-4 border-b-2 border-border pb-2 break-words"
    >
      Order Configuration
    </h3>

    <!-- Order Type -->
    <div class="mb-4">
      <label for="order_type" class="block font-head mb-2 text-sm">
        Order Type <span class="text-destructive">*</span>
      </label>
      <select
        id="order_type"
        :value="orderType"
        :disabled="disabled"
        class="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary disabled:bg-muted disabled:cursor-not-allowed"
        @change="
          emit(
            'update:orderType',
            ($event.target as HTMLSelectElement).value as OrderType,
          )
        "
      >
        <option value="">Select Order Type</option>
        <option value="Bundle">Bundle</option>
        <option value="Quotation">Quotation</option>
        <option value="Amenities">Amenities</option>
      </select>
    </div>

    <!-- Bundle Type (conditional) -->
    <div v-if="orderType === 'Bundle'" class="mb-4">
      <label for="bundle_type" class="block font-head mb-2 text-sm">
        Bundle Type <span class="text-destructive">*</span>
      </label>
      <select
        id="bundle_type"
        :value="bundleType"
        :disabled="disabled"
        class="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary disabled:bg-muted disabled:cursor-not-allowed"
        @change="
          emit(
            'update:bundleType',
            ($event.target as HTMLSelectElement).value,
          )
        "
      >
        <option value="">Select Bundle</option>
        <option v-for="bundle in bundles" :key="bundle.name" :value="bundle.name">
          {{ bundle.bundle_name }}
        </option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch } from "vue";
import { useFrappeGetDocList } from "@/composables/frappe";
import { frappeRequest } from "@frappeui/request";
import type { OrderType, BundleDetails } from "@/types/service";

const props = withDefaults(
  defineProps<{
    orderType: OrderType;
    bundleType: string;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{
  (e: "update:orderType", value: OrderType): void;
  (e: "update:bundleType", value: string): void;
  (e: "update:bundleDetails", value: BundleDetails | null): void;
}>();

const { data: bundles } = useFrappeGetDocList<{
  name: string;
  bundle_name: string;
}>("Butler Bundle", { fields: ["name", "bundle_name"], limit: 100 });

watch(
  () => [props.bundleType, props.orderType] as const,
  async ([bundleType, orderType]) => {
    if (bundleType && orderType === "Bundle") {
      try {
        const message = (await frappeRequest({
          url: "butler.butler.doctype.service_order.service_order.get_bundle_details",
          method: "POST",
          params: { bundle_type: bundleType },
        })) as BundleDetails | null;
        emit("update:bundleDetails", message ?? null);
      } catch (error) {
        console.error("Failed to fetch bundle details:", error);
      }
    } else {
      emit("update:bundleDetails", null);
    }
  },
  { immediate: true },
);
</script>
