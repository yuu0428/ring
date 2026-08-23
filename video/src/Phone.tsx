import type React from 'react';
import { C } from './theme';

/**
 * デモ映像を収める端末の枠。
 * 録画は 390×844 なので、その比率のまま拡大して置く。
 */
export const Phone: React.FC<{ scale: number; children: React.ReactNode }> = ({
  scale,
  children,
}) => {
  const w = 390 * scale;
  const h = 844 * scale;
  const r = 42 * scale;

  return (
    <div
      style={{
        position: 'relative',
        width: w,
        height: h,
        borderRadius: r,
        padding: 10 * scale,
        background: 'linear-gradient(160deg, #3A424E 0%, #171C23 45%, #2B323C 100%)',
        boxShadow: `0 ${40 * scale}px ${90 * scale}px rgba(0,0,0,.62), 0 0 0 ${1.5 * scale}px rgba(255,255,255,.08)`,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: r - 10 * scale,
          overflow: 'hidden',
          background: C.bg,
          position: 'relative',
        }}
      >
        {children}
      </div>
      {/* 画面上部の切り欠き */}
      <div
        style={{
          position: 'absolute',
          top: 16 * scale,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 96 * scale,
          height: 20 * scale,
          borderRadius: 100,
          background: '#0A0D11',
          zIndex: 2,
        }}
      />
    </div>
  );
};
