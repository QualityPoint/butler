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
          <div class="text-center sm:text-left max-w-2xl">
            <h1
              class="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-head break-words"
            >
              New Customer Registration
            </h1>
            <p class="mt-1 sm:mt-2 font-sans text-sm sm:text-base break-words">
              Fill in your details to get started
            </p>
          </div>
        </div>
      </div>

      <!-- Registration Form -->
      <div class="bg-card border-4 border-border p-8 shadow-lg">
        <form class="space-y-6" @submit.prevent="handleSubmit">
          <!-- Salutation Field -->
          <div>
            <label for="salutation" class="block font-head mb-2">
              Salutation <span class="text-destructive">*</span>
            </label>
            <select
              id="salutation"
              v-model="formData.salutation"
              name="salutation"
              required
              class="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary bg-white"
              :disabled="salutationsLoading"
            >
              <option value="">
                {{ salutationsLoading ? "Loading..." : "Select Salutation" }}
              </option>
              <option
                v-for="salutation in salutations"
                :key="salutation.name"
                :value="salutation.name"
              >
                {{ salutation.name }}
              </option>
            </select>
          </div>

          <!-- Name Fields -->
          <div class="grid md:grid-cols-2 gap-6">
            <div>
              <label for="firstName" class="block font-head mb-2">
                First Name <span class="text-destructive">*</span>
              </label>
              <input
                id="firstName"
                v-model="formData.firstName"
                name="firstName"
                type="text"
                required
                class="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
                placeholder="John"
              />
            </div>

            <div>
              <label for="lastName" class="block font-head mb-2">
                Last Name <span class="text-destructive">*</span>
              </label>
              <input
                id="lastName"
                v-model="formData.lastName"
                name="lastName"
                type="text"
                required
                class="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
                placeholder="Doe"
              />
            </div>
          </div>

          <!-- Contact Fields -->
          <div class="grid md:grid-cols-2 gap-6">
            <div>
              <label for="phone" class="block font-head mb-2">
                Phone <span class="text-destructive">*</span>
              </label>
              <input
                id="phone"
                v-model="formData.phone"
                name="phone"
                type="tel"
                required
                class="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
                placeholder="+1234567890"
              />
            </div>

            <div>
              <label for="email" class="block font-head mb-2">Email</label>
              <input
                id="email"
                v-model="formData.email"
                name="email"
                type="email"
                class="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
                placeholder="john@example.com"
              />
            </div>
          </div>

          <!-- Submit Button -->
          <div class="flex flex-wrap gap-2 sm:gap-4">
            <Button
              type="button"
              variant="outline"
              class="flex-1 min-w-[100px] text-sm sm:text-base"
              :disabled="isSubmitting"
              @click="router.push('/')"
            >
              <Home class="w-4 h-4 sm:mr-2" />
              <span class="hidden sm:inline">Home</span>
            </Button>
            <Button
              type="submit"
              class="flex-1 min-w-[140px] text-base sm:text-lg"
              :disabled="isSubmitting"
            >
              {{ isSubmitting ? "Registering..." : "Complete Registration" }}
            </Button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { Home } from "lucide-vue-next";
import Button from "@/components/retroui/Button.vue";
import {
  showSuccess,
  showWarning,
  showFrappeError,
} from "@/lib/errorHandler";
import { useFrappeCreateDoc, useFrappeGetDocList } from "@/composables/frappe";
import type { Lead } from "@/types/CRM/Lead";

const router = useRouter();
const { createDoc } = useFrappeCreateDoc<Lead>();

const { data: salutations, isLoading: salutationsLoading } =
  useFrappeGetDocList<{ name: string }>("Salutation", {
    fields: ["name"],
    limit: 100,
  });

const formData = reactive({
  salutation: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
});
const isSubmitting = ref(false);

async function handleSubmit() {
  if (
    !formData.salutation ||
    !formData.firstName ||
    !formData.lastName ||
    !formData.phone
  ) {
    showWarning("Please fill in all required fields");
    return;
  }

  isSubmitting.value = true;

  try {
    const leadData: Partial<Lead> = {
      salutation: formData.salutation,
      first_name: formData.firstName,
      last_name: formData.lastName,
      email_id: formData.email || undefined,
      mobile_no: formData.phone,
      status: "Lead",
      lead_name: `${formData.firstName} ${formData.lastName}`,
    };

    const newLead = await createDoc("Lead", leadData);

    showSuccess("Registration successful! Redirecting to facilities...");

    setTimeout(() => {
      router.push(`/facilities?lead_id=${newLead.name}&facility_for=Lead`);
    }, 1500);
  } catch (error) {
    console.error("Registration failed:", error);
    showFrappeError(error);
  } finally {
    isSubmitting.value = false;
  }
}
</script>
