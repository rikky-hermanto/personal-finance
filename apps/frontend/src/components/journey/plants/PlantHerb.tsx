import { motion } from 'framer-motion';

interface PlantProps {
  stage: 0 | 1 | 2 | 3;
  isRecommended?: boolean;
  isPeakDropped?: boolean;
  onClick?: () => void;
  ariaLabel: string;
}

const stages = [
  // Stage 0 — seed in soil
  <g key="s0">
    <ellipse cx="40" cy="108" rx="22" ry="6" fill="#8B7355" />
    <ellipse cx="40" cy="105" rx="18" ry="5" fill="#A89070" />
    <circle cx="40" cy="102" r="2.5" fill="#52796F" />
  </g>,
  // Stage 1 — tiny sprout
  <g key="s1">
    <ellipse cx="40" cy="108" rx="22" ry="6" fill="#8B7355" />
    <ellipse cx="40" cy="105" rx="18" ry="5" fill="#A89070" />
    <line x1="36" y1="104" x2="34" y2="90" stroke="#52796F" strokeWidth="1.5" strokeLinecap="round" />
    <ellipse cx="31" cy="88" rx="5" ry="3" fill="#84A98C" transform="rotate(-30 31 88)" />
    <line x1="44" y1="104" x2="46" y2="88" stroke="#52796F" strokeWidth="1.5" strokeLinecap="round" />
    <ellipse cx="49" cy="86" rx="5" ry="3" fill="#84A98C" transform="rotate(30 49 86)" />
  </g>,
  // Stage 2 — small herb
  <g key="s2">
    <ellipse cx="40" cy="108" rx="24" ry="6" fill="#8B7355" />
    <ellipse cx="40" cy="105" rx="20" ry="5" fill="#A89070" />
    <line x1="36" y1="104" x2="33" y2="82" stroke="#52796F" strokeWidth="1.5" strokeLinecap="round" />
    <ellipse cx="29" cy="79" rx="6" ry="3.5" fill="#84A98C" transform="rotate(-25 29 79)" />
    <line x1="40" y1="104" x2="40" y2="76" stroke="#52796F" strokeWidth="2" strokeLinecap="round" />
    <ellipse cx="40" cy="72" rx="6" ry="3.5" fill="#52796F" />
    <line x1="44" y1="104" x2="47" y2="84" stroke="#52796F" strokeWidth="1.5" strokeLinecap="round" />
    <ellipse cx="51" cy="81" rx="6" ry="3.5" fill="#84A98C" transform="rotate(25 51 81)" />
    <line x1="32" y1="100" x2="28" y2="92" stroke="#52796F" strokeWidth="1.2" strokeLinecap="round" />
    <ellipse cx="25" cy="90" rx="5" ry="2.5" fill="#84A98C" transform="rotate(-20 25 90)" />
  </g>,
  // Stage 3 — full herb cluster with bloom
  <g key="s3">
    <ellipse cx="40" cy="108" rx="26" ry="6" fill="#8B7355" />
    <ellipse cx="40" cy="105" rx="22" ry="5" fill="#A89070" />
    {[30, 35, 40, 45, 50].map((x, idx) => {
      const heights = [70, 65, 60, 66, 72];
      return (
        <g key={idx}>
          <line x1={x} y1="104" x2={x - 2 + idx} y2={heights[idx]} stroke="#354F52" strokeWidth="1.8" strokeLinecap="round" />
          <ellipse
            cx={x - 2 + idx}
            cy={heights[idx] - 3}
            rx="7"
            ry="4"
            fill={idx === 2 ? '#354F52' : '#52796F'}
            transform={`rotate(${-20 + idx * 10} ${x} ${heights[idx]})`}
          />
        </g>
      );
    })}
    <circle cx="40" cy="56" r="4" fill="#D4A5A5" opacity="0.9" />
    <circle cx="38" cy="54" r="1.5" fill="#E8C4C4" />
  </g>,
];

export const PlantHerb = ({ stage, isRecommended, onClick, ariaLabel }: PlantProps) => {
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
