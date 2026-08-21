import React, { useState } from 'react';
import { View, Text, Switch, TouchableOpacity, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../services/firebase';
import { SubNav } from './SubNav';

const accountTabs = [
    { id: 'personal', label: 'INFORMACIÓN PERSONAL' },
    { id: 'preferences', label: 'PREFERENCIAS' },
];

const securityTabs = [
    { id: 'history', label: 'Historial de Sesiones' },
    { id: 'devices', label: 'Dispositivos Activos' },
];

export const ContentPanel = ({
    styles,
    activeTab,
    user,
    handleEmailVerification,
    handlePasswordReset,
    adultContentEnabled,
    setAdultContentEnabled,
    colors,
    theme,
    notificationsEnabled,
    setNotificationsEnabled,
    handleChangeProfile,
    navigation,
    handleAdminAccess,
    currentProfile,
    getAvatarUrl,
    handleChangeAvatar,
    fileInputRef,
    handleWebFileSelect
}: any) => {
    const [accountSubTab, setAccountSubTab] = useState('personal');
    const [securitySubTab, setSecuritySubTab] = useState('history');

    const renderAccountContent = () => {
        switch (accountSubTab) {
            case 'personal':
                return (
                    <View>
                        {/* Detalles de la cuenta */}
                        <View style={styles.cardWrapper}>
                            <View style={styles.cardHeader}>
                                <Ionicons name="mail-outline" size={16} color="#E50914" />
                                <Text style={styles.cardTitle}>Detalles de la Cuenta</Text>
                            </View>
                            <View style={styles.cardContent}>
                                <View style={styles.row}>
                                    <View style={styles.rowInfo}>
                                        <Text style={styles.rowLabel}>Email</Text>
                                        <Text style={styles.rowDesc}>{user?.email}</Text>
                                    </View>
                                    <TouchableOpacity style={styles.actionBtn}>
                                        <Ionicons name="pencil" size={14} color="#999999" style={styles.actionBtnIcon} />
                                        <Text style={styles.actionBtnText}>CAMBIAR</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={[styles.row, styles.rowNoBorder]}>
                                    <View style={styles.rowInfo}>
                                        <Text style={styles.rowLabel}>Contraseña</Text>
                                        <Text style={styles.rowDesc}>*************</Text>
                                    </View>
                                    <TouchableOpacity style={styles.actionBtn} onPress={handlePasswordReset}>
                                        <Ionicons name="pencil" size={14} color="#999999" style={styles.actionBtnIcon} />
                                        <Text style={styles.actionBtnText}>CAMBIAR</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>

                        {/* Perfil Público */}
                        <View style={styles.cardWrapper}>
                            <View style={styles.cardHeader}>
                                <Ionicons name="person-outline" size={16} color="#E50914" />
                                <Text style={styles.cardTitle}>Perfil Público</Text>
                            </View>
                            <View style={styles.cardContent}>
                                <View style={styles.row}>
                                    <View style={styles.rowInfo}>
                                        <Text style={styles.rowLabel}>Nombre del perfil</Text>
                                        <Text style={styles.rowDesc}>{currentProfile?.name}</Text>
                                    </View>
                                    <TouchableOpacity style={styles.actionBtn}>
                                        <Ionicons name="pencil" size={14} color="#999999" style={styles.actionBtnIcon} />
                                        <Text style={styles.actionBtnText}>CAMBIAR</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={[styles.row, styles.rowNoBorder]}>
                                    <View style={styles.rowInfo}>
                                        <Text style={styles.rowLabel}>Foto de perfil</Text>
                                        <View style={styles.profilePicEditContainer}>
                                            <View style={styles.profilePicPreview}>
                                                <Image
                                                    source={{ uri: getAvatarUrl() }}
                                                    style={{ width: '100%', height: '100%', borderRadius: 4 }}
                                                />
                                                <View style={styles.profilePicRedDot} />
                                            </View>
                                            <TouchableOpacity style={styles.actionBtn} onPress={handleChangeAvatar}>
                                                <Ionicons name="camera-outline" size={14} color="#999999" style={styles.actionBtnIcon} />
                                                <Text style={styles.actionBtnText}>CAMBIAR FOTO</Text>
                                            </TouchableOpacity>
                                        </View>
                                        <Text style={styles.profilePicMeta}>JPG, PNG — Máx. 5MB</Text>
                                    </View>
                                </View>
                            </View>
                        </View>

                        {Platform.OS === 'web' && (
                            <input
                                ref={(el: HTMLInputElement) => { fileInputRef.current = el; }}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={handleWebFileSelect}
                            />
                        )}
                    </View>
                );
            case 'preferences':
                return (
                    <View style={styles.cardWrapper}>
                        <View style={styles.cardHeader}>
                            <Text style={styles.cardTitle}>Preferencias de Contenido</Text>
                        </View>
                        <View style={[styles.row, styles.rowNoBorder]}>
                            <View style={styles.rowInfo}>
                                <Text style={styles.rowLabel}>Contenido +18</Text>
                                <Text style={styles.rowDesc}>Mostrar contenido para adultos y NSFW</Text>
                            </View>
                            <Switch
                                value={adultContentEnabled}
                                onValueChange={setAdultContentEnabled}
                                trackColor={{ false: '#333', true: '#E50914' }}
                                thumbColor={adultContentEnabled ? '#fff' : '#ccc'}
                            />
                        </View>
                    </View>
                );
            default:
                return null;
        }
    };

    // Placeholder renderers for other tabs to keep the UI complete
    const renderSecurityContent = () => (
        <View style={styles.cardWrapper}>
            <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Actividad</Text>
            </View>
            <View style={[styles.row, styles.rowNoBorder]}>
                <View style={styles.rowInfo}>
                    <Text style={styles.rowLabel}>Historial no disponible</Text>
                    <Text style={styles.rowDesc}>Esta sección está en desarrollo.</Text>
                </View>
            </View>
        </View>
    );

    const renderHeader = (title: string, subtitle?: string) => (
        <View style={styles.sectionTitleContainer}>
            <View style={styles.sectionTitleRow}>
                <View style={styles.sectionTitleRedBar} />
                <Text style={styles.sectionTitle}>{title}</Text>
            </View>
            {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
        </View>
    );

    switch (activeTab) {
        case 'account':
            return (
                <View>
                    {renderHeader('Cuenta', 'GESTIONA TU INFORMACIÓN PERSONAL')}
                    <SubNav tabs={accountTabs} activeTab={accountSubTab} onTabPress={setAccountSubTab} colors={colors} theme={theme} />
                    {renderAccountContent()}
                </View>
            );
        case 'security':
            return (
                <View>
                    {renderHeader('Seguridad')}
                    <SubNav tabs={securityTabs} activeTab={securitySubTab} onTabPress={setSecuritySubTab} colors={colors} theme={theme} />
                    {renderSecurityContent()}
                </View>
            );
        case 'settings':
            return (
                <View>
                    {renderHeader('Configuración')}
                    <View style={styles.cardWrapper}>
                        <View style={styles.cardHeader}><Text style={styles.cardTitle}>General</Text></View>
                        <View style={styles.row}>
                            <View style={styles.rowInfo}>
                                <Text style={styles.rowLabel}>Notificaciones</Text>
                                <Text style={styles.rowDesc}>Recibir alertas de nuevos estrenos</Text>
                            </View>
                            <Switch value={notificationsEnabled} onValueChange={setNotificationsEnabled} trackColor={{ false: '#333', true: '#E50914' }} />
                        </View>
                        <View style={[styles.row, styles.rowNoBorder]}>
                            <View style={styles.rowInfo}>
                                <Text style={styles.rowLabel}>Idioma</Text>
                                <Text style={styles.rowDesc}>Español (Latam)</Text>
                            </View>
                        </View>
                    </View>
                    <View style={styles.cardWrapper}>
                        <View style={styles.cardHeader}><Text style={styles.cardTitle}>Gestión de Perfiles</Text></View>
                        <TouchableOpacity style={[styles.row, styles.rowNoBorder]} onPress={handleChangeProfile}>
                            <Text style={styles.rowDesc}>Cambiar de perfil</Text>
                            <Ionicons name="chevron-forward" size={20} color="#666" />
                        </TouchableOpacity>
                    </View>
                </View>
            );
        case 'appearance':
            return (
                <View>
                    {renderHeader('Apariencia')}
                    <View style={styles.cardWrapper}>
                        <View style={[styles.row, styles.rowNoBorder]}>
                            <View style={styles.rowInfo}>
                                <Text style={styles.rowLabel}>Tema</Text>
                                <Text style={styles.rowDesc}>Modo Oscuro</Text>
                            </View>
                            <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Apariencia' as never)}>
                                <Text style={styles.actionBtnText}>PERSONALIZAR</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            );
        case 'admin':
            return (
                <View>
                    {renderHeader('Administración')}
                    <View style={styles.cardWrapper}>
                        <View style={styles.cardHeader}><Text style={styles.cardTitle}>Panel de Control</Text></View>
                        <View style={[styles.row, styles.rowNoBorder]}>
                            <View style={styles.rowInfo}>
                                <Text style={styles.rowLabel}>Acceso Administrador</Text>
                                <Text style={styles.rowDesc}>Gestionar anime, usuarios y configuración</Text>
                            </View>
                            <TouchableOpacity style={[styles.actionBtn, { borderColor: '#E50914', backgroundColor: 'rgba(229,9,20,0.1)' }]} onPress={handleAdminAccess}>
                                <Text style={[styles.actionBtnText, { color: '#E50914' }]}>ENTRAR AL PANEL</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            );
        default:
            return null;
    }
};
