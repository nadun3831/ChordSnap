import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Colors from '../../constants/Colors';
import GlassCard from '../../components/GlassCard';
import { listSongs, deleteSong, Song } from '../../lib/api';

export default function LibraryScreen() {
  const router = useRouter();
  const [songs, setSongs] = useState<Song[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSongs = async () => {
    try {
      const data = await listSongs();
      setSongs(data);
    } catch (err) {
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

  const handleDelete = (song: Song) => {
    Alert.alert('Delete Song', `Delete "${song.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSong(song.id);
            setSongs(prev => prev.filter(s => s.id !== song.id));
          } catch (err) {
            Alert.alert('Error', 'Failed to delete song');
          }
        },
      },
    ]);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done': return Colors.tertiary;
      case 'processing': return Colors.secondary;
      case 'failed': return Colors.error;
      default: return Colors.outline;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialIcons name="graphic-eq" size={24} color={Colors.primary} />
          <Text style={styles.logoText}>ChordSnap</Text>
        </View>
      </View>

      <View style={styles.titleSection}>
        <Text style={styles.title}>Your Library</Text>
        <Text style={styles.subtitle}>{songs.length} songs captured</Text>
      </View>

      <FlatList
        data={songs}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialIcons name="library-music" size={64} color={Colors.outlineVariant} />
            <Text style={styles.emptyTitle}>No songs yet</Text>
            <Text style={styles.emptySubtitle}>
              Upload or record a song to see it here
            </Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push('/new-song')}
            >
              <MaterialIcons name="add" size={20} color={Colors.onPrimaryContainer} />
              <Text style={styles.addButtonText}>NEW SONG</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              if (item.status === 'done') {
                router.push({ pathname: '/player', params: { songId: item.id } });
              } else if (item.status === 'processing') {
                router.push({ pathname: '/analyzing', params: { songId: item.id } });
              }
            }}
            onLongPress={() => handleDelete(item)}
          >
            <GlassCard style={styles.songRow}>
              <View style={styles.songIcon}>
                <MaterialIcons
                  name={item.status === 'done' ? 'music-note' : item.status === 'processing' ? 'hourglass-top' : 'error-outline'}
                  size={24}
                  color={getStatusColor(item.status)}
                />
              </View>
              <View style={styles.songDetails}>
                <Text style={styles.songTitle} numberOfLines={1}>{item.title}</Text>
                <View style={styles.songMeta}>
                  <Text style={styles.songMetaText}>
                    {formatDuration(item.duration)}
                  </Text>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
                  <Text style={[styles.songMetaText, { color: getStatusColor(item.status) }]}>
                    {item.status.toUpperCase()}
                  </Text>
                </View>
              </View>
              {item.status === 'done' && (
                <MaterialIcons name="play-circle-filled" size={32} color={Colors.primary} />
              )}
            </GlassCard>
          </TouchableOpacity>
        )}
      />
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
  titleSection: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    gap: 4,
  },
  title: {
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 32,
    color: Colors.onBackground,
  },
  subtitle: {
    fontFamily: 'Inter',
    fontSize: 16,
    color: Colors.onSurfaceVariant,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 120,
    gap: 12,
  },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 16,
  },
  songIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  songDetails: {
    flex: 1,
    gap: 4,
  },
  songTitle: {
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 16,
    color: Colors.onSurface,
  },
  songMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  songMetaText: {
    fontFamily: 'Inter',
    fontSize: 13,
    color: Colors.onSurfaceVariant,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 16,
  },
  emptyTitle: {
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 20,
    color: Colors.onSurfaceVariant,
  },
  emptySubtitle: {
    fontFamily: 'Inter',
    fontSize: 16,
    color: Colors.outline,
    textAlign: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primaryContainer,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 9999,
    marginTop: 8,
  },
  addButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    letterSpacing: 0.6,
    color: Colors.onPrimaryContainer,
  },
});
