import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Colors from '../constants/Colors';

interface ProgressRingProps {
  progress: number; // 0-100
  size?: number;
}

/**
 * Simplified ProgressRing without SVG dependency.
 * Uses border + rotation trick for the progress indicator.
 */
export default function ProgressRing({
  progress,
  size = 256,
}: ProgressRingProps) {
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 10000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Background ring */}
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 8,
            borderColor: 'rgba(255, 255, 255, 0.05)',
          },
        ]}
      />

      {/* Active progress arc (using overlay trick) */}
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 8,
            borderColor: Colors.secondary,
            borderRightColor: 'transparent',
            borderBottomColor: progress > 50 ? Colors.secondary : 'transparent',
            borderLeftColor: progress > 75 ? Colors.secondary : 'transparent',
            transform: [{ rotate: `${-90 + (progress / 100) * 360}deg` }],
            shadowColor: Colors.secondaryBright,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.5,
            shadowRadius: 12,
          },
        ]}
      />

      {/* Rotating particles */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ rotate: rotation }] },
        ]}
      >
        <View style={[styles.particle, { top: -4, left: size / 2 - 4 }]} />
        <View style={[styles.particle, { bottom: -4, left: size / 2 - 4 }]} />
      </Animated.View>

      {/* Center content */}
      <View style={styles.centerContent}>
        <Text style={styles.percentText}>{Math.floor(progress)}%</Text>
        <Text style={styles.label}>ANALYZING AUDIO</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
  },
  centerContent: {
    alignItems: 'center',
  },
  percentText: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 64,
    lineHeight: 72,
    color: Colors.primary,
    letterSpacing: -1.28,
  },
  label: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    color: Colors.onSurfaceVariant,
    marginTop: 4,
  },
  particle: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primaryContainer,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
});
