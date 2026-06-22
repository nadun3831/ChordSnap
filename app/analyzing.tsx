import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Colors from '../constants/Colors';
import GlassCard from '../components/GlassCard';
import WaveformVisualizer from '../components/WaveformVisualizer';
import { pollSongStatus } from '../lib/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const STATUS_MESSAGES = [
  'Extracting Harmonics...',
  'Syncing Beats...',
  'Mapping Voicings...',
  'Isolating Basslines...',
  'Generating Lead Sheets...',
  'Finalizing Transcription...',
];

export default function AnalyzingScreen() {
  const router = useRouter();
  const { songId, songTitle } = useLocalSearchParams<{ songId: string; songTitle: string }>();
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState(STATUS_MESSAGES[0]);
  const [isComplete, setIsComplete] = useState(false);

  // Animations
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim1 = useRef(new Animated.Value(0.95)).current;
  const pulseAnim2 = useRef(new Animated.Value(0.95)).current;
  const pulseAnim3 = useRef(new Animated.Value(0.95)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Rotating particles
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 10000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Pulse rings
    const createPulse = (anim: Animated.Value, duration: number, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1.05, duration: duration / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.95, duration: duration / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );

    createPulse(pulseAnim1, 4000, 0).start();
    createPulse(pulseAnim2, 6000, 1000).start();
    createPulse(pulseAnim3, 3000, 500).start();

    // Glow
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.6, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Simulate progress while polling
  useEffect(() => {
    let progressInterval: ReturnType<typeof setInterval>;
    let statusInterval: ReturnType<typeof setInterval>;

    // Animate progress
    progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 95) return prev; // Hold at 95 until actually done
        return prev + Math.random() * 2;
      });
    }, 200);

    // Cycle status messages
    statusInterval = setInterval(() => {
      setStatusText(STATUS_MESSAGES[Math.floor(Math.random() * STATUS_MESSAGES.length)]);
    }, 3000);

    // Actually poll the backend
    if (songId) {
      pollSongStatus(songId, (status) => {
        if (status === 'done') {
          setProgress(100);
          setIsComplete(true);
          setStatusText('Processing Complete!');
          clearInterval(progressInterval);
          clearInterval(statusInterval);

          // Navigate to player after a brief delay
          setTimeout(() => {
            router.replace({
              pathname: '/player',
              params: { songId },
            });
          }, 1500);
        } else if (status === 'failed') {
          clearInterval(progressInterval);
          clearInterval(statusInterval);
          setStatusText('Processing Failed');
          setTimeout(() => router.back(), 2000);
        }
      }).catch(() => {
        // If polling fails, simulate completion after a delay
        setTimeout(() => {
          setProgress(100);
          setIsComplete(true);
          setStatusText('Processing Complete!');
          clearInterval(progressInterval);
          clearInterval(statusInterval);
        }, 4000);
      });
    } else {
      // Demo mode — no songId, auto-complete after animation
      setTimeout(() => {
        setProgress(100);
        setIsComplete(true);
        setStatusText('Processing Complete!');
        clearInterval(progressInterval);
        clearInterval(statusInterval);
      }, 5000);
    }

    return () => {
      clearInterval(progressInterval);
      clearInterval(statusInterval);
    };
  }, [songId]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const ringSize = Math.min(SCREEN_WIDTH * 0.7, 280);

  return (
    <View style={styles.container}>
      {/* Background gradient */}
      <View style={styles.bgGradient} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialIcons name="graphic-eq" size={22} color={Colors.primary} />
          <Text style={styles.logoText}>ChordSnap</Text>
        </View>
        <View style={styles.avatar}>
          <MaterialIcons name="person" size={16} color={Colors.primary} />
        </View>
      </View>

      {/* Main Processing Canvas */}
      <View style={styles.mainCanvas}>
        {/* Animated Pulse Rings */}
        <View style={styles.ringsContainer}>
          <Animated.View style={[styles.ring, styles.ring1, { transform: [{ scale: pulseAnim1 }] }]} />
          <Animated.View style={[styles.ring, styles.ring2, { transform: [{ scale: pulseAnim2 }] }]} />
          <Animated.View style={[styles.ring, styles.ring3, { transform: [{ scale: pulseAnim3 }], opacity: glowAnim }]} />
        </View>

        {/* Progress Ring */}
        <View style={[styles.progressContainer, { width: ringSize, height: ringSize }]}>
          {/* Background circle */}
          <View style={[styles.progressBg, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }]} />

          {/* Rotating particles */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { transform: [{ rotate: rotation }] },
            ]}
          >
            <View style={[styles.particle, { top: -4, left: ringSize / 2 - 4 }]} />
            <View style={[styles.particle, { bottom: -4, left: ringSize / 2 - 4 }]} />
          </Animated.View>

          {/* Center text */}
          <View style={styles.centerContent}>
            <Text style={styles.percentText}>{Math.floor(progress)}%</Text>
            <Text style={styles.analyzeLabel}>ANALYZING AUDIO</Text>
          </View>
        </View>

        {/* Status Card */}
        <GlassCard style={styles.statusCard}>
          <View style={styles.statusContent}>
            <MaterialIcons
              name="auto-awesome"
              size={24}
              color={isComplete ? Colors.primary : Colors.secondary}
            />
            <Text
              style={[
                styles.statusTitle,
                isComplete && styles.statusTitleComplete,
              ]}
            >
              {statusText}
            </Text>
            <Text style={styles.statusDescription}>
              Our AI engine is isolating instrument tracks and mapping harmonic structures for studio-grade accuracy.
            </Text>
          </View>

          {/* Activity Tickers */}
          <View style={styles.tickers}>
            <View style={styles.tickerItem}>
              <View style={[styles.tickerDot, { backgroundColor: Colors.secondaryContainer }]} />
              <Text style={styles.tickerText}>Harmonics: OK</Text>
            </View>
            <View style={styles.tickerItem}>
              <View style={[styles.tickerDot, { backgroundColor: Colors.primaryContainer }]} />
              <Text style={styles.tickerText}>DSP: ACTIVE</Text>
            </View>
            <View style={styles.tickerItem}>
              <View style={[styles.tickerDot, { backgroundColor: Colors.secondaryContainer }]} />
              <Text style={styles.tickerText}>BPM: LOCK</Text>
            </View>
          </View>
        </GlassCard>

        {/* Wave visualizer */}
        <WaveformVisualizer isActive={!isComplete} barCount={8} height={48} color={Colors.primary} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  bgGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background,
    // Simulating radial gradient with a positioned element
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 52,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(19, 19, 19, 0.5)',
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
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceContainerHigh,
  },
  mainCanvas: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 32,
  },
  ringsContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 1,
  },
  ring1: {
    width: 600,
    height: 600,
    borderColor: `${Colors.secondary}1A`,
  },
  ring2: {
    width: 450,
    height: 450,
    borderColor: `${Colors.secondary}0D`,
  },
  ring3: {
    width: 300,
    height: 300,
    borderColor: `${Colors.secondary}26`,
  },
  progressContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBg: {
    position: 'absolute',
    borderWidth: 8,
    borderColor: 'rgba(255, 255, 255, 0.05)',
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
    elevation: 4,
  },
  centerContent: {
    alignItems: 'center',
  },
  percentText: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 64,
    color: Colors.primary,
    letterSpacing: -1.28,
  },
  analyzeLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    letterSpacing: 0.6,
    color: Colors.onSurfaceVariant,
    marginTop: 4,
  },
  statusCard: {
    width: '100%',
    padding: 24,
    gap: 16,
  },
  statusContent: {
    alignItems: 'center',
    gap: 8,
  },
  statusTitle: {
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 24,
    color: Colors.onSurface,
    textAlign: 'center',
  },
  statusTitleComplete: {
    color: Colors.primary,
  },
  statusDescription: {
    fontFamily: 'Inter',
    fontSize: 16,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    opacity: 0.7,
    lineHeight: 24,
  },
  tickers: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  tickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tickerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tickerText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    letterSpacing: 0.6,
    color: Colors.onSurfaceVariant,
  },
});
