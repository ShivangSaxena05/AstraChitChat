/**
 * Native Module Fallback Handler
 * 
 * Gracefully handles missing native modules (ExpoCamera, NetInfo, etc.)
 * Provides fallback implementations for core functionality
 */

const missingModules = new Set<string>();

export const setupNativeModuleFallbacks = () => {
  // Override require to catch missing native modules
  const originalRequire = require;
  
  (global as any).require = function(moduleId: string) {
    try {
      return originalRequire(moduleId);
    } catch (error: any) {
      // Check if this is a native module error
      if (error?.message?.includes('Cannot find native module')) {
        const moduleName = error.message.match(/Cannot find native module '([^']+)'/)?.[1];
        
        if (moduleName) {
          missingModules.add(moduleName);
          console.warn(`[NativeModuleFallback] Missing native module: ${moduleName}`);
          
          // Return a fallback implementation
          return getNativeFallback(moduleName);
        }
      }
      
      throw error;
    }
  };
};

/**
 * Get fallback implementation for native module
 */
function getNativeFallback(moduleName: string): any {
  switch (moduleName) {
    case 'ExpoCamera':
      return getExposeCameraFallback();
    
    case 'RNCNetInfo':
      return getNetInfoFallback();
    
    case 'RNFSManager':
      return getFileSystemFallback();
    
    case 'RNCPushNotification':
      return getPushNotificationFallback();
    
    default:
      console.warn(`[NativeModuleFallback] No fallback for: ${moduleName}`);
      return {};
  }
}

/**
 * ExpoCamera fallback - provides warning when camera is accessed
 */
function getExposeCameraFallback() {
  return {
    CameraView: null,
    useCameraPermissions: () => [{ granted: false }, () => null],
    useMicrophonePermissions: () => [{ granted: false }, () => null],
    CameraType: { front: 'front', back: 'back' },
    // Component will be null, triggering error boundary when accessed
  };
}

/**
 * NetInfo fallback - assumes online if module not available
 */
function getNetInfoFallback() {
  return {
    default: {
      addEventListener: (callback: Function) => {
        console.warn('[NetInfoFallback] NetInfo not available, assuming online');
        callback({ isConnected: true, type: 'unknown' });
        return () => {};
      },
      fetch: async () => ({
        isConnected: true,
        type: 'unknown',
      }),
    },
  };
}

/**
 * File System fallback
 */
function getFileSystemFallback() {
  return {
    documentDirectory: null,
    readAsStringAsync: async () => '',
    writeAsStringAsync: async () => {},
    deleteAsync: async () => {},
  };
}

/**
 * Push Notification fallback
 */
function getPushNotificationFallback() {
  return {
    addEventListener: () => ({ remove: () => {} }),
    getInitialNotification: async () => null,
    requestPermissions: async () => ({}),
  };
}

/**
 * Check if a module is missing
 */
export const isModuleMissing = (moduleName: string): boolean => {
  return missingModules.has(moduleName);
};

/**
 * Get list of missing modules
 */
export const getMissingModules = (): string[] => {
  return Array.from(missingModules);
};

/**
 * Provide user-friendly message for missing modules
 */
export const getMissingModuleMessage = (moduleName: string): string => {
  const messages: Record<string, string> = {
    ExpoCamera: 'Camera feature is not available. You can still upload media from your gallery.',
    RNCNetInfo: 'Network monitoring is unavailable, but basic functionality continues.',
    RNFSManager: 'File system features may be limited.',
    RNCPushNotification: 'Push notifications are unavailable.',
  };
  
  return messages[moduleName] || `The ${moduleName} module is not available on your device.`;
};
