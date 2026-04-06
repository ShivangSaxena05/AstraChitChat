import { useEffect, useState, useCallback } from 'react';
import type { Message } from './useChatSocket';

export type ListItem =
  | { type: 'message'; data: Message }
  | { type: 'dateSeparator'; date: string; dateKey: string };

/**
 * Custom hook to group messages by date with separators
 * Returns a list ready for FlatList rendering
 */
export const useGroupedMessages = (messages: Message[]) => {
  const [groupedMessages, setGroupedMessages] = useState<ListItem[]>([]);

  const formatDateSeparator = useCallback(
    (dateString: string): { display: string; key: string } => {
      const messageDate = new Date(dateString);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const isToday = messageDate.toDateString() === today.toDateString();
      const isYesterday =
        messageDate.toDateString() === yesterday.toDateString();

      if (isToday) {
        return { display: 'Today', key: 'today' };
      } else if (isYesterday) {
        return { display: 'Yesterday', key: 'yesterday' };
      } else {
        return {
          display: messageDate.toLocaleDateString(),
          key: messageDate.toDateString(),
        };
      }
    },
    [],
  );

  const groupMessagesByDate = useCallback(
    (msgs: Message[]): ListItem[] => {
      const result: ListItem[] = [];
      let currentDateKey = '';

      msgs.forEach((message) => {
        const { display, key } = formatDateSeparator(message.createdAt);

        if (key !== currentDateKey) {
          result.push({ type: 'dateSeparator', date: display, dateKey: key });
          currentDateKey = key;
        }
        result.push({ type: 'message', data: message });
      });

      return result;
    },
    [formatDateSeparator],
  );

  useEffect(() => {
    if (messages.length > 0) {
      setGroupedMessages(groupMessagesByDate(messages));
    }
  }, [messages, groupMessagesByDate]);

  return groupedMessages;
};
