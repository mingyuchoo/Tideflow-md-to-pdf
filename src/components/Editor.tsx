import React, { useState } from 'react';
import { useAppStore } from '../store';
import './Editor.css';
import ImagePropsModal, { type ImageProps } from './ImagePropsModal';
import ImagePlusModal from './ImagePlusModal';
import EditorToolbar from './EditorToolbar';
import { useImageHandlers } from '../hooks/useImageHandlers';
import { importImage, importImageFromPath, generateImageMarkdown } from '../api';
import { showSuccess } from '../utils/errorHandler';
import { cmd } from './commands';
import { useEditorState } from '../hooks/useEditorState';
import { useEditorSync } from '../hooks/useEditorSync';
import { useContentManagement } from '../hooks/useContentManagement';
import { useFileOperations } from '../hooks/useFileOperations';
import { useCodeMirrorSetup } from '../hooks/useCodeMirrorSetup';
import { useAnchorManagement } from '../hooks/useAnchorManagement';
import { useEditorLifecycle } from '../hooks/useEditorLifecycle';

const Editor: React.FC = () => {
  // Store state
  const {
    editor: { currentFile, content, modified, openFiles },
    setContent,
    setModified,
    setCompileStatus,
    preferences,
    sourceMap,
    setSourceMap,
    activeAnchorId,
    setActiveAnchorId,
    syncMode,
    setSyncMode,
    isTyping,
    setIsTyping
  } = useAppStore();
  const setEditorScrollPosition = useAppStore((s) => s.setEditorScrollPosition);
  const getEditorScrollPosition = useAppStore((s) => s.getEditorScrollPosition);

  // Local state
  const [isSaving, setIsSaving] = useState(false);
  const [isActivelyTyping, setIsActivelyTyping] = useState(false);
  const [selectedFont, setSelectedFont] = useState<string>("New Computer Modern");
  const [calloutType, setCalloutType] = useState<'box' | 'info' | 'tip' | 'warn'>('box');
  const [editorReady, setEditorReady] = useState(false);

  // Use editor state hook - consolidates all refs
  const editorStateRefs = useEditorState({
    activeAnchorId,
    syncMode,
    isTyping,
    openFiles,
  });

  // Use editor sync hook - scroll synchronization
  const { computeAnchorFromViewport, setupScrollListener } = useEditorSync({
    editorStateRefs,
    currentFile,
    sourceMap,
    setSyncMode,
    setActiveAnchorId,
    setEditorScrollPosition,
  });

  // Use content management hook - auto-render
  const { handleAutoRender } = useContentManagement({
    editorStateRefs,
    sourceMap,
    setCompileStatus,
    setSourceMap,
    setSyncMode,
  });

  // Use file operations hook - save/render/file switching
  const { handleSave: handleSaveBase, handleRender } = useFileOperations({
    editorStateRefs,
    currentFile,
    content,
    modified,
    sourceMap,
    editorReady,
    setModified,
    setCompileStatus,
    setSourceMap,
    setEditorScrollPosition,
    getEditorScrollPosition,
    handleAutoRender,
    computeAnchorFromViewport,
  });

  // Wrap handleSave to pass setIsSaving
  const handleSave = () => handleSaveBase(setIsSaving);

  // Use CodeMirror setup hook - editor initialization
  useCodeMirrorSetup({
    editorStateRefs,
    content,
    setContent,
    setModified,
    setIsActivelyTyping,
    setIsTyping,
    handleSave,
    handleRender,
    handleAutoRender,
    renderDebounceMs: preferences.render_debounce_ms,
    setupScrollListener,
    setEditorReady,
  });

  // Use anchor management hook - anchor sync effects
  useAnchorManagement({
    editorStateRefs,
    sourceMap,
    activeAnchorId,
    setActiveAnchorId,
  });

  // Use editor lifecycle hook - generation tracking
  const { generation } = useEditorLifecycle({
    editorStateRefs,
    openFiles,
  });

  // Image handlers
  const {
    imageModalOpen,
    setImageModalOpen,
    imageModalResolveRef,
    imageInitial,
    imagePlusOpen,
    setImagePlusOpen,
    imagePlusPath,
    setImagePlusPath,
    handleImageInsert,
    handlePaste,
    handleDrop,
  } = useImageHandlers({
    preferences,
    importImage,
    importImageFromPath,
    generateImageMarkdown,
    showSuccess,
    insertSnippet: (snippet: string) => {
      if (editorStateRefs.editorViewRef.current) {
        const state = editorStateRefs.editorViewRef.current.state;
        const transaction = state.update({
          changes: { from: state.selection.main.head, insert: snippet }
        });
        editorStateRefs.editorViewRef.current.dispatch(transaction);
      }
    },
  });

  // Handle font changes
  const handleFontChange = async (font: string) => {
    if (!editorStateRefs.editorViewRef.current) {
      return;
    }
    setSelectedFont(font);
    cmd.fontLocal(editorStateRefs.editorViewRef.current, font);
  };

  return (
    <div 
      key={generation}
      className="editor-container" 
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {currentFile ? (
        <>
          <EditorToolbar
            currentFile={currentFile}
            modified={modified}
            isSaving={isSaving}
            isActivelyTyping={isActivelyTyping}
            preferences={preferences}
            selectedFont={selectedFont}
            calloutType={calloutType}
            editorView={editorStateRefs.editorViewRef.current}
            onSave={handleSave}
            onRender={handleRender}
            onFontChange={handleFontChange}
            onImageInsert={handleImageInsert}
            onImagePlusOpen={() => setImagePlusOpen(true)}
            onCalloutTypeChange={(type) => setCalloutType(type)}
            onImageWidthChange={(width) => {
              if (editorStateRefs.editorViewRef.current) {
                cmd.imageWidth(editorStateRefs.editorViewRef.current, width);
              }
            }}
          />
          
          <div className="editor-content" ref={editorStateRefs.editorRef} />
          
          {/* Image properties modal */}
          <ImagePropsModal
            open={imageModalOpen}
            initial={imageInitial}
            onCancel={() => {
              setImageModalOpen(false);
              if (imageModalResolveRef) imageModalResolveRef(null);
            }}
            onSave={(props) => {
              setImageModalOpen(false);
              if (imageModalResolveRef) imageModalResolveRef(props);
            }}
          />
          
          {/* Image+ modal */}
          <ImagePlusModal
            open={imagePlusOpen}
            initialPath={imagePlusPath}
            defaultWidth={preferences.default_image_width}
            defaultAlignment={preferences.default_image_alignment as ImageProps['alignment']}
            onCancel={() => setImagePlusOpen(false)}
            onChoose={(choice) => {
              setImagePlusOpen(false);
              if (!editorStateRefs.editorViewRef.current) return;
              if (choice.kind === 'figure') {
                const { path, width, alignment, caption, alt } = choice.data;
                cmd.figureWithCaption(editorStateRefs.editorViewRef.current, path, width, alignment, caption, alt);
              } else {
                const { path, width, alignment, columnText, alt, underText, position } = choice.data;
                cmd.imageWithTextColumns(editorStateRefs.editorViewRef.current, path, width, alignment, columnText, alt, underText, position);
              }
              setImagePlusPath(choice.data.path);
            }}
          />
        </>
      ) : (
        <div className="no-file-message">
          <p>No file open. Please select or create a file from the file tree.</p>
        </div>
      )}
    </div>
  );
};

export default Editor;
