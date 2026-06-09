<template>
  <div class="min-h-screen bg-background flex items-center justify-center p-8">
    <div class="max-w-6xl w-full">
      <!-- Header -->
      <div class="bg-primary border-4 border-border p-4 sm:p-6 shadow-xl mb-8">
        <div
          class="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 justify-between"
        >
          <div
            class="flex flex-col sm:flex-row items-center gap-3 sm:gap-4"
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
                Welcome to Butler
              </h1>
              <p class="mt-1 sm:mt-2 font-sans text-sm sm:text-base break-words">
                Please select your account type
              </p>
            </div>
          </div>
          <Button variant="outline" class="whitespace-nowrap" @click="logout">
            <LogOut class="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      <!-- Selection Cards -->
      <div class="grid md:grid-cols-3 gap-6">
        <!-- Existing Customer -->
        <div
          class="bg-card border-4 border-border shadow-lg hover:shadow-xl transition-shadow"
        >
          <div class="p-6 space-y-6">
            <div class="flex justify-center">
              <div class="bg-secondary p-6 border-4 border-border rounded-full">
                <Users class="w-16 h-16 text-white" />
              </div>
            </div>

            <div class="text-center space-y-3">
              <h2 class="text-2xl font-head">Customer</h2>
              <p class="font-sans text-muted-foreground">
                Already registered as a customer? Access your account and manage
                your services.
              </p>
            </div>

            <Button
              class="w-full text-lg"
              variant="secondary"
              @click="handleCustomerTypeSelection('customer')"
            >
              Continue as Customer
            </Button>
          </div>
        </div>

        <!-- Existing Lead -->
        <div
          class="bg-card border-4 border-border shadow-lg hover:shadow-xl transition-shadow"
        >
          <div class="p-6 space-y-6">
            <div class="flex justify-center">
              <div class="bg-accent p-6 border-4 border-border rounded-full">
                <UserCheck class="w-16 h-16 text-black" />
              </div>
            </div>

            <div class="text-center space-y-3">
              <h2 class="text-2xl font-head">Lead</h2>
              <p class="font-sans text-muted-foreground">
                Previously registered as a lead? Continue your registration and
                manage facilities.
              </p>
            </div>

            <Button
              class="w-full text-lg"
              @click="handleCustomerTypeSelection('lead')"
            >
              Continue as Lead
            </Button>
          </div>
        </div>

        <!-- New Registration -->
        <div
          class="bg-card border-4 border-border shadow-lg hover:shadow-xl transition-shadow"
        >
          <div class="p-6 space-y-6">
            <div class="flex justify-center">
              <div class="bg-primary p-6 border-4 border-border rounded-full">
                <UserPlus class="w-16 h-16 text-black" />
              </div>
            </div>

            <div class="text-center space-y-3">
              <h2 class="text-3xl font-head">New Registration</h2>
              <p class="font-sans text-muted-foreground">
                First time here? Register now to start building your custom
                service package.
              </p>
            </div>

            <Button
              class="w-full text-lg"
              @click="handleCustomerTypeSelection('new')"
            >
              Register Now
            </Button>
          </div>
        </div>
      </div>

      <!-- Additional Info -->
      <div class="mt-8 text-center">
        <p class="font-sans text-sm text-muted-foreground">
          Need help? Contact our support team for assistance
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import { UserPlus, Users, UserCheck, LogOut } from "lucide-vue-next";
import Button from "@/components/retroui/Button.vue";
import { useSession } from "@/composables/session";

const router = useRouter();
const { logout } = useSession();

function handleCustomerTypeSelection(type: "customer" | "lead" | "new") {
  if (type === "customer") {
    router.push("/customers");
  } else if (type === "lead") {
    router.push("/leads");
  } else {
    router.push("/register");
  }
}
</script>
