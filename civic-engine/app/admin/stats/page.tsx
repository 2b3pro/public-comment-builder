'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getAdminStats } from '@/app/actions';
import { AdminStats } from '@/lib/stats-db';

// Wrapper component with Suspense for useSearchParams
export default function AdminStatsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    }>
      <AdminStatsContent />
    </Suspense>
  );
}

function AdminStatsContent() {
  const searchParams = useSearchParams();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const key = searchParams.get('key');
      if (!key) {
        setError('Access denied. Missing authentication key.');
        setLoading(false);
        return;
      }

      const result = await getAdminStats(key);
      if (!result) {
        setError('Access denied. Invalid authentication key.');
      } else {
        setStats(result);
      }
      setLoading(false);
    };

    fetchStats();
  }, [searchParams]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading statistics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h1 className="text-red-700 font-bold text-lg mb-2">Access Denied</h1>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const expertRate = stats.totalComments > 0
    ? Math.round((stats.expertCount / stats.totalComments) * 100)
    : 0;

  const livelihoodRate = stats.totalComments > 0
    ? Math.round((stats.livelihoodCount / stats.totalComments) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Admin Statistics</h1>
          <span className="text-xs text-gray-400">Public Comment Builder</span>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Comments"
            value={stats.totalComments}
            icon="edit_document"
            color="blue"
          />
          <StatCard
            label="Expert Rate"
            value={`${expertRate}%`}
            icon="school"
            color="purple"
            subtitle={`${stats.expertCount} experts`}
          />
          <StatCard
            label="Livelihood Impact"
            value={`${livelihoodRate}%`}
            icon="work"
            color="amber"
            subtitle={`${stats.livelihoodCount} affected`}
          />
          <StatCard
            label="Agencies"
            value={stats.byAgency.length}
            icon="account_balance"
            color="green"
          />
        </div>

        {/* Position Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-gray-500">pie_chart</span>
            Position Breakdown
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <PositionBar label="Support" count={stats.byPosition.support} total={stats.totalComments} color="green" />
            <PositionBar label="Mixed" count={stats.byPosition.mixed} total={stats.totalComments} color="amber" />
            <PositionBar label="Oppose" count={stats.byPosition.oppose} total={stats.totalComments} color="red" />
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Top Dockets */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-gray-500">trending_up</span>
              Top Dockets
            </h2>
            {stats.topDockets.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No data yet</p>
            ) : (
              <div className="space-y-3">
                {stats.topDockets.map((d, i) => (
                  <div key={d.docketId} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-400 w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{d.docketId}</p>
                      <p className="text-xs text-gray-500 truncate">{d.docketTitle || 'Untitled'}</p>
                    </div>
                    <span className="text-sm font-bold text-primary">{d.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* By Agency */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-gray-500">domain</span>
              By Agency
            </h2>
            {stats.byAgency.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No data yet</p>
            ) : (
              <div className="space-y-2">
                {stats.byAgency.slice(0, 10).map((a) => (
                  <div key={a.agencyId} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{a.agencyId}</span>
                    <span className="text-sm font-bold text-gray-900">{a.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Popular Argument Topics */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-gray-500">lightbulb</span>
            Popular Argument Topics
          </h2>
          {stats.popularTopics.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No data yet</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {stats.popularTopics.map((t) => (
                <span
                  key={t.topic}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm"
                >
                  {t.topic}
                  <span className="text-xs text-blue-500">({t.count})</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper Components

function StatCard({
  label,
  value,
  icon,
  color,
  subtitle,
}: {
  label: string;
  value: string | number;
  icon: string;
  color: 'blue' | 'purple' | 'amber' | 'green';
  subtitle?: string;
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    amber: 'bg-amber-50 text-amber-600',
    green: 'bg-green-50 text-green-600',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className={`w-8 h-8 rounded-lg ${colorClasses[color]} flex items-center justify-center mb-2`}>
        <span className="material-symbols-outlined text-lg">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}

function PositionBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: 'green' | 'amber' | 'red';
}) {
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;

  const colorClasses = {
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-gray-700">{label}</span>
        <span className="text-sm font-bold text-gray-900">{count}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClasses[color]} rounded-full transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 mt-1">{percentage}%</p>
    </div>
  );
}
