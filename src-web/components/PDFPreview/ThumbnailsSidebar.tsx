import React from 'react';
import type { ThumbnailsProps } from './types';
import { useDragToScroll } from '../../hooks/useDragToScroll';

const ThumbnailsSidebar: React.FC<ThumbnailsProps> = React.memo(({ 
  thumbnails, 
  currentPage, 
  totalPages, 
  onPageClick 
}) => {
  const thumbnailsListRef = useDragToScroll<HTMLDivElement>();
  
  // Memoize thumbnail entries to avoid recreating array on every render
  const thumbnailEntries = React.useMemo(() => {
    return Array.from(thumbnails.entries());
  }, [thumbnails]);
  
  return (
    <div className="pdf-thumbnails-sidebar">
      <div className="thumbnails-header">Pages ({totalPages || '...'})</div>
      <div className="thumbnails-list" id="thumbnails-list" ref={thumbnailsListRef}>
        {thumbnails.size > 0 ? (
          thumbnailEntries.map(([pageNum, dataUrl]) => (
            <div
              key={pageNum}
              className={`thumbnail-item ${currentPage === pageNum ? 'active' : ''}`}
              onClick={() => onPageClick(pageNum)}
              title={`Go to page ${pageNum}`}
            >
              <img src={dataUrl} alt={`Page ${pageNum}`} />
              <div className="thumbnail-page-number">{pageNum}</div>
            </div>
          ))
        ) : (
          <div className="thumbnails-loading">
            <p>Generating thumbnails...</p>
          </div>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if these specific props change
  return (
    prevProps.currentPage === nextProps.currentPage &&
    prevProps.totalPages === nextProps.totalPages &&
    prevProps.thumbnails.size === nextProps.thumbnails.size &&
    prevProps.onPageClick === nextProps.onPageClick
  );
});

export default ThumbnailsSidebar;
