"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter, Link } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslations } from "next-intl";
import { isAdmin, hasObairAccess, hasComadAccess } from "@/lib/auth-api";
import { useAppUrls } from "@/contexts/AppUrlsContext";
import { useCurrentProject } from "@/contexts/CurrentProjectContext";
import TograIcon from "@/components/TograIcon";
import MyDetailsModal from "@/components/MyDetailsModal";
import AboutModal from "@/components/AboutModal";
import AiSettingsModal from "@/components/research/AiSettingsModal";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import TeamSelector from "@/components/TeamSelector";

function NavAvatar({ url, initials }: { url?: string | null; initials: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        className="w-7 h-7 rounded-full object-cover"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 text-xs font-semibold flex items-center justify-center select-none">
      {initials}
    </span>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, token, roles, isLoading, logout } = useAuth();
  const userIsAdmin = isAdmin(token);
  const { obairUrl, damBrowserUrl } = useAppUrls();
  const { project: currentProject } = useCurrentProject();

  // Determine the target href for the active project button.
  // If we're on a sprint board (/projects/[id]/jobs/[jobId]), link back to that board.
  // Otherwise link to the project Management tab.
  const sprintBoardMatch = pathname.match(/^\/projects\/([^/]+)\/jobs\/([^/]+)/);
  const activeProjectHref = currentProject
    ? sprintBoardMatch
      ? `/projects/${sprintBoardMatch[1]}/jobs/${sprintBoardMatch[2]}`
      : `/projects/${currentProject.id}?tab=management`
    : null;
  const showObair = !!obairUrl && hasObairAccess(token);
  const showComad = !!damBrowserUrl && hasComadAccess(token);

  const obairWindowRef = useRef<Window | null>(null);
  const comadWindowRef = useRef<Window | null>(null);

  function ssoUrl(appBase: string): string {
    if (!token || !user) return appBase;
    const t = encodeURIComponent(JSON.stringify({ token, user, roles }));
    return `${appBase}/en/auth/sso?t=${t}`;
  }

  function openApp(windowRef: React.MutableRefObject<Window | null>, url: string) {
    if (windowRef.current && !windowRef.current.closed) {
      windowRef.current.focus();
    } else {
      // No noopener — we need the window reference to focus it later.
      // These are trusted first-party apps so reverse-tabnapping is not a concern.
      windowRef.current = window.open(url, "_blank") ?? null;
    }
  }
  const t = useTranslations("nav");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  function handleLogout() {
    setDropdownOpen(false);
    logout();
    router.push("/");
  }

  function handleMyDetails() {
    setDropdownOpen(false);
    setDetailsOpen(true);
  }

  function handleAbout() {
    setDropdownOpen(false);
    setAboutOpen(true);
  }

  function handleAiSettings() {
    setDropdownOpen(false);
    setAiSettingsOpen(true);
  }

  const navLink = (path: string) =>
    `text-sm font-medium transition-colors ${
      pathname.startsWith(path)
        ? "text-violet-700"
        : "text-slate-600 hover:text-slate-900"
    }`;

  return (
    <header className="bg-white border-b border-slate-200 shadow-sm shrink-0">
      <div className="max-w-full px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2.5">
            <TograIcon className="w-7 h-7" />
            <span className="font-bold text-lg text-slate-800 tracking-tight">Togra</span>
          </Link>

          <nav className="flex items-center gap-4">
            {!isLoading && user ? (
              <>
                <Link href="/projects" className={navLink("/projects")}>
                  {t("projects")}
                </Link>
                <Link href="/decisions" className={navLink("/decisions")}>
                  {t("myDecisions")}
                </Link>

                {activeProjectHref && currentProject && (
                  <Link
                    href={activeProjectHref}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-violet-600 text-white hover:bg-violet-700 transition-colors max-w-[180px] truncate"
                    title={currentProject.name}
                  >
                    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                    </svg>
                    <span className="truncate">{currentProject.name}</span>
                  </Link>
                )}

                <TeamSelector />

                {(showObair || showComad) && (
                  <div className="flex items-center gap-1 pl-3 border-l border-slate-200">
                    {showObair && (
                      <button
                        type="button"
                        onClick={() => openApp(obairWindowRef, ssoUrl(obairUrl))}
                        title="Open Obair (AWE)"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 px-2 py-1.5 rounded-lg transition-colors"
                      >
                        <ObairIcon className="w-4 h-4 shrink-0" />
                        Obair
                      </button>
                    )}
                    {showComad && (
                      <button
                        type="button"
                        onClick={() => openApp(comadWindowRef, ssoUrl(damBrowserUrl))}
                        title="Open Comad (DAM)"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 px-2 py-1.5 rounded-lg transition-colors"
                      >
                        <ComadIcon className="w-4 h-4 shrink-0" />
                        Comad
                      </button>
                    )}
                  </div>
                )}

                <LocaleSwitcher />

                <div className="relative pl-3 border-l border-slate-200" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setDropdownOpen((v) => !v)}
                    className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                    aria-haspopup="true"
                    aria-expanded={dropdownOpen}
                  >
                    <NavAvatar
                      url={user.avatar_url}
                      initials={
                        (`${user.first_name?.charAt(0) ?? ""}${user.last_name?.charAt(0) ?? ""}`).toUpperCase() ||
                        user.username.charAt(0).toUpperCase()
                      }
                    />
                    <span className="hidden sm:block">
                      {`${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.username}
                    </span>
                    <svg viewBox="0 0 16 16" fill="currentColor" className={`w-3.5 h-3.5 text-slate-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}>
                      <path d="M4 6l4 4 4-4H4z" />
                    </svg>
                  </button>

                  {dropdownOpen && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-50">
                      <button
                        type="button"
                        onClick={handleMyDetails}
                        className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        {t("myDetails")}
                      </button>
                      {userIsAdmin && (
                        <>
                          <div className="my-1 border-t border-slate-100" />
                          <Link
                            href="/admin/access"
                            onClick={() => setDropdownOpen(false)}
                            className="flex items-center gap-2 px-4 py-2 text-sm text-violet-700 hover:bg-violet-50 transition-colors"
                          >
                            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                              <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm4.879-2.773 4.264 2.559a.25.25 0 0 1 0 .428l-4.264 2.559A.25.25 0 0 1 6 10.559V5.442a.25.25 0 0 1 .379-.215Z"/>
                            </svg>
                            Access management
                          </Link>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={handleAiSettings}
                        className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2"
                      >
                        <svg className="w-3.5 h-3.5 text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                        </svg>
                        AI Settings
                      </button>
                      <button
                        type="button"
                        onClick={handleAbout}
                        className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        {t("about")}
                      </button>
                      <div className="my-1 border-t border-slate-100" />
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        {t("signOut")}
                      </button>
                    </div>
                  )}
                </div>
                {detailsOpen && <MyDetailsModal onClose={() => setDetailsOpen(false)} />}
                {aboutOpen && <AboutModal user={user} onClose={() => setAboutOpen(false)} />}
                {aiSettingsOpen && <AiSettingsModal onClose={() => setAiSettingsOpen(false)} />}
              </>
            ) : !isLoading ? (
              <>
                <LocaleSwitcher />
                <Link href="/login" className="text-sm font-medium text-violet-700 hover:text-violet-800 transition-colors">
                  {t("signIn")}
                </Link>
              </>
            ) : null}
          </nav>
        </div>
      </div>
    </header>
  );
}

// ── App icons (match each app's own icon.svg, scaled for nav) ─────────────────

function ObairIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="32" cy="32" r="32" fill="#c2410c"/>
      <rect x="4" y="24" width="16" height="10" rx="2.5" fill="white" opacity="0.95"/>
      <circle cx="12" cy="29" r="3" fill="#4ade80" opacity="0.85"/>
      <line x1="21" y1="29" x2="27" y2="29" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <path d="M25 26.5 L28.5 29 L25 31.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <rect x="28" y="24" width="16" height="10" rx="2.5" fill="#fef3c7"/>
      <circle cx="36" cy="29" r="3" fill="#f97316" opacity="0.85"/>
      <line x1="45" y1="29" x2="51" y2="29" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <path d="M49 26.5 L52.5 29 L49 31.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <rect x="52" y="24" width="10" height="10" rx="2.5" fill="white" opacity="0.95"/>
      <path d="M54 29 L56.5 31.5 L60 26.5" stroke="#c2410c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

function ComadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="32" cy="32" r="32" fill="#1d4ed8"/>
      <rect x="10" y="22" width="44" height="30" rx="4" fill="#93c5fd"/>
      <path d="M10 22 L10 18 Q10 15 13 15 L26 15 Q29 15 30 18 L31 22 Z" fill="#bfdbfe"/>
      <rect x="16" y="28" width="32" height="18" rx="2" fill="#1e40af"/>
      <path d="M20 42 L28 32 L34 38 L38 34 L44 42 Z" fill="#60a5fa"/>
      <circle cx="38" cy="32" r="3" fill="#fbbf24"/>
    </svg>
  );
}
