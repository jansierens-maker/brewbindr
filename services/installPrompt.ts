/**
 * Installing BrewBindr as an app (PWA). Android and desktop Chrome/Edge offer an install
 * prompt (the beforeinstallprompt event), which can fire before the Settings screen is open,
 * so it is captured at start-up. iPhone/iPad have no such prompt: there the user adds the
 * app with Safari > Share > Add to Home Screen.
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

/** Call once at start-up. */
export const captureInstallPrompt = () => {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); // show our own button instead of the browser's mini-bar
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => { deferred = null; notify(); });
};

export const canPromptInstall = () => deferred !== null;

export const promptInstall = async (): Promise<boolean> => {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  notify();
  return outcome === 'accepted';
};

export const onInstallChange = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** Already running as an installed app. */
export const isInstalled = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/** iPhone, iPad (also an iPad that reports itself as a Mac). */
export const isIos = (ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints) =>
  /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
