import type { CSSProperties, ReactNode } from "react";
import { minTouchTarget } from "@gac/shared";

/** Which page layout the placeholder blocks should mimic. */
export type SkeletonLayout = "profile" | "body" | "workout" | "value" | "rows";

interface BlockProps {
  width?: CSSProperties["width"];
  height: number;
  pill?: boolean;
}

function Block({ width = "100%", height, pill }: BlockProps) {
  return (
    <span
      className={pill ? "skeleton pill" : "skeleton"}
      style={{ width, height }}
    />
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="card skeleton-stack">{children}</div>;
}

function blocks(layout: SkeletonLayout) {
  switch (layout) {
    case "profile":
      return (
        <>
          <Block width="40%" height={28} />
          <Card>
            {[0, 1, 2, 3].map((i) => (
              <div className="skeleton-stack" key={i}>
                <Block width="30%" height={16} />
                <Block height={minTouchTarget} />
              </div>
            ))}
            <Block height={minTouchTarget} pill />
          </Card>
        </>
      );
    case "body":
      return (
        <>
          <Block width="40%" height={28} />
          <Block height={minTouchTarget} pill />
          <Card>
            <Block width="45%" height={40} />
            <Block height={160} />
          </Card>
          <div className="skeleton-tiles">
            {[0, 1, 2, 3].map((i) => (
              <Block key={i} height={72} />
            ))}
          </div>
        </>
      );
    case "workout":
      return (
        <>
          <Block width="40%" height={28} />
          <Card>
            <Block width="50%" height={20} />
            <Block height={12} />
            <Block width="70%" height={12} />
          </Card>
          {[0, 1].map((i) => (
            <Card key={i}>
              <Block width="45%" height={20} />
              <Block width="35%" height={minTouchTarget} pill />
            </Card>
          ))}
        </>
      );
    case "value":
      return (
        <>
          <Block width="45%" height={40} />
          <Block width="60%" height={16} />
        </>
      );
    case "rows":
      return [0, 1, 2, 3, 4].map((i) => (
        <Block key={i} height={minTouchTarget} />
      ));
  }
}

/**
 * Grey placeholder blocks shaped like the page that is loading. The blocks are
 * hidden from screen readers; the wrapper announces「載入中」instead.
 */
export function Skeleton({ layout }: { layout: SkeletonLayout }) {
  return (
    <div role="status" aria-label="載入中">
      <div className="skeleton-stack" aria-hidden="true">
        {blocks(layout)}
      </div>
    </div>
  );
}
