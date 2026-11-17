import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { useProgressSync } from '../contexts/ProgressSyncContext';
import { useProfile } from '../contexts/ProfileContext';
import { useTheme } from '../contexts/ThemeContext';
import ConfirmDialog from './ConfirmDialog';
export default function ProgressBackupPanel() {
  const sync=useProgressSync(), {currentProfile}=useProfile(), {colors}=useTheme();
  const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{setConfirm(false);setError('');},[sync.scope?.uid,sync.scope?.profileId]);
  const count=Object.keys(sync.records).length;
  const title=sync.legacyCount?'Hay lecturas anteriores sin importar':sync.pendingCount?`${sync.pendingCount} cambios pendientes de respaldo`:sync.failed?'No se pudo confirmar el respaldo':sync.lastSyncedAt?'Respaldo confirmado en la nube':'Comprobando respaldo';
  const action=async()=>{setBusy(true);setError('');try{await sync.syncNow();}catch{setError('No pudimos conectar. El avance permanece en este dispositivo; reintentaremos automáticamente.');}finally{setBusy(false);}};
  return <View style={{padding:20,gap:12,backgroundColor:colors.card,marginBottom:16}}>
    <Text style={{color:colors.text,fontWeight:'700',fontSize:16}}>Respaldo de lecturas y H</Text>
    <Text accessibilityLiveRegion="polite" style={{color:colors.text}}>{title}</Text>
    <Text style={{color:colors.textSecondary,lineHeight:21}}>{count} lecturas y títulos H en este perfil. {sync.lastSyncedAt?`Última confirmación: ${new Date(sync.lastSyncedAt).toLocaleString('es-PE')}. `:''}Usa esta misma cuenta y perfil en Android y web para continuar.</Text>
    {(sync.pendingCount>0||sync.legacyCount>0)&&<Text style={{color:colors.textSecondary}}>Los cambios pendientes todavía necesitan conexión. Espera la confirmación antes de borrar los datos de la app.</Text>}
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Sincronizar progreso ahora" disabled={busy||sync.syncing} onPress={action} style={{padding:12,minHeight:44,backgroundColor:colors.cardLight,alignSelf:'flex-start'}}>
      {busy||sync.syncing?<ActivityIndicator color={colors.text}/>:<Text style={{color:colors.text,fontWeight:'600'}}>Sincronizar ahora</Text>}
    </TouchableOpacity>
    {sync.legacyCount>0&&<>
      <Text style={{color:colors.textSecondary,lineHeight:21}}>Encontramos {sync.legacyCount} lecturas de versiones anteriores en este dispositivo. Aún no pertenecen a un perfil en la nube.</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Importar lecturas anteriores a este perfil" onPress={()=>{setError('');setConfirm(true);}} style={{padding:12,minHeight:44,backgroundColor:colors.cardLight}}><Text style={{color:colors.text,fontWeight:'600'}}>Importar a {currentProfile?.name || 'este perfil'}</Text></TouchableOpacity>
    </>}
    {!!error&&<Text accessibilityRole="alert" style={{color:colors.textSecondary}}>{error}</Text>}
    <ConfirmDialog visible={confirm} title="Guardar tus lecturas anteriores" destructive={false} iconName="cloud-upload-outline" confirmText="Importar y respaldar" cancelText="Cancelar" errorText={error}
      message={`Estas lecturas se guardarán en «${currentProfile?.name || 'este perfil'}». Confirma que son de este perfil. Si ya existe avance en la nube, se conservará el cambio más reciente.`}
      onCancel={()=>setConfirm(false)} onConfirm={async()=>{try{await sync.importLegacy();setConfirm(false);}catch{setError('Todavía no se confirmó el respaldo. Conservamos tus lecturas anteriores; reintenta con conexión.');}}}/>
  </View>;
}
