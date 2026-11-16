import React from 'react';
import {View,Text,TouchableOpacity,Pressable,StyleSheet,Platform} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
export default function PlaybackLock({locked,visible,onLock,onUnlock}:{locked:boolean;visible:boolean;onLock:()=>void;onUnlock:()=>void}) {
 if(Platform.OS!=='android'||(!locked&&!visible))return null;
 return <View style={[StyleSheet.absoluteFill,{zIndex:10000}]} pointerEvents="box-none">
  {locked&&<Pressable accessibilityLabel="Pantalla bloqueada" style={StyleSheet.absoluteFill} onPress={()=>{}}/>}
  <TouchableOpacity accessibilityRole="button" accessibilityLabel={locked?'Mantén pulsado para desbloquear controles':'Bloquear controles'} accessibilityHint={locked?'Mantén pulsado durante un segundo para recuperar los controles':undefined}
   onPress={locked?undefined:onLock} onLongPress={locked?onUnlock:undefined} delayLongPress={700}
   accessibilityActions={locked?[{name:'activate',label:'Desbloquear controles'}]:undefined} onAccessibilityAction={locked?onUnlock:undefined}
   style={{position:'absolute',left:16,bottom:78,minHeight:48,minWidth:48,padding:12,flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'rgba(20,20,20,0.8)',borderRadius:6}}>
   <Ionicons name={locked?'lock-closed':'lock-open-outline'} size={22} color="#fff"/>{locked&&<Text style={{color:'#fff',fontSize:12}}>Mantén pulsado</Text>}
  </TouchableOpacity>
 </View>;
}
