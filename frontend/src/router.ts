import { watch } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { useSession } from "@/composables/session";

const base = import.meta.env.VITE_BASE_NAME
  ? `/${import.meta.env.VITE_BASE_NAME}`
  : "/";

const routes = [
  {
    path: "/login",
    name: "Login",
    component: () => import("@/pages/auth/Login.vue"),
    meta: { public: true },
  },
  {
    path: "/",
    name: "CustomerType",
    component: () => import("@/pages/CustomerType.vue"),
  },
  {
    path: "/customer-type",
    component: () => import("@/pages/CustomerType.vue"),
  },
  {
    path: "/customers",
    name: "Customers",
    component: () => import("@/pages/Customers.vue"),
  },
  {
    path: "/leads",
    name: "Leads",
    component: () => import("@/pages/Leads.vue"),
  },
  {
    path: "/register",
    name: "Register",
    component: () => import("@/pages/Register.vue"),
  },
  {
    path: "/facilities",
    name: "Facilities",
    component: () => import("@/pages/Facilities.vue"),
  },
  {
    path: "/facility/new",
    name: "AddFacility",
    component: () => import("@/pages/AddFacility.vue"),
  },
  {
    path: "/facility/:facilityId",
    name: "Facility",
    component: () => import("@/pages/Facility.vue"),
  },
  {
    path: "/service",
    name: "Service",
    component: () => import("@/pages/Service.vue"),
  },
];

const router = createRouter({
  history: createWebHistory(base),
  routes,
});

/** Wait until the initial session check has completed. */
function ensureSessionLoaded(session: ReturnType<typeof useSession>) {
  return new Promise<void>((resolve) => {
    if (!session.isLoading.value) return resolve();
    const stop = watchOnce(session.isLoading, resolve);
    void stop;
  });
}

// Minimal one-shot watcher (avoids pulling in @vueuse just for this).
function watchOnce(source: { value: boolean }, cb: () => void) {
  const stop = watch(
    () => source.value,
    (loading) => {
      if (!loading) {
        cb();
        stop();
      }
    },
  );
  return stop;
}

// Navigation guard — the Vue equivalent of <ProtectedRoute>.
router.beforeEach(async (to) => {
  const session = useSession();
  await ensureSessionLoaded(session);

  if (to.meta.public) return true;

  if (!session.isLoggedIn.value) {
    return { name: "Login" };
  }
  return true;
});

export default router;
