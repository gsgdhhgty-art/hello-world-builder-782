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
