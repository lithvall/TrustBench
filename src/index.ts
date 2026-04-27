// Analytics dashboard with clear measurement note
app.get('/analytics', async (c) => {
  const search = await getRankings('search');
  const inference = await getRankings('inference');
  const data = await getRankings('data');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>TrustBench Analytics</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 20px; background: #0f0f0f; color: #fff; margin: 0; }
    h1 { color: #22c55e; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #333; }
    th { background: #1f1f1f; }
    .good { color: #22c55e; font-weight: bold; }
    .note { background: #1a1a1a; padding: 12px; border-radius: 6px; font-size: 0.95em; margin: 20px 0; }
  </style>
</head>
<body>
  <h1>TrustBench Analytics</h1>
  <p>Last updated: ${new Date().toLocaleString()}</p>
  
  <div class="note">
    <strong>Measurement note:</strong> Latency and uptime are measured from 3 cloud regions (US-East, EU-West, Asia-Southeast). 
    This is a zero-cost MVP approach. True global multi-region probing (South America, Africa, Australia, etc.) is planned for a future phase.
  </div>

  <h2>Providers by Category</h2>
  <table>
    <tr><th>Category</th><th>Count</th><th>Top Score</th></tr>
    <tr><td>Search</td><td>${search.length}</td><td class="good">${search[0]?.score || '—'}</td></tr>
    <tr><td>Inference</td><td>${inference.length}</td><td class="good">${inference[0]?.score || '—'}</td></tr>
    <tr><td>Data</td><td>${data.length}</td><td class="good">${data[0]?.score || '—'}</td></tr>
  </table>

  <h2>Current Top Providers</h2>
  <pre>${JSON.stringify({ search: search.slice(0, 3), inference: inference.slice(0, 3), data: data.slice(0, 3) }, null, 2)}</pre>

  <p><a href="/health" style="color:#22c55e">Health Check</a> | 
     <a href="/route?capability=search" style="color:#22c55e">Router Test</a></p>
</body>
</html>`;

  return c.html(html);
});