const DEFAULT_APP_URL = 'http://localhost:4173/';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'context-lens-open', title: 'Read with Context Lens', contexts: ['page', 'link'] });
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.url) void openInContextLens(tab.url, tab.title);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'context-lens-open') return;
  const url = info.linkUrl || info.pageUrl || tab?.url;
  if (url) void openInContextLens(url, tab?.title);
});

async function openInContextLens(articleUrl, title = '') {
  const settings = await chrome.storage.sync.get({ appUrl: DEFAULT_APP_URL });
  try {
    const target = new URL(settings.appUrl);
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Unsupported protocol');
    target.searchParams.set('share-target', '1');
    target.searchParams.set('url', articleUrl);
    if (title) target.searchParams.set('title', title);
    await chrome.tabs.create({ url: target.href });
  } catch {
    await chrome.runtime.openOptionsPage();
  }
}
