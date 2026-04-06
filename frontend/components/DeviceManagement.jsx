/**
 * 🔐 Device Management Component
 * Displays and manages user's registered E2EE devices
 * 
 * Features:
 * - View all devices
 * - Trust/untrust devices
 * - Revoke device access
 * - Rotate encryption keys
 * - View security info
 */

import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import E2EEManager from '../services/E2EEManager';
import './DeviceManagement.css';

const DeviceManagement = () => {
  const { user, token } = useContext(AuthContext);
  const [e2ee] = useState(() => new E2EEManager());
  
  const [devices, setDevices] = useState([]);
  const [securityInfo, setSecurityInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionInProgress, setActionInProgress] = useState(null);

  useEffect(() => {
    if (token) {
      e2ee.init(token);
      loadDevicesAndSecurity();
    }
  }, [token]);

  const loadDevicesAndSecurity = async () => {
    try {
      setLoading(true);
      const [devicesData, securityData] = await Promise.all([
        e2ee.getDevices(),
        e2ee.getSecurityInfo()
      ]);

      setDevices(devicesData);
      setSecurityInfo(securityData.security);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Failed to load devices:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTrustDevice = async (deviceId) => {
    try {
      setActionInProgress(deviceId);
      await e2ee.trustDevice(deviceId);
      await loadDevicesAndSecurity();
      setError(null);
    } catch (err) {
      setError(`Failed to trust device: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRevokeDevice = async (deviceId) => {
    if (!window.confirm('Are you sure? This device will lose access to your encrypted messages.')) {
      return;
    }

    try {
      setActionInProgress(deviceId);
      await e2ee.revokeDevice(deviceId);
      await loadDevicesAndSecurity();
      setError(null);
    } catch (err) {
      setError(`Failed to revoke device: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRotateKeys = async () => {
    if (!window.confirm('Rotate your encryption keys? You should do this if a device is compromised.')) {
      return;
    }

    try {
      setActionInProgress('rotate');
      await e2ee.rotateKeys('manual');
      await loadDevicesAndSecurity();
      setError(null);
      alert('✅ Keys rotated successfully');
    } catch (err) {
      setError(`Failed to rotate keys: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString();
  };

  const getDeviceIcon = (deviceType) => {
    switch (deviceType) {
      case 'mobile':
        return '📱';
      case 'desktop':
        return '🖥️';
      case 'web':
        return '🌐';
      default:
        return '💻';
    }
  };

  if (loading) {
    return (
      <div className="device-management">
        <div className="loading">Loading devices...</div>
      </div>
    );
  }

  return (
    <div className="device-management">
      <div className="device-header">
        <h2>🔐 Device Management & E2EE Security</h2>
        <p>Manage your devices and encryption settings</p>
      </div>

      {error && (
        <div className="error-banner">
          ⚠️ {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Security Summary */}
      {securityInfo && (
        <div className="security-summary">
          <div className="summary-card">
            <span className="icon">📱</span>
            <div>
              <h4>Active Devices</h4>
              <p className="value">{securityInfo.devicesCount}</p>
            </div>
          </div>

          <div className="summary-card">
            <span className="icon">✅</span>
            <div>
              <h4>Trusted Devices</h4>
              <p className="value">{securityInfo.trustedDevicesCount}</p>
            </div>
          </div>

          <div className="summary-card">
            <span className="icon">🔄</span>
            <div>
              <h4>Key Rotations</h4>
              <p className="value">{securityInfo.keyRotations}</p>
            </div>
          </div>

          <div className="summary-card">
            <span className="icon">⏱️</span>
            <div>
              <h4>Last Rotation</h4>
              <p className="value">
                {securityInfo.lastKeyRotation
                  ? new Date(securityInfo.lastKeyRotation).toLocaleDateString()
                  : 'Never'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Devices List */}
      <div className="devices-section">
        <h3>Your Devices</h3>

        {devices.length === 0 ? (
          <div className="no-devices">
            <p>No devices registered yet</p>
            <p className="hint">Register your current device to enable E2EE messaging</p>
          </div>
        ) : (
          <div className="devices-grid">
            {devices.map(device => (
              <div key={device.deviceId} className={`device-card ${device.isTrusted ? 'trusted' : ''}`}>
                <div className="device-icon">
                  {getDeviceIcon(device.deviceType)}
                </div>

                <div className="device-info">
                  <h4>{device.deviceName}</h4>
                  <p className="device-type">{device.deviceType}</p>
                  <p className="fingerprint">
                    🔑 {device.publicKeyFingerprint?.substring(0, 12)}...
                  </p>
                </div>

                <div className="device-status">
                  {device.isTrusted && (
                    <span className="badge trusted">✅ Trusted</span>
                  )}
                  {!device.isTrusted && (
                    <span className="badge untrusted">⚠️ Not Trusted</span>
                  )}
                  {device.isActive ? (
                    <span className="badge active">🟢 Active</span>
                  ) : (
                    <span className="badge inactive">🔴 Inactive</span>
                  )}
                </div>

                <p className="last-seen">
                  Last seen: {formatDate(device.lastSeen)}
                </p>

                <div className="device-actions">
                  {!device.isTrusted && device.isActive && (
                    <button
                      onClick={() => handleTrustDevice(device.deviceId)}
                      disabled={actionInProgress === device.deviceId}
                      className="btn btn-trust"
                    >
                      {actionInProgress === device.deviceId ? '⏳' : '✅'} Trust
                    </button>
                  )}

                  {device.isActive && (
                    <button
                      onClick={() => handleRevokeDevice(device.deviceId)}
                      disabled={actionInProgress === device.deviceId}
                      className="btn btn-revoke"
                    >
                      {actionInProgress === device.deviceId ? '⏳' : '❌'} Revoke
                    </button>
                  )}

                  {!device.isActive && (
                    <button className="btn btn-inactive" disabled>
                      Revoked
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Key Rotation Section */}
      <div className="key-rotation-section">
        <h3>🔐 Encryption Key Management</h3>

        <div className="key-info">
          <p>
            Your encryption keys are used to encrypt and decrypt messages. If you suspect your device is
            compromised, rotate your keys immediately.
          </p>

          <div className="warning-box">
            <strong>⚠️ Important:</strong> After rotating keys, old messages encrypted with the previous key
            will still be readable, but new messages will use the rotated key.
          </div>

          <button
            onClick={handleRotateKeys}
            disabled={actionInProgress === 'rotate'}
            className="btn btn-primary btn-large"
          >
            {actionInProgress === 'rotate' ? '⏳ Rotating...' : '🔄 Rotate Keys Now'}
          </button>
        </div>
      </div>

      {/* Device Info */}
      <div className="device-info-section">
        <h3>📋 Current Device</h3>

        <div className="current-device-info">
          <p>
            <strong>Device ID:</strong> <code>{e2ee.deviceId}</code>
          </p>
          <p>
            <strong>Device Name:</strong> {e2ee.getDeviceName()}
          </p>
          <p>
            <strong>Device Type:</strong> {e2ee.getDeviceType()}
          </p>
          <p>
            <strong>OS:</strong> {e2ee.getOSName()}
          </p>
        </div>
      </div>

      {/* Privacy Policy */}
      <div className="privacy-info">
        <h4>🛡️ Your Privacy</h4>
        <ul>
          <li>Your encryption keys never leave your device</li>
          <li>Messages are encrypted on your device before sending</li>
          <li>The server never sees your unencrypted messages</li>
          <li>Only your devices can decrypt your messages</li>
          <li>Device keys are unique and can be independently revoked</li>
        </ul>
      </div>
    </div>
  );
};

export default DeviceManagement;
