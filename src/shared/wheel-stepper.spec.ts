import { createWheelStepper } from './wheel-stepper';

describe('createWheelStepper', () => {
  it('steps once for a burst of events from one gesture', () => {
    const steps: number[] = [];
    const wheel = createWheelStepper((d) => steps.push(d), 180);
    for (let t = 0; t < 600; t += 16) wheel(-4, t); // a long trackpad swipe
    expect(steps).toEqual([1]);
  });

  it('steps again after the wheel goes quiet', () => {
    const steps: number[] = [];
    const wheel = createWheelStepper((d) => steps.push(d), 180);
    wheel(-100, 0);
    wheel(-100, 50);
    wheel(-100, 400);
    expect(steps).toEqual([1, 1]);
  });

  it('steps immediately when the direction reverses', () => {
    const steps: number[] = [];
    const wheel = createWheelStepper((d) => steps.push(d), 180);
    wheel(-100, 0);
    wheel(100, 20);
    expect(steps).toEqual([1, -1]);
  });

  it('ignores zero deltas', () => {
    const steps: number[] = [];
    const wheel = createWheelStepper((d) => steps.push(d));
    wheel(0, 0);
    expect(steps).toEqual([]);
  });
});
