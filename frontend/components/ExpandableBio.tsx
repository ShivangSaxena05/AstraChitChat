import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from './themed-text';

interface ExpandableBioProps {
  text: string;
  maxLines?: number;
}

export default function ExpandableBio({ text, maxLines = 3 }: ExpandableBioProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const router = useRouter();

  if (!text) return null;

  const handleURLPress = (url: string) => {
    Linking.openURL(url).catch(err => console.error("Couldn't open URL", err));
  };

  const handleMentionPress = (username: string) => {
    router.push({
      pathname: '/(tabs)/(tabs)/explore' as any,
      params: { q: username } 
    });
  };

  const handleHashtagPress = (tag: string) => {
    router.push({
      pathname: '/(tabs)/(tabs)/explore' as any,
      params: { q: tag }
    });
  };

  const parseText = (content: string) => {
    const regex = /(https?:\/\/[^\s]+|@[A-Za-z0-9_.-]+|#[A-Za-z0-9_.-]+)/g;
    const parts = content.split(regex);

    return parts.map((part, i) => {
      if (part.match(/^https?:\/\//)) {
        return (
          <Text key={i} onPress={() => handleURLPress(part)} style={styles.link}>
            {part}
          </Text>
        );
      } else if (part.startsWith('@')) {
        return (
          <Text key={i} onPress={() => handleMentionPress(part)} style={styles.link}>
            {part}
          </Text>
        );
      } else if (part.startsWith('#')) {
        return (
          <Text key={i} onPress={() => handleHashtagPress(part)} style={styles.link}>
            {part}
          </Text>
        );
      }
      return <Text key={i}>{part}</Text>;
    });
  };

  const handleTextLayout = useCallback((e: any) => {
    if (e.nativeEvent.lines.length > maxLines) {
      if (!isTruncated) {
        setIsTruncated(true);
      }
    }
  }, [maxLines, isTruncated]);

  return (
    <>
      <ThemedText 
        numberOfLines={isExpanded ? undefined : maxLines} 
        onTextLayout={handleTextLayout}
        style={styles.bioText}
      >
        {parseText(text)}
      </ThemedText>
      {isTruncated && !isExpanded && (
        <Text onPress={() => setIsExpanded(true)} style={styles.readMore}>
          Read more
        </Text>
      )}
      {isTruncated && isExpanded && (
        <Text onPress={() => setIsExpanded(false)} style={styles.readMore}>
          Show less
        </Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  bioText: {
    fontSize: 14,
    lineHeight: 20,
  },
  link: {
    color: '#4ADDAE',
  },
  readMore: {
    color: '#888',
    marginTop: 2,
    fontWeight: 'bold',
  }
});
