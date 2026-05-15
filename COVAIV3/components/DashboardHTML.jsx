import { useEffect, useState } from 'react';

export default function DashboardHTML({ restaurant, refreshTrigger }) {
  const [dashboardHTML, setDashboardHTML] = useState('');

  useEffect(() => {
    // Fetch the dashboard HTML file
    fetch('/dashboard.html')
      .then(res => res.text())
      .then(html => {
        // Reemplazar título con nombre del restaurante
        const modified = html.replace(
          /<title>.*?<\/title>/,
          `<title>COVAI — ${restaurant}</title>`
        );
        setDashboardHTML(modified);
      })
      .catch(err => console.error('Error loading dashboard:', err));
  }, [restaurant, refreshTrigger]);

  return (
    <div style={{ width: '100%' }}>
      <div
        dangerouslySetInnerHTML={{
          __html: dashboardHTML,
        }}
      />
    </div>
  );
}
