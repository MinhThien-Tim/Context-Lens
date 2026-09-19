const input = document.querySelector('#app-url');
const status = document.querySelector('#status');

void chrome.storage.sync.get({ appUrl: 'http://localhost:4173/' }).then(({ appUrl }) => { input.value = appUrl; });
document.querySelector('#save').addEventListener('click', async () => {
  try {
    const url = new URL(input.value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    await chrome.storage.sync.set({ appUrl: url.href });
    status.textContent = 'Saved.';
  } catch { status.textContent = 'Enter a valid HTTP or HTTPS URL.'; }
});
