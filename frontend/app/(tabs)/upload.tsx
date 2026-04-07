import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  Text,
  Dimensions,
  StatusBar,
  Animated,
  FlatList,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Video } from 'expo-av';
import { handleMediaUpload } from '../../services/uploadService';

// ⚠️ SAFE IMPORTS - Handle camera module gracefully
let CameraView: any = null;
let CameraType: any = { front: 'front', back: 'back' };
let useCameraPermissions: any = () => [{ granted: false }, () => null];
let useMicrophonePermissions: any = () => [{ granted: false }, () => null];
let cameraModuleAvailable = false;

try {
  const cameraModule = require('expo-camera');
  CameraView = cameraModule.CameraView;
  CameraType = cameraModule.CameraType;
  useCameraPermissions = cameraModule.useCameraPermissions;
  useMicrophonePermissions = cameraModule.useMicrophonePermissions;
  cameraModuleAvailable = true;
} catch (error) {
  console.warn('[Upload] Camera module not available - will use gallery only', error);
  cameraModuleAvailable = false;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type UploadMode = 'Story' | 'Post' | 'Flick' | 'Long Video' | 'Freehand';
type FlashMode = 'off' | 'on' | 'auto';

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SW, height: SH } = Dimensions.get('window');

const MODES: UploadMode[] = ['Story', 'Post', 'Flick', 'Long Video', 'Freehand'];

const MODE_COLOR: Record<UploadMode, string> = {
  Story: '#A78BFA',
  Post: '#FFFFFF',
  Flick: '#FF6B6B',
  'Long Video': '#34D399',
  Freehand: '#FBBF24',
};

const MODE_MAX_DURATION: Record<UploadMode, number> = {
  Story: 15,
  Post: 60,
  Flick: 60,
  'Long Video': 600,
  Freehand: 600,
};

const SHUTTER_OUTER = 82;
const SHUTTER_INNER = 66;
const ARC_STROKE = 4;
const ARC_RADIUS = (SHUTTER_OUTER - ARC_STROKE) / 2;
const ARC_CIRCUM = 2 * Math.PI * ARC_RADIUS;

const LEFT_TOOLS = [
  { id: 'boomerang', icon: 'repeat-outline', label: 'Boomerang' },
  { id: 'timer', icon: 'timer-outline', label: 'Timer' },
  { id: 'duration', icon: 'time-outline', label: 'Duration' },
  { id: 'speed', icon: 'speedometer-outline', label: 'Speed' },
];

// ─── Arc Progress SVG ─────────────────────────────────────────────────────────

function ArcProgress({
  progress,
  color,
}: {
  progress: Animated.Value;
  color: string;
}) {
  const [offset, setOffset] = React.useState(ARC_CIRCUM);

  useEffect(() => {
    const id = progress.addListener(({ value }) => {
      setOffset(ARC_CIRCUM * (1 - value));
    });
    return () => progress.removeListener(id);
  }, []);

  return (
    <Svg width={SHUTTER_OUTER} height={SHUTTER_OUTER} style={StyleSheet.absoluteFill}>
      <Circle
        cx={SHUTTER_OUTER / 2}
        cy={SHUTTER_OUTER / 2}
        r={ARC_RADIUS}
        stroke="rgba(255,255,255,0.15)"
        strokeWidth={ARC_STROKE}
        fill="none"
      />
      <Circle
        cx={SHUTTER_OUTER / 2}
        cy={SHUTTER_OUTER / 2}
        r={ARC_RADIUS}
        stroke={color}
        strokeWidth={ARC_STROKE}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${ARC_CIRCUM} ${ARC_CIRCUM}`}
        strokeDashoffset={offset}
        rotation="-90"
        origin={`${SHUTTER_OUTER / 2}, ${SHUTTER_OUTER / 2}`}
      />
    </Svg>
  );
}

// ─── Mode Rail ────────────────────────────────────────────────────────────────

function ModeRail({
  active,
  isRecording,
  onChange,
}: {
  active: UploadMode;
  isRecording: boolean;
  onChange: (m: UploadMode) => void;
}) {
  const activeIdx = MODES.indexOf(active);
  const modeColor = MODE_COLOR[active];
  const flatRef = useRef<FlatList>(null);
  const ITEM_W = 90;

  useEffect(() => {
    flatRef.current?.scrollToIndex({
      index: activeIdx,
      animated: true,
      viewPosition: 0.5,
    });
  }, [activeIdx]);

  return (
    <View style={rail.wrap}>
      <FlatList
        ref={flatRef}
        data={MODES}
        keyExtractor={(m) => m}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={!isRecording}
        contentContainerStyle={{ paddingHorizontal: SW / 2 - ITEM_W / 2 }}
        getItemLayout={(_, i) => ({ length: ITEM_W, offset: ITEM_W * i, index: i })}
        renderItem={({ item, index }) => {
          const dist = Math.abs(index - activeIdx);
          const isActive = item === active;
          const opacity = dist === 0 ? 1 : dist === 1 ? 0.55 : 0.2;
          const color = isActive ? (isRecording ? modeColor : '#fff') : 'rgba(255,255,255,1)';

          return (
            <TouchableOpacity
              style={[rail.item, { width: ITEM_W, opacity }]}
              onPress={() => !isRecording && onChange(item)}
              activeOpacity={0.7}
            >
              <Text style={[rail.text, { color }]}>{item}</Text>
              {isActive && (
                <View
                  style={[
                    rail.underline,
                    { backgroundColor: isRecording ? modeColor : '#fff' },
                  ]}
                />
              )}
            </TouchableOpacity>
          );
        }}
      />
      {/* Fade overlays */}
      <View style={[rail.fadeL, { pointerEvents: 'none' }]} />
      <View style={[rail.fadeR, { pointerEvents: 'none' }]} />
    </View>
  );
}

// ─── Preview Screen Component ─────────────────────────────────────────────────

function PreviewScreen({
  uri,
  mediaType,
  mode,
  onBack,
}: {
  uri: string;
  mediaType: 'image' | 'video';
  mode: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  
  // ✅ NEW: Post metadata state
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private' | 'friends'>('public');
  const [showVisibilityPicker, setShowVisibilityPicker] = useState(false);

  const handleAddHashtag = () => {
    const trimmed = hashtagInput.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      setHashtagInput('#' + trimmed);
      return;
    }
    
    if (trimmed && !hashtags.includes(trimmed)) {
      setHashtags([...hashtags, trimmed]);
      setHashtagInput('');
    }
  };

  const handleRemoveHashtag = (tag: string) => {
    setHashtags(hashtags.filter(h => h !== tag));
  };

  const handleUpload = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsUploading(true);
    setUploadProgress('Uploading...');

    try {
      // Extract filename from URI
      const fileName = uri.split('/').pop() || `media-${Date.now()}.${mediaType === 'video' ? 'mp4' : 'jpg'}`;

      console.log('[PreviewScreen] Starting upload:', { uri, mediaType, mode, fileName, caption, hashtags, visibility });

      // Upload using the upload service with user-provided metadata
      setUploadProgress('Processing media...');
      const result = await handleMediaUpload(
        uri,
        mediaType as 'image' | 'video',
        fileName,
        mode as any, // Mode is already validated from the screen
        {
          caption: caption.trim(),
          hashtags: hashtags,
          visibility: visibility,
          location: undefined,
        }
      );

      if (result.success) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setUploadProgress('');
        Alert.alert(
          'Success',
          `${mode} ${mediaType} uploaded successfully!`,
          [
            {
              text: 'Done',
              onPress: () => router.push('/(tabs)'),
            },
          ]
        );
      } else {
        throw new Error(result.message || 'Upload failed');
      }
    } catch (error: any) {
      console.error('[PreviewScreen] Upload error:', error);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setUploadProgress('');

      const errorMessage =
        error?.message ||
        error?.response?.data?.message ||
        'Failed to upload media. Please try again.';

      Alert.alert('Upload Failed', errorMessage);
    } finally {
      setIsUploading(false);
      setUploadProgress('');
    }
  };

  const handleDiscard = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onBack();
  };

  return (
    <View style={previewStyles.root}>
      <StatusBar barStyle="light-content" />

      {/* Media preview */}
      <View style={previewStyles.mediaContainer}>
        {mediaType === 'image' ? (
          <Image source={{ uri }} style={previewStyles.media} />
        ) : (
          <Video
            source={{ uri }}
            style={previewStyles.media}
            useNativeControls
            shouldPlay={false}
          />
        )}
      </View>

      {/* ✅ NEW: Post metadata editor - overlaid on bottom half of media */}
      <View style={previewStyles.metadataOverlay}>
        <ScrollView 
          style={previewStyles.metadataContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Caption Input */}
          <View style={previewStyles.section}>
            <Text style={previewStyles.sectionLabel}>Caption</Text>
            <TextInput
              style={previewStyles.captionInput}
              placeholder="Add a caption..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={caption}
              onChangeText={setCaption}
              multiline
              maxLength={2200}
              editable={!isUploading}
            />
            <Text style={previewStyles.charCount}>
              {caption.length} / 2200
            </Text>
          </View>

          {/* Hashtags */}
          <View style={previewStyles.section}>
            <Text style={previewStyles.sectionLabel}>Hashtags</Text>
            <View style={previewStyles.hashtagInputRow}>
              <TextInput
                style={previewStyles.hashtagInput}
                placeholder="Add a hashtag"
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={hashtagInput}
                onChangeText={setHashtagInput}
                editable={!isUploading}
                returnKeyType="done"
                onSubmitEditing={handleAddHashtag}
              />
              <TouchableOpacity 
                style={previewStyles.addHashtagBtn}
                onPress={handleAddHashtag}
                disabled={!hashtagInput.trim() || isUploading}
              >
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            {hashtags.length > 0 && (
              <View style={previewStyles.hashtagsList}>
                {hashtags.map((tag, idx) => (
                  <View key={idx} style={previewStyles.hashtagTag}>
                    <Text style={previewStyles.hashtagText}>{tag}</Text>
                    <TouchableOpacity 
                      onPress={() => handleRemoveHashtag(tag)}
                      disabled={isUploading}
                    >
                      <Ionicons name="close" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Visibility */}
          <View style={previewStyles.section}>
            <Text style={previewStyles.sectionLabel}>Visibility</Text>
            <TouchableOpacity 
              style={previewStyles.visibilitySelector}
              onPress={() => setShowVisibilityPicker(true)}
              disabled={isUploading}
            >
              <Ionicons 
                name={
                  visibility === 'public' ? 'globe' : 
                  visibility === 'friends' ? 'people' : 
                  'lock-closed'
                } 
                size={18} 
                color="#fff" 
              />
              <Text style={previewStyles.visibilityLabel}>
                {visibility.charAt(0).toUpperCase() + visibility.slice(1)}
              </Text>
              <Ionicons name="chevron-down" size={18} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>

      {/* Top controls */}
      <SafeAreaView edges={['top']} style={previewStyles.topBar}>
        <TouchableOpacity style={previewStyles.iconCircle} onPress={handleDiscard}>
          <Ionicons name="close" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <Text style={previewStyles.modeLabel}>{mode}</Text>
      </SafeAreaView>

      {/* Bottom controls */}
      <SafeAreaView edges={['bottom']} style={previewStyles.bottomBar}>
        <TouchableOpacity
          style={[previewStyles.actionBtn, previewStyles.discardBtn]}
          onPress={handleDiscard}
          disabled={isUploading}
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={previewStyles.btnText}>Discard</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[previewStyles.actionBtn, previewStyles.uploadBtn]}
          onPress={handleUpload}
          disabled={isUploading}
        >
          {isUploading ? (
            <>
              <ActivityIndicator size="small" color="#000" />
              <Text style={[previewStyles.btnText, previewStyles.uploadBtnText]}>
                {uploadProgress || 'Uploading...'}
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={20} color="#000" />
              <Text style={[previewStyles.btnText, previewStyles.uploadBtnText]}>
                Upload
              </Text>
            </>
          )}
        </TouchableOpacity>
      </SafeAreaView>

      {/* ✅ NEW: Visibility Picker Modal */}
      <Modal
        visible={showVisibilityPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowVisibilityPicker(false)}
      >
        <TouchableOpacity 
          style={previewStyles.modalOverlay}
          onPress={() => setShowVisibilityPicker(false)}
          activeOpacity={1}
        >
          <View style={previewStyles.visibilityPickerContainer}>
            {(['public', 'friends', 'private'] as const).map((option) => (
              <TouchableOpacity
                key={option}
                style={previewStyles.visibilityOption}
                onPress={() => {
                  setVisibility(option);
                  setShowVisibilityPicker(false);
                }}
              >
                <Ionicons 
                  name={
                    option === 'public' ? 'globe' : 
                    option === 'friends' ? 'people' : 
                    'lock-closed'
                  } 
                  size={20} 
                  color="#fff" 
                />
                <Text style={previewStyles.visibilityOptionLabel}>
                  {option === 'public' ? 'Public' :
                   option === 'friends' ? 'Friends' :
                   'Private'}
                </Text>
                {visibility === option && (
                  <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  fallbackContent: {
    alignItems: 'center',
    maxWidth: 300,
  },
  fallbackIcon: {
    marginBottom: 24,
  },
  fallbackTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  fallbackMessage: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  fallbackButton: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    gap: 8,
    width: '100%',
    justifyContent: 'center',
  },
  fallbackButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
});

const previewStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  mediaContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  media: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 20,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 20,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  discardBtn: {
    backgroundColor: 'rgba(255,59,48,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.6)',
  },
  uploadBtn: {
    backgroundColor: '#fff',
  },
  btnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  uploadBtnText: {
    color: '#000',
  },

  // ✅ NEW: Metadata Editor Styles
  metadataOverlay: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    height: '55%',
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 10,
  },
  metadataContainer: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
    textTransform: 'uppercase',
    opacity: 0.7,
  },
  captionInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    minHeight: 80,
  },
  charCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
    textAlign: 'right',
  },
  hashtagInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  hashtagInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  addHashtagBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(16,185,129,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hashtagsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  hashtagTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16,185,129,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.4)',
  },
  hashtagText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  visibilitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  visibilityLabel: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },

  // ✅ NEW: Visibility Picker Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  visibilityPickerContainer: {
    backgroundColor: '#1F2937',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 0,
  },
  visibilityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    gap: 12,
  },
  visibilityOptionLabel: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
});

const cameraStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  // Permission
  permWrap: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 36,
    gap: 12,
  },
  permTitle: { fontSize: 22, fontWeight: '700', color: '#fff', marginTop: 12 },
  permSub: { fontSize: 15, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 22 },
  permBtn: { marginTop: 20, backgroundColor: '#fff', borderRadius: 30, paddingHorizontal: 36, paddingVertical: 14 },
  permBtnText: { fontSize: 16, fontWeight: '700', color: '#000' },

  // Top bar
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 30,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  recDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#FF3B30' },
  recTime: { fontSize: 13, color: '#fff', fontWeight: '600' },
  flashPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  flashLabel: { fontSize: 13, fontWeight: '500' },

  // Left strip
  leftStrip: {
    position: 'absolute',
    left: 12,
    flexDirection: 'column',
    zIndex: 20,
  },
  leftToolWrap: { alignItems: 'center', marginBottom: 10 },
  leftToolBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftToolBtnOn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  leftToolLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '500',
    marginTop: 3,
    textAlign: 'center',
  },

  // Zoom
  zoomPill: {
    position: 'absolute',
    alignSelf: 'center',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    zIndex: 20,
  },
  zoomBtn: { paddingHorizontal: 14, paddingVertical: 7 },
  zoomText: { fontSize: 13, color: 'rgba(255,255,255,0.38)', fontWeight: '600' },

  // Bottom
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20 },

  // Shutter row
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 30,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  sideBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideBtnDim: { opacity: 0.28 },

  shutterOuter: {
    width: SHUTTER_OUTER,
    height: SHUTTER_OUTER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: SHUTTER_OUTER / 2,
    borderWidth: 3,
  },
  shutterTouchable: {
    width: SHUTTER_INNER,
    height: SHUTTER_INNER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: SHUTTER_INNER, height: SHUTTER_INNER },

  galleryBtn: {
    width: 50,
    height: 50,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  galleryImg: { width: '100%', height: '100%' },
  galleryEmpty: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  hint: {
    textAlign: 'center',
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.28)',
    fontWeight: '500',
    marginBottom: 4,
    marginTop: 6,
  },
});

const rail = StyleSheet.create({
  wrap: { height: 40, position: 'relative', overflow: 'hidden' },
  item: { alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  text: { fontSize: 13, fontWeight: '600', letterSpacing: 0.1 },
  underline: { width: 20, height: 2.5, borderRadius: 2, marginTop: 3 },
  fadeL: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 72,
    backgroundColor: 'rgba(0,0,0,0)',
  },
  fadeR: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 72,
    backgroundColor: 'rgba(0,0,0,0)',
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function UploadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    uri?: string;
    mediaType?: 'image' | 'video';
    mode?: string;
  }>();

  // If we have preview params, show preview screen
  if (params.uri && params.mediaType) {
    return (
      <PreviewScreen
        uri={params.uri}
        mediaType={params.mediaType}
        mode={params.mode || 'Post'}
        onBack={() => router.back()}
      />
    );
  }

  // ⚠️ Camera module not available - show gallery-only interface
  if (!cameraModuleAvailable) {
    return <GalleryOnlyFallback />;
  }

  return <CameraUploadScreenContent />;
}

/**
 * PRODUCTION FALLBACK: Gallery-only upload interface
 * Used when camera module is not available
 */
function GalleryOnlyFallback() {
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const colors = { background: '#000', tint: '#007AFF', text: '#FFF', textMuted: '#999' };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        // ✅ FIX: Use setParams() to trigger PreviewScreen via useLocalSearchParams()
        router.setParams({
          uri: asset.uri,
          mediaType: asset.type === 'video' ? 'video' : 'image',
          mode: 'Post',
        });
      }
    } catch (error) {
      console.error('[Upload] Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  return (
    <SafeAreaView style={[styles.fallbackContainer, { backgroundColor: colors.background }]}>
      <View style={styles.fallbackContent}>
        <Ionicons name="camera" size={64} color={colors.tint} style={styles.fallbackIcon} />

        <Text style={[styles.fallbackTitle, { color: colors.text }]}>
          Camera Unavailable
        </Text>

        <Text style={[styles.fallbackMessage, { color: colors.textMuted }]}>
          Camera feature is not available on your device. You can upload media from your gallery.
        </Text>

        <TouchableOpacity
          style={[styles.fallbackButton, { backgroundColor: colors.tint }]}
          onPress={pickImage}
          activeOpacity={0.8}
        >
          <Ionicons name="images" size={20} color="white" />
          <Text style={styles.fallbackButtonText}>Choose from Gallery</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

/**
 * MAIN CAMERA UPLOAD SCREEN
 * Only rendered when camera module is available
 */
function CameraUploadScreenContent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<any>(null);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [, requestMicPermission] = useMicrophonePermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();

  const [facing, setFacing] = useState<any>('back');
  const [flash, setFlash] = useState<FlashMode>('auto');
  const [zoom, setZoom] = useState(0);
  const [activeMode, setActiveMode] = useState<UploadMode>('Post');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [galleryThumb, setGalleryThumb] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);

  // Animated values
  const recordingProgress = useRef(new Animated.Value(0)).current;
  const shutterScale = useRef(new Animated.Value(1)).current;
  const innerScale = useRef(new Animated.Value(1)).current;
  const innerRadius = useRef(new Animated.Value(SHUTTER_INNER / 2)).current;
  const leftOpacity = useRef(new Animated.Value(1)).current;

  const recordAnim = useRef<Animated.CompositeAnimation | null>(null);
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHolding = useRef(false);

  // ── Init ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      await requestCameraPermission();
      await requestMicPermission();
      const mp = await requestMediaPermission();
      if (mp.granted) {
        const { assets } = await MediaLibrary.getAssetsAsync({
          first: 1,
          sortBy: 'creationTime',
          mediaType: ['photo', 'video'],
        });
        if (assets[0]) setGalleryThumb(assets[0].uri);
      }
    })();
    return () => {
      recordAnim.current?.stop();
      if (recordTimer.current) clearInterval(recordTimer.current);
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, []);

  // ── Flash ──────────────────────────────────────────────────────────────────

  const cycleFlash = () =>
    setFlash((f) => (f === 'auto' ? 'on' : f === 'on' ? 'off' : 'auto'));

  const flashIcon: any =
    flash === 'on' ? 'flash' : flash === 'off' ? 'flash-off' : 'flash-outline';
  const flashColor = flash === 'on' ? '#FFD700' : 'rgba(255,255,255,0.85)';

  // ── Timer ──────────────────────────────────────────────────────────────────

  const startTimer = (maxSec: number) => {
    setRecordingSeconds(0);
    recordingProgress.setValue(0);
    recordAnim.current = Animated.timing(recordingProgress, {
      toValue: 1,
      duration: maxSec * 1000,
      useNativeDriver: false,
    });
    recordAnim.current.start(({ finished }) => {
      if (finished) stopRecording();
    });
    recordTimer.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
  };

  const clearTimer = () => {
    recordAnim.current?.stop();
    if (recordTimer.current) clearInterval(recordTimer.current);
    recordingProgress.setValue(0);
    setRecordingSeconds(0);
  };

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ── Shutter animations ─────────────────────────────────────────────────────

  const toRecordState = () =>
    Animated.parallel([
      Animated.spring(shutterScale, { toValue: 0.88, useNativeDriver: true }),
      Animated.spring(innerScale, { toValue: 0.42, useNativeDriver: true }),
      Animated.spring(innerRadius, { toValue: 10, useNativeDriver: false }),
      Animated.timing(leftOpacity, { toValue: 0.25, duration: 200, useNativeDriver: true }),
    ]).start();

  const toIdleState = () =>
    Animated.parallel([
      Animated.spring(shutterScale, { toValue: 1, useNativeDriver: true }),
      Animated.spring(innerScale, { toValue: 1, useNativeDriver: true }),
      Animated.spring(innerRadius, { toValue: SHUTTER_INNER / 2, useNativeDriver: false }),
      Animated.timing(leftOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

  // ── Photo ──────────────────────────────────────────────────────────────────

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Quick flash animation
    Animated.sequence([
      Animated.timing(shutterScale, { toValue: 0.88, duration: 60, useNativeDriver: true }),
      Animated.timing(shutterScale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (photo) {
        router.push({
          pathname: '/(tabs)/upload',
          params: { uri: photo.uri, mediaType: 'image', mode: activeMode },
        });
      }
    } catch (e) {
      console.error('[Camera] takePhoto', e);
    }
  };

  // ── Video ──────────────────────────────────────────────────────────────────

  const startRecording = async () => {
    if (!cameraRef.current || isRecording) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsRecording(true);
    toRecordState();
    const max = MODE_MAX_DURATION[activeMode];
    startTimer(max);
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: max });
      if (video) {
        router.push({
          pathname: '/(tabs)/upload',
          params: { uri: video.uri, mediaType: 'video', mode: activeMode },
        });
      }
    } catch (e) {
      console.error('[Camera] recordAsync', e);
      setIsRecording(false);
      toIdleState();
      clearTimer();
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    cameraRef.current?.stopRecording();
    setIsRecording(false);
    toIdleState();
    clearTimer();
  };

  // ── Press handlers ─────────────────────────────────────────────────────────

  const onPressIn = () => {
    isHolding.current = false;
    holdTimer.current = setTimeout(() => {
      isHolding.current = true;
      startRecording();
    }, 200);
  };

  const onPressOut = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (isHolding.current && isRecording) stopRecording();
  };

  const onPress = () => {
    if (!isRecording && !isHolding.current) takePhoto();
  };

  // ── Gallery ────────────────────────────────────────────────────────────────

  const openGallery = async () => {
    if (isRecording) return;
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'] as ImagePicker.MediaType[],
      allowsEditing: true,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      // ✅ FIX: Use setParams() instead of push() since we're updating the current route
      // This ensures useLocalSearchParams() is triggered and PreviewScreen is shown
      router.setParams({
        uri: a.uri,
        mediaType: a.type === 'video' ? 'video' : 'image',
        mode: activeMode,
      });
    }
  };

  // ── Permission screen ──────────────────────────────────────────────────────

  if (!cameraPermission?.granted) {
    return (
      <View style={cameraStyles.permWrap}>
        <Ionicons name="camera-outline" size={52} color="rgba(255,255,255,0.3)" />
        <Text style={cameraStyles.permTitle}>Camera access needed</Text>
        <Text style={cameraStyles.permSub}>
          Allow camera permission to take photos and record videos.
        </Text>
        <TouchableOpacity style={cameraStyles.permBtn} onPress={requestCameraPermission}>
          <Text style={cameraStyles.permBtnText}>Allow camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const modeColor = MODE_COLOR[activeMode];
  const isVideoMode = ['Flick', 'Long Video', 'Freehand'].includes(activeMode);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={cameraStyles.root}>
      <StatusBar barStyle="light-content" />

      {/* Camera viewfinder */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        flash={flash}
        zoom={zoom}
        mode={isRecording || isVideoMode ? 'video' : 'picture'}
      />

      {/* ── TOP BAR ──────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={cameraStyles.topBar}>
        {/* X — top LEFT corner */}
        <TouchableOpacity style={cameraStyles.iconCircle} onPress={() => router.back()}>
          <Ionicons name="close" size={20} color="#fff" />
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        {/* REC indicator while recording; flash control otherwise */}
        {isRecording ? (
          <View style={cameraStyles.recPill}>
            <View style={cameraStyles.recDot} />
            <Text style={cameraStyles.recTime}>{fmtTime(recordingSeconds)}</Text>
          </View>
        ) : (
          <TouchableOpacity style={cameraStyles.flashPill} onPress={cycleFlash}>
            <Ionicons name={flashIcon} size={15} color={flashColor} />
            <Text style={[cameraStyles.flashLabel, { color: flashColor }]}>
              {flash.charAt(0).toUpperCase() + flash.slice(1)}
            </Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>

      {/* ── LEFT VERTICAL TOOL STRIP ─────────────────────── */}
      <Animated.View
        style={[
          cameraStyles.leftStrip,
          { top: insets.top + 72, opacity: leftOpacity, pointerEvents: isRecording ? 'none' : 'auto' },
        ]}
      >
        {LEFT_TOOLS.map((tool) => (
          <TouchableOpacity
            key={tool.id}
            style={cameraStyles.leftToolWrap}
            onPress={() => {
              Haptics.selectionAsync();
              setActiveTool((p) => (p === tool.id ? null : tool.id));
            }}
          >
            <View style={[cameraStyles.leftToolBtn, activeTool === tool.id && cameraStyles.leftToolBtnOn]}>
              <Ionicons name={tool.icon as any} size={20} color="#fff" />
            </View>
            <Text style={cameraStyles.leftToolLabel}>{tool.label}</Text>
          </TouchableOpacity>
        ))}
      </Animated.View>

      {/* ── ZOOM PILL ──────────────────────────────────────── */}
      <View style={[cameraStyles.zoomPill, { bottom: insets.bottom + 210 }]}>
        {[
          { label: '0.5×', val: 0 },
          { label: '1×', val: 0.5 },
          { label: '2×', val: 1 },
        ].map((z) => (
          <TouchableOpacity key={z.label} style={cameraStyles.zoomBtn} onPress={() => setZoom(z.val)}>
            <Text
              style={[cameraStyles.zoomText, zoom === z.val && { color: isRecording ? modeColor : '#FFD700' }]}
            >
              {z.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── BOTTOM ─────────────────────────────────────────── */}
      <View style={[cameraStyles.bottom, { paddingBottom: insets.bottom + 18 }]}>
        {/* Row: [Flip] [Shutter] [Gallery] */}
        <View style={cameraStyles.shutterRow}>
          {/* Flip camera — left of shutter */}
          <TouchableOpacity
            style={[cameraStyles.sideBtn, isRecording && cameraStyles.sideBtnDim]}
            disabled={isRecording}
            onPress={() => setFacing((f: any) => (f === 'back' ? 'front' : 'back'))}
          >
            <Ionicons name="camera-reverse-outline" size={26} color="#fff" />
          </TouchableOpacity>

          {/* Shutter */}
          <Animated.View style={[cameraStyles.shutterOuter, { transform: [{ scale: shutterScale }] }]}>
            {isRecording ? (
              <ArcProgress progress={recordingProgress} color={modeColor} />
            ) : (
              <View style={[cameraStyles.shutterRing, { borderColor: modeColor }]} />
            )}
            <TouchableOpacity
              activeOpacity={1}
              onPress={onPress}
              onPressIn={onPressIn}
              onPressOut={onPressOut}
              style={cameraStyles.shutterTouchable}
            >
              <Animated.View
                style={[
                  cameraStyles.shutterInner,
                  {
                    transform: [{ scale: innerScale }],
                    borderRadius: innerRadius,
                    backgroundColor: isRecording ? '#FF3B30' : '#fff',
                  },
                ]}
              />
            </TouchableOpacity>
          </Animated.View>

          {/* Gallery — right of shutter */}
          <TouchableOpacity
            style={[cameraStyles.galleryBtn, isRecording && cameraStyles.sideBtnDim]}
            disabled={isRecording}
            onPress={openGallery}
          >
            {galleryThumb ? (
              <Image source={{ uri: galleryThumb }} style={cameraStyles.galleryImg} />
            ) : (
              <View style={[cameraStyles.galleryImg, cameraStyles.galleryEmpty]}>
                <Ionicons name="images-outline" size={20} color="rgba(255,255,255,0.6)" />
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Mode rail — BELOW shutter */}
        <ModeRail
          active={activeMode}
          isRecording={isRecording}
          onChange={(m) => {
            Haptics.selectionAsync();
            setActiveMode(m);
          }}
        />

        {/* Hint text */}
        <Text style={[cameraStyles.hint, isRecording && { color: modeColor, opacity: 0.75 }]}>
          {isRecording ? 'Release to stop' : isVideoMode ? 'Hold shutter to record' : 'Tap · Hold to record video'}
        </Text>
      </View>
    </View>
  );
}
