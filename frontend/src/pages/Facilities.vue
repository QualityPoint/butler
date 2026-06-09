<template>
  <div class="min-h-screen bg-background p-8">
    <div class="max-w-7xl mx-auto">
      <!-- Header -->
      <div class="bg-primary border-4 border-border p-4 sm:p-6 shadow-xl mb-8">
        <div
          class="flex flex-col lg:flex-row items-center justify-between gap-4"
        >
          <div class="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
            <img
              src="/assets/butler/images/logo.svg"
              alt="Butler Logo"
              class="h-16 w-16 sm:h-20 sm:w-20 flex-shrink-0"
            />
            <div class="text-center sm:text-left max-w-xl">
              <h1
                class="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-head break-words"
              >
                Your Facilities
              </h1>
              <p class="mt-1 sm:mt-2 font-sans text-sm sm:text-base break-words">
                Manage your properties and buildings
              </p>
            </div>
          </div>
          <Button
            class="text-base sm:text-lg whitespace-nowrap"
            :disabled="!leadId"
            @click="handleAddFacility"
          >
            <Plus class="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
            Add Facility
          </Button>
        </div>
      </div>

      <!-- Error Display -->
      <ErrorBanner v-if="error" :error="error" title="Failed to load facilities" />

      <!-- Loading State -->
      <div
        v-if="isLoading"
        class="bg-card border-4 border-border p-12 shadow-lg text-center"
      >
        <div class="text-2xl font-head">Loading facilities...</div>
      </div>

      <!-- Empty State -->
      <div
        v-if="!isLoading && !error && facilities?.length === 0"
        class="bg-card border-4 border-border p-12 shadow-lg text-center space-y-6"
      >
        <div class="flex justify-center">
          <div class="bg-muted p-8 border-4 border-border rounded-full">
            <Building2 class="w-20 h-20 text-muted-foreground" />
          </div>
        </div>
        <div class="space-y-2">
          <h2 class="text-2xl font-head">No Facilities Yet</h2>
          <p class="font-sans text-muted-foreground text-lg">
            Start by adding your first facility to manage services
          </p>
        </div>
        <Button class="text-lg" @click="handleAddFacility">
          <Plus class="w-5 h-5 mr-2" />
          Add Your First Facility
        </Button>
      </div>

      <!-- Facilities Grid -->
      <div
        v-if="!isLoading && facilities && facilities.length > 0"
        class="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        <div
          v-for="facility in facilities"
          :key="facility.name"
          class="bg-card border-4 border-border shadow-lg hover:shadow-xl transition-all cursor-pointer"
          @click="handleViewFacility(facility.name)"
        >
          <div class="p-6 space-y-4">
            <!-- Facility Icon -->
            <div class="flex justify-between items-start">
              <div class="bg-secondary p-3 border-4 border-border">
                <Building2 class="w-8 h-8 text-white" />
              </div>
              <span
                v-if="facility.multistorey === 1"
                class="px-3 py-1 bg-accent border-2 border-border font-sans text-sm"
              >
                Multi-storey
              </span>
            </div>

            <!-- Facility Info -->
            <div class="space-y-2">
              <h3 class="text-2xl font-head line-clamp-1">
                {{ facility.facility_name }}
              </h3>
              <p class="font-sans text-muted-foreground">
                {{ facility.facility_type }}
              </p>
            </div>

            <!-- Details -->
            <div class="space-y-2 pt-2 border-t-2 border-border">
              <div
                v-if="facility.total_area"
                class="flex justify-between font-sans text-sm"
              >
                <span class="text-muted-foreground">Area:</span>
                <span class="font-bold">{{ facility.total_area }} m²</span>
              </div>
              <div
                v-if="facility.multistorey === 1 && facility.number_of_floors"
                class="flex justify-between font-sans text-sm"
              >
                <span class="text-muted-foreground">Floors:</span>
                <span class="font-bold">{{ facility.number_of_floors }}</span>
              </div>
              <div
                v-if="facility.street || facility.building_no"
                class="flex items-start gap-2 font-sans text-sm"
              >
                <MapPin
                  class="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0"
                />
                <span class="text-muted-foreground line-clamp-2">
                  <template v-if="facility.building_no">
                    Bldg {{ facility.building_no }}
                  </template>
                  <template v-if="facility.building_no && facility.street"
                    >,
                  </template>
                  {{ facility.street }}
                </span>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="grid grid-cols-2 gap-2">
              <Button
                v-if="orderForFacility(facility.name)"
                variant="outline"
                class="col-span-2"
                @click.stop="goToOrder(facility.name)"
              >
                <FileText class="w-4 h-4 mr-2" />
                View Order
              </Button>
              <Button
                v-else
                class="col-span-2"
                @click.stop="router.push(`/service?facility_id=${facility.name}`)"
              >
                Create Order
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- Home Button - Always visible -->
      <div class="mt-6 flex justify-center">
        <Button variant="outline" @click="router.push('/')">
          <Home class="w-4 h-4 mr-2" />
          Home
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Plus, Building2, MapPin, Home, FileText } from "lucide-vue-next";
import Button from "@/components/retroui/Button.vue";
import ErrorBanner from "@/components/ui/ErrorBanner.vue";
import { useFrappeGetDocList } from "@/composables/frappe";
import type { Facility } from "@/types/Butler/Facility";

const route = useRoute();
const router = useRouter();

const leadId = computed(() => (route.query.lead_id as string) || "");
const facilityFor = computed(
  () => (route.query.facility_for as string) || "Lead",
);

const { data: facilities, error, isLoading } = useFrappeGetDocList<Facility>(
  "Facility",
  () => ({
    fields: [
      "name",
      "facility_name",
      "facility_type",
      "total_area",
      "multistorey",
      "number_of_floors",
      "street",
      "building_no",
    ],
    filters: [
      ["facility_for", "=", facilityFor.value],
      ["party_name", "=", leadId.value],
    ],
    orderBy: { field: "creation", order: "desc" },
  }),
);

const { data: serviceOrders } = useFrappeGetDocList<{
  name: string;
  facility: string;
}>("Service Order", () => ({
  fields: ["name", "facility"],
  filters: (facilities.value?.map((f) => ["facility", "=", f.name]) ??
    []) as (string | number)[][],
  limit: 1000,
}));

function orderForFacility(facilityName: string) {
  return serviceOrders.value?.find((order) => order.facility === facilityName);
}

function handleAddFacility() {
  router.push(
    `/facility/new?lead_id=${leadId.value}&facility_for=${facilityFor.value}`,
  );
}

function handleViewFacility(facilityName: string) {
  router.push(
    `/facility/${facilityName}?lead_id=${leadId.value}&facility_for=${facilityFor.value}`,
  );
}

function goToOrder(facilityName: string) {
  const order = orderForFacility(facilityName);
  if (order) router.push(`/service?order_id=${order.name}`);
}
</script>
