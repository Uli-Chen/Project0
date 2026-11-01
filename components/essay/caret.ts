// 计算 textarea 中某个字符位置的坐标：用一个样式相同的隐藏 div 复制文本后测量。
const PROPS = [
  "boxSizing", "width", "height", "overflowX", "overflowY", "borderTopWidth", "borderRightWidth", "borderBottomWidth",
  "borderLeftWidth", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "fontStyle", "fontVariant",
  "fontWeight", "fontStretch", "fontSize", "lineHeight", "fontFamily", "textAlign", "textTransform", "textIndent",
  "letterSpacing", "wordSpacing", "tabSize",
] as const;

export function caretCoordinates(el: HTMLTextAreaElement, position: number) {
  const div = document.createElement("div");
  const style = getComputedStyle(el);
  div.style.position = "absolute";
  div.style.visibility = "hidden";
  div.style.whiteSpace = "pre-wrap";
  div.style.overflowWrap = "break-word";
  for (const prop of PROPS) div.style[prop] = style[prop];
  div.textContent = el.value.slice(0, position);
  const span = document.createElement("span");
  span.textContent = el.value.slice(position) || ".";
  div.appendChild(span);
  document.body.appendChild(div);
  const coords = { top: span.offsetTop, left: span.offsetLeft, lineHeight: parseFloat(style.lineHeight) || 28 };
  document.body.removeChild(div);
  return coords;
}
