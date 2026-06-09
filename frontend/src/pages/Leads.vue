<template>
  <div class="min-h-screen bg-background p-8">
    <div class="max-w-4xl mx-auto">
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
              Find Your Lead
            </h1>
            <p class="mt-1 sm:mt-2 font-sans text-sm sm:text-base break-words">
              Search for your existing lead record
            </p>
          </div>
        </div>
      </div>

      <!-- Search Box -->
      <div class="bg-card border-4 border-border p-6 shadow-lg mb-6">
        <div class="space-y-4">
          <label for="search" class="block font-head text-lg">
            Search by Name
          </label>
          <div class="flex gap-4">
            <div class="relative flex-1">
              <Search
                class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground"
              />
              <input
                id="search"
                v-model="searchTerm"
                type="text"
                class="w-full pl-12 pr-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
                placeholder="Type at least 2 characters to search..."
              />
            </div>
          </div>
          <p class="font-sans text-sm text-muted-foreground">
            {{
              searchTerm.length > 0 && searchTerm.length < 2
                ? `Type ${2 - searchTerm.length} more character(s) to search`
                : leads
                  ? `Found ${leads.length} lead(s)`
                  : "Start typing to search for leads"
            }}
          </p>
        </div>
      </div>

      <!-- Results -->
      <div
        v-if="isLoading"
        class="bg-card border-4 border-border p-8 shadow-lg text-center"
      >
        <p class="font-head text-xl">Searching...</p>
      </div>

      <div
        v-if="error"
        class="bg-destructive border-4 border-border p-6 shadow-lg text-center"
      >
        <p class="font-head text-xl text-white">
          Error loading results. Please try again.
        </p>
      </div>

      <div
        v-if="!shouldFetch && !isLoading"
        class="bg-card border-4 border-border p-8 shadow-lg text-center"
      >
        <p class="font-head text-xl mb-2">Start Searching</p>
        <p class="font-sans text-muted-foreground">
          Enter your name to find your lead record
        </p>
      </div>

      <div
        v-if="shouldFetch && !isLoading && leads && leads.length === 0"
        class="bg-card border-4 border-border p-8 shadow-lg text-center"
      >
        <p class="font-head text-xl mb-2">No leads found</p>
        <p class="font-sans text-muted-foreground">
          Try a different search term or register as a new lead
        </p>
        <Button class="mt-4" @click="router.push('/register')">
          Register as New Lead
        </Button>
      </div>

      <div v-if="!isLoading && leads && leads.length > 0" class="space-y-4">
        <h2 class="font-head text-2xl mb-4">Select Your Lead</h2>
        <div
          v-for="lead in leads"
          :key="lead.name"
          class="bg-card border-4 border-border shadow-lg hover:shadow-xl transition-all cursor-pointer p-6"
          @click="handleSelectLead(lead)"
        >
          <div class="flex items-start justify-between">
            <div class="flex items-start gap-4 flex-1">
              <div class="bg-accent p-3 border-4 border-border">
                <UserCheck class="w-6 h-6" />
              </div>
              <div class="flex-1">
                <h3 class="text-2xl font-head mb-2">
                  {{ lead.title || lead.lead_name }}
                </h3>
                <div class="space-y-1">
                  <p v-if="lead.mobile_no" class="font-sans text-sm">
                    <span class="text-muted-foreground">Phone:</span>
                    {{ lead.mobile_no }}
                  </p>
                  <p v-if="lead.email_id" class="font-sans text-sm">
                    <span class="text-muted-foreground">Email:</span>
                    {{ lead.email_id }}
                  </p>
                  <p v-if="lead.status" class="font-sans text-sm">
                    <span class="text-muted-foreground">Status:</span>
                    <span
                      class="px-2 py-1 bg-secondary text-white border-2 border-border text-xs"
                    >
                      {{ lead.status }}
                    </span>
                  </p>
                </div>
              </div>
            </div>
            <Button variant="outline" @click.stop="handleSelectLead(lead)">
              Select
            </Button>
          </div>
        </div>
      </div>

      <!-- Back Button -->
      <div class="mt-6 flex justify-center gap-4">
        <Button variant="outline" @click="router.push('/')">
          <Home class="w-4 h-4 mr-2" />
          Home
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Search, UserCheck, Home } from "lucide-vue-next";
import Button from "@/components/retroui/Button.vue";
import { useFrappeGetDocList } from "@/composables/frappe";
import type { Lead } from "@/types/CRM/Lead";

const router = useRouter();
const searchTerm = ref("");
const debouncedSearch = ref("");

let timer: ReturnType<typeof setTimeout> | undefined;
watch(searchTerm, (value) => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    debouncedSearch.value = value;
  }, 500);
});

const shouldFetch = computed(() => debouncedSearch.value.length >= 2);

const { data: leads, error, isLoading } = useFrappeGetDocList<Lead>(
  "Lead",
  () =>
    shouldFetch.value
      ? {
          fields: [
            "name",
            "title",
            "lead_name",
            "mobile_no",
            "email_id",
            "status",
          ],
          filters: [["title", "like", `%${debouncedSearch.value}%`]],
          limit: 50,
          orderBy: { field: "modified", order: "desc" },
        }
      : null,
);

function handleSelectLead(lead: Lead) {
  router.push(`/facilities?lead_id=${lead.name}&facility_for=Lead`);
}
</script>
