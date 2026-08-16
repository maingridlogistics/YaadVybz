// components/feature/JamaicaMap.tsx
//
// Platform-agnostic barrel export.
// Metro selects JamaicaMap.native.tsx on iOS/Android automatically.
// This file is the fallback for TypeScript resolution and web.
// The .native.tsx extension takes priority on native builds.

// Re-export web fallback as the shared type source.
// Metro selects JamaicaMap.native.tsx on iOS/Android automatically.
export { JamaicaMap } from './JamaicaMap.web';
export type { JamaicaMapProps } from './JamaicaMap.web';
