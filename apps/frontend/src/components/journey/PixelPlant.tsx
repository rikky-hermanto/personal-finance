import { useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GARDEN_SPRITES } from '@/lib/journey/gardenSprites.generated';
import { leafBurst, type GardenLevel, type Leaf, type PlantStage } from '@/lib/journey/gardenSprite';

// Written out as whole literal strings, because Tailwind only generates classes it can find whole.
const SHEET_CLASS: Record<GardenLevel, Record<PlantStage, string>> = {
  1: {
    0: "bg-[url('/garden/l1-stage-0.png')]",
    1: "bg-[url('/garden/l1-stage-1.png')]",
    2: "bg-[url('/garden/l1-stage-2.png')]",
    3: "bg-[url('/garden/l1-stage-3.png')]",
  },
  2: {
    0: "bg-[url('/garden/l2-stage-0.png')]",
    1: "bg-[url('/garden/l2-stage-1.png')]",
    2: "bg-[url('/garden/l2-stage-2.png')]",
    3: "bg-[url('/garden/l2-stage-3.png')]",
  },
  3: {
    0: "bg-[url('/garden/l3-stage-0.png')]",
    1: "bg-[url('/garden/l3-stage-1.png')]",
    2: "bg-[url('/garden/l3-stage-2.png')]",
    3: "bg-[url('/garden/l3-stage-3.png')]",
  },
  4: {
    0: "bg-[url('/garden/l4-stage-0.png')]",
    1: "bg-[url('/garden/l4-stage-1.png')]",
    2: "bg-[url('/garden/l4-stage-2.png')]",
    3: "bg-[url('/garden/l4-stage-3.png')]",
  },
  5: {
    0: "bg-[url('/garden/l5-stage-0.png')]",
    1: "bg-[url('/garden/l5-stage-1.png')]",
    2: "bg-[url('/garden/l5-stage-2.png')]",
    3: "bg-[url('/garden/l5-stage-3.png')]",
  },
};

// A tap can never leave more than this many leaves in flight, however fast it is repeated.
const MAX_LEAVES_IN_FLIGHT = 24;

interface Props {
  levelKey: string;
  level: GardenLevel;
  label: string;
  stage: PlantStage;
}

/**
 * The garden hero plant: a generated pixel-art sheet of 8 sway frames played by a CSS animation
 * (the art carries the idle motion), plus a tap that shakes a few leaves loose.
 */
export const PixelPlant = ({ levelKey, level, label, stage }: Props) => {
  const reduceMotion = useReducedMotion();
  const [leaves, setLeaves] = useState<Leaf[]>([]);
  const nextId = useRef(0);
  const ground = GARDEN_SPRITES[level][stage].ground;

  const shake = () => {
    if (reduceMotion) return;
    const burst = leafBurst(level, stage, nextId.current);
    nextId.current += burst.length;
    setLeaves((prev) => [...prev, ...burst].slice(-MAX_LEAVES_IN_FLIGHT));
  };

  return (
    <button
      type="button"
      onClick={shake}
      data-testid={`plant-${levelKey.toLowerCase()}`}
      data-stage={stage}
      aria-label={`${label}, stage ${stage} of 3. Shake the plant`}
      className="relative block h-48 w-48 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 bg-no-repeat bg-[length:1536px_192px] [image-rendering:pixelated] animate-garden-sway motion-reduce:animate-none',
          SHEET_CLASS[level][stage],
        )}
      />
      {leaves.map((leaf) => (
        <motion.span
          key={leaf.id}
          aria-hidden="true"
          className={cn('pointer-events-none absolute left-1/2 top-1/2 -ml-[3px] -mt-[3px] h-1.5 w-1.5', leaf.colorClass)}
          initial={{ x: leaf.x, y: leaf.y, opacity: 1 }}
          animate={{ x: leaf.x + leaf.drift, y: ground, opacity: [1, 1, 0] }}
          transition={{
            duration: leaf.duration,
            ease: 'easeIn',
            opacity: { duration: leaf.duration, times: [0, 0.75, 1], ease: 'linear' },
          }}
          onAnimationComplete={() => setLeaves((prev) => prev.filter((l) => l.id !== leaf.id))}
        />
      ))}
    </button>
  );
};
