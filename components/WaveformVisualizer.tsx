import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import Colors from '../constants/Colors';

interface WaveformVisualizerProps {
  isActive?: boolean;
  barCount?: number;
  color?: string;
  height?: number;
}

export default function WaveformVisualizer({
  isActive = false,
  barCount = 10,
  color = Colors.primary,
  height = 64,
}: WaveformVisualizerProps) {
  const animatedValues = useRef(
    Array.from({ length: barCount }, () => new Animated.Value(8))
  ).current;

  useEffect(() => {
    if (isActive) {
      const animations = animatedValues.map((val, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(val, {
              toValue: Math.random() * height * 0.8 + height * 0.15,
              duration: 150 + Math.random() * 200,
              useNativeDriver: false,
            }),
            Animated.timing(val, {
              toValue: Math.random() * height * 0.3 + 4,
              duration: 150 + Math.random() * 200,
              useNativeDriver: false,
            }),
          ])
        )
      );
      animations.forEach(a => a.start());
      return () => animations.forEach(a => a.stop());
    } else {
      animatedValues.forEach(val => {
        Animated.timing(val, {
          toValue: 8,
          duration: 300,
          useNativeDriver: false,
        }).start();
      });
    }
  }, [isActive]);

  return (
    <View style={[styles.container, { height }]}>
      {animatedValues.map((animVal, index) => {
        const opacity = 0.2 + (index / barCount) * 0.6;
        return (
          <Animated.View
            key={index}
            style={[
              styles.bar,
              {
                height: animVal,
                backgroundColor: color,
                opacity: isActive ? 0.4 + Math.random() * 0.6 : opacity,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 16,
  },
  bar: {
    width: 3,
    borderRadius: 9999,
    minHeight: 4,
  },
});
