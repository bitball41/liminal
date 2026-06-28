import { Icon } from "@/components/icons";
import { core, useBardoSelector } from "@/lib/useCore";
import { toast } from "@/lib/toast";

export function BookmarksBar() {
  const settings = useBardoSelector((snapshot) => snapshot.settings);

  return (
    <div id="bookmarks-bar" className={settings.bookmarksVisible ? "visible" : ""}>
      <div id="bookmarks-list">
        {settings.bookmarks.map((bm, index) => (
          <button key={bm.id} className="bookmark-item" title={bm.url} onClick={() => core.navigate(bm.url)}>
            <span className="bm-favicon">
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                <rect x="1" y="1" width="10" height="10" rx="1.5" />
                <line x1="3.5" y1="4" x2="8.5" y2="4" />
                <line x1="3.5" y1="6.5" x2="6.5" y2="6.5" />
              </svg>
            </span>
            <span className="bm-title">{bm.title}</span>
            <span
              className="bm-remove"
              title="Remove bookmark"
              onClick={(e) => {
                e.stopPropagation();
                core.removeBookmark(bm.id);
                toast.info("Bookmark removed", {
                  action: { label: "Undo", onClick: () => core.restoreBookmark(bm, index) },
                });
              }}
            >
              <Icon name="delete" size={10} />
            </span>
          </button>
        ))}
      </div>
      <button
        id="btn-add-bookmark"
        className="bm-add-btn"
        title="Bookmark this page"
        onClick={() => {
          const result = core.addBookmark();
          if (result.status === "added") toast.success(`Bookmarked “${result.title}”`);
          else if (result.status === "duplicate") toast.info("Already bookmarked");
          else toast.error("Open a page first to bookmark it");
        }}
      >
        <Icon name="bookmark" size={12} />
        Add bookmark
      </button>
    </div>
  );
}
