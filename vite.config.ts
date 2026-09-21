// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      // دعم العمل بدون إنترنت: تخزين ملفات التطبيق محليًا حتى يفتح ويعمل بلا شبكة
      VitePWA({
        registerType: "autoUpdate",
        disable: process.env["NODE_ENV"] !== "production",
        manifest: {
          name: "SmartPOS — نظام نقاط البيع",
          short_name: "SmartPOS",
          description: "نظام كاشير ومخازن يعمل بدون إنترنت مع مزامنة سحابية تلقائية.",
          lang: "ar",
          dir: "rtl",
          start_url: "/",
          display: "standalone",
          background_color: "#ffffff",
          theme_color: "#1e5fd6",
          icons: [
            { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
            { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
            { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          navigateFallback: "/",
          navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: { cacheName: "pages", networkTimeoutSeconds: 4 },
            },
            {
              urlPattern: ({ request }) =>
                ["script", "style", "font", "image"].includes(request.destination),
              handler: "StaleWhileRevalidate",
              options: { cacheName: "assets" },
            },
          ],
        },
      }),
    ],
  },
});
