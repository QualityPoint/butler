<template>
  <RouterView />
  <Toaster />
</template>

<script setup lang="ts">
import { RouterView } from "vue-router";
import Toaster from "@/components/ui/Toaster.vue";
</script>
