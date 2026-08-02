import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';

const { width: SW, height: SH } = Dimensions.get('window');

// ─── Zoomable single image ────────────────────────────────────────────────────
interface ZoomableImageProps {
  uri: string;
  onClose: () => void;
  onZoomChange: (zoomed: boolean) => void;
}

function ZoomableImage({ uri, onClose, onZoomChange }: ZoomableImageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateY = useSharedValue(0);

  const resetZoom = () => {
    'worklet';
    scale.value = withSpring(1);
    savedScale.value = 1;
    translateY.value = withSpring(0);
  };

  // Pinch to zoom
  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 6));
    })
    .onEnd(() => {
      if (scale.value < 1.15) {
        resetZoom();
        runOnJS(onZoomChange)(false);
      } else {
        savedScale.value = scale.value;
        runOnJS(onZoomChange)(true);
      }
    });

  // Double-tap to zoom / reset
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .onEnd((_e, success) => {
      if (!success) return;
      if (scale.value > 1) {
        resetZoom();
        runOnJS(onZoomChange)(false);
      } else {
        scale.value = withSpring(2.5);
        savedScale.value = 2.5;
        runOnJS(onZoomChange)(true);
      }
    });

  // Swipe down to close (only when not zoomed; fails on horizontal movement so
  // the parent FlatList can still handle left/right swiping between images)
  const swipeDown = Gesture.Pan()
    .activeOffsetY([15, 99999])
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      if (scale.value <= 1 && e.translationY > 0) {
        translateY.value = e.translationY * 0.75;
      }
    })
    .onEnd((e) => {
      if (scale.value <= 1 && e.translationY > 80) {
        runOnJS(onClose)();
      } else {
        translateY.value = withSpring(0);
      }
    });

  const composed = Gesture.Simultaneous(
    pinch,
    Gesture.Race(doubleTap, swipeDown),
  );

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.imageWrap, animStyle]}>
        <Image
          source={{ uri }}
          style={{ width: SW, height: SH }}
          contentFit="contain"
          transition={100}
        />
      </Animated.View>
    </GestureDetector>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────
export interface ImageLightboxProps {
  images: string[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
}

export function ImageLightbox({
  images,
  initialIndex = 0,
  visible,
  onClose,
}: ImageLightboxProps) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const flatRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();

  // Reset when opened
  useEffect(() => {
    if (visible) {
      setActiveIndex(initialIndex);
      setScrollEnabled(true);
      if (initialIndex > 0) {
        const t = setTimeout(() => {
          flatRef.current?.scrollToIndex({ index: initialIndex, animated: false });
        }, 60);
        return () => clearTimeout(t);
      }
    }
  }, [visible, initialIndex]);

  const handleZoomChange = useCallback((zoomed: boolean) => {
    setScrollEnabled(!zoomed);
  }, []);

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.container}>
          {/* Image list — horizontal paging */}
          <FlatList
            ref={flatRef}
            data={images}
            horizontal
            pagingEnabled
            scrollEnabled={scrollEnabled}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_, i) => i.toString()}
            initialScrollIndex={initialIndex}
            getItemLayout={(_, i) => ({ length: SW, offset: SW * i, index: i })}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / SW);
              setActiveIndex(idx);
            }}
            renderItem={({ item }) => (
              <ZoomableImage
                uri={item}
                onClose={onClose}
                onZoomChange={handleZoomChange}
              />
            )}
          />

          {/* Top bar — close + counter */}
          <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
              hitSlop={12}
            >
              <MaterialIcons name="close" size={22} color="#fff" />
            </Pressable>
            <Text style={styles.counter}>
              {images.length > 1 ? `${activeIndex + 1} of ${images.length}` : ''}
            </Text>
            <View style={{ width: 44 }} />
          </View>

          {/* Dot indicators (multi-image) */}
          {images.length > 1 && (
            <View style={[styles.dots, { bottom: insets.bottom + 24 }]}>
              {images.map((_, i) => (
                <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
              ))}
            </View>
          )}

          {/* Interaction hint */}
          <View
            pointerEvents="none"
            style={[styles.hints, { bottom: insets.bottom + (images.length > 1 ? 52 : 20) }]}
          >
            <Text style={styles.hintsText}>
              {images.length > 1
                ? 'Swipe left/right to browse · Pinch or double-tap to zoom · Swipe down to close'
                : 'Pinch or double-tap to zoom · Swipe down to close'}
            </Text>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  imageWrap: {
    width: SW,
    height: SH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    zIndex: 100,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  counter: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    zIndex: 100,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 18,
    borderRadius: 3,
  },
  hints: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
    paddingHorizontal: 24,
  },
  hintsText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.38)',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
});
