import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import Svg, { Path, Line, Defs, LinearGradient, RadialGradient, Stop, Rect, Ellipse } from 'react-native-svg';
import { useTheme } from './ui';

/**
 * Ambiance « bureau du futur » des thèmes Cristal et Nuit, derrière tout l'écran :
 * halo au plafond, bandeau LED courbe, sol brillant quadrillé en perspective.
 * Rien n'est dessiné pour les thèmes Temple et Bois.
 */
export function Ambiance() {
  const theme = useTheme();
  const { width: L, height: H } = useWindowDimensions();
  if (theme !== 'cristal' && theme !== 'nuit') return null;
  const led = theme === 'nuit' ? '#ff8ae5' : '#a0e6ff';
  const grille = theme === 'nuit' ? '#b678ff' : '#5fd4ff';
  const halo = theme === 'nuit' ? '#ff4fd8' : '#288cc8';

  // Sol : lignes qui fuient vers un point au-dessus de l'écran, et lignes horizontales de plus en plus serrées
  const solHaut = H * 0.62;
  const fuite = { x: L / 2, y: solHaut - H * 0.5 };
  const rayons = [];
  for (let k = -8; k <= 8; k++) {
    const xBas = L / 2 + k * (L / 5);
    const t = (solHaut - fuite.y) / (H - fuite.y);
    rayons.push({ x1: fuite.x + (xBas - fuite.x) * t, y1: solHaut, x2: xBas, y2: H });
  }
  const traverses = [];
  for (let i = 1; i <= 9; i++) traverses.push(solHaut + (H - solHaut) * (i / 9) ** 1.8);

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: L, height: H }}>
      <Svg width={L} height={H}>
        <Defs>
          <RadialGradient id="plafond" cx="50%" cy="0%" rx="70%" ry="35%">
            <Stop offset="0%" stopColor={halo} stopOpacity={0.32} />
            <Stop offset="100%" stopColor={halo} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="sol" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={grille} stopOpacity={0} />
            <Stop offset="100%" stopColor={grille} stopOpacity={0.16} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={L} height={H * 0.45} fill="url(#plafond)" />
        {/* Bandeau LED courbe au plafond */}
        <Path d={`M${L * 0.12} ${-4} Q${L / 2} ${48} ${L * 0.88} ${-4}`} stroke={led} strokeWidth={6} opacity={0.18} fill="none" />
        <Path d={`M${L * 0.12} ${-4} Q${L / 2} ${48} ${L * 0.88} ${-4}`} stroke={led} strokeWidth={2} opacity={0.8} fill="none" />
        {/* Sol brillant */}
        <Rect x={0} y={solHaut} width={L} height={H - solHaut} fill="url(#sol)" />
        {rayons.map((r, i) => <Line key={`r${i}`} {...r} stroke={grille} strokeWidth={1} opacity={0.14} />)}
        {traverses.map((y, i) => <Line key={`t${i}`} x1={0} y1={y} x2={L} y2={y} stroke={grille} strokeWidth={1} opacity={0.05 + 0.1 * (i / 9)} />)}
        <Ellipse cx={L / 2} cy={H} rx={L * 0.6} ry={H * 0.08} fill={halo} opacity={0.12} />
      </Svg>
    </View>
  );
}
