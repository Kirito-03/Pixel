import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const EpisodePlayer: React.FC<any> = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Reproductor Desactivado (Native Stub)</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 16,
  },
});

export default EpisodePlayer;
