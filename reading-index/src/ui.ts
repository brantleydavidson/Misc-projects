export function capturePage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Reading index</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      background: #f3efe4;
      color: #1c1915;
      font: 18px/1.45 Georgia, "Iowan Old Style", Palatino, serif;
    }
    main { max-width: 40rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
    h1 { font-weight: 500; font-size: 2.1rem; letter-spacing: -0.03em; margin: 0 0 0.4rem; }
    p.lead { margin-top: 0; color: #433c33; }
    form, .card {
      background: #fffdf8;
      border: 1px solid #e2d8c6;
      border-radius: 14px;
      padding: 1rem 1rem 1.1rem;
      margin: 1.25rem 0;
    }
    label { display: block; font: 600 0.78rem/1.2 ui-sans-serif, system-ui, sans-serif; letter-spacing: 0.04em; text-transform: uppercase; margin: 0.8rem 0 0.3rem; }
    input, textarea, select, button {
      width: 100%;
      box-sizing: border-box;
      font: 16px/1.4 ui-sans-serif, system-ui, sans-serif;
      border-radius: 8px;
      border: 1px solid #cbbfaa;
      padding: 0.55rem 0.65rem;
      background: white;
      color: inherit;
    }
    textarea { min-height: 8rem; resize: vertical; }
    button, a.bookmarklet {
      background: #23483d;
      color: #f7f3ea;
      border: 0;
      text-decoration: none;
      display: inline-block;
      text-align: center;
      cursor: pointer;
      margin-top: 0.9rem;
    }
    button { font-weight: 650; }
    a.bookmarklet { width: auto; padding: 0.55rem 0.8rem; }
    .hint { font: 14px/1.45 ui-sans-serif, system-ui, sans-serif; color: #5c5348; }
    #result { white-space: pre-wrap; font: 14px/1.4 ui-monospace, monospace; }
    code { font: 0.92em ui-monospace, monospace; }
  </style>
</head>
<body>
  <main>
    <h1>Reading index</h1>
    <p class="lead">Save a page or a passage. The service fetches it, files a text PDF for Notability, and builds a section tree any model can browse.</p>
    <form id="save-form">
      <label for="token">Save token</label>
      <input id="token" type="password" autocomplete="off" placeholder="Stored only in this browser">
      <p class="hint">The token is not rendered by the server. Paste the save token from Secret Manager. It stays in local storage so the bookmarklet can send it.</p>
      <label for="url">URL</label>
      <input id="url" type="url" placeholder="https://example.com/article">
      <label for="title">Title</label>
      <input id="title" type="text" placeholder="Optional">
      <label for="kind">Kind</label>
      <select id="kind">
        <option value="page">Page</option>
        <option value="selection">Selection</option>
        <option value="pdf">PDF text</option>
      </select>
      <label for="text">Text</label>
      <textarea id="text" placeholder="Leave empty to fetch the URL on the server"></textarea>
      <button type="submit">Save</button>
      <p id="result" class="hint" role="status"></p>
    </form>
    <div class="card">
      <h2>Bookmarklet</h2>
      <p class="hint">Drag this to the bookmark bar. On a page you are reading, select a passage or leave the selection empty, then click the bookmark. The server fetches and indexes. Some sites block bookmarklet requests with a content security policy; paste the URL here when that happens.</p>
      <p><a class="bookmarklet" id="bookmarklet" href="#">Save to reading index</a></p>
      <p class="hint">Notability has no API. When a Drive folder is configured, the PDF is uploaded there for Import from Google Drive. Otherwise it stays in Cloud Storage.</p>
    </div>
  </main>
  <script>
    var tokenInput = document.getElementById('token');
    var result = document.getElementById('result');
    var stored = localStorage.getItem('reading-index-save-token') || '';
    tokenInput.value = stored;
    function originOf() { return location.origin; }
    function bookmarkSource(origin, token) {
      return '(function(){var token=' + JSON.stringify(token) + ';var origin=' + JSON.stringify(origin) +
        ';var sel="";try{sel=String(window.getSelection?window.getSelection():"");}catch(e){}var text=sel.trim();' +
        'fetch(origin+"/save",{method:"POST",mode:"cors",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({url:location.href,title:document.title||"",text:text,source_kind:text?"selection":"page"})})' +
        '.then(function(r){return r.json().then(function(j){alert(r.ok?("Saved to reading index: "+(j.title||j.id)):("Save failed: "+(j.error||r.status)));});})' +
        '.catch(function(e){alert("Save failed: "+e);});})();';
    }
    function refreshBookmarklet() {
      var token = tokenInput.value.trim();
      var link = document.getElementById('bookmarklet');
      if (!token) { link.href = '#'; return; }
      link.href = 'javascript:' + encodeURIComponent(bookmarkSource(originOf(), token));
    }
    tokenInput.addEventListener('input', function () {
      localStorage.setItem('reading-index-save-token', tokenInput.value.trim());
      refreshBookmarklet();
    });
    refreshBookmarklet();
    document.getElementById('save-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var token = tokenInput.value.trim();
      localStorage.setItem('reading-index-save-token', token);
      refreshBookmarklet();
      if (!token) { result.textContent = 'Add the save token first.'; return; }
      var payload = {
        url: document.getElementById('url').value.trim(),
        title: document.getElementById('title').value.trim(),
        text: document.getElementById('text').value,
        source_kind: document.getElementById('kind').value
      };
      result.textContent = 'Saving…';
      fetch('/save', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (response) {
        return response.json().then(function (body) { return { ok: response.ok, body: body }; });
      }).then(function (res) {
        result.textContent = JSON.stringify(res.body, null, 2);
      }).catch(function (error) {
        result.textContent = String(error);
      });
    });
  </script>
</body>
</html>`;
}
