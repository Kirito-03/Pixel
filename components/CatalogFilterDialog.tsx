import React from 'react';
import {Modal,View,Text,ScrollView,TouchableOpacity,useWindowDimensions,Platform} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useTheme} from '../contexts/ThemeContext';
export default function CatalogFilterDialog({visible,onClose,onApply,onClear,children,title='Categorías'}:{visible:boolean;onClose:()=>void;onApply:()=>void;onClear:()=>void;children:React.ReactNode;title?:string}) {
 const {colors}=useTheme(),{height,width}=useWindowDimensions();
 return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
  <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.65)',justifyContent:'center',alignItems:'center',padding:16}}>
   <View accessibilityViewIsModal style={{width:'100%',maxWidth:640,height:Math.min(660,height*0.85),backgroundColor:colors.background,borderRadius:8,overflow:'hidden'}}>
    <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:16}}><Text style={{color:colors.text,fontSize:18,fontWeight:'700'}}>{title}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar categorías" onPress={onClose} style={{padding:10}}><Ionicons name="close" size={22} color={colors.text}/></TouchableOpacity></View>
    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{flex:1}} contentContainerStyle={{padding:16,paddingBottom:24}}>{children}</ScrollView>
    <View style={{flexDirection:'row',gap:10,padding:16}}><TouchableOpacity accessibilityRole="button" onPress={onClear} style={{padding:14,backgroundColor:colors.card}}><Text style={{color:colors.text}}>Limpiar</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" onPress={onApply} style={{flex:1,padding:14,alignItems:'center',backgroundColor:colors.text}}><Text style={{color:colors.background,fontWeight:'700'}}>Ver resultados</Text></TouchableOpacity></View>
   </View>
  </View>
 </Modal>;
}
