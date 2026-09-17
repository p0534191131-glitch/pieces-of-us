/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** כשמעבירים ל-Lovable Cloud: כתובת הפרויקט ומפתח ציבורי — ואז המשחק עובר לזמן-אמת של Supabase */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
