import type { CSSProperties, ReactNode } from "react";

export type Mood = "happy" | "curious" | "thinking" | "encouraging" | "celebrating" | "focused" | "oops" | "surprised" | "sleepy";
export type MascotVariant = "classic" | "adventure" | "explorer" | "creative" | "sporty" | "winter";
export type FamilyMember = "nasj" | "papa" | "maman" | "sister" | "brother";

/** Head-and-shoulders expression of the NASJ mascot (artwork from the style guide). */
export function MascotFace({ mood = "happy", size = 96, className = "" }: { mood?: Mood; size?: number; className?: string }) {
  return (
    <img
      className={`mascot-face ${className}`}
      src={`/img/mascot/expr-${mood}.png`}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: "auto" }}
      draggable={false}
    />
  );
}

/** Full-body mascot in the currently selected outfit. */
export function MascotBody({ variant = "classic", height = 220, className = "" }: { variant?: MascotVariant; height?: number; className?: string }) {
  const src = variant === "classic" ? "/img/mascot/classic.png" : `/img/mascot/variant-${variant}.png`;
  return <img className={`mascot-body ${className}`} src={src} alt="" style={{ height }} draggable={false} />;
}

export function FamilyPortrait({ who, size = 72, className = "" }: { who: FamilyMember; size?: number; className?: string }) {
  const style: CSSProperties = { width: size, height: size };
  return (
    <span className={`portrait ${className}`} style={style}>
      <img src={`/img/family/${who}.png`} alt="" draggable={false} />
    </span>
  );
}

/** A mascot expression with a speech bubble, used for hints, encouragement and introductions. */
export function MascotBubble({ mood = "happy", children, size = 84, side = "start" }: { mood?: Mood; children: ReactNode; size?: number; side?: "start" | "end" }) {
  return (
    <div className={`bubble-row bubble-row--${side}`}>
      <MascotFace mood={mood} size={size} />
      <div className="bubble" role="status">
        {children}
      </div>
    </div>
  );
}

export const FAMILY: FamilyMember[] = ["nasj", "papa", "maman", "sister", "brother"];
