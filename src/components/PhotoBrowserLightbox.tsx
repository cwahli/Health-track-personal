import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  ExternalLink, 
  X, 
  Images,
  Maximize2,
  Check,
  Trash2
} from 'lucide-react';
import { MealPhotoItem } from '../utils/driveImage';

export interface PhotoBrowserLightboxProps {
  photos: MealPhotoItem[];
  initialIndex?: number;
  onClose: () => void;
  mealId?: string;
  onSetTopPhoto?: (selectedPhoto: MealPhotoItem, newOrderedPhotos: MealPhotoItem[]) => Promise<boolean | void> | boolean | void;
  onDeletePhoto?: (deletedPhoto: MealPhotoItem, newOrderedPhotos: MealPhotoItem[]) => Promise<boolean | void> | boolean | void;
}

export const PhotoBrowserLightbox: React.FC<PhotoBrowserLightboxProps> = ({
  photos,
  initialIndex = 0,
  onClose,
  mealId,
  onSetTopPhoto,
  onDeletePhoto,
}) => {
  const [orderedPhotos, setOrderedPhotos] = useState<MealPhotoItem[]>(photos);
  const [currentIndex, setCurrentIndex] = useState(() => {
    if (initialIndex >= 0 && initialIndex < photos.length) return initialIndex;
    return 0;
  });
  const [isUpdatingTop, setIsUpdatingTop] = useState(false);
  const [showTopSuccessBadge, setShowTopSuccessBadge] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setOrderedPhotos(photos);
    if (initialIndex >= 0 && initialIndex < photos.length) {
      setCurrentIndex(initialIndex);
    }
  }, [photos, initialIndex]);

  // Touch tracking for mobile swipe
  const touchStartXRef = useRef<number | null>(null);
  const touchEndXRef = useRef<number | null>(null);

  const totalPhotos = orderedPhotos.length;
  const currentPhoto = orderedPhotos[currentIndex] || orderedPhotos[0];
  const isTop = currentIndex === 0;

  const handlePrev = useCallback(() => {
    if (totalPhotos <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + totalPhotos) % totalPhotos);
  }, [totalPhotos]);

  const handleNext = useCallback(() => {
    if (totalPhotos <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % totalPhotos);
  }, [totalPhotos]);

  const handleToggleTop = async () => {
    if (isTop || isUpdatingTop || !onSetTopPhoto) return;
    setIsUpdatingTop(true);
    try {
      const selected = orderedPhotos[currentIndex];
      const newOrder = [
        selected,
        ...orderedPhotos.filter((_, idx) => idx !== currentIndex),
      ];
      await onSetTopPhoto(selected, newOrder);
      setOrderedPhotos(newOrder);
      setCurrentIndex(0);
      setShowTopSuccessBadge(true);
      setTimeout(() => setShowTopSuccessBadge(false), 3000);
    } catch (e) {
      console.warn('Failed to update top photo:', e);
    } finally {
      setIsUpdatingTop(false);
    }
  };

  const handleDelete = async () => {
    if (isDeleting || !onDeletePhoto) return;
    if (!window.confirm("Are you sure you want to remove this photo?")) return;
    setIsDeleting(true);
    try {
      const selected = orderedPhotos[currentIndex];
      const newOrder = orderedPhotos.filter((_, idx) => idx !== currentIndex);
      
      await onDeletePhoto(selected, newOrder);
      
      if (newOrder.length === 0) {
        onClose();
      } else {
        setOrderedPhotos(newOrder);
        setCurrentIndex((prev) => (prev >= newOrder.length ? newOrder.length - 1 : prev));
      }
    } catch (e) {
      console.warn('Failed to delete photo:', e);
    } finally {
      setIsDeleting(false);
    }
  };

  // Keyboard navigation: ArrowLeft, ArrowRight, Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrev, handleNext, onClose]);

  // Swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndXRef.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartXRef.current || !touchEndXRef.current) return;
    const distance = touchStartXRef.current - touchEndXRef.current;
    const minSwipeDistance = 50;

    if (distance > minSwipeDistance) {
      // Swiped left -> next
      handleNext();
    } else if (distance < -minSwipeDistance) {
      // Swiped right -> prev
      handlePrev();
    }

    touchStartXRef.current = null;
    touchEndXRef.current = null;
  };

  if (!currentPhoto) return null;

  return (
    <div
      id="photo-browser-lightbox-backdrop"
      className="fixed inset-0 z-50 flex flex-col bg-[#0B111E] text-slate-100 animate-fade-in w-full h-full overflow-hidden select-none"
    >
      <div
        id="photo-browser-lightbox-container"
        className="w-full h-full flex flex-col overflow-hidden"
      >
        {/* Header Bar */}
        <div id="photo-browser-header" className="px-4 sm:px-8 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm sm:text-base font-bold text-white font-heading truncate">
                {currentPhoto.title || 'Meal Photo'}
              </h4>
              {isTop && (
                <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono font-bold flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>Card Top Photo</span>
                </span>
              )}
            </div>
            {currentPhoto.fileName && (
              <p className="text-xs text-emerald-400 font-mono truncate mt-0.5">
                Drive File: {currentPhoto.fileName}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Toggle Set as Top Image for Preview */}
            {totalPhotos > 1 && onSetTopPhoto && (
              <button
                id="lightbox-toggle-top-photo"
                type="button"
                onClick={handleToggleTop}
                disabled={isTop || isUpdatingTop}
                className={`flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                  isTop
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 cursor-default shadow-sm'
                    : 'bg-slate-800 hover:bg-slate-700/80 border-slate-700 text-slate-300 hover:text-white cursor-pointer active:scale-95'
                }`}
                title={isTop ? "This photo is currently set as the top card preview" : "Set this photo as the top preview on cards and database"}
              >
                {/* Switch Track & Knob */}
                <div 
                  className={`relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    isTop ? 'bg-emerald-500' : 'bg-slate-600'
                  }`}
                >
                  <span 
                    className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isTop ? 'translate-x-3' : 'translate-x-0'
                    }`} 
                  />
                </div>

                <span className="whitespace-nowrap font-medium">
                  {isUpdatingTop ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></span>
                      <span>Saving...</span>
                    </span>
                  ) : isTop ? (
                    <span className="text-emerald-300 font-bold">
                      Top Photo
                    </span>
                  ) : (
                    <span>Set as Top</span>
                  )}
                </span>
              </button>
            )}

            {/* Multi-Photo Counter and Quick Arrows */}
            {totalPhotos > 1 && (
              <div 
                id="photo-counter-controls"
                className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5 text-xs font-mono font-medium text-slate-300"
              >
                <button
                  id="lightbox-btn-quick-prev"
                  onClick={handlePrev}
                  className="p-1 hover:bg-slate-700 text-slate-300 hover:text-white rounded cursor-pointer transition"
                  title="Previous photo (← key)"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 font-semibold">
                  {currentIndex + 1} / {totalPhotos}
                </span>
                <button
                  id="lightbox-btn-quick-next"
                  onClick={handleNext}
                  className="p-1 hover:bg-slate-700 text-slate-300 hover:text-white rounded cursor-pointer transition"
                  title="Next photo (→ key)"
                  aria-label="Next photo"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
            
            {/* Delete Button */}
            {onDeletePhoto && (
              <button
                id="lightbox-btn-delete"
                onClick={handleDelete}
                disabled={isDeleting}
                className="p-2 ml-1 text-red-400 hover:text-red-300 hover:bg-red-950/30 border border-transparent hover:border-red-900/50 rounded-lg transition-colors focus:outline-none"
                title="Delete this photo"
              >
                {isDeleting ? (
                   <span className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin inline-block"></span>
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            )}

            {/* Google Drive Link */}
            {currentPhoto.driveUrl && (
              <a
                id="lightbox-btn-open-drive"
                href={currentPhoto.driveUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-emerald-400 border border-slate-700 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Open in Drive</span>
                <span className="sm:hidden">Drive</span>
              </a>
            )}

            {/* Close Button */}
            <button
              id="lightbox-btn-close"
              onClick={onClose}
              className="text-slate-400 hover:text-white text-sm p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer transition"
              title="Close (Esc)"
              aria-label="Close photo preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Image Stage */}
        <div
          id="photo-browser-stage"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="relative overflow-hidden bg-slate-950 flex items-center justify-center flex-1 min-h-0 group"
        >
          <img
            key={currentPhoto.url}
            src={currentPhoto.url}
            alt={currentPhoto.title || `Photo ${currentIndex + 1}`}
            referrerPolicy="no-referrer"
            className="max-h-full max-w-full object-contain rounded-lg transition-opacity duration-200 animate-fade-in shadow-2xl p-2"
          />

          {/* Floating Left Arrow (Previous) */}
          {totalPhotos > 1 && (
            <button
              id="lightbox-floating-prev"
              onClick={handlePrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700 shadow-xl backdrop-blur cursor-pointer hover:scale-110 active:scale-95 transition"
              title="Previous photo (← key)"
              aria-label="Previous photo"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {/* Floating Right Arrow (Next) */}
          {totalPhotos > 1 && (
            <button
              id="lightbox-floating-next"
              onClick={handleNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700 shadow-xl backdrop-blur cursor-pointer hover:scale-110 active:scale-95 transition"
              title="Next photo (→ key)"
              aria-label="Next photo"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          {/* Floating badge for multiple photos indicator */}
          {totalPhotos > 1 && (
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur border border-slate-800 text-[10px] font-mono text-slate-300 flex items-center gap-1.5 pointer-events-none">
              <Images className="w-3 h-3 text-emerald-400" />
              <span>{currentIndex + 1} of {totalPhotos}</span>
            </div>
          )}

          {/* Toast on successfully setting top photo */}
          {showTopSuccessBadge && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-emerald-950/90 border border-emerald-500/50 text-emerald-300 text-xs font-semibold shadow-xl flex items-center gap-1.5 animate-fade-in">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Set as Top Photo! Updated for card preview and database.</span>
            </div>
          )}
        </div>

        {/* Thumbnail Carousel Bar (Only if multiple photos) */}
        {totalPhotos > 1 && (
          <div id="photo-browser-thumbnails" className="px-4 sm:px-8 py-3 bg-slate-900/90 border-t border-slate-800 shrink-0 space-y-1.5">
            <div className="flex items-center justify-center gap-2 overflow-x-auto pb-1 max-w-full py-0.5">
              {orderedPhotos.map((p, idx) => {
                const isActive = idx === currentIndex;
                const isItemTop = idx === 0;
                return (
                  <button
                    key={`${p.url}-${idx}`}
                    id={`lightbox-thumb-${idx}`}
                    onClick={() => setCurrentIndex(idx)}
                    className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border-2 transition shrink-0 cursor-pointer ${
                      isActive
                        ? 'border-emerald-500 ring-2 ring-emerald-500/30 scale-105'
                        : 'border-slate-800 opacity-60 hover:opacity-100 hover:border-slate-600'
                    }`}
                    title={isItemTop ? `Photo ${idx + 1} (Top Photo)` : `View photo ${idx + 1}`}
                  >
                    <img
                      src={p.url}
                      alt={`Thumbnail ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    {isItemTop ? (
                      <span className="absolute top-0.5 left-0.5 px-1 py-0.2 rounded bg-emerald-600 text-[8px] font-mono font-bold text-white shadow-sm flex items-center gap-0.5">
                        TOP
                      </span>
                    ) : null}
                    <span
                      className={`absolute bottom-0.5 right-0.5 px-1 py-0.2 rounded text-[9px] font-mono font-bold ${
                        isActive
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-950/80 text-slate-300'
                      }`}
                    >
                      #{idx + 1}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-center text-slate-500 font-mono">
              Use ← → arrow keys or swipe to browse photos • Esc to close
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
