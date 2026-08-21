import { StyleSheet, Platform } from 'react-native';

export const createStyles = (colors: any, theme: string) => StyleSheet.create({
    pageWrapper: {
        flex: 1,
        backgroundColor: '#000000',
    },
    container: {
        flex: 1,
        width: '100%',
        backgroundColor: '#000000',
        flexDirection: 'row',
    },
    
    // --- Sidebar ---
    sidebar: {
        width: 320,
        backgroundColor: '#000000',
        paddingVertical: 40,
        alignItems: 'flex-start',
    },
    sidebarHeader: {
        alignItems: 'flex-start',
        marginBottom: 40,
        paddingHorizontal: 30,
        width: '100%',
    },
    avatarContainer: {
        width: 80,
        height: 80,
        position: 'relative',
        marginBottom: 20,
    },
    avatar: {
        width: '100%',
        height: '100%',
        borderRadius: 4,
    },
    avatarBadge: {
        position: 'absolute',
        top: -4,
        right: -4,
        width: 12,
        height: 12,
        backgroundColor: '#E50914',
        borderRadius: 2,
    },
    username: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFFFFF',
        marginBottom: 4,
    },
    userEmail: {
        fontSize: 12,
        color: '#666666',
    },

    // --- Sidebar Menu ---
    menuContainer: {
        width: '100%',
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 30,
        borderLeftWidth: 3,
        borderLeftColor: 'transparent',
    },
    menuItemActive: {
        backgroundColor: 'rgba(229, 9, 20, 0.05)',
        borderLeftColor: '#E50914',
    },
    menuIcon: {
        marginRight: 16,
    },
    menuText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#666666',
    },
    menuTextActive: {
        color: '#FFFFFF',
        fontWeight: '700',
    },

    // --- Sidebar Footer ---
    sidebarFooter: {
        marginTop: 'auto',
        width: '100%',
        padding: 30,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderWidth: 1,
        borderColor: '#330000',
        borderRadius: 4,
        gap: 10,
        backgroundColor: 'rgba(229, 9, 20, 0.05)',
    },
    logoutText: {
        color: '#E50914',
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: 1,
    },

    // --- Content Area ---
    contentArea: {
        flex: 1,
        paddingTop: 40,
        paddingHorizontal: 60,
    },
    mainTitleHeader: {
        alignItems: 'center',
        marginBottom: 60,
        position: 'relative',
    },
    mainTitleText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 2,
        flexDirection: 'row',
        alignItems: 'center',
    },
    mainTitleRedBar: {
        width: 3,
        height: 14,
        backgroundColor: '#E50914',
        marginRight: 8,
    },
    
    // --- Specific Content Styles ---
    sectionTitleContainer: {
        marginBottom: 30,
    },
    sectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    sectionTitleRedBar: {
        width: 5,
        height: 30,
        backgroundColor: '#E50914',
        marginRight: 12,
    },
    sectionTitle: {
        fontSize: 36,
        fontWeight: '900',
        color: '#FFFFFF',
        letterSpacing: -1,
    },
    sectionSubtitle: {
        color: '#666666',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1.5,
        marginTop: 8,
        textTransform: 'uppercase',
    },
    
    // --- Cards ---
    cardWrapper: {
        marginBottom: 30,
        borderWidth: 1,
        borderColor: '#1a1a1a',
        backgroundColor: '#050505',
        borderRadius: 4,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#1a1a1a',
        backgroundColor: '#0a0a0a',
    },
    cardTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginLeft: 10,
    },
    cardContent: {
        padding: 0,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 24,
        borderBottomWidth: 1,
        borderBottomColor: '#111111',
    },
    rowNoBorder: {
        borderBottomWidth: 0,
    },
    rowInfo: {
        flex: 1,
    },
    rowLabel: {
        fontSize: 12,
        color: '#666666',
        fontWeight: '700',
        letterSpacing: 1,
        marginBottom: 6,
        textTransform: 'uppercase',
    },
    rowDesc: {
        fontSize: 15,
        color: '#FFFFFF',
        fontWeight: '500',
    },
    
    // --- Actions ---
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: '#222222',
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.02)',
    },
    actionBtnText: {
        color: '#999999',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1,
    },
    actionBtnIcon: {
        marginRight: 8,
    },
    
    // --- Profile Picture Edit in Content ---
    profilePicEditContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
    },
    profilePicPreview: {
        width: 60,
        height: 60,
        borderRadius: 4,
        backgroundColor: '#1a1a1a',
        position: 'relative',
    },
    profilePicRedDot: {
        position: 'absolute',
        top: -3,
        right: -3,
        width: 10,
        height: 10,
        backgroundColor: '#E50914',
        borderRadius: 2,
    },
    profilePicMeta: {
        marginTop: 8,
        fontSize: 11,
        color: '#444444',
        fontWeight: '600',
        letterSpacing: 1,
    },

    // --- Modals ---
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: '#111111',
        borderRadius: 4,
        padding: 30,
        borderWidth: 1,
        borderColor: '#222',
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: '#fff',
        marginBottom: 10,
    },
    modalSubtitle: {
        fontSize: 15,
        color: '#888',
        marginBottom: 30,
        lineHeight: 22,
    },
    modalButtons: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 15,
    },
    modalCancelButton: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#333',
    },
    modalCancelText: {
        color: '#aaa',
        fontSize: 14,
        fontWeight: '600',
    },
    modalConfirmButton: {
        backgroundColor: '#E50914',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 4,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalConfirmText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
});
