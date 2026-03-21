import React from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { ThemedView } from './themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';

const ProfileSkeleton = () => {
  const colorScheme = useColorScheme();
  const shimmerAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const shimmer = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    );
    shimmer.start();
  }, []);

  const shimmerStyle = {
    backgroundColor: colorScheme === 'dark' ? '#333' : '#f0f0f0',
    transform: [{
      translateX: shimmerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-200, 200],
      }),
    }],
  };

  return (
    <ThemedView style={styles.container}>
      {/* Cover Photo Skeleton */}
      <View style={styles.coverSkeleton} />

      {/* Header Skeleton */}
      <View style={styles.headerSkeleton}>
        <View style={styles.avatarSkeleton} />
        <View style={styles.infoSkeleton}>
          <View style={styles.usernameSkeleton} />
          <View style={styles.bioSkeleton} />
          <View style={styles.statsSkeleton}>
            <View style={styles.statSkeleton} />
            <View style={styles.statSkeleton} />
            <View style={styles.statSkeleton} />
          </View>
        </View>
        <View style={styles.buttonSkeleton} />
      </View>

      {/* Posts Skeleton */}
      <View style={styles.postsSkeleton}>
        {[1,2,3].map(i => (
          <View key={i} style={styles.postSkeleton}>
            <View style={styles.postHeaderSkeleton} />
            <View style={styles.postMediaSkeleton} />
            <View style={styles.postContentSkeleton} />
          </View>
        ))}
      </View>
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  coverSkeleton: {
    width: '100%',
    height: 200,
    backgroundColor: '#e0e0e0',
    borderRadius: 0,
  },
  headerSkeleton: {
    flexDirection: 'row',
    padding: 20,
    backgroundColor: 'transparent',
    marginTop: -50,
    borderRadius: 20,
  },
  avatarSkeleton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#e0e0e0',
    marginRight: 16,
  },
  infoSkeleton: {
    flex: 1,
    justifyContent: 'center',
  },
  usernameSkeleton: {
    width: 120,
    height: 20,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    marginBottom: 8,
  },
  bioSkeleton: {
    width: 200,
    height: 14,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    marginBottom: 16,
  },
  statsSkeleton: {
    flexDirection: 'row',
  },
  statSkeleton: {
    flex: 1,
    alignItems: 'center',
    marginRight: 20,
  },
  buttonSkeleton: {
    width: 80,
    height: 40,
    backgroundColor: '#e0e0e0',
    borderRadius: 20,
    alignSelf: 'center',
  },
  postsSkeleton: {
    padding: 16,
  },
  postSkeleton: {
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  postHeaderSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  postMediaSkeleton: {
    height: 250,
    backgroundColor: '#e0e0e0',
    borderRadius: 12,
    marginBottom: 12,
  },
  postContentSkeleton: {
    height: 16,
    width: '70%',
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
  },
});

export default ProfileSkeleton;

