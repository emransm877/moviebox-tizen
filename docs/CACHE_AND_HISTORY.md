# Cached catalogues and history removal

Movies and TV Shows cache metadata by section and applied filters. Returning to an available cached view restores loaded pages and scroll/selection without a foreground request or loading screen. Caches survive restart, are bounded and separate from My list/history, and contain no playback URLs or account credentials. Old metadata expires after seven days.

Views checked less than five minutes ago use the cache immediately. Older views remain visible while the first page is checked in the background. Unchanged results preserve all loaded pages and position. Changed results can update an idle view at the top; when browsing or scrolled down, a notice offers Apply filters to refresh rather than moving focus or replacing the list. Apply filters explicitly checks the service. An offline refresh retains available cached content. First visits to an uncached section/filter still need the network.

Continue watching has a **Select titles** mode with individual selection, **Select all / Clear selection**, **Remove selected**, **Done selecting** and **Undo removal**. Removal deletes progress for every episode of each selected title, persists across restart and leaves My list intact. Watching a removed title again creates new progress normally. Undo restores the last removed batch during this app session without replacing any newer progress; another removal replaces that Undo batch.

The title detail layout places actions after the synopsis for movies, and after season controls for TV shows. Poster proportions, episodes and all previous playback/theme features are retained.

Validation uses actual Qt controls and isolated fixture libraries, headless TV remote tests with mocked AVPlay, cache disk/page reload checks, and the previous regression suites. Tests do not remove production history. Network availability and every upstream title/device remain outside those bounded checks.
