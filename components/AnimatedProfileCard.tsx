import React, { useEffect, useState } from 'react';
import { Pressable, Text, Image, View, StyleSheet, Animated } from 'react-native';

interface Profile {
  id: number;
  name: string;
  avatar_url?: string;
}

interface AnimatedProfileCardProps {
  profile: Profile;
  index: number;
  onPress: () => void;
  onLongPress: () => void;
  getCorrectedAvatarUrl: (url: string) => string;
}

export const AnimatedProfileCard: React.FC<AnimatedProfileCardProps> = ({
  profile,
  index,
  onPress,
  onLongPress,
  getCorrectedAvatarUrl,
}) => {
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(20)).current;
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 500,
        delay: index * 100,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 500,
        delay: index * 100,
        useNativeDriver: true,
      })
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.profileCard, { opacity, transform: [{ translateY }] }]}>
      <Pressable 
        onPress={onPress} 
        onLongPress={onLongPress}
        // @ts-ignore - React Native Web hover support
        onHoverIn={() => setIsHovered(true)}
        onHoverOut={() => setIsHovered(false)}
        style={styles.pressableArea}
      >
        <View style={[styles.avatarContainer, isHovered && styles.avatarContainerHover]}>
          {profile.avatar_url ? (
            <Image
              source={{ uri: getCorrectedAvatarUrl(profile.avatar_url) || '' }}
              style={styles.avatarImage}
            />
          ) : (
            <View style={styles.defaultAvatarPlaceholder}>
              <Text style={styles.defaultAvatarText}>{profile.name.charAt(0).toUpperCase()}</Text>
            </View>
          )}

          {isHovered && (
            <>
              <View style={styles.hoverCornerTopRight} />
              <View style={styles.hoverCornerBottomLeft} />
            </>
          )}
        </View>
        <Text style={[styles.profileName, isHovered && styles.profileNameHover]}>{profile.name}</Text>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  profileCard: {
    alignItems: 'center',
    width: 140,
    marginHorizontal: 10,
  },
  pressableArea: {
    alignItems: 'center',
    width: '100%',
  },
  avatarContainer: {
    width: 140,
    height: 140,
    borderRadius: 8,
    backgroundColor: '#1b1b24',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  avatarContainerHover: {
    borderColor: '#E50914',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  defaultAvatarPlaceholder: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2A2A38',
  },
  defaultAvatarText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 50,
    fontWeight: '900',
  },
  hoverCornerTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 24,
    height: 24,
    backgroundColor: '#E50914',
  },
  hoverCornerBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 24,
    height: 24,
    backgroundColor: '#E50914',
  },
  profileName: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  profileNameHover: {
    color: '#fff',
  },
});
