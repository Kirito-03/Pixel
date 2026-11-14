import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Pressable } from 'react-native';
import { colors } from '../theme';

interface CategoriesMenuProps {
  visible: boolean;
  onClose: () => void;
  onSelectCategory: (categoryId: string, categoryName: string) => void;
  currentCategoryId?: string;
}

const categories = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'mi-lista', label: 'Mi lista' },
  { id: 'popular_anime', label: 'Anime Popular' },
  { id: 'airing_anime', label: 'Anime en Emisión' },
  { id: 'top_anime', label: 'Mejor Anime' },
];

export default function CategoriesMenu({ visible, onClose, onSelectCategory, currentCategoryId }: CategoriesMenuProps) {
  const handleSelect = (categoryId: string, categoryLabel: string) => {
    onSelectCategory(categoryId, categoryLabel);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.menuContainer}>
          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
          >
            {categories.map((category, index) => {
              const isCurrentCategory = category.id === currentCategoryId;
              return (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.categoryItem,
                    index === 0 && styles.firstItem,
                    isCurrentCategory && styles.highlightedItem,
                  ]}
                  onPress={() => handleSelect(category.id, category.label)}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      isCurrentCategory && styles.highlightedText,
                    ]}
                  >
                    {category.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Botón de cerrar */}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <View style={styles.closeCircle}>
              <Text style={styles.closeIcon}>✕</Text>
            </View>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'flex-start',
    paddingTop: 120,
  },
  menuContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollView: {
    flex: 1,
  },
  categoryItem: {
    paddingVertical: 18,
  },
  firstItem: {
    paddingTop: 18,
  },
  highlightedItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  categoryText: {
    color: colors.textGray,
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '400',
  },
  highlightedText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 17,
  },
  closeButton: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingBottom: 40,
  },
  closeCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIcon: {
    fontSize: 24,
    color: colors.background,
    fontWeight: '300',
  },
});

