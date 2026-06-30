export function openStealthWindow(src = location.href) {
  const popup = window.open("about:blank", "_blank");
  if (!popup) return false;

  const doc = popup.document;
  const head = doc.createElement("head");
  const title = doc.createElement("title");
  const style = doc.createElement("style");
  const body = doc.createElement("body");
  const frame = doc.createElement("iframe");

  style.textContent =
    "*{margin:0;padding:0}html,body,iframe{display:block;width:100%;height:100%;border:0;overflow:hidden}";
  frame.src = src;
  frame.referrerPolicy = "no-referrer";
  head.append(title, style);
  body.append(frame);
  doc.documentElement.replaceChildren(head, body);
  return true;
}
