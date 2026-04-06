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
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { post } from '@/services/api';
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
      setMode(null);
    }
  };

  const pickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['photos', 'videos'],
        allowsEditing: false,
        aspect: [9, 16],
        quality: 0.8
      });

      if (!result.canceled) {
        setCapturedImage(result.assets[0].uri);
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

  const uploadStory = async () => {
    if (!capturedImage) {
      Alert.alert('Error', 'No image selected');
      return;
    }

    setIsUploading(true);
    try {
      // In production, upload image to S3 first and get URL
      // For now, using base64 or temporary local URL
      const mediaUrl = capturedImage;
      const mediaType = 'image';

      const response = await post('/stories', {
        mediaUrl,
        mediaType,
        textOverlay: textOverlays,
        drawings: []
      });

      if (response.success) {
        Alert.alert('Success', 'Story uploaded successfully');
        router.back();
      }
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Error', 'Failed to upload story');
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
                onPress={() => setMode(null)}
              >
                <Ionicons name="close" size={32} color="#FFF" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.captureButton}
                onPress={takePicture}
              >
                <View style={styles.captureCircle} />
              </TouchableOpacity>
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
        <Image
          source={{ uri: capturedImage }}
          style={styles.mediaPreview}
        />
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
          onPress={uploadStory}
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
              <Text style={{ color: theme.primary, fontSize: 16, fontWeight: 'bold' }}>
                Done
              </Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={[
              styles.textInput,
              {
                borderColor: theme.primary,
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
