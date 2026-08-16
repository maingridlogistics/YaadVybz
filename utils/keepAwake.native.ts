// utils/keepAwake.native.ts
// Native platform wrapper for expo-keep-awake.
// Imported only on iOS and Android — never bundled for web.
import {
  activateKeepAwakeAsync,
  deactivateKeepAwake,
} from 'expo-keep-awake';

export { activateKeepAwakeAsync, deactivateKeepAwake };
