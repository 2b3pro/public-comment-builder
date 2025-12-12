import { MetadataRoute } from 'next';
import { getDashboardDockets, getTopRecentDockets } from '@/app/actions';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    // Ideally this comes from an environment variable
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://publiccommentbuilder.com';

    // Static routes
    const routes = [
        '',
        '/faq',
    ].map((route) => ({
        url: `${baseUrl}${route}`,
        lastModified: new Date(),
        changeFrequency: 'daily' as const,
        priority: route === '' ? 1 : 0.8,
    }));

    try {
        // Dynamic routes (Dashboard dockets)
        const dashboardDockets = await getDashboardDockets();
        const trendingDockets = await getTopRecentDockets(20);

        // Use a Map to deduplicate by docketId
        const docketMap = new Map();

        // Add dashboard dockets
        dashboardDockets.forEach(d => {
            docketMap.set(d.docketId, d);
        });

        // Add trending dockets (might overlap)
        trendingDockets.forEach(d => {
            docketMap.set(d.docketId, d);
        });

        const docketRoutes = Array.from(docketMap.values()).map((docket) => ({
            url: `${baseUrl}/docket/${docket.docketId}`,
            lastModified: new Date(),
            changeFrequency: 'daily' as const,
            priority: 0.7,
        }));

        return [...routes, ...docketRoutes];
    } catch (error) {
        console.error('Error generating sitemap docket routes:', error);
        // Return at least the static routes if fetching fails
        return routes;
    }
}
