const Cloud = ({ x, y, scale, duration, delay }: { x: number; y: number; scale: number; duration: number; delay: number }) => (
  <div
    style={{
      position: 'absolute',
      left: `${x}%`,
      top: `${y}px`,
      transform: `scale(${scale})`,
      animation: `cloudDrift ${duration}s ${delay}s linear infinite`,
      opacity: 0.45,
      pointerEvents: 'none',
    }}
  >
    <svg width="64" height="28" viewBox="0 0 64 28" fill="none">
      <ellipse cx="32" cy="20" rx="28" ry="10" fill="#F1F5F9" />
      <ellipse cx="22" cy="16" rx="14" ry="10" fill="#F1F5F9" />
      <ellipse cx="40" cy="15" rx="16" ry="10" fill="#F1F5F9" />
      <ellipse cx="30" cy="12" rx="12" ry="9" fill="#F1F5F9" />
    </svg>
  </div>
);

export const CloudAccent = () => (
  <>
    <style>{`
      @keyframes cloudDrift {
        0%   { transform: translateX(0px); }
        50%  { transform: translateX(18px); }
        100% { transform: translateX(0px); }
      }
    `}</style>
    <Cloud x={8}  y={12} scale={0.9}  duration={60} delay={0}   />
    <Cloud x={38} y={6}  scale={1.1}  duration={75} delay={-20} />
    <Cloud x={72} y={16} scale={0.75} duration={55} delay={-35} />
  </>
);
