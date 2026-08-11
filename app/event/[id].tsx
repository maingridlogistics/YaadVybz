
import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  Share,
  Dimensions,
  FlatList,
  Platform,
  Modal,
  Alert,
  ActionSheetIOS,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEvents } from '../../hooks/useEvents';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { useLanguage } from '../../hooks/useLanguage';
import * as Calendar from 'expo-calendar';
import { supabase } from '../../lib/supabase';
import { getThumbUrl, getCardUrl, getFullUrl } from '../../lib/storage';
import { WeatherWidget } from '../../components/ui/WeatherWidget';
import { ImageLightbox } from '../../components/feature/ImageLightbox';
import { PlacementAd } from '../../components/ui/PlacementAd';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants/theme';
import {
  formatDate,
  formatCount,
  TYPE_COLORS,
  EVENT_TYPES,
  Event,
  isBoostActive,
  isEventPassed,
} from '../../constants/data';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
// Cap at 48% of screen height so the hero never dominates on small phones (≤667px)
const HERO_HEIGHT = Math.min(340, Math.floor(SCREEN_HEIGHT * 0.48));

// ─── Flyer Gallery ─────────────────────────────────────────────────────────────
function FlyerGallery({ images, title }: { images: string[]; title: string }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const flatRef = useRef<FlatList>(null);
  const [showLightbox, setShowLightbox] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(0);

  const openLightbox = (idx: number) => {
    setLightboxIdx(idx);
    setShowLightbox(true);
  };

  if (!images || images.length === 0) return null;

  if (images.length === 1) {
    return (
      <>
        <Pressable onPress={() => openLightbox(0)} style={galleryStyles.single}>
          <Image
            source={{ uri: getFullUrl(images[0]) }}
            style={galleryStyles.singleImg}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
            priority="high"
          />
          <View pointerEvents="none" style={galleryStyles.tapHint}>
            <MaterialIcons name="zoom-in" size={13} color="rgba(255,255,255,0.6)" />
            <Text style={galleryStyles.tapHintText}>Tap to expand</Text>
          </View>
        </Pressable>
        <ImageLightbox
          images={images}
          initialIndex={lightboxIdx}
          visible={showLightbox}
          onClose={() => setShowLightbox(false)}
        />
      </>
    );
  }

  return (
    <>
      <View style={galleryStyles.container}>
        <FlatList
          ref={flatRef}
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => i.toString()}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
            setActiveIdx(idx);
          }}
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => openLightbox(index)}
              style={{ width: SCREEN_WIDTH, height: HERO_HEIGHT }}
            >
              <Image
                source={{ uri: getFullUrl(item) }}
                style={[galleryStyles.slide, { width: SCREEN_WIDTH }]}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
                priority="high"
              />
            </Pressable>
          )}
        />
        {/* Dots indicator */}
        <View style={galleryStyles.dots}>
          {images.map((_, i) => (
            <Pressable
              key={i}
              onPress={() => {
                flatRef.current?.scrollToIndex({ index: i, animated: true });
                setActiveIdx(i);
              }}
              style={[galleryStyles.dot, i === activeIdx && galleryStyles.dotActive]}
            />
          ))}
        </View>
        {/* Counter badge */}
        <View style={galleryStyles.counter}>
          <MaterialIcons name="collections" size={11} color="#fff" />
          <Text style={galleryStyles.counterText}>{activeIdx + 1}/{images.length}</Text>
        </View>
        {/* Tap to expand hint */}
        <View pointerEvents="none" style={galleryStyles.tapHint}>
          <MaterialIcons name="zoom-in" size={13} color="rgba(255,255,255,0.55)" />
          <Text style={galleryStyles.tapHintText}>Tap photo to expand</Text>
        </View>
      </View>
      <ImageLightbox
        images={images}
        initialIndex={lightboxIdx}
        visible={showLightbox}
        onClose={() => setShowLightbox(false)}
      />
    </>
  );
}

const galleryStyles = StyleSheet.create({
  single: { height: HERO_HEIGHT },
  singleImg: { width: '100%', height: '100%' },
  container: { height: HERO_HEIGHT, position: 'relative' },
  slide: { height: HERO_HEIGHT },
  dots: {
    position: 'absolute',
    bottom: Spacing.base,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: Colors.gold,
    width: 18,
    borderRadius: 3,
  },
  counter: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  counterText: { fontSize: 11, color: '#fff', fontWeight: Typography.semibold },
  tapHint: {
    position: 'absolute',
    bottom: Spacing.md,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  tapHintText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: Typography.medium,
  },
});

// ─── QR Ticket Modal ──────────────────────────────────────────────────────────
function QRTicketModal({ visible, onClose, event, userId }: {
  visible: boolean; onClose: () => void; event: Event; userId: string;
}) {
  const ticketId = `YV-${event.id.replace('_', '').slice(0, 6).toUpperCase()}-${userId.replace(/\D/g, '').slice(-4) || 'XXXX'}`;
  // Build a simple visual QR grid from ticket data (deterministic pixel pattern)
  const CELLS = 17;
  const seed = `${event.id}:${userId}`;
  const hash = seed.split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 0);
  const isFinder = (r: number, c: number) => {
    const inTopLeft = r < 5 && c < 5;
    const inTopRight = r < 5 && c > CELLS - 6;
    const inBotLeft = r > CELLS - 6 && c < 5;
    if (inTopLeft || inTopRight || inBotLeft) {
      const rLocal = inTopLeft ? r : r - (CELLS - 5);
      const cLocal = inTopLeft || inBotLeft ? c : c - (CELLS - 5);
      return rLocal === 0 || rLocal === 4 || cLocal === 0 || cLocal === 4 || (rLocal >= 1 && rLocal <= 3 && cLocal >= 1 && cLocal <= 3);
    }
    return false;
  };
  const isData = (r: number, c: number) => {
    if (isFinder(r, c)) return isFinder(r, c);
    return ((hash + r * 31 + c * 17 + r * c) % 3) !== 0;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={qrStyles.overlay} onPress={onClose}>
        <Pressable style={qrStyles.ticket} onPress={(e) => e.stopPropagation()}>
          {/* Ticket header */}
          <LinearGradient colors={['#001A0D', '#071508']} style={qrStyles.ticketHeader}>
            <View style={qrStyles.logoBadge}>
              <View style={qrStyles.logoDot} />
              <Text style={qrStyles.logoText}>VYBZ HUB</Text>
            </View>
            <Text style={qrStyles.headerTitle}>EVENT TICKET</Text>
            <Text style={qrStyles.headerSub}>Scan at entry · Keep this safe</Text>
          </LinearGradient>

          {/* Event info */}
          <View style={qrStyles.eventRow}>
            <Image source={{ uri: getCardUrl(event.coverImage) }} style={qrStyles.eventThumb} contentFit="cover" transition={200} />
            <View style={{ flex: 1 }}>
              <Text style={qrStyles.eventTitle} numberOfLines={2}>{event.title}</Text>
              <Text style={qrStyles.eventMeta}>{formatDate(event.date)}</Text>
              <Text style={qrStyles.eventMeta}>{event.venue}</Text>
              <Text style={qrStyles.eventMeta}>{event.parish}, Jamaica</Text>
            </View>
          </View>

          {/* Perforated divider */}
          <View style={qrStyles.perfRow}>
            <View style={[qrStyles.perfCircle, { left: -16 }]} />
            <View style={qrStyles.perfDash} />
            <View style={[qrStyles.perfCircle, { right: -16 }]} />
          </View>

          {/* QR grid */}
          <View style={qrStyles.qrArea}>
            <View style={qrStyles.qrWrapper}>
              {Array.from({ length: CELLS }, (_, row) => (
                <View key={row} style={{ flexDirection: 'row' }}>
                  {Array.from({ length: CELLS }, (_, col) => (
                    <View
                      key={col}
                      style={{
                        width: 11, height: 11,
                        backgroundColor: isData(row, col) ? '#0A0A0A' : '#F8F8F0',
                      }}
                    />
                  ))}
                </View>
              ))}
            </View>
            <Text style={qrStyles.scanHint}>Scan this code at the event entrance</Text>
          </View>

          {/* Ticket ID */}
          <View style={qrStyles.ticketIdRow}>
            <Text style={qrStyles.ticketIdLabel}>TICKET ID</Text>
            <Text style={qrStyles.ticketId}>{ticketId}</Text>
            <View style={[qrStyles.statusBadge, { backgroundColor: event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry' ? `${Colors.greenLight}20` : `${Colors.gold}20`, borderColor: event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry' ? `${Colors.greenLight}55` : `${Colors.gold}55` }]}>
              <MaterialIcons name="verified" size={12} color={event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry' ? Colors.greenLight : Colors.gold} />
              <Text style={[qrStyles.statusBadgeText, { color: event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry' ? Colors.greenLight : Colors.gold }]}>Valid Entry</Text>
            </View>
          </View>

          <Pressable onPress={onClose} style={qrStyles.closeBtn}>
            <Text style={qrStyles.closeBtnText}>Close Ticket</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const qrStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end', alignItems: 'center' },
  ticket: {
    backgroundColor: Colors.surface, width: '100%', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  ticketHeader: {
    alignItems: 'center', paddingVertical: Spacing.lg, gap: Spacing.xs,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  logoBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  logoDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.gold },
  logoText: { fontSize: 11, fontWeight: Typography.black, color: Colors.gold, letterSpacing: 3 },
  headerTitle: { fontSize: 22, fontWeight: Typography.black, color: Colors.textPrimary, letterSpacing: 2 },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted },
  eventRow: {
    flexDirection: 'row', gap: Spacing.md, padding: Spacing.base,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, alignItems: 'center',
  },
  eventThumb: { width: 64, height: 64, borderRadius: Radius.md, flexShrink: 0 },
  eventTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary, lineHeight: 22 },
  eventMeta: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  perfRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: Spacing.base, position: 'relative', height: 20,
  },
  perfCircle: {
    position: 'absolute', width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  perfDash: {
    flex: 1, height: 1, marginHorizontal: 8,
    borderStyle: 'dashed', borderTopWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  qrArea: { alignItems: 'center', paddingVertical: Spacing.base, gap: Spacing.md, backgroundColor: Colors.surfaceElevated },
  qrWrapper: { backgroundColor: '#F8F8F0', padding: 8, borderRadius: Radius.sm },
  scanHint: { fontSize: Typography.xs, color: Colors.textMuted },
  ticketIdRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
  },
  ticketIdLabel: { fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  ticketId: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.black, color: Colors.textPrimary, letterSpacing: 1.5 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1 },
  statusBadgeText: { fontSize: 11, fontWeight: Typography.bold },
  closeBtn: {
    margin: Spacing.base, borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceElevated, paddingVertical: Spacing.md,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  closeBtnText: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textSecondary },
});

// ─── Map Placeholder ────────────────────────────────────────────────────────────
function MapSection({ venue, address, parish }: { venue: string; address: string; parish: string }) {
  const handleOpenMap = () => {
    const query = encodeURIComponent(`${venue}, ${address || parish}, Jamaica`);
    const url = Platform.OS === 'ios'
      ? `maps:?q=${query}`
      : `https://maps.google.com/?q=${query}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://maps.google.com/?q=${query}`);
    });
  };

  return (
    <Pressable
      onPress={handleOpenMap}
      style={({ pressed }) => [mapStyles.container, pressed && { opacity: 0.9 }]}
    >
      {/* Stylized map background */}
      <LinearGradient
        colors={['#071F0C', '#0A2E14', '#051A0A']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map((f) => (
        <View key={`h${f}`} style={[mapStyles.gridH, { top: `${f * 100}%` as any }]} />
      ))}
      {[0.2, 0.4, 0.6, 0.8].map((f) => (
        <View key={`v${f}`} style={[mapStyles.gridV, { left: `${f * 100}%` as any }]} />
      ))}

      {/* Roads */}
      <View style={[mapStyles.road, { top: '38%', width: '100%', height: 4 }]} />
      <View style={[mapStyles.road, { top: '62%', width: '100%', height: 2 }]} />
      <View style={[mapStyles.road, { left: '45%', height: '100%', width: 4 }]} />

      {/* Pin */}
      <View style={mapStyles.pinWrap}>
        <View style={mapStyles.pinGlow} />
        <View style={mapStyles.pin}>
          <MaterialIcons name="place" size={22} color="#fff" />
        </View>
        <View style={mapStyles.pinShadow} />
      </View>

      {/* Address overlay */}
      <View style={mapStyles.addressBar}>
        <MaterialIcons name="place" size={14} color={Colors.gold} />
        <View style={{ flex: 1 }}>
          <Text style={mapStyles.addressVenue} numberOfLines={1}>{venue}</Text>
          {address ? <Text style={mapStyles.addressSub} numberOfLines={1}>{address}</Text> : null}
        </View>
        <View style={mapStyles.openBtn}>
          <MaterialIcons name="open-in-new" size={14} color={Colors.gold} />
          <Text style={mapStyles.openBtnText}>Open Map</Text>
        </View>
      </View>
    </Pressable>
  );
}

const mapStyles = StyleSheet.create({
  container: {
    height: 160,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(0,122,51,0.12)',
  },
  gridV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(0,122,51,0.12)',
  },
  road: {
    position: 'absolute',
    backgroundColor: '#0D3D1A',
    borderRadius: 2,
  },
  pinWrap: { alignItems: 'center', gap: 0 },
  pinGlow: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: `${Colors.gold}22`,
    top: -4,
  },
  pin: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    ...Shadows.gold,
  },
  pinShadow: {
    width: 12,
    height: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.3)',
    marginTop: 2,
  },
  addressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(10,10,10,0.88)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  addressVenue: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  addressSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.goldSurface,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: `${Colors.gold}44`,
    flexShrink: 0,
  },
  openBtnText: { fontSize: 11, color: Colors.gold, fontWeight: Typography.semibold },
});

// ─── Related Event Card (compact) ─────────────────────────────────────────────
function RelatedCard({ event, onPress }: { event: Event; onPress: () => void }) {
  const typeColor = TYPE_COLORS[event.type] ?? Colors.gold;
  const isFree = event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [relatedStyles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={relatedStyles.imgWrap}>
        <Image
          source={{ uri: getThumbUrl(event.coverImage) }}
          style={relatedStyles.img}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          recyclingKey={event.id}
          priority="low"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.65)']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[relatedStyles.typeDot, { backgroundColor: typeColor }]} />
      </View>
      <View style={relatedStyles.info}>
        <Text style={relatedStyles.title} numberOfLines={2}>{event.title}</Text>
        <View style={relatedStyles.metaRow}>
          <MaterialIcons name="event" size={10} color={Colors.gold} />
          <Text style={relatedStyles.meta}>{formatDate(event.date)}</Text>
        </View>
        <View style={relatedStyles.metaRow}>
          <MaterialIcons name="place" size={10} color={Colors.textMuted} />
          <Text style={relatedStyles.meta} numberOfLines={1}>{event.venue}</Text>
        </View>
        <Text style={[relatedStyles.price, isFree && relatedStyles.priceFree]}>
          {isFree ? 'Free' : event.ticketPrice}
        </Text>
      </View>
    </Pressable>
  );
}

const relatedStyles = StyleSheet.create({
  card: {
    width: 180,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  imgWrap: { height: 100, position: 'relative' },
  img: { width: '100%', height: '100%' },
  typeDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  info: { padding: Spacing.md, gap: 3 },
  title: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 10, color: Colors.textMuted, flex: 1 },
  price: { fontSize: 11, fontWeight: Typography.black, color: Colors.gold, marginTop: 2 },
  priceFree: { color: Colors.greenLight },
});

// ─── Share Sheet (web fallback) ────────────────────────────────────────────────
function ShareModal({
  visible,
  onClose,
  event,
}: {
  visible: boolean;
  onClose: () => void;
  event: Event;
}) {
  const shareText = `🇯🇲 ${event.title}\n📅 ${formatDate(event.date)}\n📍 ${event.venue}, ${event.parish}\n\nDiscover this event on Vybz Hub!`;

  const options = [
    {
      icon: 'content-copy',
      label: 'Copy Details',
      color: Colors.textSecondary,
      onPress: () => {
        // On web/native we can use Share API
        Share.share({ message: shareText, title: event.title });
        onClose();
      },
    },
    {
      icon: 'message',
      label: 'Share via SMS',
      color: '#25D366',
      onPress: () => {
        const smsUrl = `sms:?body=${encodeURIComponent(shareText)}`;
        Linking.openURL(smsUrl).catch(() => {});
        onClose();
      },
    },
    {
      icon: 'chat',
      label: 'WhatsApp',
      color: '#25D366',
      onPress: () => {
        Linking.openURL(`whatsapp://send?text=${encodeURIComponent(shareText)}`).catch(() => {
          Linking.openURL(`https://wa.me/?text=${encodeURIComponent(shareText)}`);
        });
        onClose();
      },
    },
    {
      icon: 'share',
      label: 'More Options',
      color: Colors.gold,
      onPress: () => {
        Share.share({ message: shareText, title: event.title });
        onClose();
      },
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={shareStyles.overlay} onPress={onClose}>
        <Pressable style={shareStyles.sheet} onPress={(e) => e.stopPropagation()}>
          {/* Handle */}
          <View style={shareStyles.handle} />
          <Text style={shareStyles.title}>Share Event</Text>

          {/* Event preview */}
          <View style={shareStyles.preview}>
            <Image
              source={{ uri: event.coverImage }}
              style={shareStyles.previewImg}
              contentFit="cover"
              transition={200}
            />
            <View style={{ flex: 1 }}>
              <Text style={shareStyles.previewTitle} numberOfLines={1}>{event.title}</Text>
              <Text style={shareStyles.previewMeta} numberOfLines={1}>
                {formatDate(event.date)} · {event.parish}
              </Text>
            </View>
          </View>

          {/* Options */}
          <View style={shareStyles.options}>
            {options.map((opt) => (
              <Pressable
                key={opt.label}
                onPress={opt.onPress}
                style={({ pressed }) => [shareStyles.option, pressed && { opacity: 0.7 }]}
              >
                <View style={[shareStyles.optIcon, { backgroundColor: `${opt.color}22` }]}>
                  <MaterialIcons name={opt.icon as any} size={22} color={opt.color} />
                </View>
                <Text style={shareStyles.optLabel}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={onClose} style={shareStyles.cancelBtn}>
            <Text style={shareStyles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const shareStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Spacing.xxl,
    borderTopWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceBorder,
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: Typography.md,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  previewImg: { width: 48, height: 48, borderRadius: Radius.md },
  previewTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  previewMeta: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  options: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.sm,
  },
  option: { alignItems: 'center', gap: Spacing.xs, flex: 1 },
  optIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optLabel: { fontSize: Typography.xs, color: Colors.textSecondary, textAlign: 'center', maxWidth: 70 },
  cancelBtn: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  cancelText: { fontSize: Typography.base, color: Colors.textSecondary, fontWeight: Typography.semibold },
});

// ─── Auth Prompt Modal ─────────────────────────────────────────────────────────
function AuthPromptModal({
  visible,
  onSignIn,
  onDismiss,
}: {
  visible: boolean;
  onSignIn: () => void;
  onDismiss: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={authPromptStyles.overlay} onPress={onDismiss}>
        <Pressable style={authPromptStyles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={authPromptStyles.handle} />
          <View style={authPromptStyles.iconWrap}>
            <MaterialIcons name="account-circle" size={52} color={Colors.gold} />
          </View>
          <Text style={authPromptStyles.title}>Sign In to RSVP</Text>
          <Text style={authPromptStyles.body}>
            Create a free account or sign in to mark Going or Interested, save events, and sync reminders across your devices.
          </Text>
          <Pressable
            onPress={onSignIn}
            style={({ pressed }) => [authPromptStyles.signInBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient
              colors={[Colors.gold, Colors.goldDim]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={authPromptStyles.signInBtnInner}
            >
              <MaterialIcons name="login" size={18} color={Colors.textOnGold} />
              <Text style={authPromptStyles.signInBtnText}>Sign In / Register</Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={onDismiss} style={authPromptStyles.dismissBtn} hitSlop={8}>
            <Text style={authPromptStyles.dismissText}>Not Now</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const authPromptStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
    borderTopWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    gap: Spacing.md,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceBorder,
    marginBottom: Spacing.xs,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.goldSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: `${Colors.gold}44`,
  },
  title: {
    fontSize: Typography.lg,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  body: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  signInBtn: {
    width: '100%',
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  signInBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base,
  },
  signInBtnText: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textOnGold,
  },
  dismissBtn: {
    paddingVertical: Spacing.sm,
  },
  dismissText: {
    fontSize: Typography.base,
    color: Colors.textMuted,
    textDecorationLine: 'underline',
  },
});

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    events,
    getEventById,
    userGoingIds,
    userInterestedIds,
    userBookmarkIds,
    toggleGoing,
    toggleInterested,
    toggleBookmark,
    isLoading,
  } = useEvents();

  const [showShareModal, setShowShareModal] = useState(false);
  const [showQRTicket, setShowQRTicket] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const { scheduleEventReminder, cancelEventReminder } = useNotifications();
  const { t } = useLanguage();

  const event = getEventById(id ?? '');

  const handleShare = useCallback(async () => {
    if (!event) return;
    const shareText = `🇯🇲 ${event.title}\n📅 ${formatDate(event.date)}\n📍 ${event.venue}, ${event.parish}\n\nDiscover more events on Vybz Hub!`;

    if (Platform.OS === 'ios') {
      // Native iOS share sheet
      try {
        await Share.share({ message: shareText, title: event.title });
      } catch (_) {}
    } else {
      setShowShareModal(true);
    }
  }, [event]);

  // ── Calendar export ──────────────────────────────────────────────────────
  const handleAddToCalendar = useCallback(async () => {
    if (!event) return;
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Vybz Hub needs access to your calendar to add this event.');
        return;
      }

      // Parse event date/time
      const [y, mo, d] = event.date.split('-').map(Number);
      const parseTime = (t: string): { h: number; m: number } => {
        const match = t?.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!match) return { h: 19, m: 0 };
        let h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        const p = match[3].toUpperCase();
        if (p === 'PM' && h !== 12) h += 12;
        if (p === 'AM' && h === 12) h = 0;
        return { h, m };
      };
      const { h: startH, m: startM } = parseTime(event.startTime);
      const { h: endH, m: endM } = event.endTime ? parseTime(event.endTime) : { h: startH + 3, m: startM };

      const startDate = new Date(y, mo - 1, d, startH, startM);
      const endDate   = new Date(y, mo - 1, d, endH, endM);

      // Get default writable calendar
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const writable  = calendars.find((c) => c.allowsModifications) ?? calendars[0];
      if (!writable) {
        Alert.alert('No Calendar', 'No writable calendar found on this device.');
        return;
      }

      await Calendar.createEventAsync(writable.id, {
        title: event.title,
        startDate,
        endDate,
        location: `${event.venue}${event.address ? `, ${event.address}` : ''}, ${event.parish}, Jamaica`,
        notes: event.description ? `${event.description}\n\n${event.ticketLink ? `Tickets: ${event.ticketLink}` : ''}` : undefined,
        alarms: [{ relativeOffset: -120 }], // 2h reminder
      });

      Alert.alert('Added to Calendar', `"${event.title}" has been saved to your calendar with a 2-hour reminder.`);
    } catch (err: any) {
      console.warn('[Calendar export] error:', err?.message);
      Alert.alert('Error', 'Could not add this event to your calendar. Please try again.');
    }
  }, [event]);

  // Memoised before the early-return so hooks are always called in the same order
  const relatedEvents = useMemo(
    () => !event ? [] : events
      .filter((e) => e.id !== event.id && !isEventPassed(e.date) && (e.parish === event.parish || e.promoterId === event.promoterId))
      .slice(0, 8),
    [events, event],
  );

  // Increment view count once per visit (non-blocking, runs on event ID change)
  useEffect(() => {
    if (!id) return;
    supabase.rpc('increment_view_count', { p_event_id: id })
      .then(() => {}).catch(() => {});
  }, [id]);

  if (!event) {
    if (isLoading) {
      return (
        <View style={styles.notFound}>
          <SafeAreaView edges={['top']} />
          <ActivityIndicator size="large" color={Colors.gold} />
          <Text style={[styles.notFoundSub, { marginTop: Spacing.md }]}>Loading event details...</Text>
        </View>
      );
    }
    return (
      <View style={styles.notFound}>
        <SafeAreaView edges={['top']} />
        <View style={styles.notFoundIcon}>
          <MaterialIcons name="event-busy" size={40} color={Colors.textMuted} />
        </View>
        <Text style={styles.notFoundTitle}>Event Not Found</Text>
        <Text style={styles.notFoundSub}>This event may have been removed.</Text>
        <Pressable
          onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)' as any); }}
          style={({ pressed }) => [styles.notFoundBtn, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.notFoundBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // True when the promoter has an active pro or elite subscription (denormalized on events table)
  const isPromoterVerified = event.promoterTier === 'pro' || event.promoterTier === 'elite';
  const isGoing = userGoingIds.includes(event.id);
  const isInterested = userInterestedIds.includes(event.id);
  const isBookmarked = userBookmarkIds?.includes(event.id) ?? false;
  const typeColor = TYPE_COLORS[event.type] ?? Colors.gold;
  const isFree = event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry';
  const handleTicketLink = () => {
    if (event.ticketLink) {
      Linking.openURL(event.ticketLink).catch(() => {});
    }
  };

  return (
    <View style={styles.container}>
      {event && (
        <QRTicketModal
          visible={showQRTicket}
          onClose={() => setShowQRTicket(false)}
          event={event}
          userId={user?.id ?? 'guest'}
        />
      )}
      <AuthPromptModal
        visible={showAuthPrompt}
        onSignIn={() => { setShowAuthPrompt(false); router.push('/auth' as any); }}
        onDismiss={() => setShowAuthPrompt(false)}
      />
      <ScrollView showsVerticalScrollIndicator={false} bounces>

        {/* ── Flyer Gallery ── */}
        <View style={styles.galleryWrap}>
          <FlyerGallery
            images={event.flyerImages?.length ? event.flyerImages : [event.coverImage]}
            title={event.title}
          />

          {/* Gradient overlay at bottom of gallery */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.6)', Colors.background]}
            style={styles.galleryGradient}
            pointerEvents="none"
          />

          {/* Top HUD */}
          <SafeAreaView edges={['top']} style={styles.hud}>
            <Pressable
              onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)' as any); }}
              style={({ pressed }) => [styles.hudBtn, pressed && { opacity: 0.7 }]}
            >
              <MaterialIcons name="arrow-back" size={20} color="#fff" />
            </Pressable>
            <View style={styles.hudRight}>
              {/* Edit button — visible only to the promoter who owns this event */}
              {user?.id === event.promoterId && (
                <Pressable
                  onPress={() => router.push(`/edit-event/${event.id}` as any)}
                  style={({ pressed }) => [styles.hudBtn, styles.hudBtnEdit, pressed && { opacity: 0.7 }]}
                >
                  <MaterialIcons name="edit" size={18} color={Colors.gold} />
                </Pressable>
              )}
              <Pressable
                onPress={() => { const ok = toggleBookmark(event.id); if (!ok) setShowAuthPrompt(true); }}
                style={({ pressed }) => [styles.hudBtn, pressed && { opacity: 0.7 }]}
              >
                <MaterialIcons
                  name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                  size={20}
                  color={isBookmarked ? Colors.gold : '#fff'}
                />
              </Pressable>
              <Pressable
                onPress={handleShare}
                style={({ pressed }) => [styles.hudBtn, pressed && { opacity: 0.7 }]}
              >
                <MaterialIcons name="share" size={20} color="#fff" />
              </Pressable>
            </View>
          </SafeAreaView>

          {/* Hero title overlay at bottom of gallery */}
          <View style={styles.heroOverlay}>
            {/* Featured badge */}
            {event.featured && (
              <View style={styles.featuredBadge}>
                <MaterialIcons name="star" size={11} color={Colors.textOnGold} />
                <Text style={styles.featuredBadgeText}>Featured</Text>
              </View>
            )}
            {/* Type badge */}
            <View style={[styles.typeBadge, { backgroundColor: `${typeColor}EE` }]}>
              <MaterialIcons
                name={(EVENT_TYPES.find((t) => t.id === event.type)?.icon ?? 'event') as any}
                size={11}
                color="#fff"
              />
              <Text style={styles.typeBadgeText}>{event.typeLabel}</Text>
            </View>
            <Text style={styles.heroTitle} numberOfLines={3}>{event.title}</Text>
            {/* Boost badge — displayed below title when event has an active boost */}
            {isBoostActive(event) && (
              <View style={styles.boostBadge}>
                <MaterialIcons name="rocket-launch" size={13} color={Colors.gold} />
                <Text style={styles.boostBadgeText}>⭐ Boosted Event</Text>
              </View>
            )}
            <View style={styles.heroMeta}>
              <MaterialIcons name="place" size={13} color={Colors.gold} />
              <Text style={styles.heroMetaText}>{event.parish}, Jamaica</Text>
              {event.recurring && (
                <>
                  <View style={styles.heroDot} />
                  <MaterialIcons name="repeat" size={13} color={Colors.gold} />
                  <Text style={styles.heroMetaText}>{event.recurringFrequency}</Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* ── Body ── */}
        <View style={styles.body}>

          {/* ── Attendee count strip ── */}
          <View style={styles.attendeeStrip}>
            <View style={styles.attendeeStat}>
              <View style={[styles.attendeeStatIcon, { backgroundColor: `${Colors.greenLight}18` }]}>
                <MaterialIcons name="check-circle" size={15} color={Colors.greenLight} />
              </View>
              <Text style={styles.attendeeStatNum}>{formatCount(event.goingCount)}</Text>
              <Text style={styles.attendeeStatLabel}>Going</Text>
            </View>
            <View style={styles.attendeeStatDivider} />
            <View style={styles.attendeeStat}>
              <View style={[styles.attendeeStatIcon, { backgroundColor: `${Colors.gold}18` }]}>
                <MaterialIcons name="star" size={15} color={Colors.gold} />
              </View>
              <Text style={styles.attendeeStatNum}>{formatCount(event.interestedCount)}</Text>
              <Text style={styles.attendeeStatLabel}>Interested</Text>
            </View>
            <View style={styles.attendeeStatDivider} />
            <View style={styles.attendeeStat}>
              <View style={[styles.attendeeStatIcon, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
                <MaterialIcons name="visibility" size={15} color={Colors.textMuted} />
              </View>
              <Text style={styles.attendeeStatNum}>{formatCount(event.viewCount ?? 0)}</Text>
              <Text style={styles.attendeeStatLabel}>Views</Text>
            </View>
          </View>

          {/* ── RSVP Buttons ── */}
          <View style={styles.rsvpRow}>
            <Pressable
              onPress={() => {
                const ok = toggleGoing(event.id);
                if (!ok) { setShowAuthPrompt(true); return; }
                if (!isGoing) {
                  scheduleEventReminder(event.id, event.title, event.date, event.startTime);
                } else {
                  cancelEventReminder(event.id);
                }
              }}
              style={({ pressed }) => [
                styles.rsvpBtn,
                isGoing && styles.rsvpBtnGoing,
                pressed && { opacity: 0.85 },
              ]}
            >
              {isGoing ? (
                <LinearGradient
                  colors={[Colors.greenLight, Colors.green]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFillObject}
                />
              ) : null}
              <MaterialIcons
                name={isGoing ? 'check-circle' : 'check-circle-outline'}
                size={20}
                color={isGoing ? '#fff' : Colors.greenLight}
              />
              <View>
                <Text style={[styles.rsvpBtnLabel, isGoing && { color: '#fff' }]}>
                  {isGoing ? t.imGoingExclaim : t.imGoing}
                </Text>
                <Text style={[styles.rsvpBtnCount, isGoing && { color: 'rgba(255,255,255,0.8)' }]}>
                  {formatCount(event.goingCount)} {t.going}
                </Text>
              </View>
            </Pressable>

            <Pressable
              onPress={() => { const ok = toggleInterested(event.id); if (!ok) setShowAuthPrompt(true); }}
              style={({ pressed }) => [
                styles.rsvpBtn,
                isInterested && styles.rsvpBtnInterested,
                pressed && { opacity: 0.85 },
              ]}
            >
              {isInterested ? (
                <LinearGradient
                  colors={[Colors.gold, Colors.goldDim]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFillObject}
                />
              ) : null}
              <MaterialIcons
                name={isInterested ? 'star' : 'star-border'}
                size={20}
                color={isInterested ? Colors.textOnGold : Colors.gold}
              />
              <View>
                <Text style={[styles.rsvpBtnLabel, isInterested && { color: Colors.textOnGold }]}>
                  {isInterested ? t.interestedExclaim : t.imInterested}
                </Text>
                <Text style={[styles.rsvpBtnCount, isInterested && { color: `${Colors.textOnGold}CC` }]}>
                  {formatCount(event.interestedCount)} {t.interested}
                </Text>
              </View>
            </Pressable>
          </View>

          {/* ── My Ticket + Squad Up + Calendar row ── */}
          <View style={styles.actionRow}>
            {isGoing && !isFree && (
              <Pressable
                onPress={() => setShowQRTicket(true)}
                style={({ pressed }) => [styles.actionBtn, styles.actionBtnTicket, pressed && { opacity: 0.85 }]}
              >
                <LinearGradient
                  colors={[Colors.goldSurface, Colors.surface]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <MaterialIcons name="qr-code" size={18} color={Colors.gold} />
                <Text style={styles.actionBtnLabel}>{t.myTicket}</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => router.push(`/squad/${event.id}` as any)}
              style={({ pressed }) => [styles.actionBtn, styles.actionBtnSquad, { flex: isGoing && !isFree ? 1 : 2 }, pressed && { opacity: 0.85 }]}
            >
              <MaterialIcons name="groups" size={18} color="#9C27B0" />
              <Text style={[styles.actionBtnLabel, { color: '#CE93D8' }]}>{t.squadUp}</Text>
            </Pressable>
            {/* Add to Calendar */}
            <Pressable
              onPress={handleAddToCalendar}
              style={({ pressed }) => [styles.actionBtn, styles.actionBtnCalendar, pressed && { opacity: 0.85 }]}
            >
              <MaterialIcons name="event-available" size={18} color="#42A5F5" />
              <Text style={[styles.actionBtnLabel, { color: '#90CAF9' }]}>Calendar</Text>
            </Pressable>
          </View>

          {/* ── Details Card ── */}
          <View style={styles.detailsCard}>
            {/* Date & Time */}
            <View style={styles.detailRow}>
              <View style={[styles.detailIcon, { backgroundColor: `${Colors.gold}22` }]}>
                <MaterialIcons name="event" size={18} color={Colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>Date & Time</Text>
                <Text style={styles.detailValue}>{formatDate(event.date)}</Text>
                {event.startTime ? (
                  <Text style={styles.detailSub}>
                    {event.startTime}
                    {event.endTime ? ` → ${event.endTime}` : ''}
                  </Text>
                ) : null}
                {event.recurring ? (
                  <View style={styles.recurringPill}>
                    <MaterialIcons name="repeat" size={11} color={Colors.gold} />
                    <Text style={styles.recurringPillText}>
                      Repeats {event.recurringFrequency ?? 'Regularly'}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.detailDivider} />

            {/* Venue */}
            <View style={styles.detailRow}>
              <View style={[styles.detailIcon, { backgroundColor: `${Colors.gold}22` }]}>
                <MaterialIcons name="location-on" size={18} color={Colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>Venue</Text>
                <Text style={styles.detailValue}>{event.venue}</Text>
                {event.address ? (
                  <Text style={styles.detailSub}>{event.address}</Text>
                ) : null}
                <Text style={styles.detailSub}>{event.parish}, Jamaica</Text>
              </View>
            </View>

            <View style={styles.detailDivider} />

            {/* Ticket Price */}
            <View style={styles.detailRow}>
              <View style={[styles.detailIcon, { backgroundColor: `${Colors.gold}22` }]}>
                <MaterialIcons name="local-activity" size={18} color={Colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>Tickets</Text>
                <Text style={[styles.detailValue, { color: isFree ? Colors.greenLight : Colors.gold }]}>
                  {isFree ? 'Free Entry' : event.ticketPrice}
                </Text>
                {event.ticketLink ? (
                  <Pressable
                    onPress={handleTicketLink}
                    style={({ pressed }) => [styles.ticketLinkBtn, pressed && { opacity: 0.8 }]}
                  >
                    <MaterialIcons name="open-in-browser" size={13} color={Colors.gold} />
                    <Text style={styles.ticketLinkText}>Get Tickets</Text>
                    <MaterialIcons name="arrow-forward" size={12} color={Colors.gold} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* Age Restriction */}
            {event.ageLimit && event.ageLimit !== 'All Ages' ? (
              <>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <View style={[styles.detailIcon, { backgroundColor: '#FF444422' }]}>
                    <MaterialIcons name="verified-user" size={18} color="#FF6B6B" />
                  </View>
                  <View>
                    <Text style={styles.detailLabel}>Age Restriction</Text>
                    <Text style={[styles.detailValue, { color: '#FF6B6B' }]}>
                      {event.ageLimit} Only
                    </Text>
                  </View>
                </View>
              </>
            ) : null}

            {/* Dress Code */}
            {event.dressCode ? (
              <>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <View style={[styles.detailIcon, { backgroundColor: `${Colors.gold}22` }]}>
                    <MaterialIcons name="checkroom" size={18} color={Colors.gold} />
                  </View>
                  <View>
                    <Text style={styles.detailLabel}>Dress Code</Text>
                    <Text style={styles.detailValue}>{event.dressCode}</Text>
                  </View>
                </View>
              </>
            ) : null}
          </View>

          {/* ── Weather Widget ── */}
          <WeatherWidget parish={event.parish} date={event.date} eventType={event.type} />

          {/* ── Map ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionBar} />
              <Text style={styles.sectionTitle}>Location</Text>
            </View>
            <MapSection
              venue={event.venue}
              address={event.address}
              parish={event.parish}
            />
          </View>

          {/* ── Event Types ── */}
          {event.eventTypes?.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionBar} />
                <Text style={styles.sectionTitle}>
                  Category{event.eventTypes.length > 1 ? ' & Tags' : ''}
                </Text>
              </View>
              <View style={styles.chipsWrap}>
                {event.eventTypes.map((typeId, idx) => {
                  const typeInfo = EVENT_TYPES.find((t) => t.id === typeId);
                  if (!typeInfo) return null;
                  return (
                    <View
                      key={typeId}
                      style={[
                        styles.typeChip,
                        { borderColor: `${typeInfo.color}55`, backgroundColor: `${typeInfo.color}15` },
                      ]}
                    >
                      <MaterialIcons name={typeInfo.icon as any} size={13} color={typeInfo.color} />
                      <Text style={[styles.typeChipText, { color: typeInfo.color }]}>
                        {typeInfo.label}
                        {idx === 0 ? ' ★' : ''}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── About ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionBar} />
              <Text style={styles.sectionTitle}>About This Event</Text>
            </View>
            <Text style={styles.description}>{event.description}</Text>
          </View>

          {/* ── Event Details Ad ── */}
          <PlacementAd placementName="Event Details" />

          {/* ── Lineup ── */}
          {event.lineup?.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionBar} />
                <Text style={styles.sectionTitle}>Lineup</Text>
              </View>
              {/* Group by role */}
              {(() => {
                // Normalize legacy role labels (e.g. 'Speaker' → 'Sound System')
                const ROLE_DISPLAY: Record<string, string> = { 'Speaker': 'Sound System' };
                // Parse entries — support "Role: Name" format or plain strings
                const rawEntries: { name: string; role: string }[] = (event as any).lineupEntries?.length
                  ? (event as any).lineupEntries
                  : event.lineup.map((s) => {
                      const m = s.match(/^([^:]+):\s*(.+)$/);
                      return m ? { role: m[1].trim(), name: m[2].trim() } : { role: 'Artist', name: s };
                    });
                // Apply display normalization
                const entries = rawEntries.map((e) => ({ ...e, role: ROLE_DISPLAY[e.role] ?? e.role }));
                const groups: Record<string, string[]> = {};
                entries.forEach(({ role, name }) => {
                  if (!groups[role]) groups[role] = [];
                  groups[role].push(name);
                });
                return Object.entries(groups).map(([role, names]) => (
                  <View key={role} style={styles.lineupRoleGroup}>
                    <View style={styles.lineupRoleHeader}>
                      <MaterialIcons
                        name={role === 'DJ' ? 'queue-music' : role === 'MC' ? 'record-voice-over' : role === 'Host' ? 'mic-external-on' : role === 'Band' ? 'groups' : role === 'Sound System' ? 'speaker' : 'mic'}
                        size={13}
                        color={typeColor}
                      />
                      <Text style={[styles.lineupRoleLabel, { color: typeColor }]}>{role}</Text>
                    </View>
                    <View style={styles.lineupGrid}>
                      {names.map((name, i) => (
                        <View key={`${name}-${i}`} style={[styles.artistChip, { borderColor: `${typeColor}55` }]}>
                          <View style={[styles.artistIconBg, { backgroundColor: `${typeColor}22` }]}>
                            <MaterialIcons name="mic" size={14} color={typeColor} />
                          </View>
                          <Text style={[styles.artistName, { color: Colors.textPrimary }]}>{name}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ));
              })()}
            </View>
          )}

          {/* ── Tags ── */}
          {event.tags?.length > 0 && (
            <View style={styles.tagsWrap}>
              {event.tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>#{tag}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── Event Photos Link ── */}
          {event.eventPhotosLink ? (
            <Pressable
              onPress={() => Linking.openURL(event.eventPhotosLink!).catch(() => {})}
              style={({ pressed }) => [styles.photosCard, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient
                colors={[`${Colors.gold}15`, Colors.surface]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={[styles.detailIcon, { backgroundColor: `${Colors.gold}22` }]}>
                <MaterialIcons name="photo-library" size={20} color={Colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.photosCardTitle}>Event Photos</Text>
                <Text style={styles.photosCardSub}>View photos taken at this event</Text>
              </View>
              <View style={styles.photosOpenBtn}>
                <MaterialIcons name="open-in-new" size={14} color={Colors.gold} />
                <Text style={styles.photosOpenBtnText}>View</Text>
              </View>
            </Pressable>
          ) : null}

          {/* ── Promoter Card ── */}
          <Pressable
            onPress={() => router.push(`/promoter/${event.promoterId}` as any)}
            style={({ pressed }) => [styles.promoterCard, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient
              colors={[Colors.goldSurface, Colors.surface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.promoterAvatar}>
              <Text style={styles.promoterAvatarLetter}>
                {(event.promoterName?.[0] ?? 'P').toUpperCase()}
              </Text>
            </View>
            <View style={styles.promoterInfo}>
              <Text style={styles.promoterRole}>Organized by</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={styles.promoterName}>{event.promoterName}</Text>
                {isPromoterVerified && (
                  <MaterialIcons name="verified" size={15} color={Colors.gold} />
                )}
              </View>
            </View>
            {isPromoterVerified ? (
              <View style={styles.promoterBadge}>
                <MaterialIcons name="verified" size={13} color={Colors.gold} />
                <Text style={styles.promoterBadgeText}>Verified</Text>
              </View>
            ) : (
              <View style={[styles.promoterBadge, { borderColor: Colors.surfaceBorder, backgroundColor: Colors.surfaceElevated }]}>
                <MaterialIcons name="campaign" size={13} color={Colors.textMuted} />
                <Text style={[styles.promoterBadgeText, { color: Colors.textMuted }]}>Promoter</Text>
              </View>
            )}
          </Pressable>
          <View style={styles.shareRow}>
            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.8 }]}
            >
              <MaterialIcons name="share" size={16} color={Colors.textSecondary} />
              <Text style={styles.shareBtnText}>Share Event</Text>
            </Pressable>
            {event.ticketLink ? (
              <Pressable
                onPress={handleTicketLink}
                style={({ pressed }) => [styles.getTicketsBtn, pressed && { opacity: 0.85 }]}
              >
                <LinearGradient
                  colors={[Colors.gold, Colors.goldDim]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.getTicketsBtnInner}
                >
                  <MaterialIcons name="local-activity" size={16} color={Colors.textOnGold} />
                  <Text style={styles.getTicketsBtnText}>
                    {isFree ? 'Register Free' : 'Get Tickets'}
                  </Text>
                </LinearGradient>
              </Pressable>
            ) : null}
          </View>

          {/* ── Related Events ── */}
          {relatedEvents.length > 0 && (
            <View style={styles.section}>
              <View style={[styles.sectionHeader, { marginBottom: Spacing.sm }]}>
                <View style={styles.sectionBar} />
                <Text style={styles.sectionTitle}>You Might Also Like</Text>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/browse',
                      params: { parish: event.parish },
                    } as any)
                  }
                  style={styles.seeAllBtn}
                >
                  <Text style={styles.seeAllText}>See All</Text>
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.relatedList}
                style={styles.relatedScroll}
              >
                {relatedEvents.map((rel) => (
                  <RelatedCard
                    key={rel.id}
                    event={rel}
                    onPress={() => router.push(`/event/${rel.id}` as any)}
                  />
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        <View style={{ height: insets.bottom + Spacing.xxl * 2 }} />
      </ScrollView>

      {/* Share Modal */}
      {event && (
        <ShareModal
          visible={showShareModal}
          onClose={() => setShowShareModal(false)}
          event={event}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Not found
  notFound: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  notFoundIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  notFoundTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  notFoundSub: { fontSize: Typography.base, color: Colors.textMuted, textAlign: 'center' },
  notFoundBtn: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginTop: Spacing.sm,
  },
  notFoundBtnText: { fontSize: Typography.base, color: Colors.gold, fontWeight: Typography.semibold },

  // Gallery
  galleryWrap: { position: 'relative' },
  galleryGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 160,
  },

  // HUD
  hud: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.xs,
    zIndex: 10,
  },
  hudRight: { flexDirection: 'row', gap: Spacing.sm },
  hudBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  hudBtnEdit: {
    backgroundColor: 'rgba(255,215,0,0.15)',
    borderColor: `${Colors.gold}55`,
  },

  // Hero overlay
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.base,
    gap: Spacing.xs,
  },
  featuredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.gold,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
    marginBottom: 2,
  },
  featuredBadgeText: { fontSize: 10, fontWeight: Typography.bold, color: Colors.textOnGold },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  typeBadgeText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: '#fff' },
  heroTitle: {
    fontSize: 26,
    fontWeight: Typography.black,
    color: '#fff',
    lineHeight: 32,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroMetaText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
  heroDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.gold,
  },

  // Body
  body: { padding: Spacing.base, gap: Spacing.lg },

  // Attendee strip
  attendeeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
    marginBottom: -Spacing.sm,
  },
  attendeeStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  attendeeStatIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendeeStatNum: {
    fontSize: Typography.base,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
  },
  attendeeStatLabel: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
  },
  attendeeStatDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.surfaceBorder,
  },

  // RSVP
  rsvpRow: { flexDirection: 'row', gap: Spacing.sm },
  rsvpBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
    position: 'relative',
  },
  rsvpBtnGoing: { borderColor: Colors.green },
  rsvpBtnInterested: { borderColor: Colors.gold },
  rsvpBtnLabel: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  rsvpBtnCount: {
    fontSize: 10,
    color: Colors.textMuted,
    lineHeight: 14,
  },

  // Details card
  detailsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.base,
    alignItems: 'flex-start',
  },
  detailDivider: { height: 1, backgroundColor: Colors.surfaceBorder },
  detailIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  detailLabel: { fontSize: Typography.xs, color: Colors.textMuted, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  detailSub: { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 2 },
  ticketLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.goldSurface,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: `${Colors.gold}44`,
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
  },
  ticketLinkText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
  recurringPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.goldSurface,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
    borderWidth: 1,
    borderColor: `${Colors.gold}33`,
  },
  recurringPillText: { fontSize: 10, color: Colors.gold, fontWeight: Typography.semibold },

  // Section
  section: { gap: Spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: Colors.gold },
  sectionTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary, flex: 1 },
  seeAllBtn: { paddingVertical: 2 },
  seeAllText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.medium },

  description: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    lineHeight: 26,
  },

  // Category chips
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  typeChipText: { fontSize: Typography.sm, fontWeight: Typography.semibold },

  // Lineup
  lineupGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  lineupRoleGroup: { gap: Spacing.sm, marginBottom: Spacing.md },
  lineupRoleHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  lineupRoleLabel: {
    fontSize: Typography.xs, fontWeight: Typography.bold,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  artistChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    paddingRight: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  artistIconBg: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artistName: { fontSize: Typography.sm, fontWeight: Typography.semibold },

  // Tags
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  tag: {
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  tagText: { fontSize: Typography.xs, color: Colors.textMuted },

  // Promoter
  promoterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: `${Colors.gold}33`,
    overflow: 'hidden',
    position: 'relative',
  },
  promoterAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.goldSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: `${Colors.gold}55`,
    flexShrink: 0,
  },
  promoterAvatarLetter: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.gold },
  promoterInfo: { flex: 1 },
  promoterRole: { fontSize: Typography.xs, color: Colors.textMuted, marginBottom: 2 },
  promoterName: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  promoterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.goldSurface,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: `${Colors.gold}33`,
    flexShrink: 0,
  },
  promoterBadgeText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold },

  // Event Photos card
  photosCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.xl,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: `${Colors.gold}33`,
    overflow: 'hidden',
    position: 'relative',
  },
  photosCardTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  photosCardSub: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },
  photosOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.goldSurface,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: `${Colors.gold}44`,
    flexShrink: 0,
  },
  photosOpenBtnText: {
    fontSize: Typography.xs,
    color: Colors.gold,
    fontWeight: Typography.semibold,
  },

  // Share + Get Tickets row
  actionRow: {
    flexDirection: 'row', gap: Spacing.sm, marginTop: -Spacing.sm,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.md,
    borderRadius: Radius.lg, borderWidth: 1.5, overflow: 'hidden', position: 'relative',
  },
  actionBtnTicket: { borderColor: `${Colors.gold}55` },
  actionBtnSquad: { borderColor: '#7B1FA244', backgroundColor: '#1A0A2E' },
  actionBtnCalendar: { borderColor: '#1565C044', backgroundColor: '#0A1929' },
  actionBtnLabel: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },

  shareRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: -Spacing.sm,
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
  },
  shareBtnText: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.semibold },
  getTicketsBtn: {
    flex: 2,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  getTicketsBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  getTicketsBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold },

  // Related
  relatedScroll: { marginHorizontal: -Spacing.base },
  relatedList: {
    paddingHorizontal: Spacing.base,
    gap: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  boostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,215,0,0.15)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: `${Colors.gold}55`,
  },
  boostBadgeText: {
    fontSize: 11,
    color: Colors.gold,
    fontWeight: Typography.semibold,
  },
});
