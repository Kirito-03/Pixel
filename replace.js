const fs = require('fs'); 
const file = 'screens/admin/EpisodeManagerScreen.tsx'; 
let code = fs.readFileSync(file, 'utf8'); 

code = code.replace(
  'const renderEpisodeItem = ({ item }: any) => (', 
  `const handleMarkAllReady = async () => {
    try {
        await adminApiService.markAllEpisodesReady(animeId);
        await loadEpisodes();
    } catch(e: any) {
        Alert.alert('Error', e.message || 'Error');
    }
};

const renderEpisodeItem = ({ item }: any) => (`
); 

code = code.replace(
  'Borrar local\r\n                        </Text>\r\n                    </TouchableOpacity>\r\n                </View>', 
  `Borrar local\r
                        </Text>\r
                    </TouchableOpacity>\r
                    <TouchableOpacity style={styles.optionChip} onPress={handleMarkAllReady}>\r
                        <Ionicons name="checkmark-done-outline" size={14} color={adminColors.textSecondary} />\r
                        <Text style={styles.optionChipText}>Listo a todos</Text>\r
                    </TouchableOpacity>\r
                </View>`
); 

fs.writeFileSync(file, code);
