<template>
  <div
    v-if="isOpen && facilityDetails"
    class="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200"
  >
    <div
      class="bg-background border-4 border-border shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-300"
    >
      <div class="bg-primary border-b-4 border-border p-6">
        <div class="flex items-center justify-between">
          <h2 class="text-3xl font-head text-primary-foreground">
            Facility Details
          </h2>
          <button
            class="text-3xl font-bold hover:opacity-70 transition-opacity text-primary-foreground"
            @click="emit('close')"
          >
            ×
          </button>
        </div>
      </div>
      <div class="p-8 space-y-6 overflow-y-auto max-h-[calc(85vh-100px)]">
        <div class="bg-card border-4 border-border p-6 shadow-lg">
          <h3 class="font-head text-2xl mb-4 border-b-2 border-border pb-2">
            Basic Information
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label
                class="block font-head text-sm mb-2 text-muted-foreground"
              >
                Facility Name
              </label>
              <p class="font-sans text-lg font-medium">
                {{ facilityDetails.facility_name || "N/A" }}
              </p>
            </div>
            <div>
              <label
                class="block font-head text-sm mb-2 text-muted-foreground"
              >
                Facility Type
              </label>
              <p class="font-sans text-lg font-medium">
                {{ facilityDetails.facility_type || "N/A" }}
              </p>
            </div>
          </div>
        </div>

        <div class="bg-card border-4 border-border p-6 shadow-lg">
          <h3 class="font-head text-2xl mb-4 border-b-2 border-border pb-2">
            Specifications
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label
                class="block font-head text-sm mb-2 text-muted-foreground"
              >
                Total Area
              </label>
              <p class="font-sans text-lg font-medium">
                {{
                  facilityDetails.total_area != null
                    ? `${facilityDetails.total_area} m²`
                    : "N/A"
                }}
              </p>
            </div>
            <template v-if="facilityDetails.multistorey === 1">
              <div>
                <label
                  class="block font-head text-sm mb-2 text-muted-foreground"
                >
                  Floor Area
                </label>
                <p class="font-sans text-lg font-medium">
                  {{
                    facilityDetails.floor_area != null
                      ? `${facilityDetails.floor_area} m²`
                      : "N/A"
                  }}
                </p>
              </div>
              <div>
                <label
                  class="block font-head text-sm mb-2 text-muted-foreground"
                >
                  Number of Floors
                </label>
                <p class="font-sans text-lg font-medium">
                  {{
                    facilityDetails.number_of_floors != null
                      ? facilityDetails.number_of_floors
                      : "N/A"
                  }}
                </p>
              </div>
            </template>
          </div>
        </div>

        <div class="bg-card border-4 border-border p-6 shadow-lg">
          <h3 class="font-head text-2xl mb-4 border-b-2 border-border pb-2">
            Location
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label
                class="block font-head text-sm mb-2 text-muted-foreground"
              >
                Street
              </label>
              <p class="font-sans text-lg font-medium">
                {{ facilityDetails.street || "N/A" }}
              </p>
            </div>
            <div>
              <label
                class="block font-head text-sm mb-2 text-muted-foreground"
              >
                Building Number
              </label>
              <p class="font-sans text-lg font-medium">
                {{ facilityDetails.building_no || "N/A" }}
              </p>
            </div>
            <div v-if="facilityDetails.address_details" class="md:col-span-2">
              <label
                class="block font-head text-sm mb-2 text-muted-foreground"
              >
                Address Details
              </label>
              <p class="font-sans text-lg font-medium">
                {{ facilityDetails.address_details }}
              </p>
            </div>
          </div>
        </div>

        <div class="flex gap-4 pt-4">
          <Button class="flex-1 text-lg" @click="emit('close')">Close</Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Button from "@/components/retroui/Button.vue";
import { useFrappeGetDoc } from "@/composables/frappe";

const props = defineProps<{
  facilityId: string;
  isOpen: boolean;
}>();

const emit = defineEmits<{ (e: "close"): void }>();

// Only fetch when the modal is open and we have an id.
const nameToFetch = computed(() =>
  props.facilityId && props.isOpen ? props.facilityId : undefined,
);

const { data: facilityDetails } = useFrappeGetDoc<Record<string, any>>(
  "Facility",
  nameToFetch,
);
</script>
