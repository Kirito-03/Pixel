import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Image,
    Switch,
    ActivityIndicator,
    Platform,
    Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { spacing } from '../theme';
import { auth } from '../services/firebase';
import { ProfileScreenProps, useProfileScreenLogic } from '../hooks/useProfileScreenLogic';

import { createStyles } from './ProfileScreen.web.styles';

import { Sidebar } from '../components/profile/Sidebar';
import { ContentPanel } from '../components/profile/ContentPanel';

export default function ProfileScreen() {
    console.log('Rendering ProfileScreen (Web)');
    const props = useProfileScreenLogic();
    const navigation = useNavigation<any>();
    const {
        navigation: nav,
        colors,
        theme,
        logoutVisible, setLogoutVisible,
        logoutLoading,
        handleLogoutAction,
    } = props;

    const [activeTab, setActiveTab] = useState('account');
    const styles = createStyles(colors, theme);

    return (
        <View style={styles.pageWrapper}>
            {/* ── TOP BAR ── */}
            <View style={topBarStyles.bar}>
                <TouchableOpacity
                    style={topBarStyles.backBtn}
                    onPress={() => navigation.goBack()}
                >
                    <Ionicons name="arrow-back" size={16} color="#666" />
                    <Text style={topBarStyles.backText}>VOLVER</Text>
                </TouchableOpacity>
                <View style={topBarStyles.titleContainer}>
                    <View style={topBarStyles.titleRedBar} />
                    <Text style={topBarStyles.title}>MI PERFIL</Text>
                </View>
                <View style={topBarStyles.backBtn} />
            </View>

            <View style={styles.container}>
                <Sidebar
                    styles={styles}
                    {...props}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                />
                <ScrollView style={styles.contentArea}>
                    <ContentPanel
                        styles={styles}
                        activeTab={activeTab}
                        {...props}
                    />
                </ScrollView>
                <Modal
                    visible={logoutVisible}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setLogoutVisible(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>Cerrar sesión</Text>
                            <Text style={styles.modalSubtitle}>¿Estás seguro de que quieres cerrar sesión?</Text>
                            <View style={styles.modalButtons}>
                                <TouchableOpacity style={styles.modalCancelButton} onPress={() => setLogoutVisible(false)}>
                                    <Text style={styles.modalCancelText}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.modalConfirmButton}
                                    onPress={handleLogoutAction}
                                    disabled={logoutLoading}
                                >
                                    {logoutLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalConfirmText}>Cerrar sesión</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            </View>
        </View>
    );
}

const topBarStyles = StyleSheet.create({
    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 30,
        paddingVertical: 20,
        backgroundColor: '#000000',
    },
    backBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minWidth: 90,
        cursor: 'pointer' as any,
    },
    backText: {
        color: '#666',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1,
    },
    titleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    titleRedBar: {
        width: 3,
        height: 14,
        backgroundColor: '#E50914',
        marginRight: 8,
    },
    title: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 2,
    },
});
