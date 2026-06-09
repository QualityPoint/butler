<template>
  <button :class="classes" v-bind="rest">
    <slot />
  </button>
</template>

<script lang="ts">
import { cva, type VariantProps } from "class-variance-authority";

export const buttonVariants = cva(
  "font-head transition-all rounded outline-hidden cursor-pointer duration-200 font-medium flex items-center justify-center whitespace-nowrap",
  {
    variants: {
      variant: {
        default:
          "shadow-md hover:shadow active:shadow-none bg-primary text-white border-2 border-black transition hover:translate-y-1 active:translate-y-2 active:translate-x-1 hover:bg-primary-hover",
        secondary:
          "shadow-md hover:shadow active:shadow-none bg-secondary text-white shadow-primary border-2 border-black transition hover:translate-y-1 active:translate-y-2 active:translate-x-1 hover:bg-secondary-hover",
        outline:
          "shadow-md hover:shadow active:shadow-none bg-gray-800 text-white border-2 border-black transition hover:translate-y-1 active:translate-y-2 active:translate-x-1 hover:bg-gray-700",
        link: "bg-transparent text-foreground hover:underline",
        ghost: "bg-transparent text-foreground hover:bg-accent",
      },
      size: {
        sm: "px-2 py-1 text-xs sm:px-3 sm:text-sm shadow hover:shadow-none",
        md: "px-3 py-1.5 text-sm sm:px-4 sm:text-base",
        lg: "px-4 py-2 text-base sm:px-6 lg:px-8 sm:py-2 lg:py-3 sm:text-md lg:text-lg",
        icon: "p-2",
      },
    },
    defaultVariants: {
      size: "md",
      variant: "default",
    },
  },
);

export type ButtonVariant = NonNullable<
  VariantProps<typeof buttonVariants>["variant"]
>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;
</script>

<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn } from "@/lib/utils";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{ variant?: ButtonVariant; size?: ButtonSize }>(),
  { variant: "default", size: "md" },
);

const attrs = useAttrs();

const classes = computed(() =>
  cn(
    buttonVariants({ variant: props.variant, size: props.size }),
    attrs.class as string,
  ),
);

const rest = computed(() => {
  const { class: _class, ...other } = attrs;
  return other;
});
</script>
