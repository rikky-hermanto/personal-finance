import { motion } from 'framer-motion';

interface PlantProps {
  stage: 0 | 1 | 2 | 3;
  isRecommended?: boolean;
  isPeakDropped?: boolean;
  onClick?: () => void;
  ariaLabel: string;
}

// Helper: single tree shape
const Tree = ({ x, trunkH, canopyR, trunkW = 3, color1 = '#52796F', color2 = '#354F52' }: {
  x: number; trunkH: number; canopyR: number; trunkW?: number; color1?: string; color2?: string;
}) => (
  <g>
    <rect x={x - trunkW / 2} y={108 - trunkH} width={trunkW} height={trunkH} rx={1.5} fill="#354F52" />
    <circle cx={x} cy={108 - trunkH - canopyR * 0.6} r={canopyR} fill={color1} />
    <circle cx={x} cy={108 - trunkH - canopyR * 0.8} r={canopyR * 0.7} fill={color2} />
  </g>
);

const stages = [
  // Stage 0 — single tall old tree (slightly twisted)
  <g key="s0">
    <ellipse cx="40" cy="108" rx="22" ry="6" fill="#8B7355" />
    {/* gnarled trunk */}
    <path d="M 38 108 Q 36 90 38 75 Q 40 60 37 45" stroke="#354F52" strokeWidth="5" strokeLinecap="round" fill="none" />
    <path d="M 42 108 Q 44 90 42 75 Q 40 60 43 45" stroke="#354F52" strokeWidth="3" strokeLinecap="round" fill="none" />
    {/* sparse canopy */}
    <circle cx="39" cy="42" r="16" fill="#52796F" />
    <circle cx="36" cy="38" r="10" fill="#354F52" />
    <circle cx="44" cy="40" r="8" fill="#52796F" />
    {/* aged texture hints */}
    <circle cx="24" cy="50" r="6" fill="#84A98C" opacity="0.6" />
    <circle cx="54" cy="48" r="5" fill="#52796F" opacity="0.5" />
  </g>,
  // Stage 1 — old tree + falling seeds
  <g key="s1">
    <ellipse cx="40" cy="108" rx="22" ry="6" fill="#8B7355" />
    <path d="M 38 108 Q 36 90 38 75 Q 40 60 37 45" stroke="#354F52" strokeWidth="5" strokeLinecap="round" fill="none" />
    <path d="M 42 108 Q 44 90 42 75 Q 40 60 43 45" stroke="#354F52" strokeWidth="3" strokeLinecap="round" fill="none" />
    <circle cx="39" cy="42" r="16" fill="#52796F" />
    <circle cx="36" cy="38" r="10" fill="#354F52" />
    <circle cx="44" cy="40" r="8" fill="#52796F" />
    <circle cx="24" cy="50" r="6" fill="#84A98C" opacity="0.6" />
    <circle cx="54" cy="48" r="5" fill="#52796F" opacity="0.5" />
    {/* falling seeds */}
    {[{ cx: 28, cy: 68 }, { cx: 34, cy: 74 }, { cx: 48, cy: 66 }, { cx: 52, cy: 74 }, { cx: 40, cy: 80 }, { cx: 22, cy: 78 }].map((s, i) => (
      <ellipse key={i} cx={s.cx} cy={s.cy} rx="2" ry="3" fill="#52796F" opacity="0.6" />
    ))}
  </g>,
  // Stage 2 — old tree + 2 flanking saplings + seeds
  <g key="s2">
    <ellipse cx="40" cy="108" rx="28" ry="6" fill="#8B7355" />
    {/* left small sapling */}
    <Tree x={16} trunkH={22} canopyR={9} trunkW={2} color1="#84A98C" color2="#52796F" />
    {/* right small sapling */}
    <Tree x={64} trunkH={20} canopyR={8} trunkW={2} color1="#84A98C" color2="#52796F" />
    {/* old center tree */}
    <path d="M 38 108 Q 36 90 38 72 Q 40 58 37 42" stroke="#354F52" strokeWidth="5" strokeLinecap="round" fill="none" />
    <path d="M 42 108 Q 44 90 42 72 Q 40 58 43 42" stroke="#354F52" strokeWidth="3" strokeLinecap="round" fill="none" />
    <circle cx="39" cy="39" r="18" fill="#52796F" />
    <circle cx="36" cy="35" r="11" fill="#354F52" />
    <circle cx="44" cy="37" r="9" fill="#52796F" />
    {/* falling seeds */}
    {[{ cx: 30, cy: 76 }, { cx: 50, cy: 74 }, { cx: 40, cy: 82 }].map((s, i) => (
      <ellipse key={i} cx={s.cx} cy={s.cy} rx="2" ry="3" fill="#52796F" opacity="0.5" />
    ))}
  </g>,
  // Stage 3 — mini forest (5 trees, varying heights)
  <g key="s3">
    <ellipse cx="40" cy="108" rx="36" ry="7" fill="#8B7355" />
    {/* background trees */}
    <Tree x={12}  trunkH={18} canopyR={8}  trunkW={2}   color1="#84A98C" color2="#52796F" />
    <Tree x={68}  trunkH={16} canopyR={7}  trunkW={2}   color1="#84A98C" color2="#52796F" />
    {/* mid trees */}
    <Tree x={22}  trunkH={28} canopyR={12} trunkW={3}   color1="#52796F" color2="#354F52" />
    <Tree x={58}  trunkH={26} canopyR={11} trunkW={3}   color1="#52796F" color2="#354F52" />
    {/* center old tree (tallest) */}
    <path d="M 38 108 Q 36 88 38 68 Q 40 52 37 36" stroke="#354F52" strokeWidth="6" strokeLinecap="round" fill="none" />
    <path d="M 42 108 Q 44 88 42 68 Q 40 52 43 36" stroke="#354F52" strokeWidth="4" strokeLinecap="round" fill="none" />
    <circle cx="39" cy="32" r="22" fill="#52796F" />
    <circle cx="35" cy="28" r="14" fill="#354F52" />
    <circle cx="44" cy="30" r="12" fill="#52796F" />
    {/* canopy highlights */}
    <circle cx="32" cy="24" r="7" fill="#84A98C" opacity="0.5" />
    <circle cx="46" cy="26" r="6" fill="#84A98C" opacity="0.4" />
  </g>,
];

export const PlantForest = ({ stage, isRecommended, onClick, ariaLabel }: PlantProps) => {
  const inner = (
    <motion.g
      key={stage}
      initial={{ opacity: 0.7, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      style={{ transformOrigin: '40px 108px' }}
    >
      {stages[stage]}
    </motion.g>
  );

  return (
    <svg
      viewBox="0 0 80 120"
      role="img"
      aria-label={ariaLabel}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', overflow: 'visible', width: '100%', height: '100%' }}
    >
      {isRecommended ? (
        <motion.g
          animate={{ filter: ['drop-shadow(0 0 0px #84A98C)', 'drop-shadow(0 0 7px #84A98C)', 'drop-shadow(0 0 0px #84A98C)'] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          {inner}
        </motion.g>
      ) : inner}
    </svg>
  );
};
