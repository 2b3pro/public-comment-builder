'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { DocketCard } from '@/components/DocketCard';
import { getDashboardDockets, searchDockets, refreshDockets, getDocketCommentCounts, getTopRecentDockets, TrendingDocket, warmDocketCache } from '@/app/actions';
import { DocketSummary } from '@/lib/regulations-api';

// Debug mode shows mock data when buckets are empty (for demo purposes)
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true';

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DocketSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Data states - buckets aligned with Regulations.gov (3, 7, 15 days)
  const [due3Days, setDue3Days] = useState<DocketSummary[]>([]);
  const [due7Days, setDue7Days] = useState<DocketSummary[]>([]);
  const [due15Days, setDue15Days] = useState<DocketSummary[]>([]);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [trendingDockets, setTrendingDockets] = useState<TrendingDocket[]>([]);

  const fetchData = useCallback(async () => {
    // Single efficient call for all dashboard data (next 15 days)
    const allDocs = await getDashboardDockets();

    // Dates for filtering
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const in3Days = new Date();
    in3Days.setDate(today.getDate() + 3);
    const in3DaysStr = in3Days.toISOString().split('T')[0];

    const in7Days = new Date();
    in7Days.setDate(today.getDate() + 7);
    const in7DaysStr = in7Days.toISOString().split('T')[0];

    // Filter buckets - extract date portion since API returns full ISO timestamps
    // 1. Closing in 3 days (today through day 3)
    const threeDayDocs = allDocs.filter(d => {
      const endDate = d.commentEndDate?.split('T')[0];
      return endDate && endDate >= todayStr && endDate <= in3DaysStr;
    });

    // 2. Closing in 7 days (day 4 through day 7)
    const sevenDayDocs = allDocs.filter(d => {
      const endDate = d.commentEndDate?.split('T')[0];
      return endDate && endDate > in3DaysStr && endDate <= in7DaysStr;
    });

    // 3. Closing in 15 days (day 8 through day 15)
    const fifteenDayDocs = allDocs.filter(d => {
      const endDate = d.commentEndDate?.split('T')[0];
      return endDate && endDate > in7DaysStr;
    });

    // Apply mock data only in debug mode
    const final3Days = USE_MOCK && !threeDayDocs.length ? [MOCK_DOCKET_3] : threeDayDocs;
    const final7Days = USE_MOCK && !sevenDayDocs.length ? [MOCK_DOCKET_7] : sevenDayDocs;
    const final15Days = USE_MOCK && !fifteenDayDocs.length ? [MOCK_DOCKET_15] : fifteenDayDocs;

    setDue3Days(final3Days);
    setDue7Days(final7Days);
    setDue15Days(final15Days);

    // Fetch comment counts for all dockets in a single batch query
    const allDocketIds = [...final3Days, ...final7Days, ...final15Days].map(d => d.docketId);
    const counts = await getDocketCommentCounts(allDocketIds);
    setCommentCounts(counts);

    // Fetch top trending dockets (by comment count) - limit to 5
    const trending = await getTopRecentDockets(5);
    setTrendingDockets(trending);

    // Background cache warming: pre-analyze top dockets so users get instant results
    // Prioritize: 3-day dockets first, then 7-day, then 15-day
    const prioritizedDockets = [...final3Days, ...final7Days, ...final15Days];
    warmDocketCache(prioritizedDockets, 5).catch(err => {
      console.warn('[Dashboard] Cache warming failed:', err);
    });
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    const results = await searchDockets(searchQuery);
    setSearchResults(results);
    setIsSearching(false);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);

    try {
      // Start independent fetches in parallel
      const trendingPromise = getTopRecentDockets(5);

      // Wait for dockets first as filtering depends on it
      const allDocs = await refreshDockets();

      // Dates for filtering
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      const in3Days = new Date();
      in3Days.setDate(today.getDate() + 3);
      const in3DaysStr = in3Days.toISOString().split('T')[0];

      const in7Days = new Date();
      in7Days.setDate(today.getDate() + 7);
      const in7DaysStr = in7Days.toISOString().split('T')[0];

      // Filter buckets
      const threeDayDocs = allDocs.filter(d => {
        const endDate = d.commentEndDate?.split('T')[0];
        return endDate && endDate >= todayStr && endDate <= in3DaysStr;
      });
      const sevenDayDocs = allDocs.filter(d => {
        const endDate = d.commentEndDate?.split('T')[0];
        return endDate && endDate > in3DaysStr && endDate <= in7DaysStr;
      });
      const fifteenDayDocs = allDocs.filter(d => {
        const endDate = d.commentEndDate?.split('T')[0];
        return endDate && endDate > in7DaysStr;
      });

      // Apply mock data only in debug mode
      const final3Days = USE_MOCK && !threeDayDocs.length ? [MOCK_DOCKET_3] : threeDayDocs;
      const final7Days = USE_MOCK && !sevenDayDocs.length ? [MOCK_DOCKET_7] : sevenDayDocs;
      const final15Days = USE_MOCK && !fifteenDayDocs.length ? [MOCK_DOCKET_15] : fifteenDayDocs;

      setDue3Days(final3Days);
      setDue7Days(final7Days);
      setDue15Days(final15Days);

      // Fetch comment counts
      const allDocketIds = [...final3Days, ...final7Days, ...final15Days].map(d => d.docketId);
      const countsPromise = getDocketCommentCounts(allDocketIds);

      // Await remaining promises
      const [counts, trending] = await Promise.all([countsPromise, trendingPromise]);

      setCommentCounts(counts);
      setTrendingDockets(trending);
    } catch (error) {
      console.error('Failed to refresh dockets:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background-light">
      {/* Hero Search Section */}
      <section className="bg-white border-b border-gray-200 p-6 pb-10">
        <div className="max-w-md mx-auto text-center space-y-4">
          <Image
            src="/pcb-logo.png"
            alt="Public Comment Builder"
            width={240}
            height={240}
            className="mx-auto mb-2"
            priority
          />
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            Make Your Voice Count
          </h1>
          <p className="text-gray-500">
            Find federal regulations and draft legally effective public comments in minutes. Easy as…
          </p>

          {/* Easy as 1-2-3 Steps */}
          <div className="flex justify-center gap-6 mt-6 mb-2">
            <div className="flex flex-col items-center">
              <span className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-white text-2xl font-bold">1</span>
              <span className="mt-2 text-sm font-medium text-gray-700">Find a rule</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-white text-2xl font-bold">2</span>
              <span className="mt-2 text-sm font-medium text-gray-700">Pick arguments</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-white text-2xl font-bold">3</span>
              <span className="mt-2 text-sm font-medium text-gray-700">Submit comment</span>
            </div>
          </div>

          <form id="docket-search-form" onSubmit={handleSearch} className="relative mt-4">
            <input
              id="search-input"
              type="text"
              placeholder="Search by keyword or docket ID..."
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none shadow-sm transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              search
            </span>
            <button
              id="search-submit-btn"
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary text-white p-1.5 rounded-lg hover:bg-blue-600 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
          </form>
        </div>
      </section>

      {/* Main Content */}
      <main className="flex-1 max-w-md mx-auto w-full p-4 space-y-8 pb-32">

        {/* Search Results */}
        {(isSearching || searchResults.length > 0) && (
          <div className="animate-fade-in">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">search</span>
              Search Results
            </h2>
            {isSearching ? (
              <div className="text-center py-8 text-gray-500">Searching Regulations.gov...</div>
            ) : (
              <div className="space-y-4">
                {searchResults.map(doc => <DocketCard key={doc.id} docket={doc} commentCount={commentCounts[doc.docketId]} />)}
              </div>
            )}
          </div>
        )}

        {/* Recently Commented - Top 5 by comment count */}
        {!searchResults.length && trendingDockets.length > 0 && (
          <details className="animate-fade-in group" open>
            <summary className="list-none cursor-pointer">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-purple-500">forum</span>
                Recently Commented ({trendingDockets.length})
                <span className="material-symbols-outlined text-gray-400 text-base ml-auto group-open:rotate-180 transition-transform">
                  expand_more
                </span>
              </h2>
            </summary>
            <div className="space-y-3">
              {trendingDockets.map((docket, idx) => (
                <Link
                  key={docket.docketId}
                  href={`/docket/${encodeURIComponent(docket.docketId)}`}
                  className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:shadow-md hover:border-primary/30 transition-all group/card"
                >
                  <div className="flex items-center justify-center w-8 h-8 bg-purple-100 text-purple-600 rounded-lg font-bold text-sm">
                    #{idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate group-hover/card:text-primary transition-colors">
                      {docket.docketTitle || docket.docketId}
                    </p>
                    <p className="text-xs text-gray-500">
                      {docket.agencyId} • {docket.docketId}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                    <span className="material-symbols-outlined text-[14px]">groups</span>
                    {docket.count}
                  </div>
                </Link>
              ))}
            </div>
          </details>
        )}

        {/* Refresh Control */}
        {!searchResults.length && (
          <div className="flex justify-end">
            <button
              id="refresh-dockets-btn"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-primary transition-colors disabled:opacity-50"
              title="Refresh Dockets"
            >
              <span className={`material-symbols-outlined text-[18px] ${isRefreshing ? 'animate-spin' : ''}`}>
                refresh
              </span>
              Refresh List
            </button>
          </div>
        )}

        {/* Closing in 3 Days */}
        {!searchResults.length && (
          <details className="animate-slide-up group" open>
            <summary className="list-none cursor-pointer">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-red-600">alarm</span>
                Closing in 3 Days ({due3Days.length})
                <span className="material-symbols-outlined text-gray-400 text-base ml-auto group-open:rotate-180 transition-transform">
                  expand_more
                </span>
              </h2>
            </summary>
            <div className="space-y-4">
              {due3Days.map(doc => <DocketCard key={doc.id} docket={doc} commentCount={commentCounts[doc.docketId]} />)}
              {due3Days.length === 0 && <p className="text-sm text-gray-500 italic">No dockets closing in the next 3 days.</p>}
            </div>
          </details>
        )}

        {/* Closing in 7 Days */}
        {!searchResults.length && (
          <details className="animate-slide-up delay-100 group" open>
            <summary className="list-none cursor-pointer">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-orange-500">upcoming</span>
                Closing in 7 Days ({due7Days.length})
                <span className="material-symbols-outlined text-gray-400 text-base ml-auto group-open:rotate-180 transition-transform">
                  expand_more
                </span>
              </h2>
            </summary>
            <div className="space-y-4">
              {due7Days.map(doc => <DocketCard key={doc.id} docket={doc} commentCount={commentCounts[doc.docketId]} />)}
              {due7Days.length === 0 && <p className="text-sm text-gray-500 italic">No dockets closing in the next 7 days.</p>}
            </div>
          </details>
        )}

        {/* Closing in 15 Days */}
        {!searchResults.length && (
          <details className="animate-slide-up delay-200 group" open>
            <summary className="list-none cursor-pointer">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-500">calendar_month</span>
                Closing in 15 Days ({due15Days.length})
                <span className="material-symbols-outlined text-gray-400 text-base ml-auto group-open:rotate-180 transition-transform">
                  expand_more
                </span>
              </h2>
            </summary>
            <div className="space-y-4">
              {due15Days.map(doc => <DocketCard key={doc.id} docket={doc} commentCount={commentCounts[doc.docketId]} />)}
              {due15Days.length === 0 && <p className="text-sm text-gray-500 italic">No dockets closing in the next 15 days. Use search to find open comment periods.</p>}
            </div>
          </details>
        )}
      </main>
    </div>
  );
}

// Fallback Mock Data for Demo Purposes (only used when NEXT_PUBLIC_USE_MOCK=true)
const getMockDate = (daysFromNow: number) => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split('T')[0];
};

const MOCK_DOCKET_3: DocketSummary = {
  id: 'FDA-2023-D-0001',
  title: 'Labeling of Plant-Based Milk Alternatives',
  agencyId: 'FDA',
  docketId: 'FDA-2023-D-0001',
  postedDate: '2023-01-01',
  commentEndDate: getMockDate(2),
  subtype: 'Proposed Rule',
  abstract: 'Guidance for industry on labeling.',
  objectType: 'document',
};

const MOCK_DOCKET_7: DocketSummary = {
  id: 'USCBP-2025-0001',
  title: 'Arrival and Departure Record (Form I-94) and ESTA Revision',
  agencyId: 'CBP',
  docketId: 'USCBP-2025-0001',
  postedDate: '2025-12-01',
  commentEndDate: getMockDate(5),
  subtype: 'Proposed Rule',
  abstract: 'Updates to ESTA collection including social media.',
  objectType: 'document',
};

const MOCK_DOCKET_15: DocketSummary = {
  id: 'EPA-HQ-OAR-2023',
  title: 'Greenhouse Gas Emissions Standards for Heavy-Duty Vehicles',
  agencyId: 'EPA',
  docketId: 'EPA-HQ-OAR-2023',
  postedDate: '2023-03-15',
  commentEndDate: getMockDate(12),
  subtype: 'Proposed Rule',
  abstract: 'New standards for heavy duty trucks.',
  objectType: 'document',
};
