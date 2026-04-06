import { useEffect, useState, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useSocket } from '@/contexts/SocketContext';

/**
 * PRODUCTION NETWORK STATUS MONITORING HOOK
 * 
 * Monitors network connectivity with comprehensive error handling
 * Gracefully degrades if NetInfo native module is unavailable
 * Automatically attempts socket reconnection when network restored
 * 
 * Handles these scenarios:
 * - NetInfo properly linked: Uses native module for accurate detection
 * - NetInfo not linked: Falls back to periodic ping checks + app state monitoring
 * - All other errors: Assumes online and continues gracefully
 */
export const useNetworkStatus = () => {
  const { socket } = useSocket();
  const [isNetworkAvailable, setIsNetworkAvailable] = useState(true);
  const [appState, setAppState] = useState<AppStateStatus>('active');
  const [networkChangeCount, setNetworkChangeCount] = useState(0);
  const [netInfoAvailable, setNetInfoAvailable] = useState(true);
  
  const appStateSubscriptionRef = useRef<any>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastNetworkStatusRef = useRef<boolean>(true);

  // ✅ Fallback: Periodic ping to check connectivity
  const startPeriodicPingCheck = () => {
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    
    pingIntervalRef.current = setInterval(async () => {
      try {
        // Try to fetch from a reliable endpoint with short timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout
        
        await fetch('https://www.google.com/favicon.ico', {
          method: 'HEAD',
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        const isOnline = true;
        
        if (!lastNetworkStatusRef.current) {
          console.log('[Network] Fallback: Online detected via ping');
          setIsNetworkAvailable(isOnline);
          setNetworkChangeCount(prev => prev + 1);
          
          // Attempt socket reconnection
          if (socket?.disconnected) {
            console.log('[Network] Reconnecting socket after network recovery...');
            setTimeout(() => {
              try {
                if (socket?.disconnected) socket.connect();
              } catch (err) {
                console.error('[Network] Socket reconnect error:', err);
              }
            }, 500);
          }
        }
        lastNetworkStatusRef.current = isOnline;
      } catch (error) {
        const isOnline = false;
        
        if (lastNetworkStatusRef.current) {
          console.log('[Network] Fallback: Offline detected');
          setIsNetworkAvailable(isOnline);
          setNetworkChangeCount(prev => prev + 1);
        }
        lastNetworkStatusRef.current = isOnline;
      }
    }, 10000); // Check every 10 seconds
  };

  // ✅ Monitor network connectivity with comprehensive error handling
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let isMounted = true;

    const initNetworkMonitoring = async () => {
      try {
        // Safely attempt to load NetInfo module
        let NetInfo: any = null;
        let netinfoInitialized = false;
        
        try {
          const module = require('@react-native-community/netinfo');
          NetInfo = module?.default || module;
          netinfoInitialized = true;
        } catch (importError) {
          console.warn('[Network] NetInfo module import failed:', importError);
          NetInfo = null;
        }
        
        // Check if NetInfo is valid and has addEventListener
        if (!NetInfo || typeof NetInfo.addEventListener !== 'function') {
          console.warn(
            '[Network] NetInfo not functional (native module may not be linked). ' +
            'Using fallback ping-based detection. To fix: run "react-native link @react-native-community/netinfo"'
          );
          if (isMounted) {
            setNetInfoAvailable(false);
            setIsNetworkAvailable(true); // Assume online
            startPeriodicPingCheck(); // Start fallback mechanism
          }
          return;
        }

        try {
          unsubscribe = NetInfo.addEventListener((state: any) => {
            if (!isMounted) return;
            
            try {
              const isOnline = state?.isConnected === true;
              const wasOnline = lastNetworkStatusRef.current;
              
              setIsNetworkAvailable(isOnline);
              setNetworkChangeCount(prev => prev + 1);
              lastNetworkStatusRef.current = isOnline;

              console.log('[Network] Status: ' + (isOnline ? 'ONLINE' : 'OFFLINE'));

              // If network restored and socket is disconnected, attempt reconnection
              if (isOnline && !wasOnline && socket?.disconnected) {
                console.log('[Network] Reconnecting socket...');
                setTimeout(() => {
                  try {
                    if (socket?.disconnected) {
                      socket.connect();
                    }
                  } catch (err) {
                    console.error('[Network] Socket reconnect error:', err);
                  }
                }, 500);
              }
            } catch (stateError) {
              console.error('[Network] Error processing state:', stateError);
            }
          });
          
          if (isMounted) {
            setNetInfoAvailable(true);
            console.log('[Network] NetInfo listener successfully attached');
          }
        } catch (listenerError) {
          console.error('[Network] Failed to add listener:', listenerError);
          if (isMounted) {
            setNetInfoAvailable(false);
            setIsNetworkAvailable(true);
            startPeriodicPingCheck(); // Use fallback
          }
        }
      } catch (error) {
        console.warn('[Network] Monitor initialization error:', error);
        if (isMounted) {
          setNetInfoAvailable(false);
          setIsNetworkAvailable(true);
          startPeriodicPingCheck(); // Use fallback
        }
      }
    };

    initNetworkMonitoring();

    return () => {
      isMounted = false;
      try {
        if (unsubscribe) {
          unsubscribe();
        }
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
      } catch (err) {
        console.error('[Network] Cleanup error:', err);
      }
    };
  }, [socket]);

  // ✅ Monitor app foreground/background state with error handling
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      try {
        const prevState = appState;
        
        // App came to foreground
        if (prevState === 'background' && nextAppState === 'active') {
          console.log('[App] App came to foreground, checking socket connection...');
          
          // Small delay to ensure app state is fully active
          setTimeout(() => {
            try {
              if (socket?.disconnected) {
                console.log('[App] Socket disconnected while in background, reconnecting...');
                socket.connect();
              } else if (socket?.connected) {
                // Emit setup to ensure server has latest state
                socket.emit('setup', { isOnline: true });
              }
            } catch (err) {
              console.error('[App] Error handling socket on foreground:', err);
            }
          }, 500);
        }
        
        // App went to background
        if (prevState === 'active' && nextAppState === 'background') {
          console.log('[App] App went to background');
        }

        setAppState(nextAppState);
      } catch (error) {
        console.error('[App] Error handling app state change:', error);
      }
    };

    try {
      const subscription = AppState.addEventListener('change', handleAppStateChange);
      
      return () => {
        try {
          subscription.remove();
        } catch (err) {
          console.error('[App] Error removing app state listener:', err);
        }
      };
    } catch (error) {
      console.error('[App] Error setting up app state listener:', error);
      return undefined;
    }
  }, [appState, socket]);

  return {
    isNetworkAvailable,
    appState,
    networkChangeCount,
    netInfoAvailable, // Indicates if NetInfo module is available
  };
};

export default useNetworkStatus;
