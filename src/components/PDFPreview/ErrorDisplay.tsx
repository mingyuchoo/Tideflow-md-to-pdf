import React from 'react';
import type { ErrorDisplayProps } from './types';

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ type, message, details }) => {
  return (
    <div className="error-message">
      <h4>{type === 'compile' ? 'Rendering Failed' : 'PDF Load Failed'}</h4>
      {message && <p>{message}</p>}
      {details && <pre className="error-details">{details}</pre>}
    </div>
  );
};

export default ErrorDisplay;
