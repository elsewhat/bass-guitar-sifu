import { useEffect, useState, type ReactNode } from 'react';
import { fitScale, STAGE_H, STAGE_W } from '../layout';

function currentScale() {
  return fitScale(window.innerWidth, window.innerHeight);
}

/** Renders children at the 1440×900 reference size, scaled and centred to fit the window. */
export function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(currentScale);

  useEffect(() => {
    const onResize = () => setScale(currentScale());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden">
      <div style={{ width: STAGE_W * scale, height: STAGE_H * scale }}>
        <div
          data-testid="stage"
          style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, transformOrigin: '0 0' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
