import type { CSSProperties } from "react";
import layout from "./devin-source.json";
import s from "./devin.module.css";

export const devinSlots = layout.flatMap(layer => layer.items);
export const devinImages = devinSlots.map(item => `/motion-preview/devin/${item.src.split("/").pop()}`);

// All variants share the captured slot geometry and timing.
export function DevinLayers({ images = devinImages, density, blur, foregroundOpacity = 1 }: {
  images?: readonly string[]; density: number; blur: number; foregroundOpacity?: number;
}) {
  let offset = 0;
  return layout.map((layer, depth) => {
    const start = offset;
    offset += layer.items.length;
    return <div key={depth} className={s.layer} aria-hidden="true" inert style={{ filter: depth === 0 ? `blur(${blur}px)` : undefined, opacity: depth === 0 ? .6 : foregroundOpacity }}>
      {layer.items.map((item, i) => <div key={i} data-devin-card={start + i} className={s.picture} style={{
        "--width": `${item.width}px`, "--height": `${item.height}px`, "--top": item.top,
        display: i * 2 < density ? undefined : "none",
      } as CSSProperties}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[start + i]} width={item.width} height={item.height} alt="" decoding="async" draggable={false} />
      </div>)}
    </div>;
  });
}
