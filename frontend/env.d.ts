/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_BASE_NAME?: string;
  readonly VITE_FRAPPE_PATH?: string;
  readonly VITE_SOCKET_PORT?: string;
  readonly VITE_SITE_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    csrf_token?: string;
    frappe?: {
      boot?: {
        versions?: { frappe?: string };
        sitename?: string;
      };
    };
  }
}

export {};
