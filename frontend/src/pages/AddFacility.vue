<template>
  <div class="min-h-screen bg-background p-8">
    <div class="max-w-3xl mx-auto">
      <!-- Header -->
      <div class="bg-primary border-4 border-border p-4 sm:p-6 shadow-xl mb-8">
        <div
          class="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 justify-center"
        >
          <img
            src="/assets/butler/images/logo.svg"
            alt="Butler Logo"
            class="h-16 w-16 sm:h-20 sm:w-20 flex-shrink-0"
          />
          <div class="text-center sm:text-left max-w-xl">
            <h1
              class="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-head break-words"
            >
              Add New Facility
            </h1>
            <p class="mt-1 sm:mt-2 font-sans text-sm sm:text-base break-words">
              Register your property or building
            </p>
          </div>
        </div>
      </div>

      <!-- Form -->
      <div class="bg-card border-4 border-border p-8 shadow-lg">
        <form class="space-y-6" @submit.prevent="handleSubmit">
          <!-- Facility Name -->
          <div>
            <label for="facility_name" class="block font-head mb-2">
              Facility Name <span class="text-destructive">*</span>
            </label>
            <input
              id="facility_name"
              v-model="formData.facility_name"
              name="facility_name"
              type="text"
              required
              class="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
              placeholder="e.g., Main Office Building"
            />
          </div>

          <!-- Facility Type -->
          <div>
            <label for="facility_type" class="block font-head mb-2">
              Facility Type <span class="text-destructive">*</span>
            </label>
            <select
              id="facility_type"
              v-model="formData.facility_type"
              name="facility_type"
              required
              class="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary bg-white"
              :disabled="typesLoading"
            >
              <option value="">
                {{ typesLoading ? "Loading..." : "Select Facility Type" }}
              </option>
              <option
                v-for="type in facilityTypes"
                :key="type.name"
                :value="type.name"
              >
                {{ type.name }}
              </option>
            </select>
          </div>

          <!-- Facility Specifications -->
          <FacilitySpecifications
            :multistorey="formData.multistorey"
            :total-area="formData.total_area"
            :number-of-floors="formData.number_of_floors"
            :floor-area="formData.floor_area"
            @update:multistorey="handleMultistoreyChange"
            @update:total-area="formData.total_area = $event"
            @update:number-of-floors="handleNumberOfFloorsChange"
            @update:floor-area="handleFloorAreaChange"
          />

          <!-- Location Section -->
          <FacilityLocation
            :map-position="mapPosition"
            :latitude="formData.latitude"
            :longitude="formData.longitude"
            :street="formData.street"
            :building-no="formData.building_no"
            :address-details="formData.address_details"
            @map-click="handleMapClick"
            @update:street="formData.street = $event"
            @update:building-no="formData.building_no = $event"
            @update:address-details="formData.address_details = $event"
          />

          <!-- Submit Buttons -->
          <div class="flex flex-wrap gap-2 sm:gap-4 pt-4">
            <Button
              type="button"
              variant="outline"
              :disabled="isSubmitting"
              class="text-sm sm:text-base"
              @click="router.push('/')"
            >
              <Home class="w-4 h-4 sm:mr-2" />
              <span class="hidden sm:inline">Home</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              class="flex-1 text-sm sm:text-base min-w-[80px]"
              :disabled="isSubmitting"
              @click="
                router.push(
                  `/facilities?lead_id=${leadId}&facility_for=${facilityFor}`,
                )
              "
            >
              Cancel
            </Button>
            <Button
              type="submit"
              class="flex-1 text-base sm:text-lg min-w-[100px]"
              :disabled="isSubmitting || typesLoading"
            >
              {{ isSubmitting ? "Adding..." : "Add Facility" }}
            </Button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Home } from "lucide-vue-next";
import Button from "@/components/retroui/Button.vue";
import {
  showSuccess,
  showWarning,
  showFrappeError,
} from "@/lib/errorHandler";
import FacilitySpecifications from "@/components/FacilitySpecifications.vue";
import FacilityLocation from "@/components/FacilityLocation.vue";
import { useFrappeCreateDoc, useFrappeGetDocList } from "@/composables/frappe";
import type { Facility } from "@/types/Butler/Facility";

const route = useRoute();
const router = useRouter();
const { createDoc } = useFrappeCreateDoc<Facility>();

const leadId = (route.query.lead_id as string) || "";
const facilityFor = (route.query.facility_for as string) || "Lead";

const { data: facilityTypes, isLoading: typesLoading } = useFrappeGetDocList<{
  name: string;
}>("Facility Type", { fields: ["name"], limit: 100 });

const formData = reactive({
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
const isSubmitting = ref(false);
// Default: Riyadh, Saudi Arabia
const mapPosition = ref<[number, number]>([24.7136, 46.6753]);

function handleMultistoreyChange(checked: boolean) {
  formData.multistorey = checked;
  formData.total_area = checked ? "" : formData.total_area;
  formData.number_of_floors = checked ? formData.number_of_floors : "";
  formData.floor_area = checked ? formData.floor_area : "";
}

function handleNumberOfFloorsChange(value: string) {
  formData.number_of_floors = value;
  const floors = parseFloat(value);
  const area = parseFloat(formData.floor_area);
  if (floors && area && floors > 0 && area > 0) {
    formData.total_area = (floors * area).toString();
  }
}

function handleFloorAreaChange(value: string) {
  formData.floor_area = value;
  const floors = parseFloat(formData.number_of_floors);
  const area = parseFloat(value);
  if (floors && area && floors > 0 && area > 0) {
    formData.total_area = (floors * area).toString();
  }
}

function handleMapClick(lat: number, lng: number) {
  mapPosition.value = [lat, lng];
  formData.latitude = lat.toFixed(6);
  formData.longitude = lng.toFixed(6);
}

async function handleSubmit() {
  if (
    !formData.facility_name ||
    !formData.facility_type ||
    !formData.total_area
  ) {
    showWarning("Please fill in all required fields");
    return;
  }

  if (!leadId) {
    showWarning("Missing lead information");
    return;
  }

  isSubmitting.value = true;

  try {
    const facilityData: Partial<Facility> = {
      facility_for: facilityFor,
      party_name: leadId,
      facility_name: formData.facility_name,
      facility_type: formData.facility_type,
      total_area: parseFloat(formData.total_area),
      multistorey: formData.multistorey ? 1 : 0,
      number_of_floors:
        formData.multistorey && formData.number_of_floors
          ? parseInt(formData.number_of_floors)
          : undefined,
      floor_area:
        formData.multistorey && formData.floor_area
          ? parseFloat(formData.floor_area)
          : undefined,
      street: formData.street || undefined,
      building_no: formData.building_no || undefined,
      latitude: formData.latitude ? parseFloat(formData.latitude) : undefined,
      longitude: formData.longitude
        ? parseFloat(formData.longitude)
        : undefined,
      address_details: formData.address_details || undefined,
    };

    await createDoc("Facility", facilityData);

    showSuccess("Facility added successfully!");

    setTimeout(() => {
      router.push(
        `/facilities?lead_id=${leadId}&facility_for=${facilityFor}`,
      );
    }, 1000);
  } catch (error) {
    console.error("Facility creation failed:", error);
    showFrappeError(error);
  } finally {
    isSubmitting.value = false;
  }
}
</script>
