
import React from 'react';

interface ImageLightboxProps {
  imageUrl: string | null;
  onClose: () => void;
}

const ImageLightbox: React.FC<ImageLightboxProps> = ({ imageUrl, onClose }) => {
  if (!imageUrl) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center animate-fade-in touch-none"
      onClick={onClose}
    >
      <button 
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center backdrop-blur-md z-10 hover:bg-white/20 transition-colors"
      >
        <i className="fa-solid fa-xmark text-xl"></i>
      </button>
      
      <img 
        src={imageUrl} 
        alt="Preview" 
        className="max-w-full max-h-full object-contain p-2 transition-transform duration-300 scale-100"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking the image itself
      />
    </div>
  );
};

export default ImageLightbox;
