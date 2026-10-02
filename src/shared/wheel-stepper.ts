/**
 * Turns a stream of wheel events into discrete zoom steps: one step per scroll gesture.
 *
 * Trackpads (and smooth-scrolling mice) send dozens of wheel events for a single swipe or
 * notch, which used to jump several zoom levels at once. A step fires on the first event
 * of a gesture; further events are ignored until the wheel has been quiet for `quietMs`,
 * or until the direction reverses.
 */
export function createWheelStepper(onStep: (direction: 1 | -1) => void, quietMs = 180) {
  let lastEvent = -Infinity;
  let lastDirection: 1 | -1 | 0 = 0;
  return (deltaY: number, now: number) => {
    if (deltaY === 0) return;
    const direction: 1 | -1 = deltaY < 0 ? 1 : -1;
    const newGesture = now - lastEvent > quietMs || direction !== lastDirection;
    lastEvent = now;
    lastDirection = direction;
    if (newGesture) onStep(direction);
  };
}
