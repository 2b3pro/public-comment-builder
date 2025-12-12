import { Metadata } from 'next';
import { getDocument } from '@/app/actions';

type Props = {
    params: Promise<{ id: string }>;
};

export async function generateMetadata(
    { params }: Props
): Promise<Metadata> {
    const resolvedParams = await params;
    const id = decodeURIComponent(resolvedParams.id);

    const docket = await getDocument(id);

    if (!docket) {
        return {
            title: 'Docket Not Found',
        };
    }

    const description = docket.abstract
        ? (docket.abstract.length > 160 ? docket.abstract.substring(0, 157) + '...' : docket.abstract)
        : `Draft a substantive public comment for ${docket.title}.`;

    return {
        title: `${docket.title}`,
        description: description,
        openGraph: {
            title: docket.title,
            description: description,
            type: 'article',
            siteName: 'Public Comment Builder',
        },
        twitter: {
            card: 'summary',
            title: docket.title,
            description: description,
        }
    };
}

export default function DocketLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
