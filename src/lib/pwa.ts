import { registerSW } from "virtual:pwa-register";

export type PwaState = {
  canInstall: boolean;
  updateReady: boolean;
  updating: boolean;
};

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const EVENT_NAME = "smartpos:pwa-state";
let installPrompt: InstallPromptEvent | null = null;
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null;
let initialized = false;
let state: PwaState = { canInstall: false, updateReady: false, updating: false };

function publish(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: state }));
}

export function getPwaState(): PwaState {
  return state;
}

export function subscribePwaState(listener: (state: PwaState) => void): () => void {
  const receive = (event: Event) => listener((event as CustomEvent<PwaState>).detail);
  window.addEventListener(EVENT_NAME, receive);
  return () => window.removeEventListener(EVENT_NAME, receive);
}

/** Initializes the real browser install prompt and production service worker once. */
export function registerOfflineSupport(): void {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    publish({ canInstall: true });
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    publish({ canInstall: false });
  });

  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;
  const inPreview = window.self !== window.top || window.location.hostname.includes("id-preview--");
  if (inPreview) return;

  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      publish({ updateReady: true });
    },
    onRegisterError() {
      publish({ updateReady: false, updating: false });
    },
  });
}

export async function installPwa(): Promise<boolean> {
  const prompt = installPrompt;
  if (!prompt) return false;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  installPrompt = null;
  publish({ canInstall: false });
  return choice.outcome === "accepted";
}

export async function applyPwaUpdate(): Promise<void> {
  if (!updateServiceWorker) return;
  publish({ updating: true });
  await updateServiceWorker(true);
}
