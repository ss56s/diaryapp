'use client';

import React, { useState } from 'react';
import NavBar from './NavBar';
import LogView from './LogView';
import HistoryView from './HistoryView';
import StatsView from './StatsView';
import SettingsView from './SettingsView';
import ImageLightbox from './ImageLightbox';
import { AppTab, CategoryType } from '../types';

interface MainAppProps {
  username: string;
}

const MainApp: React.FC<MainAppProps> = ({ username }) => {
  const [currentTab, setCurrentTab] = useState<AppTab>(AppTab.LOG);
  const [currentCategory, setCurrentCategory] = useState<CategoryType>('life');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const renderContent = () => {
    switch (currentTab) {
      case AppTab.LOG:
        return (
          <LogView 
            currentCategory={currentCategory} 
            onCategoryChange={setCurrentCategory} 
            onImageClick={setLightboxImage}
          />
        );
      case AppTab.CALENDAR:
        return (
          <HistoryView 
            onImageClick={setLightboxImage}
          />
        );
      case AppTab.STATS:
        return (
          <StatsView 
            onImageClick={setLightboxImage} 
          />
        );
      case AppTab.SETTINGS:
        return (
          <SettingsView username={username} />
        );
      default:
        return (
          <LogView 
            currentCategory={currentCategory} 
            onCategoryChange={setCurrentCategory} 
            onImageClick={setLightboxImage}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-background text-textMain font-sans selection:bg-primary/20">
      <main className="mx-auto min-h-screen relative shadow-2xl bg-background max-w-lg md:border-x border-slate-200">
        {renderContent()}
        <NavBar currentTab={currentTab} onTabChange={setCurrentTab} />
        <ImageLightbox 
          imageUrl={lightboxImage} 
          onClose={() => setLightboxImage(null)} 
        />
      </main>
    </div>
  );
};

export default MainApp;