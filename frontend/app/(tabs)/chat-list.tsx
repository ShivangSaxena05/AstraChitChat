import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    Alert,
    FlatList,
    Image,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

// --- IMPORTS ---
// Assuming these paths are correct for your project structure
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useSocket } from "@/contexts/SocketContext";
import { get } from "@/services/api";
import { useTheme } from "@/hooks/use-theme-color";

// Import all required UI components for the header structure
import SearchBarComponent from "@/components/SearchBarComponent";
import StoriesReelsComponent from "@/components/StoriesReelsComponent";
import TopHeaderComponent from "@/components/TopHeaderComponent";
import OtherProfileScreen from "./other-profile";
import { ChatSkeleton } from "@/components/ChatSkeleton";

// --- INTERFACE ---
interface Chat {
  _id: string;
  convoType?: "direct" | "group";
  title?: string;
  participants: {
    _id: string;
    user: {
      _id: string;
      name: string;
      username: string;
      profilePicture: string;
      isOnline?: boolean;
      lastSeen?: string;
    };
    role: string;
    joinedAt: string;
    lastReadMsgId?: string;
  }[];
  lastMessage: {
    text: string;
    createdAt: string;
    sender?: {
      _id: string;
      username: string;
      name: string;
      profilePicture: string;
    };
  };
  unreadCount: number | { [userId: string]: number };
}

interface UserProfile {
  _id: string;
  username: string;
  profilePicture: string;
  bio: string;
  stats: {
    posts: number;
    followers: number;
    following: number;
  };
}

// --- CHAT LIST SCREEN COMPONENT ---
export default function ChatListScreen() {
  // Helper function to get unread count based on type
  const getUnreadCount = (
    unreadCount: number | { [userId: string]: number } | undefined,
    userId: string | null,
  ): number => {
    if (!unreadCount) return 0;
    if (typeof unreadCount === "number") return unreadCount;
    if (userId && typeof unreadCount === "object" && unreadCount[userId]) {
      return unreadCount[userId];
    }
    return 0;
  };

  // Helper function to safely get participant info with fallbacks
  const getParticipantInfo = (participant: Chat['participants'][0] | undefined) => {
    if (!participant) {
      return {
        userId: null,
        username: "Unknown User",
        profilePicture: "https://i.pravatar.cc/150?img=default",
        isValid: false,
      };
    }

    const userId = participant.user?._id;
    const username = participant.user?.username;
    const profilePicture = participant.user?.profilePicture;

    // Log warning if any critical field is missing
    if (!userId || !username) {
      console.warn(
        `[Chat List] Incomplete participant data - ID: ${userId}, Username: ${username}`,
        { participantId: participant._id, participant }
      );
    }

    return {
      userId: userId || null,
      username: username || "Unknown User",
      profilePicture: profilePicture || "https://i.pravatar.cc/150?img=default",
      isValid: !!(userId && username),
    };
  };

  const colors = useTheme();

  const {
    conversations,
    setConversations,
    currentUserId: socketUserId,
    isConnected,
  } = useSocket();
  
  // ✅ PRODUCTION FIX: Filter out chats without messages on frontend as safety layer
  // Backend should handle this, but this prevents edge cases from breaking the UI
  const chats = (conversations as unknown as Chat[]).filter(
    (chat) => chat.lastMessage?.text || chat.lastMessage?.createdAt
  );
  
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { showProfile } = useLocalSearchParams<{ showProfile: string }>();

  useEffect(() => {
    const initialize = async () => {
      const userId = await AsyncStorage.getItem("userId");
      setCurrentUserId(userId);
      // Only fetch if not already connected (SocketContext will fetch on connect)
      if (!isConnected) {
        fetchChats();
      } else {
        setLoading(false);
      }
    };
    initialize();
  }, [isConnected]);

  useEffect(() => {
    if (showProfile) {
      setSelectedUserId(showProfile);
      setProfileModalVisible(true);
    }
  }, [showProfile]);

  const fetchChats = async () => {
    try {
      setError(null);
      const data = await get("/chats");

      if (data && Array.isArray(data)) {
        // FIX: Deduplicate chats by ID before sorting
        const uniqueChats = Array.from(
          new Map(data.map(chat => [chat._id, chat])).values()
        );

        // Validate and filter chats
        const validatedChats = uniqueChats.filter((chat: Chat) => {
          // First check: participants array must exist and be valid
          if (!chat.participants || !Array.isArray(chat.participants)) {
            console.warn(`[Chat List] Skipping chat ${chat._id}: invalid participants structure`, chat);
            return false;
          }

          // For group chats, just ensure they have participants
          if (chat.convoType === "group") {
            if (chat.participants.length === 0) {
              console.warn(`[Chat List] Skipping group chat ${chat._id}: no participants`, chat);
              return false;
            }
            return true;
          }

          // For direct messages, ensure we have valid participant data
          const hasValidParticipants =
            chat.participants.length > 0 &&
            chat.participants.some(p => p.user?._id && p.user?.username);

          if (!hasValidParticipants) {
            console.warn(`[Chat List] Skipping invalid direct message chat: ${chat._id}`, chat);
          }

          return hasValidParticipants;
        });

        // Sort chats by most recent message
        const sorted = validatedChats.sort((a: Chat, b: Chat) => {
          const aTime = a.lastMessage?.createdAt
            ? new Date(a.lastMessage.createdAt).getTime()
            : 0;
          const bTime = b.lastMessage?.createdAt
            ? new Date(b.lastMessage.createdAt).getTime()
            : 0;
          return bTime - aTime;
        });
        setConversations(sorted);
      } else {
        setError("Invalid data format received from server");
      }
    } catch (error: any) {
      let errorMsg = "Failed to fetch chats";

      if (
        error.code === "ERR_NETWORK" ||
        error.message?.includes("ERR_NAME_NOT_RESOLVED")
      ) {
        errorMsg =
          "Network error - Cannot reach server. Check your internet connection and API configuration.";
      } else if (error.response?.status === 401) {
        errorMsg = "Unauthorized - Please login again";
      } else if (error.response?.status === 404) {
        errorMsg = "API endpoint not found";
      } else if (error.response?.data?.message) {
        errorMsg = error.response.data.message;
      } else if (error.message) {
        errorMsg = error.message;
      }

      setError(errorMsg);
      Alert.alert("Error", errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const renderChat = ({ item }: { item: Chat }) => {
    // Safety check: ensure participants array exists
    if (!item.participants || !Array.isArray(item.participants)) {
      console.warn(`[Chat List] Chat ${item._id} has invalid participants:`, item.participants);
      return null;
    }

    const otherParticipant = item.participants.find(
      (p) => p.user?._id !== currentUserId,
    );

    const participantInfo = getParticipantInfo(otherParticipant);
    const isFromMe =
      String(item.lastMessage?.sender?._id) === String(currentUserId);
    const isGroup = item.convoType === "group";

    const formatLastMessage = () => {
      if (!item.lastMessage?.text) return "No messages yet";
      if (!isFromMe && item.lastMessage?.sender && isGroup) {
        // Prefix with sender's username in group chats
        return `${item.lastMessage.sender.username || "Unknown"}: ${item.lastMessage.text}`;
      }
      return isFromMe ? `You: ${item.lastMessage.text}` : item.lastMessage.text;
    };

    // Determine Chat Title - Use helper function
    const chatTitle =
      isGroup && item.title
        ? item.title
        : participantInfo.username;

    // Add visual indicator for invalid/incomplete data
    const hasInvalidData = !participantInfo.isValid && !isGroup;

    return (
      <TouchableOpacity
        style={[
          styles.chatItem,
          {
            borderBottomColor: colors.border,
            backgroundColor: hasInvalidData ? colors.card : colors.card,
            opacity: hasInvalidData ? 0.6 : 1,
          },
        ]}
        onPress={() => {
          if (!participantInfo.userId && !isGroup) {
            Alert.alert(
              "Unable to Open Chat",
              "This chat has incomplete participant data. Please try again or contact support."
            );
            return;
          }
          router.push({
            pathname: "/chat/detail",
            params: {
              chatId: item._id,
              otherUserId: participantInfo.userId || "",
              otherUsername: participantInfo.username || "",
            },
          });
        }}
      >
        <Image source={{ uri: participantInfo.profilePicture }} style={styles.avatar} />
        <View style={styles.chatContent}>
          <ThemedText type="subtitle">
            {chatTitle}
            {hasInvalidData && " ⚠️"}
          </ThemedText>
          <Text
            style={[
              styles.lastMessage,
              { color: colors.textTertiary },
              getUnreadCount(item.unreadCount, currentUserId) > 0 && {
                color: colors.text,
                fontWeight: "bold",
              },
            ]}
            numberOfLines={1}
          >
            {formatLastMessage()}
          </Text>
        </View>
        {getUnreadCount(item.unreadCount, currentUserId) > 0 && (
          <View style={[styles.unreadBadge, { backgroundColor: colors.tint }]}>
            <Text style={[styles.unreadText, { color: colors.background }]}>
              {getUnreadCount(item.unreadCount, currentUserId)}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
        <TopHeaderComponent />
        <SearchBarComponent />
        <StoriesReelsComponent />
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: colors.text }]}>Loading chats...</Text>
          <Text style={[styles.connectionStatus, { color: colors.tint }]}>
            {isConnected ? "🟢 Connected" : "🔴 Connecting..."}
          </Text>
        </View>
      </ThemedView>
    );
  }

  if (error && chats.length === 0) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
        <TopHeaderComponent />
        <SearchBarComponent />
        <StoriesReelsComponent />
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.error }]}>⚠️ Error: {error}</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.tint }]}
            onPress={() => {
              setLoading(true);
              fetchChats();
            }}
          >
            <Text style={[styles.retryButtonText, { color: colors.background }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  const handlePlusPress = () => {
    Alert.alert("New Chat", "Choose chat type", [
      { text: "Direct Message", onPress: () => router.push("/chat/add") },
      { text: "New Group", onPress: () => router.push("/create-group") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleUserSelect = (userId: string) => {
    setSelectedUserId(userId);
    setProfileModalVisible(true);
  };

  const handleMessageFromProfile = (
    chatId: string,
    otherUserId: string,
    otherUsername: string,
  ) => {
    // setProfileModalVisible(false);
    // Navigate to the chat detail screen
    router.push({
      pathname: "/chat/detail",
      params: {
        chatId,
        otherUserId,
        otherUsername,
      },
    });
  };

  // --- MAIN RENDER ---
  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Header - now includes username switcher */}
      <TopHeaderComponent />
      <SearchBarComponent />
      <StoriesReelsComponent />

      {loading && chats.length === 0 ? (
        // Show skeleton loaders while loading
        <View style={styles.chatsContainer}>
          <FlatList
            data={[1, 2, 3, 4, 5]}
            renderItem={() => <ChatSkeleton />}
            keyExtractor={(_, i) => `skeleton-${i}`}
            showsVerticalScrollIndicator={false}
            scrollEnabled={true}
          />
        </View>
      ) : chats.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No chats yet. Start your first chat!
          </Text>
          <TouchableOpacity
            style={[styles.plusButtonCenter, { backgroundColor: colors.background, borderColor: colors.tint }]}
            onPress={handlePlusPress}
          >
            <Ionicons name="add" size={48} color={colors.tint} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.chatsContainer}>
          <FlatList
            data={chats}
            renderItem={(props) => {
              const result = renderChat(props);
              return result; // renderChat returns null if chat is invalid
            }}
            keyExtractor={(item) => item._id}
            showsVerticalScrollIndicator={false}
          />
          <TouchableOpacity
            style={[styles.plusButtonBottom, { backgroundColor: colors.tint }]}
            onPress={handlePlusPress}
          >
            <Ionicons name="add" size={24} color={colors.background} />
          </TouchableOpacity>
        </View>
      )}

      {/* Profile Modal */}
      <Modal
        visible={profileModalVisible}
        animationType="slide"
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setProfileModalVisible(false)}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          {selectedUserId && (
            <OtherProfileScreen
              userId={selectedUserId}
              onMessage={handleMessageFromProfile}
            />
          )}
        </View>
      </Modal>
    </ThemedView>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
  },
  connectionStatus: {
    fontSize: 14,
    marginTop: 8,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  chatContent: {
    flex: 1,
  },
  lastMessage: {
    marginTop: 4,
  },
  unreadBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  unreadText: {
    fontSize: 12,
    fontWeight: "bold",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  plusButtonCenter: {
    alignSelf: "center",
    borderRadius: 50,
    padding: 20,
    borderWidth: 2,
  },
  chatsContainer: {
    flex: 1,
  },
  plusButtonBottom: {
    position: "absolute",
    bottom: 20,
    right: 20,
    borderRadius: 50,
    width: 56,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    shadowColor: 'rgba(0,0,0,0.3)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalContainer: {
    flex: 1,
  },
  closeButton: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 20,
    padding: 10,
  },
});
