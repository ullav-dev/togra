"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter, Link } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslations } from "next-intl";
import { isAdmin } from "@/lib/auth-api";
import TograIcon from "@/components/TograIcon";
import MyDetailsModal from "@/components/MyDetailsModal";
import LocaleSwitcher from "@/components/LocaleSwitcher";

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
  const { user, token, isLoading, logout } = useAuth();
  const userIsAdmin = isAdmin(token);
  const t = useTranslations("nav");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
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
