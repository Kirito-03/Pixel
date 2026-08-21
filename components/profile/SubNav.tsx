import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface SubNavProps {
    tabs: { id: string; label: string }[];
    activeTab: string;
    onTabPress: (tabId: string) => void;
    colors: any;
    theme: string;
}

export const SubNav: React.FC<SubNavProps> = ({ tabs, activeTab, onTabPress }) => {
    return (
        <View style={styles.container}>
            {tabs.map((tab) => (
                <TouchableOpacity
                    key={tab.id}
                    style={[styles.tab, activeTab === tab.id && styles.tabActive]}
                    onPress={() => onTabPress(tab.id)}
                >
                    <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
                        {tab.label}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#1a1a1a',
        marginBottom: 30,
    },
    tab: {
        paddingVertical: 12,
        paddingHorizontal: 4,
        marginRight: 40,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabActive: {
        borderBottomColor: '#E50914',
    },
    tabText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#666666',
        letterSpacing: 1,
    },
    tabTextActive: {
        color: '#FFFFFF',
    },
});
