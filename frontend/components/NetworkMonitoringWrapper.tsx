import React, { useEffect } from 'react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

/**
 * ✅ FIX: Network monitoring wrapper component
 * 
 * This component wraps authenticated content and ensures network status
 * is actively monitored while the user is logged in.
 * 
 * It must be placed inside SocketProvider.
 */
export const NetworkMonitoringWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // ✅ This hook will automatically handle reconnections
  useNetworkStatus();

  return <>{children}</>;
};

export default NetworkMonitoringWrapper;
