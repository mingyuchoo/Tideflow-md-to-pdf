import React, { useState } from 'react';
import { useAppStore } from '../store';
import './Editor.css';
import ImagePropsModal, { type ImageProps } from './ImagePropsModal';
import ImagePlusModal from './ImagePlusModal';
import EditorToolbar from './EditorToolbar';
import SearchWidget, { type SearchOptions } from './SearchWidget';
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
  const addToast = useAppStore((state) => state.addToast);
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
  const setPreviewVisible = useAppStore((s) => s.setPreviewVisible);

  // Local state
  const [isSaving, setIsSaving] = useState(false);
  const [isActivelyTyping, setIsActivelyTyping] = useState(false);
  const [selectedFont, setSelectedFont] = useState<string>("New Computer Modern");
  const [calloutType, setCalloutType] = useState<'box' | 'info' | 'tip' | 'warn'>('box');
  const [editorReady, setEditorReady] = useState(false);
  const [searchWidgetOpen, setSearchWidgetOpen] = useState(false);

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

  // Wrap handleSave to pass setIsSaving and addToast
  const handleSave = () => handleSaveBase(setIsSaving, addToast);
  
  // Wrap handleRender to pass setPreviewVisible
  const handleRenderWithPreview = () => handleRender(setPreviewVisible);

  // Use CodeMirror setup hook - editor initialization
  useCodeMirrorSetup({
    editorStateRefs,
    content,
    setContent,
    setModified,
    setIsActivelyTyping,
    setIsTyping,
    handleSave,
    handleRender: handleRenderWithPreview,
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

  // Ctrl+F handler is managed by global keyboard listener

  const handleSearch = (query: string, options: SearchOptions) => {
    if (!query || !editorStateRefs.editorViewRef.current) return;
    
    const view = editorStateRefs.editorViewRef.current;
    const content = view.state.doc.toString();
    
    // Build search regex
    let searchPattern = query;
    if (options.wholeWord) {
      searchPattern = `\\b${query}\\b`;
    }
    const flags = options.caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(searchPattern, flags);
    
    // Find first match
    const match = regex.exec(content);
    
    if (match) {
      const from = match.index;
      const to = from + match[0].length;
      
      // Select the match (without focusing editor)
      view.dispatch({
        selection: { anchor: from, head: to },
        scrollIntoView: true,
      });
      
      // Don't call view.focus() to keep focus in search input
    }
  };

  const handleReplace = (replaceText: string) => {
    if (!editorStateRefs.editorViewRef.current) return;
    
    const view = editorStateRefs.editorViewRef.current;
    const selection = view.state.selection.main;
    
    // Replace selected text
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: replaceText },
      scrollIntoView: true,
    });
    
    addToast({ type: 'success', message: 'Replaced' });
  };

  const handleReplaceAll = (searchQuery: string, replaceText: string, options: SearchOptions) => {
    if (!searchQuery || !editorStateRefs.editorViewRef.current) return;
    
    const view = editorStateRefs.editorViewRef.current;
    const content = view.state.doc.toString();
    
    // Build search regex
    let searchPattern = searchQuery;
    if (options.wholeWord) {
      searchPattern = `\\b${searchQuery}\\b`;
    }
    const flags = options.caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(searchPattern, flags);
    
    // Find all matches and build changes array
    const changes: { from: number; to: number; insert: string }[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      changes.push({
        from: match.index,
        to: match.index + match[0].length,
        insert: replaceText,
      });
    }
    
    if (changes.length > 0) {
      view.dispatch({
        changes,
        scrollIntoView: true,
      });
      
      addToast({ type: 'success', message: `Replaced ${changes.length} occurrence(s)` });
    } else {
      addToast({ type: 'warning', message: 'No matches found' });
    }
  };

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
            isActivelyTyping={isActivelyTyping}
            preferences={preferences}
            selectedFont={selectedFont}
            calloutType={calloutType}
            editorView={editorStateRefs.editorViewRef.current}
            onRender={handleRenderWithPreview}
            onFontChange={handleFontChange}
            onImageInsert={handleImageInsert}
            onImagePlusOpen={() => setImagePlusOpen(true)}
            onCalloutTypeChange={(type) => setCalloutType(type)}
            onImageWidthChange={(width) => {
              if (editorStateRefs.editorViewRef.current) {
                cmd.imageWidth(editorStateRefs.editorViewRef.current, width);
              }
            }}
            onSearchToggle={() => setSearchWidgetOpen(!searchWidgetOpen)}
            searchOpen={searchWidgetOpen}
          />
          
          {/* Search widget */}
          {searchWidgetOpen && (
            <SearchWidget
              isOpen={searchWidgetOpen}
              onClose={() => setSearchWidgetOpen(false)}
              onSearch={handleSearch}
              onReplace={handleReplace}
              onReplaceAll={handleReplaceAll}
            />
          )}
          
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
