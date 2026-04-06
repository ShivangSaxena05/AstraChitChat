import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import axios from 'axios';

export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
}

interface NetworkContextType {
  networkStatus: NetworkStatus;
  isOnline: boolean;
  isOffline: boolean;
  checkConnection: () => Promise<boolean>;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export interface NetworkProviderProps {
  children: ReactNode;
}

// Check connectivity by pinging your own backend instead of external services
// This avoids CORS issues and is more reliable for your app
const checkInternetConnectivity = async (): Promise<boolean> => {
  try {
    // Try to reach your own backend first (most important)
    const backendUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';
    const response = await axios.head(`${backendUrl}/api/test/db`, {
      timeout: 5000,
    });
    return response.status >= 200 && response.status < 300;
  } catch (error) {
    // If backend is unreachable, consider it offline
    // Don't try external services due to CORS restrictions
    console.debug('[NetworkContext] Backend unreachable:', (error as any)?.message);
    return false;
  }
};

export const NetworkProvider: React.FC<NetworkProviderProps> = ({ children }) => {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: null,
  });

  const checkConnection = useCallback(async (): Promise<boolean> => {
    try {
      const isReachable = await checkInternetConnectivity();
      setNetworkStatus(prev => ({
        ...prev,
        isInternetReachable: isReachable,
      }));
      return isReachable;
    } catch (error) {
      console.error('[NetworkProvider] Error checking connection:', error);
      return false;
    }
  }, []);

  useEffect(() => {
    let appStateSubscription: any = null;
    let connectionCheckInterval: any = null;

    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') {
        // Recheck network when app comes to foreground
        checkConnection().catch((error: any) => 
          console.error('[NetworkProvider] Error rechecking connection:', error)
        );
      }
    };

    const setupNetworkMonitoring = () => {
      // Check connection on mount
      checkConnection().catch((error: any) => 
        console.error('[NetworkProvider] Initial connection check failed:', error)
      );

      // Periodically check connection (every 30 seconds)
      connectionCheckInterval = setInterval(() => {
        checkConnection().catch((error: any) => 
          console.error('[NetworkProvider] Periodic connection check failed:', error)
        );
      }, 30000);

      // Monitor app state
      appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
    };

    setupNetworkMonitoring();

    return () => {
      if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
      }
      if (appStateSubscription) {
        appStateSubscription.remove();
      }
    };
  }, [checkConnection]);

  const value: NetworkContextType = {
    networkStatus,
    isOnline: networkStatus.isInternetReachable === true,
    isOffline: networkStatus.isInternetReachable === false,
    checkConnection,
  };

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetworkStatus = (): NetworkContextType => {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetworkStatus must be used within a NetworkProvider');
  }
  return context;
};

export default NetworkContext;
