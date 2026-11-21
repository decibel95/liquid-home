import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import './custom.css';

// The live card component is added with the cards (P16).
export default {
  extends: DefaultTheme,
} satisfies Theme;
