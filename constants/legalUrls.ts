// ─── Vybz Hub Legal URLs ──────────────────────────────────────────────────────
// Central source of truth for all public legal document links.
// All URLs point to https://vybzhub.com — the authoritative legal source.
// Never duplicate legal text natively; link to the website instead.
//
// Usage:
//   import { LEGAL_URLS } from '../constants/legalUrls';
//   Linking.openURL(LEGAL_URLS.terms);

export const LEGAL_URLS = {
  terms:                 'https://vybzhub.com/terms',
  privacy:               'https://vybzhub.com/privacy',
  subscriptionTerms:     'https://vybzhub.com/subscription-terms',
  ticketTerms:           'https://vybzhub.com/ticket-terms',
  promoterTicketingTerms:'https://vybzhub.com/promoter-ticketing-terms',
  refundPolicy:          'https://vybzhub.com/refund-policy',
  transferPolicy:        'https://vybzhub.com/ticket-transfer-policy',
  promoterPolicy:        'https://vybzhub.com/promoter-policy',
  acceptableUse:         'https://vybzhub.com/acceptable-use',
  cookiePolicy:          'https://vybzhub.com/cookies',
  accessibility:         'https://vybzhub.com/accessibility',
} as const;

export type LegalUrlKey = keyof typeof LEGAL_URLS;
