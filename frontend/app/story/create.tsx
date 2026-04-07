import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Dimensions,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Video } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { uploadStory as createStory } from '@/services/storyService';
import { uploadStoryImage, uploadStoryVideo, detectMediaTypeFromAsset } from '@/services/mediaService';
import { useTheme } from '@/hooks/use-theme-color';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface TextOverlay {
  id: string;
  text: string;
  fontSize: number;
  color: string;
  x: number;
  y: number;
  rotation: number;
}

interface Drawing {
  points: Array<{ x: number; y: number }>;
  color: string;
  strokeWidth: number;
  opacity: number;
}

export default function StoryCamera() {
  const router = useRouter();
  const theme = useTheme();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [galleryPermission, requestGalleryPermission] =
    ImagePicker.useMediaLibraryPermissions();

  const [mode, setMode] = useState<'camera' | 'gallery' | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [showTextEditor, setShowTextEditor] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [currentColor, setCurrentColor] = useState('#FFFFFF');
  const [fontSize, setFontSize] = useState(24);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);

  const colors = [
    '#FFFFFF',
    '#000000',
    '#FF0000',
    '#00FF00',
    '#0000FF',
    '#FFFF00',
    '#FF00FF',
    '#00FFFF',
    '#FFA500',
    '#800080',
    '#FFC0CB',
    '#A52A2A'
  ];

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
    if (!galleryPermission?.granted) {
      requestGalleryPermission();
    }
  }, []);

  const takePicture = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8
      });
      setCapturedImage(photo.uri);
      setMediaType('image'); // Camera always captures images
      setMode(null);
    }
  };

  const startRecording = async () => {
    if (cameraRef.current && !isRecording) {
      try {
        setIsRecording(true);
        setRecordingDuration(0);
        
        // Start timer to track recording duration
        recordingIntervalRef.current = setInterval(() => {
          setRecordingDuration(prev => {
            const newDuration = prev + 1;
            // Auto-stop at 60 seconds (story limit)
            if (newDuration >= 60) {
              stopRecording();
            }
            return newDuration;
          });
        }, 1000) as unknown as NodeJS.Timeout;

        // Start video recording
        const video = await cameraRef.current.recordAsync({
          maxDuration: 60 // Max 60 seconds for stories
        });
        
        if (video) {
          setCapturedImage(video.uri);
          setMediaType('video');
          setMode(null);
        }
      } catch (error) {
        console.error('[startRecording] Error:', error);
        Alert.alert('Error', 'Failed to record video');
        setIsRecording(false);
        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current);
        }
      }
    }
  };

  const stopRecording = async () => {
    if (cameraRef.current && isRecording) {
      try {
        // Stop recording - the promise from recordAsync will resolve with the video data
        setIsRecording(false);
        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current);
        }
      } catch (error) {
        console.error('[stopRecording] Error:', error);
      }
    }
  };

  const pickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: false,
        aspect: [9, 16],
        quality: 0.8
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        const detectedType = detectMediaTypeFromAsset(asset);
        
        setCapturedImage(asset.uri);
        setMediaType(detectedType);
        console.log('[pickFromGallery] Selected media:', { uri: asset.uri, type: detectedType });
        setMode(null);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick media from gallery');
    }
  };

  const addTextOverlay = () => {
    if (!textInput.trim()) {
      Alert.alert('Error', 'Please enter text');
      return;
    }

    const newText: TextOverlay = {
      id: Date.now().toString(),
      text: textInput,
      fontSize,
      color: currentColor,
      x: screenWidth / 2,
      y: screenHeight / 2,
      rotation: 0
    };

    setTextOverlays([...textOverlays, newText]);
    setTextInput('');
    setShowTextEditor(false);
  };

  const removeTextOverlay = (id: string) => {
    setTextOverlays(textOverlays.filter((text) => text.id !== id));
  };

  const updateTextOverlay = (
    id: string,
    updates: Partial<TextOverlay>
  ) => {
    setTextOverlays(
      textOverlays.map((text) => (text.id === id ? { ...text, ...updates } : text))
    );
  };

  const handleUploadStory = async () => {
    if (!capturedImage) {
      Alert.alert('Error', 'No media selected');
      return;
    }

    setIsUploading(true);
    try {
      // Step 1: Upload story media (image or video) to Cloudinary/S3 via backend
      // Uses dedicated endpoints for correct folder mapping
      console.log('[handleUploadStory] Starting story upload:', { uri: capturedImage, type: mediaType });
      
      let uploadResult;
      
      if (mediaType === 'video') {
        const fileName = `story-video-${Date.now()}.mp4`;
        uploadResult = await uploadStoryVideo(capturedImage, fileName);
        console.log('[handleUploadStory] Story video uploaded successfully:', uploadResult);
      } else {
        const fileName = `story-${Date.now()}.jpg`;
        uploadResult = await uploadStoryImage(capturedImage, fileName);
        console.log('[handleUploadStory] Story image uploaded successfully:', uploadResult);
      }

      if (!uploadResult.success || !uploadResult.url || !uploadResult.publicId) {
        throw new Error(`Story ${mediaType} upload failed: missing url or publicId`);
      }

      // Step 2: Sanitize text overlays — only include text content, NOT position/rotation
      // Position and rotation are ephemeral UI concerns, not persisted data
      const sanitizedTextOverlay = textOverlays.map(overlay => ({
        id: overlay.id,
        text: overlay.text,
        fontSize: overlay.fontSize,
        color: overlay.color
        // x, y, rotation intentionally excluded
      }));

      // Step 3: Create story record with cloud URL and publicId
      const storyResponse = await createStory({
        mediaUrl: uploadResult.url,          // Cloudinary secure_url
        mediaPublicId: uploadResult.publicId, // Cloudinary public_id for deletion
        mediaType: mediaType,
        textOverlay: sanitizedTextOverlay,
        drawings: []
      });

      if (storyResponse.success) {
        Alert.alert('Success', 'Story posted successfully');
        router.back();
      } else {
        throw new Error(storyResponse.message || 'Failed to create story');
      }
    } catch (error) {
      console.error('[handleUploadStory] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload story';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  if (!permission?.granted) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.text }}>
          Camera permission is required
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={requestPermission}
        >
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Camera view
  if (!capturedImage) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {mode === 'camera' ? (
          <>
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing="front"
            />
            <View style={styles.bottomControls}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  setMode(null);
                  if (isRecording) {
                    stopRecording();
                  }
                }}
              >
                <Ionicons name="close" size={32} color="#FFF" />
              </TouchableOpacity>

              {/* Photo capture button */}
              {!isRecording ? (
                <TouchableOpacity
                  style={styles.captureButton}
                  onPress={takePicture}
                >
                  <View style={styles.captureCircle} />
                </TouchableOpacity>
              ) : null}

              {/* Video recording button */}
              {isRecording ? (
                <View style={styles.recordingContainer}>
                  <TouchableOpacity
                    style={[styles.recordButton, styles.recordingActive]}
                    onPress={stopRecording}
                  >
                    <View style={styles.recordingSquare} />
                  </TouchableOpacity>
                  <Text style={styles.recordingTimer}>
                    {Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, '0')}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.recordButton}
                  onPress={startRecording}
                >
                  <View style={styles.recordingCircle} />
                </TouchableOpacity>
              )}

              <View style={styles.spacer} />
            </View>
          </>
        ) : (
          <View style={styles.modeSelector}>
            <Text style={[styles.title, { color: theme.text }]}>
              Create a Story
            </Text>
            <TouchableOpacity
              style={[styles.modeButton, { borderColor: theme.tint }]}
              onPress={() => setMode('camera')}
            >
              <Ionicons name="camera" size={40} color={theme.tint} />
              <Text style={[styles.modeButtonText, { color: theme.text }]}>
                Take Photo
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, { borderColor: theme.tint }]}
              onPress={pickFromGallery}
            >
              <Ionicons name="image" size={40} color={theme.tint} />
              <Text style={[styles.modeButtonText, { color: theme.text }]}>
                Choose from Library
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // Editor view
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.editorContainer}>
        {mediaType === 'video' ? (
          <Video
            source={{ uri: capturedImage }}
            style={styles.mediaPreview}
            useNativeControls
            isLooping
            progressUpdateIntervalMillis={500}
          />
        ) : (
          <Image
            source={{ uri: capturedImage }}
            style={styles.mediaPreview}
          />
        )}
        {/* Text overlays */}
        {textOverlays.map((text) => (
          <TouchableOpacity
            key={text.id}
            style={[
              styles.textOverlay,
              {
                left: text.x,
                top: text.y,
                transform: [{ rotate: `${text.rotation}deg` }]
              }
            ]}
            onPress={() => setSelectedTextId(text.id)}
          >
            <Text
              style={[
                styles.overlayText,
                {
                  fontSize: text.fontSize,
                  color: text.color,
                  borderColor: selectedTextId === text.id ? '#00FF00' : 'transparent',
                  borderWidth: selectedTextId === text.id ? 2 : 0
                }
              ]}
            >
              {text.text}
            </Text>
            {selectedTextId === text.id && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => removeTextOverlay(text.id)}
              >
                <Ionicons name="trash" size={16} color="#FFF" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Controls */}
      <View style={styles.editorControls}>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => setShowTextEditor(!showTextEditor)}
        >
          <Ionicons name="text" size={24} color={theme.tint} />
          <Text style={[styles.controlText, { color: theme.text }]}>
            Add Text
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => {
            setCapturedImage(null);
            setMediaType('image');
            setTextOverlays([]);
          }}
        >
          <Ionicons name="reload" size={24} color={theme.tint} />
          <Text style={[styles.controlText, { color: theme.text }]}>
            Retake
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, { opacity: isUploading ? 0.5 : 1 }]}
          onPress={handleUploadStory}
          disabled={isUploading}
        >
          {isUploading ? (
            <ActivityIndicator color={theme.tint} />
          ) : (
            <Ionicons name="send" size={24} color={theme.tint} />
          )}
          <Text style={[styles.controlText, { color: theme.text }]}>
            Post
          </Text>
        </TouchableOpacity>
      </View>

      {/* Text Editor Modal */}
      <Modal visible={showTextEditor} transparent animationType="slide">
        <View style={[styles.modal, { backgroundColor: theme.background }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowTextEditor(false)}>
              <Ionicons name="close" size={28} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Add Text
            </Text>
            <TouchableOpacity onPress={addTextOverlay}>
              <Text style={{ color: theme.tint, fontSize: 16, fontWeight: 'bold' }}>
                Done
              </Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={[
              styles.textInput,
              {
                borderColor: theme.tint,
                color: theme.text,
                backgroundColor: theme.card
              }
            ]}
            placeholder="Enter text..."
            placeholderTextColor={theme.text + '66'}
            value={textInput}
            onChangeText={setTextInput}
            multiline
          />

          <View style={styles.fontSizeControl}>
            <Text style={{ color: theme.text }}>Font Size: {fontSize}</Text>
            <View style={styles.slider}>
              {[16, 20, 24, 32, 40, 48].map((size) => (
                <TouchableOpacity
                  key={size}
                  style={[
                    styles.sizeButton,
                    {
                      backgroundColor:
                        fontSize === size ? theme.tint : theme.card,
                      borderColor: theme.tint
                    }
                  ]}
                  onPress={() => setFontSize(size)}
                >
                  <Text style={{ color: theme.text, fontSize: 12 }}>
                    {size}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.colorPickerContainer}>
            <Text style={{ color: theme.text, marginBottom: 12 }}>
              Text Color
            </Text>
            <View style={styles.colorGrid}>
              {colors.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorOption,
                    {
                      backgroundColor: color,
                      borderColor:
                        currentColor === color ? '#00FF00' : '#ccc',
                      borderWidth: currentColor === color ? 3 : 1
                    }
                  ]}
                  onPress={() => setCurrentColor(color)}
                />
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  camera: {
    flex: 1
  },
  bottomControls: {
    position: 'absolute',
    bottom: 30,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 30
  },
  closeButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.5)'
  },
  captureCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF0000'
  },
  recordButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FF0000',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.5)'
  },
  recordingActive: {
    backgroundColor: '#FF4444',
    borderWidth: 4,
    borderColor: 'rgba(255,0,0,0.7)'
  },
  recordingCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFF'
  },
  recordingSquare: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: '#FFF'
  },
  recordingContainer: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  recordingTimer: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 8
  },
  spacer: {
    width: 50
  },
  modeSelector: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 40
  },
  modeButton: {
    width: '80%',
    height: 120,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20
  },
  modeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    marginTop: 20
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600'
  },
  editorContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden'
  },
  mediaPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover'
  },
  textOverlay: {
    position: 'absolute'
  },
  overlayText: {
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 3
  },
  deleteButton: {
    position: 'absolute',
    top: -15,
    right: -15,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FF0000',
    justifyContent: 'center',
    alignItems: 'center'
  },
  editorControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 15,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0'
  },
  controlButton: {
    alignItems: 'center',
    padding: 10
  },
  controlText: {
    fontSize: 12,
    marginTop: 4
  },
  modal: {
    flex: 1,
    paddingTop: 20
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0'
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold'
  },
  textInput: {
    margin: 15,
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 16,
    minHeight: 100
  },
  fontSizeControl: {
    paddingHorizontal: 15,
    marginBottom: 20
  },
  slider: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10
  },
  sizeButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2
  },
  colorPickerContainer: {
    paddingHorizontal: 15,
    marginBottom: 30
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  colorOption: {
    width: '23%',
    height: 60,
    borderRadius: 8,
    marginBottom: 10
  }
});
