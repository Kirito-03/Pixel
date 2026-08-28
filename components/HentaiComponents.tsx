import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { NSFWAnime } from '../services/nsfwApi';

export const HentaiCard = ({ item, onPress }: { item: NSFWAnime, onPress: () => void }) => {
  const [imageError, setImageError] = useState(false);
  const isWeb = Platform.OS === 'web';
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={[styles.cardOuter, isWeb ? ({ cursor: 'pointer' } as any) : null]}
    >
      <View style={styles.card}>
        <View style={styles.posterBox}>
          {(!item.poster_path || imageError) ? (
            <View style={{flex:1, backgroundColor:'#222', justifyContent:'center', alignItems:'center'}}>
              <Text style={{color:'#666', fontWeight:'bold'}}>18+</Text>
            </View>
          ) : (
            <Image
              source={{ uri: item.poster_path }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
          )}
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>Finalizado</Text>
          </View>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  cardOuter: {
    flex: 1,
    minWidth: 140,
  },
  card: {
    width: '100%',
  },
  posterBox: {
    width: '100%',
    aspectRatio: 0.7,
    backgroundColor: '#222',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 8,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'left',
  },
  statusBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: '#E50914',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  }
});
