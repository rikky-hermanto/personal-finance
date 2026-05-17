import { motion } from 'framer-motion';

interface PlantProps {
  stage: 0 | 1 | 2 | 3;
  isRecommended?: boolean;
  isPeakDropped?: boolean;
  onClick?: () => void;
  ariaLabel: string;
}

const stages = [
  // Stage 0 — bare branches
  <g key="s0">
    <ellipse cx="40" cy="108" rx="20" ry="5.5" fill="#8B7355" />
    {/* trunk */}
    <line x1="40" y1="107" x2="40" y2="76" stroke="#354F52" strokeWidth="4" strokeLinecap="round" />
    {/* bare branches */}
    <line x1="40" y1="84" x2="26" y2="72" stroke="#354F52" strokeWidth="2.5" strokeLinecap="round" />
    <line x1="40" y1="84" x2="54" y2="72" stroke="#354F52" strokeWidth="2.5" strokeLinecap="round" />
    <line x1="40" y1="78" x2="28" y2="62" stroke="#354F52" strokeWidth="2" strokeLinecap="round" />
    <line x1="40" y1="78" x2="52" y2="62" stroke="#354F52" strokeWidth="2" strokeLinecap="round" />
    <line x1="40" y1="76" x2="40" y2="58" stroke="#354F52" strokeWidth="2" strokeLinecap="round" />
  </g>,
  // Stage 1 — buds at branch tips
  <g key="s1">
    <ellipse cx="40" cy="108" rx="20" ry="5.5" fill="#8B7355" />
    <line x1="40" y1="107" x2="40" y2="76" stroke="#354F52" strokeWidth="4" strokeLinecap="round" />
    <line x1="40" y1="84" x2="26" y2="72" stroke="#354F52" strokeWidth="2.5" strokeLinecap="round" />
    <line x1="40" y1="84" x2="54" y2="72" stroke="#354F52" strokeWidth="2.5" strokeLinecap="round" />
    <line x1="40" y1="78" x2="28" y2="62" stroke="#354F52" strokeWidth="2" strokeLinecap="round" />
    <line x1="40" y1="78" x2="52" y2="62" stroke="#354F52" strokeWidth="2" strokeLinecap="round" />
    <line x1="40" y1="76" x2="40" y2="58" stroke="#354F52" strokeWidth="2" strokeLinecap="round" />
    {/* buds */}
    <circle cx="26" cy="72" r="3" fill="#D4A5A5" />
    <circle cx="54" cy="72" r="3" fill="#D4A5A5" />
    <circle cx="28" cy="62" r="2.5" fill="#D4A5A5" />
    <circle cx="52" cy="62" r="2.5" fill="#D4A5A5" />
    <circle cx="40" cy="58" r="3" fill="#D4A5A5" />
  </g>,
  // Stage 2 — flowers
  <g key="s2">
    <ellipse cx="40" cy="108" rx="20" ry="5.5" fill="#8B7355" />
    <line x1="40" y1="107" x2="40" y2="76" stroke="#354F52" strokeWidth="4" strokeLinecap="round" />
    <line x1="40" y1="84" x2="26" y2="72" stroke="#354F52" strokeWidth="2.5" strokeLinecap="round" />
    <line x1="40" y1="84" x2="54" y2="72" stroke="#354F52" strokeWidth="2.5" strokeLinecap="round" />
    <line x1="40" y1="78" x2="28" y2="62" stroke="#354F52" strokeWidth="2" strokeLinecap="round" />
    <line x1="40" y1="78" x2="52" y2="62" stroke="#354F52" strokeWidth="2" strokeLinecap="round" />
    <line x1="40" y1="76" x2="40" y2="58" stroke="#354F52" strokeWidth="2" strokeLinecap="round" />
    {/* small canopy of leaves */}
    <circle cx="34" cy="68" r="8" fill="#84A98C" opacity="0.7" />
    <circle cx="46" cy="68" r="8" fill="#84A98C" opacity="0.7" />
    <circle cx="40" cy="62" r="8" fill="#52796F" opacity="0.7" />
    {/* flowers */}
    {[{ cx: 26, cy: 70 }, { cx: 54, cy: 70 }, { cx: 28, cy: 60 }, { cx: 52, cy: 60 }, { cx: 40, cy: 56 }].map((pos, i) => (
      <g key={i}>
        <circle cx={pos.cx} cy={pos.cy} r="4" fill="#D4A5A5" />
        <circle cx={pos.cx} cy={pos.cy} r="1.5" fill="#F5C5C5" />
      </g>
    ))}
  </g>,
  // Stage 3 — full canopy + golden fruits
  <g key="s3">
    <ellipse cx="40" cy="108" rx="22" ry="6" fill="#8B7355" />
    <line x1="40" y1="107" x2="40" y2="72" stroke="#354F52" strokeWidth="5" strokeLinecap="round" />
    <line x1="40" y1="82" x2="24" y2="66" stroke="#354F52" strokeWidth="3" strokeLinecap="round" />
    <line x1="40" y1="82" x2="56" y2="66" stroke="#354F52" strokeWidth="3" strokeLinecap="round" />
    {/* full leafy canopy */}
    <circle cx="40" cy="60" r="22" fill="#84A98C" />
    <circle cx="32" cy="56" r="14" fill="#52796F" />
    <circle cx="48" cy="56" r="14" fill="#52796F" />
    <circle cx="40" cy="50" r="12" fill="#354F52" />
    {/* golden fruits */}
    <ellipse cx="24" cy="66" rx="4" ry="5" fill="#E9B44C" />
    <ellipse cx="56" cy="64" rx="4" ry="5" fill="#E9B44C" />
    <ellipse cx="30" cy="72" rx="3.5" ry="4.5" fill="#E9B44C" />
    <ellipse cx="50" cy="72" rx="3.5" ry="4.5" fill="#E9B44C" />
    <ellipse cx="38" cy="76" rx="3.5" ry="4.5" fill="#E9B44C" />
    {/* fruit stems */}
    <line x1="24" cy="61" x2="25" y2="64" stroke="#354F52" strokeWidth="1" />
    <line x1="56" y1="59" x2="56" y2="62" stroke="#354F52" strokeWidth="1" />
  </g>,
];

export const PlantFruitTree = ({ stage, isRecommended, onClick, ariaLabel }: PlantProps) => {
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
