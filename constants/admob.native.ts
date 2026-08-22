// Native (iOS / Android) — static import is safe here because Metro only
// bundles this file on iOS/Android (never on web, per .native.ts extension).
import { Platform } from 'react-native';
import { TestIds } from 'react-native-google-mobile-ads';

const ANDROID_BANNER_AD_UNIT_ID = 'ca-app-pub-2171710480593213/3188624868';

export const BANNER_AD_UNIT_ID: string = __DEV__
  ? TestIds.BANNER
  : Platform.select({
      android: ANDROID_BANNER_AD_UNIT_ID,
      ios: TestIds.BANNER,
      default: TestIds.BANNER,
    })!
