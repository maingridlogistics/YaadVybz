// ─── Vybz Hub Email Templates ──────────────────────────────────────────────────
// Brand colors: background #0B1710, gold #FFC72C, green #0F6B37, text #F4EFE4

const BASE_CSS = `
  *{margin:0;padding:0;box-sizing:border-box;}
  body{background:#0B1710;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;padding:20px;}
  .wrap{max-width:580px;margin:0 auto;}
  .header{background:linear-gradient(135deg,#0F6B37 0%,#071508 100%);padding:28px 24px;text-align:center;border-radius:12px 12px 0 0;}
  .logo{font-size:20px;font-weight:900;color:#FFC72C;letter-spacing:4px;}
  .logo-sub{color:#6FA882;font-size:13px;margin-top:6px;}
  .body{background:#111D15;padding:28px 24px;border-left:1px solid #1A3322;border-right:1px solid #1A3322;}
  .footer{background:#080F0A;padding:18px 24px;text-align:center;border-radius:0 0 12px 12px;border:1px solid #1A3322;border-top:none;}
  h1{color:#F4EFE4;font-size:22px;font-weight:800;margin-bottom:14px;line-height:1.3;}
  p{color:#B8D4BF;font-size:15px;line-height:1.65;margin-bottom:14px;}
  .card{background:#0F2318;border:1px solid #1E4A2E;border-radius:10px;padding:18px;margin:18px 0;}
  .event-title{color:#F4EFE4;font-size:17px;font-weight:800;margin-bottom:8px;}
  .event-meta{color:#6FA882;font-size:13px;line-height:1.6;}
  .btn-wrap{text-align:center;margin:22px 0 8px;}
  .btn{display:inline-block;background:#FFC72C;color:#0B1710;padding:13px 30px;border-radius:8px;font-weight:800;font-size:14px;text-decoration:none;letter-spacing:0.3px;}
  .gold{color:#FFC72C;}
  .green{color:#5BC47A;}
  .muted{color:#4A7055;font-size:12px;line-height:1.6;}
  .divider{height:1px;background:#1A3322;margin:16px 0;}
  .badge{display:inline-block;background:#1E4A2E;color:#5BC47A;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:10px;}
`;

function shell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(title)}</title>
  <style>${BASE_CSS}</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="logo">VYBZ HUB</div>
    <div class="logo-sub">Jamaica's Event Scene</div>
  </div>
  <div class="body">
    ${bodyHtml}
  </div>
  <div class="footer">
    <p class="muted">
      <a href="mailto:info@vybzhub.com" style="color:#FFC72C;text-decoration:none;">Manage email preferences</a>
      &nbsp;·&nbsp;
      <a href="mailto:info@vybzhub.com" style="color:#4A7055;text-decoration:none;">info@vybzhub.com</a>
    </p>
    <p class="muted" style="margin-top:6px;">Need help? Email <a href="mailto:info@vybzhub.com" style="color:#FFC72C;text-decoration:none;">info@vybzhub.com</a></p>
  </div>
</div>
</body>
</html>`;
}

function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function eventCard(d: Record<string, any>): string {
  const meta = [
    d.date ? `📅 ${d.date}` : '',
    d.startTime ? `⏰ ${d.startTime}` : '',
    d.venue ? `📍 ${d.venue}` : '',
    d.parish ? d.parish : '',
    d.ticketPrice ? `🎟 ${d.ticketPrice}` : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  return `
    <div class="card">
      <div class="event-title">${escHtml(d.eventTitle ?? d.title ?? 'Event')}</div>
      ${meta ? `<div class="event-meta">${meta}</div>` : ''}
    </div>`;
}

function ctaBtn(label: string, url?: string): string {
  if (!url) return '';
  return `<div class="btn-wrap"><a class="btn" href="${escHtml(url)}">${escHtml(label)}</a></div>`;
}

// ─── Subject Lines ─────────────────────────────────────────────────────────────
export function getEmailSubject(type: string, data: Record<string, any>): string {
  switch (type) {
    case 'new_event_parish':
      return `New event in ${data.parish}: ${data.eventTitle}`;
    case 'new_event_promoter':
      return `${data.promoterName} just posted: ${data.eventTitle}`;
    case 'event_change':
      return `Event updated — ${data.eventTitle}`;
    case 'event_cancelled':
      return `Cancelled: ${data.eventTitle}`;
    case 'rsvp_reminder':
      return `Tonight: ${data.eventTitle} 🎉`;
    case 'test_email':
      return 'Vybz Hub — Email System Test';
    default:
      return 'Vybz Hub Notification';
  }
}

// ─── HTML Templates ───────────────────────────────────────────────────────────
export function buildEmailHtml(type: string, data: Record<string, any>): string {
  switch (type) {

    case 'new_event_parish':
      return shell('New Event in Your Parish', `
        <div class="badge">📍 New in ${escHtml(data.parish ?? '')}</div>
        <h1>Fresh event in your area!</h1>
        <p>A new event just dropped in <span class="gold">${escHtml(data.parish ?? '')}</span> — one of your favourite parishes.</p>
        ${eventCard(data)}
        <p>RSVP early before tickets sell out.</p>
        ${ctaBtn('View Event', data.eventId ? `https://vybzhub.com/event/${data.eventId}` : undefined)}
      `);

    case 'new_event_promoter':
      return shell('New Event from a Promoter You Follow', `
        <div class="badge">🎤 New from ${escHtml(data.promoterName ?? '')}</div>
        <h1><span class="gold">${escHtml(data.promoterName ?? '')}</span> just posted!</h1>
        <p>A promoter you follow has a new event:</p>
        ${eventCard(data)}
        ${ctaBtn('See Full Details', data.eventId ? `https://vybzhub.com/event/${data.eventId}` : undefined)}
      `);

    case 'event_change':
      return shell('Event Updated', `
        <div class="badge">✏️ Event Updated</div>
        <h1>Details have changed</h1>
        <p>An event you RSVP'd to has been updated by the organiser:</p>
        ${eventCard(data)}
        ${data.changeDetails ? `<p>${escHtml(data.changeDetails)}</p>` : '<p>Date, time, or venue may have changed — please check the latest details before heading out.</p>'}
        ${ctaBtn('View Updated Event', data.eventId ? `https://vybzhub.com/event/${data.eventId}` : undefined)}
      `);

    case 'event_cancelled':
      return shell('Event Cancelled', `
        <div class="badge" style="background:#2A1010;color:#FF7777;">❌ Cancelled</div>
        <h1>An event has been cancelled</h1>
        <p>The organiser has cancelled an event you RSVP'd to:</p>
        <div class="card" style="border-color:#4A1A1A;">
          <div class="event-title" style="color:#FF9999;">${escHtml(data.eventTitle ?? '')}</div>
          <div class="event-meta" style="color:#994444;">This event has been cancelled by the organiser.</div>
        </div>
        <p>Browse other upcoming events on Vybz Hub — there's always something happening across Jamaica!</p>
        ${ctaBtn('Find Other Events', 'https://vybzhub.com')}
      `);

    case 'rsvp_reminder':
      return shell(`Tonight: ${data.eventTitle}`, `
        <div class="badge">🎉 Today's the Day!</div>
        <h1>Your event is <span class="gold">tonight!</span></h1>
        <p>Don't forget — you marked yourself as going to:</p>
        ${eventCard(data)}
        ${data.dressCode ? `<p>Dress code: <strong class="gold">${escHtml(data.dressCode)}</strong></p>` : ''}
        <p>Have an amazing time and stay safe! 🇯🇲</p>
        ${ctaBtn('View Event Details', data.eventId ? `https://vybzhub.com/event/${data.eventId}` : undefined)}
      `);

    case 'test_email':
      return shell('Email Test — Vybz Hub', `
        <div class="badge" style="background:#0F2E1A;color:#5BC47A;">✅ Test Email</div>
        <h1>Your email is <span class="gold">working!</span></h1>
        <p>This test email was sent from the <span class="gold">Vybz Hub Admin Panel</span> to verify your email pipeline.</p>
        <div class="card">
          <div class="event-title">SMTP / Email System Status</div>
          <div class="event-meta">
            ✅ Connection established<br>
            ✅ Authentication successful<br>
            ✅ Message delivered
          </div>
        </div>
        <p>All transactional emails — event alerts, RSVP reminders, and promoter updates — will route through this same pipeline.</p>
        <p class="muted">Sent at: ${escHtml(data.sentAt ?? new Date().toISOString())}</p>
      `);

    default:
      return shell('Vybz Hub Notification', `
        <h1>New notification</h1>
        <p>${escHtml(data.message ?? 'You have a new notification from Vybz Hub.')}</p>
      `);
  }
}

// ─── Plain Text Fallbacks ─────────────────────────────────────────────────────
export function buildEmailText(type: string, data: Record<string, any>): string {
  const footer = '\n\n---\nManage email preferences: info@vybzhub.com\nNeed help? info@vybzhub.com\nVybz Hub - Jamaica\'s Event Scene';

  const eventLine = [data.eventTitle, data.date, data.venue, data.parish, data.ticketPrice]
    .filter(Boolean).join(' | ');

  switch (type) {
    case 'new_event_parish':
      return `New event in ${data.parish}!\n\nView on Vybz Hub: https://vybzhub.com/event/${data.eventId ?? ''}${footer}`;
    case 'new_event_promoter':
      return `${data.promoterName} just posted a new event!\n\n${eventLine}\n\nView: https://vybzhub.com/event/${data.eventId ?? ''}${footer}`;
    case 'event_change':
      return `Event updated: ${data.eventTitle}\n\n${data.changeDetails ?? 'Details have changed. Check the latest info.'}\n\nView: https://vybzhub.com/event/${data.eventId ?? ''}${footer}`;
    case 'event_cancelled':
      return `Event cancelled: ${data.eventTitle}\n\nThis event has been cancelled by the organiser.\n\nBrowse other events: https://vybzhub.com${footer}`;
    case 'rsvp_reminder':
      return `Tonight: ${data.eventTitle}\n\nTime: ${data.startTime ?? 'TBA'}\nVenue: ${data.venue ?? ''}, ${data.parish ?? ''}\nDress Code: ${data.dressCode ?? 'Not specified'}\n\nView: https://vybzhub.com/event/${data.eventId ?? ''}${footer}`;
    case 'test_email':
      return `Vybz Hub Email System Test\n\nYour email pipeline is working correctly.\nSent at: ${data.sentAt ?? new Date().toISOString()}${footer}`;
    default:
      return `${data.message ?? 'New notification from Vybz Hub.'}${footer}`;
  }
}
