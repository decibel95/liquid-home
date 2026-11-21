/**
 * Media only: no focus rings. Programmatic focus (a sheet opening, focus returning to its tile)
 * would draw them in the recordings. Every shadow root gets a rule that switches them off.
 * Import this before the cards, so it patches attachShadow first.
 */
const original = Element.prototype.attachShadow;
Element.prototype.attachShadow = function (init: ShadowRootInit) {
  const root = original.call(this, init);
  const style = document.createElement('style');
  style.textContent = '*:focus, *:focus-visible { outline: none !important; }';
  root.append(style);
  return root;
};
