import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, View, Text, TouchableOpacity, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
export default function PlaybackLock({locked,visible,onLock,onUnlock}:{locked:boolean;visible:boolean;onLock:()=>void;onUnlock:()=>void}) {
  const [awake,setAwake]=useState(true);
  const opacity=useRef(new Animated.Value(1)).current;
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const clear=useCallback(()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;}},[]);
  const reveal=useCallback(()=>{
    clear();setAwake(true);
    Animated.timing(opacity,{toValue:1,duration:140,useNativeDriver:true}).start();
    if(locked)timer.current=setTimeout(()=>{
      timer.current=null;
      Animated.timing(opacity,{toValue:0,duration:220,useNativeDriver:true}).start(({finished})=>{if(finished)setAwake(false);});
    },1800);
  },[locked,clear,opacity]);
  useEffect(()=>{reveal();return()=>{clear();opacity.stopAnimation();};},[locked,reveal,clear,opacity]);
  if(Platform.OS!=='android'||(!locked&&!visible))return null;
  return <View style={[StyleSheet.absoluteFill,{zIndex:10000}]} pointerEvents="box-none">
    {locked&&<Pressable accessibilityRole="button" accessibilityLabel="Pantalla bloqueada. Toca para mostrar cómo desbloquear" style={StyleSheet.absoluteFill} onPress={reveal}/>}
    <Animated.View pointerEvents={!locked||awake?'auto':'none'} accessibilityElementsHidden={locked&&!awake}
      importantForAccessibility={locked&&!awake?'no-hide-descendants':'auto'}
      style={{position:'absolute',left:16,bottom:78,opacity:locked?opacity:1}}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={locked?'Mantén pulsado para desbloquear controles':'Bloquear controles'} accessibilityHint={locked?'Mantén pulsado durante un segundo para recuperar los controles':undefined}
        onPress={locked?reveal:onLock} onPressIn={clear} onPressOut={locked?reveal:undefined} onLongPress={locked?onUnlock:undefined} delayLongPress={700}
        accessibilityActions={locked?[{name:'activate',label:'Desbloquear controles'}]:undefined} onAccessibilityAction={locked?onUnlock:undefined}
        style={{minHeight:48,minWidth:48,padding:12,flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'rgba(20,20,20,0.8)',borderRadius:6}}>
        <Ionicons name={locked?'lock-closed':'lock-open-outline'} size={22} color="#fff"/>{locked&&<Text style={{color:'#fff',fontSize:12}}>Mantén pulsado</Text>}
      </TouchableOpacity>
    </Animated.View>
  </View>;
}
