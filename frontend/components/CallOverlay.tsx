import React, { useState, useEffect } from 'react';
import CallScreen from './CallScreen';
import { useCall } from '@/contexts/CallContext';
import { get } from '@/services/api';

export default function CallOverlay() {
  const { 
    isCalling, 
    isConnected, 
    incomingCall, 
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
      const userData = await get(`/api/users/${userId}`);
      setOtherUser({
        username: userData.username || 'User',
        profilePicture: userData.profilePicture || `https://ui-avatars.com/api/?name=${userData.username}`
      });
    } catch (error) {
      console.warn('Failed to fetch other user:', error);
      setOtherUser({
        username: 'User',
        profilePicture: 'https://i.pravatar.cc/300'
      });
    }
  };

  // Determine caller/target ID and fetch user data
  useEffect(() => {
    let targetId = null;
    if (incomingCall?.callerId) {
      targetId = incomingCall.callerId;
    } else if (activeChatId) {
      // For outgoing calls, could decode from chatId or store targetId in context
      // Using chatId temporarily - optimize by storing targetUserId in CallContext later if needed
      fetchOtherUser(activeChatId.split('-')[0] || ''); // Extract userId from chatId format if compound
    }
    if (targetId) fetchOtherUser(targetId);
  }, [incomingCall?.callerId, activeChatId]);

  // Determine Call Status
  let status: 'incoming' | 'outgoing' | 'connecting' | 'connected' = 'outgoing';
  
  if (incomingCall) {
     status = 'incoming';
  } else if (isCalling && !isConnected) {
     status = 'connecting';
  } else if (isCalling && isConnected) {
     status = 'connected';
  }

  const displayUser = otherUser || { 
    username: incomingCall?.callerUsername || 'Connecting...', 
    profilePicture: 'https://i.pravatar.cc/300' 
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

