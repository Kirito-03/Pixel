import React from 'react';
import {View,Text,TouchableOpacity} from 'react-native';
import {useTheme} from '../contexts/ThemeContext';
export default function CatalogPagination({page,totalPages,onChange,disabled=false}:{page:number;totalPages:number;onChange:(page:number)=>void;disabled?:boolean}){
 const {colors}=useTheme(); if(totalPages<=1)return null;
 return <View style={{flexDirection:'row',justifyContent:'center',alignItems:'center',gap:16,paddingVertical:24}}>
  {[{label:'Anterior',target:page-1,off:page<=1}, {label:'Siguiente',target:page+1,off:page>=totalPages}].map((item,index)=><React.Fragment key={item.label}>{index===1&&<Text style={{color:colors.text}}>{page} / {totalPages}</Text>}<TouchableOpacity accessibilityRole="button" accessibilityLabel={`Página ${item.label.toLowerCase()}`} disabled={disabled||item.off} onPress={()=>onChange(item.target)} style={{minHeight:44,paddingHorizontal:14,justifyContent:'center',backgroundColor:colors.card,opacity:disabled||item.off?0.4:1}}><Text style={{color:colors.text}}>{item.label}</Text></TouchableOpacity></React.Fragment>)}
 </View>;
}
