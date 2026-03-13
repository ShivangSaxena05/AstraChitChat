import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image, Dimensions, Platform, Modal, SafeAreaView } from 'react-native';
import { RTCView, MediaStream } from 'react-native-webrtc';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

interface CallScreenProps {
  visible: boolean;
  status: 'incoming' | 'outgoing' | 'connected';
  otherUser?: { username: string; profilePicture: string };
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isVideoCall: boolean;
  isMuted: boolean;
  isSpeaker: boolean;
  duration: number;
  onAccept: () => void;
  onDecline: () => void;
  onEnd: () => void;
  onMute: () => void;
  onSpeaker: () => void;
  onSwitchVideo: () => void;
  onSwitchCamera: () => void;
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

export default function CallScreen(props: CallScreenProps) {
  if (!props.visible) return null;

  const renderButtons = () => {
    if (props.status === 'incoming') {
      return (
        <View style={styles.incomingControls}>
          <TouchableOpacity style={[styles.controlButton, styles.declineButton]} onPress={props.onDecline}>
            <Ionicons name="close" size={32} color="#fff" />
            <Text style={styles.controlText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.controlButton, styles.acceptButton]} onPress={props.onAccept}>
            <Ionicons name="call" size={32} color="#fff" />
            <Text style={styles.controlText}>Accept</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.activeControls}>
        <TouchableOpacity style={[styles.iconButton, props.isMuted && styles.activeIcon]} onPress={props.onMute}>
          <Ionicons name={props.isMuted ? "mic-off" : "mic"} size={24} color="#fff" />
        </TouchableOpacity>
        
        {!props.isVideoCall && (
          <TouchableOpacity style={[styles.iconButton, props.isSpeaker && styles.activeIcon]} onPress={props.onSpeaker}>
            <Ionicons name={props.isSpeaker ? "volume-high" : "volume-medium"} size={24} color="#fff" />
          </TouchableOpacity>
        )}

        {!props.isVideoCall ? (
           <TouchableOpacity style={styles.iconButton} onPress={props.onSwitchVideo}>
             <Ionicons name="videocam" size={24} color="#fff" />
           </TouchableOpacity>
        ) : (
           <TouchableOpacity style={styles.iconButton} onPress={props.onSwitchCamera}>
             <Ionicons name="camera-reverse" size={24} color="#fff" />
           </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.iconButton, styles.endButton]} onPress={props.onEnd}>
          <Ionicons name="call" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  };

  // Video Call Render
  if (props.isVideoCall && props.status === 'connected') {
    return (
      <Modal visible={props.visible} animationType="slide" transparent={false}>
        <View style={styles.container}>
          {/* Remote Video (Full Screen) */}
          {props.remoteStream && (
            <RTCView
              streamURL={props.remoteStream.toURL()}
              style={styles.remoteVideo}
              objectFit="cover"
            />
          )}

          {/* Local Video (PIP) */}
          {props.localStream && (
            <View style={styles.localVideoContainer}>
              <RTCView
                streamURL={props.localStream.toURL()}
                style={styles.localVideo}
                objectFit="cover"
                mirror={true}
              />
            </View>
          )}

          {/* Overlay Controls */}
          <SafeAreaView style={styles.videoOverlay}>
            <View style={styles.header}>
              <Text style={styles.nameText}>{props.otherUser?.username || 'User'}</Text>
              <Text style={styles.timerText}>{formatDuration(props.duration)}</Text>
            </View>
            {renderButtons()}
          </SafeAreaView>
        </View>
      </Modal>
    );
  }

  // Audio Call / Incoming / Outgoing Render
  return (
    <Modal visible={props.visible} animationType="slide" transparent={false}>
      <View style={styles.audioContainer}>
        <View style={styles.profileContainer}>
          <Image
            source={{ uri: props.otherUser?.profilePicture || 'https://i.pravatar.cc/300' }}
            style={styles.profileImage}
          />
          <Text style={styles.nameTextLarge}>{props.otherUser?.username || 'Unknown'}</Text>
          <Text style={styles.statusText}>
            {props.status === 'incoming' ? 'Incoming Audio Call...' : 
             props.status === 'outgoing' ? 'Calling...' : 
             formatDuration(props.duration)}
          </Text>
        </View>

        {renderButtons()}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  audioContainer: {
    flex: 1,
    backgroundColor: '#151718',
    justifyContent: 'space-between',
    paddingVertical: 60,
  },
  profileContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  nameText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 4,
  },
  nameTextLarge: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  statusText: {
    color: '#4ADDAE',
    fontSize: 16,
  },
  timerText: {
    color: '#eee',
    fontSize: 14,
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 4,
  },
  remoteVideo: {
    flex: 1,
    width: width,
    height: height,
    backgroundColor: '#000',
  },
  localVideoContainer: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 100,
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
    zIndex: 10,
  },
  localVideo: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
  },
  activeControls: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  incomingControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 40,
    marginBottom: 40,
  },
  iconButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeIcon: {
    backgroundColor: '#fff',
    // Icon inside should be dark if needed, but white on white needs handling. 
    // For simplicity using opacity or different color logic in component.
    backgroundColor: '#4ADDAE', 
  },
  endButton: {
    backgroundColor: '#FF3B30',
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  controlButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButton: {
    backgroundColor: '#34C759',
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  declineButton: {
    backgroundColor: '#FF3B30',
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  controlText: {
    color: '#fff',
    marginTop: 8,
    fontSize: 14,
  },
});