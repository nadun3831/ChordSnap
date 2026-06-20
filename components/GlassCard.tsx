import React from 'react';
import { View, ViewStyle, StyleSheet, StyleProp } from 'react-native';
import Colors from '../constants/Colors';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  glowColor?: string;
  glow?: boolean;
}

export default function GlassCard({ children, style, glowColor, glow }: GlassCardProps) {
  return (
    <View
      style={[
        styles.card,
        glow && {
          shadowColor: glowColor || Colors.secondaryBright,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.2,
          shadowRadius: 20,
          elevation: 8,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 16,
    overflow: 'hidden',
  },
});
