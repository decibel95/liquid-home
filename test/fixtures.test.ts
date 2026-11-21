import { describe, expect, it } from 'vitest';
import { LIGHT_FIXTURES, brightnessOnly, colourHs, colourTemp, dimmed, effectList, group, off, onOffOnly, rgbw, rgbww, unavailable } from './fixtures/lights';

describe('derived light fixtures (the fixture set)', () => {
  it('has the eleven cases with unique entity ids', () => {
    const ids = Object.values(LIGHT_FIXTURES).map((make) => make().entity_id);
    expect(ids).toHaveLength(11);
    expect(new Set(ids).size).toBe(11);
  });

  it('covers the cases the demo lacks', () => {
    expect(dimmed().attributes.brightness).toBe(26);
    expect(unavailable().state).toBe('unavailable');
    expect(off().state).toBe('off');
    expect(brightnessOnly().attributes.supported_color_modes).toEqual(['brightness']);
    expect(onOffOnly().attributes.supported_color_modes).toEqual(['onoff']);
    expect(group().attributes.entity_id).toHaveLength(3);
    expect(effectList().attributes.effect_list).toEqual(['rainbow', 'off']);
    expect(colourTemp().attributes.color_temp_kelvin).toBe(2631);
    expect(colourHs().attributes.hs_color).toEqual([345, 75]);
    expect(rgbw().attributes.rgbw_color).toHaveLength(4);
    expect(rgbww().attributes.rgbww_color).toHaveLength(5);
  });

  it('group members resolve to fixtures', () => {
    const ids = new Set(Object.values(LIGHT_FIXTURES).map((make) => make().entity_id));
    for (const member of group().attributes.entity_id as string[]) expect(ids.has(member)).toBe(true);
  });

  it('returns fresh objects', () => {
    const a = dimmed();
    a.attributes.brightness = 1;
    expect(dimmed().attributes.brightness).toBe(26);
  });
});
