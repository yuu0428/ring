import type React from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  OffthreadVideo,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { Phone } from './Phone';
import { C, FONT, FPS } from './theme';
import cues from '../public/demo-cues.json';

const INTRO = Math.round(FPS * 3.6);
const OUTRO = Math.round(FPS * 6.2);
export const DEMO_FRAMES = Math.round((cues.totalMs / 1000) * FPS);
export const TOTAL_FRAMES = INTRO + DEMO_FRAMES + OUTRO;

/* ------------------------------------------------------------------ */
/* 共通パーツ                                                          */
/* ------------------------------------------------------------------ */

/** Ring のしるし。輪が描かれていく */
const RingMark: React.FC<{ size: number; progress: number; color?: string }> = ({
  size,
  progress,
  color = C.danger,
}) => {
  const r = 40;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block' }}>
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - progress)}
        transform="rotate(-90 50 50)"
      />
      <circle cx="50" cy="50" r={9} fill={color} opacity={interpolate(progress, [0.6, 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
    </svg>
  );
};

/** 背景に浮かぶ同心円。区域の「輪」の抽象 */
const Backdrop: React.FC<{ tint?: string }> = ({ tint = C.danger }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1400px 900px at 78% 30%, ${tint}22, transparent 62%)`,
        }}
      />
      {[520, 760, 1010, 1280].map((size, i) => {
        const drift = Math.sin((frame + i * 40) / 90) * 8;
        return (
          <div
            key={size}
            style={{
              position: 'absolute',
              left: '78%',
              top: '46%',
              width: size,
              height: size,
              marginLeft: -size / 2,
              marginTop: -size / 2 + drift,
              borderRadius: '50%',
              border: `1.5px ${i % 2 ? 'dashed' : 'solid'} ${tint}`,
              opacity: 0.1 + i * 0.02,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* 導入                                                                */
/* ------------------------------------------------------------------ */

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const draw = interpolate(frame, [6, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const rise = spring({ frame: frame - 26, fps, config: { damping: 200 } });
  const sub = spring({ frame: frame - 46, fps, config: { damping: 200 } });
  const out = interpolate(frame, [INTRO - 10, INTRO], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Backdrop />
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: FONT,
          color: C.fg,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
          <RingMark size={104} progress={draw} />
          <div
            style={{
              fontSize: 86,
              fontWeight: 800,
              letterSpacing: '0.22em',
              opacity: rise,
              transform: `translateY(${(1 - rise) * 18}px)`,
            }}
          >
            RING
          </div>
        </div>
        <div
          style={{
            marginTop: 34,
            fontSize: 46,
            fontWeight: 800,
            letterSpacing: '-0.01em',
            opacity: sub,
            transform: `translateY(${(1 - sub) * 16}px)`,
          }}
        >
          駅を囲む、<span style={{ color: C.danger }}>見えない輪。</span>
        </div>
        <div
          style={{
            marginTop: 18,
            fontSize: 25,
            color: C.fg1,
            opacity: sub,
            lineHeight: 1.7,
            textAlign: 'center',
          }}
        >
          その内側に自転車を停めると、警告のうえ即日撤去される。
          <br />
          けれど、その輪がどこにあるのかを知る手段は、どこにもなかった。
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* 本編：実機の操作映像＋字幕                                            */
/* ------------------------------------------------------------------ */

const Caption: React.FC<{ title: string; body: string; index: number }> = ({
  title,
  body,
  index,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inn = spring({ frame, fps, config: { damping: 200, mass: 0.6 } });

  return (
    <div
      style={{
        opacity: inn,
        transform: `translateY(${(1 - inn) * 22}px)`,
      }}
    >
      <div
        style={{
          fontSize: 19,
          fontWeight: 800,
          letterSpacing: '0.16em',
          color: C.fg2,
          marginBottom: 14,
        }}
      >
        {String(index + 1).padStart(2, '0')}
      </div>
      <div
        style={{
          fontSize: 52,
          fontWeight: 800,
          lineHeight: 1.26,
          letterSpacing: '-0.015em',
          color: C.fg,
          marginBottom: 20,
          lineBreak: 'strict',
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 26, lineHeight: 1.85, color: C.fg1, maxWidth: '22em' }}>{body}</div>
    </div>
  );
};

const Demo: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 16], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // 各字幕の表示区間を、録画時に記録した実時刻から作る（推測しない）
  const segments = cues.cues.map((c, i) => {
    const from = Math.round((c.atMs / 1000) * FPS);
    const next = cues.cues[i + 1];
    const to = next ? Math.round((next.atMs / 1000) * FPS) : DEMO_FRAMES;
    return { ...c, from, duration: Math.max(1, to - from) };
  });

  return (
    <AbsoluteFill>
      <Backdrop />

      {/* 左：字幕。
          AbsoluteFill を入れ子にすると width:54% が二重に効いて幅が半分になり、
          見出しが不自然な位置で折り返す。指定は内側の 1 か所だけに置く。 */}
      {segments.map((s, i) => (
        <Sequence key={s.atMs} from={s.from} durationInFrames={s.duration} layout="none">
          <AbsoluteFill
            style={{
              fontFamily: FONT,
              justifyContent: 'center',
              padding: '0 40px 0 112px',
              width: '56%',
            }}
          >
            <Caption title={s.title} body={s.body} index={i} />
          </AbsoluteFill>
        </Sequence>
      ))}

      {/* 右：実機の操作映像 */}
      <AbsoluteFill
        style={{
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingRight: 150,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 26}px)`,
        }}
      >
        <Phone scale={1.08}>
          <OffthreadVideo
            src={staticFile('demo.webm')}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            muted
          />
        </Phone>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* 結び                                                                */
/* ------------------------------------------------------------------ */

const Stat: React.FC<{ value: string; label: string; delay: number; color?: string }> = ({
  value,
  label,
  delay,
  color = C.fg,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return (
    <div
      style={{
        opacity: s,
        transform: `translateY(${(1 - s) * 18}px)`,
        background: C.bg1,
        border: `1px solid ${C.line}`,
        borderRadius: 18,
        padding: '26px 34px',
        minWidth: 250,
      }}
    >
      <div style={{ fontSize: 58, fontWeight: 800, letterSpacing: '-0.03em', color, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 19, color: C.fg2, marginTop: 12 }}>{label}</div>
    </div>
  );
};

const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const draw = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const t = spring({ frame: frame - 14, fps, config: { damping: 200 } });
  const url = spring({ frame: frame - 74, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill>
      <Backdrop tint={C.safe} />
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: FONT,
          color: C.fg,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, opacity: t }}>
          <RingMark size={62} progress={draw} />
          <div style={{ fontSize: 50, fontWeight: 800, letterSpacing: '0.2em' }}>RING</div>
        </div>

        <div
          style={{
            fontSize: 34,
            fontWeight: 700,
            marginTop: 26,
            opacity: t,
            color: C.fg1,
          }}
        >
          東京都のオープンデータでつくった、路上のどこでも答えが返るアプリ
        </div>

        <div style={{ display: 'flex', gap: 22, marginTop: 52 }}>
          <Stat value="519" label="放置禁止区域の指定がある駅" delay={30} color={C.danger} />
          <Stat value="99.9%" label="都Excel × 国土数値情報 の突合率" delay={42} color={C.safe} />
          <Stat value="0" label="公開されている区域ポリゴン" delay={54} color={C.warn} />
        </div>

        <div
          style={{
            marginTop: 56,
            fontSize: 30,
            fontWeight: 700,
            opacity: url,
            transform: `translateY(${(1 - url) * 14}px)`,
            padding: '16px 38px',
            borderRadius: 100,
            border: `1px solid ${C.line}`,
            background: C.bg1,
          }}
        >
          yuu0428.github.io/ring
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */

export const RingDemo: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Sequence durationInFrames={INTRO}>
      <Intro />
    </Sequence>
    <Sequence from={INTRO} durationInFrames={DEMO_FRAMES}>
      <Demo />
    </Sequence>
    <Sequence from={INTRO + DEMO_FRAMES} durationInFrames={OUTRO}>
      <Outro />
    </Sequence>
  </AbsoluteFill>
);
