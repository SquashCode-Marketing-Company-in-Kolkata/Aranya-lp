function kolkataTimestamp(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h12',
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  const date = `${parts.day}/${parts.month}/${parts.year}`;
  const period = String(parts.dayPeriod || '').replace(/\./g, '').replace(/\s/g, '').toUpperCase();
  const time = `${parts.hour}:${parts.minute}:${parts.second} ${period.includes('P') ? 'PM' : 'AM'}`;
  return { date, time, submitted_at: `${date} ${time}`, timezone: 'Asia/Kolkata' };
}

function localPhoneDigits(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

const preferredAccessChoices = {
  purchasing_as: ['Individual / family', 'Joint with family member', 'Non-resident buyer', 'Channel partner / broker'],
  budget: ['Up to ₹50 lakh', '₹50 lakh to ₹75 lakh', '₹75 lakh to ₹1 crore', '₹1 crore to ₹1.5 crore', 'Above ₹1.5 crore'],
  purpose: ['Own use', 'Investment', 'Both / undecided'],
  timeline: ['Within 1 month', '1 to 3 months', '3 to 6 months', 'Just exploring'],
  funding: ['Home loan', 'Self-funded', 'Partly loan, partly self-funded', 'Not decided'],
  heard_about: ['Existing customer of our other projects', 'Referred by an existing customer', 'WhatsApp message',
    'Facebook / Instagram ad', 'Instagram profile', 'Google search / Google Maps', 'Hoarding / signage', 'Newspaper',
    'Visited the marketing office', 'Channel partner / broker', 'Friend or family', 'Other'],
  party_size: ['', 'Just me', '2 people', '3 to 4 people', '5 or more'],
  consent: ['yes'],
};

function preferredAccessDetails(input, lead) {
  if (!/^[6-9]\d{9}$/.test(lead.phone) || lead.name.length > 120 || lead.email.length > 254 || lead.message.length > 2000) return null;

  const details = {};
  for (const [key, options] of Object.entries(preferredAccessChoices)) {
    const value = input[key] ?? '';
    if (!options.includes(value)) return null;
    details[key] = value;
  }
  for (const [key, options, minimum] of [
    ['home_sizes', ['2 BHK', '3 BHK', '4 BHK', 'Not decided'], 1],
    ['preview_times', ['Weekday morning', 'Weekday evening', 'Weekend'], 0],
  ]) {
    const values = input[key] ?? [];
    if (!Array.isArray(values) || values.length < minimum || values.length > options.length ||
      !values.every(value => options.includes(value)) || new Set(values).size !== values.length) return null;
    details[key] = values;
  }

  const locality = typeof input.locality === 'string' ? input.locality.trim() : '';
  const referredBy = typeof input.referred_by === 'string' ? input.referred_by.trim() : '';
  if (!locality || locality.length > 160 || referredBy.length > 220) return null;
  return { ...details, locality, referred_by: referredBy, consent: true };
}

async function deliverLead(fetchImpl, destination, url, headers, payload) {
  try {
    const response = await fetchImpl(url(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) return true;
    console.error(`Lead delivery to ${destination} failed with HTTP ${response.status}`);
  } catch {
    console.error(`Lead delivery to ${destination} failed before a response was received`);
  }
  return false;
}

async function handleLead(method, body, {
  webhookUrl = process.env.PABBLY_WEBHOOK_URL,
  supabaseUrl = process.env.SUPABASE_URL,
  supabaseSecretKey = process.env.SUPABASE_SECRET_KEY,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  const reply = (statusCode, data) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(data) });
  if (method !== 'POST') return reply(405, { error: 'Method not allowed' });
  if (new TextEncoder().encode(body || '').byteLength > 16384) return reply(413, { error: 'Submission too large' });
  let input;
  try { input = JSON.parse(body); } catch { return reply(400, { error: 'Invalid JSON' }); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return reply(400, { error: 'Invalid submission' });
  const keys = ['name', 'phone', 'email', 'pincode', 'interest', 'message', 'form_source', 'source_url', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  const lead = Object.fromEntries(keys.map(key => [key, typeof input[key] === 'string' ? input[key].trim() : '']));
  lead.phone = localPhoneDigits(lead.phone);
  if (!lead.name || !/^\d{10}$/.test(lead.phone) || (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) || (lead.pincode && !/^\d{6}$/.test(lead.pincode)) || !['main_enquiry', 'coming_soon', 'preferred_access'].includes(lead.form_source)) {
    return reply(400, { error: 'Please check your form details' });
  }
  const preferred = lead.form_source === 'preferred_access';
  const main = lead.form_source === 'main_enquiry';
  const details = preferred ? preferredAccessDetails(input, lead) : {};
  if (!details) return reply(400, { error: 'Please check your form details' });
  const deliveries = [];
  if ((main || preferred) && supabaseUrl && supabaseSecretKey) {
    if (main && !lead.email) {
      return reply(400, { error: 'Please enter your email address' });
    }
    const { pincode, interest, ...shared } = lead;
    const table = preferred ? 'preferred_access_leads' : 'landing_page_leads';
    const row = preferred ? { ...shared, ...details } : { ...shared, interest };
    deliveries.push(deliverLead(fetchImpl, 'Supabase', () => new URL('/rest/v1/' + table, supabaseUrl),
      { apikey: supabaseSecretKey, Prefer: 'return=minimal' }, row));
  }
  if (!preferred && webhookUrl) {
    deliveries.push(deliverLead(fetchImpl, 'Pabbly', () => webhookUrl, {}, { ...lead, ...kolkataTimestamp(now) }));
  }
  if (!deliveries.length) return reply(503, { error: 'Enquiries are temporarily unavailable' });
  const results = await Promise.all(deliveries);
  // Avoid prompting a customer to submit again when one destination already received the lead.
  if (results.some(Boolean)) return reply(200, { success: true });
  return reply(502, { error: 'Unable to send your enquiry. Please try again.' });
}

module.exports = { handleLead, kolkataTimestamp };
