// ============================================================================
// CineMega — 3-Zone Top Bar Navigation & Cinema Layout Wrapper
// ============================================================================

import { Menu, X } from 'lucide-react';
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

export const Navbar: React.FC = () => {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { label: 'Home', path: '/' },
    { label: 'Library', path: '/library' },
    { label: 'Genres', path: '/genres' },
    { label: 'My List', path: '/mylist' },
    { label: 'Search', path: '/search' },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#0a0a0b]/90 backdrop-blur-md border-b border-zinc-800/80">
      <div className="max-w-[1360px] mx-auto flex items-center justify-between gap-8 px-6 py-4">
        {/* Zone 1: Single text element wordmark */}
        <Link
          to="/"
          className="font-display text-xl font-bold tracking-tight text-zinc-100 hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
        >
          CineMega
        </Link>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium"
        >
          {navLinks.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                  active
                    ? 'text-amber-400 border-amber-500'
                    : 'text-zinc-400 border-transparent hover:text-zinc-100 hover:border-zinc-700'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <Link
            to="/admin"
            className="px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
          >
            Admin Console
          </Link>

          <button
            type="button"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="md:hidden p-2 text-zinc-300 hover:text-zinc-100 rounded-lg border border-zinc-800"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Drawer */}
      {mobileMenuOpen && (
        <nav
          aria-label="Mobile Navigation"
          className="md:hidden px-6 pb-4 pt-2 border-t border-zinc-800/80 bg-[#0a0a0b] flex flex-col gap-2"
        >
          {navLinks.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileMenuOpen(false)}
              className={`py-2 text-sm font-medium ${
                isActive(item.path) ? 'text-amber-400' : 'text-zinc-300 hover:text-zinc-100'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
};

export const AppFooter: React.FC = () => {
  return (
    <footer className="mt-20 border-t border-zinc-900 bg-[#0a0a0b] py-10 px-6">
      <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-zinc-500">
        <div>
          <span className="font-display font-semibold text-zinc-300">CineMega</span>
          <span aria-hidden="true" className="mx-2">·</span>
          <span>Personal Encrypted Mega.nz Cinema Streaming Architecture</span>
        </div>
        <div className="flex items-center gap-6">
          <Link to="/library" className="hover:text-zinc-300 transition-colors">
            Catalog
          </Link>
          <Link to="/genres" className="hover:text-zinc-300 transition-colors">
            Genres
          </Link>
          <Link to="/mylist" className="hover:text-zinc-300 transition-colors">
            My List
          </Link>
          <Link to="/admin" className="hover:text-zinc-300 transition-colors">
            Admin Console
          </Link>
        </div>
      </div>
    </footer>
  );
};
