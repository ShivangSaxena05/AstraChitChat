import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import NetInfo from '@react-native-community/netinfo';

export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
}

interface NetworkContextType {
  networkStatus: NetworkStatus;
  isOnline: boolean;
  isOffline: boolean;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export interface NetworkProviderProps {
  children: ReactNode;
}



export const NetworkProvider: React.FC<NetworkProviderProps> = ({ children }) => {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: null,
  });

  useEffect(() => {
    // Subscribe to NetInfo changes (passive OS-level monitoring)
    const unsubscribe = NetInfo.addEventListener(state => {
      setNetworkStatus({
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable ?? null,
      });
    });

    return () => unsubscribe();
  }, []);

  const value: NetworkContextType = {
    networkStatus,
    isOnline: networkStatus.isInternetReachable === true,
    isOffline: networkStatus.isInternetReachable === false,
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
