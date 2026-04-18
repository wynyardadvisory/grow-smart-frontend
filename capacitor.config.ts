import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vercro.app',
  appName: 'Vercro',
  webDir: 'out',
  ios: {
    scheme: 'com.vercro.app',
  },
  android: {
    scheme: 'com.vercro.app',
  },
};

export default config;