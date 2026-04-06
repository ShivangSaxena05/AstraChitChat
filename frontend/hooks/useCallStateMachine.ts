import { useReducer, useCallback } from 'react';

/**
 * Call state machine actions
 */
type CallAction =
  | { type: 'INITIATE_CALL'; targetUserId: string; chatId: string; isVideo: boolean }
  | { type: 'INCOMING_CALL'; callerId: string; isVideo: boolean }
  | { type: 'CONNECTING' }
  | { type: 'CONNECT' }
  | { type: 'MUTE' }
  | { type: 'UNMUTE' }
  | { type: 'TOGGLE_SPEAKER' }
  | { type: 'ENABLE_VIDEO' }
  | { type: 'DISABLE_VIDEO' }
  | { type: 'END_CALL' }
  | { type: 'CALL_FAILED'; reason: string }
  | { type: 'SET_TARGET_USER'; targetUser: any };

/**
 * Call state interface
 */
interface CallState {
  status: 'idle' | 'incoming' | 'outgoing' | 'connecting' | 'connected' | 'failed';
  isMuted: boolean;
  isSpeaker: boolean;
  isVideoEnabled: boolean;
  targetUserId: string | null;
  targetUser: { username: string; profilePicture: string } | null;
  chatId: string | null;
  callerId: string | null;
  errorMessage: string | null;
}

const initialState: CallState = {
  status: 'idle',
  isMuted: false,
  isSpeaker: false,
  isVideoEnabled: false,
  targetUserId: null,
  targetUser: null,
  chatId: null,
  callerId: null,
  errorMessage: null,
};

/**
 * Call state reducer
 * Pure function that transforms state based on actions
 */
const callReducer = (state: CallState, action: CallAction): CallState => {
  switch (action.type) {
    case 'INITIATE_CALL':
      return {
        ...state,
        status: 'outgoing',
        targetUserId: action.targetUserId,
        chatId: action.chatId,
        isVideoEnabled: action.isVideo,
        errorMessage: null,
      };

    case 'INCOMING_CALL':
      return {
        ...state,
        status: 'incoming',
        callerId: action.callerId,
        isVideoEnabled: action.isVideo,
        errorMessage: null,
      };

    case 'CONNECTING':
      return {
        ...state,
        status: 'connecting',
        errorMessage: null,
      };

    case 'CONNECT':
      return {
        ...state,
        status: 'connected',
        errorMessage: null,
      };

    case 'MUTE':
      return {
        ...state,
        isMuted: true,
      };

    case 'UNMUTE':
      return {
        ...state,
        isMuted: false,
      };

    case 'TOGGLE_SPEAKER':
      return {
        ...state,
        isSpeaker: !state.isSpeaker,
      };

    case 'ENABLE_VIDEO':
      return {
        ...state,
        isVideoEnabled: true,
      };

    case 'DISABLE_VIDEO':
      return {
        ...state,
        isVideoEnabled: false,
      };

    case 'END_CALL':
      return {
        ...initialState,
      };

    case 'CALL_FAILED':
      return {
        ...state,
        status: 'failed',
        errorMessage: action.reason,
      };

    case 'SET_TARGET_USER':
      return {
        ...state,
        targetUser: action.targetUser,
      };

    default:
      return state;
  }
};

interface CallStateMachineResult {
  state: CallState;
  initiateCall: (targetUserId: string, chatId: string, isVideo: boolean) => void;
  incomingCall: (callerId: string, isVideo: boolean) => void;
  setConnecting: () => void;
  setConnected: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  enableVideo: () => void;
  disableVideo: () => void;
  endCall: () => void;
  setCallFailed: (reason: string) => void;
  setTargetUser: (targetUser: any) => void;
}

/**
 * Hook to manage call state machine
 * Handles all call status transitions and UI state
 *
 * Benefits:
 * - Pure reducer logic (testable, debuggable)
 * - Clear state transitions
 * - No race conditions in state updates
 * - Explicit actions for all state changes
 * - Easy to add new states/transitions
 */
export const useCallStateMachine = (): CallStateMachineResult => {
  const [state, dispatch] = useReducer(callReducer, initialState);

  const initiateCall = useCallback((targetUserId: string, chatId: string, isVideo: boolean) => {
    dispatch({ type: 'INITIATE_CALL', targetUserId, chatId, isVideo });
  }, []);

  const incomingCall = useCallback((callerId: string, isVideo: boolean) => {
    dispatch({ type: 'INCOMING_CALL', callerId, isVideo });
  }, []);

  const setConnecting = useCallback(() => {
    dispatch({ type: 'CONNECTING' });
  }, []);

  const setConnected = useCallback(() => {
    dispatch({ type: 'CONNECT' });
  }, []);

  const toggleMute = useCallback(() => {
    dispatch({ type: state.isMuted ? 'UNMUTE' : 'MUTE' });
  }, [state.isMuted]);

  const toggleSpeaker = useCallback(() => {
    dispatch({ type: 'TOGGLE_SPEAKER' });
  }, []);

  const enableVideo = useCallback(() => {
    dispatch({ type: 'ENABLE_VIDEO' });
  }, []);

  const disableVideo = useCallback(() => {
    dispatch({ type: 'DISABLE_VIDEO' });
  }, []);

  const endCall = useCallback(() => {
    dispatch({ type: 'END_CALL' });
  }, []);

  const setCallFailed = useCallback((reason: string) => {
    dispatch({ type: 'CALL_FAILED', reason });
  }, []);

  const setTargetUser = useCallback((targetUser: any) => {
    dispatch({ type: 'SET_TARGET_USER', targetUser });
  }, []);

  return {
    state,
    initiateCall,
    incomingCall,
    setConnecting,
    setConnected,
    toggleMute,
    toggleSpeaker,
    enableVideo,
    disableVideo,
    endCall,
    setCallFailed,
    setTargetUser,
  };
};
