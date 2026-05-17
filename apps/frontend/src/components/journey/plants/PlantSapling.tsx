import { motion } from 'framer-motion';

interface PlantProps {
  stage: 0 | 1 | 2 | 3;
  isRecommended?: boolean;
  isPeakDropped?: boolean;
  onClick?: () => void;
  ariaLabel: string;
}

const stages = [
  // Stage 0 — acorn in soil
  <g key="s0">
    <ellipse cx="40" cy="108" rx="22" ry="6" fill="#8B7355" />
    <ellipse cx="40" cy="105" rx="18" ry="5" fill="#A89070" />
    {/* acorn body */}
    <ellipse cx="40" cy="98" rx="5" ry="6" fill="#8B6914" />
    {/* acorn cap */}
    <ellipse cx="40" cy="93" rx="6" ry="3" fill="#6B5010" />
    <line x1="40" y1="90" x2="40" y2="88" stroke="#6B5010" strokeWidth="1.2" strokeLinecap="round" />
  </g>,
  // Stage 1 — short sprout with thick base
  <g key="s1">
    <ellipse cx="40" cy="108" rx="22" ry="6" fill="#8B7355" />
    <ellipse cx="40" cy="105" rx="18" ry="5" fill="#A89070" />
    {/* visible roots */}
    <path d="M 34 106 Q 28 110 24 108" stroke="#A89070" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    <path d="M 46 106 Q 52 110 56 108" stroke="#A89070" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    {/* thick trunk */}
    <rect x="37" y="88" width="6" height="18" rx="3" fill="#52796F" />
    {/* leaves */}
    <ellipse cx="33" cy="86" rx="7" ry="4" fill="#84A98C" transform="rotate(-20 33 86)" />
    <ellipse cx="47" cy="86" rx="7" ry="4" fill="#84A98C" transform="rotate(20 47 86)" />
  </g>,
  // Stage 2 — taller sapling with stones
  <g key="s2">
    <ellipse cx="40" cy="108" rx="24" ry="6" fill="#8B7355" />
    <ellipse cx="40" cy="105" rx="20" ry="5" fill="#A89070" />
    {/* roots */}
    <path d="M 34 106 Q 26 112 20 110" stroke="#A89070" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    <path d="M 46 106 Q 54 112 60 110" stroke="#A89070" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    {/* stones */}
    <ellipse cx="26" cy="107" rx="4" ry="2.5" fill="#9CA3AF" />
    <ellipse cx="54" cy="107" rx="4" ry="2.5" fill="#9CA3AF" />
    <ellipse cx="32" cy="108" rx="3" ry="2" fill="#6B7280" />
    {/* trunk */}
    <rect x="37" y="72" width="6" height="34" rx="3" fill="#354F52" />
    {/* leaves */}
    <ellipse cx="30" cy="78" rx="9" ry="5" fill="#84A98C" transform="rotate(-25 30 78)" />
    <ellipse cx="50" cy="78" rx="9" ry="5" fill="#84A98C" transform="rotate(25 50 78)" />
    <ellipse cx="32" cy="70" rx="8" ry="4.5" fill="#52796F" transform="rotate(-15 32 70)" />
    <ellipse cx="48" cy="70" rx="8" ry="4.5" fill="#52796F" transform="rotate(15 48 70)" />
  </g>,
  // Stage 3 — full sapling with gnarled roots + stone guard
  <g key="s3">
    <ellipse cx="40" cy="108" rx="26" ry="6" fill="#8B7355" />
    <ellipse cx="40" cy="105" rx="22" ry="5" fill="#A89070" />
    {/* prominent roots */}
    <path d="M 36 106 Q 26 114 18 112" stroke="#A89070" strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d="M 44 106 Q 54 114 62 112" stroke="#A89070" strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d="M 38 107 Q 32 116 28 116" stroke="#A89070" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <path d="M 42 107 Q 48 116 52 116" stroke="#A89070" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    {/* stone ring */}
    <ellipse cx="22" cy="107" rx="5" ry="3" fill="#9CA3AF" />
    <ellipse cx="58" cy="107" rx="5" ry="3" fill="#9CA3AF" />
    <ellipse cx="29" cy="109" rx="4" ry="2.5" fill="#6B7280" />
    <ellipse cx="51" cy="109" rx="4" ry="2.5" fill="#6B7280" />
    <ellipse cx="40" cy="110" rx="4" ry="2" fill="#9CA3AF" />
    {/* trunk */}
    <path d="M 38 106 Q 37 85 38 60" stroke="#354F52" strokeWidth="5" strokeLinecap="round" fill="none" />
    <path d="M 42 106 Q 43 85 42 60" stroke="#354F52" strokeWidth="3" strokeLinecap="round" fill="none" />
    {/* leaves — 6 */}
    <ellipse cx="28" cy="74" rx="10" ry="5.5" fill="#84A98C" transform="rotate(-30 28 74)" />
    <ellipse cx="52" cy="74" rx="10" ry="5.5" fill="#84A98C" transform="rotate(30 52 74)" />
    <ellipse cx="29" cy="64" rx="9" ry="5" fill="#52796F" transform="rotate(-20 29 64)" />
    <ellipse cx="51" cy="64" rx="9" ry="5" fill="#52796F" transform="rotate(20 51 64)" />
    <ellipse cx="34" cy="56" rx="8" ry="4.5" fill="#84A98C" transform="rotate(-10 34 56)" />
    <ellipse cx="46" cy="56" rx="8" ry="4.5" fill="#84A98C" transform="rotate(10 46 56)" />
  </g>,
];

export const PlantSapling = ({ stage, isRecommended, onClick, ariaLabel }: PlantProps) => {
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
