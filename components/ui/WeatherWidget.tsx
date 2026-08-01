import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

interface WeatherData {
  condition: string;
  tempC: number;
  uvIndex: number;
  humidity: number;
  rainChance: number;
  icon: string;
  color: string;
  advice: string;
}

const COOL_PARISHES = new Set(['Manchester', 'St. Elizabeth']);
const WET_PARISHES  = new Set(['Portland', 'St. Thomas', 'St. Mary']);
const SUN_PARISHES  = new Set(['Westmoreland', 'Hanover', 'St. James', 'St. Ann']);

function deriveWeather(parish: string, dateStr: string): WeatherData {
  const month = new Date(dateStr).getMonth(); // 0-11
  const isRainy  = month >= 4 && month <= 10;
  const isCool   = COOL_PARISHES.has(parish);
  const isWet    = WET_PARISHES.has(parish);
  const isSunny  = SUN_PARISHES.has(parish);

  // Deterministic variance from parish name
  const base = parish.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

  const tempC    = isCool ? 23 + (base % 4) : 29 + (base % 5);
  const humidity = isRainy ? 72 + (base % 12) : 56 + (base % 12);
  let rainChance = isWet ? 42 + (base % 18) : isSunny ? 6 + (base % 10) : 14 + (base % 18);
  if (isRainy && !isSunny) rainChance += 10;
  rainChance = Math.min(85, Math.max(5, rainChance));

  const uvIndex = isCool ? 7 : rainChance > 40 ? 6 : 10;

  let condition: string, icon: string, color: string, advice: string;

  if (rainChance >= 50) {
    condition = 'Rainy Spells';
    icon = 'thunderstorm';
    color = '#5C6BC0';
    advice = 'Pack an umbrella — scattered showers expected';
  } else if (rainChance >= 25) {
    condition = 'Partly Cloudy';
    icon = 'wb-cloudy';
    color = '#78909C';
    advice = 'Some cloud cover but still great outdoor vibes';
  } else {
    condition = 'Sunny & Hot';
    icon = 'wb-sunny';
    color = '#FFB300';
    advice = 'Perfect weather — bring sunscreen & stay hydrated!';
  }

  return { condition, tempC, uvIndex, humidity, rainChance, icon, color, advice };
}

// Only show for outdoor-friendly event types
const OUTDOOR_TYPES = new Set([
  'beach', 'carnival', 'community', 'sporting',
  'party', 'all-inclusive', 'dancehall', 'culture',
]);

interface WeatherWidgetProps {
  parish: string;
  date: string;
  eventType: string;
}

export function WeatherWidget({ parish, date, eventType }: WeatherWidgetProps) {
  if (!OUTDOOR_TYPES.has(eventType)) return null;

  const w = deriveWeather(parish, date);
  const tempF  = Math.round(w.tempC * 9 / 5 + 32);
  const uvLabel = w.uvIndex >= 9 ? 'Very High' : w.uvIndex >= 6 ? 'High' : 'Moderate';

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[`${w.color}1E`, `${w.color}06`]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header row */}
      <View style={styles.topRow}>
        <View style={[styles.iconBg, { backgroundColor: `${w.color}28` }]}>
          <MaterialIcons name={w.icon as any} size={24} color={w.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.widgetLabel}>Event Day Weather</Text>
          <Text style={styles.condition}>{w.condition}</Text>
          <Text style={styles.parish}>{parish}, Jamaica</Text>
        </View>
        <View style={styles.tempBlock}>
          <Text style={[styles.temp, { color: w.color }]}>{w.tempC}°C</Text>
          <Text style={styles.tempAlt}>{tempF}°F</Text>
        </View>
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        {([
          { icon: 'wb-sunny',    label: uvLabel,        sub: 'UV',      iconColor: '#FF9800' },
          { icon: 'water-drop',  label: `${w.humidity}%`, sub: 'Humidity', iconColor: '#2196F3' },
          { icon: 'umbrella',    label: `${w.rainChance}%`, sub: 'Rain',  iconColor: '#5C6BC0' },
        ] as const).map((s, i) => (
          <React.Fragment key={s.sub}>
            {i > 0 && <View style={styles.statDivider} />}
            <View style={styles.stat}>
              <MaterialIcons name={s.icon as any} size={15} color={s.iconColor} />
              <Text style={styles.statValue}>{s.label}</Text>
              <Text style={styles.statSub}>{s.sub}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* Advice */}
      <View style={styles.adviceRow}>
        <MaterialIcons name="tips-and-updates" size={13} color={w.color} />
        <Text style={styles.adviceText}>{w.advice}</Text>
      </View>

      <Text style={styles.disclaimer}>
        Simulated forecast based on typical {parish} weather patterns
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.base, gap: Spacing.md, overflow: 'hidden', position: 'relative',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconBg: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  widgetLabel: { fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  condition: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary, marginTop: 2 },
  parish: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  tempBlock: { alignItems: 'flex-end', gap: 1 },
  temp: { fontSize: 30, fontWeight: Typography.black, lineHeight: 34 },
  tempAlt: { fontSize: Typography.xs, color: Colors.textMuted },
  statsBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statValue: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  statSub: { fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  statDivider: { width: 1, height: 30, backgroundColor: Colors.surfaceBorder },
  adviceRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    padding: Spacing.sm, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  adviceText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 18 },
  disclaimer: { fontSize: 10, color: Colors.textMuted, fontStyle: 'italic' },
});
