import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pb.expensetracker',
  appName: 'PB Expense Tracker',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    StatusBar: {
      backgroundColor: '#0a0e27',
      style: 'DARK'
    }
  }
};

export default config;
