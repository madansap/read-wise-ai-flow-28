import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';

// Interface for selection position
interface SelectionPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Interface for the context values
interface SelectionContextType {
  selectedText: string;
  setSelectedText: (text: string) => void;
  selectionPosition: SelectionPosition | null;
  setSelectionPosition: (position: SelectionPosition | null) => void;
  pageNumber: number;
  setPageNumber: (page: number) => void;
  isSelectionToolbarVisible: boolean;
  setIsSelectionToolbarVisible: (visible: boolean) => void;
  handleTextSelection: (event: MouseEvent) => void;
  clearSelection: () => void;
  isSelecting: boolean;
}

// Create the context with undefined initial value
const SelectionContext = createContext<SelectionContextType | undefined>(undefined);

// Selection context provider component
export const SelectionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectionPosition, setSelectionPosition] = useState<SelectionPosition | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(0);
  const [isSelectionToolbarVisible, setIsSelectionToolbarVisible] = useState<boolean>(false);
  const [isSelecting, setIsSelecting] = useState<boolean>(false);
  
  // Handle text selection - simplified
  const handleTextSelection = useCallback((event: MouseEvent) => {
    // Set selecting mode
    setIsSelecting(true);
    
    // Get the selection
    const selection = window.getSelection();
    if (!selection) {
      setIsSelecting(false);
      return;
    }
    
    // Get the selected text
    const text = selection.toString().trim();
    
    // If no text is selected, clear the selection
    if (text.length === 0) {
      clearSelection();
      setIsSelecting(false);
      return;
    }
    
    // Set the selected text
    setSelectedText(text);
    
    try {
      // Get the selection range
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      // Check if the selection is within a PDF page
      const pdfPage = (event.target as HTMLElement).closest('.react-pdf__Page');
      if (!pdfPage) {
        clearSelection();
        setIsSelecting(false);
        return;
      }
      
      // Get the page number from the data attribute
      const pageNumber = parseInt(pdfPage.getAttribute('data-page-number') || '0');
      setPageNumber(pageNumber);
      
      // Calculate position relative to the viewport
      const viewportRect = pdfPage.getBoundingClientRect();
      const relativeX = rect.left + rect.width / 2 - viewportRect.left;
      const relativeY = rect.top - viewportRect.top;
      
      // Set the selection position
      setSelectionPosition({
        x: relativeX,
        y: relativeY,
        width: rect.width,
        height: rect.height
      });
      
      // Show the toolbar
      setIsSelectionToolbarVisible(true);
      setIsSelecting(false);
    } catch (error) {
      console.error('Error getting selection:', error);
      clearSelection();
      setIsSelecting(false);
    }
  }, []);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedText('');
    setSelectionPosition(null);
    setIsSelectionToolbarVisible(false);
  }, []);

  // Context value
  const value: SelectionContextType = {
    selectedText,
    setSelectedText,
    selectionPosition,
    setSelectionPosition,
    pageNumber,
    setPageNumber,
    isSelectionToolbarVisible,
    setIsSelectionToolbarVisible,
    handleTextSelection,
    clearSelection,
    isSelecting
  };

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
};

// Hook for using the selection context
export const useSelection = (): SelectionContextType => {
  const context = useContext(SelectionContext);
  
  if (context === undefined) {
    throw new Error('useSelection must be used within a SelectionProvider');
  }
  
  return context;
}; 