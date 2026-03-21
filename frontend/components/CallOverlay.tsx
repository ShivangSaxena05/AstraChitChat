import React, { useState, useEffect } from 'react';
import CallScreen from './CallScreen';
import { useCall } from '@/contexts/CallContext';

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
    acceptCall, 
    declineCall, 
    endCall, 
    toggleMute, 
    toggleSpeaker,
    toggleVideo,
    upgradeToVideo,
    switchCamera
  } = useCall();
  
  const [callDuration, setCallDuration] = useState(0);

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

  
  // Determine Call Status
  let status: 'incoming' | 'outgoing' | 'connecting' | 'connected' = 'outgoing';
  
  if (incomingCall) {
     status = 'incoming';
  } else if (isCalling && !isConnected) {
     status = 'connecting';
  } else if (isCalling && isConnected) {
     status = 'connected';
  }

  // Determine Other User Info (Mocked from Context if possible, or passed via Socket)
  // Our CallContext socket might not pass the full user object, but we have callerId.
  // In a real app we might fetch user details, for now we supply a generic object or use incomingCall details if available.
  const callerUsername = incomingCall?.callerUsername || 'User'; 
  const displayUser = { 
    username: callerUsername, 
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
      onAccept={(video: boolean) => acceptCall(video)}
      onDecline={declineCall}
      onEnd={endCall}
      onMute={toggleMute}
      onSpeaker={toggleSpeaker}
      onSwitchVideo={toggleVideo}
      onUpgradeToVideo={upgradeToVideo}
      onSwitchCamera={switchCamera}
      isVideoCallContext={incomingCall ? incomingCall.isVideo : isVideoEnabled} // Rough tracking of if the call originated as Video
    />
  );
}
