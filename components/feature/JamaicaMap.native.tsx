import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Pressable } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { PARISHES } from '../../constants/data';

// ─── Jamaica initial region ───────────────────────────────────────────────────
const JAMAICA_REGION: Region = {
  latitude: 18.1096,
  longitude: -77.2975,
  latitudeDelta: 1.05,
  longitudeDelta: 1.80,
};

// ─── Parish geo coordinates ───────────────────────────────────────────────────
const PARISH_COORDS: Record<string, { latitude: number; longitude: number }> = {
  'Kingston':      { latitude: 17.9970, longitude: -76.7936 },
  'St. Andrew':    { latitude: 18.0280, longitude: -76.7520 },
  'St. Thomas':    { latitude: 17.9300, longitude: -76.5500 },
  'Portland':      { latitude: 18.1741, longitude: -76.4500 },
  'St. Mary':      { latitude: 18.2700, longitude: -76.9000 },
  'St. Ann':       { latitude: 18.4341, longitude: -77.2000 },
  'Trelawny':      { latitude: 18.3500, longitude: -77.6500 },
  'St. James':     { latitude: 18.4700, longitude: -77.9200 },
  'Hanover':       { latitude: 18.4100, longitude: -78.1300 },
  'Westmoreland':  { latitude: 18.2200, longitude: -78.1600 },
  'St. Elizabeth': { latitude: 18.0600, longitude: -77.7500 },
  'Manchester':    { latitude: 18.0452, longitude: -77.5078 },
  'Clarendon':     { latitude: 17.9600, longitude: -77.2200 },
  'St. Catherine': { latitude: 17.9900, longitude: -77.0000 },
};

// ─── Dark Jamaica-themed map style ────────────────────────────────────────────
const MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0a1a0d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ec88c' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0a1a0d' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#1b4d1e' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#0d2b10' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#0d2b10' }] },
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#0d3b12' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a3d1a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#214d21' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2d6e2d' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#007a33' }] },
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#071a2e' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#1a4a6e' }] },
];

// ─── Custom pin component ─────────────────────────────────────────────────────
function ParishPin({ count, isSelected }: { count: number; isSelected: boolean }) {
  const size = isSelected ? 40 : count > 0 ? 32 : 22;
  return (
    <View style={[
      pinStyles.pin,
      { width: size, height: size, borderRadius: size / 2 },
      count > 0 ? pinStyles.pinActive : pinStyles.pinEmpty,
      isSelected && pinStyles.pinSelected,
    ]}>
      {count > 0 ? (
        <Text style={[pinStyles.count, isSelected && { fontSize: 13 }]}>{count}</Text>
      ) : (
        <View style={pinStyles.dot} />
      )}
    </View>
  );
}

const pinStyles = StyleSheet.create({
  pin: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: Colors.background,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5, shadowRadius: 4, elevation: 5,
  },
  pinEmpty: { backgroundColor: Colors.surfaceBorder },
  pinActive: { backgroundColor: Colors.gold },
  pinSelected: {
    backgroundColor: Colors.greenLight, borderColor: '#fff',
    shadowColor: Colors.greenLight, shadowOpacity: 0.8, shadowRadius: 8, elevation: 8,
  },
  count: { fontSize: 11, fontWeight: '900', color: Colors.textOnGold },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.textMuted },
});

// ─── Props ────────────────────────────────────────────────────────────────────
export interface JamaicaMapProps {
  parishCounts: Record<string, number>;
  selectedParish: string | null;
  onParishPress: (parish: string) => void;
  style?: any;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function JamaicaMap({ parishCounts, selectedParish, onParishPress, style }: JamaicaMapProps) {
  const mapRef = useRef<MapView>(null);

  // Animate to selected parish or reset to island view
  useEffect(() => {
    if (!mapRef.current) return;
    if (selectedParish) {
      const coords = PARISH_COORDS[selectedParish];
      if (coords) {
        mapRef.current.animateToRegion(
          { ...coords, latitudeDelta: 0.35, longitudeDelta: 0.55 },
          600,
        );
      }
    } else {
      mapRef.current.animateToRegion(JAMAICA_REGION, 600);
    }
  }, [selectedParish]);

  return (
    <MapView
      ref={mapRef}
      style={[StyleSheet.absoluteFillObject, style]}
      provider={undefined}
      initialRegion={JAMAICA_REGION}
      customMapStyle={MAP_STYLE}
      showsCompass={false}
      showsScale={false}
      showsMyLocationButton={false}
      toolbarEnabled={false}
      mapType="standard"
    >
      {PARISHES.map((parish) => {
        const coords = PARISH_COORDS[parish];
        if (!coords) return null;
        const count = parishCounts[parish] ?? 0;
        const isSelected = selectedParish === parish;
        return (
          <Marker
            key={parish}
            coordinate={coords}
            onPress={() => onParishPress(parish)}
            tracksViewChanges={false}
            zIndex={isSelected ? 10 : count > 0 ? 5 : 1}
          >
            <ParishPin count={count} isSelected={isSelected} />
          </Marker>
        );
      })}
    </MapView>
  );
}
