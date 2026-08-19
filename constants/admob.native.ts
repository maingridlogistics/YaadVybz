// Native (iOS / Android) — uses TestIds from the real library in dev.
import { Platform } from 'react-native';
import { TestIds } from 'react-native-google-mobile-ads';

const ANDROID_BANNER_AD_UNIT_ID = 'ca-app-pub-2171710480593213/3188624868';

export const BANNER_AD_UNIT_ID = __DEV__
  ? TestIds.BANNER
  : Platform.select({
      android: ANDROID_BANNER_AD_UNIT_ID,
      ios: TestIds.BANNER,
      default: TestIds.BANNER,
    })!;
