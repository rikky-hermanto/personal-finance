/* Lucide icon → React SVG. icons[Name] = ["svg", attrs, [[tag, attrs], ...]] */
function Icon({ name, size = 16, className = '', strokeWidth = 2, style }) {
  const node = window.lucide && window.lucide.icons && window.lucide.icons[name];
  if (!node) return null;
  const children = node[2] || [];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {children.map((c, i) => {
        const [tag, attrs] = c;
        return React.createElement(tag, { ...attrs, key: i });
      })}
    </svg>
  );
}

window.Icon = Icon;