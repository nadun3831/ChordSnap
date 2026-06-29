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
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Audio, AVPlaybackStatus } from 'expo-av';
import Colors from '../constants/Colors';
import GlassCard from '../components/GlassCard';
import { getSong, getSongChords, updateChord, deleteSong, Song, ChordEvent, API_BASE } from '../lib/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function PlayerScreen() {
  const router = useRouter();
  const { songId } = useLocalSearchParams<{ songId: string }>();

  const [song, setSong] = useState<Song | null>(null);
  const [chords, setChords] = useState<ChordEvent[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeChordIndex, setActiveChordIndex] = useState(0);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [isMetronomeEnabled, setIsMetronomeEnabled] = useState(false);

  // Edit modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingChord, setEditingChord] = useState<ChordEvent | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const soundRef = useRef<Audio.Sound | null>(null);
  const timelineScrollRef = useRef<ScrollView>(null);
  const playheadRef = useRef<View>(null);
  const progressFillRef = useRef<View>(null);
  const lastPositionSecondsRef = useRef(0);
  const lastUpdateTimestampRef = useRef(0);
  const isPlayingRef = useRef(false);
  const isMetronomeEnabledRef = useRef(false);
  const metronomeSoundRef = useRef<Audio.Sound | null>(null);
  const lastPlayedBeatRef = useRef(-1);
  const songRecordRef = useRef<Song | null>(null);
  const chordsRef = useRef<ChordEvent[]>([]);

  // Sync song and chords state to refs to prevent stale closures in callbacks
  useEffect(() => {
    songRecordRef.current = song;
  }, [song]);

  useEffect(() => {
    chordsRef.current = chords;
  }, [chords]);

  // Fetch song data
  useEffect(() => {
    if (songId) {
      loadSongData();
    }
  }, [songId]);

  // Sync metronome state ref
  useEffect(() => {
    isMetronomeEnabledRef.current = isMetronomeEnabled;
  }, [isMetronomeEnabled]);

  // Load metronome audio
  useEffect(() => {
    let soundObj: Audio.Sound | null = null;
    const loadMetronome = async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          require('../assets/click.wav'),
          { shouldPlay: false, volume: 0.8 }
        );
        soundObj = sound;
        metronomeSoundRef.current = sound;
      } catch (err) {
        console.warn('Failed to load metronome sound:', err);
      }
    };
    loadMetronome();

    return () => {
      if (soundObj) {
        soundObj.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const playMetronomeClick = async (beatIndex: number) => {
    const isBeatOne = (beatIndex % 4) === 0;
    try {
      if (metronomeSoundRef.current) {
        await metronomeSoundRef.current.setStatusAsync({
          positionMillis: 0,
          shouldPlay: true,
          rate: isBeatOne ? 1.4 : 1.0,
          shouldCorrectPitch: false,
          volume: isBeatOne ? 1.0 : 0.6,
        });
      }
    } catch (err) {
      // Ignore errors
    }
  };

  const getBeatDetails = () => {
    const currentSong = songRecordRef.current;
    const currentChords = chordsRef.current;
    const bpm = currentSong?.bpm || 120;
    const beatDuration = 60 / bpm;
    const firstBeatOffset = currentChords[0]?.time_seconds || 0;
    return { bpm, beatDuration, firstBeatOffset };
  };

  const syncMetronomeBeat = (timeInSeconds: number) => {
    const { beatDuration, firstBeatOffset } = getBeatDetails();
    if (timeInSeconds < firstBeatOffset) {
      lastPlayedBeatRef.current = -1;
    } else {
      lastPlayedBeatRef.current = Math.floor((timeInSeconds - firstBeatOffset) / beatDuration);
    }
  };

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
      const audioUrl = `${API_BASE}/uploads/${song?.audio_url}`;
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: false, progressUpdateIntervalMillis: 50 },
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
      isPlayingRef.current = status.isPlaying;
      lastPositionSecondsRef.current = status.positionMillis / 1000;
      lastUpdateTimestampRef.current = performance.now();

      // If we just loaded or jumped, align the beat tracker
      const { beatDuration, firstBeatOffset } = getBeatDetails();
      const timeInSecs = status.positionMillis / 1000;
      let currentBeat = -1;
      if (timeInSecs >= firstBeatOffset) {
        currentBeat = Math.floor((timeInSecs - firstBeatOffset) / beatDuration);
      }
      if (Math.abs(lastPlayedBeatRef.current - currentBeat) > 1) {
        lastPlayedBeatRef.current = currentBeat;
      }

      if (status.didJustFinish) {
        setIsPlaying(false);
        isPlayingRef.current = false;
        setCurrentTime(0);
        lastPositionSecondsRef.current = 0;
        lastPlayedBeatRef.current = -1;
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

  const updateTimingRefs = (seconds: number) => {
    lastPositionSecondsRef.current = seconds;
    lastUpdateTimestampRef.current = performance.now();
  };

  const togglePlayback = async () => {
    if (!soundRef.current) return;
    try {
      if (isPlaying) {
        await soundRef.current.pauseAsync();
        isPlayingRef.current = false;
      } else {
        await soundRef.current.playAsync();
        isPlayingRef.current = true;
        lastUpdateTimestampRef.current = performance.now();
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
      updateTimingRefs(nextTime);
      syncMetronomeBeat(nextTime);
    }
  };

  const skipBackward = async () => {
    if (soundRef.current && activeChordIndex > 0) {
      const prevTime = chords[activeChordIndex - 1].time_seconds;
      await soundRef.current.setPositionAsync(prevTime * 1000);
      setCurrentTime(prevTime);
      updateTimingRefs(prevTime);
      syncMetronomeBeat(prevTime);
    }
  };

  const seekToChord = async (chord: ChordEvent) => {
    if (!soundRef.current) return;
    try {
      await soundRef.current.setPositionAsync(chord.time_seconds * 1000);
      setCurrentTime(chord.time_seconds);
      updateTimingRefs(chord.time_seconds);
      syncMetronomeBeat(chord.time_seconds);
    } catch (err) {
      console.error('Seek error:', err);
    }
  };

  // 60FPS requestAnimationFrame loop for ultra-smooth playhead and scroll tracking
  const TRACK_WIDTH = Math.max(SCREEN_WIDTH * 4, (song?.duration || 0) * 80);
  useEffect(() => {
    let rafId: number;
    const updateCursor = () => {
      const currentSong = songRecordRef.current;
      if (currentSong && currentSong.duration > 0) {
        let estimatedTime = currentTime;
        if (isPlayingRef.current) {
          const elapsed = (performance.now() - lastUpdateTimestampRef.current) / 1000;
          estimatedTime = Math.min(currentSong.duration, lastPositionSecondsRef.current + elapsed);
        }

        const playheadX = (estimatedTime / currentSong.duration) * TRACK_WIDTH;
        const progressPercentVal = (estimatedTime / currentSong.duration) * 100;

        // Update playhead & progress fill directly via native style refs for 60fps smoothness
        if (playheadRef.current) {
          if (typeof playheadRef.current.setNativeProps === 'function') {
            playheadRef.current.setNativeProps({ style: { left: playheadX } });
          } else {
            (playheadRef.current as any).style.left = `${playheadX}px`;
          }
        }

        if (progressFillRef.current) {
          if (typeof progressFillRef.current.setNativeProps === 'function') {
            progressFillRef.current.setNativeProps({ style: { width: `${progressPercentVal}%` } });
          } else {
            (progressFillRef.current as any).style.width = `${progressPercentVal}%`;
          }
        }

        // Metronome beat trigger logic
        const { beatDuration, firstBeatOffset } = getBeatDetails();
        let currentBeatIndex = -1;
        if (estimatedTime >= firstBeatOffset) {
          currentBeatIndex = Math.floor((estimatedTime - firstBeatOffset) / beatDuration);
        }

        if (currentBeatIndex !== lastPlayedBeatRef.current) {
          if (isPlayingRef.current && currentBeatIndex > lastPlayedBeatRef.current && (currentBeatIndex - lastPlayedBeatRef.current) < 3) {
            if (isMetronomeEnabledRef.current && currentBeatIndex >= 0) {
              playMetronomeClick(currentBeatIndex);
            }
          }
          lastPlayedBeatRef.current = currentBeatIndex;
        }

        // Scroll the track under the playhead
        if (!isUserScrolling && timelineScrollRef.current) {
          const scrollTo = Math.max(0, playheadX - SCREEN_WIDTH / 2);
          timelineScrollRef.current.scrollTo({ x: scrollTo, animated: false });
        }
      }
      rafId = requestAnimationFrame(updateCursor);
    };

    rafId = requestAnimationFrame(updateCursor);
    return () => cancelAnimationFrame(rafId);
  }, [TRACK_WIDTH, isUserScrolling, currentTime]);

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
          {(song?.bpm || song?.key_name) && (
            <View style={styles.badgeContainer}>
              {song.key_name && (
                <View style={styles.keyBadge}>
                  <Text style={styles.keyText}>Key: {song.key_name}</Text>
                </View>
              )}
              {song.bpm && (
                <View style={styles.bpmBadge}>
                  <Text style={styles.bpmText}>{song.bpm} BPM</Text>
                </View>
              )}
            </View>
          )}
        </View>
        <View style={styles.songActions}>
          <TouchableOpacity style={styles.actionBtn}>
            <MaterialIcons name="favorite-border" size={22} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <MaterialIcons name="share" size={22} color={Colors.onSurfaceVariant} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={async () => {
              const doPlayerDelete = async () => {
                try {
                  if (soundRef.current) {
                    await soundRef.current.stopAsync().catch(() => {});
                    await soundRef.current.unloadAsync().catch(() => {});
                  }
                  await deleteSong(songId!);
                  if (router.canGoBack()) {
                    router.back();
                  } else {
                    router.replace('/(tabs)');
                  }
                } catch (err) {
                  if (Platform.OS === 'web') {
                    alert('Failed to delete song');
                  } else {
                    Alert.alert('Error', 'Failed to delete song');
                  }
                }
              };

              if (Platform.OS === 'web') {
                if (confirm(`Delete "${song?.title}"?`)) {
                  await doPlayerDelete();
                }
              } else {
                Alert.alert('Delete Song', `Delete "${song?.title}"?`, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: doPlayerDelete,
                  },
                ]);
              }
            }}
          >
            <MaterialIcons name="delete-outline" size={22} color={Colors.error} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Scrollable Waveform Scrubber with Chord Markers */}
      <View style={styles.waveformSection}>
        <GlassCard style={styles.waveformCard}>
          <ScrollView
            ref={timelineScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.waveformScroll}
            scrollEventThrottle={16}
            onScrollBeginDrag={() => setIsUserScrolling(true)}
            onScrollEndDrag={() => {
              // Wait a moment after dragging stops to resume auto-scroll
              setTimeout(() => setIsUserScrolling(false), 1500);
            }}
            onMomentumScrollEnd={() => setIsUserScrolling(false)}
          >
            <View style={[styles.waveformTrack, { width: TRACK_WIDTH }]}>
              {/* Progress fill */}
              <View ref={progressFillRef} style={styles.waveformProgress} />

              {/* Waveform bars spread across full track width */}
              <View style={styles.waveformBars}>
                {Array.from({ length: Math.max(40, Math.floor(TRACK_WIDTH / 20)) }).map((_, i, arr) => {
                  const barCount = arr.length;
                  const barHeight = 14 + Math.sin(i * 0.15) * 22 + Math.random() * 14;
                  const barPercent = (i / barCount) * 100;
                  const isPast = barPercent < progressPercent;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.waveformBar,
                        {
                          height: barHeight,
                          backgroundColor: isPast ? Colors.primary : Colors.onSurfaceVariant,
                          opacity: isPast ? 0.8 : 0.25,
                        },
                      ]}
                    />
                  );
                })}
              </View>

              {/* Chord change markers */}
              {chords.length > 0 && song && song.duration > 0 && chords.map((chord) => {
                const markerX = (chord.time_seconds / song.duration) * TRACK_WIDTH;
                const isPast = chord.time_seconds <= currentTime;
                const isActive = chord.time_seconds <= currentTime &&
                  (chords.indexOf(chord) === chords.length - 1 ||
                    chords[chords.indexOf(chord) + 1].time_seconds > currentTime);
                return (
                  <TouchableOpacity
                    key={chord.id}
                    activeOpacity={0.7}
                    onPress={() => seekToChord(chord)}
                    style={[
                      styles.chordMarker,
                      { left: markerX },
                    ]}
                  >
                    <View style={[
                      styles.chordMarkerTick,
                      isPast && styles.chordMarkerTickPast,
                      isActive && styles.chordMarkerTickActive,
                    ]} />
                    <Text style={[
                      styles.chordMarkerLabel,
                      isPast && styles.chordMarkerLabelPast,
                      isActive && styles.chordMarkerLabelActive,
                    ]} numberOfLines={1}>
                      {chord.chord_label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* Playhead line */}
              <View ref={playheadRef} style={styles.playhead} />
            </View>
          </ScrollView>
        </GlassCard>
        {/* Time display outside scroll so always visible */}
        <Text style={styles.timeDisplay}>
          {formatTime(currentTime)} / {formatTime(song?.duration || 0)}
        </Text>
      </View>

      {/* Chord Dashboard Section (No scrolling, static) */}
      <View style={styles.dashboardContainer}>
        {/* Main Display: Current & Next */}
        <View style={styles.mainChordDisplay}>
          {/* Previous Chord Preview */}
          <View style={styles.sideChordColumn}>
            {activeChordIndex > 0 ? (
              <TouchableOpacity 
                style={styles.sideChordCard} 
                onPress={skipBackward}
                activeOpacity={0.7}
              >
                <Text style={styles.sideChordTag}>PREVIOUS</Text>
                <Text style={styles.sideChordLabel}>{chords[activeChordIndex - 1]?.chord_label}</Text>
                <Text style={styles.sideChordTime}>{formatTime(chords[activeChordIndex - 1]?.time_seconds || 0)}</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.sideChordCard, styles.disabledSideCard]}>
                <Text style={styles.sideChordTag}>PREVIOUS</Text>
                <Text style={styles.sideChordLabel}>—</Text>
                <Text style={styles.sideChordTime}>00:00</Text>
              </View>
            )}
          </View>

          {/* Current Active Chord */}
          <GlassCard
            style={styles.currentChordCard}
            glow
            glowColor={Colors.primaryContainer}
          >
            <Text style={styles.currentChordTag}>CURRENT</Text>
            <Text style={styles.currentChordLabel}>
              {chords[activeChordIndex]?.chord_label || '—'}
            </Text>
            <Text style={styles.currentChordTime}>
              Started at {chords[activeChordIndex] ? formatTime(chords[activeChordIndex].time_seconds) : '00:00'}
            </Text>
            
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => chords[activeChordIndex] && openEditModal(chords[activeChordIndex])}
              activeOpacity={0.7}
            >
              <MaterialIcons name="edit" size={14} color={Colors.onSurfaceVariant} />
              <Text style={styles.editBtnText}>Edit Chord</Text>
            </TouchableOpacity>
          </GlassCard>

          {/* Next Chord Preview */}
          <View style={styles.sideChordColumn}>
            {activeChordIndex < chords.length - 1 ? (
              <TouchableOpacity 
                style={styles.sideChordCard} 
                onPress={skipForward}
                activeOpacity={0.7}
              >
                <Text style={styles.sideChordTag}>NEXT</Text>
                <Text style={styles.sideChordLabel}>{chords[activeChordIndex + 1]?.chord_label}</Text>
                <Text style={styles.sideChordTime}>{formatTime(chords[activeChordIndex + 1]?.time_seconds || 0)}</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.sideChordCard, styles.disabledSideCard]}>
                <Text style={styles.sideChordTag}>NEXT</Text>
                <Text style={styles.sideChordLabel}>END</Text>
                <Text style={styles.sideChordTime}>—</Text>
              </View>
            )}
          </View>
        </View>

        {/* Metronome quick-toggle bar */}
        <View style={styles.metronomeToggleContainer}>
          <TouchableOpacity
            style={[
              styles.metronomeButton,
              isMetronomeEnabled && styles.metronomeButtonActive
            ]}
            onPress={() => setIsMetronomeEnabled(!isMetronomeEnabled)}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name="av-timer"
              size={20}
              color={isMetronomeEnabled ? Colors.onPrimary : Colors.primary}
            />
            <Text
              style={[
                styles.metronomeButtonText,
                isMetronomeEnabled && styles.metronomeButtonTextActive
              ]}
            >
              Metronome: {isMetronomeEnabled ? 'ACTIVE' : 'OFF'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Playback Controls */}
      <View style={styles.controlsSection}>
        <View style={styles.controls}>
          <TouchableOpacity
            style={[
              styles.controlBtnSmall,
              isMetronomeEnabled && styles.metronomeActiveBtn
            ]}
            onPress={() => setIsMetronomeEnabled(!isMetronomeEnabled)}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name="av-timer"
              size={28}
              color={isMetronomeEnabled ? Colors.primary : Colors.onSurfaceVariant}
            />
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
    height: 80,
    borderRadius: 16,
    overflow: 'hidden',
  },
  waveformScroll: {
    flex: 1,
  },
  waveformTrack: {
    height: '100%',
    position: 'relative',
  },
  waveformProgress: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: `${Colors.primary}15`,
  },
  waveformBars: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    height: '100%',
  },
  waveformBar: {
    width: 3,
    borderRadius: 9999,
  },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: Colors.primary,
    zIndex: 10,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 6,
  },
  chordMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 40,
    marginLeft: -20,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
    zIndex: 5,
  },
  chordMarkerTick: {
    position: 'absolute',
    top: 0,
    width: 1.5,
    height: '50%',
    backgroundColor: Colors.secondary,
    borderRadius: 9999,
    opacity: 0.6,
  },
  chordMarkerTickPast: {
    backgroundColor: Colors.primary,
    opacity: 0.35,
  },
  chordMarkerTickActive: {
    backgroundColor: Colors.primary,
    opacity: 1,
  },
  chordMarkerLabel: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 11,
    color: Colors.secondary,
    opacity: 0.9,
  },
  chordMarkerLabelPast: {
    color: Colors.onSurfaceVariant,
    opacity: 0.45,
  },
  chordMarkerLabelActive: {
    color: Colors.primary,
    opacity: 1,
  },
  timeDisplay: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    textAlign: 'right',
    marginTop: 6,
  },
  dashboardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginVertical: 12,
  },
  mainChordDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 8,
  },
  sideChordColumn: {
    flex: 1.2,
    alignItems: 'center',
  },
  sideChordCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 10,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  disabledSideCard: {
    opacity: 0.25,
  },
  sideChordTag: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 9,
    letterSpacing: 0.8,
    color: Colors.onSurfaceVariant,
    opacity: 0.6,
    textTransform: 'uppercase',
  },
  sideChordLabel: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 24,
    color: Colors.onSurface,
  },
  sideChordTime: {
    fontFamily: 'Inter',
    fontSize: 10,
    color: Colors.onSurfaceVariant,
    opacity: 0.8,
  },
  currentChordCard: {
    flex: 2,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: `${Colors.primary}4D`,
    borderRadius: 24,
    gap: 8,
    shadowColor: Colors.primaryContainer,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
  },
  currentChordTag: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    letterSpacing: 1,
    color: Colors.primary,
    textTransform: 'uppercase',
  },
  currentChordLabel: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 54,
    color: Colors.primary,
    letterSpacing: -1,
  },
  currentChordTime: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    marginTop: 4,
  },
  editBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: Colors.onSurfaceVariant,
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
  // BPM & Key Badges
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  bpmBadge: {
    backgroundColor: 'rgba(164, 230, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(164, 230, 255, 0.25)',
  },
  bpmText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },
  keyBadge: {
    backgroundColor: 'rgba(218, 185, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(218, 185, 255, 0.25)',
  },
  keyText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '600',
    color: Colors.secondary,
  },
  metronomeActiveBtn: {
    backgroundColor: 'rgba(164, 230, 255, 0.12)',
    borderRadius: 12,
  },
  metronomeToggleContainer: {
    marginTop: 16,
    width: '100%',
    alignItems: 'center',
  },
  metronomeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(164, 230, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(164, 230, 255, 0.25)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  metronomeButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  metronomeButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: Colors.primary,
  },
  metronomeButtonTextActive: {
    color: Colors.onPrimary,
  },
});
