<template>
  <div class="flex min-h-screen items-center justify-center p-6 bg-background">
    <div class="w-full max-w-md">
      <div class="bg-card border-4 border-border p-8 shadow-xl">
        <h1
          class="text-4xl font-head text-center mb-6 bg-primary p-4 border-2 border-border"
        >
          Butler Login
        </h1>

        <form class="space-y-6" @submit.prevent="handleLogin">
          <div>
            <label for="username" class="block text-sm font-head mb-2">
              Username
            </label>
            <input
              id="username"
              v-model="username"
              type="text"
              placeholder="your.username"
              required
              :disabled="isLoading"
              class="w-full px-4 py-3 border-2 border-border font-sans focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label for="password" class="block text-sm font-head mb-2">
              Password
            </label>
            <input
              id="password"
              v-model="password"
              type="password"
              placeholder="••••••••"
              required
              :disabled="isLoading"
              class="w-full px-4 py-3 border-2 border-border font-sans focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div
            v-if="error"
            class="bg-red-100 border-2 border-red-600 p-3 text-red-800 font-sans text-sm"
          >
            {{ error }}
          </div>

          <Button type="submit" :disabled="isLoading" class="w-full text-lg">
            {{ isLoading ? "Logging in..." : "Login" }}
          </Button>
        </form>

        <div class="mt-6 text-center">
          <p class="text-sm text-muted-foreground">
            Butler - Your Estate Management System
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import Button from "@/components/retroui/Button.vue";
import { useSession } from "@/composables/session";

const username = ref("");
const password = ref("");
const error = ref("");
const isLoading = ref(false);

const { login } = useSession();

async function handleLogin() {
  error.value = "";
  isLoading.value = true;

  try {
    await login({ username: username.value, password: password.value });
    // Redirect to home (customer type selection) after login
    const base = import.meta.env.VITE_BASE_NAME
      ? `/${import.meta.env.VITE_BASE_NAME}`
      : "";
    window.location.replace(`${base}/`);
  } catch (err: any) {
    error.value =
      err?.message || "Login failed. Please check your credentials.";
    isLoading.value = false;
  }
}
</script>
