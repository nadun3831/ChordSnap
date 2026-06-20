import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Dimensions,
  TextInput,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Audio, AVPlaybackStatus } from 'expo-av';
import Colors from '../constants/Colors';
import GlassCard from '../components/GlassCard';
import { getSong, getSongChords, updateChord, Song, ChordEvent } from '../lib/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function PlayerScreen() {
  const router = useRouter();
  const { songId } = useLocalSearchParams<{ songId: string }>();

  const [song, setSong] = useState<Song | null>(null);
  const [chords, setChords] = useState<ChordEvent[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeChordIndex, setActiveChordIndex] = useState(0);

  // Edit modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingChord, setEditingChord] = useState<ChordEvent | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const soundRef = useRef<Audio.Sound | null>(null);

  // Fetch song data
  useEffect(() => {
    if (songId) {
      loadSongData();
    }
  }, [songId]);

  const loadSongData = async () => {
    try {
      const [songData, chordsData] = await Promise.all([
        getSong(songId!),
        getSongChords(songId!),
      ]);
      setSong(songData);
      setChords(chordsData.chords || []);
    } catch (err) {
      console.error('Failed to load song:', err);
      Alert.alert('Error', 'Could not load song data');
    }
  };

  // Load and unload audio when song changes
  useEffect(() => {
    if (song?.audio_url) {
      loadAudio();
    }
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(err => console.log('Unload sound error:', err));
      }
    };
  }, [song]);

  const loadAudio = async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }
      const audioUrl = `http://localhost:3001/uploads/${song?.audio_url}`;
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: false },
        onPlaybackStatusUpdate
      );
      soundRef.current = sound;
    } catch (err) {
      console.error('Failed to load audio:', err);
    }
  };

  const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setCurrentTime(status.positionMillis / 1000);
      setIsPlaying(status.isPlaying);
      if (status.didJustFinish) {
        setIsPlaying(false);
        setCurrentTime(0);
        soundRef.current?.setPositionAsync(0).catch(() => {});
      }
    }
  };

  // Update active chord based on playback position
  useEffect(() => {
    if (chords.length === 0) return;
    let idx = 0;
    for (let i = 0; i < chords.length; i++) {
      if (chords[i].time_seconds <= currentTime) {
        idx = i;
      } else {
        break;
      }
    }
    setActiveChordIndex(idx);
  }, [currentTime, chords]);

  const togglePlayback = async () => {
    if (!soundRef.current) return;
    try {
      if (isPlaying) {
        await soundRef.current.pauseAsync();
      } else {
        await soundRef.current.playAsync();
      }
    } catch (err) {
      console.error('Toggle playback error:', err);
    }
  };

  const skipForward = async () => {
    if (soundRef.current && activeChordIndex < chords.length - 1) {
      const nextTime = chords[activeChordIndex + 1].time_seconds;
      await soundRef.current.setPositionAsync(nextTime * 1000);
      setCurrentTime(nextTime);
    }
  };

  const skipBackward = async () => {
    if (soundRef.current && activeChordIndex > 0) {
      const prevTime = chords[activeChordIndex - 1].time_seconds;
      await soundRef.current.setPositionAsync(prevTime * 1000);
      setCurrentTime(prevTime);
    }
  };

  const openEditModal = (chord: ChordEvent) => {
    setEditingChord(chord);
    setEditLabel(chord.chord_label);
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editingChord || !editLabel.trim()) return;

    try {
      await updateChord(songId!, editingChord.id, editLabel.trim());
      setChords(prev =>
        prev.map(c =>
          c.id === editingChord.id ? { ...c, chord_label: editLabel.trim(), is_user_edited: 1 } : c
        )
      );
    } catch (err) {
      console.error('Failed to update chord:', err);
    }
    setEditModalVisible(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercent = song ? (currentTime / song.duration) * 100 : 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(tabs)');
              }
            }}
            style={styles.backBtn}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={styles.logoText}>ChordSnap</Text>
        </View>
        <View style={styles.avatar}>
          <MaterialIcons name="person" size={16} color={Colors.primary} />
        </View>
      </View>

      {/* Song Info */}
      <View style={styles.songInfoSection}>
        <View style={styles.songInfoLeft}>
          <Text style={styles.songTitle}>{song?.title || 'Loading...'}</Text>
          <Text style={styles.songArtist}>{song?.artist || 'Unknown Artist'}</Text>
        </View>
        <View style={styles.songActions}>
          <TouchableOpacity style={styles.actionBtn}>
            <MaterialIcons name="favorite-border" size={22} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <MaterialIcons name="share" size={22} color={Colors.onSurfaceVariant} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Waveform Scrubber */}
      <View style={styles.waveformSection}>
        <GlassCard style={styles.waveformCard}>
          {/* Progress overlay */}
          <View style={[styles.waveformProgress, { width: `${progressPercent}%` }]} />

          {/* Waveform bars */}
          <View style={styles.waveformBars}>
            {Array.from({ length: 20 }).map((_, i) => {
              const barHeight = 12 + Math.sin(i * 0.8) * 24 + Math.random() * 16;
              const isPast = (i / 20) * 100 < progressPercent;
              return (
                <View
                  key={i}
                  style={[
                    styles.waveformBar,
                    {
                      height: barHeight,
                      backgroundColor: isPast ? Colors.primary : Colors.onSurfaceVariant,
                      opacity: isPast ? 0.8 : 0.3,
                    },
                  ]}
                />
              );
            })}
          </View>

          {/* Time display */}
          <Text style={styles.timeDisplay}>
            {formatTime(currentTime)} / {formatTime(song?.duration || 0)}
          </Text>
        </GlassCard>
      </View>

      {/* Chord Scroll Area */}
      <View style={styles.chordScrollContainer}>
        {/* Top fade */}
        <View style={styles.fadeTop} />

        <ScrollView
          contentContainerStyle={styles.chordScroll}
          showsVerticalScrollIndicator={false}
        >
          {chords.map((chord, index) => {
            const isActive = index === activeChordIndex;
            const isPast = index < activeChordIndex;
            const distance = Math.abs(index - activeChordIndex);

            let scale = 1;
            let opacity = 1;
            if (!isActive) {
              scale = Math.max(0.5, 1 - distance * 0.12);
              opacity = Math.max(0.2, 1 - distance * 0.25);
            }

            return (
              <TouchableOpacity
                key={chord.id}
                onPress={() => openEditModal(chord)}
                activeOpacity={0.7}
                style={[
                  styles.chordItem,
                  { opacity, transform: [{ scale }] },
                ]}
              >
                {isActive ? (
                  <GlassCard
                    style={styles.activeChordCard}
                    glow
                    glowColor={Colors.primaryContainer}
                  >
                    <Text style={styles.activeChordTime}>
                      ACTIVE NOW • {formatTime(chord.time_seconds)}
                    </Text>
                    <Text style={styles.activeChordLabel}>
                      {chord.chord_label}
                    </Text>
                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => openEditModal(chord)}
                    >
                      <MaterialIcons name="edit" size={14} color={Colors.onSurfaceVariant} />
                      <Text style={styles.editBtnText}>Edit Label</Text>
                    </TouchableOpacity>
                  </GlassCard>
                ) : (
                  <View style={styles.inactiveChordItem}>
                    <Text style={styles.inactiveChordTime}>
                      {formatTime(chord.time_seconds)}
                    </Text>
                    <Text
                      style={[
                        styles.inactiveChordLabel,
                        { fontSize: isActive ? 56 : Math.max(24, 40 - distance * 6) },
                      ]}
                    >
                      {chord.chord_label}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Bottom fade */}
        <View style={styles.fadeBottom} />
      </View>

      {/* Playback Controls */}
      <View style={styles.controlsSection}>
        <View style={styles.controls}>
          <TouchableOpacity style={styles.controlBtnSmall}>
            <MaterialIcons name="shuffle" size={28} color={Colors.onSurfaceVariant} />
          </TouchableOpacity>

          <View style={styles.mainControls}>
            <TouchableOpacity style={styles.controlBtnMd} onPress={skipBackward}>
              <MaterialIcons name="skip-previous" size={36} color={Colors.onSurfaceVariant} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.playButton}
              onPress={togglePlayback}
              activeOpacity={0.85}
            >
              <MaterialIcons
                name={isPlaying ? 'pause' : 'play-arrow'}
                size={44}
                color={Colors.onPrimary}
              />
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlBtnMd} onPress={skipForward}>
              <MaterialIcons name="skip-next" size={36} color={Colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.controlBtnSmall}>
            <MaterialIcons name="repeat" size={28} color={Colors.onSurfaceVariant} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Edit Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <GlassCard style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Chord Label</Text>
            <Text style={styles.modalSubtitle}>
              at {editingChord ? formatTime(editingChord.time_seconds) : ''}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={editLabel}
              onChangeText={setEditLabel}
              autoFocus
              selectTextOnFocus
              placeholder="Enter chord (e.g. Am7)"
              placeholderTextColor={Colors.outline}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveEdit}
              >
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        </View>
      </Modal>
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
  backBtn: {
    padding: 8,
    borderRadius: 9999,
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
  songInfoSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  songInfoLeft: {
    flex: 1,
    gap: 2,
  },
  songTitle: {
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 24,
    color: Colors.onSurface,
  },
  songArtist: {
    fontFamily: 'Inter',
    fontSize: 16,
    color: Colors.onSurfaceVariant,
  },
  songActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    padding: 8,
    borderRadius: 9999,
  },
  waveformSection: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  waveformCard: {
    height: 88,
    borderRadius: 16,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  waveformProgress: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: `${Colors.primary}1A`,
    borderRightWidth: 2,
    borderRightColor: Colors.primary,
  },
  waveformBars: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    height: '100%',
  },
  waveformBar: {
    width: 3,
    borderRadius: 9999,
  },
  timeDisplay: {
    position: 'absolute',
    bottom: 8,
    right: 16,
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: Colors.onSurfaceVariant,
  },
  chordScrollContainer: {
    flex: 1,
    overflow: 'hidden',
    marginTop: 8,
  },
  fadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    zIndex: 10,
    backgroundColor: Colors.background,
    opacity: 0.8,
  },
  fadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    zIndex: 10,
    backgroundColor: Colors.background,
    opacity: 0.8,
  },
  chordScroll: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 24,
    paddingHorizontal: 24,
  },
  chordItem: {
    alignItems: 'center',
    width: '100%',
  },
  activeChordCard: {
    padding: 32,
    alignItems: 'center',
    width: '100%',
    borderColor: `${Colors.primary}66`,
    borderRadius: 32,
    gap: 12,
  },
  activeChordTime: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    letterSpacing: 0.6,
    color: Colors.primary,
  },
  activeChordLabel: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 64,
    color: Colors.primary,
    letterSpacing: -1.28,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9999,
    marginTop: 8,
  },
  editBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    letterSpacing: 0.6,
    color: Colors.onSurfaceVariant,
    textTransform: 'uppercase',
  },
  inactiveChordItem: {
    alignItems: 'center',
    gap: 4,
  },
  inactiveChordTime: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: Colors.onSurfaceVariant,
  },
  inactiveChordLabel: {
    fontFamily: 'Montserrat-Bold',
    color: Colors.onSurfaceVariant,
    letterSpacing: -0.5,
  },
  controlsSection: {
    backgroundColor: `${Colors.surfaceContainer}CC`,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  controlBtnSmall: {
    padding: 8,
  },
  mainControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  controlBtnMd: {
    padding: 4,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primaryContainer,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  // Edit Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    padding: 24,
    gap: 16,
    borderRadius: 24,
  },
  modalTitle: {
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 24,
    color: Colors.onSurface,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Montserrat-Bold',
    fontSize: 24,
    color: Colors.primary,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
  },
  modalCancelText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: Colors.primary,
  },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.primaryContainer,
    alignItems: 'center',
  },
  modalSaveText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: Colors.onPrimaryContainer,
  },
});
