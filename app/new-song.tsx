import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import Colors from '../constants/Colors';
import GlassCard from '../components/GlassCard';
import WaveformVisualizer from '../components/WaveformVisualizer';
import { uploadSong } from '../lib/api';

export default function NewSongScreen() {
  const router = useRouter();
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleRecording = () => {
    if (isRecording) {
      // Stop recording
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);

      // In a real app, we'd save the recording and upload it
      Alert.alert(
        'Recording Saved',
        'In the full version, this would save and upload the recording for chord analysis.',
        [
          { text: 'OK', onPress: () => setRecordingTime(0) },
        ]
      );
    } else {
      // Start recording
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
  };

  const handleFilePick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      setIsUploading(true);

      try {
        const response = await uploadSong(
          Platform.OS === 'web' && file.file ? file.file : file.uri,
          file.name,
          file.mimeType || 'audio/mpeg',
          file.name.replace(/\.[^/.]+$/, ''),
        );

        // Navigate to analyzing screen
        router.replace({
          pathname: '/analyzing',
          params: { songId: response.id, songTitle: response.title },
        });
      } catch (err: any) {
        Alert.alert('Upload Failed', err.message || 'Could not upload the file. Make sure the backend is running.');
        setIsUploading(false);
      }
    } catch (err) {
      console.error('File pick error:', err);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
            <MaterialIcons name="arrow-back" size={24} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={styles.logoText}>ChordSnap</Text>
        </View>
        <View style={styles.avatar}>
          <MaterialIcons name="person" size={18} color={Colors.primary} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome Header */}
        <View style={styles.titleSection}>
          <Text style={styles.title}>New Session</Text>
          <Text style={styles.subtitle}>
            Capture live audio or upload a recording for instant chord analysis.
          </Text>
        </View>

        {/* Bento Grid */}
        <View style={styles.bentoGrid}>
          {/* Record Card */}
          <GlassCard
            style={[
              styles.recordCard,
              isRecording && styles.recordCardActive,
            ]}
            glow={isRecording}
            glowColor={Colors.secondaryBright}
          >
            <View style={styles.liveTag}>
              <Text style={styles.liveTagText}>LIVE AI</Text>
            </View>

            <View style={styles.recordContent}>
              <TouchableOpacity
                style={[
                  styles.recordButton,
                  isRecording && styles.recordButtonActive,
                ]}
                onPress={toggleRecording}
                activeOpacity={0.8}
              >
                <MaterialIcons
                  name={isRecording ? 'stop' : 'mic'}
                  size={48}
                  color={isRecording ? Colors.onErrorContainer : Colors.onPrimary}
                />
              </TouchableOpacity>

              <View style={styles.recordTextArea}>
                <Text style={styles.recordTitle}>Record Audio</Text>
                <Text
                  style={[
                    styles.recordStatus,
                    isRecording && styles.recordStatusActive,
                  ]}
                >
                  {isRecording
                    ? `Recording... (${formatTime(recordingTime)})`
                    : 'Tap to start listening'}
                </Text>
              </View>
            </View>

            <WaveformVisualizer isActive={isRecording} height={56} barCount={12} />
          </GlassCard>

          {/* Upload Card */}
          <GlassCard style={styles.uploadCard}>
            <View style={styles.uploadIconBox}>
              <MaterialIcons name="upload-file" size={40} color={Colors.primary} />
            </View>

            <View style={styles.uploadTextArea}>
              <Text style={styles.uploadTitle}>Upload File</Text>
              <Text style={styles.uploadFormats}>MP3, WAV, or M4A supported</Text>
              <Text style={styles.uploadLimit}>Max file size: 50MB</Text>
            </View>

            <TouchableOpacity
              style={styles.chooseFileBtn}
              onPress={handleFilePick}
              disabled={isUploading}
              activeOpacity={0.8}
            >
              {isUploading ? (
                <ActivityIndicator color={Colors.onSurface} />
              ) : (
                <Text style={styles.chooseFileBtnText}>Choose File</Text>
              )}
            </TouchableOpacity>
          </GlassCard>
        </View>

        {/* Info Card */}
        <GlassCard style={styles.infoCard}>
          <View style={styles.infoBadge}>
            <MaterialIcons name="info" size={22} color={Colors.secondary} />
          </View>
          <View style={styles.infoTextArea}>
            <Text style={styles.infoTitle}>Did you know?</Text>
            <Text style={styles.infoSubtitle}>
              ChordSnap's AI can distinguish over 2,000 chord variations in real-time with 98% accuracy.
            </Text>
          </View>
        </GlassCard>
      </ScrollView>
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
    gap: 12,
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
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceContainerHigh,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
    gap: 24,
  },
  titleSection: {
    gap: 8,
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 28,
    color: Colors.onSurface,
  },
  subtitle: {
    fontFamily: 'Inter',
    fontSize: 16,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
  },
  bentoGrid: {
    gap: 24,
  },
  recordCard: {
    padding: 24,
    gap: 24,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  recordCardActive: {
    borderColor: `${Colors.primary}99`,
  },
  liveTag: {
    alignSelf: 'flex-start',
    backgroundColor: `${Colors.primary}1A`,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  liveTagText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    letterSpacing: 0.6,
    color: Colors.primary,
  },
  recordContent: {
    alignItems: 'center',
    gap: 16,
  },
  recordButton: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  recordButtonActive: {
    backgroundColor: Colors.errorContainer,
  },
  recordTextArea: {
    alignItems: 'center',
    gap: 4,
  },
  recordTitle: {
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 24,
    color: Colors.onSurface,
  },
  recordStatus: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: Colors.onSurfaceVariant,
  },
  recordStatusActive: {
    color: Colors.error,
  },
  uploadCard: {
    padding: 24,
    alignItems: 'center',
    gap: 20,
    borderStyle: 'dashed',
  },
  uploadIconBox: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTextArea: {
    alignItems: 'center',
    gap: 4,
  },
  uploadTitle: {
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 24,
    color: Colors.onSurface,
  },
  uploadFormats: {
    fontFamily: 'Inter',
    fontSize: 16,
    color: Colors.onSurfaceVariant,
    marginTop: 4,
  },
  uploadLimit: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: Colors.outline,
    fontStyle: 'italic',
  },
  chooseFileBtn: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chooseFileBtnText: {
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 18,
    color: Colors.onSurface,
  },
  infoCard: {
    flexDirection: 'row',
    padding: 16,
    gap: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  infoBadge: {
    padding: 8,
    backgroundColor: `${Colors.secondary}1A`,
    borderRadius: 12,
  },
  infoTextArea: {
    flex: 1,
    gap: 2,
  },
  infoTitle: {
    fontFamily: 'Inter',
    fontSize: 16,
    color: Colors.onSurface,
  },
  infoSubtitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    lineHeight: 18,
  },
});
