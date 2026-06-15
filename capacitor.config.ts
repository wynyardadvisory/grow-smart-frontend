import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vercro.app',
  appName: 'Vercro',
  webDir: 'out',
  ios: {
    scheme: 'com.vercro.app',
    handleApplicationNotifications: false,
    // Disable limitsNavigationsToAppBoundDomains to allow cache clearing
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    scheme: 'com.vercro.app',
  },
  // Tell Capacitor not to cache the web bundle between app launches
  // This ensures users always get the latest deployed code
  server: {
    // Use local files (normal behaviour) but with cache disabled
    cleartext: false,
  },
};

export default config;
