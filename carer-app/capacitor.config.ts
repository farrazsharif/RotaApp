import type { CapacitorConfig } from '@capacitor/cli';

// Native shell config for the Caremid Carer app (iOS + Android), wrapping the
// built web app in dist/. The app is self-contained: it bundles the web build
// and talks to the live API (https://api.caremid.co.uk/api) over HTTPS — so
// updates to screens ship by rebuilding the app, not by pointing at a URL.
const config: CapacitorConfig = {
  appId: 'uk.co.caremid.carer',
  appName: 'Caremid Carer',
  webDir: 'dist',
  // Served from capacitor://localhost (iOS) / https://localhost (Android).
  ios: {
    contentInset: 'always',
    // Don't let the keyboard resize/scroll the whole web view oddly.
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#1E3A5F',
      showSpinner: false,
      launchAutoHide: true,
    },
    Keyboard: {
      resize: 'native',
    },
  },
};

export default config;
