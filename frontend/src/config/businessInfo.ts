/**
 * Public business information shown on the landing page. Edit the
 * values below with your real details - everything here is safe to
 * change without touching any other file.
 */
export const BUSINESS_INFO = {
  name: 'Sengasu Mini Supermarket',
  tagline: 'Fresh products, everyday essentials, honest prices.',
  phone: '0746 110 107',
  whatsapp: '255746110107',
  email: 'sengasusupermarket@gmail.com', // TODO: replace with your real email
  googleReviewUrl: 'https://g.page/r/CXDJV2tl1SVUECE/review',
  openingHours: 'Mon - Sun: 7:00 AM - 10:00 PM',
} as const

/**
 * Returns the direct Google review link for the business.
 */
export function getGoogleReviewUrl(): string {
  return BUSINESS_INFO.googleReviewUrl
}

/** Builds a Google Maps directions link from a free-text address. */
export function getDirectionsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
}

/** Builds a wa.me WhatsApp chat link. */
export function getWhatsAppUrl(message?: string): string {
  const base = `https://wa.me/${BUSINESS_INFO.whatsapp}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}
