(function () {
  function openShell(src) {
    const popup = window.open('about:blank', '_blank');
    if (!popup) return false;

    const doc = popup.document;
    const head = doc.createElement('head');
    const title = doc.createElement('title');
    const style = doc.createElement('style');
    const body = doc.createElement('body');
    const frame = doc.createElement('iframe');

    style.textContent = '*{margin:0;padding:0}html,body,iframe{display:block;width:100%;height:100%;border:0;overflow:hidden}';
    frame.src = src;
    frame.referrerPolicy = 'no-referrer';
    head.append(title, style);
    body.append(frame);
    doc.documentElement.replaceChildren(head, body);
    return true;
  }

  try {
    const settings = JSON.parse(localStorage.getItem('bardo-settings') || '{}');
    if (!settings.aboutBlankMode || window !== window.top || sessionStorage.getItem('bardo-ab')) return;
    sessionStorage.setItem('bardo-ab', '1');
    if (openShell(location.href)) window.__bardoAbLaunched = true;
    else window.__bardoAbBlocked = true;
  } catch {}
})();
