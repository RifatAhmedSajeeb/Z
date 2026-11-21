/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppFooter, Navbar } from './components/Navbar';
import { CineMegaProvider } from './context/CineMegaContext';
import { AdminPage } from './pages/AdminPage';
import {
  GenreDetailPage,
  GenresDirectoryPage,
  MyListPage,
  SearchPage,
} from './pages/CatalogPages';
import { HomePage } from './pages/HomePage';
import { FolderDetailPage, LibraryPage } from './pages/LibraryPage';
import { WatchPage } from './pages/WatchPage';

export default function App() {
  return (
    <CineMegaProvider>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col bg-[#0a0a0b] text-zinc-100">
          <Navbar />
          <div className="flex-1">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/genres" element={<GenresDirectoryPage />} />
              <Route path="/genre/:genreName" element={<GenreDetailPage />} />
              <Route path="/watch/:videoId" element={<WatchPage />} />
              <Route path="/folder/:folderId" element={<FolderDetailPage />} />
              <Route path="/mylist" element={<MyListPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Routes>
          </div>
          <AppFooter />
        </div>
      </BrowserRouter>
    </CineMegaProvider>
  );
}
