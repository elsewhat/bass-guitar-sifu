import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fitScale, STAGE_H, STAGE_W, stageWidth } from '../layout';

function currentSize() {
  return { width: stageWidth(window.innerWidth, window.innerHeight), scale: fitScale(window.innerWidth, window.innerHeight) };
}

const StageWidth = createContext<number>(STAGE_W);

/** The stage's width in its own px: 1440 (16:10 and narrower) to 1600 (16:9 and wider), ADR-0037. */
export function useStageWidth(): number {
  return useContext(StageWidth);
}

/**
 * Renders children on a stage 900 px high and 1440 to 1600 px wide (the window's shape, from 16:10
 * to 16:9), scaled and centred to fit the window.
 */
export function Stage({ children }: { children: ReactNode }) {
  const [{ width, scale }, setSize] = useState(currentSize);

  useEffect(() => {
    const onResize = () => setSize(currentSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden">
      <div style={{ width: width * scale, height: STAGE_H * scale }}>
        <div data-testid="stage" style={{ width, height: STAGE_H, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
          <StageWidth.Provider value={width}>{children}</StageWidth.Provider>
        </div>
      </div>
    </div>
  );
}
