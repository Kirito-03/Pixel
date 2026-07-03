// Tipos para React Navigation

export type AdminStackParamList = {
    AdminLogin: undefined;
    AdminDashboard: undefined;
    AdminImport: undefined;
    AdminBot: undefined;
    AnimeList: undefined;
    AnimeForm: {
        mode: 'create' | 'edit';
        animeId?: number;
    };
    EpisodeManager: {
        animeId: number;
        animeTitle?: string;
    };
};

export type RootStackParamList = {
    Ingreso: undefined;
    Registro: undefined;
    SeleccionPerfil: undefined;
    Principal: {
        selectedProfile?: any;
        userId?: string;
    };
    Apariencia: undefined;
    Descargas: undefined;
};

declare global {
    namespace ReactNavigation {
        interface RootParamList extends RootStackParamList { }
    }
}
