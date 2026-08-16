import { Stack } from 'expo-router';

// ─── Explore Discovery Stack ──────────────────────────────────────────────────
// All dedicated discovery pages (parish pages, category pages, directories,
// combined results) live under this stack. Header is managed per-screen.
export default function ExploreLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="business-parish" />
      <Stack.Screen name="business-category" />
      <Stack.Screen name="business-results" />
      <Stack.Screen name="business-parishes" />
      <Stack.Screen name="business-categories" />
      <Stack.Screen name="event-parish" />
      <Stack.Screen name="event-category" />
      <Stack.Screen name="event-results" />
      <Stack.Screen name="event-parishes" />
      <Stack.Screen name="event-categories" />
    </Stack>
  );
}
