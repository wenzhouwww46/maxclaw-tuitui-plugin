export const SETTINGS_PAGE = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>maxclaw Tuitui settings</title>
<body><main><h1>maxclaw Tuitui</h1><p>Configure local credentials. This page is only available on this computer.</p><form id="credentials"><label>App ID <input name="appid" required maxlength="256" autocomplete="off"></label><label>Secret <input name="secret" required maxlength="4096" type="password" autocomplete="new-password"></label><button>Save credentials</button></form><pre id="status"></pre></main><script>
const token = new URLSearchParams(location.search).get('session');
const status = document.querySelector('#status');
document.querySelector('#credentials').addEventListener('submit', async (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target)); const response = await fetch('/api/credentials', { method: 'POST', headers: {'content-type':'application/json','x-maxclaw-session':token}, body: JSON.stringify(data) }); status.textContent = response.ok ? 'Saved.' : 'Unable to save.'; });
</script></body></html>`;
