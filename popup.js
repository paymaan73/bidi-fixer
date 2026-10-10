const defaults = { enabled: true, disabledSites: [], isolateRuns: false };
const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(defaults, async (s) => {
  $('enabled').checked = s.enabled;
  $('isolateRuns').checked = s.isolateRuns;

  let host = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    host = (await chrome.tabs.sendMessage(tab.id, { type: 'getHost' }))?.host;
  } catch (_) { /* chrome:// pages etc. have no content script */ }

  if (host) {
    $('host').textContent = host;
    $('site').checked = !s.disabledSites.includes(host);
  } else {
    $('siteRow').classList.add('disabled');
    $('site').disabled = true;
  }

  $('enabled').onchange = (e) => chrome.storage.sync.set({ enabled: e.target.checked });
  $('isolateRuns').onchange = (e) => chrome.storage.sync.set({ isolateRuns: e.target.checked });
  $('site').onchange = (e) => {
    chrome.storage.sync.get(defaults, ({ disabledSites }) => {
      const list = disabledSites.filter((h) => h !== host);
      if (!e.target.checked) list.push(host);
      chrome.storage.sync.set({ disabledSites: list });
    });
  };
});
