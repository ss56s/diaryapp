
import React, { useState } from 'react';
import NavBar from './components/NavBar';
import LogView from './components/LogView';
import HistoryView from './components/HistoryView';
import StatsView from './components/StatsView';
import ImageLightbox from './components/ImageLightbox';
import { AppTab, CategoryType } from './types';

const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<AppTab>(AppTab.LOG);
  const [currentCategory, setCurrentCategory] = useState<CategoryType>('life');
  
  // Global Lightbox State
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
      {/* Full screen main container */}
      <main className="mx-auto min-h-screen relative shadow-2xl bg-background max-w-lg md:border-x border-slate-200">
        {renderContent()}
      
        {/* Bottom Navigation */}
        <NavBar currentTab={currentTab} onTabChange={setCurrentTab} />

        {/* Global Lightbox Overlay */}
        <ImageLightbox 
          imageUrl={lightboxImage} 
          onClose={() => setLightboxImage(null)} 
        />
      </main>
    </div>
  );
};

export default App;
