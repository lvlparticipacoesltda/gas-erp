import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, useColors } from '../../theme';

/** Marcador de destino — ícone home laranja/branco (mesma paleta do entregador). */
export function DestinationMarker({ emphasized = false }: { emphasized?: boolean }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View
      style={[styles.wrap, emphasized ? styles.wrapEmphasized : null]}
      collapsable={false}
    >
      <Ionicons name="home" size={24} color={colors.primary} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.primary,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6,
  },
  wrapEmphasized: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 4,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 10,
  },
}));
