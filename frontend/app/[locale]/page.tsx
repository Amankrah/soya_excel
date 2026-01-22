import LandingPageClient from './landing-page-client';

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return <LandingPageClient locale={locale} />;
}
