import { motion } from 'framer-motion';
import { CARD_ENTER_SECONDS, GLYPH_PULSE_SECONDS } from '@/lib/journey/harvest/harvestMotion';
import type { HarvestItem } from '@/types/Journey';

interface Props {
  item: HarvestItem;
  animated: boolean;
}

export const HarvestCard = ({ item, animated }: Props) => (
  <motion.li
    data-testid="harvest-card"
    initial={animated ? { opacity: 0, y: 8 } : false}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: animated ? CARD_ENTER_SECONDS : 0, ease: 'easeOut' }}
    className="flex items-start gap-3 rounded-lg bg-muted/40 px-4 py-3"
  >
    <motion.span
      aria-hidden
      className="mt-0.5 select-none text-lg"
      animate={animated ? { scale: [1, 1.3, 1] } : undefined}
      transition={{ duration: GLYPH_PULSE_SECONDS, ease: 'easeOut' }}
    >
      {item.glyph}
    </motion.span>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium leading-snug">{item.title}</p>
      {item.line && <p className="mt-0.5 text-xs text-muted-foreground">{item.line}</p>}
    </div>
  </motion.li>
);
