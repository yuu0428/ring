import type React from 'react';
import { Composition } from 'remotion';
import { RingDemo, TOTAL_FRAMES } from './RingDemo';
import { FPS } from './theme';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="RingDemo"
    component={RingDemo}
    durationInFrames={TOTAL_FRAMES}
    fps={FPS}
    width={1920}
    height={1080}
  />
);
