import { motion } from 'framer-motion';

interface PlantProps {
  stage: 0 | 1 | 2 | 3;
  isRecommended?: boolean;
  isPeakDropped?: boolean;
  onClick?: () => void;
  ariaLabel: string;
}

const stages = [
  // Stage 0 — thin sapling
  <g key="s0">
    <ellipse cx="40" cy="108" rx="18" ry="5" fill="#8B7355" />
    <line x1="40" y1="106" x2="40" y2="82" stroke="#52796F" strokeWidth="2" strokeLinecap="round" />
    <ellipse cx="37" cy="80" rx="5" ry="3" fill="#84A98C" transform="rotate(-15 37 80)" />
    <ellipse cx="43" cy="80" rx="5" ry="3" fill="#84A98C" transform="rotate(15 43 80)" />
  </g>,
  // Stage 1 — young tree with round canopy
  <g key="s1">
    <ellipse cx="40" cy="108" rx="20" ry="5.5" fill="#8B7355" />
    <rect x="38" y="82" width="4" height="26" rx="2" fill="#354F52" />
    <circle cx="40" cy="74" r="14" fill="#84A98C" />
    <circle cx="40" cy="72" r="10" fill="#52796F" />
  </g>,
  // Stage 2 — mid tree with layered canopy
  <g key="s2">
    <ellipse cx="40" cy="108" rx="22" ry="6" fill="#8B7355" />
    <rect x="37" y="74" width="6" height="34" rx="3" fill="#354F52" />
    {/* canopy layers */}
    <circle cx="40" cy="66" r="18" fill="#84A98C" />
    <circle cx="40" cy="64" r="14" fill="#52796F" />
    <circle cx="40" cy="62" r="10" fill="#354F52" />
    {/* edge detail leaves */}
    <ellipse cx="24" cy="70" rx="6" ry="4" fill="#84A98C" />
    <ellipse cx="56" cy="70" rx="6" ry="4" fill="#84A98C" />
    <ellipse cx="28" cy="58" rx="5" ry="3.5" fill="#84A98C" />
    <ellipse cx="52" cy="58" rx="5" ry="3.5" fill="#84A98C" />
  </g>,
  // Stage 3 — full tree with forked trunk and vibrant canopy
  <g key="s3">
    <ellipse cx="40" cy="108" rx="24" ry="6" fill="#8B7355" />
    {/* trunk with fork */}
    <path d="M 38 108 L 38 80 L 32 60" stroke="#354F52" strokeWidth="5" strokeLinecap="round" fill="none" />
    <path d="M 42 108 L 42 80 L 48 60" stroke="#354F52" strokeWidth="5" strokeLinecap="round" fill="none" />
    <path d="M 40 80 L 40 65" stroke="#354F52" strokeWidth="5" strokeLinecap="round" fill="none" />
    {/* large layered canopy */}
    <circle cx="40" cy="56" r="26" fill="#84A98C" />
    <circle cx="34" cy="50" r="18" fill="#52796F" />
    <circle cx="46" cy="50" r="18" fill="#52796F" />
    <circle cx="40" cy="46" r="16" fill="#354F52" />
    {/* canopy highlight */}
    <circle cx="36" cy="42" r="8" fill="#52796F" opacity="0.6" />
    <circle cx="44" cy="44" r="6" fill="#84A98C" opacity="0.5" />
    {/* outer accent leaves */}
    <circle cx="18" cy="62" r="8" fill="#84A98C" />
    <circle cx="62" cy="62" r="8" fill="#84A98C" />
    <circle cx="22" cy="46" r="7" fill="#52796F" />
    <circle cx="58" cy="46" r="7" fill="#52796F" />
  </g>,
];

export const PlantTree = ({ stage, isRecommended, onClick, ariaLabel }: PlantProps) => {
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
