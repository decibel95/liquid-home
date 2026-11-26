// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { LitElement, html, render } from 'lit';
import { ICONS, PALETTE, tone, UNAVAILABLE_POWER_OPACITY } from '@decibel95/liquid-core';
import { headerIconStyles, renderHeaderIcon } from '../../../src/cards/shared/header-icon';

afterEach(() => {
  document.body.innerHTML = '';
});

const mount = (glyph: keyof typeof ICONS, state: Parameters<typeof renderHeaderIcon>[1], colour?: string) => {
  const div = document.createElement('div');
  document.body.append(div);
  render(renderHeaderIcon(glyph, state, colour), div);
  return div.querySelector('.hicon') as HTMLElement;
};

describe('header device icon (plan 2.8)', () => {
  it.each(['bulb', 'blinds', 'door', 'fan'] as const)('%s: the ICONS path at 22 px and stroke 1.9, aria-hidden, not focusable', (glyph) => {
    const el = mount(glyph, 'inactive');
    expect(el.tagName).toBe('SPAN');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.hasAttribute('tabindex')).toBe(false);
    expect(el.querySelector('button, a, [tabindex]')).toBeNull();
    const svg = el.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('22');
    expect(svg.getAttribute('height')).toBe('22');
    expect(svg.getAttribute('stroke-width')).toBe('1.9');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('path')!.getAttribute('d')).toBe(ICONS[glyph]);
  });

  it.each(['dark', 'light'] as const)('active draws the colour it is given (the toned neutral of a cover or fan on %s glass)', (glass) => {
    const neutral = tone(PALETTE.neutral, glass);
    const el = mount('fan', 'active', neutral);
    expect(el.style.color).not.toBe('var(--lc-fg3)');
    expect(el.style.color.length).toBeGreaterThan(0);
    expect(el.classList.contains('un')).toBe(false);
  });

  it('inactive (off, closed) is --lc-fg3; unavailable is --lc-fg3 with the class un', () => {
    expect(mount('blinds', 'inactive', '#ff0000').style.color).toBe('var(--lc-fg3)');
    const un = mount('door', 'unavailable', '#ff0000');
    expect(un.style.color).toBe('var(--lc-fg3)');
    expect(un.classList.contains('un')).toBe(true);
  });

  it('the shared rules: flex none, the core unavailable opacity, the titles take the rest', () => {
    const css = headerIconStyles.cssText.replace(/\s+/g, ' ');
    expect(css).toContain('.hicon { display: flex; flex: none; }');
    expect(css).toContain(`.hicon.un { opacity: ${UNAVAILABLE_POWER_OPACITY}; }`);
    expect(css).toContain('.hicon + .titles { flex: 1; }');
  });

  it('the icon precedes .titles in the header (no layout in happy-dom; truncation is shown by the 390 px screenshot)', async () => {
    class T extends LitElement {
      static override styles = [headerIconStyles];
      protected override render() {
        return html`<header>${renderHeaderIcon('bulb', 'active', 'red')}<div class="titles"><h2>A very long name for a light in a narrow card</h2></div></header>`;
      }
    }
    customElements.define('test-hicon-host', T);
    const el = document.createElement('test-hicon-host') as T;
    document.body.append(el);
    await el.updateComplete;
    const header = el.shadowRoot!.querySelector('header')!;
    expect(header.firstElementChild!.classList.contains('hicon')).toBe(true);
    expect(header.firstElementChild!.nextElementSibling!.classList.contains('titles')).toBe(true);
  });
});
