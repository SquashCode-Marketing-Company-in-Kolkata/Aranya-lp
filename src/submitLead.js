export async function submitLead(fields, formSource) {
  const params = new URLSearchParams(window.location.search);
  const tracking = Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].map(key => [key, params.get(key) || '']));
  const phoneDigits = String(fields.phone || '').replace(/\D/g, '');
  const phone = phoneDigits.startsWith('91') && phoneDigits.length === 12 ? phoneDigits.slice(2) : phoneDigits;
  const response = await fetch('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...fields, phone, ...tracking, form_source: formSource, source_url: window.location.href }),
  });
  if (!response.ok) throw new Error('Unable to send your enquiry. Please try again.');
}
