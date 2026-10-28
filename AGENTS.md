<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Store receipt-branding images in the existing organization-scoped product-images bucket to reuse its secure policies and image optimization.
- Native wrappers consume the generated `dist/client` bundle because TanStack Start emits browser assets there, while `dist/server` is deployment-only.
- Native release workflows use Node 24-compatible actions, build signed Android release APK/AAB files, and use electron-builder for x64 Windows/Linux plus x64/arm64 macOS installers so CI verifies distributable files rather than unpacked folders.
- Scale labels use configurable EAN-13 prefix parsing at checkout; expiry enforcement remains organization-configurable so one catalog policy applies online and offline.
- Cashier hardware settings (printer, drawer IP) are stored per device in localStorage and native printing goes through the Electron preload bridge `window.smartposNative`, because each till has its own devices and browsers cannot open raw sockets.
- The standalone cashier app is the same codebase built with `VITE_APP_MODE=cashier` (only /pos and /shifts reachable) and a separate native app id, so till devices get a locked-down app without a forked codebase.
- Built CSS is post-processed by `scripts/legacy-colors.mjs` (oklch/oklab → hex, alpha color-mix → rgb triplets, @supports fallbacks) because Chrome/Edge 109 on Windows 7 ignore modern color functions and render pages colorless.
- Platform admin (Super Admin) authorization lives in public.platform_admins with a security-definer has_platform_admin() helper; server functions verify the caller with their own RLS client BEFORE loading the privileged admin client, and platform writes go through the service-role client plus platform_audit_logs. RLS policies on industries/plans/subscriptions mirror this so the Data API never exposes platform data to regular members.
- Industry modules are independent files under src/industries/modules/ with a static registry and a generic fallback for unknown slugs; subscriptions are append-only (renewals insert new rows, latest wins) so plan history and granted_by/grant_reason stay auditable.
- Industry workspaces (/workspace) pick an operational board from src/industries/presentation.ts (art + board kind, client-only so server code never bundles images); restaurant/café kitchen tickets hand off to checkout by creating a local held order and opening /pos?resume=<id>, so payment, stock and shift logic stay in the single POS flow.

- Industry checkout extensions live under src/industries/<slug>/ and consume shared catalog contracts; payment, authoritative sale creation, returns and offline sync stay in the shared POS core to avoid diverging financial ledgers. Scoped theme styles must never target other industries.
- Industry feature metadata returned to the browser comes from the organization-linked database industry; it is descriptive only and never substitutes for server-side permission or subscription checks.
