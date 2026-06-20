/**
 * Electric Sonic Design System — Typography Tokens
 */

import { TextStyle } from 'react-native';

export const Fonts = {
  montserrat: 'Montserrat',
  montserratSemiBold: 'Montserrat-SemiBold',
  montserratBold: 'Montserrat-Bold',
  inter: 'Inter',
  interSemiBold: 'Inter-SemiBold',
};

export const Typography: Record<string, TextStyle> = {
  displayChord: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 72,
    lineHeight: 80,
    letterSpacing: -1.44, // -0.02em
    fontWeight: '700',
  },
  headlineLg: {
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '600',
  },
  headlineLgMobile: {
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '600',
  },
  headlineMd: {
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '600',
  },
  bodyLg: {
    fontFamily: 'Inter',
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '400',
  },
  bodyMd: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  },
  labelSm: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6, // 0.05em
    fontWeight: '600',
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  base: 8,
  md: 16,
  lg: 24,
  xl: 40,
  containerMargin: 24,
  gutter: 16,
};

export const Rounded = {
  sm: 4,
  default: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};
