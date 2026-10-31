import { useEffect, useRef, useState } from 'react';
import { animate } from 'framer-motion';
import { COUNT_UP_SECONDS } from '@/lib/journey/harvest/harvestMotion';

/** Counts from the value on screen to `target`. Without animation it shows `target` at once. */
export const useCountUp = (target: number, animated: boolean, start: number = target): number => {
  const [value, setValue] = useState(animated ? start : target);
  const latest = useRef(value);

  useEffect(() => {
    if (!animated) {
      latest.current = target;
      setValue(target);
      return;
    }
    const controls = animate(latest.current, target, {
      duration: COUNT_UP_SECONDS,
      ease: 'easeOut',
      onUpdate: (v) => {
        latest.current = v;
        setValue(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [target, animated]);

  return value;
};
