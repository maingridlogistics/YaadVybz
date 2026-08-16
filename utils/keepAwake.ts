// utils/keepAwake.ts
// Web / fallback stub — no-op functions so the import never fails on web.
export async function activateKeepAwakeAsync(_tag?: string): Promise<void> {
  // no-op on web
}

export function deactivateKeepAwake(_tag?: string): void {
  // no-op on web
}
