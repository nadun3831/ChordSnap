import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '../../constants/Colors';
import GlassCard from '../../components/GlassCard';
import { listSongs, Song } from '../../lib/api';

const { width } = Dimensions.get('window');
const CARD_WIDTH = 240;

export default function HomeScreen() {
  const router = useRouter();
  const [songs, setSongs] = useState<Song[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSongs = async () => {
    try {
      const data = await listSongs();
      setSongs(data);
    } catch (err) {
      // Offline or server not running — use empty list
      console.log('Could not fetch songs:', err);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchSongs();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSongs();
    setRefreshing(false);
  };

  const completedSongs = songs.filter(s => s.status === 'done');
  const greeting = getGreeting();

  return (
    <View style={styles.container}>
      {/* Ambient background blurs */}
      <View style={styles.ambientContainer}>
        <View style={[styles.ambientBlob, styles.ambientPrimary]} />
        <View style={[styles.ambientBlob, styles.ambientSecondary]} />
      </View>

      {/* Top App Bar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialIcons name="graphic-eq" size={24} color={Colors.primary} />
          <Text style={styles.logoText}>ChordSnap</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.searchBtn}>
            <MaterialIcons name="search" size={22} color={Colors.onSurfaceVariant} />
          </TouchableOpacity>
          <View style={styles.avatar}>
            <MaterialIcons name="person" size={20} color={Colors.primary} />
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Welcome Header */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>{greeting}, Musician</Text>
          <Text style={styles.welcomeSubtitle}>
            Ready to capture some new chord progressions today?
          </Text>
        </View>

        {/* New Song CTA */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.push('/new-song')}
        >
          <GlassCard
            style={styles.ctaCard}
            glow
            glowColor={Colors.secondaryBright}
          >
            <LinearGradient
              colors={[
                'rgba(0, 209, 255, 0.15)',
                'rgba(96, 43, 157, 0.08)',
                'transparent',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.ctaContent}>
              <View style={styles.ctaTextArea}>
                <View style={styles.aiBadge}>
                  <MaterialIcons name="auto-awesome" size={14} color={Colors.primary} />
                  <Text style={styles.aiBadgeText}>AI POWERED</Text>
                </View>
                <Text style={styles.ctaTitle}>Start New Capture</Text>
                <Text style={styles.ctaDescription}>
                  Tap to listen and identify chords in real-time with technical precision.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.listenButton}
                onPress={() => router.push('/new-song')}
              >
                <MaterialIcons name="mic" size={22} color={Colors.onPrimaryContainer} />
                <Text style={styles.listenButtonText}>LISTEN NOW</Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        </TouchableOpacity>

        {/* Recent Songs */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Songs</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/library')}>
            <Text style={styles.viewAll}>View All</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.songsScroll}
          snapToInterval={CARD_WIDTH + 16}
          decelerationRate="fast"
        >
          {completedSongs.length > 0 ? (
            completedSongs.slice(0, 10).map(song => (
              <TouchableOpacity
                key={song.id}
                activeOpacity={0.85}
                onPress={() => router.push({ pathname: '/player', params: { songId: song.id } })}
              >
                <GlassCard style={styles.songCard}>
                  <View style={styles.songImageContainer}>
                    <View style={styles.songImagePlaceholder}>
                      <MaterialIcons name="equalizer" size={36} color={Colors.primary} />
                    </View>
                  </View>
                  <View style={styles.songInfo}>
                    <Text style={styles.songGenre}>{song.genre || 'UNKNOWN GENRE'}</Text>
                    <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
                    <View style={styles.songMeta}>
                      <View style={styles.songDuration}>
                        <MaterialIcons name="schedule" size={14} color={Colors.onSurfaceVariant} />
                        <Text style={styles.songDurationText}>
                          {formatDuration(song.duration)}
                        </Text>
                      </View>
                      <MaterialIcons name="play-circle-filled" size={20} color={Colors.primary} />
                    </View>
                  </View>
                </GlassCard>
              </TouchableOpacity>
            ))
          ) : (
            <GlassCard style={[styles.songCard, styles.emptyCard]}>
              <MaterialIcons name="music-note" size={40} color={Colors.outlineVariant} />
              <Text style={styles.emptyText}>No songs yet</Text>
              <Text style={styles.emptySubtext}>Tap "Start New Capture" above</Text>
            </GlassCard>
          )}
        </ScrollView>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {[
            { value: completedSongs.length.toString().padStart(2, '0'), label: 'Captured' },
            { value: '00', label: 'Favorites' },
            { value: '00', label: 'Playlists' },
            { value: '98%', label: 'Accuracy' },
          ].map((stat, i) => (
            <GlassCard key={i} style={styles.statCard}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </GlassCard>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  ambientContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: -1,
  },
  ambientBlob: {
    position: 'absolute',
    width: '50%',
    aspectRatio: 1,
    borderRadius: 9999,
  },
  ambientPrimary: {
    top: '-10%',
    right: '-10%',
    backgroundColor: `${Colors.primary}0D`,
  },
  ambientSecondary: {
    bottom: '-10%',
    left: '-10%',
    backgroundColor: `${Colors.secondary}0D`,
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceContainerHigh,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 24,
    paddingBottom: 120,
    paddingHorizontal: 24,
    gap: 32,
  },
  welcomeSection: {
    gap: 8,
  },
  welcomeTitle: {
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 32,
    lineHeight: 40,
    color: Colors.onBackground,
    letterSpacing: -0.5,
  },
  welcomeSubtitle: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 24,
    color: Colors.onSurfaceVariant,
    maxWidth: 320,
  },
  ctaCard: {
    padding: 24,
    borderRadius: 16,
  },
  ctaContent: {
    gap: 20,
  },
  ctaTextArea: {
    gap: 8,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: `${Colors.primaryContainer}33`,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  aiBadgeText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    letterSpacing: 0.6,
    color: Colors.primary,
  },
  ctaTitle: {
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 24,
    lineHeight: 32,
    color: Colors.onBackground,
  },
  ctaDescription: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 24,
    color: Colors.onSurfaceVariant,
  },
  listenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primaryContainer,
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 9999,
    alignSelf: 'flex-start',
    shadowColor: Colors.primaryContainer,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  listenButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    letterSpacing: 0.6,
    color: Colors.onPrimaryContainer,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 24,
    lineHeight: 32,
    color: Colors.onBackground,
  },
  viewAll: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    letterSpacing: 0.6,
    color: Colors.primary,
  },
  songsScroll: {
    gap: 16,
    paddingRight: 24,
  },
  songCard: {
    width: CARD_WIDTH,
    padding: 16,
    gap: 16,
  },
  songImageContainer: {
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceContainer,
  },
  songImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.3,
  },
  songInfo: {
    gap: 4,
  },
  songGenre: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
    letterSpacing: 1.2,
    color: Colors.onSurfaceVariant,
    textTransform: 'uppercase',
  },
  songTitle: {
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 18,
    color: Colors.onBackground,
  },
  songMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  songDuration: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  songDurationText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: Colors.onSurfaceVariant,
  },
  emptyCard: {
    width: CARD_WIDTH,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 16,
    color: Colors.onSurfaceVariant,
  },
  emptySubtext: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: Colors.outline,
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  statCard: {
    flex: 1,
    minWidth: (width - 64) / 2 - 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  statValue: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 32,
    color: Colors.primary,
  },
  statLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    letterSpacing: 0.6,
    color: Colors.onSurfaceVariant,
  },
});
