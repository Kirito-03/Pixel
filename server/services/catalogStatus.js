export function statusAliases(value) {
 const key=String(value || '').trim().toLowerCase();
 const groups=[['en emisión','en emision','ongoing','releasing','airing','en curso'],['finalizado','finalizada','completed','finished','completado','completada'],['hiatus','on hiatus','en pausa'],['cancelado','cancelled','canceled']];
 return groups.find(group=>group.includes(key)) || [key];
}
