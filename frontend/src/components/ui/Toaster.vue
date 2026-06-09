<template>
  <Toaster
    position="top-right"
    class="toaster group"
    :toast-options="toastOptions"
  >
    <template #loading-icon>
      <Loader2Icon class="size-4 animate-spin" />
    </template>
    <template #success-icon>
      <CircleCheckIcon class="size-4" />
    </template>
    <template #error-icon>
      <OctagonXIcon class="size-4" />
    </template>
    <template #info-icon>
      <InfoIcon class="size-4" />
    </template>
    <template #warning-icon>
      <TriangleAlertIcon class="size-4" />
    </template>
  </Toaster>
</template>

<script setup lang="ts">
import { Toaster } from "vue-sonner";
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-vue-next";

const toastOptions: Record<string, unknown> = {
  classNames: {
    toast:
      "group toast group-[.toaster]:bg-white group-[.toaster]:text-gray-950 group-[.toaster]:border-gray-200 group-[.toaster]:shadow-lg",
    description: "group-[.toast]:text-gray-500",
    actionButton: "group-[.toast]:bg-gray-900 group-[.toast]:text-gray-50",
    cancelButton: "group-[.toast]:bg-gray-100 group-[.toast]:text-gray-500",
    error:
      "group-[.toaster]:bg-red-50 group-[.toaster]:text-red-900 group-[.toaster]:border-red-200",
    success:
      "group-[.toaster]:bg-green-50 group-[.toaster]:text-green-900 group-[.toaster]:border-green-200",
    warning:
      "group-[.toaster]:bg-yellow-50 group-[.toaster]:text-yellow-900 group-[.toaster]:border-yellow-200",
    info: "group-[.toaster]:bg-blue-50 group-[.toaster]:text-blue-900 group-[.toaster]:border-blue-200",
  },
};
</script>
