// ============================================================================
// CineMega — Admin Login & Comprehensive Dashboard (`/admin`)
// ============================================================================
// Includes:
// 1. Library Management (Inspect Mega Folder/File, Add, Edit, Delete, Re-inspect,
//    Manual Thumbnail Generation without 30s delay)
// 2. Custom Regex Filename Trimmer (Pattern, Replacement, Target raw/cleaned,
//    Inline Regex Validation, Live Preview)
// 3. Distributed Worker Pool Management (Cloudflare, Vercel, Netlify, Local Node
//    status, latency, database connectivity, and Selective Cache Clearing)
// 4. Analytics (Total views, watch time, cache hits, Mega requests, cached bytes
//    served, top videos, recent playback)
// 5. Admin Profile (Username, Email, Scrypt Password Update)
// 6. Deployment & Architecture Guide (Step-by-step instructions for all 14 topics)

import {
  Activity,
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Database,
  FolderPlus,
  Image as ImageIcon,
  Lock,
  LogOut,
  RefreshCw,
  Server,
  Settings,
  Trash2,
  Wand2,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { applyCustomRegexTrim, STANDARD_GENRES } from '../api/megaUtils';
import { useCineMega } from '../context/CineMegaContext';
import type {
  AdminStatsResponse,
  AdminUser,
  InspectResult,
  LibraryFolder,
} from '../types/cinemega';
import { apiWorkerPool, type WorkerNodeState } from '../utils/apiBase';
import { formatBytes, formatWatchHours } from '../utils/formatters';
import { thumbnailQueue } from '../utils/thumbnailGenerator';

type AdminTab = 'library' | 'workers' | 'analytics' | 'profile' | 'guide';

export const AdminPage: React.FC = () => {
  const { folders, refreshLibrary } = useCineMega();

  const [authChecking, setAuthChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [requiresSetup, setRequiresSetup] = useState(false);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);

  // Login / Claim Form state
  const [loginIdentifier, setLoginIdentifier] = useState('admin');
  const [loginEmail, setLoginEmail] = useState('admin@cinemega.local');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // Dashboard active tab
  const [activeTab, setActiveTab] = useState<AdminTab>('library');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Mega Inspection & Add Folder Form
  const [megaUrlInput, setMegaUrlInput] = useState('');
  const [forceRefreshInspect, setForceRefreshInspect] = useState(false);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectedData, setInspectedData] = useState<InspectResult | null>(null);

  // Folder Customization & Custom Regex Trimmer
  const [customFolderName, setCustomFolderName] = useState('');
  const [customGenre, setCustomGenre] = useState('Sci-Fi');
  const [customDescription, setCustomDescription] = useState('');
  const [regexPattern, setRegexPattern] = useState('');
  const [regexReplacement, setRegexReplacement] = useState('');
  const [regexTarget, setRegexTarget] = useState<'raw' | 'cleaned'>('cleaned');
  const [savingFolder, setSavingFolder] = useState(false);

  // Edit Existing Folder Inline Modal State
  const [editingFolder, setEditingFolder] = useState<LibraryFolder | null>(null);
  const [editName, setEditName] = useState('');
  const [editGenre, setEditGenre] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editRegexPattern, setEditRegexPattern] = useState('');
  const [editRegexReplacement, setEditRegexReplacement] = useState('');
  const [editRegexTarget, setEditRegexTarget] = useState<'raw' | 'cleaned'>('cleaned');

  // Stats & Worker Pool State
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [workers, setWorkers] = useState<WorkerNodeState[]>(
    apiWorkerPool.getWorkersSnapshot()
  );
  const [refreshingWorkers, setRefreshingWorkers] = useState(false);
  const [generatingThumbId, setGeneratingThumbId] = useState<string | null>(null);

  // Admin Profile Form
  const [profileUsername, setProfileUsername] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileNewPassword, setProfileNewPassword] = useState('');

  const loadAdminStatsAndWorkers = useCallback(async () => {
    try {
      const [statsRes, workerSnap] = await Promise.all([
        apiWorkerPool.fetchApi<AdminStatsResponse>('/api/admin/stats'),
        apiWorkerPool.refreshAllWorkersHealth(),
      ]);
      setStats(statsRes);
      setWorkers(workerSnap);
    } catch {
      // non-fatal
    }
  }, []);

  const checkSession = useCallback(async () => {
    try {
      setAuthChecking(true);
      const res = await apiWorkerPool.fetchApi<{
        authenticated: boolean;
        requiresSetup: boolean;
        user: AdminUser | null;
      }>('/api/admin/me');

      setAuthenticated(res.authenticated);
      setRequiresSetup(res.requiresSetup);
      setAdminUser(res.user);
      if (res.user) {
        setProfileUsername(res.user.username);
        setProfileEmail(res.user.email);
      }
      if (res.authenticated) {
        void loadAdminStatsAndWorkers();
      }
    } catch {
      setAuthenticated(false);
    } finally {
      setAuthChecking(false);
    }
  }, [loadAdminStatsAndWorkers]);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    try {
      const res = await apiWorkerPool.fetchApi<{
        authenticated: boolean;
        token?: string;
        user: AdminUser;
      }>('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          identifier: loginIdentifier,
          email: loginEmail,
          password: loginPassword,
        }),
      });

      if (res.token) {
        apiWorkerPool.setAdminToken(res.token);
      }
      setAuthenticated(true);
      setRequiresSetup(false);
      setAdminUser(res.user);
      setProfileUsername(res.user.username);
      setProfileEmail(res.user.email);
      setLoginPassword('');
      void loadAdminStatsAndWorkers();
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiWorkerPool.fetchApi('/api/admin/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    apiWorkerPool.setAdminToken(null);
    setAuthenticated(false);
    setAdminUser(null);
  };

  // Validate Custom Regex live and compute preview titles
  const regexValidationAndPreview = useMemo(() => {
    if (!inspectedData) {
      if (!regexPattern) return { isValid: true, error: undefined, previews: [] };
      const check = applyCustomRegexTrim('Sample Title 2026', regexPattern, regexReplacement);
      return { isValid: check.isValidRegex, error: check.error, previews: [] };
    }

    let isValid = true;
    let error: string | undefined;
    const previews = inspectedData.videos.map((v) => {
      const sourceText = regexTarget === 'raw' ? v.rawFileName : v.cleanedFileName || v.title;
      const trimmed = applyCustomRegexTrim(sourceText, regexPattern, regexReplacement);
      if (!trimmed.isValidRegex) {
        isValid = false;
        error = trimmed.error;
      }
      return {
        videoId: v.id,
        rawFileName: v.rawFileName,
        cleanedFileName: v.cleanedFileName,
        finalTitle: trimmed.isValidRegex && trimmed.result ? trimmed.result : v.title,
        sizeBytes: v.sizeBytes,
      };
    });

    return { isValid, error, previews };
  }, [inspectedData, regexPattern, regexReplacement, regexTarget]);

  const handleInspectMegaUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    setInspectLoading(true);
    try {
      const res = await apiWorkerPool.fetchApi<{ inspection: InspectResult }>(
        '/api/mega/inspect',
        {
          method: 'POST',
          body: JSON.stringify({
            megaUrl: megaUrlInput,
            forceRefresh: forceRefreshInspect,
          }),
        }
      );

      const info = res.inspection;
      setInspectedData(info);
      setCustomFolderName(info.folderName);
      setCustomGenre(info.suggestedGenre);
      setCustomDescription(
        `${info.suggestedGenre} collection inspected from Mega.nz (${info.videos.length} videos).`
      );
      setStatusMessage(
        `Inspected "${info.folderName}" (${info.videos.length} videos detected${
          info.fromCache ? ' · served from Supabase inspect_cache' : ''
        }).`
      );
      void loadAdminStatsAndWorkers();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to inspect Mega.nz link.');
    } finally {
      setInspectLoading(false);
    }
  };

  const handleSaveInspectedFolder = async () => {
    if (!inspectedData) return;
    if (!regexValidationAndPreview.isValid) {
      setErrorMessage(`Invalid custom regex: ${regexValidationAndPreview.error}`);
      return;
    }

    setSavingFolder(true);
    setErrorMessage(null);
    try {
      const videosWithTrimmedTitles = inspectedData.videos.map((v, i) => ({
        ...v,
        title: regexValidationAndPreview.previews[i]?.finalTitle || v.title,
        cleanedFileName: regexValidationAndPreview.previews[i]?.finalTitle || v.cleanedFileName,
      }));

      await apiWorkerPool.fetchApi('/api/admin/folders', {
        method: 'POST',
        body: JSON.stringify({
          name: customFolderName,
          genre: customGenre,
          description: customDescription,
          megaUrl: inspectedData.megaUrl,
          sourceType: inspectedData.sourceType,
          videos: videosWithTrimmedTitles,
          regexPattern,
          regexReplacement,
          regexTarget,
        }),
      });

      setStatusMessage(`Saved folder "${customFolderName}" to library catalog.`);
      setInspectedData(null);
      setMegaUrlInput('');
      setRegexPattern('');
      setRegexReplacement('');
      await refreshLibrary();
      await loadAdminStatsAndWorkers();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save folder.');
    } finally {
      setSavingFolder(false);
    }
  };

  const handleReinspectExistingFolder = async (folder: LibraryFolder) => {
    setErrorMessage(null);
    setStatusMessage(`Re-inspecting "${folder.name}" from Mega.nz...`);
    try {
      const res = await apiWorkerPool.fetchApi<{ inspection: InspectResult }>(
        '/api/mega/inspect',
        {
          method: 'POST',
          body: JSON.stringify({
            megaUrl: folder.megaUrl,
            forceRefresh: true,
          }),
        }
      );
      setStatusMessage(
        `Re-inspected "${folder.name}" (${res.inspection.videos.length} videos verified).`
      );
      await loadAdminStatsAndWorkers();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Re-inspection failed.');
    }
  };

  const handleDeleteFolder = async (folder: LibraryFolder) => {
    setErrorMessage(null);
    try {
      await apiWorkerPool.fetchApi(`/api/admin/folders/${encodeURIComponent(folder.id)}`, {
        method: 'DELETE',
      });
      setStatusMessage(`Deleted folder "${folder.name}" and cleaned up related records.`);
      await refreshLibrary();
      await loadAdminStatsAndWorkers();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to delete folder.');
    }
  };

  const handleGenerateThumbnailNow = async (folderId: string, folderName: string) => {
    setGeneratingThumbId(folderId);
    setErrorMessage(null);
    try {
      const res = await thumbnailQueue.generateAdminThumbnailNow(undefined, folderId);
      setStatusMessage(
        `Generated ${res.generatedCount} thumbnails immediately for "${folderName}".`
      );
      await refreshLibrary();
      await loadAdminStatsAndWorkers();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Thumbnail generation failed.');
    } finally {
      setGeneratingThumbId(null);
    }
  };

  const handleSaveEditedFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFolder) return;
    setErrorMessage(null);
    try {
      await apiWorkerPool.fetchApi(
        `/api/admin/folders/${encodeURIComponent(editingFolder.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: editName,
            genre: editGenre,
            description: editDescription,
            regexPattern: editRegexPattern || undefined,
            regexReplacement: editRegexReplacement || undefined,
            regexTarget: editRegexTarget,
          }),
        }
      );
      setStatusMessage(`Updated folder "${editName}".`);
      setEditingFolder(null);
      await refreshLibrary();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update folder.');
    }
  };

  const handleClearCacheCategory = async (categories: string[]) => {
    setErrorMessage(null);
    try {
      const res = await apiWorkerPool.fetchApi<{ cleared: string[] }>(
        '/api/admin/cache/clear',
        {
          method: 'POST',
          body: JSON.stringify({ categories }),
        }
      );
      setStatusMessage(`Cleared cache tables: ${res.cleared.join(', ')}`);
      await loadAdminStatsAndWorkers();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to clear cache.');
    }
  };

  const handleRefreshWorkers = async () => {
    setRefreshingWorkers(true);
    try {
      const updated = await apiWorkerPool.refreshAllWorkersHealth();
      setWorkers(updated);
      setStatusMessage('Probed health across all configured distributed workers.');
    } finally {
      setRefreshingWorkers(false);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await apiWorkerPool.fetchApi<{
        updated: boolean;
        token?: string;
        user: AdminUser;
      }>('/api/admin/profile', {
        method: 'POST',
        body: JSON.stringify({
          username: profileUsername,
          email: profileEmail,
          newPassword: profileNewPassword || undefined,
        }),
      });
      if (res.token) {
        apiWorkerPool.setAdminToken(res.token);
      }
      setAdminUser(res.user);
      setProfileNewPassword('');
      setStatusMessage('Administrator credentials updated with scrypt hashing.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update profile.');
    }
  };

  if (authChecking) {
    return (
      <main className="max-w-[1360px] mx-auto px-6 py-16">
        <div className="max-w-md mx-auto h-64 rounded-2xl bg-zinc-900/60 border border-zinc-800 animate-pulse" />
      </main>
    );
  }

  // Unauthenticated View: Admin Sign-In or First-Run Setup Claim Form
  if (!authenticated) {
    return (
      <main className="max-w-[1360px] mx-auto px-6 py-14">
        <div className="max-w-md mx-auto p-8 rounded-2xl bg-zinc-900/80 border border-zinc-800/90 space-y-6">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <h1 className="font-display text-2xl font-bold text-zinc-100">
              {requiresSetup
                ? 'Claim Administrator Console'
                : 'Administrator Sign In'}
            </h1>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {requiresSetup
                ? 'First-run setup: choose your administrator username, email, and password. Credentials will be atomically hashed with scrypt and stored in Supabase admin_config.'
                : 'Authenticate with your administrator username or email and password to manage Mega.nz folders, workers, and shared caches.'}
            </p>
          </div>

          {loginError && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="admin-identifier"
                className="block text-xs font-medium text-zinc-300"
              >
                Username or Email
              </label>
              <input
                id="admin-identifier"
                type="text"
                required
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            {requiresSetup && (
              <div className="space-y-1.5">
                <label
                  htmlFor="admin-email"
                  className="block text-xs font-medium text-zinc-300"
                >
                  Administrator Email
                </label>
                <input
                  id="admin-email"
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="admin-password"
                className="block text-xs font-medium text-zinc-300"
              >
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                required
                minLength={4}
                placeholder={requiresSetup ? 'Choose an admin password (min 4 chars)' : 'Enter password'}
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold text-sm transition-colors"
            >
              {loginLoading
                ? 'Authenticating...'
                : requiresSetup
                  ? 'Claim & Initialize Admin Account'
                  : 'Sign In to Admin Console'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // Authenticated Admin Console
  return (
    <main className="max-w-[1360px] mx-auto px-6 py-8 space-y-8">
      {/* Header & Navigation Tabs */}
      <div className="space-y-5 border-b border-zinc-800/80 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-amber-400">
              ADMINISTRATOR CONSOLE · {adminUser?.username} ({adminUser?.email})
            </div>
            <h1 className="font-display text-3xl font-bold text-zinc-100 mt-1">
              CineMega Control Plane
            </h1>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-red-500/15 text-zinc-400 hover:text-red-300 border border-zinc-800 text-xs font-medium transition-colors self-start sm:self-auto whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {(
            [
              { id: 'library', label: 'Library & Regex Trimmer', icon: FolderPlus },
              { id: 'workers', label: 'Distributed Workers & Cache', icon: Server },
              { id: 'analytics', label: 'Playback Analytics', icon: Activity },
              { id: 'profile', label: 'Admin Profile', icon: Settings },
              { id: 'guide', label: 'Deployment Guide', icon: BookOpen },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-amber-500 text-zinc-950'
                    : 'bg-zinc-900 text-zinc-300 hover:text-zinc-100 border border-zinc-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Status & Error Alerts */}
      {statusMessage && (
        <div
          role="status"
          className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-emerald-400 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-400 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ====================================================================
          TAB 1: LIBRARY MANAGEMENT & CUSTOM REGEX FILENAME TRIMMER
         ==================================================================== */}
      {activeTab === 'library' && (
        <div className="space-y-10">
          {/* Inspect Mega.nz Folder or File */}
          <section className="p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800/90 space-y-5">
            <div>
              <h2 className="font-display text-xl font-bold text-zinc-100">
                Add Mega.nz Folder or File Link
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Supports <code className="text-zinc-300">https://mega.nz/folder/&lt;id&gt;#&lt;key&gt;</code>,{' '}
                <code className="text-zinc-300">/file/&lt;id&gt;#&lt;key&gt;</code>, and legacy{' '}
                <code className="text-zinc-300">/#F!&lt;id&gt;!&lt;key&gt;</code> links.
              </p>
            </div>

            <form onSubmit={handleInspectMegaUrl} className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="url"
                  required
                  aria-label="Mega.nz folder or file URL"
                  placeholder="https://mega.nz/folder/ExampleID#DecryptionKey123456"
                  value={megaUrlInput}
                  onChange={(e) => setMegaUrlInput(e.target.value)}
                  className="flex-1 px-4 py-2.5 text-sm rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500 font-mono"
                />
                <button
                  type="submit"
                  disabled={inspectLoading}
                  className="px-6 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold text-sm transition-colors whitespace-nowrap shrink-0"
                >
                  {inspectLoading ? 'Inspecting Mega Link...' : 'Inspect Mega Link'}
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-400">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={forceRefreshInspect}
                    onChange={(e) => setForceRefreshInspect(e.target.checked)}
                    className="rounded accent-amber-500"
                  />
                  Force fresh Mega.nz inspection (bypass Supabase inspect_cache)
                </label>

                <button
                  type="button"
                  onClick={() =>
                    setMegaUrlInput(
                      'https://mega.nz/folder/CyberNoir26#Key998877665544332211'
                    )
                  }
                  className="text-amber-400 hover:underline font-mono text-[11px]"
                >
                  Insert Sample Test Mega URL
                </button>
              </div>
            </form>

            {/* Preview & Custom Regex Filename Trimmer after Inspection */}
            {inspectedData && (
              <div className="mt-6 pt-6 border-t border-zinc-800 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Collection Title
                    </label>
                    <input
                      type="text"
                      value={customFolderName}
                      onChange={(e) => setCustomFolderName(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Genre Category
                    </label>
                    <select
                      value={customGenre}
                      onChange={(e) => setCustomGenre(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100"
                    >
                      {STANDARD_GENRES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={customDescription}
                      onChange={(e) => setCustomDescription(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100"
                    />
                  </div>
                </div>

                {/* Custom Regex Filename Trimmer */}
                <div className="p-4 rounded-xl bg-zinc-950/90 border border-zinc-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wand2 className="w-4 h-4 text-amber-400" />
                      <h3 className="font-display text-sm font-bold text-zinc-100">
                        Custom Regex Filename Trimmer (Live Preview)
                      </h3>
                    </div>
                    <span className="text-[11px] font-mono text-zinc-400">
                      Safe inline regex validation before saving
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">
                        Regex Pattern
                      </label>
                      <input
                        type="text"
                        aria-label="Regex Pattern"
                        placeholder="e.g. \b2026\b or ^\[.*?\]\s*"
                        value={regexPattern}
                        onChange={(e) => setRegexPattern(e.target.value)}
                        className={`w-full px-3 py-2 text-xs font-mono rounded-lg bg-zinc-900 border ${
                          regexValidationAndPreview.isValid
                            ? 'border-zinc-800 text-zinc-100'
                            : 'border-red-500 text-red-300'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">
                        Replacement String
                      </label>
                      <input
                        type="text"
                        aria-label="Replacement String"
                        placeholder="Leave empty to strip match"
                        value={regexReplacement}
                        onChange={(e) => setRegexReplacement(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">
                        Target Filename Type
                      </label>
                      <select
                        aria-label="Target Filename Type"
                        value={regexTarget}
                        onChange={(e) =>
                          setRegexTarget(e.target.value as 'raw' | 'cleaned')
                        }
                        className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100"
                      >
                        <option value="cleaned">Cleaned Title</option>
                        <option value="raw">Raw Mega Filename</option>
                      </select>
                    </div>
                  </div>

                  {!regexValidationAndPreview.isValid && (
                    <p className="text-xs text-red-400 font-mono">
                      Regex Error: {regexValidationAndPreview.error}
                    </p>
                  )}

                  {/* Detected Videos Preview Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800 text-zinc-400">
                          <th className="py-2 pr-4 font-medium">Opaque ID</th>
                          <th className="py-2 pr-4 font-medium">Raw Mega Filename</th>
                          <th className="py-2 pr-4 font-medium">Final Preview Title</th>
                          <th className="py-2 text-right font-medium">Size</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60 font-mono">
                        {regexValidationAndPreview.previews.map((item) => (
                          <tr key={item.videoId}>
                            <td className="py-2.5 pr-4 text-amber-400">{item.videoId}</td>
                            <td className="py-2.5 pr-4 text-zinc-400 truncate max-w-[240px]">
                              {item.rawFileName}
                            </td>
                            <td className="py-2.5 pr-4 text-zinc-100 font-sans font-semibold">
                              {item.finalTitle}
                            </td>
                            <td className="py-2.5 text-right text-zinc-400 tabular-nums">
                              {formatBytes(item.sizeBytes)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setInspectedData(null)}
                    className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingFolder || !regexValidationAndPreview.isValid}
                    onClick={handleSaveInspectedFolder}
                    className="px-6 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold text-xs transition-colors"
                  >
                    {savingFolder
                      ? 'Saving to Library...'
                      : `Save Collection (${inspectedData.videos.length} Videos)`}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Existing Library Folders Management */}
          <section className="space-y-4">
            <h2 className="font-display text-xl font-bold text-zinc-100">
              Indexed Library Folders ({folders.length})
            </h2>

            <div className="space-y-4">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className="p-5 rounded-xl bg-zinc-900/70 border border-zinc-800/90 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 max-w-2xl">
                    <div className="flex items-center gap-2 text-xs font-mono text-amber-400 tabular-nums">
                      <span>{folder.genre}</span>
                      <span>·</span>
                      <span>
                        {folder.videos.length}{' '}
                        {folder.videos.length === 1 ? 'Video' : 'Videos'}
                      </span>
                      <span>·</span>
                      <span>{formatBytes(folder.totalSizeBytes)}</span>
                      <span>·</span>
                      <span className="text-zinc-500">{folder.id}</span>
                    </div>
                    <h3 className="font-display text-lg font-bold text-zinc-100">
                      {folder.name}
                    </h3>
                    <p className="text-xs text-zinc-400">{folder.description}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={generatingThumbId === folder.id}
                      onClick={() =>
                        void handleGenerateThumbnailNow(folder.id, folder.name)
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                      {generatingThumbId === folder.id
                        ? 'Generating...'
                        : 'Generate Thumbnails Now'}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleReinspectExistingFolder(folder)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Re-Inspect
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingFolder(folder);
                        setEditName(folder.name);
                        setEditGenre(folder.genre);
                        setEditDescription(folder.description);
                        setEditRegexPattern('');
                        setEditRegexReplacement('');
                      }}
                      className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
                    >
                      Edit / Trim
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleDeleteFolder(folder)}
                      aria-label={`Delete folder ${folder.name}`}
                      className="p-2 rounded-lg bg-zinc-900 hover:bg-red-500/15 text-zinc-400 hover:text-red-300 border border-zinc-800 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Edit Folder Modal Dialog */}
          {editingFolder && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Edit folder ${editingFolder.name}`}
              className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
            >
              <form
                onSubmit={handleSaveEditedFolder}
                className="w-full max-w-lg p-6 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4"
              >
                <h3 className="font-display text-lg font-bold text-zinc-100">
                  Edit Collection: {editingFolder.name}
                </h3>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Folder Name
                    </label>
                    <input
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Genre
                    </label>
                    <select
                      value={editGenre}
                      onChange={(e) => setEditGenre(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100"
                    >
                      {STANDARD_GENRES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Description
                    </label>
                    <textarea
                      rows={2}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100"
                    />
                  </div>

                  <div className="pt-2 border-t border-zinc-800 space-y-2">
                    <p className="text-xs font-semibold text-amber-400">
                      Optional Batch Regex Title Trim
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Regex pattern"
                        value={editRegexPattern}
                        onChange={(e) => setEditRegexPattern(e.target.value)}
                        className="px-3 py-1.5 text-xs font-mono rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100"
                      />
                      <input
                        type="text"
                        placeholder="Replacement"
                        value={editRegexReplacement}
                        onChange={(e) => setEditRegexReplacement(e.target.value)}
                        className="px-3 py-1.5 text-xs font-mono rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100"
                      />
                    </div>
                    <select
                      value={editRegexTarget}
                      onChange={(e) =>
                        setEditRegexTarget(e.target.value as 'raw' | 'cleaned')
                      }
                      className="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200"
                    >
                      <option value="cleaned">Apply to Cleaned Titles</option>
                      <option value="raw">Apply to Raw Filenames</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingFolder(null)}
                    className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-lg bg-amber-500 text-zinc-950 text-xs font-semibold"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB 2: DISTRIBUTED WORKERS & SHARED SUPABASE CACHE MANAGEMENT
         ==================================================================== */}
      {activeTab === 'workers' && (
        <div className="space-y-8">
          <section className="p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800/90 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-bold text-zinc-100">
                  Distributed API Worker Pool Status
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Health-aware round-robin pool across Cloudflare Workers, Vercel Functions, Netlify Functions, and Local Node.js
                </p>
              </div>

              <button
                type="button"
                disabled={refreshingWorkers}
                onClick={() => void handleRefreshWorkers()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshingWorkers ? 'animate-spin' : ''}`} />
                Probe Worker Health
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="py-2.5 pr-4 font-medium">Worker Node</th>
                    <th className="py-2.5 pr-4 font-medium">Platform Runtime</th>
                    <th className="py-2.5 pr-4 font-medium">Health Status</th>
                    <th className="py-2.5 pr-4 font-medium">Database Mode</th>
                    <th className="py-2.5 pr-4 text-right font-medium">Latency</th>
                    <th className="py-2.5 text-right font-medium">Requests</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70 font-mono tabular-nums">
                  {workers.map((w) => (
                    <tr key={w.id}>
                      <td className="py-3 pr-4 font-sans font-semibold text-zinc-100">
                        {w.label}
                        <div className="text-[11px] font-mono text-zinc-500">
                          {w.baseUrl || window.location.origin}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-zinc-300">
                        {w.lastReport?.platform || w.platformHint}
                      </td>
                      <td className="py-3 pr-4">
                        {w.healthy ? (
                          <span className="text-emerald-400 font-semibold">
                            HEALTHY
                          </span>
                        ) : (
                          <span className="text-red-400 font-semibold">
                            COOLDOWN ({w.lastError || 'Unreachable'})
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-zinc-300">
                        {w.lastReport?.database.mode || 'shared-supabase-pool'}
                      </td>
                      <td className="py-3 pr-4 text-right text-amber-400">
                        {w.lastLatencyMs !== null ? `${w.lastLatencyMs} ms` : '—'}
                      </td>
                      <td className="py-3 text-right text-zinc-300">
                        {w.requestsServed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Shared Cache Telemetry & Selective Cache Invalidation */}
          <section className="p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800/90 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-bold text-zinc-100">
                  Shared Supabase Cache Layers
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Invalidate specific cache tables across all distributed worker nodes
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  void handleClearCacheCategory([
                    'inspect_cache',
                    'stream_blocks',
                    'mega_storage_tickets',
                    'mega_node_keys',
                  ])
                }
                className="px-4 py-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 text-xs font-semibold transition-colors"
              >
                Purge All Caches
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col justify-between gap-3">
                <div>
                  <span className="text-xs font-mono text-zinc-400">inspect_cache</span>
                  <p className="font-display text-2xl font-bold text-zinc-100 mt-1 tabular-nums">
                    {stats?.cacheStats.inspectCount ?? 0} entries
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleClearCacheCategory(['inspect_cache'])}
                  className="py-1.5 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300"
                >
                  Clear inspect_cache
                </button>
              </div>

              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col justify-between gap-3">
                <div>
                  <span className="text-xs font-mono text-zinc-400">stream_blocks</span>
                  <p className="font-display text-2xl font-bold text-zinc-100 mt-1 tabular-nums">
                    {stats?.cacheStats.streamBlockCount ?? 0} blocks (
                    {formatBytes(stats?.cacheStats.streamBlockBytes ?? 0)})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleClearCacheCategory(['stream_blocks'])}
                  className="py-1.5 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300"
                >
                  Clear stream_blocks
                </button>
              </div>

              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col justify-between gap-3">
                <div>
                  <span className="text-xs font-mono text-zinc-400">mega_storage_tickets</span>
                  <p className="font-display text-2xl font-bold text-zinc-100 mt-1 tabular-nums">
                    {stats?.cacheStats.ticketCount ?? 0} tickets
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleClearCacheCategory(['mega_storage_tickets'])}
                  className="py-1.5 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300"
                >
                  Clear mega_storage_tickets
                </button>
              </div>

              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col justify-between gap-3">
                <div>
                  <span className="text-xs font-mono text-zinc-400">mega_node_keys</span>
                  <p className="font-display text-2xl font-bold text-zinc-100 mt-1 tabular-nums">
                    {stats?.cacheStats.nodeKeyCount ?? 0} node keys
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleClearCacheCategory(['mega_node_keys'])}
                  className="py-1.5 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300"
                >
                  Clear mega_node_keys
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ====================================================================
          TAB 3: PLAYBACK & CACHE ANALYTICS
         ==================================================================== */}
      {activeTab === 'analytics' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="p-5 rounded-xl bg-zinc-900/70 border border-zinc-800">
              <span className="text-xs text-zinc-400">Total Views</span>
              <p className="font-display text-2xl font-bold text-zinc-100 mt-1 tabular-nums">
                {stats?.totalViews ?? 0}
              </p>
            </div>
            <div className="p-5 rounded-xl bg-zinc-900/70 border border-zinc-800">
              <span className="text-xs text-zinc-400">Total Watch Time</span>
              <p className="font-display text-2xl font-bold text-amber-400 mt-1 tabular-nums">
                {formatWatchHours(stats?.totalWatchTimeSec ?? 0)}
              </p>
            </div>
            <div className="p-5 rounded-xl bg-zinc-900/70 border border-zinc-800">
              <span className="text-xs text-zinc-400">Shared Cache Hits</span>
              <p className="font-display text-2xl font-bold text-emerald-400 mt-1 tabular-nums">
                {stats?.cacheHits ?? 0}
              </p>
            </div>
            <div className="p-5 rounded-xl bg-zinc-900/70 border border-zinc-800">
              <span className="text-xs text-zinc-400">Mega Upstream Requests</span>
              <p className="font-display text-2xl font-bold text-zinc-100 mt-1 tabular-nums">
                {stats?.megaRequests ?? 0}
              </p>
            </div>
            <div className="p-5 rounded-xl bg-zinc-900/70 border border-zinc-800">
              <span className="text-xs text-zinc-400">Cached Bytes Served</span>
              <p className="font-display text-2xl font-bold text-zinc-100 mt-1 tabular-nums">
                {formatBytes(stats?.cachedBytesServed ?? 0)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Popular Videos */}
            <section className="p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800 space-y-4">
              <h2 className="font-display text-lg font-bold text-zinc-100">
                Top Played Videos
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400">
                      <th className="py-2 pr-3 font-medium">Video Title</th>
                      <th className="py-2 pr-3 font-medium">Genre</th>
                      <th className="py-2 pr-3 text-right font-medium">Views</th>
                      <th className="py-2 text-right font-medium">Watch Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/70 tabular-nums">
                    {(stats?.topVideos || []).map((v) => (
                      <tr key={v.videoId}>
                        <td className="py-2.5 pr-3 font-medium text-zinc-100">
                          {v.title}
                        </td>
                        <td className="py-2.5 pr-3 text-amber-400">{v.genre}</td>
                        <td className="py-2.5 pr-3 text-right font-mono text-zinc-200">
                          {v.views}
                        </td>
                        <td className="py-2.5 text-right font-mono text-zinc-400">
                          {formatWatchHours(v.watchTimeSec)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Recent Playback */}
            <section className="p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800 space-y-4">
              <h2 className="font-display text-lg font-bold text-zinc-100">
                Recently Played Activity
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400">
                      <th className="py-2 pr-3 font-medium">Video Title</th>
                      <th className="py-2 pr-3 font-medium">Folder</th>
                      <th className="py-2 text-right font-medium">Last Played</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/70 tabular-nums">
                    {(stats?.recentVideos || []).map((v) => (
                      <tr key={v.videoId}>
                        <td className="py-2.5 pr-3 font-medium text-zinc-100">
                          {v.title}
                        </td>
                        <td className="py-2.5 pr-3 text-zinc-400">{v.folderName}</td>
                        <td className="py-2.5 text-right font-mono text-zinc-400">
                          {new Date(v.lastPlayedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 4: ADMIN PROFILE
         ==================================================================== */}
      {activeTab === 'profile' && (
        <section className="max-w-lg p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800/90 space-y-5">
          <div>
            <h2 className="font-display text-xl font-bold text-zinc-100">
              Administrator Profile & Credentials
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Update your username, email address, and scrypt-hashed password in Supabase <code className="text-zinc-300">admin_config</code>.
            </p>
          </div>

          <form onSubmit={handleProfileUpdate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Administrator Username
              </label>
              <input
                type="text"
                required
                value={profileUsername}
                onChange={(e) => setProfileUsername(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Administrator Email
              </label>
              <input
                type="email"
                required
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                New Password (leave blank to keep current password)
              </label>
              <input
                type="password"
                minLength={6}
                placeholder="Min 6 characters"
                value={profileNewPassword}
                onChange={(e) => setProfileNewPassword(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100"
              />
            </div>

            <button
              type="submit"
              className="px-6 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs transition-colors"
            >
              Update Admin Profile
            </button>
          </form>
        </section>
      )}

      {/* ====================================================================
          TAB 5: COMPLETE 14-STEP PRODUCTION DEPLOYMENT GUIDE
         ==================================================================== */}
      {activeTab === 'guide' && (
        <section className="p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800/90 space-y-6">
          <div className="flex items-center gap-2.5 border-b border-zinc-800 pb-4">
            <Database className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="font-display text-xl font-bold text-zinc-100">
                CineMega Multi-Layer Production Deployment Guide
              </h2>
              <p className="text-xs text-zinc-400">
                Complete reference covering Supabase PostgreSQL, Cloudflare Workers, Vercel, Netlify, and Worker Pool Failover
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-zinc-300 leading-relaxed">
            <div className="space-y-4">
              <div>
                <h3 className="font-display font-bold text-amber-400 text-sm">
                  01. Create Supabase Project & Execute Schema
                </h3>
                <p className="mt-1 text-zinc-400">
                  Create a new project at supabase.com. Open the SQL Editor, paste the contents of{' '}
                  <code className="text-zinc-200">supabase/schema.sql</code>, and click Run. This creates all 11 tables with Row Level Security (RLS) enabled.
                </p>
              </div>

              <div>
                <h3 className="font-display font-bold text-amber-400 text-sm">
                  02. Configure Backend Environment Variables
                </h3>
                <p className="mt-1 text-zinc-400">
                  Set <code className="text-zinc-200">SUPABASE_URL</code>,{' '}
                  <code className="text-zinc-200">SUPABASE_SERVICE_ROLE_KEY</code>, and{' '}
                  <code className="text-zinc-200">SESSION_SECRET</code> on every backend worker platform. Never prefix service-role keys with <code className="text-zinc-200">VITE_</code>.
                </p>
              </div>

              <div>
                <h3 className="font-display font-bold text-amber-400 text-sm">
                  03. Deploy to Cloudflare Workers (`src/worker.ts`)
                </h3>
                <p className="mt-1 text-zinc-400">
                  Run <code className="text-zinc-200">npx wrangler secret put SUPABASE_URL</code> and{' '}
                  <code className="text-zinc-200">npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY</code>, then deploy using{' '}
                  <code className="text-zinc-200">npx wrangler deploy</code> with <code className="text-zinc-200">wrangler.toml</code>.
                </p>
              </div>

              <div>
                <h3 className="font-display font-bold text-amber-400 text-sm">
                  04. Deploy to Vercel (`api/[...route].ts`) & Netlify (`netlify/functions/api.ts`)
                </h3>
                <p className="mt-1 text-zinc-400">
                  Import the repository into Vercel or Netlify. Both <code className="text-zinc-200">vercel.json</code> and{' '}
                  <code className="text-zinc-200">netlify.toml</code> route <code className="text-zinc-200">/api/*</code> through the shared <code className="text-zinc-200">src/api/coreHandler.ts</code>.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-display font-bold text-amber-400 text-sm">
                  05. Configure Frontend Distributed Worker Pool
                </h3>
                <p className="mt-1 text-zinc-400">
                  Set <code className="text-zinc-200">VITE_WORKER_URLS</code> to a comma-separated list of your Cloudflare, Vercel, and Netlify worker URLs. <code className="text-zinc-200">src/utils/apiBase.ts</code> distributes requests and fails over automatically.
                </p>
              </div>

              <div>
                <h3 className="font-display font-bold text-amber-400 text-sm">
                  06. Test Worker Health & Automatic Failover
                </h3>
                <p className="mt-1 text-zinc-400">
                  Query <code className="text-zinc-200">GET /api/health</code> on each worker or click &ldquo;Probe Worker Health&rdquo; in the Distributed Workers tab. Unhealthy nodes enter a 30-second cooldown and auto-recover.
                </p>
              </div>

              <div>
                <h3 className="font-display font-bold text-amber-400 text-sm">
                  07. Test Mega Inspection & Byte-Range Video Seeking
                </h3>
                <p className="mt-1 text-zinc-400">
                  Inspect any public Mega folder in the Library tab, preview regex filename trimming, and open <code className="text-zinc-200">/watch/vid-...</code> to verify <code className="text-zinc-200">206 Partial Content</code> byte-range seeking.
                </p>
              </div>

              <div>
                <h3 className="font-display font-bold text-amber-400 text-sm">
                  08. Full Documentation
                </h3>
                <p className="mt-1 text-zinc-400">
                  See <code className="text-zinc-200">DEPLOYMENT_GUIDE.md</code> in the project root for full CLI commands, curl tests, and troubleshooting steps.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
};
