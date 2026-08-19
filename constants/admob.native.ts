// Native (iOS / Android) — lazy-require so the native module is never
// accessed at bundle evaluation time (prevents AppRegistry crash if the
// native binary doesn't include the module yet).
import { Platform } from 'react-native';

const ANDROID_BANNER_AD_UNIT_ID = 'ca-app-pub-2171710480593213/3188624868';

function getTestIdsBanner(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { TestIds } = require('react-native-google-mobile-ads') as {
      TestIds: { BANNER: string };
    };
    return TestIds.BANNER;
  } catch {
    return ANDROID_BANNER_AD_UNIT_ID;
  }
}

export const BANNER_AD_UNIT_ID: string = __DEV__
  ? getTestIdsBanner()
  : Platform.select({
      android: ANDROID_BANNER_AD_UNIT_ID,
      ios: getTestIdsBanner(),
      default: getTestIdsBanner(),
    })!;
