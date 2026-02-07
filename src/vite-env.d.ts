/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ITTYBITTY_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
