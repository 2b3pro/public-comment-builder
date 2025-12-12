'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { DocketCard } from '@/components/DocketCard';
import { getDashboardDockets, searchDockets, refreshDockets, getDocketCommentCounts, getTopRecentDockets, TrendingDocket } from '@/app/actions';
import { DocketSummary } from '@/lib/regulations-api';

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DocketSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Data states
  const [dueToday, setDueToday] = useState<DocketSummary[]>([]);
  const [due3Days, setDue3Days] = useState<DocketSummary[]>([]);
  const [due7Days, setDue7Days] = useState<DocketSummary[]>([]);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [trendingDockets, setTrendingDockets] = useState<TrendingDocket[]>([]);

  const fetchData = useCallback(async () => {
    // Single efficient call for all dashboard data (next 7 days)
    const allDocs = await getDashboardDockets();

    // Dates for filtering
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const in3Days = new Date();
    in3Days.setDate(today.getDate() + 3);
    const in3DaysStr = in3Days.toISOString().split('T')[0];

    // Filter buckets
    // 1. Due Today
    const todayDocs = allDocs.filter(d => d.commentEndDate === todayStr);

    // 2. Due in <= 3 Days (excluding today to avoid dupe visual if desired, or inclusive)
    // Let's make it inclusive for "Upcoming" list or exclusive?
    // Usually "Closing in 3 Days" implies a window. Let's just show next 3 days.
    const threeDayDocs = allDocs.filter(d => d.commentEndDate && d.commentEndDate <= in3DaysStr && d.commentEndDate > todayStr);

    // 3. Due in <= 7 Days (rest of week)
    const sevenDayDocs = allDocs.filter(d => d.commentEndDate && d.commentEndDate > in3DaysStr);

    // Apply Mocks if empty (for demo robustness)
    const finalToday = todayDocs.length ? todayDocs : [MOCK_DOCKET_TODAY];
    const final3Days = threeDayDocs.length ? threeDayDocs : [MOCK_DOCKET_3];
    const final7Days = sevenDayDocs.length ? sevenDayDocs : [MOCK_DOCKET_7];

    setDueToday(finalToday);
    setDue3Days(final3Days);
    setDue7Days(final7Days);

    // Fetch comment counts for all dockets in a single batch query
    const allDocketIds = [...finalToday, ...final3Days, ...final7Days].map(d => d.docketId);
    const counts = await getDocketCommentCounts(allDocketIds);
    setCommentCounts(counts);

    // Fetch top trending dockets (by comment count)
    const trending = await getTopRecentDockets(3);
    setTrendingDockets(trending);
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

    // Fetch fresh from API (bypasses cache)
    const allDocs = await refreshDockets();

    // Dates for filtering
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const in3Days = new Date();
    in3Days.setDate(today.getDate() + 3);
    const in3DaysStr = in3Days.toISOString().split('T')[0];

    // Filter buckets
    const todayDocs = allDocs.filter(d => d.commentEndDate?.split('T')[0] === todayStr);
    const threeDayDocs = allDocs.filter(d => {
      const endDate = d.commentEndDate?.split('T')[0];
      return endDate && endDate <= in3DaysStr && endDate > todayStr;
    });
    const sevenDayDocs = allDocs.filter(d => {
      const endDate = d.commentEndDate?.split('T')[0];
      return endDate && endDate > in3DaysStr;
    });

    // Apply mocks if empty
    const finalToday = todayDocs.length ? todayDocs : [MOCK_DOCKET_TODAY];
    const final3Days = threeDayDocs.length ? threeDayDocs : [MOCK_DOCKET_3];
    const final7Days = sevenDayDocs.length ? sevenDayDocs : [MOCK_DOCKET_7];

    setDueToday(finalToday);
    setDue3Days(final3Days);
    setDue7Days(final7Days);

    // Fetch comment counts
    const allDocketIds = [...finalToday, ...final3Days, ...final7Days].map(d => d.docketId);
    const counts = await getDocketCommentCounts(allDocketIds);
    setCommentCounts(counts);

    // Fetch trending
    const trending = await getTopRecentDockets(3);
    setTrendingDockets(trending);

    setIsRefreshing(false);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background-light">
      {/* Hero Search Section */}
      <section className="bg-white border-b border-gray-200 p-6 pb-10">
        <div className="max-w-md mx-auto text-center space-y-4">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            Make Your Voice Count
          </h1>
          <p className="text-gray-500">
            Find federal regulations and draft legally effective public comments in minutes.
          </p>

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

        {/* Trending Dockets - Most Commented */}
        {!searchResults.length && trendingDockets.length > 0 && (
          <section className="animate-fade-in">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-purple-500">trending_up</span>
              Trending — Most Commented
            </h2>
            <div className="space-y-3">
              {trendingDockets.map((docket, idx) => (
                <Link
                  key={docket.docketId}
                  href={`/docket/${encodeURIComponent(docket.docketId)}`}
                  className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:shadow-md hover:border-primary/30 transition-all group"
                >
                  <div className="flex items-center justify-center w-8 h-8 bg-purple-100 text-purple-600 rounded-lg font-bold text-sm">
                    #{idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate group-hover:text-primary transition-colors">
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
          </section>
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

        {/* Due Today */}
        {!searchResults.length && (
          <section className="animate-slide-up">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-red-600">alarm</span>
              Closing Today ({dueToday.length})
            </h2>
            <div className="space-y-4">
              {dueToday.map(doc => <DocketCard key={doc.id} docket={doc} commentCount={commentCounts[doc.docketId]} />)}
              {dueToday.length === 0 && <p className="text-sm text-gray-500 italic">No major dockets closing today.</p>}
            </div>
          </section>
        )}

        {/* Due in 3 Days */}
        {!searchResults.length && (
          <section className="animate-slide-up delay-100">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-orange-500">upcoming</span>
              Closing in 3 Days ({due3Days.length})
            </h2>
            <div className="space-y-4">
              {due3Days.map(doc => <DocketCard key={doc.id} docket={doc} commentCount={commentCounts[doc.docketId]} />)}
            </div>
          </section>
        )}

        {/* Featured / Week */}
        {!searchResults.length && (
          <section className="animate-slide-up delay-200">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-500">calendar_month</span>
              Closing This Week ({due7Days.length})
            </h2>
            <div className="space-y-4">
              {due7Days.map(doc => <DocketCard key={doc.id} docket={doc} commentCount={commentCounts[doc.docketId]} />)}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

// Fallback Mock Data for Demo Purposes
const MOCK_DOCKET_TODAY: DocketSummary = {
  id: 'FDA-2023-D-0001',
  title: 'Labeling of Plant-Based Milk Alternatives',
  agencyId: 'FDA',
  docketId: 'FDA-2023-D-0001',
  postedDate: '2023-01-01',
  commentEndDate: new Date().toISOString().split('T')[0],
  subtype: 'Proposed Rule',
  abstract: 'Guidance for industry on labeling.',
};

const MOCK_DOCKET_3: DocketSummary = {
  id: 'USCBP-2025-0001',
  title: 'Arrival and Departure Record (Form I-94) and ESTA Revision',
  agencyId: 'CBP',
  docketId: 'USCBP-2025-0001',
  postedDate: '2025-12-01',
  commentEndDate: '2026-02-09',
  subtype: 'Proposed Rule',
  abstract: 'Updates to ESTA collection including social media.',
};

const MOCK_DOCKET_7: DocketSummary = {
  id: 'EPA-HQ-OAR-2023',
  title: 'Greenhouse Gas Emissions Standards for Heavy-Duty Vehicles',
  agencyId: 'EPA',
  docketId: 'EPA-HQ-OAR-2023',
  postedDate: '2023-03-15',
  commentEndDate: '2025-12-20',
  subtype: 'Proposed Rule',
  abstract: 'New standards for heavy duty trucks.',
};
