import React from 'react';
import type { ThumbnailsProps } from './types';

const ThumbnailsSidebar: React.FC<ThumbnailsProps> = ({ 
  thumbnails, 
  currentPage, 
  totalPages, 
  onPageClick 
}) => {
  return (
    <div className="pdf-thumbnails-sidebar">
      <div className="thumbnails-header">Pages ({totalPages || '...'})</div>
      <div className="thumbnails-list" id="thumbnails-list">
        {thumbnails.size > 0 ? (
          Array.from(thumbnails.entries()).map(([pageNum, dataUrl]) => (
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
};

export default ThumbnailsSidebar;
