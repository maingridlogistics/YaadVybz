/**
 * Lightweight module-level store for cross-screen admin navigation signals.
 *
 * Usage:
 *   - Writer: adminNav.setTab('queue') before navigating to the Profile tab.
 *   - Reader: adminNav.consumeTab() inside a useFocusEffect — returns the
 *     pending tab (or null) and clears it atomically.
 */

let _pendingTab: string | null = null;

export const adminNav = {
  setTab: (tab: string): void => {
    _pendingTab = tab;
  },
  consumeTab: (): string | null => {
    const t = _pendingTab;
    _pendingTab = null;
    return t;
  },
};
