/**
 * The Home Assistant theme variables the cards read, with the values of the default HA theme. The glass
 * comes from the cards themselves; these only supply text, divider and accent colours.
 */
export type HaTheme = 'light' | 'dark';

export const HA_THEME_VARS: Record<HaTheme, Record<string, string>> = {
  light: {
    '--primary-color': '#03a9f4',
    '--text-primary-color': '#ffffff',
    '--primary-text-color': '#212121',
    '--secondary-text-color': '#727272',
    '--divider-color': 'rgba(0, 0, 0, 0.12)',
    '--warning-color': '#ffa600',
    '--card-background-color': '#ffffff',
    '--primary-background-color': '#fafafa',
    '--mdc-icon-size': '24px',
  },
  dark: {
    '--primary-color': '#03a9f4',
    '--text-primary-color': '#ffffff',
    '--primary-text-color': '#e1e1e1',
    '--secondary-text-color': '#9b9b9b',
    '--divider-color': 'rgba(225, 225, 225, 0.12)',
    '--warning-color': '#ffa600',
    '--card-background-color': '#1c1c1c',
    '--primary-background-color': '#111111',
    '--mdc-icon-size': '24px',
  },
};
