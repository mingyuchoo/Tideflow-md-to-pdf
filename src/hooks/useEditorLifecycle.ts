/**
 * Hook to handle editor lifecycle: generation tracking for remount after close-all.
 * Manages editor remounting when transitioning from zero files to opening a new file.
 */

import { useEffect } from 'react';
import type { EditorStateRefs } from './useEditorState';

interface UseEditorLifecycleParams {
  editorStateRefs: EditorStateRefs;
  openFiles: string[];
}

export function useEditorLifecycle(params: UseEditorLifecycleParams) {
  const { editorStateRefs, openFiles } = params;
  const { generationRef, hadNoFilesRef } = editorStateRefs;

  // Force remount of the inner editor UI after a full close-all followed by opening a new file.
  useEffect(() => {
    if (openFiles.length === 0) {
      hadNoFilesRef.current = true;
    } else if (hadNoFilesRef.current && openFiles.length === 1) {
      // First file after close-all
      generationRef.current += 1;
      hadNoFilesRef.current = false;
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Editor] Remounting editor after close-all. Generation =', generationRef.current);
      }
    }
  }, [openFiles, generationRef, hadNoFilesRef]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Editor] Mounted generation', generationRef.current);
    }
  }, [generationRef]);

  return {
    generation: generationRef.current,
  };
}
