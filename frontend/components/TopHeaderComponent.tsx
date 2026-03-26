import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ThemedView } from './themed-view';
import { useAccountSwitcher, UsernameHeader } from '@/hooks/useAccountSwitcher';
import { AccountSwitcherModal } from '@/hooks/useAccountSwitcher';

interface TopHeaderComponentProps {
  showPlusIcon?: boolean;
  onPlusPress?: () => void;
  showMenuIcon?: boolean;
  onMenuPress?: () => void;
}

export default function TopHeaderComponent({ showPlusIcon = false, onPlusPress, showMenuIcon = false, onMenuPress }: TopHeaderComponentProps) {
  const {
    currentUsername,
    isAccountModalVisible,
    savedAccounts,
    openAccountSwitcher,
    switchAccount,
    addAccount,
    closeAccountModal,
  } = useAccountSwitcher();

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.header}>
        <UsernameHeader 
          username={currentUsername} 
          onPress={openAccountSwitcher}
        />
        {showPlusIcon && (
          <TouchableOpacity style={styles.plusButton} onPress={onPlusPress}>
            <Ionicons name="add" size={24} color="white" />
          </TouchableOpacity>
        )}
        {showMenuIcon && (
          <TouchableOpacity style={styles.plusButton} onPress={onMenuPress}>
            <Ionicons name="menu" size={24} color="white" />
          </TouchableOpacity>
        )}
        <AccountSwitcherModal
          visible={isAccountModalVisible}
          accounts={savedAccounts}
          currentUsername={currentUsername}
          onSwitch={switchAccount}
          onAddAccount={addAccount}
          onClose={closeAccountModal}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#000',
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 10,
    backgroundColor: '#000',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  plusButton: {
    padding: 8,
  },
});

