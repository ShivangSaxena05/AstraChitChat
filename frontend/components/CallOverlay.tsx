import { useCall } from "@/contexts/CallContext";
import { useSocket } from "@/contexts/SocketContext";
import React, { useEffect, useState } from "react";
import CallScreen from "./CallScreen";

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
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    toggleSpeaker,
    toggleVideo,
    upgradeToVideo,
    acceptVideoUpgrade,
    declineVideoUpgrade,
    switchCamera,
  } = useCall();

  const { socket, currentUserId } = useSocket();

  const [callDuration, setCallDuration] = useState(0);

  // ✅ Single source: targetUser first, then incomingCall fallback
  const displayUser =
    targetUser ||
    (incomingCall && {
      username: incomingCall.callerUsername || "Unknown",
      profilePicture:
        incomingCall.callerProfilePicture || "https://i.pravatar.cc/300",
    }) ||
    null;

  // Timer for active connected calls
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isCalling && isConnected && !incomingCall) {
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isCalling, isConnected, incomingCall]);

  // ✅ REMOVED: Redundant useEffect that called undefined setOtherUser()
  // displayUser variable above correctly handles all fallback logic

  // Determine Call Status
  let status: "incoming" | "outgoing" | "connecting" | "connected" = "outgoing";

  if (incomingCall) {
    status = "incoming";
  } else if (isCalling && !isConnected) {
    status = "connecting";
  } else if (isCalling && isConnected) {
    status = "connected";
  }

  // Fixed duplicate declaration - use the single source displayUser defined above

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
