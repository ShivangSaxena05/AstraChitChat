import React, { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CallScreen from './CallScreen';
import { useCall } from '@/contexts/CallContext';
import { get } from '@/services/api';

export default function CallOverlay() {
  const { 
    isCalling, 
    isConnected, 
    incomingCall, 
    targetUser,
    localStream,
    remoteStream,
    isVideoEnabled,
    isMuted, 
    isSpeaker,
    videoUpgradeRequest,
    isVideoUpgradePending,
    activeChatId,
    acceptCall, 
    declineCall, 
    endCall, 
    toggleMute, 
    toggleSpeaker,
    toggleVideo,
    upgradeToVideo,
    acceptVideoUpgrade,
    declineVideoUpgrade,
    switchCamera
  } = useCall();
  
  const [callDuration, setCallDuration] = useState(0);
  const [otherUser, setOtherUser] = useState<{ username: string; profilePicture: string } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const getUserId = async () => {
        const userId = await AsyncStorage.getItem('userId');
        setCurrentUserId(userId);
    };
    getUserId();
  }, []);

  // Timer for active connected calls
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isCalling && isConnected && !incomingCall) {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isCalling, isConnected, incomingCall]);

  // Fetch real other user data by ID
  const fetchOtherUser = async (userId: string) => {
    if (!userId) return;
    try {
      const userData = await get(`/profile/${userId}`);
      setOtherUser({
        username: userData.username || userData.name || userData.displayName || 'User',
        profilePicture: userData.profilePicture || userData.profilePictureUrl || `https://ui-avatars.com/api/?name=${userData.username || userData.name || 'User'}`
      });
    } catch (error) {
      console.warn('Failed to fetch other user:', error);
      // Better fallback using incoming data if available
      if (incomingCall?.callerUsername) {
        setOtherUser({
          username: incomingCall.callerUsername,
          profilePicture: incomingCall?.callerProfilePicture || 'https://i.pravatar.cc/300'
        });
      } else {
        setOtherUser({
          username: 'User',
          profilePicture: 'https://i.pravatar.cc/300'
        });
      }
    }
  };

  // Determine caller/target ID and fetch user data (IMPROVED: Prioritize targetUser)
  useEffect(() => {
    // Use targetUser from context first (no network needed)
    if (targetUser) {
      setOtherUser(targetUser);
      return;
    }
    
            const fetchChatAndThenUser = async () => {
    
                if (!activeChatId || !currentUserId) return;
    
        
    
                try {
    
                    const chatData = await get(`/chats/${activeChatId}/info`);
    
                    const otherParticipant = chatData.participants.find(p => p._id !== currentUserId);
    
        
    
                    if (otherParticipant) {
    
                        fetchOtherUser(otherParticipant._id);
    
                    }
    
                } catch (error) {
    
                    console.error('Failed to fetch chat data:', error);
    
                }
    
            };


    let targetId = null;
    if (incomingCall?.callerId) {
      targetId = incomingCall.callerId;
      if (targetId) fetchOtherUser(targetId);
    } else if (activeChatId) {
        fetchChatAndThenUser();
    }
  }, [targetUser, incomingCall?.callerId, activeChatId, currentUserId]);

  // Determine Call Status
  let status: 'incoming' | 'outgoing' | 'connecting' | 'connected' = 'outgoing';
  
  if (incomingCall) {
     status = 'incoming';
  } else if (isCalling && !isConnected) {
     status = 'connecting';
  } else if (isCalling && isConnected) {
     status = 'connected';
  }

  const displayUser = targetUser || otherUser || { 
    username: incomingCall?.callerUsername || 'Connecting...', 
    profilePicture: incomingCall?.callerProfilePicture || 'https://i.pravatar.cc/300' 
  };

  const isVisible = isCalling || !!incomingCall;

  return (
    <CallScreen
      visible={isVisible}
      status={status}
      otherUser={displayUser}
      localStream={localStream}
      remoteStream={remoteStream}
      isVideoEnabled={isVideoEnabled}
      isMuted={isMuted}
      isSpeaker={isSpeaker}
      duration={callDuration}
      videoUpgradeRequest={videoUpgradeRequest}
      isVideoUpgradePending={isVideoUpgradePending}
      onAccept={(video: boolean) => acceptCall(video)}
      onDecline={declineCall}
      onEnd={endCall}
      onMute={toggleMute}
      onSpeaker={toggleSpeaker}
      onSwitchVideo={toggleVideo}
      onUpgradeToVideo={upgradeToVideo}
      onAcceptVideoUpgrade={acceptVideoUpgrade}
      onDeclineVideoUpgrade={declineVideoUpgrade}
      onSwitchCamera={switchCamera}
      isVideoCallContext={incomingCall ? incomingCall.isVideo : isVideoEnabled}
    />
  );
}

