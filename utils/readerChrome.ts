/** Scroll hysteresis: small movements cannot repeatedly reverse the controls. */
export function createReaderChromeController() {
  let topVisible = true, bottomVisible = true, lastY = 0, direction = 0, distance = 0;
  return (offset: number) => {
    const y = Math.max(0, Number.isFinite(offset) ? offset : lastY);
    const delta = y - lastY;
    lastY = y;
    if (y <= 24) topVisible = true;
    else if (y >= 112) topVisible = false;
    if (y <= 64) { bottomVisible = true; distance = 0; direction = 0; }
    else if (Math.abs(delta) >= 2) {
      const nextDirection = Math.sign(delta);
      distance = nextDirection === direction ? distance + Math.abs(delta) : Math.abs(delta);
      direction = nextDirection;
      if ((direction > 0 && distance >= 56) || (direction < 0 && distance >= 32)) {
        bottomVisible = direction < 0;
        distance = 0;
      }
    }
    return { topVisible, bottomVisible };
  };
}
