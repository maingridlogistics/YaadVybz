// ─── Parish Images ────────────────────────────────────────────────────────────
// Shared parish image map used by Browse (events) and BusinessExplore.
// Centralised here to avoid duplicating require() calls in multiple files.

export const PARISH_IMAGES: Record<string, any> = {
  'Kingston':        require('../assets/images/parishes/kingston.jpg'),
  'Saint Andrew':    require('../assets/images/parishes/saint_andrew.jpg'),
  'Saint Thomas':    require('../assets/images/parishes/saint_thomas.jpg'),
  'Portland':        require('../assets/images/parishes/portland.jpg'),
  'Saint Mary':      require('../assets/images/parishes/saint_mary.jpg'),
  'Saint Ann':       require('../assets/images/parishes/saint_ann.jpg'),
  'Trelawny':        require('../assets/images/parishes/trelawny.jpg'),
  'Saint James':     require('../assets/images/parishes/saint_james.jpg'),
  'Hanover':         require('../assets/images/parishes/hanover.jpg'),
  'Westmoreland':    require('../assets/images/parishes/westmoreland.jpg'),
  'Saint Elizabeth': require('../assets/images/parishes/saint_elizabeth.jpg'),
  'Manchester':      require('../assets/images/parishes/manchester.jpg'),
  'Clarendon':       require('../assets/images/parishes/clarendon.jpg'),
  'Saint Catherine': require('../assets/images/parishes/saint_catherine.jpg'),
};

export function getParishImage(parish: string): any {
  return PARISH_IMAGES[parish] ?? PARISH_IMAGES['Kingston'];
}
