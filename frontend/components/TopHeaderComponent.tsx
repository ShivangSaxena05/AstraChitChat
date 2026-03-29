import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ThemedView } from './themed-view';
import { useAccountSwitcher, UsernameHeader } from '@/hooks/useAccountSwitcher';
import { AccountSwitcherModal } from '@/hooks/useAccountSwitcher';
import { useTheme } from '@/hooks/use-theme-color';

interface TopHeaderComponentProps {
  showPlusIcon?: boolean;
  onPlusPress?: () => void;
  showMenuIcon?: boolean;
  onMenuPress?: () => void;
}

export default function TopHeaderComponent({ showPlusIcon = false, onPlusPress, showMenuIcon = false, onMenuPress }: TopHeaderComponentProps) {
  const colors = useTheme();
  const {
    currentUsername,
    isAccountModalVisible,
    savedAccounts,
    openAccountSwitcher,
    switchAccount,
    addAccount,
    closeAccountModal,
  } = useAccountSwitcher();

  // MEDIUM FIX: Ensure modal is properly controlled - close on account switch completion
  const handleAccountSwitch = async (account: any) => {
    await switchAccount(account);
    // Modal will auto-close via useAccountSwitcher after switch
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: colors.card }]}>
      <View style={[styles.header, { backgroundColor: colors.card }]}>
        <UsernameHeader 
          username={currentUsername} 
          onPress={openAccountSwitcher}
        />
        {showPlusIcon && (
          <TouchableOpacity style={styles.plusButton} onPress={onPlusPress}>
            <Ionicons name="add" size={24} color={colors.tint} />
          </TouchableOpacity>
        )}
        {showMenuIcon && (
          <TouchableOpacity style={styles.plusButton} onPress={onMenuPress}>
            <Ionicons name="menu" size={24} color={colors.tint} />
          </TouchableOpacity>
        )}
        <AccountSwitcherModal
          visible={isAccountModalVisible}
          accounts={savedAccounts}
          currentUsername={currentUsername}
          onSwitch={handleAccountSwitch}
          onAddAccount={addAccount}
          onClose={closeAccountModal}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    // backgroundColor will be applied dynamically via inline style
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 10,
    // backgroundColor will be applied dynamically via inline style
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  plusButton: {
    padding: 8,
  },
});

