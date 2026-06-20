import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Colors from '../../constants/Colors';
import GlassCard from '../../components/GlassCard';

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialIcons name="graphic-eq" size={24} color={Colors.primary} />
          <Text style={styles.logoText}>ChordSnap</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Settings</Text>

        <GlassCard style={styles.section}>
          <SettingsRow icon="info" label="App Version" value="1.0.0" />
          <View style={styles.divider} />
          <SettingsRow icon="cloud" label="Backend" value="localhost:3001" />
          <View style={styles.divider} />
          <SettingsRow icon="memory" label="Detection Engine" value="Mock (Dev)" />
        </GlassCard>

        <Text style={styles.sectionLabel}>ABOUT</Text>
        <GlassCard style={styles.section}>
          <SettingsRow icon="code" label="Built with" value="Expo + Express" />
          <View style={styles.divider} />
          <SettingsRow icon="palette" label="Design System" value="Electric Sonic" />
          <View style={styles.divider} />
          <SettingsRow icon="auto-awesome" label="AI Engine" value="ChordSnap AI" />
        </GlassCard>

        <Text style={styles.footerText}>
          ChordSnap — AI-powered chord detection{'\n'}
          Made with ♫ for musicians
        </Text>
      </ScrollView>
    </View>
  );
}

function SettingsRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <MaterialIcons name={icon} size={20} color={Colors.onSurfaceVariant} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 52,
    paddingBottom: 12,
    backgroundColor: 'rgba(19, 19, 19, 0.5)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.15)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoText: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 24,
    color: Colors.primary,
    letterSpacing: -0.5,
  },
  content: {
    padding: 24,
    paddingBottom: 120,
    gap: 16,
  },
  title: {
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 32,
    color: Colors.onBackground,
    marginBottom: 8,
  },
  sectionLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    letterSpacing: 0.6,
    color: Colors.onSurfaceVariant,
    marginTop: 8,
  },
  section: {
    padding: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowLabel: {
    fontFamily: 'Inter',
    fontSize: 16,
    color: Colors.onSurface,
  },
  rowValue: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: Colors.onSurfaceVariant,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: 16,
  },
  footerText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: Colors.outline,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 22,
  },
});
