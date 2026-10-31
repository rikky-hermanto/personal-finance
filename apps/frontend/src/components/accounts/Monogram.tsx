import { useState } from 'react';
import { initials } from '@/lib/accounts';
import { cn } from '@/lib/utils';

interface MonogramProps {
  name: string;
  logoUrl?: string;
  size?: 'md' | 'lg';
  className?: string;
}

export const Monogram = ({ name, logoUrl, size = 'md', className }: MonogramProps) => {
  const [logoFailed, setLogoFailed] = useState(false);
  const sizeClass = size === 'lg' ? 'h-14 w-14 text-[15px]' : 'h-9 w-9 text-xs';

  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-full bg-secondary font-data font-semibold text-foreground',
        sizeClass,
        className,
      )}
    >
      {logoUrl && !logoFailed
        ? <img src={logoUrl} alt="" className="h-full w-full object-cover" onError={() => setLogoFailed(true)} />
        : initials(name)}
    </span>
  );
};
