import '@testing-library/jest-dom'

// jsdom kennt die Pointer-Capture-API nicht. Radix-Primitives rufen sie bei
// Pointer-Events auf (Toast-Wischgeste, Select, Slider) und werfen sonst
// mitten im Test. Minimal-Stubs, damit der Fehler nicht die Suite verrauscht.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
}
