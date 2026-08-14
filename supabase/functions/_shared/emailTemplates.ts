
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
    case 'event_approved':
      return `Your event has been approved — Vybz Hub`;
    case 'event_rejected':
      return `Update about your event submission — Vybz Hub`;
    case 'account_deletion_approved':
      return 'Your Vybz Hub account has been deleted';
    case 'account_deletion_rejected':
      return 'Update on your Vybz Hub account deletion request';
    case 'ticket_purchase_confirmed':
      return `Your Vybz Hub Tickets Are Confirmed — ${data.eventTitle ?? 'Event'}`;
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

    case 'event_approved':
      return shell('Event Approved!', `
        <div class="badge" style="background:#0F2E1A;color:#5BC47A;">✅ Approved &amp; Live</div>
        <h1>Your event is <span class="gold">live!</span> 🎉</h1>
        <p>Hi ${escHtml(data.userName ?? 'there')},</p>
        <p>Great news — your event has been reviewed and <strong class="green">approved</strong> by our team. It is now live and visible to all Vybz Hub users across Jamaica.</p>
        ${eventCard(data)}
        <p>Party-goers can now discover, RSVP, and share your event. Spread the word and let the vibes flow! 🇯🇲</p>
        ${ctaBtn('View Your Event', data.eventId ? `https://vybzhub.com/event/${data.eventId}` : undefined)}
      `);

    case 'event_rejected':
      return shell('Update on Your Event', `
        <div class="badge" style="background:#2A1A0A;color:#FF9800;">⚠️ Needs Changes</div>
        <h1>Update on your event submission</h1>
        <p>Hi ${escHtml(data.userName ?? 'there')},</p>
        <p>Our team has reviewed your event and it requires some changes before it can go live.</p>
        <div class="card" style="border-color:#4A2A1A;">
          <div class="event-title" style="color:#FFC072;">${escHtml(data.eventTitle ?? 'Your Event')}</div>
          ${data.rejectionReason ? `<div class="event-meta" style="color:#AA7744;margin-top:8px;">📋 ${escHtml(data.rejectionReason)}</div>` : ''}
        </div>
        <p>You can open the Vybz Hub app, edit your event with the required changes, and resubmit it for review. Once approved it will be live for all users.</p>
        <p class="muted">Questions? Contact us at <a href="mailto:info@vybzhub.com" style="color:#FFC72C;">info@vybzhub.com</a></p>
      `);

    case 'account_deletion_approved':
      return shell('Account Deleted — Vybz Hub', `
        <div class="badge" style="background:#2A1010;color:#FF7777;">⚠️ Account Deleted</div>
        <h1>Your account has been deleted</h1>
        <p>Hi ${escHtml(data.userName ?? 'there')},</p>
        <p>Your Vybz Hub account deletion request has been approved. Your account and all associated data have been <strong>permanently removed</strong>.</p>
        <div class="card">
          <div class="event-title">What was removed</div>
          <div class="event-meta">
            ✓ Profile and personal information<br>
            ✓ All posted events and listings<br>
            ✓ RSVPs, bookmarks, and follows<br>
            ✓ Subscription and boost data
          </div>
        </div>
        <p>If you ever want to enjoy Jamaica's event scene again, you're always welcome to create a new account.</p>
        ${ctaBtn('Create a New Account', 'https://vybzhub.com')}
      `);

    case 'account_deletion_rejected':
      return shell('Deletion Request Update — Vybz Hub', `
        <div class="badge">🔔 Request Update</div>
        <h1>Your deletion request was not approved</h1>
        <p>Hi ${escHtml(data.userName ?? 'there')},</p>
        <p>Your Vybz Hub account deletion request has been reviewed by our team and was <strong>not approved</strong> at this time.</p>
        ${data.rejectionReason ? `
        <div class="card">
          <div class="event-title">Reason from our team</div>
          <div class="event-meta">${escHtml(data.rejectionReason ?? '')}</div>
        </div>` : ''}
        <p>Your account is still fully active and everything is exactly as you left it. If you have questions or believe this is an error, please contact our support team.</p>
        ${ctaBtn('Contact Support', 'mailto:hughachambers@yahoo.com')}
      `);

    case 'ticket_purchase_confirmed': {
      const items: Array<{name: string; qty: number; unitPrice: string}> = data.items ?? [];
      const itemRows = items.map((it) =>
        `<tr><td style="padding:6px 0;color:#B8D4BF;">${escHtml(it.name)}</td><td style="padding:6px 0;text-align:right;color:#F4EFE4;font-weight:700;">${escHtml(it.qty + 'x')} ${escHtml(it.unitPrice)}</td></tr>`
      ).join('');
      return shell(`Tickets Confirmed — ${data.eventTitle ?? 'Event'}`, `
        <div class="badge" style="background:#0F2E1A;color:#5BC47A;">✅ Payment Confirmed</div>
        <h1>Your tickets are <span class="gold">ready!</span> 🎉</h1>
        <p>Hi ${escHtml(data.userName ?? 'there')},</p>
        <p>Your payment was successful and your tickets have been issued. Show the QR code at the event entrance for entry.</p>
        ${eventCard({...data, ticketPrice: undefined})}
        <div class="card">
          <div class="event-title" style="margin-bottom:12px;">Order Summary</div>
          <table style="width:100%;border-collapse:collapse;">
            ${itemRows}
            <tr><td colspan="2"><div class="divider"></div></td></tr>
            <tr><td style="padding:6px 0;color:#6FA882;">Service Fee (5%)</td><td style="padding:6px 0;text-align:right;color:#B8D4BF;">${escHtml(data.feeAmount ?? '')}</td></tr>
            <tr><td style="padding:8px 0;color:#F4EFE4;font-weight:800;font-size:15px;">Total Paid</td><td style="padding:8px 0;text-align:right;color:#FFC72C;font-weight:900;font-size:15px;">${escHtml(data.totalAmount ?? '')}</td></tr>
          </table>
          <div class="divider"></div>
          <div class="event-meta">Order #: <span style="color:#F4EFE4;font-weight:700;">${escHtml(data.orderNumber ?? '')}</span></div>
          <div class="event-meta" style="margin-top:4px;">Currency: <span style="color:#F4EFE4;">${escHtml(data.currency ?? 'USD')}</span></div>
        </div>
        <p style="background:#0F2318;border:1px solid #1E4A2E;border-radius:8px;padding:14px;font-size:13px;color:#6FA882;">
          🎟 <strong style="color:#F4EFE4;">Entry Instructions:</strong> Open My Tickets in the Vybz Hub app and present your unique QR code at the door. Each QR code is valid for one entry only.
        </p>
        ${ctaBtn('View My Tickets in App', 'https://vybzhub.com/my-tickets')}
        <p class="muted" style="margin-top:12px;">Need help? Contact us at <a href="mailto:info@vybzhub.com" style="color:#FFC72C;">info@vybzhub.com</a> with your order number.</p>
      `);
    }

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
    case 'event_approved':
      return `Hi ${data.userName ?? 'there'},\n\nGreat news! Your event "${data.eventTitle ?? 'Your event'}" has been approved and is now live on Vybz Hub.\n\nView your event: https://vybzhub.com/event/${data.eventId ?? ''}${footer}`;
    case 'event_rejected':
      return `Hi ${data.userName ?? 'there'},\n\nYour event "${data.eventTitle ?? 'Your event'}" requires some changes before it can go live.\n\n${data.rejectionReason ? `Reason: ${data.rejectionReason}\n\n` : ''}Please edit your event in the Vybz Hub app and resubmit it for review.\n\nQuestions? Contact us at info@vybzhub.com${footer}`;
    case 'account_deletion_approved':
      return `Hi ${data.userName ?? 'there'},\n\nYour Vybz Hub account deletion request has been approved. Your account and all associated data have been permanently removed.\n\nIf you ever want to rejoin, you can create a new account at vybzhub.com${footer}`;
    case 'account_deletion_rejected':
      return `Hi ${data.userName ?? 'there'},\n\nYour Vybz Hub account deletion request has been reviewed and was not approved at this time.\n\n${data.rejectionReason ? `Reason: ${data.rejectionReason}\n\n` : ''}Your account remains active. For questions, contact us at hughachambers@yahoo.com${footer}`;
    case 'ticket_purchase_confirmed': {
      const items2: Array<{name: string; qty: number; unitPrice: string}> = data.items ?? [];
      const itemLines = items2.map((it) => `  ${it.qty}x ${it.name}: ${it.unitPrice}`).join('\n');
      return `Hi ${data.userName ?? 'there'},\n\nYour tickets are confirmed for ${data.eventTitle ?? 'the event'}!\n\nEVENT DETAILS:\nDate: ${data.date ?? ''}\nTime: ${data.startTime ?? ''}\nVenue: ${data.venue ?? ''}${data.parish ? ', ' + data.parish : ''}\n\nORDER SUMMARY:\n${itemLines}\nService Fee: ${data.feeAmount ?? ''}\nTotal Paid: ${data.totalAmount ?? ''} ${data.currency ?? 'USD'}\nOrder #: ${data.orderNumber ?? ''}\n\nOpen the Vybz Hub app and go to My Tickets to view your QR code. Present it at the event entrance for entry.\n\nNeed help? Email info@vybzhub.com${footer}`;
    }
    case 'test_email':
      return `Vybz Hub Email System Test\n\nYour email pipeline is working correctly.\nSent at: ${data.sentAt ?? new Date().toISOString()}${footer}`;
    default:
      return `${data.message ?? 'New notification from Vybz Hub.'}${footer}`;
  }
}
