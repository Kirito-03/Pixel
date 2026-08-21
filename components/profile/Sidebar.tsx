import React from 'react';
import { View, Text, TouchableOpacity, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useAdmin } from '../../contexts/AdminContext';

const SidebarItem = ({ id, icon, label, activeTab, colors, styles, onPress }: any) => (
    <TouchableOpacity
        style={[styles.menuItem, activeTab === id && styles.menuItemActive]}
        onPress={() => onPress(id)}
    >
        <Ionicons
            name={icon}
            size={20}
            color={activeTab === id ? '#FFFFFF' : '#666666'}
            style={styles.menuIcon}
        />
        <Text style={[styles.menuText, activeTab === id && styles.menuTextActive]}>{label}</Text>
    </TouchableOpacity>
);

export const Sidebar = ({
    styles,
    currentProfile,
    getAvatarUrl,
    setImageError,
    activeTab,
    setActiveTab,
    setLogoutVisible,
    colors,
    navigation
}: any) => {
    const { user } = useAuth();
    const { isAdmin } = useAdmin();
    return (
        <View style={styles.sidebar}>
            <View style={styles.sidebarHeader}>
                <View style={styles.avatarContainer}>
                    <Image
                        key={`${currentProfile?.avatar_url || 'default-avatar'}`}
                        source={{ uri: getAvatarUrl() }}
                        style={styles.avatar}
                        onError={() => setImageError(true)}
                    />
                    <View style={styles.avatarBadge} />
                </View>
                <Text style={styles.username}>{currentProfile?.name}</Text>
                <Text style={styles.userEmail}>{user?.email}</Text>
            </View>

            <View style={styles.menuContainer}>
                <SidebarItem id="account" icon="person-outline" label="Cuenta" activeTab={activeTab} colors={colors} styles={styles} onPress={setActiveTab} />
                <SidebarItem id="security" icon="lock-closed-outline" label="Seguridad" activeTab={activeTab} colors={colors} styles={styles} onPress={setActiveTab} />
                <SidebarItem id="settings" icon="settings-outline" label="Configuración" activeTab={activeTab} colors={colors} styles={styles} onPress={setActiveTab} />
                <SidebarItem id="appearance" icon="color-palette-outline" label="Apariencia" activeTab={activeTab} colors={colors} styles={styles} onPress={setActiveTab} />
                {isAdmin && (
                    <SidebarItem id="admin" icon="shield-checkmark-outline" label="Administrador" activeTab={activeTab} colors={colors} styles={styles} onPress={setActiveTab} />
                )}
            </View>

            <View style={styles.sidebarFooter}>
                <TouchableOpacity style={styles.logoutButton} onPress={() => setLogoutVisible(true)}>
                    <Ionicons name="log-out-outline" size={16} color="#E50914" />
                    <Text style={styles.logoutText}>CERRAR SESIÓN</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};
