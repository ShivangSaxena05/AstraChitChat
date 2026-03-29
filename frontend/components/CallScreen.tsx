import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image, Dimensions, Platform, Modal, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/hooks/use-theme-color';

let RTCView: any = null;
if (Platform.OS !== 'web') {
  try {
    RTCView = require('react-native-webrtc').RTCView;
  } catch (e) {
    console.log('RTCView load failed');
  }
}

const WebVideo = React.memo(
  ({ stream, isLocal, style }: { stream: any; isLocal: boolean; style: any }) => {
    const videoRef = useRef<any>(null);
    
    useEffect(() => {
      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream;
      }
    }, [stream]);

    return React.createElement('video', {
      ref: videoRef,
      autoPlay: true,
      playsInline: true,
      muted: isLocal,
      style: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        transform: isLocal ? 'scaleX(-1)' : 'none',
        ...style
      }
    });
  }
);

const { width, height } = Dimensions.get('window');

interface CallScreenProps {
  visible: boolean;
  status: 'incoming' | 'outgoing' | 'connecting' | 'connected';
  otherUser?: { username: string; profilePicture: string };
  localStream: any | null;
  remoteStream: any | null;
  isVideoEnabled: boolean;
  isMuted: boolean;
  isSpeaker: boolean;
  duration: number;
  videoUpgradeRequest: any | null;
  isVideoUpgradePending: boolean;
  callError?: string | null;
  onAccept: (video: boolean) => void;
  onDecline: () => void;
  onEnd: () => void;
  onMute: () => void;
  onSpeaker: () => void;
  onSwitchVideo: () => void;
  onUpgradeToVideo: () => void;
  onAcceptVideoUpgrade: () => void;
  onDeclineVideoUpgrade: () => void;
  onSwitchCamera: () => void;
  isVideoCallContext: boolean;
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

// ✅ FIX 4.2: Memoized Draggable Picture-in-Picture
const DraggablePIP = React.memo(
  ({ children, isVisible }: { children: React.ReactNode; isVisible: boolean }) => {
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);

    const panGesture = Gesture.Pan()
      .onChange((event) => {
        translateX.value += event.changeX;
        translateY.value += event.changeY;
      })
      .onEnd(() => {
        // Optional: Snap to edges. For now, we just leave it where dragged gently.
      });

    const animatedStyle = useAnimatedStyle(() => {
      return {
        opacity: withTiming(isVisible ? 1 : 0),
        transform: [
          { translateX: translateX.value },
          { translateY: translateY.value },
        ],
        zIndex: isVisible ? 10 : -1,
      };
    });

    return (
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.localVideoContainer, animatedStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    );
  }
);

export default function CallScreen(props: CallScreenProps) {
  const colors = useTheme();

  // ✅ FIX 4.3: Early return optimization
  if (!props.visible) {
    return null;
  }

  const isConnecting = props.status === 'connecting' || props.status === 'outgoing';

  // ✅ Show error alert if present
  useEffect(() => {
    if (props.callError && props.visible) {
      Alert.alert('Call Error', props.callError);
    }
  }, [props.callError, props.visible]);

  // ✅ FIX: Memoized button renderer to prevent unnecessary re-renders
  const renderButtons = useMemo(() => {
    if (props.status === 'incoming') {
      return (
        <View style={styles.incomingControls}>
          <TouchableOpacity 
            style={[styles.controlButton, { backgroundColor: colors.error }, styles.declineButton]} 
            onPress={props.onDecline}
          >
            <Ionicons name="close" size={32} color={colors.background} />
            <Text style={styles.controlText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.controlButton, { backgroundColor: colors.success }, styles.acceptButton]} 
            onPress={() => props.onAccept(props.isVideoCallContext)}
          >
            <Ionicons name="call" size={32} color={colors.background} />
            <Text style={styles.controlText}>Accept</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.activeControls}>
        <TouchableOpacity 
          style={[styles.iconButton, props.isMuted && styles.activeIcon]} 
          onPress={props.onMute}
          disabled={isConnecting}
          activeOpacity={isConnecting ? 1 : 0.7}
        >
          <Ionicons 
            name={props.isMuted ? "mic-off" : "mic"} 
            size={24} 
            color={colors.background} 
          />
        </TouchableOpacity>
        
        {!props.isVideoCallContext && !props.isVideoEnabled && (
          <TouchableOpacity 
            style={[styles.iconButton, props.isSpeaker && styles.activeIcon]} 
            onPress={props.onSpeaker}
            disabled={isConnecting}
            activeOpacity={isConnecting ? 1 : 0.7}
          >
            <Ionicons 
              name={props.isSpeaker ? "volume-high" : "volume-medium"} 
              size={24} 
              color={colors.background} 
            />
          </TouchableOpacity>
        )}

        <TouchableOpacity 
          style={[styles.iconButton, props.isVideoEnabled && styles.activeIcon]} 
          onPress={() => {
            if (props.isVideoCallContext || props.isVideoEnabled) {
              props.onSwitchVideo?.();
            } else if (!props.isVideoEnabled) {
              props.onUpgradeToVideo?.();
            }
          }}
          disabled={isConnecting}
          activeOpacity={isConnecting ? 1 : 0.7}
        >
          <Ionicons 
            name={props.isVideoEnabled ? "videocam" : "videocam-off"} 
            size={24} 
            color={colors.background} 
          />
        </TouchableOpacity>

        {props.isVideoEnabled && (
          <TouchableOpacity 
            style={styles.iconButton} 
            onPress={props.onSwitchCamera} 
            disabled={isConnecting}
            activeOpacity={isConnecting ? 1 : 0.7}
          >
            <Ionicons name="camera-reverse" size={24} color={colors.background} />
          </TouchableOpacity>
        )}

        <TouchableOpacity 
          style={[styles.iconButton, { backgroundColor: colors.error }, styles.endButton]} 
          onPress={props.onEnd}
        >
          <Ionicons 
            name="call" 
            size={24} 
            color={colors.background} 
            style={{ transform: [{ rotate: '135deg' }] }} 
          />
        </TouchableOpacity>
      </View>
    );
  }, [props.status, props.isMuted, props.isSpeaker, props.isVideoEnabled, props.isVideoCallContext, isConnecting, props.onMute, props.onSpeaker, props.onSwitchVideo, props.onUpgradeToVideo, props.onSwitchCamera, props.onEnd, colors]);

  return (
    <Modal visible={props.visible} animationType="fade" transparent={false}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        
        {/* Fullscreen Background Layer (Remote Video OR Fallback) */}
        <View style={StyleSheet.absoluteFill}>
           {(props.isVideoEnabled && props.remoteStream) ? (
             Platform.OS === 'web' ? (
               <WebVideo stream={props.remoteStream} isLocal={false} style={{}} />
             ) : RTCView ? (
               <RTCView
                 streamURL={props.remoteStream.toURL ? props.remoteStream.toURL() : ''}
                 style={[styles.remoteVideo, { backgroundColor: colors.background }]}
                 objectFit="cover"
               />
             ) : null
           ) : (
             <View style={[styles.fallbackBackground, { backgroundColor: colors.backgroundTertiary }]}>
                <Image
                  source={{ uri: props.otherUser?.profilePicture || 'https://i.pravatar.cc/300' }}
                  style={[styles.profileImageBlur, props.status === 'incoming' && { opacity: 0.5 }]}
                  blurRadius={props.isVideoEnabled ? 0 : 20}
                />
             </View>
           )}
        </View>

        {/* Local Video PIP Layer */}
        {props.status === 'connected' && (
          <DraggablePIP isVisible={props.isVideoEnabled}>
             {props.localStream && props.isVideoEnabled ? (
                Platform.OS === 'web' ? (
                  <WebVideo stream={props.localStream} isLocal={true} style={{}} />
                ) : RTCView ? (
                  <RTCView
                    streamURL={props.localStream.toURL ? props.localStream.toURL() : ''}
                    style={styles.localVideo}
                    objectFit="cover"
                    mirror={true}
                  />
                ) : null
             ) : (
                <View style={[styles.pipFallback, { backgroundColor: colors.backgroundSecondary }]}>
                   <Ionicons name="person" size={40} color={colors.text} />
                </View>
             )}
          </DraggablePIP>
        )}

        {/* Foreground Controls Layer */}
        <SafeAreaView style={styles.videoOverlay} pointerEvents="box-none">
          <View style={styles.header}>
            <Image
              source={{ uri: props.otherUser?.profilePicture || 'https://i.pravatar.cc/300' }}
              style={[styles.headerProfileImage, { borderColor: colors.tint }]}
            />
            <Text style={[styles.nameText, { color: colors.text }]}>{props.otherUser?.username || 'Unknown'}</Text>
            
            <View style={styles.statusContainer}>
              {isConnecting && <ActivityIndicator size="small" color={colors.success} style={{ marginRight: 8 }} />}
              <Text style={[styles.timerText, { color: colors.tint }]}>
                {props.status === 'incoming' ? 'Incoming Call...' : 
                isConnecting ? 'Connecting...' : 
                props.isVideoUpgradePending ? 'Requesting Video Upgrade...' :
                formatDuration(props.duration)}
              </Text>
            </View>
          </View>
          
          <View style={styles.controlsBottomWrapper}>
            {props.videoUpgradeRequest && !props.isVideoEnabled ? (
              <View style={styles.upgradeRequestBox}>
                 <Text style={styles.upgradeRequestText}>
                    {props.otherUser?.username || 'User'} is requesting to switch to a Video Call.
                 </Text>
                 <View style={styles.upgradeRequestActions}>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.error }]} onPress={props.onDeclineVideoUpgrade}>
                       <Text style={styles.actionBtnText}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.success }]} onPress={props.onAcceptVideoUpgrade}>
                       <Text style={styles.actionBtnText}>Accept</Text>
                    </TouchableOpacity>
                 </View>
              </View>
            ) : renderButtons}
          </View>
        </SafeAreaView>

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor will be applied dynamically
  },
  remoteVideo: {
    flex: 1,
    width: width,
    height: height,
    // backgroundColor will be applied dynamically
  },
  fallbackBackground: {
    flex: 1,
    // backgroundColor will be applied dynamically
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileImageBlur: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.3,
  },
  localVideoContainer: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 110,
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    // backgroundColor will be applied dynamically
    elevation: 10,
    shadowColor: 'rgba(0,0,0,0.3)', // Theme: shadow with transparency
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
  },
  localVideo: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  pipFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // backgroundColor will be applied dynamically
  },
  videoOverlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  headerProfileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
    borderWidth: 2,
    // borderColor will be applied dynamically
  },
  nameText: {
    fontSize: 24,
    fontWeight: '700',
    // color will be applied dynamically
  },
  timerText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 8,
    // color will be applied dynamically
  },
  controlsBottomWrapper: {
    paddingBottom: 40,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 20,
  },
  activeControls: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  incomingControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
  },
  iconButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeIcon: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  endButton: {
    // backgroundColor will be applied dynamically
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  controlButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButton: {
    // backgroundColor will be applied dynamically
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  acceptVideoButton: {
    // backgroundColor will be applied dynamically
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  declineButton: {
    // backgroundColor will be applied dynamically
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  controlText: {
    color: '#ffffff', // Theme: white text
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  upgradeRequestBox: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    marginHorizontal: 20,
    marginBottom: 10,
  },
  upgradeRequestText: {
    color: '#ffffff', // Theme: white text
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  upgradeRequestActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  actionBtn: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  actionBtnText: {
    color: '#ffffff', // Theme: white text
    fontWeight: 'bold',
    fontSize: 16,
  },
});