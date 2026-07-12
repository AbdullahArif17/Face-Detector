export const privacyContactEmail =
  process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim() || null;

export function PrivacyContact() {
  if (!privacyContactEmail) {
    return <span>the privacy contact listed in the application&apos;s Meta App settings</span>;
  }

  return <a href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a>;
}
